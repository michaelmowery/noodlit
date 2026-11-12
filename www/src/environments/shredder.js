// Shredder: a Release environment.
//   Look:  pen on a sheet of printer paper, sitting in the slot of an office shredder.
//   Decay: none. Nothing fades while you draw.
//   Clear: drag the handle down (or tap "Shred"). The motor whirs, the page feeds down into
//          the slot and comes out the bottom as wiggly strips that drop into the bin. The
//          bin fills up over a few pages, then empties itself. A new sheet is fed in.

import { clamp, mulberry32, makeCanvas } from '../lib/util.js';
import { ReleaseScene, paintPaper, paperFibres, roundRect } from '../lib/release.js';
import { sfx } from '../lib/sound.js';

const PALETTE = [
  { name: 'Black', color: '#16171a' },
  { name: 'Blue pen', color: '#1c3f94' },
  { name: 'Red pen', color: '#b42318' },
  { name: 'Pencil', color: '#4b4b50' },
  { name: 'Green', color: '#22693a' },
  { name: 'Marker', color: '#7a2fbf' },
];

const FEED = 2.6;
const STRIP = 7;

export const shredder = {
  id: 'shredder',
  name: 'Shredder',
  blurb: 'Feed it through and hear it go',
  clearLabel: 'Shred',
  clearIcon: 'M5 4h14v8H5zM3 12h18v3H3zM7 15v6M10 15v5M14 15v6M17 15v5',
  surface: 'A sheet of paper in an office shredder. Drag the handle down to shred it.',
  fades: false,
  palette: PALETTE,
  create: () => new Shredder(),
};

class Shredder extends ReleaseScene {
  constructor() {
    super(46);
    this.ink = PALETTE[0].color;
    this.handleSide = 'bottom';
    this.arriveFrom = { x: 0, y: -40 };
    this.washUpAt = 1.2;
    this.washUp = 0.8;
    this.grain = 0.25;
    this.pile = 0;
    this.falling = [];
    this.motor = 0;
  }

  layout() {
    const { W, H } = this;
    const floor = H - clamp(H * 0.06, 30, 60);
    this.binH = clamp(H * 0.24, 130, 220);
    this.headH = 46;
    this.headTop = floor - this.binH - this.headH;
    this.floor = floor;
    const top = clamp(H * 0.09, 60, 100);
    const avail = this.headTop + 8 - top;
    let w = Math.min(W - 70, avail * 0.75), h = w / 0.75;
    if (h > avail) { h = avail; w = h * 0.75; }
    this.slot = this.headTop + 8;
    this.unitW = Math.min(W - 24, w + 70);
    return { x: (W - w) / 2, y: this.slot - h, w, h };
  }

  // The handle sits just above the slot so it never hides behind the shredder head.
  handleAnchor() {
    const r = this.rect;
    return { x: r.x + r.w / 2, y: r.y + r.h - 40 };
  }

  textArea() {
    const { w, h } = this.rect;
    return { x: w * 0.1, y: h * 0.08, w: w * 0.8, h: h * 0.72 };
  }

  paintScene() { return paintOffice(this); }

  paintSheet(w, h, dpr, seed) {
    return paintPaper(w, h, dpr, seed, (g, w, h, rand) => {
      paperFibres(g, w, h, rand, '#fdfdfb', 'rgba(140,140,150,0.04)');
    }, (g, w, h) => { g.beginPath(); g.rect(0, 0, w, h); });
  }

  launch(f) {
    sfx.cue('shred');
    this.motor = FEED + 0.4;
    f.strips = [];
    const n = Math.ceil(this.rect.w / STRIP);
    for (let i = 0; i < n; i++) f.strips.push({ i, wob: Math.random() * 6, curl: (Math.random() - 0.5) * 0.4, dy: Math.random() * 6 });
  }

  carry(f, dt) {
    const { h } = this.rect;
    f.passed = Math.min(1, f.t / FEED) * (h + this.headH + 12);
    f.x = f.from.x; f.s = 1; f.a = 0;
    f.y = f.from.y + f.passed;
    if (f.t > FEED && !f.dropped) {
      f.dropped = true;
      // Hand the strips to the bin.
      for (const s of f.strips) this.falling.push({ f, s, y: 0, v: 0, t: 0 });
    }
    return !f.dropped;
  }

  drawCarried(ctx, f) {
    const { w, h, x } = this.rect;
    const comp = f.sheet.comp, d = this.dpr;
    const top = f.y - h / 2;
    // Above the slot: what's left of the page, still whole.
    ctx.save();
    ctx.beginPath(); ctx.rect(0, 0, this.W, this.slot); ctx.clip();
    ctx.drawImage(comp, x, top, w, h);
    ctx.restore();
    // Below the head: strips wriggling out into the bin.
    const out = this.headTop + this.headH;
    ctx.save();
    ctx.beginPath(); ctx.rect(0, out, this.W, this.floor - out); ctx.clip();
    for (const s of f.strips) this.drawStrip(ctx, comp, d, s, x, top, out);
    ctx.restore();
  }

  drawStrip(ctx, comp, d, s, x, top, out, extraY = 0, alpha = 1) {
    const { h } = this.rect;
    const sx = s.i * STRIP;
    const sw = Math.min(STRIP, this.rect.w - sx);
    if (sw <= 0) return;
    const depth = Math.max(0, top + h - out);
    ctx.save();
    ctx.globalAlpha = alpha;
    ctx.translate(x + sx + Math.sin(depth * 0.04 + s.wob) * depth * 0.03, extraY + s.dy * (depth / h));
    ctx.rotate(s.curl * Math.min(1, depth / h) * 0.3);
    ctx.drawImage(comp, sx * d, 0, sw * d, comp.height, 0, top, sw - 0.8, h);
    ctx.restore();
  }

  updateFx(dt) {
    if (this.motor > 0) this.motor = Math.max(0, this.motor - dt);
    let done = 0;
    for (const p of this.falling) {
      p.t += dt; p.v += 900 * dt; p.y += p.v * dt;
      if (p.t > 0.6) done++;
    }
    if (this.falling.length && done === this.falling.length) {
      this.falling = [];
      this.pile += 1;
      if (this.pile > 6) this.pile = 0;
    }
    return this.motor > 0 || this.falling.length > 0;
  }

  drawBack(ctx) {
    // Strips settled in the bin.
    const { W } = this;
    const bx = (W - this.unitW) / 2 + 10, bw = this.unitW - 20;
    const level = Math.min(1, this.pile / 6) * (this.binH - 20);
    if (level > 0) {
      const rand = mulberry32(this.pile * 7 + 1);
      ctx.save();
      ctx.beginPath(); ctx.rect(bx, this.floor - level - 4, bw, level + 4); ctx.clip();
      for (let i = 0; i < 120 * this.pile; i++) {
        const x = bx + rand() * bw, y = this.floor - rand() * level;
        ctx.fillStyle = rand() < 0.1 ? '#c9d3e6' : '#f2f2ee';
        ctx.save(); ctx.translate(x, y); ctx.rotate((rand() - 0.5) * 2.5);
        ctx.fillRect(-1.5, -10, 3, 20); ctx.restore();
      }
      ctx.restore();
    }
  }

  drawFront(ctx) {
    const { W } = this;
    // Falling strips (after the page has fully gone through).
    if (this.falling.length) {
      const out = this.headTop + this.headH;
      ctx.save();
      ctx.beginPath(); ctx.rect(0, out, W, this.floor - out); ctx.clip();
      for (const p of this.falling) {
        const f = p.f;
        const top = f.y - this.rect.h / 2;
        this.drawStrip(ctx, f.sheet.comp, this.dpr, p.s, this.rect.x, top, out, p.y, Math.max(0, 1 - p.t / 0.6));
      }
      ctx.restore();
    }
    // Clear bin front.
    const ux = (W - this.unitW) / 2, binTop = this.headTop + this.headH;
    ctx.fillStyle = 'rgba(180,200,215,0.18)';
    ctx.fillRect(ux + 6, binTop, this.unitW - 12, this.floor - binTop);
    ctx.strokeStyle = 'rgba(255,255,255,0.4)';
    ctx.lineWidth = 2;
    ctx.strokeRect(ux + 6, binTop, this.unitW - 12, this.floor - binTop);
    ctx.fillStyle = 'rgba(255,255,255,0.18)';
    ctx.fillRect(ux + 16, binTop + 8, 8, this.floor - binTop - 16);
    // Shredder head.
    const shake = this.motor > 0 ? Math.sin(this.time * 90) * 0.8 : 0;
    ctx.save();
    ctx.translate(shake, 0);
    const hg = ctx.createLinearGradient(0, this.headTop, 0, this.headTop + this.headH);
    hg.addColorStop(0, '#4a4d55'); hg.addColorStop(1, '#2b2d33');
    ctx.fillStyle = hg;
    ctx.shadowColor = 'rgba(0,0,0,0.35)'; ctx.shadowBlur = 10; ctx.shadowOffsetY = 4;
    roundRect(ctx, ux, this.headTop, this.unitW, this.headH, 10);
    ctx.fill();
    ctx.shadowColor = 'transparent';
    // The slot.
    ctx.fillStyle = '#0d0e10';
    roundRect(ctx, this.rect.x - 8, this.slot - 3, this.rect.w + 16, 6, 3);
    ctx.fill();
    // Status light.
    ctx.fillStyle = this.motor > 0 ? '#ff5a4a' : '#5fe08a';
    ctx.beginPath(); ctx.arc(ux + this.unitW - 22, this.headTop + this.headH - 15, 4, 0, Math.PI * 2); ctx.fill();
    ctx.fillStyle = 'rgba(255,255,255,0.08)';
    ctx.fillRect(ux + 10, this.headTop + 3, this.unitW - 20, 4);
    ctx.restore();
  }
}

function paintOffice(e) {
  const { W, H, dpr } = e;
  const rand = mulberry32(2);
  const c = makeCanvas(W * dpr, H * dpr), g = c.getContext('2d');
  g.scale(dpr, dpr);
  const wall = g.createLinearGradient(0, 0, 0, H);
  wall.addColorStop(0, '#dfe3e6');
  wall.addColorStop(1, '#c4cace');
  g.fillStyle = wall; g.fillRect(0, 0, W, H);
  // Skirting and carpet.
  g.fillStyle = '#7d858c';
  g.fillRect(0, e.floor - 14, W, H);
  g.fillStyle = '#5d646b';
  g.fillRect(0, e.floor, W, H);
  for (let i = 0; i < W * 2; i++) {
    g.fillStyle = `rgba(${rand() < 0.5 ? '255,255,255' : '0,0,0'},0.05)`;
    g.fillRect(rand() * W, e.floor + rand() * (H - e.floor), 2, 2);
  }
  // A cork board with sticky notes, and a window glow.
  const bx = W * 0.06, by = H * 0.08, bw = Math.min(W * 0.24, 140), bh = bw * 0.8;
  g.fillStyle = '#b8895a'; g.fillRect(bx, by, bw, bh);
  for (const [nx, ny, col] of [[0.15, 0.2, '#ffe680'], [0.55, 0.15, '#ffb3c6'], [0.3, 0.55, '#a8e6ff']]) {
    g.fillStyle = col; g.fillRect(bx + bw * nx, by + bh * ny, bw * 0.3, bw * 0.3);
  }
  const win = g.createRadialGradient(W, 0, 0, W, 0, W * 0.8);
  win.addColorStop(0, 'rgba(255,255,240,0.5)');
  win.addColorStop(1, 'rgba(255,255,240,0)');
  g.fillStyle = win; g.fillRect(0, 0, W, H);
  // Bin body back wall and floor shadow under the unit.
  const ux = (W - e.unitW) / 2;
  g.fillStyle = 'rgba(0,0,0,0.25)';
  g.beginPath(); g.ellipse(W / 2, e.floor + 4, e.unitW * 0.55, 8, 0, 0, Math.PI * 2); g.fill();
  g.fillStyle = '#9aa4ad';
  g.fillRect(ux + 6, e.headTop + e.headH, e.unitW - 12, e.floor - e.headTop - e.headH);
  g.fillStyle = 'rgba(255,255,255,0.15)';
  g.fillRect(ux + 6, e.headTop + e.headH, e.unitW - 12, 10);
  return c;
}
