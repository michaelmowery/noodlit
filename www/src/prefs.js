// Preferences: a small panel (opened from About) for how Noodlit starts up and behaves.
// Everything is kept in localStorage on this device under "noodlit.prefs", except sound,
// which keeps its own "noodlit.sound" key so the speaker button and this panel agree.
// The shell (main.js) reads prefs.get() and listens for "noodlit:prefs" to apply changes live.

import { environmentsFor } from './environments/index.js';

const KEY = 'noodlit.prefs';
export const DEFAULTS = {
  autoDemo: true,       // run Show me by itself the first time each scene opens
  startScene: 'last',   // 'last' (where you left off) or a scene id
  speed: 'last',        // 'last' (whatever you set) or 'drift' | 'flow' | 'rush' at every launch
  brush: 'last',        // 'last' (remembered per scene) or 'fine' | 'regular' | 'bold'
  prompts: true,        // show the lightbulb prompt button in the tray
  updateNote: true,     // show the early preview note again after each new version
};
export const SPEED_PRESETS = { drift: 45, flow: 20, rush: 8 };

function load() {
  try { return { ...DEFAULTS, ...JSON.parse(localStorage.getItem(KEY) || '{}') }; } catch { return { ...DEFAULTS }; }
}
let values = load();

function readSound() {
  try { return localStorage.getItem('noodlit.sound') !== 'false'; } catch { return true; }
}

export const prefs = {
  get: (k) => values[k],
  set(k, v) {
    values[k] = v;
    try { localStorage.setItem(KEY, JSON.stringify(values)); } catch { /* private mode */ }
    window.dispatchEvent(new CustomEvent('noodlit:prefs', { detail: { key: k, value: v } }));
  },
};

// ------------------------------------------------------------------ panel
const ui = document.getElementById('ui');
const panel = document.getElementById('prefs');
const form = document.getElementById('prefs-form');
const sceneSelect = document.getElementById('pref-start-scene');
let lastFocus = null;

function fillScenes() {
  if (sceneSelect.options.length > 1) return;
  for (const [mode, label] of [['fade', 'Fade'], ['release', 'Release']]) {
    const group = document.createElement('optgroup');
    group.label = label;
    for (const def of environmentsFor(mode)) group.append(new Option(def.name, def.id));
    sceneSelect.append(group);
  }
}

function sync() {
  fillScenes();
  form.elements.autoDemo.checked = !!values.autoDemo;
  form.elements.sound.checked = readSound();
  form.elements.prompts.checked = !!values.prompts;
  form.elements.updateNote.checked = !!values.updateNote;
  form.elements.startScene.value = values.startScene;
  if (form.elements.startScene.value !== values.startScene) form.elements.startScene.value = 'last';
  form.elements.speed.value = values.speed;
  form.elements.brush.value = values.brush;
}

form.addEventListener('change', (e) => {
  const el = e.target;
  if (el.name === 'sound') {
    window.dispatchEvent(new CustomEvent('noodlit:prefs', { detail: { key: 'sound', value: el.checked } }));
    return;
  }
  if (!(el.name in DEFAULTS)) return;
  prefs.set(el.name, el.type === 'checkbox' ? el.checked : el.value);
});
form.addEventListener('submit', (e) => e.preventDefault());

// Forget which scenes have had their first-visit demo, so each one shows itself again.
const replay = document.getElementById('pref-replay-demos');
const replayStatus = document.getElementById('pref-replay-status');
replay.addEventListener('click', () => {
  try {
    for (let i = localStorage.length - 1; i >= 0; i--) {
      const k = localStorage.key(i);
      if (k && k.startsWith('noodlit.demoSeen.')) localStorage.removeItem(k);
    }
  } catch { /* private mode */ }
  replayStatus.textContent = 'Done. Each scene will show itself again next time you open it.';
});

function open() {
  if (ui.classList.contains('choosing') || ui.classList.contains('typing')) return;
  lastFocus = document.activeElement;
  sync();
  replayStatus.textContent = '';
  panel.hidden = false;
  ui.classList.add('prefs-open');
  panel.querySelector('.about-close').focus({ preventScroll: true });
}

function close() {
  if (panel.hidden) return;
  panel.hidden = true;
  ui.classList.remove('prefs-open');
  if (lastFocus && lastFocus !== document.body) lastFocus.focus?.({ preventScroll: true });
}

window.addEventListener('noodlit:open-prefs', open);
panel.addEventListener('click', (e) => { if (e.target.closest('[data-close]')) close(); });

// While open, keys belong to the panel (same as About): Escape closes, Tab stays inside.
window.addEventListener('keydown', (e) => {
  if (panel.hidden) return;
  if (e.key === 'Escape') { e.preventDefault(); close(); }
  else if (e.key === 'Tab') {
    const items = [...panel.querySelectorAll('button, input, select')];
    const first = items[0], last = items[items.length - 1];
    if (e.shiftKey && document.activeElement === first) { e.preventDefault(); last.focus(); }
    else if (!e.shiftKey && document.activeElement === last) { e.preventDefault(); first.focus(); }
  }
  e.stopImmediatePropagation();
}, true);
