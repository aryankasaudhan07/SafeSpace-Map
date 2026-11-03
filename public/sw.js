// SafeSpace Map service worker: keeps the app, helplines and recently viewed map usable with no signal
// (for example underground in the Metro). Only tiles the user has already viewed are cached;
// OpenStreetMap's tile policy doesn't allow bulk downloading.
const VERSION = "v1";
const STATIC = `static-${VERSION}`;
const PAGES = `pages-${VERSION}`;
const DATA = `data-${VERSION}`;
const TILES = "tiles-v1";
const MAX_TILES = 400;
const PRECACHE = ["/", "/offline.html", "/icon.svg", "/manifest.webmanifest"];

self.addEventListener("install", (event) => {
  event.waitUntil(caches.open(PAGES).then((c) => c.addAll(PRECACHE)).then(() => self.skipWaiting()));
});

self.addEventListener("activate", (event) => {
  const keep = new Set([STATIC, PAGES, DATA, TILES]);
  event.waitUntil(
    caches
      .keys()
      .then((keys) => Promise.all(keys.filter((k) => !keep.has(k)).map((k) => caches.delete(k))))
      .then(() => self.clients.claim()),
  );
});

function timeout(ms) {
  return new Promise((_, reject) => setTimeout(() => reject(new Error("timeout")), ms));
}

async function cacheFirst(request, cacheName, limit) {
  const cache = await caches.open(cacheName);
  const hit = await cache.match(request);
  if (hit) return hit;
  const res = await fetch(request);
  if (res.ok) {
    cache.put(request, res.clone()).catch(() => {});
    if (limit) trim(cache, limit);
  }
  return res;
}

async function trim(cache, limit) {
  const keys = await cache.keys();
  for (let i = 0; i < keys.length - limit; i++) await cache.delete(keys[i]);
}

async function networkFirst(request, cacheName, ms) {
  const cache = await caches.open(cacheName);
  try {
    const res = await Promise.race([fetch(request), timeout(ms)]);
    if (res.ok) cache.put(request, res.clone()).catch(() => {});
    return res;
  } catch {
    const hit = await cache.match(request);
    if (hit) return hit;
    throw new Error("offline");
  }
}

self.addEventListener("fetch", (event) => {
  const { request } = event;
  if (request.method !== "GET") return;
  const url = new URL(request.url);

  if (url.hostname === "tile.openstreetmap.org") {
    event.respondWith(cacheFirst(request, TILES, MAX_TILES));
    return;
  }
  if (url.origin !== self.location.origin) return;

  if (request.mode === "navigate") {
    event.respondWith(
      networkFirst(request, PAGES, 6000).catch(async () => (await caches.match(request)) || (await caches.match("/offline.html"))),
    );
    return;
  }
  if (url.pathname.startsWith("/_next/static/") || url.pathname.startsWith("/icons/") || url.pathname === "/icon.svg") {
    event.respondWith(cacheFirst(request, STATIC));
    return;
  }
  if (["/api/reports", "/api/metro-stations", "/api/safe-places"].includes(url.pathname)) {
    event.respondWith(networkFirst(request, DATA, 6000));
  }
});
