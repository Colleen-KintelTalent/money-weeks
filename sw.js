/* Bump CACHE when you change index.html, otherwise phones keep the old copy. */
const CACHE = "money-weeks-v13";
const SHELL = ["./", "./index.html", "./manifest.webmanifest",
               "./icon-192.png", "./icon-512.png", "./icon-maskable.png"];

self.addEventListener("install", e => {
  e.waitUntil(caches.open(CACHE).then(c => c.addAll(SHELL)).then(() => self.skipWaiting()));
});

self.addEventListener("activate", e => {
  e.waitUntil(caches.keys()
    .then(keys => Promise.all(keys.filter(k => k !== CACHE).map(k => caches.delete(k))))
    .then(() => self.clients.claim()));
});

/* The receipt reader in ./vendor is deliberately NOT in SHELL: it is about ten
   megabytes and only downloads if he actually reads a receipt. It is pinned by
   version, so once cached it never needs re-fetching — hence no background refresh,
   which would otherwise pull megabytes over mobile data on every use. */
const isVendor = url => new URL(url).pathname.indexOf("/vendor/") !== -1;

/* Cache first, so it opens with no signal. Refreshes quietly in the background. */
self.addEventListener("fetch", e => {
  if (e.request.method !== "GET") return;
  if (isVendor(e.request.url)) {
    e.respondWith(caches.match(e.request).then(hit => hit || fetch(e.request).then(res => {
      if (res && res.status === 200 && res.type === "basic") {
        const copy = res.clone();
        /* waitUntil, not fire and forget: the worker can be stopped the moment the
           response is handed over, and a half-written 3MB core is worse than none. */
        e.waitUntil(caches.open(CACHE).then(c => c.put(e.request, copy)));
      }
      return res;
    })));
    return;
  }
  e.respondWith(
    caches.match(e.request).then(hit => {
      const live = fetch(e.request).then(res => {
        if (res && res.status === 200 && res.type === "basic")
          caches.open(CACHE).then(c => c.put(e.request, res.clone()));
        return res;
      }).catch(() => hit);
      return hit || live;
    })
  );
});
