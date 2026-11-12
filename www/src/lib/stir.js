// Shared machinery for Stir surfaces: you draw, and the surface slowly winds your lines into
// each other until they mix away.
//
// Nothing here is pixels. Each line is a string of points carried round by a swirl that turns
// faster towards the middle (typed words are a cloud of points), so lines stay crisp however
// far they're wound. The shell's speed slider sets how long a line lasts; Hold stops the
// swirl; the tray button gives everything a proper whirl and it's gone. A brush with
// `drag: true` lays nothing down: it pulls what's already there around with the finger.
//
// A scene subclass provides paintBase() -> canvas, and may set (constructor options):
//   ink        default colour            brush    stroke radius in CSS px
//   turns      turns a line makes, half-way out, before it has mixed in
//   blend      canvas composite for the lines ('source-over', 'multiply', 'lighter')
//   edge       strength of the soft edge around a line (0 = none)
//   body       opacity of the line itself
//   spread     how much a line widens as it mixes in
//   mirror     n > 0: a kaleidoscope with n mirrored wedges
//   cue        sound for the whirl
// and optionally onExpire(line) when a line has mixed in, drawUnder(ctx) between the base and
// the lines (CSS px), and whirled() when the tray button's whirl ends.

import { smoothstep, makeCanvas, layoutFor, drawText, draftMethods, HAND } from './util.js';
import { textDots } from './textdots.js';
import { sfx } from './sound.js';

const NO_OVERLAY = { apply() {}, restore() {} };
const WHIRL = 2.2;        // seconds the tray button's whirl lasts
const MAX_POINTS = 9000;

export class StirScene {
  constructor(o = {}) {
    this.ink = o.ink || '#ffffff';
    this.brush = o.brush ?? 4.5;
    this.turns = o.turns ?? 0.9;
    this.blend = o.blend || 'source-over';
    this.edge = o.edge ?? 0.22;
    this.body = o.body ?? 0.94;
    this.spread = o.spread ?? 0.9;
    this.mirror = o.mirror || 0;
    this.cue = o.cue || 'pour';
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
    this.base = this.paintBase();
    this.strokes.clear();
  }

  setFadeSeconds(s) { this.fadeSeconds = s; }
  setPaused(p) { this.paused = p; }
  setInk(color) { this.ink = color; }

  // ---------------------------------------------------------------- strokes
  radiusFor(info) {
    const b = this.brush;
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

  // A drag brush: whatever is near the finger is dragged along with it, less the further away it is.
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
    sfx.cue(this.cue);
  }

  // Seconds a line lasts once it's poured.
  get life() { return Math.max(3, this.fadeSeconds); }

  update(dt) {
    const drafts = this.hasDrafts();
    if (!this.lines.length) {
      if (this.whirl > 0) { this.whirl = 0; this.whirled?.(); }
      return drafts || !!this.settling?.(dt);
    }
    if (this.paused && this.whirl <= 0) return drafts;

    // How fast the cup turns (rad/s at the reference radius), and how fast milk mixes in.
    let omega = (Math.PI * 2 * this.turns) / this.life, hurry = 1, boost = 0;
    if (this.whirl > 0) {
      const u = 1 - this.whirl / WHIRL;
      boost = 9 * Math.sin(Math.PI * Math.min(1, u * 1.15));
      hurry = this.life / (WHIRL * 0.9);
      this.whirl = Math.max(0, this.whirl - dt);
      if (this.whirl === 0) this.whirled?.();
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
    if (this.onExpire) for (const ln of this.lines) if (ln.age >= life) this.onExpire(ln);
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
    const { dpr, cx, cy } = this;
    ctx.setTransform(1, 0, 0, 1, 0, 0);
    ctx.drawImage(this.base, 0, 0);
    ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
    this.drawUnder?.(ctx);
    ctx.lineCap = ctx.lineJoin = 'round';
    ctx.globalCompositeOperation = this.blend;
    if (this.mirror) {
      // A kaleidoscope: the same lines in every wedge, every other wedge a mirror image.
      const n = this.mirror;
      for (let k = 0; k < n; k++) {
        for (const flip of [1, -1]) {
          ctx.save();
          ctx.translate(cx, cy);
          ctx.rotate((k / n) * Math.PI * 2);
          ctx.scale(1, flip);
          ctx.translate(-cx, -cy);
          this.drawLines(ctx, k > 0 || flip < 0);
          ctx.restore();
        }
      }
    } else this.drawLines(ctx);
    ctx.globalCompositeOperation = 'source-over';
    ctx.globalAlpha = 1;
    for (const d of this.held || []) this.drawBlock(ctx, d);
    if (this.draft) this.drawBlock(ctx, this.draft);
    ctx.setTransform(1, 0, 0, 1, 0, 0);
  }

  // reflection: this is one of a kaleidoscope's mirror images (typed words appear only once,
  // the right way round, so they can be read).
  drawLines(ctx, reflection = false) {
    const { life } = this;
    for (const ln of this.lines) {
      const u = ln.age / life;
      const a = 1 - smoothstep(0.45, 1, u);
      if (a <= 0.01) continue;
      const spread = 1 + this.spread * u;   // a line spreads out as it mixes in
      const p = ln.pts;
      if (ln.dots) {
        if (reflection) continue;
        const s = 2 * spread;
        ctx.globalAlpha = a * this.body;
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
      // A soft edge where it bleeds into what's around it, then the line itself.
      if (this.edge) {
        ctx.globalAlpha = a * this.edge;
        ctx.lineWidth = ln.r * 2 * spread * 1.9;
        ctx.stroke();
      }
      ctx.globalAlpha = a * this.body;
      ctx.lineWidth = ln.r * 2 * spread;
      ctx.stroke();
    }
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

  // Done typing: the words become a cloud of points the swirl can carry off.
  onCommit(blocks) {
    for (const b of blocks) {
      const pts = textDots(this.W, this.H, b, 600, 1.7);
      if (pts.length) this.lines.push({ ink: b.ink, pts, r: 1.2, age: 0, dots: true });
    }
  }

  dispose() {}
}

Object.assign(StirScene.prototype, draftMethods);
