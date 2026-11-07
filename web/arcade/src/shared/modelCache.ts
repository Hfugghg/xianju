// Preferences and model writes share a transaction scope. A disable in another
// tab either follows a write and deletes it, or precedes it and prevents it.
export const MODEL_CACHE_DB = 'xianju.model-cache.v1';
export const MODEL_CACHE_CHANNEL = 'xianju.model-cache';
export interface ModelSpec {
  gameId: string;
  version: string;
  size: number;
  sha256: string;
}
export interface CacheState {
  enabled: boolean;
  saved: boolean;
}
function open(): Promise<IDBDatabase> {
  return new Promise((resolve, reject) => {
    const request = indexedDB.open(MODEL_CACHE_DB, 1);
    request.onupgradeneeded = () => {
      request.result.createObjectStore('preferences');
      request.result.createObjectStore('models');
    };
    request.onsuccess = () => resolve(request.result);
    request.onerror = () => reject(request.error);
    request.onblocked = () => reject(new Error('模型存储被占用'));
  });
}
async function transaction<T>(
  mode: IDBTransactionMode,
  run: (prefs: IDBObjectStore, models: IDBObjectStore, result: (value: T) => void) => void,
): Promise<T> {
  const db = await open();
  return new Promise<T>((resolve, reject) => {
    const tx = db.transaction(['preferences', 'models'], mode);
    let value: T;
    tx.oncomplete = () => {
      db.close();
      resolve(value);
    };
    tx.onabort = () => {
      db.close();
      reject(tx.error || new Error('模型存储失败'));
    };
    tx.onerror = () => {};
    try {
      run(tx.objectStore('preferences'), tx.objectStore('models'), (next) => {
        value = next;
      });
    } catch (error) {
      tx.abort();
      reject(error);
    }
  });
}
export function notifyModelCache(gameId: string, type: 'preference' | 'state' = 'state') {
  if (typeof BroadcastChannel === 'undefined') return;
  const channel = new BroadcastChannel(MODEL_CACHE_CHANNEL);
  channel.postMessage({ gameId, type });
  channel.close();
}
export async function cacheState(spec: ModelSpec): Promise<CacheState> {
  return transaction('readonly', (prefs, models, result) => {
    const pref = prefs.get(spec.gameId);
    pref.onsuccess = () => {
      const key = models.getKey([spec.gameId, spec.version]);
      key.onsuccess = () =>
        result({ enabled: pref.result === true, saved: pref.result === true && key.result !== undefined });
    };
  });
}
export async function setCacheEnabled(gameId: string, enabled: boolean): Promise<void> {
  await transaction<void>('readwrite', (prefs, models, result) => {
    prefs.put(enabled, gameId);
    if (!enabled) {
      const cursor = models.openCursor();
      cursor.onsuccess = () => {
        const c = cursor.result;
        if (c) {
          if (Array.isArray(c.key) && c.key[0] === gameId) c.delete();
          c.continue();
        }
      };
    }
    result();
  });
  notifyModelCache(gameId, 'preference');
  if (typeof window !== 'undefined')
    window.dispatchEvent(new CustomEvent('model-cache-preference', { detail: { gameId } }));
}
export async function loadCachedModel(spec: ModelSpec): Promise<Uint8Array<ArrayBuffer> | null> {
  return transaction('readwrite', (prefs, models, result) => {
    const pref = prefs.get(spec.gameId);
    pref.onsuccess = () => {
      if (pref.result !== true) {
        result(null);
        return;
      }
      const key = [spec.gameId, spec.version];
      const item = models.get(key);
      item.onsuccess = () => {
        if (item.result instanceof ArrayBuffer) {
          result(new Uint8Array(item.result));
          return;
        }
        models.delete(key);
        result(null);
      };
    };
  });
}
export async function removeCachedModel(spec: ModelSpec): Promise<void> {
  await transaction<void>('readwrite', (_prefs, models, result) => {
    models.delete([spec.gameId, spec.version]);
    result();
  });
  notifyModelCache(spec.gameId);
}
export async function saveCachedModel(spec: ModelSpec, bytes: Uint8Array<ArrayBuffer>): Promise<boolean> {
  const saved = await transaction<boolean>('readwrite', (prefs, models, result) => {
    const pref = prefs.get(spec.gameId);
    pref.onsuccess = () => {
      if (pref.result !== true) {
        result(false);
        return;
      }
      const key = models.getKey([spec.gameId, spec.version]);
      key.onsuccess = () => {
        if (key.result !== undefined) {
          result(false);
          return;
        }
        models.put(bytes.buffer, [spec.gameId, spec.version]);
        // State notifications never ask older tabs to re-save deleted versions.
        const cursor = models.openCursor();
        cursor.onsuccess = () => {
          const c = cursor.result;
          if (c) {
            if (Array.isArray(c.key) && c.key[0] === spec.gameId && c.key[1] !== spec.version) c.delete();
            c.continue();
          }
        };
        result(true);
      };
    };
  });
  if (saved) notifyModelCache(spec.gameId);
  return saved;
}
export async function validModel(spec: ModelSpec, bytes: Uint8Array<ArrayBuffer>): Promise<boolean> {
  if (bytes.length !== spec.size) return false;
  const digest = new Uint8Array(await crypto.subtle.digest('SHA-256', bytes));
  return Array.from(digest, (n) => n.toString(16).padStart(2, '0')).join('') === spec.sha256;
}
