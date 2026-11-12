// Shared machinery for Become surfaces: the third family, next to Fade and Release.
//
// You draw in ordinary ink. When you pause, the whole drawing turns into something alive
// (fireflies, stars, flowers…) that follows the lines you drew for a moment, then leaves.
//
//   1. Draw.    Strokes go onto an ink layer and are remembered as paths.
//   2. Pause.   After `pauseSeconds` without drawing (the shell's speed slider sets it; Hold
//               stops the clock) the drawing becomes. The tray button does it right away.
//   3. Become.  The ink layer fades out as a ghost while particles wake along every path.
//   4. Leave.   Each particle goes its own way and is dropped when the scene says it's gone.
//
// Strokes drawn while a change is under way go onto a fresh ink layer and wait for their own
// pause. Undo works until the change starts. Typed text becomes too: its letters are sampled
// into points like a stroke's path.
//
// A scene subclass provides:
//   paintBase() -> canvas              full-res background
//   spawn(p)                           decorate a new particle (p.x, p.y = p.hx, p.hy its home on
//                                      the line; p.r the stroke radius there; p.ink; p.delay)
//   stepParticle(p, dt) -> boolean     move it along; false when it has gone
//   drawParticles(ctx, list)           draw the awake ones (CSS px)
// and optionally:
//   paintSeg(g, x0, y0, r0, x1, y1, r1)   how the ink itself looks
//   hurry(p)                           "Become now" with nothing left to change: leave sooner
//   onBecome(n)                        a change has started with n new particles (sound…)
//   updateFx(dt) -> boolean / drawBack(ctx) / drawFront(ctx)   animated scenery
//   setup()                            after every resize
// Config: ink, brush (stroke radius), spacing (CSS px between particles along a line), cap
// (most particles alive at once), ghost (seconds the old ink takes to fade), settle (seconds a
// change takes from start to empty, for the demo).

import { clamp, smoothstep, mulberry32, makeCanvas, layoutFor, drawText, HAND } from './util.js';
import { undoMethods, copyCanvas, pasteCanvas } from './undo.js';
import { draftMethods } from './util.js';

const NO_OVERLAY = { apply() {}, restore() {} }; // drafts are drawn live, not stamped into a map

export class BecomeScene {
  constructor(o = {}) {
    this.ink = o.ink || '#ffffff';
    this.brush = o.brush ?? 3;
    this.spacing = o.spacing ?? 7;
    this.cap = o.cap ?? 1500;
    this.ghostSeconds = o.ghost ?? 1.4;
    this.settle = o.settle ?? 9;
    this.textWeight = o.textWeight ?? 400;
    this.rand = mulberry32(o.seed ?? 11);
    this.pauseSeconds = 4;
    this.paused = false;
    this.strokes = new Map();
    this.paths = [];      // finished and in-progress strokes: { ink, pts: [x, y, r, …] }
    this.dots = [];       // points sampled from typed text: { x, y, r, ink }
    this.ghosts = [];     // old ink layers fading out: { c, t }
    this.particles = [];
    this.idle = 0;
    this.time = 0;
    // With "reduce motion" on, nothing flies about: the change is a gentle crossfade in place.
    this.calm = typeof matchMedia === 'function' && matchMedia('(prefers-reduced-motion: reduce)').matches;
  }

  // ---------------------------------------------------------------- setup
  resize({ width, height, dpr }) {
    this.dropDraft();
    Object.assign(this, { W: width, H: height, dpr });
    this.base = this.paintBase();
    const old = this.paint;
    this.newPaint();
    if (old) {
      const g = this.paintCtx;
      g.save(); g.setTransform(1, 0, 0, 1, 0, 0);
      g.drawImage(old, 0, 0);
      g.restore();
    }
    this.ghosts = [];
    this.setup?.();
  }

  newPaint() {
    this.paint = makeCanvas(this.W * this.dpr, this.H * this.dpr);
    const g = (this.paintCtx = this.paint.getContext('2d'));
    g.setTransform(this.dpr, 0, 0, this.dpr, 0, 0);
    g.lineCap = g.lineJoin = 'round';
  }

  // The shell's speed slider (5 to 60 s) sets the pause: about 1.5 to 12 s, 4 s by default.
  setFadeSeconds(s) { this.pauseSeconds = clamp(s / 5, 1.5, 12); }
  setPaused(p) { this.paused = p; this.idle = 0; }
  setInk(color) { this.ink = color; }

  hasInk() { return this.paths.length > 0 || this.dots.length > 0; }
  // Roughly how long from the last stroke until the screen is empty again (for the demo).
  becomeTime() { return this.pauseSeconds + this.settle; }

  // ---------------------------------------------------------------- strokes
  radiusFor(info) {
    const b = this.brush;
    return info.pointerType === 'pen' ? b * (0.5 + 0.9 * (info.pressure || 0.5))
         : info.pointerType === 'mouse' ? b * 0.85 : b;
  }

  strokeStart(id, x, y, info) {
    const r = this.radiusFor(info, 0);
    if (!this.strokes.size) this.undoPush(); // two fingers at once make one undo step
    const path = { ink: this.ink, pts: [x, y, r] };
    this.paths.push(path);
    this.strokes.set(id, { x, y, r, t: info.time, path });
    this.paintSeg(this.paintCtx, x, y, r, x, y, r);
    this.idle = 0;
  }

  strokeMove(id, x, y, info) {
    const s = this.strokes.get(id);
    if (!s) return;
    const d = Math.hypot(x - s.x, y - s.y);
    if (d < 0.75) return;
    const speed = (d / Math.max(4, info.time - s.t)) * 1000;
    const r = s.r + (this.radiusFor(info, speed) - s.r) * 0.25;
    this.paintSeg(this.paintCtx, s.x, s.y, s.r, x, y, r);
    s.path.pts.push(x, y, r);
    Object.assign(s, { x, y, r, t: info.time });
    this.idle = 0;
  }

  strokeEnd(id) {
    this.strokes.delete(id);
    this.idle = 0;
  }

  paintSeg(g, x0, y0, r0, x1, y1, r1) {
    g.strokeStyle = this.ink;
    g.lineWidth = r0 + r1;
    g.beginPath(); g.moveTo(x0, y0); g.lineTo(x1 + 0.01, y1); g.stroke();
  }

  // ---------------------------------------------------------------- become
  // The tray button: change now. With nothing drawn, whatever is still around leaves sooner.
  clear() {
    this.commitDraft();
    this.strokes.clear();
    if (this.hasInk()) this.become();
    else if (this.hurry) for (const p of this.particles) this.hurry(p);
  }

  become() {
    if (!this.hasInk()) return;
    this.strokes.clear();
    this.undoReset();

    // Walk every path, dropping a point each `step` px; thin them out if that's too many.
    let total = 0;
    for (const { pts } of this.paths) {
      total += this.spacing; // a dot still gets one
      for (let i = 3; i < pts.length; i += 3) total += Math.hypot(pts[i] - pts[i - 3], pts[i + 1] - pts[i - 2]);
    }
    const room = Math.max(60, this.cap - this.particles.length);
    const want = total / this.spacing + this.dots.length;
    const thin = Math.min(1, room / Math.max(1, want));
    const step = this.spacing / thin;
    const rand = this.rand;
    const born = [];
    let along = 0;
    for (const { pts, ink } of this.paths) {
      let carry = step * rand(); // so parallel lines don't line their points up
      born.push({ x: pts[0], y: pts[1], r: pts[2], ink, along });
      for (let i = 3; i < pts.length; i += 3) {
        const x0 = pts[i - 3], y0 = pts[i - 2], r0 = pts[i - 1], x1 = pts[i], y1 = pts[i + 1], r1 = pts[i + 2];
        const d = Math.hypot(x1 - x0, y1 - y0);
        while (carry <= d) {
          const t = d ? carry / d : 0;
          born.push({ x: x0 + (x1 - x0) * t, y: y0 + (y1 - y0) * t, r: r0 + (r1 - r0) * t, ink, along: along + carry });
          carry += step;
        }
        carry -= d;
        along += d;
      }
    }
    for (const d of this.dots) if (rand() < thin) born.push({ ...d, along: (along += this.spacing) });

    // The change ripples along the drawing in the order it was drawn.
    const span = Math.max(1, along);
    for (const b of born) {
      // A fat brush scatters its points across the stroke's width.
      const a = rand() * Math.PI * 2, k = Math.sqrt(rand()) * Math.max(0, b.r - 1.5);
      const x = b.x + Math.cos(a) * k, y = b.y + Math.sin(a) * k;
      const p = { x, y, hx: x, hy: y, r: b.r, ink: b.ink, delay: (b.along / span) * 0.9 + rand() * 0.35, t: 0 };
      this.spawn(p);
      this.particles.push(p);
    }

    this.ghosts.push({ c: this.paint, t: 0 });
    this.newPaint();
    this.paths = [];
    this.dots = [];
    this.idle = 0;
    this.onBecome?.(born.length);
  }

  // For the scene menu's preview: show the change part-way through.
  preview() {
    this.become();
    for (let i = 0; i < 45; i++) this.update(1 / 30);
  }

  // ---------------------------------------------------------------- time
  update(dt) {
    this.time += dt;
    let alive = false;

    if (this.hasInk()) {
      if (!this.paused && !this.strokes.size && !this.hasDrafts()) {
        this.idle += dt;
        if (this.idle >= this.pauseSeconds) this.become();
        alive = true; // the pause is counted in frames
      }
    }

    if (this.ghosts.length) {
      for (const g of this.ghosts) g.t += dt;
      this.ghosts = this.ghosts.filter((g) => g.t < this.ghostSeconds);
      alive = true;
    }

    if (this.particles.length) {
      const keep = [];
      for (const p of this.particles) {
        if (p.delay > 0) { p.delay -= dt; keep.push(p); continue; }
        if (this.stepParticle(p, dt) !== false) keep.push(p);
      }
      this.particles = keep;
      alive = true;
    }

    if (this.hasDrafts()) alive = true;
    if (this.updateFx?.(dt)) alive = true;
    return alive;
  }

  // ---------------------------------------------------------------- draw
  render(ctx) {
    const { dpr } = this;
    ctx.setTransform(1, 0, 0, 1, 0, 0);
    ctx.drawImage(this.base, 0, 0);
    ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
    this.drawBack?.(ctx);
    ctx.setTransform(1, 0, 0, 1, 0, 0);
    for (const g of this.ghosts) {
      ctx.globalAlpha = 1 - smoothstep(0, this.ghostSeconds, g.t);
      ctx.drawImage(g.c, 0, 0);
    }
    ctx.globalAlpha = 1;
    ctx.drawImage(this.paint, 0, 0);
    ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
    // Typed text still being written sits on top until it's committed to the ink layer.
    for (const d of this.held || []) this.drawBlock(ctx, d);
    if (this.draft) this.drawBlock(ctx, this.draft);
    if (this.particles.length) this.drawParticles(ctx, this.particles);
    this.drawFront?.(ctx);
    ctx.setTransform(1, 0, 0, 1, 0, 0);
  }

  // ---------------------------------------------------------------- text
  intro(text, opts = {}) { this.inkBlock(this.stampText(text, opts)); }

  stampText(text, opts) {
    const { lay, place } = layoutFor(this.paintCtx, text, opts, {
      W: this.W, H: this.H, size: Math.min(this.W * 0.15, 76), weight: this.textWeight,
    });
    return { overlay: NO_OVERLAY, lay, place, ink: this.ink };
  }

  drawBlock(g, { lay, place, ink }) {
    g.save();
    g.fillStyle = g.strokeStyle = ink;
    g.font = `${this.textWeight} ${lay.size}px ${HAND}`;
    this.inkText?.(g);
    drawText(g, lay, place, Math.max(1, lay.size * 0.03));
    g.restore();
  }

  // Put a text block on the ink layer and sample its letters into points.
  inkBlock(block) {
    this.drawBlock(this.paintCtx, block);
    const K = 3; // sample on a coarse grid: plenty for letters, cheap to scan
    const c = makeCanvas(this.W / K, this.H / K), g = c.getContext('2d');
    g.scale(1 / K, 1 / K);
    g.fillStyle = g.strokeStyle = '#fff';
    g.font = `${this.textWeight} ${block.lay.size}px ${HAND}`;
    drawText(g, block.lay, block.place, Math.max(1, block.lay.size * 0.03));
    const px = g.getImageData(0, 0, c.width, c.height).data;
    const every = Math.max(1, Math.round(this.spacing / K / 1.4));
    for (let j = 0; j < c.height; j += every) {
      for (let i = 0; i < c.width; i += every) {
        if (px[(j * c.width + i) * 4 + 3] > 110) this.dots.push({ x: (i + 0.5) * K, y: (j + 0.5) * K, r: 1.5, ink: block.ink });
      }
    }
    this.idle = 0;
  }

  onCommit(blocks) { for (const b of blocks) this.inkBlock(b); }

  dispose() {}
}

// Undo: a step is the ink layer plus how many paths and text points there were.
Object.assign(BecomeScene.prototype, draftMethods, undoMethods, {
  undoSnapshot() {
    if (!this.paint) return null;
    return { paint: copyCanvas(this.paint), paths: this.paths.length, dots: this.dots.length };
  },
  undoRestore(snap) {
    pasteCanvas(this.paint, snap.paint);
    this.paths.length = Math.min(this.paths.length, snap.paths);
    this.dots.length = Math.min(this.dots.length, snap.dots);
    this.idle = 0;
  },
  undoReady() { return !this.hasDrafts(); },
});
