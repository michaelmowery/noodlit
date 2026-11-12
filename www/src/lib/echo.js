// Shared machinery for Echo surfaces: you draw, pause, and the drawing plays itself back
// stroke by stroke in the order you made it (typed words come back a letter at a time), then
// fades.
//
// It borrows the ink layer, the pause clock, typed text and undo from lib/become.js and
// replaces the change itself: instead of waking particles, become() builds a playback.
//
// A playback is one or more passes over the same script. Each pass paints onto its own layer
// as its point of light travels, so a pass can be faded, shrunk or moved as a whole.
//
// A scene subclass provides paintBase() and paintSeg(g, x0, y0, r0, x1, y1, r1, ink), and may set:
//   passes   [{ gap, rate, alpha, scale, hold, fade }]: seconds after the previous pass ends,
//            playback speed, opacity, size (about `vanish`), seconds it stays whole, seconds to fade
//   quiet    seconds of hush before the first pass (the old ink fades over it)
//   sparks   false for no sparks off the point of light
//   instant  true to bring the whole drawing back at once, in place, instead of stroke by stroke
// and optionally:
//   look(p, age) -> { alpha?, dx?, dy? }   a pass's flicker or drift, `age` seconds after it ended
//   drawHead(ctx, h)                       the point of light itself (h: x, y, r, ink, a, ang)
//   onStroke(pass index)                   a stroke has started playing (sound…)
// While a pass is being painted `this.playing` is true, so paintSeg and inkText can draw the
// played-back line differently from the one under your finger.

import { clamp, smoothstep, makeCanvas, HAND } from './util.js';
import { BecomeScene } from './become.js';

const MAX_PLAYBACK = 4.5;   // seconds: a long drawing plays back faster to fit

// When each stroke and typed block plays, in the order they were made.
function timeline(script, instant = false) {
  const items = [];
  let t = 0;
  for (const s of script) {
    if (s.path) {
      const pts = s.path.pts, cum = [0];
      for (let i = 3; i < pts.length; i += 3) cum.push(cum[cum.length - 1] + Math.hypot(pts[i] - pts[i - 3], pts[i + 1] - pts[i - 2]));
      const len = cum[cum.length - 1];
      const dur = clamp(len / 720, 0.16, 1.3);
      items.push({ pts, ink: s.path.ink, cum, len, t0: t, dur });
      t += dur + 0.07;
    } else {
      const chars = s.block.lay.lines.join('').length;
      const dur = clamp(chars * 0.05, 0.3, 1.6);
      items.push({ block: s.block, chars, t0: t, dur });
      t += dur + 0.1;
    }
  }
  if (instant) {
    for (const it of items) { it.t0 = 0; it.dur = 0.001; }
    return { items, total: 0.001 };
  }
  const k = t > MAX_PLAYBACK ? MAX_PLAYBACK / t : 1;
  for (const it of items) { it.t0 *= k; it.dur *= k; }
  return { items, total: t * k };
}

export class EchoScene extends BecomeScene {
  constructor(o = {}) {
    super({ ...o, ghost: o.quiet ?? 0.45 });
    this.quiet = o.quiet ?? 0.45;
    this.passes = o.passes || [{ gap: 0, rate: 1, alpha: 1, scale: 1, hold: 0.3, fade: 1.6 }];
    this.sparkly = o.sparks !== false;
    this.instant = !!o.instant;
    this.vanish = o.vanish || [0.5, 0.3]; // where a shrunken pass shrinks towards (fractions of W, H)
    this.script = [];   // strokes and typed blocks in the order they were made
    this.replays = [];
    this.sparks = [];
    this.heads = new Map();
  }

  setup() { this.replays = []; this.sparks = []; }

  // ---------------------------------------------------------------- recording
  strokeStart(id, x, y, info) {
    super.strokeStart(id, x, y, info);
    this.script.push({ path: this.paths[this.paths.length - 1] });
  }

  onCommit(blocks) {
    for (const b of blocks) { this.inkBlock(b); this.script.push({ block: b }); }
  }

  undoSnapshot() {
    const snap = super.undoSnapshot();
    if (snap) snap.script = this.script.length;
    return snap;
  }
  undoRestore(snap) {
    super.undoRestore(snap);
    this.script.length = Math.min(this.script.length, snap.script);
  }

  // The demo waits this long after the last mark for the canyon to fall quiet again.
  becomeTime() { return this.pauseSeconds + (this.script.length ? this.schedule(timeline(this.script, this.instant).total).end : 3); }
  // The demo also waits on this before writing on the cleared surface.
  get clearing() { return this.replays.length > 0; }

  // ---------------------------------------------------------------- playback
  // When each pass starts and ends for a script `total` seconds long, and when it's all over.
  schedule(total) {
    let t = this.quiet, end = 0;
    const passes = this.passes.map((o, n) => {
      const p = { n, rate: 1, alpha: 1, scale: 1, hold: 0.3, fade: 1.4, ...o };
      p.start = t + (o.gap || 0);
      p.end = p.start + total / p.rate;
      t = p.end;
      end = Math.max(end, p.end + p.hold + p.fade);
      return p;
    });
    return { passes, end };
  }

  // The pause is up (or "Echo now"): the ink goes quiet and a playback begins.
  become() {
    if (!this.hasInk()) return;
    this.strokes.clear();
    this.undoReset();
    const { items, total } = timeline(this.script, this.instant);
    const sched = this.schedule(total);
    this.replays.push({
      items, t: 0, end: sched.end,
      passes: sched.passes.map((p) => {
        const c = makeCanvas(this.W * this.dpr, this.H * this.dpr), g = c.getContext('2d');
        g.setTransform(this.dpr, 0, 0, this.dpr, 0, 0);
        g.lineCap = g.lineJoin = 'round';
        return { ...p, c, g, idx: 0, pos: null, live: null };
      }),
    });
    this.ghosts.push({ c: this.paint, t: 0 });
    this.newPaint();
    this.paths = [];
    this.dots = [];
    this.script = [];
    this.idle = 0;
  }

  // Paint a stroke onto a pass's layer up to distance d along it.
  advance(p, it, d) {
    const { pts, cum } = it;
    if (!p.pos) {
      p.pos = { i: 0, x: pts[0], y: pts[1], r: pts[2] };
      this.paintSeg(p.g, pts[0], pts[1], pts[2], pts[0], pts[1], pts[2], it.ink);
    }
    const pos = p.pos;
    while (pos.i < cum.length - 1) {
      const a = pos.i * 3, b = a + 3;
      const whole = cum[pos.i + 1] <= d;
      const seg = cum[pos.i + 1] - cum[pos.i];
      const f = whole || !seg ? 1 : clamp((d - cum[pos.i]) / seg, 0, 1);
      const x = pts[a] + (pts[b] - pts[a]) * f, y = pts[a + 1] + (pts[b + 1] - pts[a + 1]) * f, r = pts[a + 2] + (pts[b + 2] - pts[a + 2]) * f;
      if (x !== pos.x || y !== pos.y) this.paintSeg(p.g, pos.x, pos.y, pos.r, x, y, r, it.ink);
      Object.assign(pos, { x, y, r });
      if (!whole) break;
      pos.i++;
    }
  }

  // The echo comes from deeper in the canyon: smaller, and a little higher up.
  place(p, x, y) {
    const cx = this.W * this.vanish[0], cy = this.H * this.vanish[1];
    return [cx + (x - cx) * p.scale, cy + (y - cy) * p.scale];
  }

  updateFx(dt) {
    this.heads.clear();
    for (const rp of this.replays) {
      rp.t += dt;
      for (const p of rp.passes) {
        const local = (rp.t - p.start) * p.rate;
        p.live = null;
        if (local < 0) continue;
        while (p.idx < rp.items.length) {
          const it = rp.items[p.idx];
          if (local < it.t0) break;
          const f = clamp((local - it.t0) / it.dur, 0, 1);
          if (it.pts) {
            if (!p.pos) this.onStroke?.(p.n);
            this.playing = true;
            this.advance(p, it, it.len * f);
            this.playing = false;
            if (f < 1) {
              const [hx, hy] = this.place(p, p.pos.x, p.pos.y);
              const was = p.head;
              const ang = was && (was.x !== hx || was.y !== hy) ? Math.atan2(hy - was.y, hx - was.x) : was?.ang ?? 0;
              p.head = { x: hx, y: hy, r: p.pos.r * p.scale, ink: it.ink, a: p.alpha, ang };
              this.heads.set(p, p.head);
              if (this.sparkly && !this.calm) this.spark(hx, hy, it.ink, p.alpha);
            }
          } else if (f < 1) {
            p.live = { it, n: Math.ceil(it.chars * f) };
          } else {
            this.playing = true;
            this.drawBlock(p.g, it.block);
            this.playing = false;
          }
          if (f < 1) break;
          p.idx++;
          p.pos = null;
          p.head = null;
        }
      }
    }
    this.replays = this.replays.filter((rp) => rp.t < rp.end);

    for (const s of this.sparks) {
      s.t += dt;
      s.vy += 60 * dt;
      s.x += s.vx * dt;
      s.y += s.vy * dt;
    }
    this.sparks = this.sparks.filter((s) => s.t < s.life);
    return this.replays.length > 0 || this.sparks.length > 0;
  }

  spark(x, y, ink, a) {
    if (this.sparks.length > 160) return;
    const rand = this.rand;
    for (let k = 0; k < 2; k++) {
      const ang = rand() * Math.PI * 2, v = 18 + rand() * 46;
      this.sparks.push({ x, y, vx: Math.cos(ang) * v, vy: Math.sin(ang) * v - 14, t: 0, life: 0.25 + rand() * 0.45, ink, a });
    }
  }

  // A typed block part-way through coming back: the first n letters, each line where it will end up.
  drawPartial(g, { lay, place, ink }, n) {
    g.save();
    g.fillStyle = g.strokeStyle = ink;
    g.font = `${this.textWeight} ${lay.size}px ${HAND}`;
    this.inkText?.(g);
    g.textAlign = 'left';
    g.textBaseline = 'middle';
    g.lineWidth = Math.max(1, lay.size * 0.03);
    g.lineCap = g.lineJoin = 'round';
    lay.lines.forEach((ln, k) => {
      if (n <= 0) return;
      const x = place.align === 'center' ? place.x - g.measureText(ln).width / 2 : place.x;
      const part = ln.slice(0, n), y = place.y0 + k * lay.lh;
      n -= ln.length;
      g.fillText(part, x, y);
      g.strokeText(part, x, y);
    });
    g.restore();
  }

  drawFront(ctx) {
    const { W, H } = this;
    for (const rp of this.replays) {
      for (const p of rp.passes) {
        if (rp.t < p.start) continue;
        const look = (rp.t > p.end && this.look?.(p, rp.t - p.end)) || {};
        const a = p.alpha * (look.alpha ?? 1) * (1 - smoothstep(p.end + p.hold, p.end + p.hold + p.fade, rp.t));
        if (a <= 0.004) continue;
        const [ox, oy] = this.place(p, 0, 0);
        ctx.save();
        ctx.globalAlpha = a;
        ctx.translate(ox + (look.dx || 0), oy + (look.dy || 0));
        ctx.scale(p.scale, p.scale);
        ctx.drawImage(p.c, 0, 0, W, H);
        if (p.live) { this.playing = true; this.drawPartial(ctx, p.live.it.block, p.live.n); this.playing = false; }
        ctx.restore();
      }
    }
    if (!this.heads.size && !this.sparks.length) return;
    ctx.save();
    if (!this.drawHead) ctx.globalCompositeOperation = 'lighter';
    // The point of light that redraws each line, and the sparks it sheds.
    for (const h of this.heads.values()) {
      if (this.drawHead) { ctx.globalAlpha = h.a; this.drawHead(ctx, h); continue; }
      const d = 18 + h.r * 5;
      const gr = ctx.createRadialGradient(h.x, h.y, 0, h.x, h.y, d);
      gr.addColorStop(0, '#ffffff');
      gr.addColorStop(0.18, h.ink);
      gr.addColorStop(1, h.ink + '00');
      ctx.globalAlpha = h.a;
      ctx.fillStyle = gr;
      ctx.beginPath(); ctx.arc(h.x, h.y, d, 0, Math.PI * 2); ctx.fill();
    }
    for (const s of this.sparks) {
      ctx.globalAlpha = s.a * (1 - s.t / s.life);
      ctx.fillStyle = s.ink;
      ctx.beginPath(); ctx.arc(s.x, s.y, 1.1, 0, Math.PI * 2); ctx.fill();
    }
    ctx.restore();
  }

  // Not used: an Echo scene has no particles of its own.
  spawn() {}
  stepParticle() { return false; }
  drawParticles() {}
}

