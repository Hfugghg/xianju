/// <reference types="vite/client" />
import type { GameView, MahjongClient } from './types';
export type { GameView, MahjongClient } from './types';

export async function createMahjongClient(onProgress?: (text: string) => void): Promise<MahjongClient> {
  const worker = new Worker(new URL('./worker.ts', import.meta.url), { type: 'module' });
  let sequence = 0;
  const pending = new Map<number, { resolve: (value: GameView) => void; reject: (error: Error) => void }>();
  let readyResolve!: () => void;
  let readyReject!: (error: Error) => void;
  const ready = new Promise<void>((resolve, reject) => { readyResolve = resolve; readyReject = reject; });
  worker.onmessage = ({ data }) => {
    if (data.progress) { onProgress?.(data.progress); return; }
    if (data.ready) { readyResolve(); return; }
    if (data.id === undefined && data.error) { readyReject(new Error(data.error)); return; }
    const request = pending.get(data.id);
    if (!request) return;
    pending.delete(data.id);
    if (data.error) request.reject(new Error(data.error)); else request.resolve(data.view);
  };
  worker.onerror = event => {
    const error = new Error(event.message || '麻将引擎加载失败');
    readyReject(error);
    pending.forEach(request => request.reject(error));
    pending.clear();
  };
  worker.postMessage({ init: true, base: new URL(import.meta.env.BASE_URL, location.href).href });
  try { await ready; } catch (error) { worker.terminate(); throw error; }
  const send = (command: object) => new Promise<GameView>((resolve, reject) => {
    const id = sequence++;
    pending.set(id, { resolve, reject });
    worker.postMessage({ id, command });
  });
  return {
    start: (seed, mode='play') => send({ type: 'start', seed:seed ?? Math.floor(Math.random()*2147483647), mode }),
    restore: replay => send({ type:'restore', replay }),
    action: action => send({ type: 'action', action }),
    advance: () => send({ type: 'advance' }),
    autoAdvance: () => send({ type: 'auto' }),
    dispose: () => { worker.terminate(); pending.forEach(request => request.reject(new Error('牌局已关闭'))); pending.clear(); },
  };
}
