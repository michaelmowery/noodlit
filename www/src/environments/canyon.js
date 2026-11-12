// Canyon echo: the sample Echo environment.
//   Look:  a canyon at dusk. Your finger leaves a glowing line in the air between the walls.
//   Echo:  pause, and the drawing goes quiet, then plays itself back stroke by stroke in the
//          order you made it (typed words come back a letter at a time). The canyon answers
//          once more, fainter and further off.
//   Leave: then both fade.
//
// It borrows the ink layer, the pause clock, typed text and undo from lib/become.js, and
// replaces the change itself: instead of waking particles, become() builds a playback.

import { clamp, mulberry32, smoothstep, makeCanvas, HAND } from '../lib/util.js';
import { BecomeScene } from '../lib/become.js';
import { stageCanvas, blob } from '../lib/fade.js';
import { sfx } from '../lib/sound.js';

const PALETTE = [
  { name: 'Ember', color: '#ffc46b' },
  { name: 'Moonlight', color: '#d5e6ff' },
  { name: 'Sage', color: '#b9e6a0' },
  { name: 'Rose', color: '#ffa9bd' },
];

const MAX_PLAYBACK = 4.5;   // seconds: a long drawing plays back faster to fit
const QUIET = 0.45;         // the hush before the playback starts
const ECHO_GAP = 0.3, ECHO_RATE = 1.25, ECHO_ALPHA = 0.42, ECHO_SCALE = 0.88;
const FADE_FIRST = 1.6, FADE_ECHO = 1.3;

export const canyon = {
  id: 'canyon',
  name: 'Canyon echo',
  mode: 'echo',
  blurb: 'Pause, and the canyon plays your lines back',
  surface: 'Canyon at dusk to draw glowing lines in',
  clearLabel: 'Echo now',
  clearIcon: 'M4 12a8 8 0 0 1 8-8M4 12a8 8 0 0 0 8 8M9 12a3 3 0 0 1 3-3M9 12a3 3 0 0 0 3 3M16 7.5a6 6 0 0 1 0 9M19.5 5a10 10 0 0 1 0 14',
  palette: PALETTE,
  create: () => new Canyon(),
};

// When each stroke and typed block plays, in the order they were made.
function timeline(script) {
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
  const k = t > MAX_PLAYBACK ? MAX_PLAYBACK / t : 1;
  for (const it of items) { it.t0 *= k; it.dur *= k; }
  return { items, total: t * k };
}
// From the start of the hush to an empty canyon.
const span = (total) => QUIET + total + ECHO_GAP + total / ECHO_RATE + 0.4 + FADE_ECHO;

class Canyon extends BecomeScene {
  constructor() {
    super({ ink: PALETTE[0].color, brush: 3, seed: 41, ghost: QUIET });
    this.script = [];   // strokes and typed blocks in the order they were made
    this.replays = [];
    this.sparks = [];
    this.heads = new Map();
  }

  paintBase() { return paintCanyon(this.W, this.H, this.dpr); }
  setup() { this.replays = []; this.sparks = []; }

  // A soft halo with a brighter core, in the chosen ink.
  paintSeg(g, x0, y0, r0, x1, y1, r1, ink = this.ink) {
    g.save();
    g.strokeStyle = ink;
    g.globalAlpha = 0.18;
    g.lineWidth = (r0 + r1) * 2.4;
    g.beginPath(); g.moveTo(x0, y0); g.lineTo(x1 + 0.01, y1); g.stroke();
    g.globalAlpha = 0.9;
    g.lineWidth = (r0 + r1) * 0.8;
    g.stroke();
    g.restore();
  }

  inkText(g) { g.shadowColor = g.fillStyle; g.shadowBlur = 8; }

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
  becomeTime() { return this.pauseSeconds + (this.script.length ? span(timeline(this.script).total) : 3); }
  // The demo also waits on this before writing on the cleared surface.
  get clearing() { return this.replays.length > 0; }

  // ---------------------------------------------------------------- playback
  // The pause is up (or "Echo now"): the ink goes quiet and a playback begins.
  become() {
    if (!this.hasInk()) return;
    this.strokes.clear();
    this.undoReset();
    const { items, total } = timeline(this.script);
    const pass = (start, rate, alpha, scale, fade) => {
      const c = makeCanvas(this.W * this.dpr, this.H * this.dpr), g = c.getContext('2d');
      g.setTransform(this.dpr, 0, 0, this.dpr, 0, 0);
      g.lineCap = g.lineJoin = 'round';
      return { start, rate, alpha, scale, fade, end: start + total / rate, c, g, idx: 0, pos: null, live: null };
    };
    this.replays.push({
      items, t: 0,
      passes: [
        pass(QUIET, 1, 1, 1, FADE_FIRST),
        pass(QUIET + total + ECHO_GAP, ECHO_RATE, ECHO_ALPHA, ECHO_SCALE, FADE_ECHO),
      ],
      end: span(total),
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
    const cx = this.W / 2, cy = this.H * 0.3;
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
            if (!p.pos && p === rp.passes[0]) sfx.cue('twinkle');
            this.advance(p, it, it.len * f);
            if (f < 1) {
              const [hx, hy] = this.place(p, p.pos.x, p.pos.y);
              this.heads.set(p, { x: hx, y: hy, r: p.pos.r * p.scale, ink: it.ink, a: p.alpha });
              if (!this.calm) this.spark(hx, hy, it.ink, p.alpha);
            }
          } else if (f < 1) {
            p.live = { it, n: Math.ceil(it.chars * f) };
          } else {
            this.drawBlock(p.g, it.block);
          }
          if (f < 1) break;
          p.idx++;
          p.pos = null;
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
    this.inkText(g);
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
        const a = p.alpha * (1 - smoothstep(p.end + 0.3, p.end + 0.3 + p.fade, rp.t));
        if (a <= 0.004) continue;
        const [ox, oy] = this.place(p, 0, 0);
        ctx.save();
        ctx.globalAlpha = a;
        ctx.translate(ox, oy);
        ctx.scale(p.scale, p.scale);
        ctx.drawImage(p.c, 0, 0, W, H);
        if (p.live) this.drawPartial(ctx, p.live.it.block, p.live.n);
        ctx.restore();
      }
    }
    if (!this.heads.size && !this.sparks.length) return;
    ctx.save();
    ctx.globalCompositeOperation = 'lighter';
    // The point of light that redraws each line, and the sparks it sheds.
    for (const h of this.heads.values()) {
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

// A canyon just after sunset: the last light low in the sky, walls stepping back into haze on
// both sides, and a thread of river far below.
function paintCanyon(W, H, dpr) {
  const rand = mulberry32(57);
  const { c, g } = stageCanvas(W, H, dpr);

  const sky = g.createLinearGradient(0, 0, 0, H);
  sky.addColorStop(0, '#0b0f26');
  sky.addColorStop(0.38, '#2a2350');
  sky.addColorStop(0.62, '#7a3f5c');
  sky.addColorStop(0.8, '#d27a4e');
  sky.addColorStop(1, '#f2b46a');
  g.fillStyle = sky; g.fillRect(0, 0, W, H);
  blob(g, W * 0.5, H * 0.78, W * 0.7, H * 0.2, 'rgba(255,200,130,0.3)');

  for (let i = 0; i < (W * H) / 4200; i++) {
    const y = rand() * rand() * H * 0.5;
    g.fillStyle = `rgba(255,255,255,${0.15 + rand() * 0.5})`;
    g.beginPath(); g.arc(rand() * W, y, 0.4 + rand() * 0.7, 0, Math.PI * 2); g.fill();
  }

  // Walls, far to near: each a stepped mesa profile coming in from one side.
  const layers = 4;
  for (let l = 0; l < layers; l++) {
    const t = l / (layers - 1);                     // 0 far, 1 near
    const reach = W * (0.5 - 0.06 - 0.3 * t);       // how far in from the edge the foot comes
    const top = H * (0.56 - 0.44 * t);              // rim height at the edge
    const foot = H * (0.8 + 0.2 * t);
    const shade = [Math.round(120 - 104 * t), Math.round(62 - 50 * t), Math.round(84 - 62 * t)];
    for (const side of [-1, 1]) {
      const X = (d) => (side < 0 ? d : W - d);      // d = distance in from this side's edge
      g.beginPath();
      g.moveTo(X(-4), H + 4);
      g.lineTo(X(-4), top);
      let d = 0, y = top;
      const inner = W * 0.5 - reach;
      while (d < inner && y < foot) {
        d = Math.min(inner, d + W * (0.03 + rand() * 0.09));  // a ledge
        g.lineTo(X(d), y + (rand() - 0.5) * 4);
        y = Math.min(foot, y + H * (0.03 + rand() * 0.11));   // a drop
        g.lineTo(X(d + rand() * 5), y);
      }
      g.lineTo(X(inner + W * 0.04), H + 4);
      g.closePath();
      const gr = g.createLinearGradient(0, top, 0, H);
      gr.addColorStop(0, `rgb(${shade[0] + 26},${shade[1] + 14},${shade[2] + 8})`);
      gr.addColorStop(1, `rgb(${shade})`);
      g.fillStyle = gr;
      g.fill();
    }
    // Haze settling between the layers.
    if (l < layers - 1) blob(g, W * 0.5, H * (0.74 + 0.07 * t), W * 0.8, H * 0.1, 'rgba(255,170,130,0.1)');
  }

  // The river, catching the sky.
  const rv = g.createLinearGradient(0, H * 0.86, 0, H);
  rv.addColorStop(0, 'rgba(255,205,150,0.55)');
  rv.addColorStop(1, 'rgba(120,80,110,0.25)');
  g.fillStyle = rv;
  g.beginPath();
  g.moveTo(W * 0.49, H * 0.86);
  g.bezierCurveTo(W * 0.44, H * 0.92, W * 0.58, H * 0.95, W * 0.4, H + 4);
  g.lineTo(W * 0.62, H + 4);
  g.bezierCurveTo(W * 0.66, H * 0.95, W * 0.5, H * 0.92, W * 0.51, H * 0.86);
  g.closePath(); g.fill();

  // Keep the middle of the picture dark enough for glowing lines to read.
  const veil = g.createLinearGradient(0, 0, 0, H);
  veil.addColorStop(0, 'rgba(6,8,22,0.25)');
  veil.addColorStop(0.7, 'rgba(6,8,22,0.3)');
  veil.addColorStop(1, 'rgba(6,8,22,0.55)');
  g.fillStyle = veil; g.fillRect(0, 0, W, H);
  return c;
}
