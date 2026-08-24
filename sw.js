const CACHE_NAME = "leoncentro-v25";
const CORE_ASSETS = [
  "./",
  "./index.html",
  "./promos.html",
  "./checklist_salida.html",
  "./llamadas.html",
  "./firebase-init.js",
  "./manifest.json",
  "./icon-192.png",
  "./icon-512.png"
];

self.addEventListener("install", (event) => {
  event.waitUntil(
    caches.open(CACHE_NAME).then(async (cache) => {
      await Promise.all(CORE_ASSETS.map(async (asset) => {
        try { await cache.add(asset); } catch (_) {}
      }));
    }).then(() => self.skipWaiting())
  );
});

self.addEventListener("activate", (event) => {
  event.waitUntil(
    caches.keys().then((keys) => Promise.all(
      keys.filter((key) => key !== CACHE_NAME).map((key) => caches.delete(key))
    )).then(() => self.clients.claim())
  );
});

self.addEventListener("fetch", (event) => {
  const req = event.request;
  if (req.method !== "GET") return;

  const url = new URL(req.url);
  const sameOrigin = url.origin === self.location.origin;
  const isNavigation = req.mode === "navigate" || (req.headers.get("accept") || "").includes("text/html");
  const isAppScript = sameOrigin && url.pathname.endsWith(".js");

  // Never let the service worker manufacture a blank/old HTML page after a failed network request.
  // HTML and app JS use network-first, with cache only as an offline fallback.
  if (sameOrigin && (isNavigation || isAppScript)) {
    event.respondWith(
      fetch(req, { cache: "no-store" }).then((response) => {
        if (response && response.ok) {
          const copy = response.clone();
          caches.open(CACHE_NAME).then((cache) => cache.put(req, copy)).catch(() => {});
        }
        return response;
      }).catch(() => caches.match(req).then((cached) => {
        if (cached) return cached;
        if (isNavigation) return caches.match("./index.html");
        return new Response("Offline", { status: 503, headers: { "Content-Type": "text/plain" } });
      }))
    );
    return;
  }

  // Static local assets: cache first, then network.
  if (sameOrigin) {
    event.respondWith(
      caches.match(req).then((cached) => cached || fetch(req).then((response) => {
        if (response && response.ok) {
          const copy = response.clone();
          caches.open(CACHE_NAME).then((cache) => cache.put(req, copy)).catch(() => {});
        }
        return response;
      }))
    );
    return;
  }

  // External Firebase/Google Fonts/CDN resources: network first, cached fallback.
  event.respondWith(
    fetch(req).catch(() => caches.match(req))
  );
});
