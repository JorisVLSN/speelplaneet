const CACHE_NAME = "speelplaneet-offline-v28";
const CORE_ASSETS = [
  "/",
  "/index.html",
  "/styles.css",
  "/level-engine.js",
  "/app.js",
  "/manifest.webmanifest",
  "/assets/speelplaneet-app-icon.svg",
  "/assets/speelplaneet-app-icon-192.png",
  "/assets/speelplaneet-app-icon-512.png",
  "/assets/ellie-en-mila-speelplaneet.png",
  "/assets/ellie-runner-transparent.png",
  "/assets/mila-runner-transparent.png",
  "/assets/mats-runner-transparent.png"
];

self.addEventListener("install", event => {
  event.waitUntil(caches.open(CACHE_NAME).then(cache => cache.addAll(CORE_ASSETS)));
  self.skipWaiting();
});

self.addEventListener("activate", event => {
  event.waitUntil(
    caches.keys().then(keys => Promise.all(keys.filter(key => key !== CACHE_NAME).map(key => caches.delete(key))))
  );
  self.clients.claim();
});

self.addEventListener("fetch", event => {
  if (event.request.method !== "GET") return;
  if (new URL(event.request.url).pathname.startsWith("/api/")) return;
  event.respondWith(
    caches.match(event.request).then(cached => cached || fetch(event.request).then(response => {
      if (response.ok && new URL(event.request.url).origin === self.location.origin) {
        const copy = response.clone();
        caches.open(CACHE_NAME).then(cache => cache.put(event.request, copy));
      }
      return response;
    }).catch(() => caches.match("/index.html")))
  );
});
