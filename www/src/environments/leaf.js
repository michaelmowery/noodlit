// Autumn leaf: a Release environment.
//   Look:  brown ink on a big golden leaf, in a storybook park in autumn.
//   Decay: none. Nothing fades while you draw.
//   Clear: drag the handle to the right (or tap "Catch the wind"). A gust sweeps through,
//          the leaf shrinks to leaf size, tumbles and flutters up and away off the right
//          edge with a few other leaves, and the next one drifts down from the tree.

import { clamp, easeInOut, mulberry32, makeCanvas, valueNoise } from '../lib/util.js';
import { ReleaseScene, fitRect, paintPaper, cloud } from '../lib/release.js';
import { sfx } from '../lib/sound.js';

const LIFT = 0.7;
const FLIGHT = 5.5;
const COLORS = [['#f4c04a', '#e98a2c'], ['#f2a33a', '#d9572a'], ['#e9c35a', '#c9762e'], ['#f0b347', '#cf4f2f']];

// Inks that suit the material, default first.
const PALETTE = [
  { name: 'Brown', color: '#3b2210' },
  { name: 'Black', color: '#1a1410' },
  { name: 'Burgundy', color: '#6e1a22' },
  { name: 'Forest', color: '#234a22' },
  { name: 'Navy', color: '#1f2a5a' },
  { name: 'Plum', color: '#4e2350' },
];

export const leaf = {
  id: 'leaf',
  name: 'Autumn leaf',
  blurb: 'Let the autumn wind take it',
  clearLabel: 'Catch the wind',
  clearIcon: 'M3 8h10a3 3 0 1 0-3-3M3 12h15a3 3 0 1 1-3 3M3 16h7',
  surface: 'A big autumn leaf to draw on. Drag the handle to the right to let the wind take it.',
  fades: false,
  palette: PALETTE,
  create: () => new Leaf(),
};

class Leaf extends ReleaseScene {
  constructor() {
    super(63);
    this.ink = PALETTE[0].color;
    this.handleSide = 'right';
    this.arriveFrom = { x: 30, y: -120 };
    this.washUpAt = 1.8;
    this.washUp = 1.1;
    this.grain = 0.6;
    this.gust = 0;          // 0..1 strength of the passing gust
    this.flyers = [];       // small leaves caught in the gust
    this.streaks = [];
  }

  layout() {
    const { W, H } = this;
    const top = clamp(H * 0.08, 52, 100);
    const bottom = H - clamp(H * 0.15, 110, 150);
    return fitRect(24, top, W - 72, bottom - top, 0.72);
  }

  handleAnchor() { const r = this.rect; return { x: r.x + r.w * 0.97, y: r.y + r.h * 0.44 }; }

  textArea() {
    const { w, h } = this.rect;
    return { x: w * 0.16, y: h * 0.16, w: w * 0.68, h: h * 0.6 };
  }

  paintScene() { return paintPark(this); }

  paintSheet(w, h, dpr, seed) {
    return paintPaper(w, h, dpr, seed, (g, w, h, rand) => {
      const [a, b] = COLORS[seed % COLORS.length];
      const grad = g.createLinearGradient(0, 0, w * 0.4, h);
      grad.addColorStop(0, a);
      grad.addColorStop(1, b);
      g.fillStyle = grad; g.fillRect(0, 0, w, h);
      // Mottled patches.
      const s = 4, nw = Math.ceil(w / s), nh = Math.ceil(h / s);
      const n = valueNoise(nw, nh, 9, rand);
      const pc = makeCanvas(nw, nh), pg = pc.getContext('2d'), img = pg.createImageData(nw, nh);
      for (let i = 0; i < nw * nh; i++) {
        const v = n[i];
        img.data[i * 4] = v > 0.5 ? 255 : 150; img.data[i * 4 + 1] = v > 0.5 ? 230 : 60; img.data[i * 4 + 2] = v > 0.5 ? 120 : 20;
        img.data[i * 4 + 3] = Math.abs(v - 0.5) * 90;
      }
      pg.putImageData(img, 0, 0);
      g.drawImage(pc, 0, 0, w, h);
      // Veins: a midrib and side veins curving up to the edge.
      const base = h * 0.9, tip = h * 0.03;
      g.strokeStyle = 'rgba(255,240,190,0.45)';
      g.lineCap = 'round';
      g.lineWidth = 3;
      g.beginPath(); g.moveTo(w / 2, h); g.quadraticCurveTo(w * 0.52, h * 0.5, w / 2, tip); g.stroke();
      g.lineWidth = 1.6;
      for (let i = 1; i < 8; i++) {
        const y = base - (base - tip) * (i / 8.5);
        const reach = Math.sin((i / 8.5) * Math.PI) * w * 0.44;
        for (const sd of [-1, 1]) {
          g.beginPath(); g.moveTo(w / 2, y); g.quadraticCurveTo(w / 2 + sd * reach * 0.5, y - h * 0.03, w / 2 + sd * reach, y - h * 0.09 - rand() * h * 0.02); g.stroke();
        }
      }
      // Darker rim.
      g.strokeStyle = 'rgba(120,50,15,0.35)'; g.lineWidth = 6;
      leafPath(g, w, h, mulberry32(seed)); g.stroke();
    }, (g, w, h) => leafPath(g, w, h, mulberry32(seed)));
  }

  launch(f) {
    sfx.cue('gust');
    // The back of the leaf is paler; it shows while the leaf tumbles.
    const c = f.sheet.comp;
    f.back = makeCanvas(c.width, c.height);
    const bg = f.back.getContext('2d');
    bg.drawImage(c, 0, 0);
    bg.globalCompositeOperation = 'source-atop';
    bg.fillStyle = 'rgba(255,232,175,0.4)';
    bg.fillRect(0, 0, c.width, c.height);
    this.gust = 1;
    for (let i = 0; i < 9; i++) this.flyer(true);
    for (let i = 0; i < 14; i++) this.streak();
  }

  carry(f) {
    const { W } = this;
    const leafScale = clamp(150 / this.rect.w, 0.25, 0.55);
    if (f.t < LIFT) {
      const p = easeInOut(f.t / LIFT);
      f.x = f.from.x + p * 40;
      f.y = f.from.y - p * 60;
      f.s = 1 + (leafScale - 1) * p;
      f.a = p * 0.6;
      f.flip = 1;
      return true;
    }
    const t = f.t - LIFT;
    const q = t / FLIGHT;
    const sx = f.from.x + 40, sy = f.from.y - 60;
    f.x = sx + (W + 160 - sx) * Math.pow(q, 1.15) + Math.sin(t * 2.2 + f.seed) * 30;
    f.y = sy - this.H * 0.35 * q + Math.sin(t * 3.1 + f.seed) * 40 * (1 - q * 0.5);
    f.s = leafScale * (1 - q * 0.2);
    f.a = 0.6 + t * 2.4 + Math.sin(t * 2) * 0.6;
    f.flip = Math.cos(t * 4.2);
    return q < 1;
  }

  drawCarried(ctx, f) {
    const { w, h } = this.rect;
    this.compose(f.sheet);
    ctx.save();
    ctx.translate(f.x, f.y);
    ctx.rotate(f.a);
    ctx.scale(f.s * (Math.abs(f.flip) < 0.08 ? 0.08 * Math.sign(f.flip || 1) : f.flip), f.s);
    ctx.shadowColor = 'rgba(60,30,10,0.25)';
    ctx.shadowBlur = 10;
    ctx.shadowOffsetY = 10;
    ctx.drawImage(f.flip < 0 && f.back ? f.back : f.sheet.comp, -w / 2, -h / 2, w, h);
    ctx.restore();
  }

  flyer(gusting) {
    const r = this.rand;
    const [a] = COLORS[(r() * COLORS.length) | 0];
    this.flyers.push({
      x: gusting ? -20 - r() * this.W * 0.5 : r() * this.W, y: gusting ? this.H * (0.15 + r() * 0.6) : -20,
      vx: gusting ? 220 + r() * 200 : 10 + r() * 20, vy: gusting ? -30 + r() * 40 : 30 + r() * 25,
      size: 8 + r() * 8, rot: r() * 6, spin: (r() - 0.5) * 8, color: a, ph: r() * 6,
    });
  }

  streak() {
    const r = this.rand;
    this.streaks.push({ x: -r() * this.W * 0.8, y: this.H * (0.1 + r() * 0.75), len: 60 + r() * 120, v: 600 + r() * 400, ph: r() * 6 });
  }

  tapScene(x, y) {
    // A tap on the grass kicks up a leaf.
    this.flyers.push({ x, y, vx: (this.rand() - 0.5) * 80, vy: -120, size: 9, rot: 0, spin: 5, color: COLORS[0][1], ph: 0, kick: true });
  }

  updateFx(dt) {
    this.gust = Math.max(0, this.gust - dt * 0.35);
    for (const l of this.flyers) {
      l.x += (l.vx + Math.sin(this.time * 2 + l.ph) * 20) * dt;
      l.y += l.vy * dt;
      if (l.kick) l.vy += 160 * dt;
      l.rot += l.spin * dt;
    }
    this.flyers = this.flyers.filter((l) => l.x < this.W + 40 && l.y < this.H + 40 && l.y > -60);
    for (const s of this.streaks) s.x += s.v * dt;
    this.streaks = this.streaks.filter((s) => s.x - s.len < this.W);
    return this.gust > 0 || this.flyers.length > 0 || this.streaks.length > 0;
  }

  drawFront(ctx) {
    ctx.save();
    ctx.lineCap = 'round';
    for (const s of this.streaks) {
      ctx.strokeStyle = 'rgba(255,255,255,0.55)';
      ctx.lineWidth = 2;
      ctx.beginPath();
      for (let i = 0; i <= 10; i++) {
        const x = s.x - s.len * (i / 10);
        const y = s.y + Math.sin(x * 0.02 + s.ph) * 8;
        i ? ctx.lineTo(x, y) : ctx.moveTo(x, y);
      }
      ctx.stroke();
    }
    for (const l of this.flyers) {
      ctx.save();
      ctx.translate(l.x, l.y);
      ctx.rotate(l.rot);
      ctx.scale(Math.cos(this.time * 5 + l.ph), 1);
      ctx.fillStyle = l.color;
      smallLeaf(ctx, l.size);
      ctx.restore();
    }
    ctx.restore();
  }
}

// Broad leaf outline: stem at the bottom, tip at the top, gently toothed edges.
function leafPath(g, w, h, rand) {
  const cx = w / 2, tip = h * 0.02, base = h * 0.9;
  const pts = [];
  const N = 40;
  for (let i = 0; i <= N; i++) {
    const t = i / N;                  // 0 at tip, 1 at base
    const y = tip + (base - tip) * t;
    const width = Math.pow(Math.sin(Math.PI * Math.pow(t, 0.8)), 0.75) * (w / 2 - 3);
    const tooth = i % 2 ? 0 : 2.5 + rand() * 2;
    pts.push([width - tooth * (width > 10 ? 1 : 0), y]);
  }
  g.beginPath();
  g.moveTo(cx, tip);
  for (const [x, y] of pts) g.lineTo(cx + x, y);
  // Stem.
  g.lineTo(cx + 3, base);
  g.lineTo(cx + 2.5, h - 1);
  g.lineTo(cx - 2.5, h - 1);
  g.lineTo(cx - 3, base);
  for (const [x, y] of pts.slice().reverse()) g.lineTo(cx - x, y);
  g.closePath();
}

function smallLeaf(ctx, s) {
  ctx.beginPath();
  ctx.moveTo(0, -s);
  ctx.quadraticCurveTo(s * 0.8, -s * 0.2, 0, s);
  ctx.quadraticCurveTo(-s * 0.8, -s * 0.2, 0, -s);
  ctx.fill();
}

// ------------------------------------------------------------------ painting
function paintPark(e) {
  const { W, H, dpr, rect } = e;
  const rand = mulberry32(23);
  const c = makeCanvas(W * dpr, H * dpr), g = c.getContext('2d');
  g.scale(dpr, dpr);
  const sky = g.createLinearGradient(0, 0, 0, H);
  sky.addColorStop(0, '#9fcbe0');
  sky.addColorStop(0.55, '#f3dcb5');
  sky.addColorStop(1, '#f0c48e');
  g.fillStyle = sky; g.fillRect(0, 0, W, H);
  cloud(g, W * 0.2, H * 0.1, Math.min(W, H) * 0.06, 'rgba(255,255,255,0.85)');
  cloud(g, W * 0.75, H * 0.18, Math.min(W, H) * 0.045, 'rgba(255,255,255,0.75)');
  // Rolling hills.
  const hill = (y0, amp, color, ph) => {
    g.fillStyle = color;
    g.beginPath(); g.moveTo(0, H);
    for (let x = 0; x <= W + 8; x += 8) g.lineTo(x, y0 + Math.sin(x / W * Math.PI * 1.6 + ph) * amp);
    g.lineTo(W, H); g.closePath(); g.fill();
  };
  hill(H * 0.62, H * 0.03, '#d9a35f', 0.5);
  hill(H * 0.7, H * 0.025, '#c58748', 2.1);
  hill(H * 0.8, H * 0.02, '#a8743d', 4);
  // Trees with round autumn crowns.
  const tree = (x, y, r) => {
    g.fillStyle = '#5e3b22';
    g.fillRect(x - r * 0.1, y - r * 0.3, r * 0.2, r * 1.3);
    for (const [dx, dy, k, col] of [[0, -0.9, 1, '#d8622b'], [-0.6, -0.5, 0.75, '#e9893a'], [0.6, -0.55, 0.8, '#c9502a'], [0.1, -1.4, 0.7, '#efa43f']]) {
      g.fillStyle = col;
      g.beginPath(); g.arc(x + dx * r, y + dy * r, k * r, 0, Math.PI * 2); g.fill();
    }
  };
  const tr = clamp(Math.min(W, H) * 0.09, 30, 80);
  tree(W * 0.08, H * 0.66, tr * 0.8);
  tree(W * 0.93, H * 0.6, tr);
  tree(W * 0.6, H * 0.64, tr * 0.6);
  // Leaf litter on the ground.
  for (let i = 0; i < (W * (H * 0.3)) / 500; i++) {
    const x = rand() * W, y = H * 0.72 + rand() * H * 0.28;
    g.save(); g.translate(x, y); g.rotate(rand() * 6); g.scale(1, 0.6);
    g.fillStyle = COLORS[(rand() * COLORS.length) | 0][rand() < 0.5 ? 0 : 1];
    g.globalAlpha = 0.8;
    smallLeaf(g, 4 + rand() * 4);
    g.restore();
  }
  // A park bench, peeking out under the leaf.
  const by = Math.min(H - 70, rect.y + rect.h + 20), bx = W * 0.72;
  g.fillStyle = '#6b4428';
  g.fillRect(bx - 50, by - 22, 100, 6); g.fillRect(bx - 50, by - 12, 100, 6); g.fillRect(bx - 50, by, 100, 7);
  g.fillStyle = '#3d3d3d';
  g.fillRect(bx - 44, by + 7, 4, 16); g.fillRect(bx + 40, by + 7, 4, 16);
  return c;
}
