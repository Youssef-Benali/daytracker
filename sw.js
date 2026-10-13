/*
 * DayTracker service worker.
 * Precache the whole app shell so the calendar works with no connection.
 */
'use strict';

const CACHE_NAME = 'daytracker-v1';
const PRECACHE_URLS = [
  './',
  './index.html',
  './manifest.json',
  './icon-192.png',
  './icon-512.png'
];

self.addEventListener('install', (event) => {
  event.waitUntil((async () => {
    const cache = await caches.open(CACHE_NAME);
    await cache.addAll(PRECACHE_URLS);
    await self.skipWaiting();
  })());
});

self.addEventListener('activate', (event) => {
  event.waitUntil((async () => {
    const keys = await caches.keys();
    await Promise.all(
      keys.filter((key) => key !== CACHE_NAME).map((key) => caches.delete(key))
    );
    await self.clients.claim();
  })());
});

function offlineResponse() {
  return new Response('Offline', {
    status: 503,
    statusText: 'Offline',
    headers: { 'Content-Type': 'text/plain; charset=utf-8' }
  });
}

async function putInCache(request, response) {
  try {
    const cache = await caches.open(CACHE_NAME);
    await cache.put(request, response);
  } catch (error) {
    /* Quota or opaque response: caching is best-effort. */
  }
}

self.addEventListener('fetch', (event) => {
  const request = event.request;

  if (request.method !== 'GET') return;

  const url = new URL(request.url);
  if (url.origin !== self.location.origin) return;

  /* Page loads: network first, cached shell as the offline fallback. */
  if (request.mode === 'navigate') {
    event.respondWith((async () => {
      try {
        const response = await fetch(request);
        if (response && response.ok) putInCache(request, response.clone());
        return response;
      } catch (error) {
        return (await caches.match(request))
          || (await caches.match('./index.html'))
          || (await caches.match('./'))
          || offlineResponse();
      }
    })());
    return;
  }

  /* Static assets: cache first, refresh in the background. */
  event.respondWith((async () => {
    const cached = await caches.match(request);

    if (cached) {
      fetch(request)
        .then((response) => {
          if (response && response.ok) putInCache(request, response.clone());
        })
        .catch(() => {});
      return cached;
    }

    try {
      const response = await fetch(request);
      if (response && response.ok) putInCache(request, response.clone());
      return response;
    } catch (error) {
      return offlineResponse();
    }
  })());
});
