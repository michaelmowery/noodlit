// Latte art: the sample Stir environment.
//   Look:  a cup of coffee from above. Your finger pours a line of steamed milk onto the crema.
//   Stir:  the cup is turning, slowly, faster towards the middle. Lines are wound into
//          spirals and into each other, spread out, and mix away into the coffee. The speed
//          slider sets how fast; Hold stops the cup. The Latte pick brush pours nothing: it
//          drags the milk that's already there, the way a barista etches a pattern.
//   Clear: "Stir" gives the cup a proper whirl and everything mixes in.
//
// Nothing here is pixels: each line is a string of points carried round by the swirl (and
// typed words are a cloud of points), so the milk stays crisp however far it's wound.

import { clamp, smoothstep, mulberry32, makeCanvas, layoutFor, drawText, draftMethods, HAND } from '../lib/util.js';
import { stageCanvas, blob, mottle } from '../lib/fade.js';
import { textDots } from '../lib/textdots.js';
import { sfx } from '../lib/sound.js';

const PALETTE = [
  { name: 'Milk', color: '#fbf1dc' },
  { name: 'Caramel', color: '#eeb45e' },
  { name: 'Matcha', color: '#c3d984' },
  { name: 'Strawberry', color: '#f7a9bb' },
  { name: 'Cocoa', color: '#2a1508' },
];

const NO_OVERLAY = { apply() {}, restore() {} };
const WHIRL = 2.2;        // seconds the Stir button's whirl lasts
const TURNS = 0.9;        // turns a line makes, half-way out, before it has mixed in
const MAX_POINTS = 9000;

export const latte = {
  id: 'latte',
  name: 'Latte art',
  mode: 'stir',
  blurb: 'Pour milk lines; the cup swirls them away',
  surface: 'Cup of coffee to pour milk lines on',
  clearLabel: 'Stir',
  clearIcon: 'M12 4a8 8 0 1 1-8 8M12 8a4 4 0 1 0 4 4M4 12a8 8 0 0 1 2-5.3M12 12h.01',
  palette: PALETTE,
  create: () => new Latte(),
};

class Latte {
  constructor() {
    this.ink = PALETTE[0].color;
    this.strokes = new Map();
    this.lines = [];        // { ink, pts: [x, y, …], r, age, dots? }
    this.fadeSeconds = 20;
    this.paused = false;
    this.whirl = 0;         // seconds of whirl left
    this.frame = 0;
    this.calm = typeof matchMedia === 'function' && matchMedia('(prefers-reduced-motion: reduce)').matches;
  }

  get clearing() { return this.whirl > 0; }

  // ---------------------------------------------------------------- setup
  resize({ width, height, dpr }) {
    this.dropDraft();
    // Keep the milk where it was, relative to the middle of the cup.
    if (this.W) {
      const k = Math.min(width / this.W, height / this.H), ox = this.cx, oy = this.cy;
      for (const ln of this.lines) {
        for (let i = 0; i < ln.pts.length; i += 2) {
          ln.pts[i] = width / 2 + (ln.pts[i] - ox) * k;
          ln.pts[i + 1] = height * 0.46 + (ln.pts[i + 1] - oy) * k;
        }
      }
    }
    Object.assign(this, { W: width, H: height, dpr, cx: width / 2, cy: height * 0.46, R: Math.min(width, height) * 0.5 });
    this.base = paintCoffee(width, height, dpr);
    this.strokes.clear();
  }

  setFadeSeconds(s) { this.fadeSeconds = s; }
  setPaused(p) { this.paused = p; }
  setInk(color) { this.ink = color; }

  // ---------------------------------------------------------------- strokes
  radiusFor(info) {
    const b = 4.5;
    return info.pointerType === 'pen' ? b * (0.5 + 0.9 * (info.pressure || 0.5))
         : info.pointerType === 'mouse' ? b * 0.85 : b;
  }

  strokeStart(id, x, y, info) {
    const r = this.radiusFor(info, 0);
    if (this.brushType?.drag) { this.strokes.set(id, { drag: true, x, y, reach: 22 + r * 3 }); return; }
    const line = { ink: this.ink, pts: [x, y], r, age: 0 };
    this.lines.push(line);
    this.strokes.set(id, { x, y, line, rsum: r, n: 1 });
  }

  strokeMove(id, x, y, info) {
    const s = this.strokes.get(id);
    if (!s) return;
    const d = Math.hypot(x - s.x, y - s.y);
    if (s.drag) {
      if (d < 0.5) return;
      this.pull(s.x, s.y, x - s.x, y - s.y, s.reach);
      Object.assign(s, { x, y });
      return;
    }
    if (d < 1.5) return;
    s.rsum += this.radiusFor(info, 0); s.n++;
    s.line.r = s.rsum / s.n;
    s.line.pts.push(x, y);
    s.line.age = 0; // a line doesn't start to mix until you've finished pouring it
    Object.assign(s, { x, y });
  }

  strokeEnd(id) { this.strokes.delete(id); }

  // The pick: milk near the finger is dragged along with it, less the further away it is.
  pull(x, y, dx, dy, reach) {
    const k = 1 / (2 * reach * reach), far = reach * reach * 9;
    for (const ln of this.lines) {
      const p = ln.pts;
      for (let i = 0; i < p.length; i += 2) {
        const ex = p[i] - x, ey = p[i + 1] - y, d2 = ex * ex + ey * ey;
        if (d2 > far) continue;
        const w = Math.exp(-d2 * k);
        p[i] += dx * w;
        p[i + 1] += dy * w;
      }
    }
  }

  // ---------------------------------------------------------------- stir
  clear() {
    this.commitDraft();
    this.strokes.clear();
    if (!this.lines.length || this.whirl > 0) return;
    this.whirl = WHIRL;
    sfx.cue('pour');
  }

  // Seconds a line lasts once it's poured.
  get life() { return Math.max(3, this.fadeSeconds); }

  update(dt) {
    const drafts = this.hasDrafts();
    if (!this.lines.length) { this.whirl = 0; return drafts; }
    if (this.paused && this.whirl <= 0) return drafts;

    // How fast the cup turns (rad/s at the reference radius), and how fast milk mixes in.
    let omega = (Math.PI * 2 * TURNS) / this.life, hurry = 1, boost = 0;
    if (this.whirl > 0) {
      const u = 1 - this.whirl / WHIRL;
      boost = 9 * Math.sin(Math.PI * Math.min(1, u * 1.15));
      hurry = this.life / (WHIRL * 0.9);
      this.whirl = Math.max(0, this.whirl - dt);
    }
    if (this.calm) { omega *= 0.25; boost *= 0.2; }

    const { cx, cy, R, life } = this;
    const pouring = new Set();
    for (const s of this.strokes.values()) if (s.line) pouring.add(s.line);
    let count = 0;
    for (const ln of this.lines) {
      if (!pouring.has(ln) || this.whirl > 0) ln.age += dt * hurry;
      // Fresh milk sits for a moment before the swirl takes hold of it, so words stay readable.
      const grip = 0.12 + 0.88 * smoothstep(0.1, 0.65, ln.age / life);
      const turn = (omega * grip + boost) * dt;
      const p = ln.pts;
      for (let i = 0; i < p.length; i += 2) {
        const dx = p[i] - cx, dy = p[i + 1] - cy;
        const q = Math.hypot(dx, dy) / R;
        const a = turn / (0.3 + Math.pow(q, 1.3));
        const c = Math.cos(a), s = Math.sin(a);
        p[i] = cx + dx * c - dy * s;
        p[i + 1] = cy + dx * s + dy * c;
      }
      count += p.length / 2;
    }
    this.lines = this.lines.filter((ln) => ln.age < life);

    // As a line is wound up its points drift apart: add more so it stays a smooth curve.
    if (++this.frame % 4 === 0 && count < MAX_POINTS) {
      for (const ln of this.lines) {
        if (ln.dots) continue;
        const p = ln.pts;
        let out = null;
        for (let i = 2; i < p.length; i += 2) {
          if (Math.hypot(p[i] - p[i - 2], p[i + 1] - p[i - 1]) > 9) {
            if (!out) out = p.slice(0, i);
            out.push((p[i] + p[i - 2]) / 2, (p[i + 1] + p[i - 1]) / 2);
          }
          if (out) out.push(p[i], p[i + 1]);
        }
        if (out) {
          // A stroke still being poured keeps its own array (the finger appends to it).
          if (pouring.has(ln)) { p.length = 0; p.push(...out); } else ln.pts = out;
        }
      }
    }
    return true;
  }

  // For the scene menu's preview: part-way wound up.
  preview() {
    const keep = this.fadeSeconds;
    this.fadeSeconds = 10;
    for (let i = 0; i < 46; i++) this.update(0.1);
    this.fadeSeconds = keep;
  }

  // ---------------------------------------------------------------- draw
  render(ctx) {
    const { dpr, life } = this;
    ctx.setTransform(1, 0, 0, 1, 0, 0);
    ctx.drawImage(this.base, 0, 0);
    ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
    ctx.lineCap = ctx.lineJoin = 'round';
    for (const ln of this.lines) {
      const u = ln.age / life;
      const a = 1 - smoothstep(0.45, 1, u);
      if (a <= 0.01) continue;
      const spread = 1 + 0.9 * u;   // milk spreads out as it mixes in
      const p = ln.pts;
      if (ln.dots) {
        const s = 2 * spread;
        ctx.globalAlpha = a * 0.92;
        ctx.fillStyle = ln.ink;
        ctx.beginPath();
        for (let i = 0; i < p.length; i += 2) ctx.rect(p[i] - s / 2, p[i + 1] - s / 2, s, s);
        ctx.fill();
        continue;
      }
      ctx.strokeStyle = ln.ink;
      ctx.beginPath();
      ctx.moveTo(p[0], p[1]);
      if (p.length === 2) ctx.lineTo(p[0] + 0.01, p[1]);
      for (let i = 2; i < p.length; i += 2) ctx.lineTo(p[i], p[i + 1]);
      // A soft edge where it bleeds into the crema, then the milk itself.
      ctx.globalAlpha = a * 0.22;
      ctx.lineWidth = ln.r * 2 * spread * 1.9;
      ctx.stroke();
      ctx.globalAlpha = a * 0.94;
      ctx.lineWidth = ln.r * 2 * spread;
      ctx.stroke();
    }
    ctx.globalAlpha = 1;
    for (const d of this.held || []) this.drawBlock(ctx, d);
    if (this.draft) this.drawBlock(ctx, this.draft);
    ctx.setTransform(1, 0, 0, 1, 0, 0);
  }

  // ---------------------------------------------------------------- text
  intro(text, opts = {}) { this.onCommit([this.stampText(text, opts)]); }

  stampText(text, opts) {
    const g = (this.measure ||= makeCanvas(4, 4).getContext('2d'));
    const { lay, place } = layoutFor(g, text, opts, {
      W: this.W, H: this.H, size: Math.min(this.W * 0.15, 76), weight: 600,
    });
    return { overlay: NO_OVERLAY, lay, place, ink: this.ink };
  }

  drawBlock(g, { lay, place, ink }) {
    g.save();
    g.fillStyle = g.strokeStyle = ink;
    g.font = `600 ${lay.size}px ${HAND}`;
    drawText(g, lay, place, Math.max(1, lay.size * 0.03));
    g.restore();
  }

  // Done typing: the words become a cloud of milk the cup can carry off.
  onCommit(blocks) {
    for (const b of blocks) {
      const pts = textDots(this.W, this.H, b, 600, 1.7);
      if (pts.length) this.lines.push({ ink: b.ink, pts, r: 1.2, age: 0, dots: true });
    }
  }

  dispose() {}
}

Object.assign(Latte.prototype, draftMethods);

// Coffee seen from above, close enough that the cup's rim is out of frame: dark in the
// middle, a paler ring of crema, faint streaks from the last stir and a few bubbles.
function paintCoffee(W, H, dpr) {
  const rand = mulberry32(73);
  const { c, g } = stageCanvas(W, H, dpr);
  const cx = W / 2, cy = H * 0.46, far = Math.hypot(W, H) * 0.62;
  const gr = g.createRadialGradient(cx, cy, 0, cx, cy, far);
  gr.addColorStop(0, '#7a4a25');
  gr.addColorStop(0.45, '#6a3d1c');
  gr.addColorStop(0.8, '#55301a');
  gr.addColorStop(1, '#2e180c');
  g.fillStyle = gr; g.fillRect(0, 0, W, H);
  mottle(g, W, H, rand, { light: 34, dark: 46, scale: 6 });

  // Streaks of paler crema, curling round the middle.
  g.lineCap = 'round';
  for (let k = 0; k < 26; k++) {
    const r = far * (0.08 + rand() * 0.85), a0 = rand() * Math.PI * 2, sweep = 0.5 + rand() * 1.6;
    g.strokeStyle = `rgba(214,160,100,${0.03 + rand() * 0.06})`;
    g.lineWidth = 3 + rand() * 16;
    g.beginPath();
    for (let t = 0; t <= 1.001; t += 0.05) {
      const a = a0 + sweep * t, rr = r * (1 + 0.14 * t);
      g.lineTo(cx + Math.cos(a) * rr, cy + Math.sin(a) * rr);
    }
    g.stroke();
  }
  blob(g, cx - W * 0.2, cy - H * 0.2, W * 0.5, H * 0.3, 'rgba(255,220,170,0.07)');

  // Fine bubbles, mostly out towards the edge.
  for (let k = 0; k < (W * H) / 2600; k++) {
    const a = rand() * Math.PI * 2, r = far * (0.35 + 0.65 * Math.sqrt(rand()));
    const x = cx + Math.cos(a) * r, y = cy + Math.sin(a) * r, s = 0.6 + rand() * rand() * 2.6;
    g.strokeStyle = `rgba(240,200,150,${0.12 + rand() * 0.2})`;
    g.lineWidth = 0.6;
    g.beginPath(); g.arc(x, y, s, 0, Math.PI * 2); g.stroke();
  }
  const vg = g.createRadialGradient(cx, cy, Math.min(W, H) * 0.35, cx, cy, far);
  vg.addColorStop(0, 'rgba(0,0,0,0)');
  vg.addColorStop(1, 'rgba(0,0,0,0.45)');
  g.fillStyle = vg; g.fillRect(0, 0, W, H);
  return c;
}
