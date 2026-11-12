// About panel: the wordmark in the top-left corner opens it. Self-contained so the
// shell (main.js) doesn't need to know about it.

// Bump with each release (keep in step with VERSION in sw.js).
export const APP_VERSION = '0.27';

const ui = document.getElementById('ui');
const btn = document.getElementById('btn-about');
const panel = document.getElementById('about');
document.getElementById('about-version').textContent = `Version ${APP_VERSION}`;
document.getElementById('about-year').textContent = String(Math.max(2026, new Date().getFullYear()));

let lastFocus = null;

function open() {
  // Don't stack over the scene menu or an open type box.
  if (ui.classList.contains('choosing') || ui.classList.contains('typing') || ui.classList.contains('welcome-open')) return;
  lastFocus = document.activeElement;
  panel.hidden = false;
  btn.setAttribute('aria-expanded', 'true');
  ui.classList.add('about-open');
  panel.querySelector('.about-close').focus({ preventScroll: true });
}

function close() {
  if (panel.hidden) return;
  panel.hidden = true;
  btn.setAttribute('aria-expanded', 'false');
  ui.classList.remove('about-open');
  if (lastFocus && lastFocus !== document.body) lastFocus.focus?.({ preventScroll: true });
}

btn.addEventListener('click', open);
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
