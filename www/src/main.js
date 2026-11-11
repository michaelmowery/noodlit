// App shell: canvas, input, render loop, toolbar. Knows nothing about fog;
// everything visual is delegated to the active fade environment.

import { getEnvironment } from './environments/index.js';

const SPEEDS = [
  { id: 'drift', label: 'Drift', seconds: 45, hint: 'Slow fade · about 45 seconds' },
  { id: 'flow', label: 'Flow', seconds: 20, hint: 'Steady fade · about 20 seconds' },
  { id: 'rush', label: 'Rush', seconds: 8, hint: 'Quick fade · about 8 seconds' },
];
const INTROS = ['let it flow', 'think out loud', 'just start', 'empty your head'];

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
const toast = document.getElementById('toast');

const envDef = getEnvironment(store.get('env', 'shower-door'));
const env = envDef.create();
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

btnClear.querySelector('.label').textContent = envDef.clearLabel;
btnClear.addEventListener('click', () => {
  env.clear();
  wake();
});

// ------------------------------------------------------------------ boot
window.addEventListener('resize', resize);
window.addEventListener('orientationchange', () => setTimeout(resize, 150));
document.addEventListener('visibilitychange', () => { if (!document.hidden) wake(); });

applySpeed(false);
resize();
env.intro?.(INTROS[Math.floor(Math.random() * INTROS.length)]);
wake();

if ('serviceWorker' in navigator && location.protocol === 'https:') {
  navigator.serviceWorker.register('sw.js').catch(() => { /* preview hosts may block this */ });
}
