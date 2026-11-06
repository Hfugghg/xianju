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
onmessage = async ({ data }) => {
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
      postMessage({ ready: true });
      return;
    }
    const view = JSON.parse(dispatch(JSON.stringify(data.command)));
    postMessage({ id: data.id, view });
  } catch (error) {
    postMessage({ id: data.id, error: String(error) });
  }
};
