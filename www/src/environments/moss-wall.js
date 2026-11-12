// Moss wall: the sample Grow environment.
//   Look:  an old stone wall. Your finger leaves a thin green trace.
//   Grow:  lift your finger and moss fills in along the line, clump by clump.
//   Keep:  nothing fades. The wall is saved on this device, so it's still here next time, and
//          moss from an earlier visit has come into flower. It builds up for as long as you let it.
//   Clear: "Scrape clean" takes it back to bare stone (Undo brings it back).
//
// What's saved is the lines themselves (not pixels), in localStorage, so the wall can be
// regrown at any screen size. Show me and the menu preview use setDemo(true): your own wall
// is set aside, nothing is saved, and it comes back when the demo ends.

import { clamp, smoothstep, mulberry32, makeCanvas, layoutFor, drawText, draftMethods, HAND } from '../lib/util.js';
import { stageCanvas, mottle } from '../lib/fade.js';
import { textDots } from '../lib/textdots.js';
import { sfx } from '../lib/sound.js';

const PALETTE = [
  { name: 'Moss', color: '#6aa343' },
  { name: 'Fern', color: '#3f9160' },
  { name: 'Lichen', color: '#a9c79c' },
  { name: 'Golden', color: '#c2ae3e' },
  { name: 'Autumn', color: '#bd6a3c' },
  { name: 'Heather', color: '#a078b8' },
];

const KEY = 'noodlit.grow.moss-wall';
const BUDGET = 350000;   // characters of saved wall; the oldest lines go first past this
const GROW = 1.3;        // seconds for one clump to fill out
const SCRAPE = 0.9;
const NO_OVERLAY = { apply() {}, restore() {} };
const FLOWERS = ['#ffffff', '#ffd6e6', '#fff0a8', '#e6dcff'];

export const mossWall = {
  id: 'moss-wall',
  name: 'Moss wall',
  mode: 'grow',
  blurb: 'Moss grows where you draw, and stays for next time',
  surface: 'Stone wall to grow moss on',
  clearLabel: 'Scrape clean',
  clearIcon: 'M5 19h14M7 16l8.5-11 3 2.3L10 18.3zM7 16l3 2.3',
  palette: PALETTE,
  create: () => new MossWall(),
};

function shade(hex, t) {
  const n = parseInt(hex.slice(1), 16);
  const to = t > 0 ? 255 : 0, k = Math.abs(t);
  const ch = (v) => Math.round(v + (to - v) * k);
  return `rgb(${ch(n >> 16)},${ch((n >> 8) & 255)},${ch(n & 255)})`;
}

function loadWall() {
  try {
    const list = JSON.parse(localStorage.getItem(KEY));
    return Array.isArray(list) ? list.filter((r) => r && Array.isArray(r.p) && r.p.length >= 2 && r.w > 0 && r.h > 0) : [];
  } catch { return []; }
}

class MossWall {
  constructor() {
    this.ink = PALETTE[0].color;
    this.strokes = new Map();
    this.records = [];     // every line and typed block on the wall, oldest first
    this.growing = [];     // records still filling in: { rec, clumps, t, span }
    this.ops = [];         // undo: { add: true } or { scrape: [records] }
    this.pushes = 0;
    this.bits = [];        // scrapings falling off
    this.scrape = null;    // { t, c } while the old moss comes away
    this.loaded = false;
    this.demo = false;
    this.rand = mulberry32(61);
    this.calm = typeof matchMedia === 'function' && matchMedia('(prefers-reduced-motion: reduce)').matches;
  }

  get clearing() { return !!this.scrape; }

  // ---------------------------------------------------------------- setup
  resize({ width, height, dpr }) {
    this.dropDraft();
    Object.assign(this, { W: width, H: height, dpr });
    this.base = paintWall(width, height, dpr);
    if (!this.loaded && !this.demo) this.load();
    this.strokes.clear();
    this.scrape = null;
    this.rebake();
  }

  load() {
    this.loaded = true;
    this.records = loadWall();
    // Anything already on the wall is from an earlier visit: it has had time to flower.
    for (const r of this.records) r.old = true;
  }

  save() {
    if (this.demo) return;
    try {
      let list = this.records.map(({ k, c, r, s, t, w, h, p }) => ({ k, c, r, s, t, w, h, p }));
      let json = JSON.stringify(list);
      while (json.length > BUDGET && list.length > 1) {
        list = list.slice(Math.ceil(list.length / 10));
        json = JSON.stringify(list);
      }
      localStorage.setItem(KEY, json);
    } catch { /* private mode or full: the wall just lasts for this visit */ }
  }

  // Show me (and the menu preview) get a bare wall of their own; yours comes back afterwards.
  setDemo(on) {
    if (on === this.demo) return;
    this.demo = on;
    if (on) {
      this.kept = { records: this.records, ops: this.ops };
      this.records = [];
      this.ops = [];
    } else {
      if (!this.loaded) this.load();
      else { this.records = this.kept.records; this.ops = this.kept.ops; }
      this.kept = null;
      this.dropDraft();
      this.bits = [];
      this.scrape = null;
    }
    if (this.W) this.rebake();
  }

  layer() {
    const c = makeCanvas(this.W * this.dpr, this.H * this.dpr), g = c.getContext('2d');
    g.setTransform(this.dpr, 0, 0, this.dpr, 0, 0);
    g.lineCap = g.lineJoin = 'round';
    c.g = g;
    return c;
  }

  // Regrow the whole wall from its records (after a resize, an undo, or a demo).
  rebake() {
    this.moss = this.layer();
    this.growing = [];
    for (const rec of this.records) {
      this.trace(rec);
      for (const cl of this.clumpsFor(rec)) this.clump(this.moss.g, cl, 1);
    }
  }

  setFadeSeconds() {}
  setPaused() {}
  setInk(color) { this.ink = color; }

  // ---------------------------------------------------------------- records
  // A record's points were saved at the screen size it was drawn on; fit them to this one.
  fit(rec) {
    const k = Math.min(this.W / rec.w, this.H / rec.h);
    return { k, x: (v) => this.W / 2 + (v - rec.w / 2) * k, y: (v) => this.H / 2 + (v - rec.h / 2) * k };
  }

  // The thin trace your finger leaves, which the moss then covers.
  trace(rec) {
    if (rec.k !== 'p') return;
    const f = this.fit(rec), g = this.moss.g, p = rec.p;
    g.strokeStyle = shade(rec.c, -0.55);
    g.globalAlpha = 0.8;
    g.lineWidth = Math.max(1, rec.r * f.k * 0.7);
    g.beginPath();
    g.moveTo(f.x(p[0]), f.y(p[1]));
    for (let i = 2; i < p.length; i += 2) g.lineTo(f.x(p[i]), f.y(p[i + 1]));
    if (p.length === 2) g.lineTo(f.x(p[0]) + 0.01, f.y(p[1]));
    g.stroke();
    g.globalAlpha = 1;
  }

  // The clumps of moss along a record: always the same ones for the same record.
  clumpsFor(rec) {
    const rand = mulberry32(rec.s), f = this.fit(rec), p = rec.p, out = [];
    const bloom = rec.old ? (rec.k === 'p' ? 0.16 : 0.045) : 0;
    const add = (x, y, R, delay) => {
      const cl = { x, y, R, delay, col: shade(rec.c, (rand() - 0.5) * 0.5), lite: shade(rec.c, 0.3 + rand() * 0.25), dark: shade(rec.c, -0.6) };
      if (rand() < bloom) cl.flower = FLOWERS[Math.floor(rand() * FLOWERS.length)];
      out.push(cl);
    };
    if (rec.k === 'd') {
      // Typed letters: one small clump per sampled point.
      for (let i = 0; i < p.length; i += 2) add(f.x(p[i]) + (rand() - 0.5), f.y(p[i + 1]) + (rand() - 0.5), (1.7 + rand() * 1.1) * Math.max(0.7, f.k), rand() * 0.9);
      return out;
    }
    const r = rec.r * f.k, gap = Math.max(2.2, r * 0.62);
    let len = 0;
    for (let i = 2; i < p.length; i += 2) len += Math.hypot(p[i] - p[i - 2], p[i + 1] - p[i - 1]) * f.k;
    const spread = Math.min(1.3, len / 320);   // seconds for growth to travel the line
    const drop = (x, y, along) => {
      const n = r > 7 ? 2 : 1;                 // a thick line is more than one clump wide
      for (let k = 0; k < n; k++) {
        const a = rand() * Math.PI * 2, d = rand() * r * (n > 1 ? 0.75 : 0.35);
        add(x + Math.cos(a) * d, y + Math.sin(a) * d, r * (0.75 + rand() * 0.75), (len ? along / len : 0) * spread + rand() * 0.3);
      }
    };
    drop(f.x(p[0]), f.y(p[1]), 0);
    let carry = gap, along = 0;
    for (let i = 2; i < p.length; i += 2) {
      const x0 = f.x(p[i - 2]), y0 = f.y(p[i - 1]), x1 = f.x(p[i]), y1 = f.y(p[i + 1]);
      const d = Math.hypot(x1 - x0, y1 - y0);
      while (carry <= d) {
        const t = d ? carry / d : 0;
        drop(x0 + (x1 - x0) * t, y0 + (y1 - y0) * t, along + carry);
        carry += gap;
      }
      carry -= d;
      along += d;
    }
    return out;
  }

  // One clump, `grow` of the way grown (0..1): a soft shadow, the tuft, a lit side, maybe a flower.
  clump(g, cl, grow) {
    const R = cl.R * (0.25 + 0.75 * grow);
    g.globalAlpha = 0.45 * grow;
    g.fillStyle = cl.dark;
    g.beginPath(); g.arc(cl.x + R * 0.12, cl.y + R * 0.3, R * 1.08, 0, Math.PI * 2); g.fill();
    g.globalAlpha = grow;
    g.fillStyle = cl.col;
    g.beginPath(); g.arc(cl.x, cl.y, R, 0, Math.PI * 2); g.fill();
    g.globalAlpha = 0.3 * grow;
    g.fillStyle = cl.lite;
    g.beginPath(); g.arc(cl.x - R * 0.28, cl.y - R * 0.32, R * 0.36, 0, Math.PI * 2); g.fill();
    g.globalAlpha = 1;
    if (cl.flower && grow >= 1) {
      const pr = Math.max(1.9, cl.R * 0.5);
      g.fillStyle = cl.flower;
      for (let k = 0; k < 5; k++) {
        const a = (k / 5) * Math.PI * 2 + cl.x;
        g.beginPath(); g.arc(cl.x + Math.cos(a) * pr, cl.y + Math.sin(a) * pr, pr * 0.78, 0, Math.PI * 2); g.fill();
      }
      g.fillStyle = '#f2b632';
      g.beginPath(); g.arc(cl.x, cl.y, pr * 0.6, 0, Math.PI * 2); g.fill();
    }
  }

  // A new line or typed block joins the wall and starts to grow.
  plant(rec) {
    Object.assign(rec, { c: this.ink, s: Math.floor(this.rand() * 1e9), t: Date.now(), w: Math.round(this.W), h: Math.round(this.H) });
    this.records.push(rec);
    this.ops.push({ add: true });
    if (this.ops.length > 40) this.ops.shift();
    this.pushes++;
    const clumps = this.clumpsFor(rec);
    let span = 0;
    for (const cl of clumps) if (cl.delay > span) span = cl.delay;
    if (this.calm) { for (const cl of clumps) this.clump(this.moss.g, cl, 1); } else this.growing.push({ rec, clumps, t: 0, span: span + GROW });
    this.save();
  }

  // ---------------------------------------------------------------- strokes
  radiusFor(info) {
    const b = 5;
    return info.pointerType === 'pen' ? b * (0.5 + 0.9 * (info.pressure || 0.5))
         : info.pointerType === 'mouse' ? b * 0.85 : b;
  }

  strokeStart(id, x, y, info) {
    if (this.scrape) return;
    const r = this.radiusFor(info, 0);
    const s = { x, y, r, rsum: r, n: 1, pts: [Math.round(x), Math.round(y)], lx: x, ly: y };
    this.strokes.set(id, s);
    this.dab(s, x, y, x, y);
  }

  dab(s, x0, y0, x1, y1) {
    const g = this.moss.g;
    g.strokeStyle = shade(this.ink, -0.55);
    g.globalAlpha = 0.8;
    g.lineWidth = Math.max(1, s.r * 0.7);
    g.beginPath(); g.moveTo(x0, y0); g.lineTo(x1 + 0.01, y1); g.stroke();
    g.globalAlpha = 1;
  }

  strokeMove(id, x, y, info) {
    const s = this.strokes.get(id);
    if (!s) return;
    if (Math.hypot(x - s.x, y - s.y) < 0.75) return;
    s.r += (this.radiusFor(info, 0) - s.r) * 0.25;
    s.rsum += s.r; s.n++;
    this.dab(s, s.x, s.y, x, y);
    Object.assign(s, { x, y });
    // Keep a point every few px: plenty to regrow the line from.
    if (Math.hypot(x - s.lx, y - s.ly) >= 3) { s.pts.push(Math.round(x), Math.round(y)); s.lx = x; s.ly = y; }
  }

  strokeEnd(id) {
    const s = this.strokes.get(id);
    if (!s) return;
    this.strokes.delete(id);
    if (s.pts.length > 2 && (s.lx !== s.x || s.ly !== s.y)) s.pts.push(Math.round(s.x), Math.round(s.y));
    this.plant({ k: 'p', r: Math.round((s.rsum / s.n) * 10) / 10, p: s.pts });
  }

  // ---------------------------------------------------------------- undo
  canUndo() { return this.ops.length > 0 && !this.strokes.size && !this.scrape && !this.hasDrafts(); }
  undoCount() { return this.pushes; }
  undo() {
    if (!this.canUndo()) return false;
    const op = this.ops.pop();
    if (op.add) this.records.pop();
    else this.records = op.scrape;
    this.rebake();
    this.save();
    return true;
  }

  // ---------------------------------------------------------------- scrape clean
  clear() {
    this.commitDraft();
    this.strokes.clear();
    if (!this.records.length || this.scrape) return;
    this.ops.push({ scrape: this.records });
    this.records = [];
    this.scrape = { t: 0, c: this.moss };
    // Whatever was still growing comes away at the size it had reached.
    for (const gr of this.growing) for (const cl of gr.clumps) this.clump(this.moss.g, cl, smoothstep(0, 1, clamp((gr.t - cl.delay) / GROW, 0, 1)));
    this.moss = this.layer();
    this.growing = [];
    if (!this.calm) {
      const rand = this.rand;
      for (let k = 0; k < 70; k++) {
        this.bits.push({ x: rand() * this.W, y: rand() * this.H * 0.9, vx: (rand() - 0.5) * 40, vy: rand() * 40, s: 1.5 + rand() * 3, t: -rand() * 0.4, life: 0.7 + rand() * 0.6, col: shade(PALETTE[Math.floor(rand() * 2)].color, -0.2 - rand() * 0.3) });
      }
    }
    sfx.cue('rake', { soft: true });
    this.save();
  }

  // ---------------------------------------------------------------- time
  update(dt) {
    let alive = false;
    if (this.growing.length) {
      for (const gr of this.growing) gr.t += dt;
      // Fully grown lines are painted onto the wall for good.
      const done = this.growing.filter((gr) => gr.t >= gr.span);
      for (const gr of done) for (const cl of gr.clumps) this.clump(this.moss.g, cl, 1);
      if (done.length) this.growing = this.growing.filter((gr) => gr.t < gr.span);
      alive = true;
    }
    if (this.scrape) {
      this.scrape.t += dt;
      if (this.scrape.t >= SCRAPE) this.scrape = null;
      alive = true;
    }
    if (this.bits.length) {
      for (const b of this.bits) {
        b.t += dt;
        if (b.t < 0) continue;
        b.vy += 700 * dt;
        b.x += b.vx * dt;
        b.y += b.vy * dt;
      }
      this.bits = this.bits.filter((b) => b.t < b.life);
      alive = true;
    }
    if (this.hasDrafts()) alive = true;
    return alive;
  }

  // For the scene menu's preview: fully grown.
  preview() {
    for (const gr of this.growing) gr.t = gr.span;
  }

  // ---------------------------------------------------------------- draw
  render(ctx) {
    const { dpr } = this;
    ctx.setTransform(1, 0, 0, 1, 0, 0);
    ctx.drawImage(this.base, 0, 0);
    if (this.scrape) {
      // The old moss slips down the wall as it goes.
      const u = this.scrape.t / SCRAPE;
      ctx.globalAlpha = 1 - smoothstep(0, 1, u);
      ctx.drawImage(this.scrape.c, 0, (this.calm ? 0 : u * u * 26) * dpr);
      ctx.globalAlpha = 1;
    }
    ctx.drawImage(this.moss, 0, 0);
    ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
    for (const gr of this.growing) {
      for (const cl of gr.clumps) {
        const u = (gr.t - cl.delay) / GROW;
        if (u > 0) this.clump(ctx, cl, smoothstep(0, 1, Math.min(1, u)));
      }
    }
    for (const d of this.held || []) this.drawBlock(ctx, d);
    if (this.draft) this.drawBlock(ctx, this.draft);
    for (const b of this.bits) {
      if (b.t < 0) continue;
      ctx.globalAlpha = clamp(1.3 - (b.t / b.life) * 1.3, 0, 1);
      ctx.fillStyle = b.col;
      ctx.fillRect(b.x, b.y, b.s, b.s);
    }
    ctx.globalAlpha = 1;
    ctx.setTransform(1, 0, 0, 1, 0, 0);
  }

  // ---------------------------------------------------------------- text
  intro(text, opts = {}) { this.onCommit([this.stampText(text, opts)]); }

  stampText(text, opts) {
    const { lay, place } = layoutFor(this.moss.g, text, opts, {
      W: this.W, H: this.H, size: Math.min(this.W * 0.15, 76), weight: 600,
    });
    return { overlay: NO_OVERLAY, lay, place, ink: this.ink };
  }

  // While typing, the words are a dark green stain on the stone; on Done they grow in as moss.
  drawBlock(g, { lay, place, ink }) {
    g.save();
    g.fillStyle = g.strokeStyle = shade(ink, -0.35);
    g.globalAlpha = 0.9;
    g.font = `600 ${lay.size}px ${HAND}`;
    drawText(g, lay, place, Math.max(1, lay.size * 0.04));
    g.restore();
  }

  onCommit(blocks) {
    for (const b of blocks) {
      const p = textDots(this.W, this.H, b, 600, 3).map(Math.round);
      if (p.length) this.plant({ k: 'd', r: 2, p });
    }
  }

  dispose() {}
}

Object.assign(MossWall.prototype, draftMethods);

// An old dry-stone wall: courses of uneven blocks, weathered, with dark mortar between them.
function paintWall(W, H, dpr) {
  const rand = mulberry32(88);
  const { c, g } = stageCanvas(W, H, dpr);
  g.fillStyle = '#2b2f2a'; g.fillRect(0, 0, W, H);
  const course = clamp(Math.min(W, H) / 6.5, 44, 78);
  for (let y = -rand() * course * 0.5, row = 0; y < H; row++) {
    const h = course * (0.8 + rand() * 0.4);
    for (let x = -rand() * course * 1.4; x < W;) {
      const w = course * (1.1 + rand() * 1.5);
      const v = Math.round(92 + rand() * 34), warm = rand() * 10;
      g.fillStyle = `rgb(${v + warm},${v + 3},${v - 6})`;
      g.beginPath(); g.roundRect(x + 2, y + 2, w - 4, h - 4, 5 + rand() * 5); g.fill();
      // Lit from above: a pale top edge, a shadowed lower one.
      g.strokeStyle = 'rgba(255,255,255,0.1)'; g.lineWidth = 1.5;
      g.beginPath(); g.moveTo(x + 8, y + 3.5); g.lineTo(x + w - 8, y + 3.5); g.stroke();
      g.strokeStyle = 'rgba(0,0,0,0.28)'; g.lineWidth = 2;
      g.beginPath(); g.moveTo(x + 7, y + h - 3); g.lineTo(x + w - 7, y + h - 3); g.stroke();
      x += w;
    }
    y += h;
  }
  mottle(g, W, H, rand, { light: 26, dark: 60, scale: 4 });
  // Damp, green-tinged stone low down and in the corners, where moss would start anyway.
  const damp = g.createLinearGradient(0, H * 0.45, 0, H);
  damp.addColorStop(0, 'rgba(40,70,40,0)');
  damp.addColorStop(1, 'rgba(40,70,40,0.4)');
  g.fillStyle = damp; g.fillRect(0, 0, W, H);
  const vg = g.createRadialGradient(W / 2, H * 0.45, Math.min(W, H) * 0.3, W / 2, H * 0.45, Math.hypot(W, H) * 0.62);
  vg.addColorStop(0, 'rgba(0,0,0,0)');
  vg.addColorStop(1, 'rgba(0,0,0,0.5)');
  g.fillStyle = vg; g.fillRect(0, 0, W, H);
  return c;
}
