// What's new: the release notes panel (opened from About), plus the helpers the
// "New version released" note uses to list what changed since you last looked.
// Notes live in releases.js. "Seen" is the date of the newest entry you've been shown, kept in
// localStorage, so the update note only lists entries newer than that.

import { RELEASES } from './releases.js';

const SEEN_KEY = 'noodlit.notesSeen';
const newest = RELEASES[0]?.date || '';

function readSeen() { try { return localStorage.getItem(SEEN_KEY); } catch { return null; } }
export function markNotesSeen() { try { localStorage.setItem(SEEN_KEY, newest); } catch { /* private mode */ } }

// Entries you haven't been shown yet. Someone who updated from before release notes existed
// has no record, so they get just the newest entry rather than the whole history.
export function unseenReleases() {
  const seen = readSeen();
  if (!seen) return RELEASES.slice(0, 1);
  return RELEASES.filter((r) => r.date > seen);
}

export function formatDate(iso) {
  const [y, m, d] = iso.split('-').map(Number);
  return new Date(y, m - 1, d).toLocaleDateString(undefined, { year: 'numeric', month: 'long', day: 'numeric' });
}

// One <li> per item: a bold headline and its detail, or just text.
export function itemEl(item) {
  const li = document.createElement('li');
  if (Array.isArray(item)) {
    const b = document.createElement('strong');
    b.textContent = item[0];
    li.append(b, document.createTextNode(item[1]));
  } else li.textContent = item;
  return li;
}

// ------------------------------------------------------------------ panel
const ui = document.getElementById('ui');
const panel = document.getElementById('notes');
const list = document.getElementById('notes-list');
let lastFocus = null;

function render() {
  const fresh = new Set(unseenReleases().map((r) => r.date));
  const hadSeen = readSeen() !== null;
  list.replaceChildren(...RELEASES.map((r) => {
    const sec = document.createElement('section');
    sec.className = 'notes-entry';
    const head = document.createElement('h3');
    const time = document.createElement('time');
    time.dateTime = r.date;
    time.textContent = formatDate(r.date);
    head.append(time);
    if (hadSeen && fresh.has(r.date)) {
      const tag = document.createElement('span');
      tag.className = 'notes-new';
      tag.textContent = 'New';
      head.append(tag);
    }
    sec.append(head);
    if (r.title) {
      const t = document.createElement('p');
      t.className = 'notes-title';
      t.textContent = r.title;
      sec.append(t);
    }
    const ul = document.createElement('ul');
    ul.append(...r.items.map(itemEl));
    sec.append(ul);
    return sec;
  }));
}

function open() {
  if (ui.classList.contains('choosing') || ui.classList.contains('typing')) return;
  lastFocus = document.activeElement;
  render();
  markNotesSeen();
  panel.hidden = false;
  ui.classList.add('notes-open');
  panel.querySelector('.about-panel').scrollTop = 0;
  panel.querySelector('.about-close').focus({ preventScroll: true });
}

function close() {
  if (panel.hidden) return;
  panel.hidden = true;
  ui.classList.remove('notes-open');
  if (lastFocus && lastFocus !== document.body) lastFocus.focus?.({ preventScroll: true });
}

window.addEventListener('noodlit:open-notes', open);
panel.addEventListener('click', (e) => { if (e.target.closest('[data-close]')) close(); });

// While open, keys belong to the panel (same as About): Escape closes, Tab stays inside.
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
