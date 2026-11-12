// App updates. Noodlit is cached for offline use by sw.js, so a phone keeps running the
// copy it already has until a new service worker takes over. This module:
//  - registers the service worker (bypassing the HTTP cache for sw.js itself),
//  - re-checks for a new version when the app comes back to the foreground,
//  - shows a small "New version ready" pill once a new version has taken over,
//  - powers the "Check for updates" button in About (checkForUpdates).
// The page never reloads on its own: a reload would wipe whatever is on the canvas.

const supported = 'serviceWorker' in navigator && window.isSecureContext;
const RECHECK_MS = 30 * 60 * 1000; // foreground re-check, at most this often
const INSTALL_TIMEOUT_MS = 25000;

let reg = null;
let ready = false;          // a newer version is active; a reload will show it
let lastCheck = Date.now(); // the browser checks on load, so count that as one
const hadController = supported && !!navigator.serviceWorker.controller;

export const updatesSupported = supported;
export function updateReady() { return ready; }

export function reloadToUpdate() {
  location.reload();
}

if (supported) {
  navigator.serviceWorker.register('sw.js', { updateViaCache: 'none' })
    .then((r) => { reg = r; })
    .catch(() => { /* preview hosts may block this */ });

  // sw.js activates new versions straight away (skipWaiting + clients.claim), so a
  // controller change on a page that already had one means a new version took over.
  navigator.serviceWorker.addEventListener('controllerchange', () => {
    if (!hadController || ready) return;
    ready = true;
    showPill();
  });

  // Phones keep a PWA alive in the background for days; look again when it returns.
  document.addEventListener('visibilitychange', () => {
    if (document.visibilityState !== 'visible' || !reg) return;
    if (Date.now() - lastCheck < RECHECK_MS) return;
    lastCheck = Date.now();
    reg.update().catch(() => {});
  });
}

// Resolves to one of: 'ready' (new version installed, caller should reload),
// 'current' (already up to date), 'offline' (couldn't reach the server),
// 'unsupported' (no service worker here, e.g. a preview host).
export async function checkForUpdates() {
  if (!supported) return 'unsupported';
  if (ready) return 'ready';
  try {
    reg = reg || await navigator.serviceWorker.getRegistration();
    if (!reg) return 'unsupported';
    lastCheck = Date.now();
    await reg.update();
  } catch {
    return 'offline';
  }
  if (ready) return 'ready';
  const incoming = reg.installing || reg.waiting;
  if (!incoming) return 'current';
  return (await settle(incoming)) ? 'ready' : 'offline';
}

// Wait for a new worker to finish installing and take over.
function settle(worker) {
  return new Promise((resolve) => {
    const done = (ok) => { clearTimeout(timer); worker.removeEventListener('statechange', onState); resolve(ok); };
    const onState = () => {
      if (worker.state === 'activated') { ready = true; done(true); }
      else if (worker.state === 'redundant') done(false);
    };
    const timer = setTimeout(() => done(ready), INSTALL_TIMEOUT_MS);
    worker.addEventListener('statechange', onState);
    // A waiting worker (an older sw.js that didn't skip waiting) needs a nudge.
    if (worker.state === 'installed') worker.postMessage({ type: 'skip-waiting' });
    onState();
  });
}

// The pill: quiet, top-centre, tap to refresh or dismiss.
function showPill() {
  if (document.getElementById('update-pill')) return;
  const ui = document.getElementById('ui');
  const pill = document.createElement('div');
  pill.id = 'update-pill';
  pill.className = 'update-pill';
  pill.setAttribute('role', 'status');
  pill.innerHTML =
    '<button type="button" class="update-pill-go">New version ready <b>Refresh</b></button>' +
    '<button type="button" class="update-pill-x" aria-label="Not now">' +
    '<svg viewBox="0 0 24 24" aria-hidden="true"><path d="M7 7l10 10M17 7L7 17"/></svg></button>';
  pill.querySelector('.update-pill-go').addEventListener('click', reloadToUpdate);
  pill.querySelector('.update-pill-x').addEventListener('click', () => {
    pill.classList.add('leaving');
    setTimeout(() => pill.remove(), 200);
  });
  ui.appendChild(pill);
}
