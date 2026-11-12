// "Early preview" welcome note. Shown on the first visit, and again the first time the app
// opens on a new version (APP_VERSION is stamped at deploy) unless the "Note after updates"
// preference is off. The update version adds a "new version" line and a pointer to that
// preference. Dismissal is remembered in localStorage (if storage is blocked, it simply
// shows again next time).
// noodlit.previewWelcomeSeen still marks "first visit done" (main.js keys the tour off it);
// noodlit.previewWelcomeVersion is the version the note was last dismissed on.

import { APP_VERSION } from './about.js';
import { prefs } from './prefs.js';

const KEY = 'noodlit.previewWelcomeSeen';
const VERSION_KEY = 'noodlit.previewWelcomeVersion';
const ui = document.getElementById('ui');
const note = document.getElementById('welcome');

function read(k) { try { return localStorage.getItem(k); } catch { return null; } }
function remember() {
  try { localStorage.setItem(KEY, '1'); localStorage.setItem(VERSION_KEY, APP_VERSION); } catch { /* private mode */ }
}

function dismiss(then) {
  if (note.hidden) return;
  remember();
  note.classList.add('leaving');
  ui.classList.remove('welcome-open');
  setTimeout(() => { note.hidden = true; note.classList.remove('leaving'); then?.(); }, 220);
}

const firstVisit = read(KEY) !== '1';
const newVersion = !firstVisit && read(VERSION_KEY) !== APP_VERSION;

if (newVersion && !prefs.get('updateNote')) {
  remember(); // turned off: note the version quietly so switching it back on doesn't pop it up
} else if (firstVisit || newVersion) {
  if (newVersion) {
    document.getElementById('welcome-title').textContent = 'New version released';
    const line = document.getElementById('welcome-update');
    line.textContent = APP_VERSION === 'dev'
      ? 'Noodlit has been updated.'
      : `Noodlit has been updated to version ${APP_VERSION}.`;
    line.hidden = false;
    document.getElementById('welcome-optout').hidden = false;
    note.setAttribute('aria-describedby', 'welcome-update welcome-body');
  }
  // A beat after load, so the scene shows first and the note feels like a greeting.
  setTimeout(() => {
    note.hidden = false;
    ui.classList.add('welcome-open');
    note.querySelector('.welcome-ok').focus({ preventScroll: true });
  }, 700);
}

note.addEventListener('click', (e) => {
  if (e.target.closest('[data-dismiss]')) dismiss();
  // "Show me everything": close the note, then the shell (main.js) runs the full tour.
  else if (e.target.closest('[data-tour]')) dismiss(() => window.dispatchEvent(new Event('noodlit:tour')));
  else if (e.target.closest('[data-open-prefs]')) {
    dismiss(() => window.dispatchEvent(new Event('noodlit:open-prefs')));
  }
});

// While it's up, keys belong to the note so nothing reaches "just start typing".
window.addEventListener('keydown', (e) => {
  if (note.hidden) return;
  if (e.key === 'Enter' && note.contains(document.activeElement) && document.activeElement.matches('button')) { e.preventDefault(); document.activeElement.click(); }
  else if (e.key === 'Escape' || e.key === 'Enter') { e.preventDefault(); dismiss(); }
  else if (e.key === 'Tab') {
    // Cycle between the visible buttons (Got it, Show me everything, and Preferences when shown).
    e.preventDefault();
    const items = [...note.querySelectorAll('button')].filter((b) => b.offsetParent);
    const i = items.indexOf(document.activeElement);
    items[(i + (e.shiftKey ? items.length - 1 : 1)) % items.length]?.focus();
  }
  e.stopImmediatePropagation();
}, true);
