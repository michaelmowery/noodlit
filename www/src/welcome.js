// "Early preview" welcome note. Shown on the first visit, and again the first time the app
// opens on a new version (APP_VERSION is stamped at deploy). Dismissal is remembered in
// localStorage (if storage is blocked, it simply shows again next time).
// noodlit.previewWelcomeSeen still marks "first visit done" (main.js keys the tour off it);
// noodlit.previewWelcomeVersion is the version the note was last dismissed on.

import { APP_VERSION } from './about.js';

const KEY = 'noodlit.previewWelcomeSeen';
const VERSION_KEY = 'noodlit.previewWelcomeVersion';
const ui = document.getElementById('ui');
const note = document.getElementById('welcome');

function seen() {
  try { return localStorage.getItem(KEY) === '1' && localStorage.getItem(VERSION_KEY) === APP_VERSION; }
  catch { return false; }
}
function remember() {
  try { localStorage.setItem(KEY, '1'); localStorage.setItem(VERSION_KEY, APP_VERSION); } catch { /* private mode */ }
}

function dismiss() {
  if (note.hidden) return;
  remember();
  note.classList.add('leaving');
  ui.classList.remove('welcome-open');
  setTimeout(() => { note.hidden = true; note.classList.remove('leaving'); }, 220);
}

if (!seen()) {
  // A beat after load, so the scene shows first and the note feels like a greeting.
  setTimeout(() => {
    note.hidden = false;
    ui.classList.add('welcome-open');
    note.querySelector('.welcome-ok').focus({ preventScroll: true });
  }, 700);
}

note.addEventListener('click', (e) => { if (e.target.closest('[data-dismiss]')) dismiss(); });

// While it's up, keys belong to the note so nothing reaches "just start typing".
window.addEventListener('keydown', (e) => {
  if (note.hidden) return;
  if (e.key === 'Escape' || e.key === 'Enter') { e.preventDefault(); dismiss(); }
  else if (e.key === 'Tab') { e.preventDefault(); note.querySelector('.welcome-ok').focus(); }
  e.stopImmediatePropagation();
}, true);
