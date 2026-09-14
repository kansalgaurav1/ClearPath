/*
 * service-worker.js
 * -------------------
 * This is what turns ClearPath from "a web page" into "an installable app."
 * It runs separately from script.js, in the background, even when the app
 * isn't open. Its two jobs:
 *
 *   1. Cache the app shell (HTML/CSS/JS/icons) so the app opens instantly
 *      and still opens (showing cached content) if there's no signal.
 *   2. NEVER cache /api/ calls — hazard analysis always needs a live,
 *      fresh request to the backend (which calls Claude), so those are
 *      deliberately left alone and go straight to the network.
 *
 * Bump CACHE_NAME (e.g. to "clearpath-cache-v2") whenever you change the
 * app shell files, so returning users get the new version instead of an
 * old cached one.
 */

const CACHE_NAME = "clearpath-cache-v6";

const APP_SHELL = [
  "/",
  "/index.html",
  "/dashboard.html",
  "/style.css",
  "/i18n.js",
  "/script.js",
  "/alerts.js",
  "/reference.js",
  "/monitoring.js",
  "/voice-command.js",
  "/dashboard.js",
  "/pwa.js",
  "/manifest.json",
  "/icons/icon-192.png",
  "/icons/icon-512.png",
];

self.addEventListener("install", (event) => {
  event.waitUntil(
    caches.open(CACHE_NAME).then((cache) => cache.addAll(APP_SHELL))
  );
  self.skipWaiting(); // activate this new service worker as soon as it's installed
});

self.addEventListener("activate", (event) => {
  // Clean up any old cache versions left over from a previous version of the app.
  event.waitUntil(
    caches.keys().then((keys) =>
      Promise.all(
        keys.filter((key) => key !== CACHE_NAME).map((key) => caches.delete(key))
      )
    )
  );
  self.clients.claim();
});

self.addEventListener("fetch", (event) => {
  const url = new URL(event.request.url);

  // Analysis calls must always hit the real backend — never intercept them.
  if (url.pathname.startsWith("/api/")) {
    return;
  }

  // For the page itself: try the network first (so users get the latest
  // version when online), falling back to the cached copy if offline.
  if (event.request.mode === "navigate") {
    event.respondWith(
      fetch(event.request).catch(() => caches.match("/index.html"))
    );
    return;
  }

  // For everything else (css/js/icons): serve from cache if we have it,
  // otherwise fetch from the network.
  event.respondWith(
    caches.match(event.request).then((cachedResponse) => cachedResponse || fetch(event.request))
  );
});
