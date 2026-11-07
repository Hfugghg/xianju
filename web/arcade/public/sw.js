// GitHub Pages cannot set COOP/COEP response headers. This service worker adds
// them to same-origin responses so `crossOriginIsolated` becomes true and
// SharedArrayBuffer is available to ONNX Runtime Web's threaded WASM backend.
// Worker scripts need the COEP header too: an isolated page's dedicated worker
// script is blocked with `coep-frame-resource-needs-coep-header` otherwise.

const isolationHeaders = {
  'Cross-Origin-Opener-Policy': 'same-origin',
  'Cross-Origin-Embedder-Policy': 'require-corp',
};

self.addEventListener('install', () => self.skipWaiting());
self.addEventListener('activate', event => event.waitUntil(self.clients.claim()));

self.addEventListener('fetch', event => {
  const request = event.request;
  // Every resource this app loads is same-origin; leave cross-origin requests
  // (there are none today) untouched so isolation cannot break them.
  if (request.method !== 'GET') return;
  if (new URL(request.url).origin !== self.location.origin) return;
  event.respondWith((async () => {
    const response = await fetch(request);
    // Leave partial content untouched so range requests keep their semantics.
    if (!response.ok || response.status === 206) return response;
    const headers = new Headers(response.headers);
    // The body is already decoded, so these headers no longer describe the
    // response we construct below.
    headers.delete('content-encoding');
    headers.delete('content-length');
    for (const [name, value] of Object.entries(isolationHeaders)) headers.set(name, value);
    return new Response(response.body, {
      status: response.status,
      statusText: response.statusText,
      headers,
    });
  })());
});
