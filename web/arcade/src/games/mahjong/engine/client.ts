/// <reference types="vite/client" />
import type { BackendPreference, GameView, MahjongClient, RuntimeProgress } from './types';
export type { BackendPreference, GameView, MahjongClient, RuntimeProgress } from './types';

export async function createMahjongClient(
  onProgress?: (text: string) => void,
  onRuntime?: (progress: RuntimeProgress) => void,
  signal?: AbortSignal,
  backend: BackendPreference = 'auto',
): Promise<MahjongClient> {
  const worker = new Worker(new URL('./worker.ts', import.meta.url), { type: 'module' });
  const cachePreference = (event: Event) => {
    if ((event as CustomEvent).detail?.gameId === 'mahjong') worker.postMessage({ cacheChanged: true });
  };
  window.addEventListener('model-cache-preference', cachePreference);
  let sequence = 0;
  type Reply = GameView | { backend: 'webgpu' | 'wasm'; threads: number };
  const pending = new Map<number, { resolve: (value: Reply) => void; reject: (error: Error) => void }>();
  let readyResolve!: () => void;
  let readyReject!: (error: Error) => void;
  const ready = new Promise<void>((resolve, reject) => {
    readyResolve = resolve;
    readyReject = reject;
  });
  const abort = () => {
    window.removeEventListener('model-cache-preference', cachePreference);
    worker.terminate();
    const error = new Error('Model initialization cancelled');
    readyReject(error);
    pending.forEach((request) => request.reject(error));
    pending.clear();
  };
  signal?.addEventListener('abort', abort, { once: true });
  if (signal?.aborted) abort();
  worker.onmessage = ({ data }) => {
    if (data.cacheSaved) {
      window.dispatchEvent(new Event('model-cache-update'));
      return;
    }
    if (data.cacheError) {
      window.dispatchEvent(new CustomEvent('model-cache-error', { detail: { gameId: 'mahjong' } }));
      return;
    }
    if (data.runtime) {
      onRuntime?.(data.runtime);
      return;
    }
    if (data.progress) {
      onProgress?.(data.progress);
      return;
    }
    if (data.ready) {
      readyResolve();
      return;
    }
    if (data.id === undefined && data.error) {
      readyReject(new Error(data.error));
      return;
    }
    const request = pending.get(data.id);
    if (!request) return;
    pending.delete(data.id);
    if (data.error) request.reject(new Error(data.error));
    else request.resolve(data.view ?? { backend: data.backend, threads: data.threads });
  };
  worker.onerror = (event) => {
    const error = new Error(event.message || '麻将引擎加载失败');
    readyReject(error);
    pending.forEach((request) => request.reject(error));
    pending.clear();
  };
  worker.postMessage({ init: true, base: new URL(import.meta.env.BASE_URL, location.href).href, backend });
  try {
    await ready;
  } catch (error) {
    signal?.removeEventListener('abort', abort);
    window.removeEventListener('model-cache-preference', cachePreference);
    worker.terminate();
    throw error;
  }
  const call = <T extends Reply>(command: object) =>
    new Promise<T>((resolve, reject) => {
      const id = sequence++;
      pending.set(id, { resolve: resolve as (value: Reply) => void, reject });
      worker.postMessage({ id, command });
    });
  const send = (command: object) => call<GameView>(command);
  return {
    start: (seed, mode = 'play') => send({ type: 'start', seed: seed ?? Math.floor(Math.random() * 2147483647), mode }),
    restore: (replay) => send({ type: 'restore', replay }),
    advance: (difficulty = 'expert') => send({ type: 'advance', difficulty }),
    autoAdvance: (difficulty = 'expert') => send({ type: 'auto', difficulty }),
    setBackend: (preference) =>
      call<{ backend: 'webgpu' | 'wasm'; threads: number }>({ type: 'setBackend', backend: preference }),
    dispose: () => {
      signal?.removeEventListener('abort', abort);
      window.removeEventListener('model-cache-preference', cachePreference);
      worker.terminate();
      pending.forEach((request) => request.reject(new Error('牌局已关闭')));
      pending.clear();
    },
  };
}
