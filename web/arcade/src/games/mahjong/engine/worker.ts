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
    if (requestUrl.origin !== runtimeBase.origin || !requestUrl.href.startsWith(runtimeBase.href) || !requestUrl.pathname.endsWith('.whl')) {
      return nativeFetch(input, init);
    }
    const jsonUrl = new URL(requestUrl);
    jsonUrl.pathname += '.json';
    const integrity = init?.integrity ?? (input instanceof Request ? input.integrity : '');
    // SRI describes the original wheel, not its JSON representation. Verify
    // decoded bytes below rather than asking fetch to hash the JSON envelope.
    const adaptedInput = input instanceof Request ? new Request(new Request(jsonUrl, input), { integrity: '' }) : jsonUrl;
    const response = await nativeFetch(adaptedInput, { ...init, integrity: '' });
    if (!response.ok) throw new Error(`Python 依赖资源加载失败 (${response.status})`);
    const bytes = decodeResource(await response.json());
    if (integrity) {
      const expected = integrity.split(/\s+/).find(value => value.startsWith('sha256-'));
      if (!expected) throw new Error('不支持的 Python 依赖完整性算法');
      const digest = new Uint8Array(await crypto.subtle.digest('SHA-256', bytes));
      const actual = btoa(Array.from(digest, byte => String.fromCharCode(byte)).join(''));
      if (actual !== expected.slice(7)) throw new Error('Python 依赖完整性校验失败');
    }
    return new Response(bytes, {
      status: 200,
      headers: { 'Content-Type': 'application/octet-stream' },
    });
  };
}
let queue = Promise.resolve();
onmessage = ({ data }) => { queue = queue.then(() => handle(data)); };
async function handle(data: any) {
  try {
    if (data.init) {
      const base = data.base;
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
      for (const [name, source] of Object.entries({ agent, env, env_fixed: envFixed, feature, feature_v1: featureV1, shanten_py: shanten, shanten_table: shantenTable, browser_game: browserGame })) {
        runtime.FS.writeFile(`/mahjong/${name}.py`, source);
      }
      runtime.FS.writeFile('/mahjong/scorer_shim.py', scorerShim);
      await runtime.runPythonAsync("import sys\nsys.path.insert(0, '/mahjong')\nimport scorer_shim\nfrom browser_game import browser_dispatch");
      dispatch = runtime.globals.get('browser_dispatch');
      await initializeModel(base);
      postMessage({ ready: true });
      return;
    }
    const command = data.command;
    let view;
    if (command.type === 'start' || command.type === 'restore') {
      view = JSON.parse(dispatch(JSON.stringify(command)));
      inferenceCalls = 0; lastInferenceMs = 0;
    } else if (command.type === 'advance' || command.type === 'auto') {
      const pending = JSON.parse(dispatch(JSON.stringify({type:'pending'})));
      const actions: Record<string, number> = {};
      for (const item of pending) actions[String(item.seat)] = await infer(item);
      view = JSON.parse(dispatch(JSON.stringify({type:'commit', actions})));
    } else throw new Error('未知对局命令');
    view.ai = {model:'kdens3',backend,inferenceCalls,lastInferenceMs};
    postMessage({ id: data.id, view });
  } catch (error) {
    postMessage({ id: data.id, error: String(error) });
  }
}
let ort: any;
let session: any;
let backend: 'webgpu'|'wasm' = 'wasm';
let inferenceCalls = 0;
let lastInferenceMs = 0;
const modelBytes = 87210216;
async function initializeModel(base:string) {
  const emit = (stage:string,loadedBytes:number) => postMessage({runtime:{stage,loadedBytes,totalBytes:modelBytes,backend}});
  progress('正在下载 kdens3 模型…'); emit('download',0);
  const response = await fetch(`${base}models/mahjong/kdens3/model.onnx`);
  if (!response.ok || !response.body) throw new Error(`模型下载失败 (${response.status})`);
  const reader = response.body.getReader();
  const bytes = new Uint8Array(modelBytes); let loaded=0;
  for (;;) {
    const {done,value}=await reader.read(); if(done)break;
    if(loaded+value.length>modelBytes)throw new Error('模型大小异常');
    bytes.set(value,loaded);loaded+=value.length;emit('download',loaded);
  }
  if(loaded!==modelBytes)throw new Error('模型下载不完整');
  const digest = new Uint8Array(await crypto.subtle.digest('SHA-256',bytes));
  if(Array.from(digest,n=>n.toString(16).padStart(2,'0')).join('')!=='14b4e03d29f4ef21789842681e90930f69b2d96b970e64572900b629b8eceb94')throw new Error('模型完整性校验失败');
  emit('initializing',loaded); progress('正在初始化 kdens3…');
  ort=await import(/* @vite-ignore */ `${base}runtime/ort/ort.webgpu.min.mjs`);
  ort.env.wasm.numThreads=1; ort.env.wasm.wasmPaths=`${base}runtime/ort/`;
  if((navigator as any).gpu) {
    try {
      const adapter=await (navigator as any).gpu.requestAdapter();
      if(adapter) { session=await ort.InferenceSession.create(bytes,{executionProviders:['webgpu'],preferredOutputLocation:'gpu-buffer'});backend='webgpu'; }
    } catch(error) { progress(`WebGPU 不可用，使用 WASM：${String(error)}`); }
  }
  if(!session)session=await ort.InferenceSession.create(bytes,{executionProviders:['wasm']});
  emit('ready',loaded);
}
async function infer(item:any):Promise<number> {
  if(item.obs.length!==38*4*9 || item.mask.length!==235 || !item.mask.some(Boolean))throw new Error('模型观测维度异常');
  const observation=new ort.Tensor('float32',Float32Array.from(item.obs),[1,38,4,9]);
  const mask=new ort.Tensor('bool',Uint8Array.from(item.mask, value=>value?1:0),[1,235]);
  let outputs:any;
  const started=performance.now();
  try {
    outputs=await session.run({[session.inputNames[0]]:observation,[session.inputNames[1]]:mask});
    if(backend==='webgpu'&&outputs[session.outputNames[0]].location!=='gpu-buffer')throw new Error('WebGPU 未返回 GPU 输出');
    const scores=await outputs[session.outputNames[0]].getData();
    if(scores.length!==235 || Array.from(scores as Float32Array).some(value=>!Number.isFinite(value)))throw new Error('模型输出异常');
    let best=-1;
    for(let i=0;i<235;i++)if(item.mask[i]&&(best<0||scores[i]>scores[best]))best=i;
    if(best<0)throw new Error('模型没有合法动作');
    inferenceCalls++;lastInferenceMs=performance.now()-started;
    return best;
  } finally { observation.dispose();mask.dispose();if(outputs)Object.values(outputs).forEach((tensor:any)=>tensor.dispose()); }
}
