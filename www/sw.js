// Offline app shell. VERSION is stamped by the deploy workflow (.github/workflows/pages.yml) on every
// deploy, so each deploy gets a fresh cache. Don't edit it by hand; PRs never bump versions.
const VERSION = 'noodlit-__BUILD__';
const SHELL = [
  './',
  './index.html',
  './styles.css',
  './about.css',
  './prefs.css',
  './manifest.webmanifest',
  './src/main.js',
  './src/about.js',
  './src/prefs.js',
  './src/update.js',
  './src/welcome.js',
  './src/demo.js',
  './src/lib/util.js',
  './src/lib/release.js',
  './src/lib/sound.js',
  './src/lib/fade.js',
  './src/lib/brushes.js',
  './src/lib/undo.js',
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
  './src/environments/chalk.js',
  './src/environments/stone.js',
  './src/environments/zen.js',
  './src/environments/etch.js',
  './src/environments/light.js',
  './src/environments/breath.js',
  './src/environments/tidepool.js',
  './src/environments/ink.js',
  './src/environments/sparkler.js',
  './src/environments/starfield.js',
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
  // cache: 'reload' skips the browser's HTTP cache, so a new version never ships stale files.
  e.waitUntil(
    caches.open(VERSION)
      .then((c) => c.addAll(SHELL.map((url) => new Request(url, { cache: 'reload' }))))
      .then(() => self.skipWaiting())
  );
});

// The About panel's "Check for updates" can ask a waiting worker to take over.
self.addEventListener('message', (e) => {
  if (e.data && e.data.type === 'skip-waiting') self.skipWaiting();
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
