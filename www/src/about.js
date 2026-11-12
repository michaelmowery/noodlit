// About panel: the ⓘ button in the toolbar tray opens it (the wordmark does too). Self-contained so the
// shell (main.js) doesn't need to know about it.

import { checkForUpdates, updatesSupported, updateReady, reloadToUpdate } from './update.js';

// Bump with each release (keep in step with VERSION in sw.js).
export const APP_VERSION = '0.29';

const ui = document.getElementById('ui');
const btns = [document.getElementById('btn-info'), document.getElementById('btn-about')];
const panel = document.getElementById('about');
document.getElementById('about-version').textContent = `Version ${APP_VERSION}`;
document.getElementById('about-year').textContent = String(Math.max(2026, new Date().getFullYear()));

let lastFocus = null;

// Check for updates: asks the service worker for a newer version, installs it, reloads.
const updBtn = document.getElementById('about-update-btn');
const updStatus = document.getElementById('about-update-status');
let checking = false;

function setUpdateUi(label, status, busy = false) {
  updBtn.textContent = label;
  updBtn.classList.toggle('busy', busy);
  updBtn.setAttribute('aria-busy', String(busy));
  updStatus.textContent = status;
}

function resetUpdateUi() {
  if (checking) return;
  if (updateReady()) setUpdateUi('Refresh to update', 'A new version is ready.');
  else setUpdateUi('Check for updates', '');
}

updBtn.addEventListener('click', async () => {
  if (checking) return;
  if (updateReady()) { setUpdateUi('Updating…', '', true); reloadToUpdate(); return; }
  if (!updatesSupported) { setUpdateUi('Check for updates', `You're on version ${APP_VERSION}. Updates arrive when you reload.`); return; }
  checking = true;
  setUpdateUi('Checking…', '', true);
  // Keep the spinner up a moment even on a fast network, so the check feels real.
  const [result] = await Promise.all([checkForUpdates(), new Promise((r) => setTimeout(r, 700))]);
  checking = false;
  if (result === 'ready') { setUpdateUi('Updating…', 'Found a new version. Reloading…', true); setTimeout(reloadToUpdate, 500); }
  else if (result === 'current') setUpdateUi('Check for updates', `You're up to date (${APP_VERSION}).`);
  else if (result === 'offline') setUpdateUi('Try again', "Couldn't reach noodlit.app. Are you offline?");
  else setUpdateUi('Check for updates', `You're on version ${APP_VERSION}. Updates arrive when you reload.`);
});

function open() {
  // Don't stack over the scene menu or an open type box.
  if (ui.classList.contains('choosing') || ui.classList.contains('typing') || ui.classList.contains('welcome-open')) return;
  lastFocus = document.activeElement;
  resetUpdateUi();
  panel.hidden = false;
  btns.forEach((b) => b.setAttribute('aria-expanded', 'true'));
  ui.classList.add('about-open');
  panel.querySelector('.about-close').focus({ preventScroll: true });
}

function close() {
  if (panel.hidden) return;
  panel.hidden = true;
  btns.forEach((b) => b.setAttribute('aria-expanded', 'false'));
  ui.classList.remove('about-open');
  if (lastFocus && lastFocus !== document.body) lastFocus.focus?.({ preventScroll: true });
}

btns.forEach((b) => b.addEventListener('click', open));
panel.addEventListener('click', (e) => { if (e.target.closest('[data-close]')) close(); });

// While open, keys belong to the panel: Escape closes, Tab stays inside, and nothing
// leaks through to the shell's "just start typing" shortcut.
window.addEventListener('keydown', (e) => {
  if (panel.hidden) return;
  if (e.key === 'Escape') { e.preventDefault(); close(); }
  else if (e.key === 'Tab') {
    const items = [...panel.querySelectorAll('button, a[href]')];
    const first = items[0], last = items[items.length - 1];
    if (e.shiftKey && document.activeElement === first) { e.preventDefault(); last.focus(); }
    else if (!e.shiftKey && document.activeElement === last) { e.preventDefault(); first.focus(); }
  }
  e.stopImmediatePropagation();
}, true);
