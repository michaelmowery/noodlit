// App shell: canvas, input, render loop, toolbar. Knows nothing about fog;
// everything visual is delegated to the active fade environment.

import { environmentsFor, modeOf, getEnvironment } from './environments/index.js';

const SPEEDS = [
  { id: 'drift', label: 'Drift', seconds: 45, hint: 'Slow fade · about 45 seconds' },
  { id: 'flow', label: 'Flow', seconds: 20, hint: 'Steady fade · about 20 seconds' },
  { id: 'rush', label: 'Rush', seconds: 8, hint: 'Quick fade · about 8 seconds' },
];
// Short prompts written onto the surface: on launch, on surface change, and from the
// prompt button. Keep them brainstorm-flavoured and at most two short lines ("\n").
const INTROS = ['let it flow', 'think out loud', 'just start', 'empty your head'];
const PROMPTS = [
  ...INTROS,
  "what's the\nreal problem?",
  'ten ideas,\nno filter',
  'worst idea\nfirst',
  'flip it',
  'who is\nit for?',
  "what's\nmissing?",
  'make it\nweirder',
  'what if it\nwere free?',
  'smallest\nnext step?',
  'connect two\nthings',
  'what would\nyou cut?',
  'draw the mess',
  'why now?',
  "what's the\nopposite?",
  'say it badly\nfirst',
  "what's stuck?",
  'map it out',
  'what if it\nwere huge?',
];
let lastPrompt = null;
function pickPrompt(pool = PROMPTS) {
  const options = pool.filter((p) => p !== lastPrompt);
  lastPrompt = options[Math.floor(Math.random() * options.length)];
  return lastPrompt;
}

const store = {
  get(k, d) { try { const v = localStorage.getItem('noodlit.' + k); return v == null ? d : JSON.parse(v); } catch { return d; } },
  set(k, v) { try { localStorage.setItem('noodlit.' + k, JSON.stringify(v)); } catch { /* private mode */ } },
};

const canvas = document.getElementById('stage');
const ctx = canvas.getContext('2d', { alpha: false, desynchronized: true });
const ui = document.getElementById('ui');
const btnSpeed = document.getElementById('btn-speed');
const btnHold = document.getElementById('btn-hold');
const btnClear = document.getElementById('btn-clear');
const btnScene = document.getElementById('btn-scene');
const sceneMode = document.getElementById('scene-mode');
const sceneName = document.getElementById('scene-name');
const scenes = document.getElementById('scenes');
const scenesBody = document.getElementById('scenes-body');
const btnPrompt = document.getElementById('btn-prompt');
const btnType = document.getElementById('btn-type');
const compose = document.getElementById('compose');
const input = document.getElementById('compose-input');
const typeSpot = document.getElementById('type-spot');
const clearIcon = document.getElementById('clear-icon');
const defaultClearIcon = clearIcon.getAttribute('d');
const toast = document.getElementById('toast');

let envDef, env;
let speedIndex = Math.max(0, SPEEDS.findIndex((s) => s.id === store.get('speed', 'flow')));
let held = false;

// ------------------------------------------------------------------ sizing
let W = 0, H = 0, dpr = 1;
function resize() {
  const nw = window.innerWidth, nh = window.innerHeight;
  const nd = Math.min(window.devicePixelRatio || 1, 2);
  if (nw === W && nh === H && nd === dpr) return;
  W = nw; H = nh; dpr = nd;
  canvas.width = Math.round(W * dpr);
  canvas.height = Math.round(H * dpr);
  env.resize({ width: W, height: H, dpr });
  if (typing) restampTyping();
  wake();
}

// ------------------------------------------------------------------ loop
let running = false, last = 0;
function frame(t) {
  const dt = Math.min(0.05, Math.max(0, (t - last) / 1000));
  last = t;
  const active = env.update(dt);
  env.render(ctx);
  if (active || pointers.size) requestAnimationFrame(frame);
  else running = false;
}
function wake() {
  if (running) return;
  running = true;
  last = performance.now();
  requestAnimationFrame(frame);
}

// ------------------------------------------------------------------ input
const pointers = new Set();
const info = (e) => ({
  pointerType: e.pointerType,
  pressure: e.pressure || 0.5,
  width: e.width || 0,
  time: e.timeStamp || performance.now(),
});

canvas.addEventListener('pointerdown', (e) => {
  if (e.button > 0) return;
  e.preventDefault();
  if (typing) { moveTyping(e.clientX, e.clientY); return; }
  canvas.setPointerCapture?.(e.pointerId);
  pointers.add(e.pointerId);
  env.strokeStart(e.pointerId, e.clientX, e.clientY, info(e));
  ui.classList.add('drawing');
  wake();
});
canvas.addEventListener('pointermove', (e) => {
  if (!pointers.has(e.pointerId)) return;
  const events = e.getCoalescedEvents ? e.getCoalescedEvents() : [];
  for (const ce of events.length ? events : [e]) env.strokeMove(e.pointerId, ce.clientX, ce.clientY, info(ce));
  wake();
});
const end = (e) => {
  if (!pointers.delete(e.pointerId)) return;
  env.strokeEnd(e.pointerId);
  if (!pointers.size) ui.classList.remove('drawing');
  wake();
};
canvas.addEventListener('pointerup', end);
canvas.addEventListener('pointercancel', end);
canvas.addEventListener('contextmenu', (e) => e.preventDefault());
document.addEventListener('gesturestart', (e) => e.preventDefault());

// ------------------------------------------------------------------ toolbar
let toastTimer;
function showToast(text) {
  toast.textContent = text;
  toast.classList.add('show');
  clearTimeout(toastTimer);
  toastTimer = setTimeout(() => toast.classList.remove('show'), 1800);
}

function applySpeed(announce) {
  const s = SPEEDS[speedIndex];
  env.setFadeSeconds(s.seconds);
  btnSpeed.querySelector('.label').textContent = s.label;
  btnSpeed.setAttribute('aria-label', `Fade speed: ${s.hint}`);
  store.set('speed', s.id);
  if (announce) showToast(s.hint);
}

btnSpeed.addEventListener('click', () => {
  speedIndex = (speedIndex + 1) % SPEEDS.length;
  applySpeed(true);
});

btnHold.addEventListener('click', () => {
  held = !held;
  env.setPaused(held);
  btnHold.setAttribute('aria-pressed', String(held));
  btnHold.querySelector('.label').textContent = held ? 'Holding' : 'Hold';
  showToast(held ? 'Holding this thought' : 'Letting it fade again');
  wake();
});

btnClear.addEventListener('click', () => {
  env.clear();
  recentPrompts = [];
  wake();
});

// Write a fresh prompt onto whatever surface is active, on top of what's already there.
// While earlier prompts are still visible, put the new one in a free band so they don't pile up.
const PROMPT_SLOTS = [undefined, 0.24, 0.62]; // undefined = the environment's own centre
let recentPrompts = []; // { slot, time }
function notePrompt(slot) {
  recentPrompts.push({ slot, time: performance.now() });
}
btnPrompt.addEventListener('click', () => {
  const now = performance.now();
  const visibleFor = SPEEDS[speedIndex].seconds * 1000;
  if (!held) recentPrompts = recentPrompts.filter((r) => now - r.time < visibleFor);
  const busy = new Set(recentPrompts.slice(-2).map((r) => r.slot));
  const slot = PROMPT_SLOTS.find((s) => !busy.has(s));
  env.intro?.(pickPrompt(), { at: slot });
  notePrompt(slot);
  wake();
});

// ------------------------------------------------------------------ typing
// Keyboard entry: words are written onto the surface in its own style as you type. They
// stay at full strength while the keyboard is open (tap the surface to start another line
// somewhere else) and all begin to fade together when you tap Done.
let typing = null; // { x, y } or { at }, plus held: earlier blocks from this session

function spotOpts() {
  return typing.x != null ? { x: typing.x, y: typing.y } : { at: typing.at };
}

function startTyping(seed = '') {
  if (typing) return;
  typing = { at: 0.22, held: [] }; // upper part: the keyboard covers the bottom
  ui.classList.add('typing');
  compose.hidden = false;
  input.value = seed;
  input.focus({ preventScroll: true });
  if (seed) input.setSelectionRange(seed.length, seed.length);
  syncKeyboard();
  updateDraft();
}

function updateDraft() {
  autoGrow();
  env.setDraft(input.value, spotOpts());
  const empty = !input.value.trim();
  typeSpot.classList.toggle('show', empty);
  if (empty) {
    typeSpot.style.left = `${typing.x ?? W / 2}px`;
    typeSpot.style.top = `${typing.y ?? H * typing.at}px`;
  }
  wake();
}

// Tap while typing: start a new block there. What's already written stays put, still crisp.
function moveTyping(x, y) {
  if (input.value.trim()) {
    typing.held.push({ text: input.value, opts: spotOpts() });
    env.nextDraft();
    input.value = '';
  }
  Object.assign(typing, { x, y });
  updateDraft();
  input.focus({ preventScroll: true });
}

function finishTyping() {
  if (!typing) return;
  env.commitDraft();
  typing = null;
  ui.classList.remove('typing');
  compose.hidden = true;
  typeSpot.classList.remove('show');
  input.value = '';
  input.blur();
  wake();
}

// After a resize the environment rebuilds its maps, so write the open blocks again.
function restampTyping() {
  for (const b of typing.held) { env.setDraft(b.text, b.opts); env.nextDraft(); }
  updateDraft();
}

function autoGrow() {
  input.style.height = 'auto';
  input.style.height = `${Math.min(input.scrollHeight, 112)}px`;
}

// Keep the compose bar sitting on top of the on-screen keyboard.
function syncKeyboard() {
  const vv = window.visualViewport;
  if (!vv) return;
  const covered = Math.max(0, window.innerHeight - vv.height - vv.offsetTop);
  compose.style.setProperty('--kb', `${-covered}px`);
}
window.visualViewport?.addEventListener('resize', syncKeyboard);
window.visualViewport?.addEventListener('scroll', syncKeyboard);

btnType.addEventListener('click', () => startTyping());
input.addEventListener('input', updateDraft);
compose.addEventListener('submit', (e) => { e.preventDefault(); finishTyping(); });
input.addEventListener('keydown', (e) => {
  if (e.key === 'Escape' || (e.key === 'Enter' && (e.metaKey || e.ctrlKey))) { e.preventDefault(); finishTyping(); }
});
// With a hardware keyboard, just start typing.
document.addEventListener('keydown', (e) => {
  if (typing || !scenes.hidden || e.ctrlKey || e.metaKey || e.altKey || e.isComposing) return;
  if (e.key.length !== 1 || e.key === ' ' || e.target.closest?.('textarea, input')) return;
  e.preventDefault();
  startTyping(e.key);
});

// ------------------------------------------------------------------ environments
// Swap the active surface live. The shell keeps speed and Hold; the new env starts blank.
function useEnvironment(def, { announce = false } = {}) {
  env?.dispose?.();
  envDef = def;
  env = def.create();
  env.setFadeSeconds(SPEEDS[speedIndex].seconds);
  env.setPaused(held);
  if (W) env.resize({ width: W, height: H, dpr });
  btnClear.querySelector('.label').textContent = def.clearLabel;
  btnClear.setAttribute('aria-label', def.clearLabel);
  clearIcon.setAttribute('d', def.clearIcon || defaultClearIcon);
  canvas.setAttribute('aria-label', def.surface || `${def.name} drawing surface`);
  const mode = modeOf(def);
  sceneMode.textContent = MODES[mode].label;
  sceneName.textContent = def.name;
  btnScene.setAttribute('aria-label', `Scene: ${def.name}, ${MODES[mode].label}. Choose a scene.`);
  // Release surfaces don't fade, so fade speed and Hold have nothing to do there.
  btnSpeed.hidden = btnHold.hidden = mode === 'release';
  store.set('env', def.id);
  if (announce) showToast(def.name);
  wake();
}

function switchTo(def) {
  if (typing) finishTyping();
  useEnvironment(def, { announce: true });
  recentPrompts = [];
  env.intro?.(pickPrompt(INTROS));
  notePrompt(undefined);
  wake();
}

// ------------------------------------------------------------------ scene menu
// One obvious place to pick a scene: a chip in the top corner opens a menu of every
// surface, grouped by family, each with a small live preview of how it looks.
const MODES = {
  fade: { label: 'Fade', hint: 'Disappears on its own' },
  release: { label: 'Release', hint: 'Stays until you let it go' },
};

let lastFocus = null;
function buildScenes() {
  scenesBody.textContent = '';
  for (const mode of Object.keys(MODES)) {
    const group = environmentsFor(mode);
    if (!group.length) continue;
    const section = document.createElement('section');
    section.className = 'scenes-group';
    const head = document.createElement('div');
    head.className = 'scenes-group-head';
    head.innerHTML = `<h3>${MODES[mode].label}</h3><p>${MODES[mode].hint}</p>`;
    const grid = document.createElement('div');
    grid.className = 'scenes-grid';
    for (const def of group) {
      const tile = document.createElement('button');
      tile.type = 'button';
      tile.className = 'scene-tile';
      tile.dataset.id = def.id;
      const thumb = document.createElement('span');
      thumb.className = 'scene-thumb';
      thumb.dataset.id = def.id;
      const name = document.createElement('span');
      name.className = 'scene-name';
      name.textContent = def.name;
      tile.append(thumb, name);
      if (def.blurb) {
        const blurb = document.createElement('span');
        blurb.className = 'scene-blurb';
        blurb.textContent = def.blurb;
        tile.append(blurb);
      }
      tile.addEventListener('click', () => {
        closeScenes();
        if (def !== envDef) switchTo(def);
      });
      grid.append(tile);
    }
    section.append(head, grid);
    scenesBody.append(section);
  }
}

// Previews: run each scene off-screen at a small phone-ish size with a scribble on it.
// Rendered once, the first time the menu opens, so it costs nothing until then.
const THUMB = 360; // CSS px; square, then cropped a little by the tile
const thumbs = new Map();
function renderThumb(def) {
  if (thumbs.has(def.id)) return thumbs.get(def.id);
  const c = document.createElement('canvas');
  c.width = c.height = THUMB;
  try {
    const e = def.create();
    e.setFadeSeconds(600);
    e.resize({ width: THUMB, height: THUMB, dpr: 1 });
    // Release scenes only take ink on their sheet; fade scenes take it anywhere.
    const r = e.rect || { x: THUMB * 0.1, y: THUMB * 0.2, w: THUMB * 0.8, h: THUMB * 0.6 };
    const info = { pointerType: 'touch', pressure: 0.5, width: 0, time: 0 };
    const at = (t) => [r.x + r.w * (0.2 + 0.6 * t), r.y + r.h * (0.55 - 0.18 * Math.sin(t * Math.PI * 2.2))];
    e.strokeStart('t', ...at(0), info);
    for (let i = 1; i <= 40; i++) e.strokeMove('t', ...at(i / 40), { ...info, time: i * 16 });
    e.strokeEnd('t');
    for (let i = 0; i < 4; i++) e.update(0.016);
    e.render(c.getContext('2d'));
    e.dispose?.();
  } catch { /* leave it blank: the name still says what it is */ }
  thumbs.set(def.id, c);
  return c;
}

function syncScenes() {
  for (const tile of scenesBody.querySelectorAll('.scene-tile')) {
    const on = tile.dataset.id === envDef.id;
    tile.setAttribute('aria-current', on ? 'true' : 'false');
  }
}

function openScenes() {
  if (typing) finishTyping();
  if (!scenesBody.childElementCount) buildScenes();
  syncScenes();
  scenes.hidden = false;
  btnScene.setAttribute('aria-expanded', 'true');
  ui.classList.add('choosing');
  lastFocus = document.activeElement;
  (scenesBody.querySelector('[aria-current="true"]') || scenesBody.querySelector('button'))?.focus({ preventScroll: true });
  // Fill in the previews just after the menu shows, so opening it never stutters.
  requestAnimationFrame(() => {
    for (const slot of scenesBody.querySelectorAll('.scene-thumb:empty')) {
      const def = getEnvironment(slot.dataset.id);
      slot.append(renderThumb(def));
    }
  });
}

function closeScenes() {
  if (scenes.hidden) return;
  scenes.hidden = true;
  btnScene.setAttribute('aria-expanded', 'false');
  ui.classList.remove('choosing');
  if (lastFocus && lastFocus !== document.body) lastFocus.focus?.({ preventScroll: true });
}

btnScene.addEventListener('click', () => (scenes.hidden ? openScenes() : closeScenes()));
for (const el of scenes.querySelectorAll('[data-close]')) el.addEventListener('click', closeScenes);
document.addEventListener('keydown', (e) => {
  if (e.key === 'Escape' && !scenes.hidden) { e.preventDefault(); closeScenes(); }
}, true);

// ------------------------------------------------------------------ boot
window.addEventListener('resize', resize);
window.addEventListener('orientationchange', () => setTimeout(resize, 150));
document.addEventListener('visibilitychange', () => { if (!document.hidden) wake(); });

useEnvironment(getEnvironment(store.get('env', 'shower-door')));
applySpeed(false);
resize();
env.intro?.(pickPrompt(INTROS));
notePrompt(undefined);
wake();

if ('serviceWorker' in navigator && location.protocol === 'https:') {
  navigator.serviceWorker.register('sw.js').catch(() => { /* preview hosts may block this */ });
}
