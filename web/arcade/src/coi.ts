/// <reference types="vite/client" />
// Cross-origin isolation enables SharedArrayBuffer, which ONNX Runtime Web's
// multi-threaded WASM backend needs. Static hosts such as GitHub Pages cannot
// set COOP/COEP headers, so production registers public/sw.js and reloads once
// to become isolated. Development and preview get the headers from vite.config.ts.
const RELOAD_KEY = 'xianju.coi.reloaded';
const TIMEOUT_MS = 4000;

function readFlag(): boolean {
  try {
    return sessionStorage.getItem(RELOAD_KEY) === '1';
  } catch {
    return false;
  }
}

function setFlag(value: boolean): void {
  try {
    if (value) sessionStorage.setItem(RELOAD_KEY, '1');
    else sessionStorage.removeItem(RELOAD_KEY);
  } catch {
    /* storage disabled; isolation still works without the loop guard */
  }
}

function waitForController(): Promise<boolean> {
  if (navigator.serviceWorker.controller) return Promise.resolve(true);
  return new Promise((resolve) => {
    const finish = () => {
      clearTimeout(timer);
      navigator.serviceWorker.removeEventListener('controllerchange', finish);
      resolve(!!navigator.serviceWorker.controller);
    };
    const timer = setTimeout(finish, TIMEOUT_MS);
    navigator.serviceWorker.addEventListener('controllerchange', finish);
  });
}

export async function ensureCrossOriginIsolation(): Promise<void> {
  if (typeof window === 'undefined') return;
  // Dev and preview already send the headers. Service workers also require a
  // secure context, and SharedArrayBuffer is unavailable without one.
  const canRegister = import.meta.env.PROD && 'serviceWorker' in navigator && window.isSecureContext;
  if (window.crossOriginIsolated) {
    setFlag(false);
    // Keep the registration fresh so later sw.js updates are picked up.
    if (canRegister) navigator.serviceWorker.register(new URL('sw.js', document.baseURI)).catch(() => {});
    return;
  }
  if (!canRegister) return;
  if (readFlag()) return; // Reloaded once already; never loop.

  try {
    await Promise.race([
      (async () => {
        await navigator.serviceWorker.register(new URL('sw.js', document.baseURI));
        await navigator.serviceWorker.ready;
        await waitForController();
      })(),
      new Promise<void>((resolve) => setTimeout(resolve, TIMEOUT_MS + 1000)),
    ]);
  } catch {
    return; // Registration failed; run without isolation rather than block.
  }
  if (!navigator.serviceWorker.controller) return;
  setFlag(true);
  location.reload();
}
