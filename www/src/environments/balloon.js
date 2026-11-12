// Balloon: a Release environment.
//   Look:  marker on a big pastel balloon, tied to a fence post on a sunny hill.
//   Decay: none. Nothing fades while you draw.
//   Clear: tap "Let go". The string comes untied and the balloon
//          floats up, swaying and getting smaller, until it slips past the clouds. A new
//          balloon is tied on.

import { clamp, easeInOut, mulberry32, makeCanvas } from '../lib/util.js';
import { ReleaseScene, fitRect, paintPaper, cloud } from '../lib/release.js';
import { sfx } from '../lib/sound.js';

const RISE = 7.5;
const COLORS = ['#ffd27a', '#ffb7b2', '#a9dcff', '#c6efa6', '#e2c4ff'];

// Inks that suit the material, default first.
const PALETTE = [
  { name: 'Black', color: '#2c2440' },
  { name: 'Navy', color: '#1f2f7a' },
  { name: 'Berry', color: '#a3214f' },
  { name: 'Forest', color: '#22663a' },
  { name: 'Purple', color: '#5b2a90' },
  { name: 'Brown', color: '#6b3b1a' },
];

export const balloon = {
  id: 'balloon',
  name: 'Balloon',
  blurb: 'Untie it and watch it float away',
  clearLabel: 'Let go',
  clearIcon: 'M12 3a6 6 0 0 0-6 6c0 3.6 3 6.5 6 7 3-.5 6-3.4 6-7a6 6 0 0 0-6-6zM12 16l-1 2h2l-1-2M12 18c-1 1.5 1 2 0 3.5',
  surface: 'A balloon to draw on, tied to a fence post. Tap Let go to untie it and let it float away.',
  fades: false,
  palette: PALETTE,
  create: () => new Balloon(),
};

class Balloon extends ReleaseScene {
  constructor() {
    super(88);
    this.ink = PALETTE[0].color;
    this.arriveFrom = { x: 0, y: 80 };
    this.washUpAt = 1.6;
    this.washUp = 0.9;
    this.grain = 0.35;
    this.birds = [];
  }

  layout() {
    const { W, H } = this;
    this.ground = H - clamp(H * 0.2, 130, 190);
    const top = clamp(H * 0.08, 52, 100);
    const bottom = this.ground - clamp(H * 0.1, 50, 90);
    const r = fitRect(24, top, W - 48, bottom - top, 0.8);
    this.post = { x: r.x + r.w / 2 + Math.min(70, r.w * 0.22), y: this.ground + 6 };
    return r;
  }

  knot(cx, cy, s) {
    // Where the string leaves the balloon, for a sheet centred at (cx, cy) with scale s.
    return { x: cx, y: cy + this.rect.h * 0.5 * s };
  }

  textArea() {
    const { w, h } = this.rect;
    return { x: w * 0.15, y: h * 0.12, w: w * 0.7, h: h * 0.56 };
  }

  paintScene() { return paintHill(this); }

  paintSheet(w, h, dpr, seed) {
    const color = COLORS[seed % COLORS.length];
    return paintPaper(w, h, dpr, seed, (g, w, h) => {
      g.fillStyle = color; g.fillRect(0, 0, w, h);
      // Shading: darker towards the lower right, a soft glossy highlight top left.
      const sh = g.createRadialGradient(w * 0.38, h * 0.3, 0, w * 0.5, h * 0.45, Math.max(w, h) * 0.62);
      sh.addColorStop(0, 'rgba(255,255,255,0.3)');
      sh.addColorStop(0.6, 'rgba(255,255,255,0)');
      sh.addColorStop(1, 'rgba(60,30,80,0.22)');
      g.fillStyle = sh; g.fillRect(0, 0, w, h);
      g.fillStyle = 'rgba(255,255,255,0.55)';
      g.beginPath(); g.ellipse(w * 0.27, h * 0.2, w * 0.06, h * 0.09, -0.5, 0, Math.PI * 2); g.fill();
      g.beginPath(); g.ellipse(w * 0.2, h * 0.32, w * 0.018, h * 0.025, -0.5, 0, Math.PI * 2); g.fill();
    }, balloonPath);
  }

  launch(f) {
    sfx.cue('chirp');
    f.knot0 = this.knot(f.from.x, f.from.y, 1);
    f.drift = (this.rand() < 0.5 ? -1 : 1) * this.W * 0.15;
    // The birds on the fence flutter off.
    for (const b of this.birds) b.fly = 0;
  }

  carry(f) {
    const q = f.t / RISE;
    const p = easeInOut(Math.min(1, f.t / 1.2));
    f.s = 1 - 0.55 * p - 0.3 * q;
    const rise = (this.H + this.rect.h) * Math.pow(q, 1.3);
    f.y = f.from.y - rise - p * 30;
    f.x = f.from.x + f.drift * q + Math.sin(f.t * 1.3 + f.seed) * 22 * p;
    f.a = Math.sin(f.t * 1.1 + f.seed) * 0.12 * p;
    return f.y + this.rect.h * f.s > -40;
  }

  drawString(ctx, x, y, x2, y2, t, slack) {
    ctx.save();
    ctx.strokeStyle = 'rgba(70,60,60,0.75)';
    ctx.lineWidth = 1.3;
    ctx.beginPath();
    ctx.moveTo(x, y);
    const n = 14;
    for (let i = 1; i <= n; i++) {
      const k = i / n;
      const wob = Math.sin(k * 7 + t * 3) * slack * Math.sin(k * Math.PI);
      ctx.lineTo(x + (x2 - x) * k + wob, y + (y2 - y) * k);
    }
    ctx.stroke();
    ctx.restore();
  }

  drawCarried(ctx, f) {
    const k = this.knot(f.x, f.y, f.s);
    const len = this.rect.h * 0.55 * f.s + 20;
    this.drawString(ctx, k.x, k.y, k.x - Math.sin(f.t * 1.3) * 12, k.y + len, f.t, 6);
    this.drawSheetAt(ctx, f.sheet, f.x, f.y, f.s, f.a, 1, 0.12);
  }

  drawBack(ctx) {
    // The string from the current balloon down to the fence post.
    const s = this.sheet;
    if (!s) return;
    const r = this.rect;
    const p = easeInOut(s.arrive);
    const cx = r.x + r.w / 2 + s.offX, cy = r.y + r.h / 2 + s.offY + (1 - p) * this.arriveFrom.y;
    const k = this.knot(cx, cy, 1);
    this.drawString(ctx, k.x, k.y, this.post.x, this.post.y - 30, this.time, 4);
  }

  updateFx(dt) {
    let active = false;
    for (const b of this.birds) {
      if (b.fly >= 0) { b.fly += dt; active = true; if (b.fly > 6) b.fly = -1; }
    }
    return active;
  }

  setup() {
    const { post } = this;
    this.birds = [0, 1].map((i) => ({ x: post.x - 60 - i * 22, y: post.y - 22, fly: -1, ph: i * 1.3 }));
  }

  drawFront(ctx) {
    for (const b of this.birds) {
      if (b.fly < 0) { bird(ctx, b.x, b.y, 0, true); continue; }
      const t = b.fly;
      // Fly off, then come back and land after a while.
      const out = Math.min(1, t / 2.5), back = Math.max(0, (t - 3.5) / 2.5);
      const k = out - back;
      bird(ctx, b.x - k * 160 + Math.sin(t * 3 + b.ph) * 8, b.y - k * 180, t * 14 + b.ph, k < 0.02);
    }
  }
}

function balloonPath(g, w, h) {
  const cx = w / 2;
  const rx = w / 2 - 2, top = 2, bottom = h * 0.93;
  g.beginPath();
  g.moveTo(cx, top);
  g.bezierCurveTo(cx + rx * 1.1, top, cx + rx * 1.05, h * 0.62, cx + rx * 0.08, bottom - h * 0.01);
  // Knot.
  g.lineTo(cx + w * 0.035, h - 1);
  g.lineTo(cx - w * 0.035, h - 1);
  g.lineTo(cx - rx * 0.08, bottom - h * 0.01);
  g.bezierCurveTo(cx - rx * 1.05, h * 0.62, cx - rx * 1.1, top, cx, top);
  g.closePath();
}

function bird(ctx, x, y, flap, perched) {
  ctx.save();
  ctx.translate(x, y);
  ctx.fillStyle = '#4a5a7a';
  ctx.beginPath(); ctx.ellipse(0, 0, 7, 5, 0, 0, Math.PI * 2); ctx.fill();
  ctx.beginPath(); ctx.arc(5, -4, 3.5, 0, Math.PI * 2); ctx.fill();
  ctx.fillStyle = '#f2a03b';
  ctx.beginPath(); ctx.moveTo(8, -4); ctx.lineTo(12, -3); ctx.lineTo(8, -2); ctx.fill();
  ctx.fillStyle = '#fff';
  ctx.beginPath(); ctx.arc(6, -5, 1, 0, Math.PI * 2); ctx.fill();
  ctx.fillStyle = '#3a4866';
  const wy = perched ? 0 : Math.sin(flap) * 7;
  ctx.beginPath(); ctx.moveTo(-3, -1); ctx.lineTo(-10, -3 - wy); ctx.lineTo(2, -2); ctx.fill();
  ctx.restore();
}

// ------------------------------------------------------------------ painting
function paintHill(e) {
  const { W, H, dpr, ground, post } = e;
  const rand = mulberry32(12);
  const c = makeCanvas(W * dpr, H * dpr), g = c.getContext('2d');
  g.scale(dpr, dpr);
  const sky = g.createLinearGradient(0, 0, 0, H);
  sky.addColorStop(0, '#6fbfee');
  sky.addColorStop(0.7, '#c7e9fb');
  sky.addColorStop(1, '#e6f6ff');
  g.fillStyle = sky; g.fillRect(0, 0, W, H);
  // Sun.
  const sun = g.createRadialGradient(W * 0.85, H * 0.09, 0, W * 0.85, H * 0.09, Math.min(W, H) * 0.16);
  sun.addColorStop(0, 'rgba(255,248,200,1)');
  sun.addColorStop(0.35, 'rgba(255,236,150,0.9)');
  sun.addColorStop(1, 'rgba(255,236,150,0)');
  g.fillStyle = sun; g.fillRect(0, 0, W, H * 0.4);
  const u = Math.min(W, H);
  cloud(g, W * 0.15, H * 0.14, u * 0.06);
  cloud(g, W * 0.62, H * 0.06, u * 0.045);
  cloud(g, W * 0.82, H * 0.34, u * 0.05, 'rgba(255,255,255,0.9)');
  cloud(g, W * 0.1, H * 0.46, u * 0.04, 'rgba(255,255,255,0.85)');
  // Distant hills, then our hill.
  g.fillStyle = '#9fd18a';
  g.beginPath(); g.moveTo(0, H);
  for (let x = 0; x <= W + 8; x += 8) g.lineTo(x, ground - 30 + Math.sin(x / W * 5 + 1) * 14);
  g.lineTo(W, H); g.fill();
  g.fillStyle = '#78bf5e';
  g.beginPath(); g.moveTo(0, H);
  for (let x = 0; x <= W + 8; x += 8) g.lineTo(x, ground + Math.sin(x / W * 2.4 + 0.3) * 10);
  g.lineTo(W, H); g.fill();
  // Fence along the hill.
  g.fillStyle = '#f4ecdc';
  g.strokeStyle = '#d8ccb4';
  for (let x = post.x - 220; x < post.x + 220; x += 34) {
    if (x < -10 || x > W + 10) continue;
    g.fillRect(x - 4, post.y - 34, 8, 38);
    g.beginPath(); g.moveTo(x - 4, post.y - 34); g.lineTo(x, post.y - 40); g.lineTo(x + 4, post.y - 34); g.fill();
  }
  g.fillRect(Math.max(0, post.x - 224), post.y - 26, Math.min(W, 448), 5);
  g.fillRect(Math.max(0, post.x - 224), post.y - 12, Math.min(W, 448), 5);
  // Grass and flowers.
  g.strokeStyle = 'rgba(50,110,40,0.4)'; g.lineWidth = 1.2; g.lineCap = 'round';
  for (let i = 0; i < W / 3; i++) {
    const x = rand() * W, y = ground + 8 + rand() * (H - ground);
    for (let k = -1; k <= 1; k++) { g.beginPath(); g.moveTo(x + k * 2, y); g.lineTo(x + k * 3.5, y - 6 - rand() * 3); g.stroke(); }
  }
  for (let i = 0; i < W / 18; i++) {
    const x = rand() * W, y = ground + 12 + rand() * (H - ground - 12);
    g.fillStyle = ['#ffffff', '#ffe36b', '#f6b9d0'][(rand() * 3) | 0];
    for (let k = 0; k < 5; k++) { const a = k / 5 * Math.PI * 2; g.beginPath(); g.arc(x + Math.cos(a) * 2.2, y + Math.sin(a) * 2.2, 1.6, 0, Math.PI * 2); g.fill(); }
  }
  return c;
}
