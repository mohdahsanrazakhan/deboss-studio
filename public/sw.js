// Hand-rolled service worker (no next-pwa/serwist dependency).
//
// This app has zero backend and no data fetching, everything runs off
// client-side canvas + localStorage, so once the shell and its static
// assets are cached, the whole studio keeps working with no connection.
//
// Bump CACHE_VERSION whenever this file's caching strategy changes; it's
// what makes `activate` clear out the previous cache instead of leaving
// stale entries around for returning visitors.
const CACHE_VERSION = "v1";
const CACHE_NAME = `text-deboss-studio-${CACHE_VERSION}`;

// Static, same-origin assets that never change per request: safe to warm
// the cache with immediately. The root page itself is NOT precached here;
// it's rendered per-request with a fresh CSP nonce each time (see
// src/middleware.ts), so it's cached opportunistically at runtime instead,
// the first time it's actually fetched.
const PRECACHE_URLS = [
  "/manifest.webmanifest",
  "/icon.svg",
  "/icon-192.png",
  "/icon-512.png",
];

self.addEventListener("install", (event) => {
  event.waitUntil(
    caches.open(CACHE_NAME).then((cache) => cache.addAll(PRECACHE_URLS)),
  );
  self.skipWaiting();
});

self.addEventListener("activate", (event) => {
  event.waitUntil(
    caches
      .keys()
      .then((keys) =>
        Promise.all(
          keys
            .filter((key) => key !== CACHE_NAME)
            .map((key) => caches.delete(key)),
        ),
      )
      .then(() => self.clients.claim()),
  );
});

self.addEventListener("fetch", (event) => {
  const { request } = event;
  if (request.method !== "GET") return;

  // Page navigations: network-first, so a visitor with a connection always
  // gets the freshest shell (and its matching CSP nonce). Offline, fall
  // back to whatever was last cached for this exact URL, then to the
  // cached root as a last resort.
  if (request.mode === "navigate") {
    event.respondWith(
      fetch(request)
        .then((response) => {
          const copy = response.clone();
          caches.open(CACHE_NAME).then((cache) => cache.put(request, copy));
          return response;
        })
        .catch(
          () =>
            caches
              .match(request)
              .then((cached) => cached || caches.match("/")),
        ),
    );
    return;
  }

  const url = new URL(request.url);

  // Same-origin static assets (content-hashed Next.js chunks, icons):
  // cache-first, since a given hashed URL never changes its contents.
  if (url.origin === self.location.origin) {
    event.respondWith(
      caches.match(request).then((cached) => {
        if (cached) return cached;
        return fetch(request).then((response) => {
          if (response.ok) {
            const copy = response.clone();
            caches.open(CACHE_NAME).then((cache) => cache.put(request, copy));
          }
          return response;
        });
      }),
    );
    return;
  }

  // Cross-origin (Google Fonts stylesheet + font binaries): stale-while-
  // revalidate, so a previously-loaded font keeps working offline but
  // still refreshes in the background when there's a connection.
  event.respondWith(
    caches.match(request).then((cached) => {
      const network = fetch(request)
        .then((response) => {
          if (response.ok) {
            const copy = response.clone();
            caches.open(CACHE_NAME).then((cache) => cache.put(request, copy));
          }
          return response;
        })
        .catch(() => cached);
      return cached || network;
    }),
  );
});
