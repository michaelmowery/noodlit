// Shake sketch: a Release environment inspired by the classic red drawing toy.
//   Look:  fine dark lines scratched through silver powder on a grey screen, inside a red
//          plastic frame with two white knobs that turn as you draw.
//   Decay: none. The lines stay until you let them go.
//   Clear: shake the phone (or tap "Shake it"): the screen jiggles and the powder washes
//          down over everything. On iPhone the first tap asks for motion access.

import { clamp, easeInOut, mulberry32, makeCanvas } from '../lib/util.js';
import { MapFade, stageCanvas, speckle, grainTile, blob } from '../lib/fade.js';
import { sfx } from '../lib/sound.js';

export const etch = {
  id: 'etch',
  name: 'Shake sketch',
  blurb: 'Shake it to wipe the screen clean',
  surface: 'Powder drawing screen. Shake the device or tap Shake it to wipe it.',
  fades: false,
  clearLabel: 'Shake it',
  clearIcon: 'M7 4h10a1 1 0 0 1 1 1v14a1 1 0 0 1-1 1H7a1 1 0 0 1-1-1V5a1 1 0 0 1 1-1zM3 8v8M21 8v8',
  create: () => new Etch(),
};

let motionAsked = false;

class Etch extends MapFade {
  constructor() {
    super({ cover: true, brush: 1.9, soft: 0.7, seed: 4, budget: 420000, textSize: 0.12, keep: true });
    this.textLine = 0.035;
    this.textWeight = 400;
    this.knobs = { l: 0, r: 0 };
    this.tip = null;
    this.shakeT = -1;
    this.peaks = [];
    this.onMotion = (e) => this.motion(e);
    const DM = typeof window !== 'undefined' && window.DeviceMotionEvent;
    if (DM && typeof DM.requestPermission !== 'function') window.addEventListener('devicemotion', this.onMotion);
  }

  dispose() { window.removeEventListener('devicemotion', this.onMotion); }

  // Three hard jolts within a second count as a shake.
  motion(e) {
    const a = e.acceleration?.x != null ? e.acceleration : null;
    const g = a || e.accelerationIncludingGravity;
    if (!g || g.x == null) return;
    const mag = Math.hypot(g.x, g.y || 0, g.z || 0) - (a ? 0 : 9.8);
    if (mag < 14) return;
    const now = performance.now();
    this.peaks = this.peaks.filter((t) => now - t < 1000);
    if (!this.peaks.length || now - this.peaks[this.peaks.length - 1] > 120) this.peaks.push(now);
    if (this.peaks.length >= 3 && !this.clearing) {
      this.peaks = [];
      this.shake();
      window.dispatchEvent(new Event('noodlit:wake'));
    }
  }

  frame() {
    const { W, H } = this;
    const b = clamp(Math.min(W, H) * 0.045, 14, 30);
    // A deeper bottom band holds the two knobs.
    const bottom = clamp(b * 3, 48, 78);
    return { b, bottom, x: b, y: b + 4, w: W - b * 2, h: H - b - 4 - bottom };
  }

  paintBase() {
    const { W, H, dpr } = this;
    const { c, g } = stageCanvas(W, H, dpr);
    const s = g.createLinearGradient(0, 0, 0, H);
    s.addColorStop(0, '#3c3e40');
    s.addColorStop(1, '#2a2c2e');
    g.fillStyle = s; g.fillRect(0, 0, W, H);
    return c;
  }

  paintLayer() {
    const { W, H, dpr } = this;
    const rand = mulberry32(9);
    const { c, g } = stageCanvas(W, H, dpr);
    const s = g.createLinearGradient(0, 0, W, H);
    s.addColorStop(0, '#c9cbcc');
    s.addColorStop(0.5, '#b7b9bb');
    s.addColorStop(1, '#a9abad');
    g.fillStyle = s; g.fillRect(0, 0, W, H);
    speckle(g, W, H, rand, (W * H) / 6, 'rgba(255,255,255,0.35)', 0.6);
    speckle(g, W, H, rand, (W * H) / 9, 'rgba(90,92,95,0.25)', 0.6);
    blob(g, W * 0.25, H * 0.2, W * 0.5, H * 0.3, 'rgba(255,255,255,0.18)');
    return c;
  }

  setup() {
    this.frameArt = paintFrame(this.W, this.H, this.dpr, this.frame());
  }

  onStrokeStart(s) { this.tip = s; }
  onStrokeMove(s, x, y, d) {
    // The left knob turns with sideways motion, the right with up and down.
    this.knobs.l = x / 40;
    this.knobs.r = y / 40;
    this.tip = s;
  }
  onStrokeEnd() { this.tip = null; }

  clear() {
    // On iPhone, motion access can only be asked from a tap, so ask the first time.
    const DM = window.DeviceMotionEvent;
    // (Show me clears without a tap; that request fails, so let a real tap ask again.)
    if (!motionAsked && DM && typeof DM.requestPermission === 'function') {
      motionAsked = true;
      DM.requestPermission().then((r) => { if (r === 'granted') window.addEventListener('devicemotion', this.onMotion); })
        .catch(() => { motionAsked = false; });
    }
    this.shake();
  }

  shake() {
    if (this.clearing) return;
    sfx.cue('shake');
    this.strokes.clear();
    this.commitDraft?.();
    this.undoReset(); // nothing left to take back
    this.tip = null;
    this.clearing = { t: 0, dur: 1.1 };
  }

  clearStep(cl) {
    const p = Math.min(1, cl.t / cl.dur);
    const soft = 160;
    const front = -soft + (this.H + soft * 2) * easeInOut(p);
    this.scaleCells((x, y) => clamp((y - front) / soft, 0, 1) * (0.97 + 0.03 * Math.random()));
    if (p >= 1) { this.map.fill(0); return false; }
    return true;
  }

  drawFx(ctx) {
    const cl = this.clearing;
    if (this.tip) {
      ctx.fillStyle = '#1d1e20';
      ctx.beginPath(); ctx.arc(this.tip.x, this.tip.y, 1.6, 0, Math.PI * 2); ctx.fill();
    }
    // The frame and knobs jiggle while it shakes.
    const k = cl ? 1 - cl.t / cl.dur : 0;
    const jx = cl ? Math.sin(cl.t * 55) * 9 * k : 0, jy = cl ? Math.cos(cl.t * 47) * 5 * k : 0;
    ctx.translate(jx, jy);
    ctx.save();
    ctx.setTransform(1, 0, 0, 1, 0, 0);
    ctx.translate(jx * this.dpr, jy * this.dpr);
    ctx.drawImage(this.frameArt, 0, 0);
    ctx.restore();
    const f = this.frame();
    const r = Math.min(f.bottom * 0.36, 16), ky = this.H - f.bottom / 2;
    knob(ctx, f.b + r - 6, ky, r, this.knobs.l);
    knob(ctx, this.W - f.b - r + 6, ky, r, this.knobs.r);
  }
}

function knob(ctx, x, y, r, a) {
  ctx.save();
  ctx.translate(x, y);
  ctx.shadowColor = 'rgba(0,0,0,0.35)';
  ctx.shadowBlur = 6; ctx.shadowOffsetY = 3;
  const g = ctx.createRadialGradient(-r * 0.3, -r * 0.3, 0, 0, 0, r);
  g.addColorStop(0, '#ffffff');
  g.addColorStop(1, '#d8d6d0');
  ctx.fillStyle = g;
  ctx.beginPath(); ctx.arc(0, 0, r, 0, Math.PI * 2); ctx.fill();
  ctx.shadowColor = 'transparent';
  ctx.rotate(a);
  ctx.strokeStyle = 'rgba(120,115,105,0.45)';
  ctx.lineWidth = 1.2;
  for (let i = 0; i < 16; i++) {
    const t = (i / 16) * Math.PI * 2;
    ctx.beginPath(); ctx.moveTo(Math.cos(t) * r * 0.82, Math.sin(t) * r * 0.82); ctx.lineTo(Math.cos(t) * r * 0.96, Math.sin(t) * r * 0.96); ctx.stroke();
  }
  ctx.restore();
}

// Red frame with a soft inner bevel, as a full-res overlay with the screen cut out.
function paintFrame(W, H, dpr, f) {
  const { c, g } = stageCanvas(W, H, dpr);
  const red = g.createLinearGradient(0, 0, 0, H);
  red.addColorStop(0, '#e2382f');
  red.addColorStop(1, '#b8231c');
  g.fillStyle = red;
  g.fillRect(0, 0, W, H);
  // Glossy highlight along the top.
  const hi = g.createLinearGradient(0, 0, 0, f.b);
  hi.addColorStop(0, 'rgba(255,255,255,0.35)');
  hi.addColorStop(1, 'rgba(255,255,255,0)');
  g.fillStyle = hi; g.fillRect(0, 0, W, f.b);
  // Cut out the screen with rounded corners.
  const r = Math.min(16, f.b);
  g.globalCompositeOperation = 'destination-out';
  g.fillStyle = '#000';
  g.beginPath();
  g.moveTo(f.x + r, f.y);
  g.arcTo(f.x + f.w, f.y, f.x + f.w, f.y + f.h, r);
  g.arcTo(f.x + f.w, f.y + f.h, f.x, f.y + f.h, r);
  g.arcTo(f.x, f.y + f.h, f.x, f.y, r);
  g.arcTo(f.x, f.y, f.x + f.w, f.y, r);
  g.fill();
  g.globalCompositeOperation = 'source-over';
  // Inner shadow on the screen edge.
  g.strokeStyle = 'rgba(80,10,8,0.5)';
  g.lineWidth = 3;
  g.stroke();
  g.strokeStyle = 'rgba(0,0,0,0.18)';
  g.lineWidth = 10;
  g.save();
  g.clip();
  g.stroke();
  g.restore();
  return c;
}
