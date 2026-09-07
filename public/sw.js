/*
 * Minimal service worker.
 *
 * Deliberately caches nothing. Its job is to make the app installable — and
 * later, to receive push notifications. Caching a realtime app whose whole
 * point is showing who is at the door right now risks serving a stale shell or
 * a stale visitor list, which is worse than not working offline at all.
 */

self.addEventListener("install", () => {
  // Take over straight away rather than waiting for every tab to close.
  self.skipWaiting();
});

self.addEventListener("activate", (event) => {
  event.waitUntil(self.clients.claim());
});

// A fetch handler is required for installability. Pass everything through.
self.addEventListener("fetch", () => {});
