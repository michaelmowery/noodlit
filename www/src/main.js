// App shell: canvas, input, render loop, toolbar. Knows nothing about fog;
// everything visual is delegated to the active fade environment.

import { environmentsFor, modeOf, getEnvironment, isPlus } from './environments/index.js';
import { sfx } from './lib/sound.js';
import { brushesFor, brushRadius, defaultBrush } from './lib/brushes.js';
import { createDemo } from './demo.js';

// Fade speed is a continuous slider from a quick 5 s to a lingering 60 s. The slider runs on a
// log scale so the quick end (where a few seconds matter) gets as much travel as the slow end.
// Slider left = slow (Drift), right = fast (Rush). The old three presets survive as zone names.
const FADE_MIN = 5, FADE_MAX = 60, FADE_DEFAULT = 20;
const LEGACY_SPEEDS = { drift: 45, flow: 20, rush: 8 };
const clamp = (v, lo, hi) => Math.min(hi, Math.max(lo, v));
const clampFade = (s) => Math.min(FADE_MAX, Math.max(FADE_MIN, Math.round(s)));
const sliderToSeconds = (v) => clampFade(FADE_MAX * Math.pow(FADE_MIN / FADE_MAX, v / 100));
const secondsToSlider = (s) => Math.round((100 * Math.log(s / FADE_MAX)) / Math.log(FADE_MIN / FADE_MAX));
function speedZone(s) {
  if (s <= 12) return { label: 'Rush', word: 'Quick fade' };
  if (s < 32) return { label: 'Flow', word: 'Steady fade' };
  return { label: 'Drift', word: 'Slow fade' };
}
function loadFadeSeconds() {
  const saved = store.get('fadeSeconds', null);
  if (typeof saved === 'number' && isFinite(saved)) return clampFade(saved);
  return LEGACY_SPEEDS[store.get('speed', 'flow')] ?? FADE_DEFAULT; // carry over the old preset
}
// Prompts from the lightbulb button, shown in a bubble that floats above the surface.
// Keep them brainstorm-flavoured and at most two short lines ("\n").
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
const speedPop = document.getElementById('speed-pop');
const speedRange = document.getElementById('speed-range');
const speedValue = document.getElementById('speed-value');
const btnHold = document.getElementById('btn-hold');
const btnClear = document.getElementById('btn-clear');
const btnUndo = document.getElementById('btn-undo');
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
const btnSound = document.getElementById('btn-sound');
const btnDemo = document.getElementById('btn-demo');
const demoFinger = document.getElementById('demo-finger');
const btnInk = document.getElementById('btn-ink');
const inkPop = document.getElementById('ink-pop');
const inkSwatches = document.getElementById('ink-swatches');
const inkValue = document.getElementById('ink-value');
const inkSection = document.getElementById('ink-section');
const brushOptions = document.getElementById('brush-options');
const brushValue = document.getElementById('brush-value');
const tipOptions = document.getElementById('tip-options');
const tipValue = document.getElementById('tip-value');

let envDef, env;
let fadeSeconds = loadFadeSeconds();
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
  syncUndo();
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
const lastPos = new Map();
// Which way each finger is travelling, for flat brush tips (thick one way, thin the other).
const tipPos = new Map();
function heading(id, e) {
  const t = tipPos.get(id);
  if (!t) { tipPos.set(id, { x: e.clientX, y: e.clientY, angle: null }); return null; }
  const dx = e.clientX - t.x, dy = e.clientY - t.y;
  if (dx * dx + dy * dy > 6) Object.assign(t, { x: e.clientX, y: e.clientY, angle: Math.atan2(dy, dx) });
  return t.angle;
} // pointerId -> { x, y, t }, for how fast the finger moves (drawing sound)
const info = (e) => ({
  pointerType: e.pointerType,
  pressure: e.pressure || 0.5,
  width: e.width || 0,
  time: e.timeStamp || performance.now(),
});

canvas.addEventListener('pointerdown', (e) => {
  if (e.button > 0) return;
  e.preventDefault();
  sfx.unlock();
  if (typing) { typingPointerDown(e); return; }
  canvas.setPointerCapture?.(e.pointerId);
  if (!pointers.size) tap = { t: e.timeStamp, count: 0, moved: false, late: false, pushes: env.undoCount?.() ?? 0, at: new Map() };
  if (tap) {
    tap.count++;
    tap.at.set(e.pointerId, { x: e.clientX, y: e.clientY });
    if (e.timeStamp - tap.t > TAP_SPREAD) tap.late = true;
  }
  pointers.add(e.pointerId);
  lastPos.set(e.pointerId, { x: e.clientX, y: e.clientY, t: e.timeStamp });
  closeSpeed();
  closeInk();
  env.strokeStart(e.pointerId, e.clientX, e.clientY, info(e));
  ui.classList.add('drawing');
  wake();
});
canvas.addEventListener('pointermove', (e) => {
  if (placing?.id === e.pointerId) { typingPointerMove(e); return; }
  if (!pointers.has(e.pointerId)) return;
  const at = tap?.at.get(e.pointerId);
  if (at && Math.hypot(e.clientX - at.x, e.clientY - at.y) > TAP_SLOP) tap.moved = true;
  const events = e.getCoalescedEvents ? e.getCoalescedEvents() : [];
  for (const ce of events.length ? events : [e]) env.strokeMove(e.pointerId, ce.clientX, ce.clientY, { ...info(ce), angle: heading(e.pointerId, ce) });
  const lp = lastPos.get(e.pointerId);
  const dt = (e.timeStamp - lp.t) / 1000;
  if (dt > 0.008) {
    const speed = Math.hypot(e.clientX - lp.x, e.clientY - lp.y) / dt;
    lp.speed = lp.speed == null ? speed : lp.speed * 0.6 + speed * 0.4;
    Object.assign(lp, { x: e.clientX, y: e.clientY, t: e.timeStamp });
    sfx.stroke(lp.speed);
  }
  wake();
});
const end = (e) => {
  if (placing?.id === e.pointerId) { typingPointerUp(e); return; }
  if (!pointers.delete(e.pointerId)) return;
  lastPos.delete(e.pointerId);
  tipPos.delete(e.pointerId);
  if (!pointers.size) sfx.strokeEnd();
  env.strokeEnd(e.pointerId);
  if (!pointers.size) ui.classList.remove('drawing');
  if (!pointers.size && tap) {
    const g = tap;
    tap = null;
    if (g.count === 2 && !g.moved && !g.late && e.timeStamp - g.t < TAP_TIME) twoFingerUndo(g);
  }
  wake();
};
canvas.addEventListener('pointerup', end);
canvas.addEventListener('pointercancel', end);
canvas.addEventListener('contextmenu', (e) => e.preventDefault());
document.addEventListener('gesturestart', (e) => e.preventDefault());

// ------------------------------------------------------------------ toolbar
let toastTimer;
function showToast(text, ms = 1800) {
  toast.textContent = text;
  toast.classList.add('show');
  clearTimeout(toastTimer);
  toastTimer = setTimeout(() => toast.classList.remove('show'), ms);
}

// ------------------------------------------------------------------ show me
// A ghost finger draws a doodle on the current scene, then the scene fades or releases it.
const demo = createDemo({
  env: () => env,
  mode: () => modeOf(envDef),
  size: () => ({ W, H }),
  wake: () => wake(),
  fadeSeconds: () => fadeSeconds,
  held: () => held,
  say: showToast,
  sfx,
  // The settings the demo shows off, only where this scene has them. It really picks a brush
  // and a fade speed, so the drawing matches; restore() puts the user's own choices back.
  brush: () => !btnInk.hidden && brushesFor(envDef)?.length && {
    button: btnInk, pop: inkPop, open: openInk, close: closeInk,
    option: () => {
      const list = brushesFor(envDef), want = defaultBrush(list);
      return brushOptions.children[list.indexOf(want)] || brushOptions.firstElementChild;
    },
  },
  speed: () => !btnSpeed.hidden && {
    button: btnSpeed, pop: speedPop, open: openSpeed, close: closeSpeed,
    set(v) { speedRange.value = String(v); speedRange.dispatchEvent(new Event('input')); },
    get: () => Number(speedRange.value),
  },
  typeButton: btnType,
  // A random lightbulb prompt, typed in quotes under "Noodlit" (line breaks become spaces).
  prompt: () => pickPrompt().replace(/\n/g, ' '),
  snapshot: () => ({ id: envDef.id, brush: store.get('brush.' + envDef.id, null), fade: fadeSeconds }),
  restore(snap) {
    if (snap.id !== envDef.id) return;
    store.set('brush.' + snap.id, snap.brush);
    fadeSeconds = snap.fade;
    store.set('fadeSeconds', fadeSeconds);
    applySpeed();
    applyInk();
  },
  onPeek: (on) => ui.classList.toggle('demo-peek', on),
  onChange(on) {
    ui.classList.toggle('demoing', on);
    syncUndo();
    btnDemo.setAttribute('aria-pressed', String(on));
    btnDemo.querySelector('.label').textContent = on ? 'Stop' : 'Show me';
    btnDemo.setAttribute('aria-label', on ? 'Stop the demo' : 'Show me how this scene works');
  },
}, demoFinger);
btnDemo.addEventListener('click', () => {
  if (demo.running) { demo.stop(); return; }
  if (typing) finishTyping();
  closeSpeed();
  closeInk();
  popBubble({ quiet: true });
  cancelAutoDemo();
  store.set('demoSeen.' + envDef.id, true);
  demo.start();
});
// Any touch, click or key takes the surface back (the Stop button handles itself).
for (const type of ['pointerdown', 'keydown']) {
  document.addEventListener(type, (e) => {
    if (demo.running && !btnDemo.contains(e.target)) demo.stop(e);
    // Touching anything before a first-visit demo starts calls it off (it'll offer again next visit).
    if (autoDemo.timer && !welcomeNote.contains(e.target)) cancelAutoDemo();
  }, true);
}

// The first time someone opens a scene, Show me runs on its own once (remembered per scene).
// It waits for the welcome note to be dismissed and gives the scene a beat to appear first.
const welcomeNote = document.getElementById('welcome');
const autoDemo = { timer: 0, id: null };
function cancelAutoDemo() { clearTimeout(autoDemo.timer); autoDemo.timer = 0; autoDemo.id = null; }
function scheduleAutoDemo(def) {
  cancelAutoDemo();
  if (store.get('demoSeen.' + def.id, false)) return;
  autoDemo.id = def.id;
  const fire = () => {
    autoDemo.timer = 0;
    if (autoDemo.id !== envDef.id) return;
    if (!welcomeNote.hidden) { autoDemo.timer = setTimeout(fire, 700); return; } // after the note
    if (demo.running || typing) return;
    autoDemo.id = null;
    store.set('demoSeen.' + envDef.id, true);
    demo.start();
  };
  autoDemo.timer = setTimeout(fire, 900);
}

function applySpeed() {
  const z = speedZone(fadeSeconds);
  env.setFadeSeconds(fadeSeconds);
  btnSpeed.querySelector('.label').textContent = z.label;
  btnSpeed.setAttribute('aria-label', `Fade speed: ${z.word}, about ${fadeSeconds} seconds`);
  speedRange.value = String(secondsToSlider(fadeSeconds));
  speedRange.setAttribute('aria-valuetext', `${z.label}, about ${fadeSeconds} seconds`);
  speedValue.textContent = `${z.label} · ${fadeSeconds}s`;
}

// Tap the speed button for a small slider just above the toolbar. Changes apply live,
// so you can watch the surface speed up or slow down while you drag.
function openSpeed() {
  if (typing) finishTyping();
  closeInk();
  popBubble({ quiet: true });
  speedPop.hidden = false;
  btnSpeed.setAttribute('aria-expanded', 'true');
  speedRange.focus({ preventScroll: true });
}
function closeSpeed() {
  if (speedPop.hidden) return;
  speedPop.hidden = true;
  btnSpeed.setAttribute('aria-expanded', 'false');
  store.set('fadeSeconds', fadeSeconds);
}
btnSpeed.addEventListener('click', () => (speedPop.hidden ? openSpeed() : closeSpeed()));
speedRange.addEventListener('input', () => {
  fadeSeconds = sliderToSeconds(Number(speedRange.value));
  applySpeed();
  store.set('fadeSeconds', fadeSeconds);
  wake();
});
document.addEventListener('pointerdown', (e) => {
  if (!speedPop.hidden && !speedPop.contains(e.target) && !btnSpeed.contains(e.target)) closeSpeed();
}, true);
document.addEventListener('keydown', (e) => {
  if (e.key === 'Escape' && !speedPop.hidden) { e.preventDefault(); closeSpeed(); btnSpeed.focus({ preventScroll: true }); }
}, true);

// ------------------------------------------------------------------ brush and ink
// One button opens a small panel: a few brushes that suit the surface (a fingertip, a
// fingernail or the side of your hand on fogged glass; a quill or a broad nib on parchment),
// and on scenes with a palette, inks that suit the material. Both are remembered per scene
// and apply to new strokes; what's already drawn keeps its look.
function inkFor(def) {
  const pal = def.palette;
  if (!pal?.length) return null;
  const saved = store.get('ink.' + def.id, null);
  return pal.find((p) => p.color === saved) || pal[0];
}
// Tip shape works with any brush: round (the usual), or flat like a chisel marker or a
// calligraphy nib held at 45°, so the line swells and thins as it changes direction.
const TIPS = [{ id: 'round', name: 'Round' }, { id: 'flat', name: 'Flat' }];
function tipFor(def) {
  const saved = store.get('tip.' + def.id, 'round');
  return TIPS.find((t) => t.id === saved) || TIPS[0];
}
function brushFor(def) {
  const list = brushesFor(def);
  if (!list?.length) return null;
  const saved = store.get('brush.' + def.id, null);
  return list.find((b) => b.name === saved) || defaultBrush(list);
}

// Every scene answers radiusFor(info, speed); route it through the chosen brush.
function fitBrush(e) {
  if (!e.radiusFor || e.radiusFor.brushed) return;
  const base = e.radiusFor.bind(e);
  e.radiusFor = (info, speed = 0) => brushRadius(base, info, speed, e.brushType);
  e.radiusFor.brushed = true;
}

// A little squiggle drawn the way the brush draws: thickness from its size, broken for dry.
const SQUIGGLE = 'M5 26c5-2 7-12 12-12s4 8 9 8 6-12 9-16';
function brushIcon(b) {
  const w = Math.max(1.4, Math.min(9, 3.4 * b.size));
  let marks = `<path d="${SQUIGGLE}" stroke="currentColor" stroke-width="${w}"/>`;
  if (b.dry) {
    // Bristle streaks with gaps, like the stroke it leaves.
    const dashes = ['7 3 12 4', '12 5 4 3', '4 3 9 2', '9 4 6 5'];
    marks = dashes.map((d, i) => `<path d="${SQUIGGLE}" transform="translate(${(i - 1.5) * 1.6} ${(i - 1.5) * 2.2})" stroke="currentColor" stroke-width="1.7" stroke-dasharray="${d}"/>`).join('');
  }
  return `<svg viewBox="0 0 40 32" aria-hidden="true">${marks}</svg>`;
}

function tipIcon(id) {
  const mark = id === 'flat'
    ? '<rect x="9" y="12.5" width="22" height="7" rx="1.5" transform="rotate(-45 20 16)" fill="currentColor"/>'
    : '<circle cx="20" cy="16" r="7" fill="currentColor"/>';
  return `<svg viewBox="0 0 40 32" aria-hidden="true">${mark}</svg>`;
}

function applyInk() {
  const pal = envDef.palette;
  const brushes = brushesFor(envDef);
  const hasInk = !!pal?.length && !!env.setInk;
  btnInk.hidden = !hasInk && !brushes?.length;
  if (btnInk.hidden) { closeInk(); return; }
  const cur = hasInk ? inkFor(envDef) : null;
  if (cur) env.setInk(cur.color);
  const brush = brushFor(envDef);
  const tip = tipFor(envDef);
  env.brushType = brush && { ...brush, shape: tip.id };
  fitBrush(env);
  btnInk.style.setProperty('--ink-color', cur ? cur.color : 'transparent');
  btnInk.classList.toggle('has-ink', !!cur);
  btnInk.style.setProperty('--brush-w', String(Math.max(1.6, Math.min(4.2, 2.2 * (brush?.size || 1)))));
  btnInk.classList.toggle('dry', !!brush?.dry);
  btnInk.setAttribute('aria-label', [brush && `Brush: ${brush.name}`, cur && `ink: ${cur.name}`].filter(Boolean).join(', '));

  brushValue.textContent = brush ? brush.name : '';
  brushOptions.textContent = '';
  for (const b of brushes || []) {
    const btn = document.createElement('button');
    btn.type = 'button';
    btn.className = 'brush-option';
    btn.setAttribute('role', 'radio');
    btn.setAttribute('aria-checked', String(b === brush));
    btn.innerHTML = `${brushIcon(b)}<span>${b.name}</span>`;
    btn.addEventListener('click', () => {
      store.set('brush.' + envDef.id, b.name);
      applyInk();
      sfx.unlock();
    });
    brushOptions.append(btn);
  }

  tipOptions.textContent = '';
  tipValue.textContent = tip.name;
  for (const t of TIPS) {
    const btn = document.createElement('button');
    btn.type = 'button';
    btn.className = 'tip-option';
    btn.setAttribute('role', 'radio');
    btn.setAttribute('aria-checked', String(t === tip));
    btn.innerHTML = `${tipIcon(t.id)}<span>${t.name}</span>`;
    btn.addEventListener('click', () => {
      store.set('tip.' + envDef.id, t.id);
      applyInk();
      sfx.unlock();
    });
    tipOptions.append(btn);
  }

  inkSection.hidden = !hasInk;
  inkSwatches.textContent = '';
  if (!hasInk) return;
  inkValue.textContent = cur.name;
  for (const p of pal) {
    const b = document.createElement('button');
    b.type = 'button';
    b.className = 'ink-swatch';
    b.setAttribute('role', 'radio');
    b.setAttribute('aria-checked', String(p === cur));
    b.setAttribute('aria-label', p.name);
    b.title = p.name;
    b.style.setProperty('--ink-color', p.color);
    b.addEventListener('click', () => {
      store.set('ink.' + envDef.id, p.color);
      applyInk();
      sfx.unlock();
      // Picking a colour usually means "now draw with it", so get out of the way.
      setTimeout(closeInk, 160);
    });
    inkSwatches.append(b);
  }
}

function openInk() {
  if (typing) finishTyping();
  closeSpeed();
  popBubble({ quiet: true });
  inkPop.hidden = false;
  btnInk.setAttribute('aria-expanded', 'true');
  (brushOptions.querySelector('[aria-checked="true"]') || inkSwatches.querySelector('[aria-checked="true"]'))?.focus({ preventScroll: true });
}
function closeInk() {
  if (inkPop.hidden) return;
  inkPop.hidden = true;
  btnInk.setAttribute('aria-expanded', 'false');
}
btnInk.addEventListener('click', () => (inkPop.hidden ? openInk() : closeInk()));
document.addEventListener('pointerdown', (e) => {
  if (!inkPop.hidden && !inkPop.contains(e.target) && !btnInk.contains(e.target)) closeInk();
}, true);
document.addEventListener('keydown', (e) => {
  if (e.key === 'Escape' && !inkPop.hidden) { e.preventDefault(); closeInk(); btnInk.focus({ preventScroll: true }); }
}, true);

btnHold.addEventListener('click', () => {
  held = !held;
  env.setPaused(held);
  btnHold.setAttribute('aria-pressed', String(held));
  btnHold.querySelector('.label').textContent = held ? 'Holding' : 'Hold';
  showToast(held ? 'Holding this thought' : 'Letting it fade again');
  wake();
});

// Sound: on by default (it follows the iPhone's silent switch and mixes with your music),
// and the choice is remembered. Audio can only start from a tap, so the first touch unlocks it.
function applySound(announce) {
  const on = sfx.enabled;
  btnSound.setAttribute('aria-pressed', String(on));
  btnSound.setAttribute('aria-label', on ? 'Sound on' : 'Sound off');
  store.set('sound', on);
  if (announce) showToast(on ? 'Sound on' : 'Sound off');
}
btnSound.addEventListener('click', () => {
  sfx.setEnabled(!sfx.enabled);
  applySound(true);
});
for (const type of ['pointerdown', 'keydown']) document.addEventListener(type, () => sfx.unlock(), { capture: true, passive: true });

btnClear.addEventListener('click', () => {
  env.clear();
  wake();
});

// ------------------------------------------------------------------ undo
// Release scenes keep the drawing until you let it go, so the last stroke or typed block can
// be taken back: the undo button, a two-finger tap, or Ctrl/Cmd+Z. Fade scenes have no undo
// (their marks are already on the way out). Letting the drawing go forgets the history.
const TAP_SPREAD = 250, TAP_TIME = 400, TAP_SLOP = 12;
let tap = null; // a gesture that might turn out to be a two-finger tap

function undoable() { return modeOf(envDef) === 'release' && typeof env.undo === 'function'; }

function syncUndo() {
  const can = undoable() && !typing && !demo.running && !!env.canUndo();
  if (btnUndo.disabled !== !can) btnUndo.disabled = !can;
}

function undo() {
  if (!undoable() || typing || demo.running || !env.undo()) return false;
  sfx.cue('undo');
  wake();
  syncUndo();
  return true;
}

// The two fingers left a dot each on the way down: take those back first, then the real step.
function twoFingerUndo(g) {
  if (!undoable() || typing || demo.running) return;
  let extra = (env.undoCount?.() ?? 0) - g.pushes;
  while (extra-- > 0 && env.undo()) { /* drop the tap's own dots */ }
  if (!undo()) wake();
}

btnUndo.addEventListener('click', () => {
  closeSpeed();
  closeInk();
  undo();
});
document.addEventListener('keydown', (e) => {
  if (!(e.ctrlKey || e.metaKey) || e.shiftKey || e.altKey || e.key.toLowerCase() !== 'z') return;
  if (typing || e.target.closest?.('textarea, input') || !undoable()) return;
  e.preventDefault();
  undo();
});

// The lightbulb floats a prompt in a speech bubble above the surface. It isn't part of the
// drawing, so it never fades, washes away or gets released. Tap the bubble to pop it;
// tap the lightbulb again for a different prompt.
let bubble = null;
function placeBubble(el) {
  const b = btnPrompt.getBoundingClientRect();
  const w = el.offsetWidth, vw = window.innerWidth, edge = 14;
  const bulb = b.left + b.width / 2;
  const left = Math.max(edge, Math.min(vw - w - edge, bulb - Math.min(w * 0.3, 60)));
  el.style.left = left + 'px';
  el.style.setProperty('--tail-x', Math.max(22, Math.min(w - 22, bulb - left)) + 'px');
}
function popBubble({ quiet = false } = {}) {
  const el = bubble;
  if (!el) return;
  bubble = null;
  ui.classList.remove('has-bubble');
  el.classList.add(quiet ? 'gone' : 'popping');
  el.disabled = true;
  if (!quiet) sfx.cue('pop');
  setTimeout(() => el.remove(), quiet ? 200 : 380);
}
function showPromptBubble() {
  const swap = !!bubble;
  popBubble({ quiet: swap });
  const el = document.createElement('button');
  el.type = 'button';
  el.className = 'prompt-bubble';
  const text = pickPrompt();
  el.setAttribute('aria-label', `Prompt: ${text.replace('\n', ' ')}. Tap to pop.`);
  const span = document.createElement('span');
  span.textContent = text;
  el.append(span);
  for (let i = 0; i < 8; i++) {
    const bit = document.createElement('i');
    bit.style.setProperty('--a', `${i * 45 + 20}deg`);
    el.append(bit);
  }
  el.addEventListener('click', () => { if (bubble === el) popBubble(); });
  ui.append(el);
  placeBubble(el);
  bubble = el;
  ui.classList.add('has-bubble');
  sfx.cue('bloop');
}
btnPrompt.addEventListener('click', () => {
  if (typing) finishTyping();
  closeSpeed();
  closeInk();
  showPromptBubble();
});
window.addEventListener('resize', () => { if (bubble) placeBubble(bubble); });

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
  hintPlacing();
}

// The first couple of times, say that words can go anywhere.
function hintPlacing() {
  const n = store.get('placeHint', 0);
  if (n >= 2) return;
  showToast('Tap to place your words · drag to move');
  store.set('placeHint', n + 1);
}

function updateDraft() {
  autoGrow();
  env.setDraft(input.value, spotOpts());
  const empty = !input.value.trim();
  typeSpot.classList.toggle('show', empty);
  if (empty) {
    let x = typing.x ?? W / 2, y = typing.y ?? H * typing.at;
    // On a Release sheet the words land on the sheet, so show the caret there too.
    const a = env.textArea?.(), r = env.rect;
    if (a && r) {
      x = clamp(x, r.x + a.x, r.x + a.x + a.w);
      y = clamp(y, r.y + a.y + 17, r.y + a.y + a.h - 17);
    }
    typeSpot.style.left = `${x}px`;
    typeSpot.style.top = `${y}px`;
  }
  wake();
}

// Placing words while typing. A tap picks a spot: before the first letter it just moves the
// caret, after that it starts a new block there (what's written stays put, still crisp).
// Press and drag instead to slide the block you're typing around until it sits right.
let placing = null; // { id, x, y, dragging, from: { x, y } } while a finger is down in type mode
const DRAG_SLOP = 8;

function typingPointerDown(e) {
  if (placing) return;
  canvas.setPointerCapture?.(e.pointerId);
  placing = { id: e.pointerId, x: e.clientX, y: e.clientY, dragging: false };
}

function typingPointerMove(e) {
  const dx = e.clientX - placing.x, dy = e.clientY - placing.y;
  if (!placing.dragging) {
    if (Math.hypot(dx, dy) < DRAG_SLOP) return;
    placing.dragging = true;
    placing.from = blockOrigin();
    typeSpot.classList.add('dragging');
  }
  Object.assign(typing, { x: placing.from.x + dx, y: placing.from.y + dy });
  if (!placing.raf) placing.raf = requestAnimationFrame(() => { if (placing) placing.raf = 0; updateDraft(); });
}

function typingPointerUp(e) {
  const p = placing;
  placing = null;
  if (p.raf) cancelAnimationFrame(p.raf);
  typeSpot.classList.remove('dragging');
  if (!typing) return;
  if (p.dragging) updateDraft();
  else moveTyping(p.x, p.y);
  input.focus({ preventScroll: true });
}

// Where the current block starts, in screen pixels, read back from the surface (which keeps
// words on screen), so a drag moves it without a jump even from the centred default spot.
function blockOrigin() {
  const sheet = env.drafts?.cur; // Release surfaces keep blocks relative to their sheet
  const d = sheet || env.draft;
  if (!d?.place || !d.lay) return { x: typing.x ?? W / 2, y: typing.y ?? H * typing.at };
  const { lay, place } = d;
  const left = place.align === 'center' ? place.x - lay.widest / 2 : place.x;
  if (sheet) return { x: left + env.rect.x, y: place.y0 + env.rect.y };
  return { x: left + lay.size * 0.12, y: place.y0 };
}

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
  if (placing?.raf) cancelAnimationFrame(placing.raf);
  placing = null;
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
// (The browser's own Ctrl+Z can still edit the hidden box after Done: ignore that.)
input.addEventListener('input', () => { if (typing) updateDraft(); });
compose.addEventListener('submit', (e) => { e.preventDefault(); finishTyping(); });
input.addEventListener('keydown', (e) => {
  if (e.key === 'Escape' || (e.key === 'Enter' && (e.metaKey || e.ctrlKey))) { e.preventDefault(); finishTyping(); }
});
// With a hardware keyboard, just start typing.
document.addEventListener('keydown', (e) => {
  if (typing || !scenes.hidden || !speedPop.hidden || !inkPop.hidden || e.ctrlKey || e.metaKey || e.altKey || e.isComposing) return;
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
  env.setFadeSeconds(fadeSeconds);
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
  if (mode === 'release') closeSpeed();
  btnUndo.hidden = !undoable();
  syncUndo();
  applyInk();
  store.set('env', def.id);
  sfx.setScene(def.id);
  if (announce) showToast(def.name);
  scheduleAutoDemo(def);
  wake();
}

function switchTo(def) {
  demo.stop();
  if (typing) finishTyping();
  useEnvironment(def, { announce: true });
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
      if (isPlus(def)) {
        const badge = document.createElement('span');
        badge.className = 'scene-plus';
        badge.textContent = 'Plus';
        name.append(' ', badge);
      }
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
  closeSpeed();
  closeInk();
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
      slot.append(sfx.silently(() => renderThumb(def)));
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
// Environments can ask for frames on their own (a shake detected by the motion sensor).
window.addEventListener('noodlit:wake', wake);
window.addEventListener('orientationchange', () => setTimeout(resize, 150));
document.addEventListener('visibilitychange', () => {
  sfx.setHidden(document.hidden);
  if (!document.hidden) wake();
});

sfx.enabled = store.get('sound', true) !== false;
applySound(false);
useEnvironment(getEnvironment(store.get('env', 'shower-door')));
applySpeed();
resize();
wake();

// Service worker registration and update checks live in update.js.
