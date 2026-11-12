// Kite: a Release environment.
//   Look:  marker on a bright diamond kite flying over a breezy green hill, its string
//          running down to a stake in the grass.
//   Decay: none. Nothing fades while you draw.
//   Clear: drag the handle up (or tap "Cut string"). Snip: the string goes slack and the
//          kite tumbles up and away on the wind, tail fluttering, until it's a speck past
//          the clouds. A new kite is sent up.

import { clamp, mulberry32, makeCanvas } from '../lib/util.js';
import { ReleaseScene, fitRect, paintPaper, cloud } from '../lib/release.js';
import { sfx } from '../lib/sound.js';

const PALETTE = [
  { name: 'Black', color: '#1d1d24' },
  { name: 'Navy', color: '#1f2f7a' },
  { name: 'Red', color: '#c2271d' },
  { name: 'Forest', color: '#22663a' },
  { name: 'Purple', color: '#5b2a90' },
  { name: 'Brown', color: '#6b3b1a' },
];
const COLORS = [['#ffd34d', '#ff8a5c'], ['#8fd3ff', '#ffe27a'], ['#ffb3d1', '#b9f0a0'], ['#c9b3ff', '#ffd9a0']];
const FLY = 6.5;

export const kite = {
  id: 'kite',
  name: 'Kite',
  blurb: 'Cut the string and let it fly',
  clearLabel: 'Cut string',
  clearIcon: 'M12 2l7 8-7 12-7-12zM5 10h14M12 2v20M6 20l3-3M3 17l3 3',
  surface: 'A kite to draw on. Drag the handle up to cut the string.',
  fades: false,
  palette: PALETTE,
  create: () => new Kite(),
};

class Kite extends ReleaseScene {
  constructor() {
    super(19);
    this.ink = PALETTE[0].color;
    this.handleSide = 'top';
    this.arriveFrom = { x: -40, y: 90 };
    this.washUpAt = 1.8;
    this.washUp = 1.1;
    this.grain = 0.3;
    this.slack = null;
  }

  layout() {
    const { W, H } = this;
    this.ground = H - clamp(H * 0.15, 100, 150);
    const top = clamp(H * 0.08, 56, 100);
    const r = fitRect(30, top, W - 60, (this.ground - top) * 0.7, 0.74);
    this.anchor = { x: clamp(W * 0.18, 40, 140), y: this.ground + 26 };
    return r;
  }

  textArea() {
    const { w, h } = this.rect;
    return { x: w * 0.22, y: h * 0.2, w: w * 0.56, h: h * 0.45 };
  }

  paintScene() { return paintHill(this); }

  paintSheet(w, h, dpr, seed) {
    const [a, b] = COLORS[seed % COLORS.length];
    const top = h * 0.38;
    return paintPaper(w, h, dpr, seed, (g) => {
      g.fillStyle = a; g.fillRect(0, 0, w, h);
      g.fillStyle = b;
      g.beginPath(); g.moveTo(w / 2, 0); g.lineTo(w, top); g.lineTo(w / 2, top); g.closePath(); g.fill();
      g.beginPath(); g.moveTo(w / 2, top); g.lineTo(0, top); g.lineTo(w / 2, h); g.closePath(); g.fill();
      // Spars.
      g.strokeStyle = 'rgba(90,60,30,0.55)'; g.lineWidth = 3;
      g.beginPath(); g.moveTo(w / 2, 0); g.lineTo(w / 2, h); g.moveTo(0, top); g.lineTo(w, top); g.stroke();
      g.fillStyle = 'rgba(255,255,255,0.18)';
      g.beginPath(); g.moveTo(w / 2, 0); g.lineTo(0, top); g.lineTo(w / 2, top); g.fill();
    }, (g) => {
      g.beginPath(); g.moveTo(w / 2, 1); g.lineTo(w - 1, top); g.lineTo(w / 2, h - 1); g.lineTo(1, top); g.closePath();
    });
  }

  bridle(cx, cy, s = 1, a = 0) {
    const dy = this.rect.h * 0.1 * s;
    return { x: cx - Math.sin(a) * dy, y: cy + Math.cos(a) * dy };
  }

  launch(f) {
    sfx.cue('snip');
    const b = this.bridle(f.from.x, f.from.y);
    this.slack = { t: 0, x: b.x, y: b.y };
  }

  carry(f) {
    const t = f.t, q = t / FLY;
    // A jolt upward as the string lets go, then off on the wind.
    f.x = f.from.x + this.W * 0.75 * Math.pow(q, 1.2) + Math.sin(t * 2.2) * 14;
    f.y = f.from.y - (f.from.y + 120) * (1 - Math.pow(1 - q, 1.8));
    f.a = Math.sin(t * 2.6) * 0.35 + t * 0.12;
    f.s = 1 / (1 + t * 0.45);
    f.alpha = q > 0.85 ? (1 - q) / 0.15 : 1;
    return q < 1;
  }

  drawCarried(ctx, f) {
    const { w, h } = this.rect;
    ctx.save();
    ctx.globalAlpha = f.alpha;
    ctx.translate(f.x, f.y);
    ctx.rotate(f.a);
    ctx.scale(f.s, f.s);
    drawTail(ctx, 0, h / 2, h * 0.9, this.time);
    // The cut end of the string trailing behind.
    ctx.strokeStyle = 'rgba(255,255,255,0.8)'; ctx.lineWidth = 1.2;
    ctx.beginPath(); ctx.moveTo(0, h * 0.1); ctx.quadraticCurveTo(-30, h * 0.6, -10 + Math.sin(this.time * 3) * 10, h * 0.9); ctx.stroke();
    ctx.restore();
    this.drawSheetAt(ctx, f.sheet, f.x, f.y, f.s, f.a, f.alpha, 0.2);
  }

  drawBack(ctx) {
    const s = this.sheet, r = this.rect, A = this.anchor;
    if (s && s.arrive > 0.2) {
      const cx = r.x + r.w / 2 + s.offX, cy = r.y + r.h / 2 + s.offY;
      const b = this.bridle(cx, cy);
      ctx.strokeStyle = 'rgba(255,255,255,0.85)'; ctx.lineWidth = 1.3;
      ctx.beginPath(); ctx.moveTo(A.x, A.y); ctx.quadraticCurveTo((A.x + b.x) / 2 + 30, (A.y + b.y) / 2 + 30, b.x, b.y); ctx.stroke();
      drawTail(ctx, cx, cy + r.h / 2, r.h * 0.9, this.time);
    }
    // The cut string falls back to the grass.
    const sl = this.slack;
    if (sl && sl.t < 3) {
      const k = Math.min(1, sl.t / 1.2);
      const ex = sl.x + (A.x + 60 - sl.x) * k, ey = sl.y + (A.y - 10 - sl.y) * k * k;
      ctx.strokeStyle = 'rgba(255,255,255,0.8)'; ctx.lineWidth = 1.2;
      ctx.beginPath(); ctx.moveTo(A.x, A.y); ctx.quadraticCurveTo((A.x + ex) / 2, Math.max(A.y, ey) + 10 * k, ex, ey); ctx.stroke();
    }
    // The stake.
    ctx.fillStyle = '#7a5532';
    ctx.fillRect(A.x - 3, A.y - 6, 6, 22);
  }

  updateFx(dt) {
    if (this.slack) {
      this.slack.t += dt;
      if (this.slack.t > 3 && this.sheet) this.slack = null;
    }
    return !!this.slack && this.slack.t < 1.4;
  }
}

function drawTail(ctx, x, y, len, t) {
  ctx.save();
  ctx.strokeStyle = 'rgba(255,255,255,0.9)'; ctx.lineWidth = 1.2;
  ctx.beginPath(); ctx.moveTo(x, y);
  const pts = [];
  for (let i = 1; i <= 12; i++) {
    const k = i / 12;
    const px = x + Math.sin(t * 3 - k * 5) * 18 * k - k * 20, py = y + k * len;
    ctx.lineTo(px, py);
    if (i % 3 === 0) pts.push([px, py]);
  }
  ctx.stroke();
  const cols = ['#ff5c5c', '#ffd34d', '#5cb8ff', '#7ee07e'];
  pts.forEach(([px, py], i) => {
    ctx.fillStyle = cols[i % cols.length];
    ctx.beginPath(); ctx.moveTo(px, py); ctx.lineTo(px - 9, py - 5); ctx.lineTo(px - 9, py + 5); ctx.closePath(); ctx.fill();
    ctx.beginPath(); ctx.moveTo(px, py); ctx.lineTo(px + 9, py - 5); ctx.lineTo(px + 9, py + 5); ctx.closePath(); ctx.fill();
  });
  ctx.restore();
}

function paintHill(e) {
  const { W, H, dpr, ground } = e;
  const rand = mulberry32(44);
  const c = makeCanvas(W * dpr, H * dpr), g = c.getContext('2d');
  g.scale(dpr, dpr);
  const sky = g.createLinearGradient(0, 0, 0, ground);
  sky.addColorStop(0, '#4fa6e8');
  sky.addColorStop(1, '#bfe4fb');
  g.fillStyle = sky; g.fillRect(0, 0, W, H);
  for (let i = 0; i < 5; i++) cloud(g, rand() * W, 40 + rand() * ground * 0.6, 18 + rand() * 24, 'rgba(255,255,255,0.9)');
  g.fillStyle = '#7cc46a';
  g.beginPath(); g.moveTo(0, H);
  for (let x = 0; x <= W + 10; x += 10) g.lineTo(x, ground - 18 + Math.cos(x / W * Math.PI * 1.2) * 24);
  g.lineTo(W, H); g.fill();
  g.fillStyle = '#5faa50';
  g.beginPath(); g.moveTo(0, H);
  for (let x = 0; x <= W + 10; x += 10) g.lineTo(x, ground + 30 + Math.sin(x / W * 4) * 10);
  g.lineTo(W, H); g.fill();
  for (let i = 0; i < W / 3; i++) {
    const x = rand() * W, y = ground + rand() * (H - ground);
    g.strokeStyle = 'rgba(40,90,30,0.4)'; g.lineWidth = 1;
    g.beginPath(); g.moveTo(x, y); g.lineTo(x + 2, y - 6); g.stroke();
  }
  return c;
}
