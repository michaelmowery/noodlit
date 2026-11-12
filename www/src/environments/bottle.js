// Message in a bottle: a Release environment.
//   Look:  ink on an old parchment note lying on the sand of a storybook beach.
//   Decay: none. Nothing fades while you draw.
//   Clear: drag the handle up toward the sea (or tap "Cast it off"). The note rolls up and
//          slips into a bottle, the bottle is tossed out past the waves with a plop, and it
//          bobs away toward the horizon. The crab scuttles off; a new note washes up.

import { clamp, easeInOut, mulberry32, makeCanvas } from '../lib/util.js';
import { ReleaseScene, fitRect, paintPaper, tornOutline, paperFibres, cloud } from '../lib/release.js';
import { sfx } from '../lib/sound.js';

const ROLL = 0.8;     // note rolls into the bottle
const TOSS = 1.0;     // bottle arcs out to sea
const DRIFT = 8;

export const bottle = {
  id: 'bottle',
  name: 'Message in a bottle',
  blurb: 'Cast it out to sea',
  clearLabel: 'Cast it off',
  clearIcon: 'M10 3h4v3l1.5 2.5V20a1 1 0 0 1-1 1h-5a1 1 0 0 1-1-1V8.5L10 6V3zM8.5 12h7',
  surface: 'A parchment note on a beach. Drag the handle up to put it in a bottle and cast it out to sea.',
  fades: false,
  create: () => new Bottle(),
};

class Bottle extends ReleaseScene {
  constructor() {
    super(71);
    this.ink = '#3a2618';
    this.handleSide = 'top';
    this.arriveFrom = { x: 0, y: 40 };
    this.washUpAt = 2.4;
    this.washUp = 1.1;
    this.grain = 0.7;
    this.splashes = [];
    this.crab = { x: 0, y: 0, run: 0 };
  }

  layout() {
    const { W, H } = this;
    const portrait = H >= W;
    this.horizon = H * (portrait ? 0.15 : 0.18);
    this.shore = this.horizon + H * (portrait ? 0.1 : 0.12);
    const top = this.shore + clamp(H * 0.05, 30, 60);
    const bottom = H - clamp(H * 0.13, 96, 130);
    return fitRect(30, top, W - 60, bottom - top, 0.76);
  }

  setup() {
    this.crab = { x: this.rect.x + this.rect.w + Math.min(26, (this.W - this.rect.x - this.rect.w) / 2), y: this.rect.y + this.rect.h * 0.82, run: 0, home: 0 };
    if (this.crab.x > this.W - 14) this.crab.x = this.rect.x + this.rect.w - 10, this.crab.y = this.rect.y + this.rect.h + 18;
  }

  paintScene() { return paintBeach(this); }

  paintSheet(w, h, dpr, seed) {
    return paintPaper(w, h, dpr, seed, (g, w, h, rand) => {
      paperFibres(g, w, h, rand, '#f6e8c8', 'rgba(120,85,40,0.08)');
      // Aged edges and a few stains.
      const v = g.createRadialGradient(w / 2, h / 2, Math.min(w, h) * 0.35, w / 2, h / 2, Math.max(w, h) * 0.65);
      v.addColorStop(0, 'rgba(255,245,215,0)');
      v.addColorStop(1, 'rgba(140,90,40,0.35)');
      g.fillStyle = v; g.fillRect(0, 0, w, h);
      for (let i = 0; i < 4; i++) {
        g.fillStyle = `rgba(150,100,50,${0.05 + rand() * 0.05})`;
        g.beginPath(); g.arc(rand() * w, rand() * h, 10 + rand() * 30, 0, Math.PI * 2); g.fill();
      }
    }, tornOutline(2.5, 3));
  }

  launch(f) {
    f.roll = { x: this.W / 2, y: this.rect.y + this.rect.h * 0.35 };
    f.sea = { x: this.W * (0.35 + this.rand() * 0.3), y: (this.horizon + this.shore) / 2 + (this.shore - this.horizon) * 0.25 };
    f.splashed = false;
    this.crab.run = 1;
  }

  carry(f) {
    if (f.t < ROLL) {
      const p = easeInOut(f.t / ROLL);
      f.x = f.from.x + (f.roll.x - f.from.x) * p;
      f.y = f.from.y + (f.roll.y - f.from.y) * p;
      f.s = 1 - 0.75 * p;
      f.roll01 = p;
      f.phase = 'roll';
      return true;
    }
    if (f.t < ROLL + TOSS) {
      const p = (f.t - ROLL) / TOSS;
      f.x = f.roll.x + (f.sea.x - f.roll.x) * p;
      f.y = f.roll.y + (f.sea.y - f.roll.y) * p - Math.sin(Math.PI * p) * this.H * 0.18;
      f.k = 1 - 0.35 * p;
      f.a = p * Math.PI * 2.5;
      f.phase = 'toss';
      return true;
    }
    if (!f.splashed) { f.splashed = true; this.splashes.push({ x: f.sea.x, y: f.sea.y, t: 0, k: 0.65 }); sfx.cue('splash', { size: 1.1 }); }
    const t = f.t - ROLL - TOSS, q = Math.min(1, t / DRIFT);
    const e = 1 - Math.pow(1 - q, 1.5);
    f.phase = 'drift';
    f.x = f.sea.x + Math.sin(t * 0.7 + f.seed) * 10 + (this.W * 0.5 - f.sea.x) * e * 0.3;
    f.y = f.sea.y + (this.horizon + 3 - f.sea.y) * e + Math.sin(t * 2.4) * 2 * (1 - e);
    f.k = 0.65 * (1 - 0.85 * e);
    f.a = -0.9 + Math.sin(t * 1.9 + f.seed) * 0.25;
    f.alpha = q > 0.85 ? (1 - q) / 0.15 : 1;
    return q < 1;
  }

  drawCarried(ctx, f) {
    if (f.phase === 'roll') {
      // The note squashes into a scroll as it rolls up, while the bottle fades in.
      const { w, h } = this.rect;
      this.compose(f.sheet);
      ctx.save();
      ctx.translate(f.x, f.y);
      ctx.scale(f.s, f.s * (1 - 0.85 * f.roll01));
      ctx.globalAlpha = 1 - f.roll01 * 0.6;
      ctx.drawImage(f.sheet.comp, -w / 2, -h / 2, w, h);
      ctx.restore();
      if (f.roll01 > 0.5) drawBottle(ctx, f.roll.x, f.roll.y, Math.min(this.W, this.H) * 0.2, Math.PI / 2, (f.roll01 - 0.5) * 2);
      return;
    }
    const size = Math.min(this.W, this.H) * 0.2 * f.k;
    if (f.phase === 'drift') {
      // Water line: only the top of the bottle shows above it.
      ctx.save();
      ctx.beginPath(); ctx.rect(f.x - size * 2, f.y - size * 2, size * 4, size * 2 + size * 0.12); ctx.clip();
      drawBottle(ctx, f.x, f.y, size, f.a, f.alpha);
      ctx.restore();
      ctx.strokeStyle = `rgba(255,255,255,${0.6 * f.alpha})`;
      ctx.lineWidth = 1.2;
      ctx.beginPath(); ctx.ellipse(f.x, f.y + size * 0.12, size * 0.6, size * 0.1, 0, 0, Math.PI * 2); ctx.stroke();
      return;
    }
    drawBottle(ctx, f.x, f.y, size, Math.PI / 2 + f.a, 1);
  }

  updateFx(dt) {
    for (const s of this.splashes) s.t += dt;
    this.splashes = this.splashes.filter((s) => s.t < 1.6);
    const c = this.crab;
    let active = this.splashes.length > 0;
    if (c.run > 0) { c.run = Math.max(0, c.run - dt * 0.3); active = true; }
    return active;
  }

  drawBack(ctx) {
    // Foam line at the shore, sliding in and out while things are moving.
    const { W, shore } = this;
    const off = Math.sin(this.time * 1.2) * 6;
    ctx.save();
    ctx.fillStyle = 'rgba(255,255,255,0.75)';
    ctx.beginPath(); ctx.moveTo(0, shore - 2 + off);
    for (let x = 0; x <= W + 10; x += 10) ctx.lineTo(x, shore + off + Math.sin(x * 0.05 + this.time * 2) * 3);
    for (let x = W + 10; x >= 0; x -= 10) ctx.lineTo(x, shore + off - 5 + Math.sin(x * 0.05 + this.time * 2 + 1) * 2);
    ctx.fill();
    for (const s of this.splashes) {
      const p = s.t / 1.6;
      ctx.strokeStyle = `rgba(255,255,255,${0.8 * (1 - p)})`;
      ctx.lineWidth = 1.5;
      for (let i = 0; i < 2; i++) {
        const q = p - i * 0.15;
        if (q > 0) { ctx.beginPath(); ctx.ellipse(s.x, s.y, (6 + q * 34) * s.k, (2 + q * 8) * s.k, 0, 0, Math.PI * 2); ctx.stroke(); }
      }
      if (p < 0.4) {
        ctx.fillStyle = `rgba(240,250,255,${1 - p / 0.4})`;
        for (let i = 0; i < 6; i++) {
          const a = (i / 6) * Math.PI;
          ctx.beginPath(); ctx.arc(s.x + Math.cos(a) * (6 + p * 50) * s.k, s.y - Math.sin(a) * p * 40 * s.k, 1.8, 0, Math.PI * 2); ctx.fill();
        }
      }
    }
    ctx.restore();
  }

  drawFront(ctx) {
    const c = this.crab;
    // Scuttle sideways off to the right and back.
    const k = Math.sin(Math.min(1, 1 - c.run) * Math.PI);
    const x = c.x + (c.run > 0 ? k * 60 : 0);
    crab(ctx, x, c.y, 9, c.run > 0 ? this.time * 18 : 0);
  }
}

function drawBottle(ctx, x, y, size, angle, alpha) {
  ctx.save();
  ctx.globalAlpha = alpha;
  ctx.translate(x, y);
  ctx.rotate(angle - Math.PI / 2);   // drawn standing up; angle 0 = lying with neck right
  const w = size * 0.42, h = size;
  // Glass.
  ctx.fillStyle = 'rgba(120,190,150,0.55)';
  ctx.beginPath();
  ctx.moveTo(-w / 2, h * 0.45);
  ctx.lineTo(-w / 2, -h * 0.1);
  ctx.quadraticCurveTo(-w / 2, -h * 0.25, -w * 0.18, -h * 0.32);
  ctx.lineTo(-w * 0.16, -h * 0.48);
  ctx.lineTo(w * 0.16, -h * 0.48);
  ctx.lineTo(w * 0.18, -h * 0.32);
  ctx.quadraticCurveTo(w / 2, -h * 0.25, w / 2, -h * 0.1);
  ctx.lineTo(w / 2, h * 0.45);
  ctx.quadraticCurveTo(w / 2, h * 0.5, w * 0.4, h * 0.5);
  ctx.lineTo(-w * 0.4, h * 0.5);
  ctx.quadraticCurveTo(-w / 2, h * 0.5, -w / 2, h * 0.45);
  ctx.fill();
  // Rolled note inside, tied with string.
  ctx.fillStyle = '#efdcb2';
  ctx.fillRect(-w * 0.22, -h * 0.12, w * 0.44, h * 0.52);
  ctx.fillStyle = 'rgba(140,90,40,0.35)';
  ctx.fillRect(-w * 0.22, -h * 0.12, w * 0.08, h * 0.52);
  ctx.fillStyle = '#b5523b';
  ctx.fillRect(-w * 0.24, h * 0.1, w * 0.48, h * 0.04);
  // Cork and highlight.
  ctx.fillStyle = '#b08155';
  ctx.fillRect(-w * 0.17, -h * 0.58, w * 0.34, h * 0.13);
  ctx.strokeStyle = 'rgba(255,255,255,0.7)';
  ctx.lineWidth = Math.max(1, size * 0.03);
  ctx.lineCap = 'round';
  ctx.beginPath(); ctx.moveTo(-w * 0.32, -h * 0.05); ctx.lineTo(-w * 0.32, h * 0.38); ctx.stroke();
  ctx.restore();
}

function crab(ctx, x, y, r, walk) {
  ctx.save();
  ctx.translate(x, y);
  ctx.strokeStyle = '#c4452f'; ctx.lineWidth = 1.6; ctx.lineCap = 'round';
  for (const s of [-1, 1]) for (let i = 0; i < 3; i++) {
    const ph = Math.sin(walk + i * 1.5 + (s > 0 ? 0 : 1)) * 2;
    ctx.beginPath(); ctx.moveTo(s * r * 0.6, i * 2.5 - 1); ctx.lineTo(s * r * 1.25, i * 3 + 2 + ph); ctx.stroke();
  }
  ctx.fillStyle = '#e0573a';
  ctx.beginPath(); ctx.ellipse(0, 0, r, r * 0.65, 0, 0, Math.PI * 2); ctx.fill();
  for (const s of [-1, 1]) {
    ctx.beginPath(); ctx.arc(s * r * 1.1, -r * 0.75, r * 0.38, 0, Math.PI * 2); ctx.fill();
    ctx.fillStyle = '#fff';
    ctx.beginPath(); ctx.arc(s * r * 0.3, -r * 0.75, r * 0.2, 0, Math.PI * 2); ctx.fill();
    ctx.fillStyle = '#1d1d1d';
    ctx.beginPath(); ctx.arc(s * r * 0.3, -r * 0.75, r * 0.1, 0, Math.PI * 2); ctx.fill();
    ctx.fillStyle = '#e0573a';
  }
  ctx.restore();
}

// ------------------------------------------------------------------ painting
function paintBeach(e) {
  const { W, H, dpr, horizon, shore } = e;
  const rand = mulberry32(36);
  const c = makeCanvas(W * dpr, H * dpr), g = c.getContext('2d');
  g.scale(dpr, dpr);
  const sky = g.createLinearGradient(0, 0, 0, horizon);
  sky.addColorStop(0, '#7cc6ec');
  sky.addColorStop(1, '#d8f0fa');
  g.fillStyle = sky; g.fillRect(0, 0, W, horizon + 1);
  const u = Math.min(W, H);
  cloud(g, W * 0.7, horizon * 0.5, u * 0.04);
  cloud(g, W * 0.25, horizon * 0.35, u * 0.03, 'rgba(255,255,255,0.85)');
  // A little island with a palm on the horizon.
  const ix = W * 0.82;
  g.fillStyle = '#e9d39a';
  g.beginPath(); g.ellipse(ix, horizon, 22, 6, 0, Math.PI, 0); g.fill();
  g.strokeStyle = '#7a5a3a'; g.lineWidth = 2;
  g.beginPath(); g.moveTo(ix, horizon - 4); g.quadraticCurveTo(ix + 3, horizon - 14, ix + 1, horizon - 24); g.stroke();
  g.fillStyle = '#4f9a4a';
  for (const a of [-2.6, -2, -1.2, -0.5]) { g.beginPath(); g.ellipse(ix + 1 + Math.cos(a) * 7, horizon - 24 + Math.sin(a) * 3 + 2, 8, 2.5, a + Math.PI / 2 + 1.4, 0, Math.PI * 2); g.fill(); }
  // Sea, deeper toward the horizon.
  const sea = g.createLinearGradient(0, horizon, 0, shore);
  sea.addColorStop(0, '#2f8fb8');
  sea.addColorStop(1, '#5cc6d4');
  g.fillStyle = sea; g.fillRect(0, horizon, W, shore - horizon);
  g.strokeStyle = 'rgba(255,255,255,0.4)'; g.lineCap = 'round';
  for (let i = 0; i < W / 6; i++) {
    const y = horizon + 3 + rand() * (shore - horizon - 8);
    const k = (y - horizon) / (shore - horizon);
    const x = rand() * W;
    g.lineWidth = 0.8 + k;
    g.beginPath(); g.arc(x, y + 4, 4 + k * 8, Math.PI * 1.2, Math.PI * 1.8); g.stroke();
  }
  // Wet sand, then dry sand.
  g.fillStyle = '#d9c18e';
  g.fillRect(0, shore, W, 22);
  const sand = g.createLinearGradient(0, shore + 14, 0, H);
  sand.addColorStop(0, '#e8c98c');
  sand.addColorStop(1, '#d9b574');
  g.fillStyle = sand;
  g.beginPath(); g.moveTo(0, shore + 16);
  for (let x = 0; x <= W + 10; x += 10) g.lineTo(x, shore + 16 + Math.sin(x * 0.03) * 3);
  g.lineTo(W, H); g.lineTo(0, H); g.fill();
  for (let i = 0; i < (W * H) / 260; i++) {
    g.fillStyle = `rgba(${150 + rand() * 60 | 0},${120 + rand() * 50 | 0},${80 + rand() * 30 | 0},0.25)`;
    g.fillRect(rand() * W, shore + 20 + rand() * (H - shore), 1.2, 1.2);
  }
  // Shells and a starfish.
  for (let i = 0; i < 8; i++) {
    const x = rand() * W, y = shore + 30 + rand() * (H - shore - 40);
    g.fillStyle = rand() < 0.5 ? '#f7e6e0' : '#f4c9b8';
    g.beginPath(); g.arc(x, y, 3 + rand() * 3, Math.PI, 0); g.fill();
  }
  const sx = W * 0.12, sy = H - clamp(H * 0.2, 130, 180);
  g.fillStyle = '#f0884a';
  g.beginPath();
  for (let i = 0; i < 10; i++) { const a = -Math.PI / 2 + i * Math.PI / 5, r = i % 2 ? 4 : 11; g.lineTo(sx + Math.cos(a) * r, sy + Math.sin(a) * r); }
  g.closePath(); g.fill();
  return c;
}
