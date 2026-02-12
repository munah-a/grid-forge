// GridForge GIS — Service Worker (offline capability scaffold)
// This is a minimal service worker that caches app shell assets
// for offline use. It uses a cache-first strategy for static assets
// and network-first for API calls / tile requests.

const CACHE_NAME = 'gridforge-v1';
const APP_SHELL = [
    '/',
    '/index.html',
];

// Install: cache app shell
self.addEventListener('install', (event) => {
    event.waitUntil(
        caches.open(CACHE_NAME).then((cache) => {
            return cache.addAll(APP_SHELL);
        })
    );
    self.skipWaiting();
});

// Activate: clean old caches
self.addEventListener('activate', (event) => {
    event.waitUntil(
        caches.keys().then((keys) =>
            Promise.all(keys.filter(k => k !== CACHE_NAME).map(k => caches.delete(k)))
        )
    );
    self.clients.claim();
});

// Fetch: cache-first for app shell, network-first for tiles
self.addEventListener('fetch', (event) => {
    const url = new URL(event.request.url);

    // Skip non-GET requests
    if (event.request.method !== 'GET') return;

    // Network-first for tile requests (OSM, ArcGIS)
    if (url.hostname.includes('tile.openstreetmap.org') ||
        url.hostname.includes('arcgisonline.com') ||
        url.hostname.includes('server.arcgisonline.com')) {
        event.respondWith(
            fetch(event.request).then(response => {
                const clone = response.clone();
                caches.open(CACHE_NAME + '-tiles').then(cache => cache.put(event.request, clone));
                return response;
            }).catch(() => caches.match(event.request))
        );
        return;
    }

    // Cache-first for app shell
    event.respondWith(
        caches.match(event.request).then(cached => cached || fetch(event.request))
    );
});
