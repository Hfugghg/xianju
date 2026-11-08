import {
  cacheState,
  loadCachedModel,
  saveCachedModel,
  removeCachedModel,
  validModel,
  MODEL_CACHE_CHANNEL,
} from '../../../shared/modelCache';
import { mahjongModel } from '../modelSpec';
import { isDifficulty, selectAction } from './policy';
import { isBackendPreference, type BackendPreference, type Difficulty } from './types';
import agent from './python/agent.py?raw';
import env from './python/env.py?raw';
import envFixed from './python/env_fixed.py?raw';
import feature from './python/feature.py?raw';
import featureV1 from './python/feature_v1.py?raw';
import shanten from './python/shanten_py.py?raw';
import shantenTable from './python/shanten_table.py?raw';
import browserGame from './python/browser_game.py?raw';
import scorerShim from './python/scorer_shim.py?raw';

// Runtime is vendored locally; no third-party requests occur during a game.
let runtime: any;
let dispatch: any;
const progress = (message: string) => postMessage({ progress: message });
function decodeResource(resource: { encoding?: string; data?: string }): Uint8Array<ArrayBuffer> {
  if (resource.encoding !== 'base64' || typeof resource.data !== 'string') {
    throw new Error('本地运行资源格式错误');
  }
  const decoded = atob(resource.data);
  const bytes = new Uint8Array(decoded.length);
  for (let index = 0; index < decoded.length; index++) bytes[index] = decoded.charCodeAt(index);
  return bytes;
}

function installWheelTransport(base: string) {
  const runtimeBase = new URL('runtime/pyodide/', base);
  const nativeFetch = globalThis.fetch.bind(globalThis);
  // Only this dedicated worker's local wheel requests use JSON transport;
  // Pyodide still performs its own wheel parsing, integrity checks and linking.
  globalThis.fetch = async (input: RequestInfo | URL, init?: RequestInit) => {
    const requestUrl = new URL(input instanceof Request ? input.url : String(input), base);
    if (
      requestUrl.origin !== runtimeBase.origin ||
      !requestUrl.href.startsWith(runtimeBase.href) ||
      !requestUrl.pathname.endsWith('.whl')
    ) {
      return nativeFetch(input, init);
    }
    const jsonUrl = new URL(requestUrl);
    jsonUrl.pathname += '.json';
    const integrity = init?.integrity ?? (input instanceof Request ? input.integrity : '');
    // SRI describes the original wheel, not its JSON representation. Verify
    // decoded bytes below rather than asking fetch to hash the JSON envelope.
    const adaptedInput =
      input instanceof Request ? new Request(new Request(jsonUrl, input), { integrity: '' }) : jsonUrl;
    const response = await nativeFetch(adaptedInput, { ...init, integrity: '' });
    if (!response.ok) throw new Error(`Python 依赖资源加载失败 (${response.status})`);
    const bytes = decodeResource(await response.json());
    if (integrity) {
      const expected = integrity.split(/\s+/).find((value) => value.startsWith('sha256-'));
      if (!expected) throw new Error('不支持的 Python 依赖完整性算法');
      const digest = new Uint8Array(await crypto.subtle.digest('SHA-256', bytes));
      const actual = btoa(Array.from(digest, (byte) => String.fromCharCode(byte)).join(''));
      if (actual !== expected.slice(7)) throw new Error('Python 依赖完整性校验失败');
    }
    return new Response(bytes, {
      status: 200,
      headers: { 'Content-Type': 'application/octet-stream' },
    });
  };
}
let queue = Promise.resolve();
onmessage = ({ data }) => {
  if (data.cacheChanged) {
    void saveModelIfEnabled();
    return;
  }
  queue = queue.then(() => handle(data));
};
async function handle(data: any) {
  try {
    if (data.init) {
      const base = data.base;
      requestedBackend = isBackendPreference(data.backend) ? data.backend : 'auto';
      installWheelTransport(base);
      progress('正在载入国标麻将规则引擎…');
      const scorer = await import(/* @vite-ignore */ `${base}runtime/mcr/scorer.mjs`);
      const scorerModule = typeof scorer.default === 'function' ? await scorer.default() : scorer;
      const score = scorerModule.mcrScore || (globalThis as any).mcrScore;
      if (typeof score !== 'function') throw new Error('国标算番模块未提供 mcrScore');
      (globalThis as any).browserMcrScore = (json: string) => JSON.stringify(score(JSON.parse(json)));
      const pyodide = await import(/* @vite-ignore */ `${base}runtime/pyodide/pyodide.mjs`);
      // Request a JSON transport instead of a downloadable ZIP URL. The actual
      // standard-library archive exists only in memory while Pyodide starts.
      const stdlibResponse = await fetch(`${base}runtime/pyodide/python_stdlib.json`);
      if (!stdlibResponse.ok) throw new Error(`Python 标准库加载失败 (${stdlibResponse.status})`);
      const bytes = decodeResource(await stdlibResponse.json());
      const stdlibUrl = URL.createObjectURL(new Blob([bytes], { type: 'application/octet-stream' }));
      try {
        runtime = await pyodide.loadPyodide({ indexURL: `${base}runtime/pyodide/`, stdLibURL: stdlibUrl });
      } finally {
        URL.revokeObjectURL(stdlibUrl);
      }
      progress('正在载入牌局与合法动作判断…');
      await runtime.loadPackage('numpy');
      // loadPackage logs individual package failures without always rejecting.
      // Check the actual Python import before advertising an initialized engine.
      await runtime.runPythonAsync('import numpy as np\nassert np.__version__');
      runtime.FS.mkdirTree('/mahjong');
      for (const [name, source] of Object.entries({
        agent,
        env,
        env_fixed: envFixed,
        feature,
        feature_v1: featureV1,
        shanten_py: shanten,
        shanten_table: shantenTable,
        browser_game: browserGame,
      })) {
        runtime.FS.writeFile(`/mahjong/${name}.py`, source);
      }
      runtime.FS.writeFile('/mahjong/scorer_shim.py', scorerShim);
      await runtime.runPythonAsync(
        "import sys\nsys.path.insert(0, '/mahjong')\nimport scorer_shim\nfrom browser_game import browser_dispatch",
      );
      dispatch = runtime.globals.get('browser_dispatch');
      await initializeModel(base);
      postMessage({ ready: true });
      return;
    }
    const command = data.command;
    let view;
    if (command.type === 'start' || command.type === 'restore') {
      view = JSON.parse(dispatch(JSON.stringify(command)));
      inferenceCalls = 0;
      lastInferenceMs = 0;
      difficulty = 'expert';
    } else if (command.type === 'advance' || command.type === 'auto') {
      const requestedDifficulty = command.difficulty ?? 'expert';
      if (!isDifficulty(requestedDifficulty)) throw new Error('未知 AI 难度');
      difficulty = requestedDifficulty;
      const pending = JSON.parse(dispatch(JSON.stringify({ type: 'pending' })));
      const actions: Record<string, number> = {};
      for (const item of pending) actions[String(item.seat)] = await infer(item);
      view = JSON.parse(dispatch(JSON.stringify({ type: 'commit', actions })));
    } else if (command.type === 'action') {
      if (!Number.isInteger(command.action)) throw new Error('无效的玩家动作');
      const pending = JSON.parse(dispatch(JSON.stringify({ type: 'pending' })));
      if (!pending.some((item: { seat: number }) => item.seat === 0)) throw new Error('当前没有可执行的玩家动作');
      const actions: Record<string, number> = {};
      for (const item of pending) {
        actions[String(item.seat)] = item.seat === 0 ? command.action : await infer(item);
      }
      view = JSON.parse(dispatch(JSON.stringify({ type: 'commit', actions })));
    } else if (command.type === 'setBackend') {
      if (!isBackendPreference(command.backend)) throw new Error('未知推理后端');
      if (!modelPayload) throw new Error('AI 模型尚未就绪');
      const created = await createSession(modelPayload, command.backend);
      const previous = session;
      session = created.session;
      backend = created.backend;
      requestedBackend = command.backend;
      try {
        await previous?.release?.();
      } catch {
        /* old session is discarded regardless */
      }
      postMessage({ id: data.id, backend, threads: wasmThreads });
      return;
    } else throw new Error('未知对局命令');
    currentSeed = view.replay.seed;
    currentStep = view.replay.actions.length;
    view.ai = { model: 'kdens3', backend, threads: wasmThreads, inferenceCalls, lastInferenceMs, difficulty };
    postMessage({ id: data.id, view });
  } catch (error) {
    postMessage({ id: data.id, error: String(error) });
  }
}
let ort: any;
let session: any;
let backend: 'webgpu' | 'wasm' = 'wasm';
let requestedBackend: BackendPreference = 'auto';
let wasmThreads = 1;
let difficulty: Difficulty = 'expert';
let currentSeed = 0;
let currentStep = 0;
let inferenceCalls = 0;
let lastInferenceMs = 0;
const modelBytes = mahjongModel.size;
// One reference to the original model input, not an additional binary copy.
// Allows an opt-in after initialization without fetching the model again.
let modelPayload: Uint8Array<ArrayBuffer> | null = null;
const cacheFailure = () => postMessage({ cacheError: true });
async function saveModelIfEnabled() {
  if (!modelPayload) return;
  try {
    const state = await cacheState(mahjongModel);
    if (state.enabled && !state.saved && (await saveCachedModel(mahjongModel, modelPayload)))
      postMessage({ cacheSaved: true });
  } catch {
    cacheFailure();
  }
}
if (typeof BroadcastChannel !== 'undefined') {
  const channel = new BroadcastChannel(MODEL_CACHE_CHANNEL);
  channel.onmessage = (event) => {
    if (event.data?.gameId === mahjongModel.gameId && event.data.type === 'preference') void saveModelIfEnabled();
  };
}
async function createSession(bytes: Uint8Array<ArrayBuffer>, preference: BackendPreference) {
  // Build the replacement session before releasing the old one so a failed
  // switch keeps the current backend usable.
  if (preference !== 'wasm' && (navigator as any).gpu) {
    try {
      const adapter = await (navigator as any).gpu.requestAdapter();
      if (adapter)
        return {
          session: await ort.InferenceSession.create(bytes, {
            executionProviders: ['webgpu'],
            preferredOutputLocation: 'gpu-buffer',
          }),
          backend: 'webgpu' as const,
        };
    } catch (error) {
      progress(`WebGPU 不可用，使用 WASM：${String(error)}`);
    }
  }
  return {
    session: await ort.InferenceSession.create(bytes, { executionProviders: ['wasm'] }),
    backend: 'wasm' as const,
  };
}
async function initializeModel(base: string) {
  // Multi-threaded WASM needs SharedArrayBuffer, which is only exposed when the
  // page is cross-origin isolated (public/sw.js or vite.config.ts headers).
  // Match ONNX Runtime's own default: min(4, ceil(cores / 2)).
  const isolated = (globalThis as { crossOriginIsolated?: boolean }).crossOriginIsolated === true;
  const cores = navigator.hardwareConcurrency || 1;
  wasmThreads = isolated ? Math.min(4, Math.max(1, Math.ceil(cores / 2))) : 1;
  const emit = (stage: string, loadedBytes: number) =>
    postMessage({ runtime: { stage, loadedBytes, totalBytes: modelBytes, backend, threads: wasmThreads } });
  let cached: Uint8Array<ArrayBuffer> | null = null;
  try {
    cached = await loadCachedModel(mahjongModel);
    if (cached && !(await validModel(mahjongModel, cached))) {
      await removeCachedModel(mahjongModel);
      cached = null;
    }
  } catch {
    cacheFailure();
    cached = null;
  }
  let bytes: Uint8Array<ArrayBuffer>;
  if (cached) {
    bytes = cached;
    progress('正在读取已保存的模型…');
  } else {
    progress('正在下载 kdens3 模型…');
    emit('download', 0);
    const response = await fetch(`${base}models/mahjong/kdens3/model.onnx`);
    if (!response.ok || !response.body) throw new Error(`模型下载失败 (${response.status})`);
    const reader = response.body.getReader();
    bytes = new Uint8Array(modelBytes);
    let received = 0;
    for (;;) {
      const { done, value } = await reader.read();
      if (done) break;
      if (received + value.length > modelBytes) {
        await reader.cancel();
        throw new Error('模型大小异常');
      }
      bytes.set(value, received);
      received += value.length;
      emit('download', received);
    }
    if (received !== modelBytes) throw new Error('模型下载不完整');
    if (!(await validModel(mahjongModel, bytes))) throw new Error('模型完整性校验失败');
  }
  modelPayload = bytes;
  await saveModelIfEnabled();
  const loaded = bytes.length;
  emit('initializing', loaded);
  progress('正在初始化 kdens3…');
  ort = await import(/* @vite-ignore */ `${base}runtime/ort/ort.webgpu.min.mjs`);
  ort.env.wasm.numThreads = wasmThreads;
  ort.env.wasm.wasmPaths = `${base}runtime/ort/`;
  const created = await createSession(bytes, requestedBackend);
  session = created.session;
  backend = created.backend;
  emit('ready', loaded);
}
async function infer(item: any): Promise<number> {
  if (item.obs.length !== 38 * 4 * 9 || item.mask.length !== 235 || !item.mask.some(Boolean))
    throw new Error('模型观测维度异常');
  const observation = new ort.Tensor('float32', Float32Array.from(item.obs), [1, 38, 4, 9]);
  const mask = new ort.Tensor(
    'bool',
    Uint8Array.from(item.mask, (value) => (value ? 1 : 0)),
    [1, 235],
  );
  let outputs: any;
  const started = performance.now();
  try {
    outputs = await session.run({ [session.inputNames[0]]: observation, [session.inputNames[1]]: mask });
    if (backend === 'webgpu' && outputs[session.outputNames[0]].location !== 'gpu-buffer')
      throw new Error('WebGPU 未返回 GPU 输出');
    const scores = await outputs[session.outputNames[0]].getData();
    if (scores.length !== 235 || Array.from(scores as Float32Array).some((value) => !Number.isFinite(value)))
      throw new Error('模型输出异常');
    const best = selectAction(scores, item.mask, difficulty, currentSeed, currentStep, item.seat);
    inferenceCalls++;
    lastInferenceMs = performance.now() - started;
    return best;
  } finally {
    observation.dispose();
    mask.dispose();
    if (outputs) Object.values(outputs).forEach((tensor: any) => tensor.dispose());
  }
}
