// Service worker: every file of the build is cached at install, then served from the cache only, so the app
// works without network access. A new version installs in the background and waits until the user reloads
// from About (the page posts "skipWaiting").
// The build replaces the two placeholders below with the file list and its hash.

const FILES = self.__QRAUTH_FILES__;
const CACHE = `qrauth-${self.__QRAUTH_HASH__}`;
const BASE = new URL("./", self.location.href);

self.addEventListener("install", (event) => {
  event.waitUntil(
    caches.open(CACHE).then((cache) => cache.addAll(FILES.map((f) => new Request(new URL(f, BASE), { cache: "reload" })))),
  );
});

self.addEventListener("activate", (event) => {
  event.waitUntil(
    caches
      .keys()
      .then((keys) => Promise.all(keys.filter((k) => k.startsWith("qrauth-") && k !== CACHE).map((k) => caches.delete(k))))
      .then(() => self.clients.claim()),
  );
});

self.addEventListener("message", (event) => {
  if (event.data === "skipWaiting") self.skipWaiting();
});

self.addEventListener("fetch", (event) => {
  const url = new URL(event.request.url);
  if (event.request.method !== "GET" || url.origin !== BASE.origin || !url.pathname.startsWith(BASE.pathname)) return;
  if (event.request.mode === "navigate") {
    event.respondWith(caches.match(new URL("index.html", BASE)).then((r) => r || fetch(event.request)));
    return;
  }
  event.respondWith(caches.match(event.request, { ignoreSearch: true }).then((r) => r || fetch(event.request)));
});
