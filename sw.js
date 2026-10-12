// DutchCup service worker — offline app shell for the score-entry page (and index).
// Install: caches the two app pages so they open with no signal on the course.
// Fetch strategy:
//   • Firebase backend traffic (googleapis.com / firebaseio.com) → network only, never cached.
//   • App HTML pages → network-first (so updates always reach devices), cache fallback.
//   • Versioned CDN assets (gstatic SDKs) → cache-first with background refresh.
const SW_VERSION = 'dutchcup-v1';
const APP_SHELL = ['./score-entry.html', './index.html', './leaderboard.html'];

self.addEventListener('install', (event) => {
    event.waitUntil(
        caches.open(SW_VERSION)
            .then((cache) => cache.addAll(APP_SHELL))
            .then(() => self.skipWaiting())
            .catch(() => self.skipWaiting())
    );
});

self.addEventListener('activate', (event) => {
    event.waitUntil(
        caches.keys()
            .then((keys) => Promise.all(
                keys.filter((k) => k !== SW_VERSION).map((k) => caches.delete(k))
            ))
            .then(() => self.clients.claim())
    );
});

self.addEventListener('fetch', (event) => {
    const req = event.request;
    if (req.method !== 'GET') return;
    const url = new URL(req.url);

    // Never cache Firebase backend traffic.
    if (url.hostname.endsWith('googleapis.com') || url.hostname.endsWith('firebaseio.com')) return;

    // App pages: network-first so deployed updates always win; cache is the fallback.
    const isAppPage = url.origin === self.location.origin &&
        (url.pathname.endsWith('.html') || url.pathname === '/' || url.pathname.endsWith('/'));
    if (isAppPage) {
        event.respondWith(
            fetch(req)
                .then((res) => {
                    const copy = res.clone();
                    caches.open(SW_VERSION).then((cache) => cache.put(req, copy));
                    return res;
                })
                .catch(() => caches.match(req).then((hit) => hit || caches.match('./score-entry.html')))
        );
        return;
    }

    // CDN assets: cache-first, refresh from network in the background.
    // (version.txt is the live update check — never cache it.)
    if (url.pathname.endsWith('version.txt')) return;
    event.respondWith(
        caches.match(req).then((hit) => {
            const network = fetch(req).then((res) => {
                const copy = res.clone();
                caches.open(SW_VERSION).then((cache) => cache.put(req, copy));
                return res;
            }).catch(() => hit);
            return hit || network;
        })
    );
});
