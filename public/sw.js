/* Basic PWA service worker for Next.js static assets */
const CACHE_NAME = "glessing-inspection-pwa-v1";

// Keep this simple: cache the app shell
const APP_SHELL = ["/", "/manifest.webmanifest"];

self.addEventListener("install", (event) => {
  event.waitUntil(
    caches.open(CACHE_NAME).then((cache) => cache.addAll(APP_SHELL))
  );
  self.skipWaiting();
});

self.addEventListener("activate", (event) => {
  event.waitUntil(
    (async () => {
      const keys = await caches.keys();
      await Promise.all(keys.map((k) => (k === CACHE_NAME ? null : caches.delete(k))));
      await self.clients.claim();
    })()
  );
});

self.addEventListener("fetch", (event) => {
  const req = event.request;
  // Only handle GET requests
  if (req.method !== "GET") return;

  event.respondWith(
    (async () => {
      const cached = await caches.match(req);
      if (cached) return cached;

      try {
        const fresh = await fetch(req);
        // Cache same-origin static-ish requests
        const url = new URL(req.url);
        if (url.origin === self.location.origin) {
          const cache = await caches.open(CACHE_NAME);
          cache.put(req, fresh.clone());
        }
        return fresh;
      } catch (err) {
        // If offline and requesting navigation, fall back to cached "/"
        if (req.mode === "navigate") {
          const fallback = await caches.match("/");
          if (fallback) return fallback;
        }
        throw err;
      }
    })()
  );
});
