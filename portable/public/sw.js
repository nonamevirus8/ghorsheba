// GhorSheba service worker: caches the app shell (HTML, manifest, icons
// and, at runtime, the hashed JS/CSS bundles) so the installed app opens
// fast and keeps working on a flaky connection. API calls are never
// cached — bookings and account data always come from the network.
const CACHE = "ghorsheba-shell-v1";
const SHELL = [
  "/",
  "/index.html",
  "/manifest.webmanifest",
  "/icon.svg",
  "/icon-192.png",
  "/icon-512.png",
];

self.addEventListener("install", (event) => {
  event.waitUntil(
    caches
      .open(CACHE)
      .then((cache) => cache.addAll(SHELL))
      .then(() => self.skipWaiting()),
  );
});

self.addEventListener("activate", (event) => {
  event.waitUntil(
    caches
      .keys()
      .then((keys) =>
        Promise.all(keys.filter((k) => k !== CACHE).map((k) => caches.delete(k))),
      )
      .then(() => self.clients.claim()),
  );
});

self.addEventListener("fetch", (event) => {
  const url = new URL(event.request.url);
  if (event.request.method !== "GET" || url.origin !== self.location.origin) {
    return;
  }
  // Never cache API responses (actions RPC + uploaded photos).
  if (url.pathname.startsWith("/api/")) return;

  // Page navigations: network first, falling back to the cached shell
  // when offline (the app is a hash-routed SPA, so one shell serves all).
  if (event.request.mode === "navigate") {
    event.respondWith(
      fetch(event.request)
        .then((res) => {
          const copy = res.clone();
          caches.open(CACHE).then((cache) => cache.put("/index.html", copy));
          return res;
        })
        .catch(() => caches.match("/index.html")),
    );
    return;
  }

  // Static assets: cache first, then network (and cache what we fetch).
  event.respondWith(
    caches.match(event.request).then(
      (hit) =>
        hit ??
        fetch(event.request).then((res) => {
          const copy = res.clone();
          caches.open(CACHE).then((cache) => cache.put(event.request, copy));
          return res;
        }),
    ),
  );
});
