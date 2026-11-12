// Offline app shell. Bump VERSION whenever any cached file changes.
const VERSION = 'noodlit-v27';
const SHELL = [
  './',
  './index.html',
  './styles.css',
  './about.css',
  './manifest.webmanifest',
  './src/main.js',
  './src/about.js',
  './src/welcome.js',
  './src/lib/util.js',
  './src/lib/release.js',
  './src/lib/sound.js',
  './src/lib/fade.js',
  './src/lib/brushes.js',
  './src/environments/index.js',
  './src/environments/shower-door.js',
  './src/environments/waves.js',
  './src/environments/snow.js',
  './src/environments/whiteboard.js',
  './src/environments/windshield.js',
  './src/environments/stream.js',
  './src/environments/lantern.js',
  './src/environments/bottle.js',
  './src/environments/mailbox.js',
  './src/environments/frost.js',
  './src/environments/mirror.js',
  './src/environments/chalk.js',
  './src/environments/stone.js',
  './src/environments/zen.js',
  './src/environments/etch.js',
  './src/environments/light.js',
  './src/environments/burning.js',
  './src/environments/dandelion.js',
  './src/environments/shredder.js',
  './src/environments/kite.js',
  './src/environments/lantern-flock.js',
  './src/environments/rice-paper.js',
  './src/environments/rocket.js',
  './src/environments/paper-boat.js',
  './src/environments/leaf.js',
  './src/environments/balloon.js',
  './src/environments/paper-airplane.js',
  './src/environments/campfire.js',
  './icons/icon.svg',
  './icons/icon-192.png',
  './icons/icon-512.png',
  './icons/apple-touch-icon.png',
];

self.addEventListener('install', (e) => {
  e.waitUntil(caches.open(VERSION).then((c) => c.addAll(SHELL)).then(() => self.skipWaiting()));
});

self.addEventListener('activate', (e) => {
  e.waitUntil(
    caches.keys()
      .then((keys) => Promise.all(keys.filter((k) => k !== VERSION).map((k) => caches.delete(k))))
      .then(() => self.clients.claim())
  );
});

self.addEventListener('fetch', (e) => {
  if (e.request.method !== 'GET') return;
  e.respondWith(
    caches.match(e.request).then((hit) => hit || fetch(e.request).then((res) => {
      if (res.ok && new URL(e.request.url).origin === location.origin) {
        const copy = res.clone();
        caches.open(VERSION).then((c) => c.put(e.request, copy));
      }
      return res;
    }))
  );
});
