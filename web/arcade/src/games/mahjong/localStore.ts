export interface LocalRecord {
  date: string;
  winner: number | null;
  scores: number[];
}
const prefix = 'xianju.mahjong.';
let warning = '';
const object = (value: unknown): value is Record<string, unknown> =>
  typeof value === 'object' && value !== null && !Array.isArray(value);
export function validLocal(key: string, value: unknown): boolean {
  if (key === 'difficulty') return value === 'easy' || value === 'normal' || value === 'expert';
  if (key === 'backend') return value === 'auto' || value === 'webgpu' || value === 'wasm';
  if (key === 'fast' || key === 'sound') return typeof value === 'boolean';
  if (key === 'records')
    return (
      Array.isArray(value) &&
      value.length <= 30 &&
      value.every(
        (record) =>
          object(record) &&
          typeof record.date === 'string' &&
          Number.isFinite(Date.parse(record.date)) &&
          (record.winner === null ||
            (Number.isInteger(record.winner) && Number(record.winner) >= 0 && Number(record.winner) <= 3)) &&
          Array.isArray(record.scores) &&
          record.scores.length === 4 &&
          record.scores.every((score) => typeof score === 'number' && Number.isFinite(score)),
      )
    );
  if (key === 'replay')
    return (
      object(value) &&
      typeof value.seed === 'number' &&
      Number.isSafeInteger(value.seed) &&
      value.seed >= 0 &&
      value.seed <= 2147483647 &&
      (value.mode === 'play' || value.mode === 'spectate') &&
      Array.isArray(value.actions) &&
      value.actions.length <= 1000 &&
      value.policy === 'kdens3-v1' &&
      value.actions.every(
        (action) =>
          object(action) &&
          Object.keys(action).length >= 1 &&
          Object.keys(action).length <= 4 &&
          Object.entries(action).every(
            ([seat, id]) => /^[0-3]$/.test(seat) && Number.isInteger(id) && Number(id) >= 0 && Number(id) < 235,
          ),
      )
    );
  return false;
}
export function getLocalWarning(): string {
  return warning;
}
export function readLocal<T>(key: string, fallback: T): T {
  let raw: string | null;
  try {
    raw = localStorage.getItem(prefix + key);
  } catch {
    warning = '浏览器未允许本地存储，本次对局可继续，但进度可能无法保存。';
    return fallback;
  }
  if (raw === null) return fallback;
  try {
    const value: unknown = JSON.parse(raw);
    if (!validLocal(key, value)) throw new Error('invalid schema');
    return value as T;
  } catch {
    warning = '部分本地数据格式异常，原始数据已保留。';
    if (key === 'replay') throw new Error('本地牌局存档格式异常。存档已保留，请重试或明确放弃存档后开新局。');
    return fallback;
  }
}
export function writeLocal(key: string, value: unknown): boolean {
  try {
    if (!validLocal(key, value)) throw new Error('invalid schema');
    localStorage.setItem(prefix + key, JSON.stringify(value));
    return true;
  } catch {
    warning = '本地保存失败，本次对局可继续；刷新或关闭页面可能丢失进度。';
    return false;
  }
}
export function removeLocal(key: string): boolean {
  try {
    localStorage.removeItem(prefix + key);
    return true;
  } catch {
    warning = '无法清理本地存档，下次打开可能仍显示旧进度。';
    return false;
  }
}
