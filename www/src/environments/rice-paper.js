// Rice paper: a Release environment.
//   Look:  brush ink on a sheet of thin rice paper floating on a koi pond, seen from above,
//          with lily pads and koi gliding underneath.
//   Decay: none. Nothing fades while you draw.
//   Clear: tap "Let it melt". The paper settles into the water,
//          softens and dissolves; the ink blooms out into faint clouds and is gone, and the
//          koi come over to swim through where it was. A new sheet is laid on the water.
//          Tap the water to make a ripple and send the koi swimming.

import { clamp, mulberry32, makeCanvas, valueNoise } from '../lib/util.js';
import { ReleaseScene, fitRect, paintPaper, tornOutline, paperFibres } from '../lib/release.js';
import { sfx } from '../lib/sound.js';

const PALETTE = [
  { name: 'Sumi', color: '#1b1a1c' },
  { name: 'Indigo', color: '#253a7a' },
  { name: 'Vermilion', color: '#c3361f' },
  { name: 'Moss', color: '#3d5f2a' },
  { name: 'Plum', color: '#5e2350' },
  { name: 'Umber', color: '#5a3820' },
];

const MELT = 7;

export const ricePaper = {
  id: 'rice-paper',
  name: 'Rice paper',
  blurb: 'It melts into the koi pond',
  clearLabel: 'Let it melt',
  clearIcon: 'M5 4h14v10H5zM3 18c2 0 2 1.5 4.5 1.5S10 18 12 18s2 1.5 4.5 1.5S19 18 21 18',
  surface: 'Rice paper floating on a koi pond. Tap Let it melt to let it dissolve.',
  fades: false,
  palette: PALETTE,
  create: () => new RicePaper(),
};

class RicePaper extends ReleaseScene {
  constructor() {
    super(58);
    this.ink = PALETTE[0].color;
    this.arriveFrom = { x: 0, y: -30 };
    this.washUpAt = 2.4;
    this.washUp = 1.1;
    this.grain = 0.7;
    this.ripples = [];
    this.kt = 0;
    this.koiAwake = 0;
  }

  layout() {
    const { W, H } = this;
    const top = clamp(H * 0.12, 70, 120);
    const bottom = H - clamp(H * 0.2, 130, 180);
    return fitRect(36, top, W - 72, bottom - top, 0.8);
  }

  setup() {
    const rand = mulberry32(6);
    const cols = [['#f26a2a', '#ffffff'], ['#ffffff', '#e8452c'], ['#f2a33a', '#2b2422'], ['#ffffff', '#f07a2a']];
    this.koi = Array.from({ length: 4 }, (_, i) => ({
      ph: rand() * 6, w: 0.18 + rand() * 0.12, rx: 0.32 + rand() * 0.14, ry: 0.28 + rand() * 0.14,
      size: Math.min(this.W, this.H) * (0.07 + rand() * 0.03), col: cols[i % cols.length], seed: rand() * 9,
      dir: i % 2 ? 1 : -1,
    }));
    this.target = null;
  }

  paintScene() { return paintPond(this); }

  paintSheet(w, h, dpr, seed) {
    return paintPaper(w, h, dpr, seed, (g, w, h, rand) => {
      paperFibres(g, w, h, rand, 'rgba(250,246,234,0.92)', 'rgba(170,150,110,0.12)');
      // Long rice-paper fibres.
      g.strokeStyle = 'rgba(200,185,150,0.18)'; g.lineWidth = 0.6;
      for (let i = 0; i < (w * h) / 1600; i++) {
        const x = rand() * w, y = rand() * h, a = rand() * Math.PI;
        g.beginPath(); g.moveTo(x, y); g.quadraticCurveTo(x + Math.cos(a) * 10, y + 8, x + Math.cos(a) * 24, y + Math.sin(a) * 24); g.stroke();
      }
    }, tornOutline(2.5, 4));
  }

  tapScene(x, y) {
    this.ripples.push({ x, y, t: 0, big: false });
    this.koiAwake = 4;
    sfx.cue('splash', { size: 0.4 });
  }

  launch(f) {
    sfx.cue('splash', { size: 0.6 });
    sfx.cue('dissolve');
    this.ripples.push({ x: f.from.x, y: f.from.y, t: 0, big: true });
    this.target = { x: f.from.x, y: f.from.y };
    this.koiAwake = MELT + 2;
    f.drift = (Math.random() - 0.5) * 30;
  }

  carry(f) {
    const q = f.t / MELT;
    f.x = f.from.x + f.drift * q;
    f.y = f.from.y + 10 * q;
    f.s = 1 + q * 0.08;
    f.a = Math.sin(f.t * 0.5) * 0.02;
    return q < 1;
  }

  drawCarried(ctx, f) {
    const q = clamp(f.t / MELT, 0, 1);
    const { w, h } = this.rect;
    const comp = f.sheet.comp;
    ctx.save();
    ctx.translate(f.x, f.y);
    ctx.rotate(f.a);
    ctx.scale(f.s, f.s);
    // The sheet itself sinks and goes translucent...
    ctx.globalAlpha = Math.max(0, 1 - q * 1.8) * 0.95;
    ctx.drawImage(comp, -w / 2, -h / 2, w, h);
    // ...while the ink blooms outward in soft, fading copies.
    const spread = 2 + q * 22, n = 8;
    for (let i = 0; i < n; i++) {
      const a = (i / n) * Math.PI * 2 + q;
      ctx.globalAlpha = Math.max(0, (1 - q) * (q < 0.1 ? q / 0.1 : 1)) * 0.16;
      ctx.drawImage(comp, -w / 2 + Math.cos(a) * spread, -h / 2 + Math.sin(a) * spread, w, h);
    }
    ctx.restore();
  }

  updateFx(dt) {
    for (const r of this.ripples) r.t += dt;
    this.ripples = this.ripples.filter((r) => r.t < (r.big ? 3 : 2));
    if (this.koiAwake > 0) {
      this.koiAwake -= dt;
      this.kt += dt;
      if (this.koiAwake <= 0) this.target = null;
    }
    return this.ripples.length > 0 || this.koiAwake > 0;
  }

  koiPos(k, t) {
    const { W, H } = this;
    let x = W / 2 + Math.cos(t * k.w * k.dir + k.ph) * W * k.rx;
    let y = H * 0.48 + Math.sin(t * k.w * 1.3 * k.dir + k.ph) * H * k.ry;
    if (this.target) {
      // Drawn to where the paper went in.
      const pull = clamp(this.koiAwake / 4, 0, 0.55);
      x += (this.target.x + Math.cos(t * 1.4 + k.seed) * 40 - x) * pull;
      y += (this.target.y + Math.sin(t * 1.1 + k.seed) * 50 - y) * pull;
    }
    return { x, y };
  }

  drawBack(ctx) {
    for (const k of this.koi) {
      const p = this.koiPos(k, this.kt), q = this.koiPos(k, this.kt + 0.08);
      drawKoi(ctx, p.x, p.y, Math.atan2(q.y - p.y, q.x - p.x), k.size, k.col, this.kt * 8 + k.seed);
    }
    for (const r of this.ripples) {
      const life = r.big ? 3 : 2, k = r.t / life;
      for (let i = 0; i < (r.big ? 3 : 2); i++) {
        const rr = (r.big ? 140 : 70) * Math.max(0, k - i * 0.12);
        if (rr <= 0) continue;
        ctx.strokeStyle = `rgba(230,250,255,${0.45 * (1 - k)})`;
        ctx.lineWidth = 1.5;
        ctx.beginPath(); ctx.ellipse(r.x, r.y, rr, rr * 0.92, 0, 0, Math.PI * 2); ctx.stroke();
      }
    }
  }
}

function drawKoi(ctx, x, y, a, s, [body, patch], wag) {
  ctx.save();
  ctx.translate(x, y);
  ctx.rotate(a);
  // Shadow on the pond floor.
  ctx.fillStyle = 'rgba(0,20,25,0.25)';
  ctx.beginPath(); ctx.ellipse(6, 8, s * 0.55, s * 0.18, 0, 0, Math.PI * 2); ctx.fill();
  const tail = Math.sin(wag) * 0.5;
  // Tail.
  ctx.fillStyle = body;
  ctx.globalAlpha = 0.85;
  ctx.save();
  ctx.translate(-s * 0.48, 0);
  ctx.rotate(tail);
  ctx.beginPath(); ctx.moveTo(0, 0); ctx.quadraticCurveTo(-s * 0.3, -s * 0.25, -s * 0.38, -s * 0.2); ctx.quadraticCurveTo(-s * 0.25, 0, -s * 0.38, s * 0.2); ctx.quadraticCurveTo(-s * 0.3, s * 0.25, 0, 0); ctx.fill();
  ctx.restore();
  // Fins.
  for (const side of [-1, 1]) {
    ctx.beginPath(); ctx.ellipse(s * 0.12, side * s * 0.17, s * 0.13, s * 0.05, side * (0.7 + tail * 0.3), 0, Math.PI * 2); ctx.fill();
  }
  ctx.globalAlpha = 1;
  // Body.
  ctx.beginPath(); ctx.ellipse(0, 0, s * 0.52, s * 0.17, 0, 0, Math.PI * 2); ctx.fill();
  ctx.save();
  ctx.clip();
  ctx.fillStyle = patch;
  ctx.beginPath(); ctx.ellipse(s * 0.12, -s * 0.04, s * 0.16, s * 0.12, 0.4, 0, Math.PI * 2); ctx.fill();
  ctx.beginPath(); ctx.ellipse(-s * 0.22, s * 0.05, s * 0.12, s * 0.1, -0.3, 0, Math.PI * 2); ctx.fill();
  ctx.restore();
  ctx.fillStyle = 'rgba(255,255,255,0.25)';
  ctx.beginPath(); ctx.ellipse(s * 0.05, -s * 0.06, s * 0.3, s * 0.04, 0, 0, Math.PI * 2); ctx.fill();
  ctx.restore();
}

function paintPond(e) {
  const { W, H, dpr } = e;
  const rand = mulberry32(31);
  const c = makeCanvas(W * dpr, H * dpr), g = c.getContext('2d');
  g.scale(dpr, dpr);
  const water = g.createRadialGradient(W / 2, H * 0.45, 0, W / 2, H * 0.45, Math.max(W, H) * 0.75);
  water.addColorStop(0, '#2f6f6a');
  water.addColorStop(0.7, '#1d4c4f');
  water.addColorStop(1, '#14363b');
  g.fillStyle = water; g.fillRect(0, 0, W, H);
  // Caustic shimmer on the pond floor.
  const n = valueNoise(Math.ceil(W / 6), Math.ceil(H / 6), 5, rand);
  const tw = Math.ceil(W / 6), th = Math.ceil(H / 6);
  const t = makeCanvas(tw, th), tg = t.getContext('2d'), img = tg.createImageData(tw, th);
  for (let i = 0; i < tw * th; i++) {
    const v = Math.abs(n[i] - 0.5) < 0.04 ? 1 : 0;
    img.data[i * 4] = 190; img.data[i * 4 + 1] = 240; img.data[i * 4 + 2] = 230; img.data[i * 4 + 3] = v * 40;
  }
  tg.putImageData(img, 0, 0);
  g.imageSmoothingEnabled = true;
  g.drawImage(t, 0, 0, W, H);
  // Stones around the rim.
  for (let i = 0; i < (W + H) / 9; i++) {
    const side = rand() * 4 | 0, u = rand();
    const [x, y] = side === 0 ? [u * W, rand() * 14] : side === 1 ? [W - rand() * 14, u * H] : side === 2 ? [u * W, H - rand() * 14] : [rand() * 14, u * H];
    g.fillStyle = `hsl(${30 + rand() * 20},${6 + rand() * 8}%,${40 + rand() * 25}%)`;
    g.beginPath(); g.ellipse(x, y, 12 + rand() * 16, 9 + rand() * 10, rand() * 3, 0, Math.PI * 2); g.fill();
  }
  // Lily pads and a flower.
  const pad = (x, y, r) => {
    g.fillStyle = '#4f8a3a';
    g.beginPath(); g.moveTo(x, y); g.arc(x, y, r, 0.3, Math.PI * 2 - 0.1); g.closePath(); g.fill();
    g.strokeStyle = 'rgba(30,70,25,0.4)'; g.lineWidth = 1;
    for (let k = 0; k < 7; k++) { const a = 0.5 + k * 0.8; g.beginPath(); g.moveTo(x, y); g.lineTo(x + Math.cos(a) * r * 0.9, y + Math.sin(a) * r * 0.9); g.stroke(); }
  };
  pad(W * 0.12, H * 0.16, 26); pad(W * 0.2, H * 0.1, 18); pad(W * 0.86, H * 0.82, 30); pad(W * 0.78, H * 0.9, 20);
  g.fillStyle = '#f7c2d4';
  for (let k = 0; k < 8; k++) {
    const a = k * Math.PI / 4;
    g.beginPath(); g.ellipse(W * 0.86 + Math.cos(a) * 7, H * 0.82 + Math.sin(a) * 7, 8, 4, a, 0, Math.PI * 2); g.fill();
  }
  g.fillStyle = '#ffe27a';
  g.beginPath(); g.arc(W * 0.86, H * 0.82, 4, 0, Math.PI * 2); g.fill();
  return c;
}
