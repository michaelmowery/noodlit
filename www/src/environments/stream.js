// Stream: the first Release environment.
//   Look:  charcoal on a big piece of driftwood, beside a little storybook stream.
//   Decay: none. Nothing fades while you draw; this surface is about choosing to let go.
//   Clear: the release itself. Tap "Let it go" and the board drops in near the top,
//          shrinks to fit the stream and floats down
//          and off the screen. The frog hops, the fish dart off, the ducks paddle after it
//          for a bit, and a fresh piece of wood washes up.
//
// The board is its own layer (texture + ink in board-local coordinates) so it can move,
// rotate and shrink as one object.

import { clamp, easeInOut, smoothstep, mulberry32, makeCanvas, valueNoise, layoutText, drawText, HAND } from '../lib/util.js';
import { sfx } from '../lib/sound.js';
import { inkSegment, roundRect } from '../lib/release.js';
import { undoMethods, copyCanvas, pasteCanvas, markTypedBlock, endTypedBlock } from '../lib/undo.js';

// Inks that read on driftwood: charcoal first (the default), then chalk and a few earthy colours.
const PALETTE = [
  { name: 'Charcoal', color: '#2a2320' },
  { name: 'Chalk', color: '#f4efe4' },
  { name: 'Moss', color: '#3d6b35' },
  { name: 'River', color: '#2a5d8f' },
  { name: 'Rust', color: '#a23b24' },
  { name: 'Ochre', color: '#c98a1c' },
];
const FLOAT_SECONDS = 8.5;  // the trip from the drop point to off-screen
const LIFT = 0.9;           // board lifts and moves over to the stream
const WASH_UP_AT = 1.6;     // when the next board starts washing up
const WASH_UP = 0.9;

export const stream = {
  id: 'stream',
  name: 'Stream',
  blurb: 'Float it off downstream',
  clearLabel: 'Let it go',
  clearIcon: 'M5 12h11M12 7l5 5-5 5M20 5v14',
  surface: 'Driftwood drawing surface beside a stream. Tap Let it go to float it downstream.',
  fades: false,            // Release surface: the shell hides fade speed and Hold
  palette: PALETTE,
  create: () => new Stream(),
};

class Stream {
  constructor() {
    this.strokes = new Map();
    this.time = 0;
    this.floating = [];    // boards on their way downstream
    this.splashes = [];    // ripple rings
    this.board = null;     // the board you draw on (null while the next one washes up)
    this.drafts = { base: null, held: [], cur: null };
    this.rand = mulberry32(77);
    this.ink = PALETTE[0].color;
  }

  // ---------------------------------------------------------------- setup
  resize({ width, height, dpr }) {
    const old = this.board;
    this.drafts = { base: null, held: [], cur: null };
    this.undoMarked = false; // undo snapshots survive: they're pasted back scaled to the new board
    Object.assign(this, { W: width, H: height, dpr });
    this.layout();
    this.scene = paintScene(this);
    this.grain = makeCanvas(1, 1).getContext('2d').createPattern(paintGrain(), 'repeat');
    this.critters = makeCritters(this);
    this.board = this.newBoard();
    if (old) {
      // Keep what was drawn, scaled to the new board.
      const g = this.board.inkCtx;
      g.save(); g.setTransform(1, 0, 0, 1, 0, 0);
      g.drawImage(old.ink, 0, 0, this.board.ink.width, this.board.ink.height);
      g.restore();
      this.board.inked = old.inked;
    }
    this.floating = [];
    this.splashes = [];
  }

  // Board on the left, stream down the right. The stream only swings toward the middle
  // below the board, where there's room for it.
  layout() {
    const { W, H } = this;
    const portrait = H >= W;
    this.sw = clamp(W * (portrait ? 0.16 : 0.09), 46, 110);      // stream width
    const top = clamp(H * 0.1, 58, 120);
    const bottom = H - clamp(H * 0.12, 92, 130);                 // clear of the toolbar
    this.swingAt = bottom + 8;
    this.baseX = W - this.sw * 0.5 - clamp(W * 0.035, 10, 40);
    this.amp = Math.min(this.sw * 0.38, W * 0.04);
    let right = Infinity;
    for (let y = top; y <= bottom; y += 4) right = Math.min(right, this.cx(y) - this.sw / 2);
    right -= clamp(W * 0.04, 12, 30);
    const bh = bottom - top;
    const maxW = bh * 1.15;
    let bw = right - 16;
    let x0 = 16;
    if (bw > maxW) { x0 = Math.max(16, (right - maxW) * 0.45); bw = right - x0; bw = Math.min(bw, maxW); }
    this.rect = { x: x0, y: top, w: bw, h: bh };
    this.dropY = top + Math.min(70, bh * 0.12);
  }

  cx(y) {
    const { H, W } = this;
    const s = Math.sin((y / H) * Math.PI * 2.6 + 0.7) * this.amp + Math.sin((y / H) * Math.PI * 5.3 + 2.1) * this.amp * 0.3;
    const swing = smoothstep(this.swingAt, H + this.sw, y);
    return this.baseX + s + (W * 0.6 - this.baseX) * swing * 0.55;
  }

  newBoard() {
    const { w, h } = this.rect;
    const seed = (this.rand() * 1e9) | 0;
    const tex = paintBoard(w, h, this.dpr, seed);
    const ink = makeCanvas(w * this.dpr, h * this.dpr);
    const inkCtx = ink.getContext('2d');
    inkCtx.setTransform(this.dpr, 0, 0, this.dpr, 0, 0);
    inkCtx.lineCap = inkCtx.lineJoin = 'round';
    inkCtx.strokeStyle = inkCtx.fillStyle = this.ink;
    const comp = makeCanvas(w * this.dpr, h * this.dpr);
    return { tex: tex.canvas, shape: tex.shape, ink, inkCtx, comp, inked: false, dirty: true, x: this.rect.x, y: this.rect.y, offX: 0, offY: 0, arrive: 1 };
  }

  setFadeSeconds() {}
  setPaused() {}

  // ---------------------------------------------------------------- input
  strokeStart(id, x, y, info) {
    const b = this.board;
    if (b && b.arrive >= 1) {
      const lx = x - b.x, ly = y - b.y;
      if (lx >= 0 && ly >= 0 && lx <= this.rect.w && ly <= this.rect.h) {
        const r = this.radiusFor(info, 0);
        if (!this.strokes.size) this.undoPush(); // two fingers at once make one undo step
        this.strokes.set(id, { x: lx, y: ly, r, t: info.time });
        if (!this.brushType?.dry) {
          const g = b.inkCtx;
          g.beginPath(); g.arc(lx, ly, r, 0, Math.PI * 2); g.fill();
        }
        b.inked = true; b.dirty = true;
        return;
      }
    }
    // A tap on the water just makes a ripple.
    if (Math.abs(x - this.cx(y)) < this.sw / 2) {
      this.splashes.push({ x, y, t: 0, size: 0.5 });
      sfx.cue('splash', { size: 0.5 });
    }
  }

  strokeMove(id, x, y, info) {
    const s = this.strokes.get(id);
    if (!s || !this.board) return;
    const lx = x - this.board.x, ly = y - this.board.y;
    const d = Math.hypot(lx - s.x, ly - s.y);
    if (d < 0.75) return;
    const speed = (d / Math.max(4, info.time - s.t)) * 1000;
    const r = s.r + (this.radiusFor(info, speed) - s.r) * 0.25;
    inkSegment(this.board.inkCtx, s, s.x, s.y, s.r, lx, ly, r, this.brushType);
    Object.assign(s, { x: lx, y: ly, r, t: info.time });
    this.board.dirty = true;
  }

  strokeEnd(id) {
    this.strokes.delete(id);
  }

  radiusFor(info, speed = 0) {
    return info.pointerType === 'pen' ? 1.4 + 2 * (info.pressure || 0.5)
         : info.pointerType === 'mouse' ? 2.6 : 3.2;
  }

  // ---------------------------------------------------------------- release
  clear() { this.release(); }

  release() {
    const b = this.board;
    if (!b || b.arrive < 1) return;
    this.strokes.clear();
    this.drafts = { base: null, held: [], cur: null };
    this.undoReset();
    this.undoMarked = false;
    sfx.cue('release');
    this.compose(b);
    const { w, h } = this.rect;
    const scale = (this.sw * 0.78) / w;
    this.floating.push({
      b, t: 0, scale,
      from: { x: b.x + b.offX + w / 2, y: b.y + b.offY + h / 2 },
      drop: { x: this.cx(this.dropY + h * scale / 2), y: this.dropY + h * scale / 2 },
      splashed: false, seed: this.rand() * 10,
    });
    this.board = null;
    this.washAt = this.time + WASH_UP_AT;
  }

  // ---------------------------------------------------------------- time
  update(dt) {
    this.time += dt;
    const { H } = this;
    let active = false;

    const b = this.board;
    if (b) {
      if (b.arrive < 1) {
        b.arrive = Math.min(1, b.arrive + dt / WASH_UP);
        active = true;
      }
    } else if (this.time >= this.washAt) {
      this.board = this.newBoard();
      this.board.arrive = 0;
      sfx.cue('arrive');
      active = true;
    } else active = true;

    for (const f of this.floating) {
      f.t += dt;
      const p = this.floatPos(f);
      Object.assign(f, p);
      if (!f.splashed && f.t >= LIFT) {
        f.splashed = true;
        this.splashes.push({ x: f.drop.x, y: f.drop.y, t: 0, size: 1.4 });
        sfx.cue('splash', { size: 1.4 });
      }
      this.critterReact(f);
    }
    this.floating = this.floating.filter((f) => f.y - this.rect.h * f.s < H + 40);
    if (this.floating.length) active = true;

    for (const s of this.splashes) s.t += dt;
    this.splashes = this.splashes.filter((s) => s.t < 1.8);
    if (this.splashes.length) active = true;

    if (updateCritters(this, dt)) active = true;
    return active;
  }

  // Where a released board is at time f.t.
  floatPos(f) {
    const { w, h } = this.rect;
    if (f.t < LIFT) {
      const p = easeInOut(f.t / LIFT);
      const lift = Math.sin(Math.PI * p) * 18;
      return {
        x: f.from.x + (f.drop.x - f.from.x) * p,
        y: f.from.y + (f.drop.y - f.from.y) * p - lift,
        s: 1 + (f.scale - 1) * p + Math.sin(Math.PI * p) * 0.04,
        a: Math.sin(Math.PI * p) * 0.08,
      };
    }
    const t = f.t - LIFT;
    // Eases in from the splash, then rides the current at a steady pace.
    const dist = this.H + h * f.scale + 40 - f.drop.y;
    const v = dist / (FLOAT_SECONDS - 0.6);
    const travel = t < 1.2 ? v * t * t / 2.4 : v * (t - 0.6);
    const y = f.drop.y + travel;
    const slope = (this.cx(y + 6) - this.cx(y - 6)) / 12;
    const bob = Math.sin(this.time * 2.1 + f.seed) * 0.05;
    return {
      x: this.cx(y) + Math.sin(this.time * 1.3 + f.seed) * this.sw * 0.06,
      y,
      s: f.scale * (1 + Math.sin(this.time * 3 + f.seed) * 0.015),
      a: -Math.atan(slope) * 0.9 + bob,
    };
  }

  critterReact(f) {
    if (f.t < LIFT) return;
    const c = this.critters;
    const near = (y) => Math.abs(f.y - y) < this.rect.h * f.s * 0.5 + 30;
    if (near(c.frog.y) && !c.frog.hopped) { c.frog.hopped = true; c.frog.hop = 0; }
    for (const fish of c.fish) if (near(fish.y) && fish.dart <= 0) { fish.dart = 1; fish.dir = f.x > fish.x ? -1 : 1; }
    if (near(c.ducks.y) && !c.ducks.following) { c.ducks.following = f; c.ducks.t = 0; }
  }

  // ---------------------------------------------------------------- draw
  compose(b) {
    if (!b.dirty) return;
    const g = b.comp.getContext('2d');
    g.setTransform(1, 0, 0, 1, 0, 0);
    g.globalCompositeOperation = 'copy';
    g.drawImage(b.ink, 0, 0);
    // Charcoal never covers perfectly: knock some grain out of it.
    g.globalCompositeOperation = 'destination-out';
    g.fillStyle = this.grain;
    g.fillRect(0, 0, b.comp.width, b.comp.height);
    g.globalCompositeOperation = 'destination-in';
    g.drawImage(b.shape, 0, 0);
    g.globalCompositeOperation = 'destination-over';
    g.drawImage(b.tex, 0, 0);
    g.globalCompositeOperation = 'source-over';
    b.dirty = false;
  }

  render(ctx) {
    const { dpr, rect } = this;
    ctx.setTransform(1, 0, 0, 1, 0, 0);
    ctx.drawImage(this.scene, 0, 0);
    ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
    drawRipples(ctx, this);
    for (const s of this.splashes) drawSplash(ctx, s);
    drawCritters(ctx, this, 'under');
    drawCritters(ctx, this, 'over');

    for (const f of this.floating) {
      this.compose(f.b);
      ctx.save();
      ctx.translate(f.x, f.y);
      ctx.rotate(f.a);
      ctx.scale(f.s, f.s);
      // Shadow on the water (or the grass, while it's lifted).
      ctx.fillStyle = 'rgba(10,30,30,0.22)';
      roundRect(ctx, -rect.w / 2 + 6 / f.s, -rect.h / 2 + 8 / f.s, rect.w, rect.h, 26);
      ctx.fill();
      ctx.drawImage(f.b.comp, -rect.w / 2, -rect.h / 2, rect.w, rect.h);
      ctx.restore();
    }

    const b = this.board;
    if (b) {
      this.compose(b);
      const p = easeInOut(b.arrive);
      const x = b.x + b.offX - (1 - p) * (rect.x + rect.w + 30);
      const y = b.y + b.offY;
      ctx.save();
      ctx.globalAlpha = Math.min(1, 0.2 + p);
      ctx.translate(x + rect.w / 2, y + rect.h / 2);
      ctx.rotate((1 - p) * -0.06);
      ctx.shadowColor = 'rgba(20,35,20,0.35)';
      ctx.shadowBlur = 16;
      ctx.shadowOffsetY = 6;
      ctx.drawImage(b.comp, -rect.w / 2, -rect.h / 2, rect.w, rect.h);
      ctx.restore();
    }
    ctx.setTransform(1, 0, 0, 1, 0, 0);
  }

  // ---------------------------------------------------------------- text
  // Prompts are chalked on lightly; typed words are in charcoal and wrap to fit the board.
  layoutOnBoard(text, opts, typed) {
    const { w, h, x: bx, y: by } = this.rect;
    const g = this.board.inkCtx;
    const lay = typed
      ? layoutText(g, text, { size: Math.min(w * 0.12, 46) * (opts.scale || 1), minSize: Math.min(22, w * 0.07) * (opts.scale || 1), maxWidth: w - 40, weight: 400, wrap: true, maxLines: 6, pad: 0 })
      : layoutText(g, text, { size: Math.min(w * 0.14, 54), maxWidth: w - 44, weight: 400, pad: 0 });
    const ink = this.ink;
    const block = (lay.lines.length - 1) * lay.lh;
    let place;
    if (opts.x != null && opts.y != null) {
      place = {
        align: 'left',
        x: clamp(opts.x - bx, 18, Math.max(18, w - 18 - lay.widest)),
        y0: clamp(opts.y - by, 20 + lay.size * 0.5, Math.max(20 + lay.size * 0.5, h - 20 - block)),
      };
    } else {
      const cy = opts.at != null ? this.H * opts.at - by : h * 0.4;
      place = { align: 'center', x: w / 2, y0: clamp(cy - (opts.top ? 0 : block / 2), 24 + lay.size * 0.5, h - 24 - block) };
    }
    return { lay, place, ink };
  }

  writeOnBoard({ lay, place, ink }, alpha) {
    const g = this.board.inkCtx;
    g.save();
    g.globalAlpha = alpha;
    g.fillStyle = g.strokeStyle = ink || this.ink;
    g.font = `400 ${lay.size}px ${HAND}`;
    drawText(g, lay, place, Math.max(1.4, lay.size * 0.04));
    g.restore();
    this.board.inked = true;
    this.board.dirty = true;
  }

  // New strokes and typed words use this colour; what's already on the wood keeps its own.
  setInk(color) {
    this.ink = color;
    const g = this.board?.inkCtx;
    if (g) g.strokeStyle = g.fillStyle = color;
  }

  intro(text, opts = {}) {
    if (!this.board) return;
    this.writeOnBoard(this.layoutOnBoard(text, opts, false), 0.55);
  }

  // Typing: words land on the board as you type. Nothing fades here, so "Done" just
  // leaves them on the wood until you let it go.
  setDraft(text, opts = {}) {
    const b = this.board;
    if (!b) return;
    const d = this.drafts;
    if (!d.base) {
      d.base = makeCanvas(b.ink.width, b.ink.height);
      d.base.getContext('2d').drawImage(b.ink, 0, 0);
    }
    markTypedBlock(this, text, !!d.cur);
    d.cur = text.trim() ? this.layoutOnBoard(text, opts, true) : null;
    const g = b.inkCtx;
    g.save(); g.setTransform(1, 0, 0, 1, 0, 0); g.globalCompositeOperation = 'copy'; g.drawImage(d.base, 0, 0); g.restore();
    for (const blk of [...d.held, ...(d.cur ? [d.cur] : [])]) this.writeOnBoard(blk, 1);
    b.dirty = true;
  }

  nextDraft() {
    endTypedBlock(this, !!this.drafts.cur);
    if (this.drafts.cur) this.drafts.held.push(this.drafts.cur);
    this.drafts.cur = null;
  }

  commitDraft() {
    endTypedBlock(this, !!this.drafts.cur);
    this.drafts = { base: null, held: [], cur: null };
  }

  // ---------------------------------------------------------------- undo (see lib/undo.js)
  undoSnapshot() {
    const b = this.board;
    return b && { ink: copyCanvas(b.ink), inked: b.inked };
  }

  undoRestore(snap) {
    const b = this.board;
    if (!b) return;
    pasteCanvas(b.ink, snap.ink);
    b.inked = snap.inked;
    b.dirty = true;
  }

  undoReady() { return !!this.board && this.board.arrive >= 1 && !this.drafts.base; }

  dispose() {}
}

Object.assign(Stream.prototype, undoMethods);

// ------------------------------------------------------------------ critters
function makeCritters(e) {
  const { H, rect } = e;
  const frogY = rect.y + rect.h * 0.48;
  const fish = [0.3, 0.62, 0.8].map((f, i) => {
    const y = rect.y + rect.h * f;
    return { y, x: e.cx(y) + (i % 2 ? -1 : 1) * e.sw * 0.12, baseY: y, dart: 0, dir: 1, phase: i * 1.7 };
  });
  const duckY = Math.min(H - 40, rect.y + rect.h * 0.72);
  return {
    frog: { y: frogY, hop: -1, hopped: false },
    fish,
    ducks: { y: duckY, baseY: duckY, following: null, t: 0, back: 0 },
  };
}

function updateCritters(e, dt) {
  const c = e.critters;
  let active = false;
  if (c.frog.hop >= 0) {
    c.frog.hop += dt;
    if (c.frog.hop > 1.1) c.frog.hop = -1;
    active = true;
  }
  if (!e.floating.length) c.frog.hopped = false;
  for (const f of c.fish) {
    if (f.dart > 0) {
      f.dart = Math.max(0, f.dart - dt * 0.45);
      active = true;
    }
  }
  const d = c.ducks;
  if (d.following) {
    d.t += dt;
    // Paddle after the board for a while, then turn back home.
    const target = Math.min(d.following.y - 40, d.baseY + e.H * 0.18);
    d.y += (Math.max(d.y, target) - d.y) * Math.min(1, dt * 1.2);
    if (d.t > 3.2 || !e.floating.includes(d.following)) { d.following = null; d.back = 1; }
    active = true;
  } else if (d.back) {
    d.y += (d.baseY - d.y) * Math.min(1, dt * 0.6);
    if (Math.abs(d.y - d.baseY) < 0.5) { d.y = d.baseY; d.back = 0; }
    active = true;
  }
  return active;
}

function drawCritters(ctx, e, layer) {
  const c = e.critters;
  if (layer === 'under') {
    for (const f of c.fish) {
      const k = f.dart;
      const off = k > 0 ? Math.sin((1 - k) * Math.PI) * 70 * f.dir : 0;
      const y = f.baseY + off;
      const x = e.cx(y) + Math.sin(e.time * 0.8 + f.phase) * e.sw * 0.08;
      drawFish(ctx, x, y, f.dir * (k > 0 ? 1 : 0.4), k > 0 ? 0.55 + 0.45 * (1 - k) : 1);
    }
    return;
  }
  // Lily pad and frog sit on the left half of the stream.
  const fy = c.frog.y;
  const fx = e.cx(fy) - e.sw * 0.2;
  const pad = e.sw * 0.3;
  ctx.fillStyle = '#5f9a4a';
  ctx.beginPath(); ctx.moveTo(fx, fy); ctx.arc(fx, fy, pad, 0.35, Math.PI * 2 - 0.1); ctx.closePath(); ctx.fill();
  ctx.strokeStyle = 'rgba(40,80,30,0.5)'; ctx.lineWidth = 1;
  ctx.beginPath(); ctx.moveTo(fx, fy); ctx.lineTo(fx - pad * 0.7, fy - pad * 0.3); ctx.moveTo(fx, fy); ctx.lineTo(fx - pad * 0.3, fy + pad * 0.7); ctx.stroke();
  let hopY = 0;
  if (c.frog.hop >= 0) {
    const t = c.frog.hop;
    hopY = t < 0.5 ? Math.sin((t / 0.5) * Math.PI) * 26 : Math.sin(((t - 0.5) / 0.4) * Math.PI) * 12 * (t < 0.9 ? 1 : 0);
  }
  drawFrog(ctx, fx, fy - hopY, Math.max(10, e.sw * 0.17));

  const d = c.ducks;
  const dx = e.cx(d.y) + e.sw * 0.15;
  drawDuck(ctx, dx, d.y, Math.max(9, e.sw * 0.15), false);
  drawDuck(ctx, dx - e.sw * 0.08, d.y - e.sw * 0.42, Math.max(6, e.sw * 0.09), true);
  drawDuck(ctx, dx + e.sw * 0.06, d.y - e.sw * 0.7, Math.max(6, e.sw * 0.09), true);
}

function drawFish(ctx, x, y, dir, alpha) {
  ctx.save();
  ctx.globalAlpha = 0.75 * alpha;
  ctx.translate(x, y);
  ctx.rotate(dir >= 0 ? Math.PI / 2 : -Math.PI / 2);
  ctx.fillStyle = '#f08a3c';
  ctx.beginPath(); ctx.ellipse(0, 0, 8, 3.6, 0, 0, Math.PI * 2); ctx.fill();
  ctx.beginPath(); ctx.moveTo(-6, 0); ctx.lineTo(-12, -4); ctx.lineTo(-12, 4); ctx.closePath(); ctx.fill();
  ctx.restore();
}

function drawFrog(ctx, x, y, r) {
  ctx.save();
  ctx.translate(x, y);
  ctx.fillStyle = 'rgba(20,50,20,0.25)';
  ctx.beginPath(); ctx.ellipse(1, r * 0.45, r * 0.9, r * 0.35, 0, 0, Math.PI * 2); ctx.fill();
  ctx.fillStyle = '#7cc04f';
  ctx.beginPath(); ctx.ellipse(0, 0, r, r * 0.8, 0, 0, Math.PI * 2); ctx.fill();
  for (const s of [-1, 1]) {
    ctx.fillStyle = '#7cc04f';
    ctx.beginPath(); ctx.arc(s * r * 0.5, -r * 0.65, r * 0.34, 0, Math.PI * 2); ctx.fill();
    ctx.fillStyle = '#fff';
    ctx.beginPath(); ctx.arc(s * r * 0.5, -r * 0.68, r * 0.2, 0, Math.PI * 2); ctx.fill();
    ctx.fillStyle = '#1d1d1d';
    ctx.beginPath(); ctx.arc(s * r * 0.5, -r * 0.66, r * 0.1, 0, Math.PI * 2); ctx.fill();
  }
  ctx.strokeStyle = '#3e6b2a'; ctx.lineWidth = 1.2;
  ctx.beginPath(); ctx.arc(0, -r * 0.05, r * 0.42, 0.3, Math.PI - 0.3); ctx.stroke();
  ctx.restore();
}

function drawDuck(ctx, x, y, r, baby) {
  ctx.save();
  ctx.translate(x, y);
  ctx.fillStyle = 'rgba(255,255,255,0.25)';
  ctx.beginPath(); ctx.ellipse(0, r * 0.5, r * 1.1, r * 0.4, 0, 0, Math.PI * 2); ctx.fill();
  ctx.fillStyle = baby ? '#f5d65a' : '#f4f1e8';
  ctx.beginPath(); ctx.ellipse(0, 0, r * 0.75, r, 0, 0, Math.PI * 2); ctx.fill();
  ctx.fillStyle = baby ? '#f5d65a' : '#3f7d4f';
  ctx.beginPath(); ctx.arc(0, -r * 0.9, r * 0.48, 0, Math.PI * 2); ctx.fill();
  ctx.fillStyle = '#f2a03b';
  ctx.beginPath(); ctx.ellipse(0, -r * 1.35, r * 0.2, r * 0.26, 0, 0, Math.PI * 2); ctx.fill();
  ctx.fillStyle = '#1d1d1d';
  for (const s of [-1, 1]) { ctx.beginPath(); ctx.arc(s * r * 0.22, -r * 1.0, Math.max(0.9, r * 0.07), 0, Math.PI * 2); ctx.fill(); }
  ctx.restore();
}

// ------------------------------------------------------------------ water
function drawRipples(ctx, e) {
  // Little current lines drifting downstream.
  ctx.save();
  ctx.strokeStyle = 'rgba(255,255,255,0.32)';
  ctx.lineWidth = 1.6;
  ctx.lineCap = 'round';
  const gap = 46, flow = (e.time * 28) % gap;
  for (let y = -gap + flow; y < e.H + gap; y += gap) {
    for (const [o, l] of [[-0.22, 12], [0.18, 9]]) {
      const yy = y + (o > 0 ? gap / 2 : 0);
      const x = e.cx(yy) + o * e.sw;
      const x2 = e.cx(yy + l);
      ctx.beginPath(); ctx.moveTo(x, yy); ctx.lineTo(x2 + o * e.sw, yy + l); ctx.stroke();
    }
  }
  ctx.restore();
}

function drawSplash(ctx, s) {
  const p = s.t / 1.8;
  ctx.save();
  for (let i = 0; i < 3; i++) {
    const q = p - i * 0.12;
    if (q <= 0) continue;
    ctx.strokeStyle = `rgba(255,255,255,${0.7 * (1 - q)})`;
    ctx.lineWidth = 2 * (1 - q) + 0.5;
    ctx.beginPath(); ctx.ellipse(s.x, s.y, 8 + q * 46 * s.size, 4 + q * 20 * s.size, 0, 0, Math.PI * 2); ctx.stroke();
  }
  if (s.size > 1 && p < 0.45) {
    // A few droplets thrown up by the drop.
    ctx.fillStyle = `rgba(230,248,255,${0.9 * (1 - p / 0.45)})`;
    for (let i = 0; i < 8; i++) {
      const a = (i / 8) * Math.PI * 2;
      const d = 10 + p * 80;
      ctx.beginPath(); ctx.arc(s.x + Math.cos(a) * d, s.y + Math.sin(a) * d * 0.5 - Math.sin(p / 0.45 * Math.PI) * 18, 2.2, 0, Math.PI * 2); ctx.fill();
    }
  }
  ctx.restore();
}

// ------------------------------------------------------------------ painting
// Storybook meadow with the stream winding down the right side.
function paintScene(e) {
  const { W, H, dpr } = e;
  const rand = mulberry32(31);
  const c = makeCanvas(W * dpr, H * dpr), g = c.getContext('2d');
  g.scale(dpr, dpr);

  const grass = g.createLinearGradient(0, 0, W * 0.3, H);
  grass.addColorStop(0, '#a9d27a');
  grass.addColorStop(0.55, '#93c466');
  grass.addColorStop(1, '#7db257');
  g.fillStyle = grass;
  g.fillRect(0, 0, W, H);

  // Soft patches of lighter and darker grass, painted small and scaled up.
  const s = 6, sw = Math.ceil(W / s), sh = Math.ceil(H / s);
  const n = valueNoise(sw, sh, 14, rand);
  const pc = makeCanvas(sw, sh), pg = pc.getContext('2d'), img = pg.createImageData(sw, sh);
  for (let i = 0; i < sw * sh; i++) {
    const v = n[i];
    const light = v > 0.5;
    img.data[i * 4] = light ? 220 : 40;
    img.data[i * 4 + 1] = light ? 240 : 90;
    img.data[i * 4 + 2] = light ? 160 : 30;
    img.data[i * 4 + 3] = Math.abs(v - 0.5) * 80;
  }
  pg.putImageData(img, 0, 0);
  g.imageSmoothingEnabled = true;
  g.drawImage(pc, 0, 0, W, H);

  // Grass tufts.
  g.strokeStyle = 'rgba(60,110,40,0.35)';
  g.lineWidth = 1.2;
  g.lineCap = 'round';
  for (let i = 0; i < (W * H) / 2600; i++) {
    const x = rand() * W, y = rand() * H;
    if (Math.abs(x - e.cx(y)) < e.sw * 0.8) continue;
    for (let k = -1; k <= 1; k++) {
      g.beginPath(); g.moveTo(x + k * 2, y); g.quadraticCurveTo(x + k * 3, y - 4, x + k * 4.5, y - 7 - rand() * 3); g.stroke();
    }
  }

  // The stream: a muddy bank, then water with a lighter middle.
  const path = (off) => {
    g.beginPath();
    g.moveTo(e.cx(-20) - off, -20);
    for (let y = -20; y <= H + 40; y += 6) g.lineTo(e.cx(y) - off, y);
    for (let y = H + 40; y >= -20; y -= 6) g.lineTo(e.cx(y) + off, y);
    g.closePath();
  };
  g.fillStyle = '#8a7a4f';
  path(e.sw / 2 + 5); g.fill();
  g.fillStyle = '#4fa9c4';
  path(e.sw / 2); g.fill();
  g.save();
  path(e.sw / 2); g.clip();
  g.fillStyle = 'rgba(160,225,240,0.45)';
  path(e.sw * 0.22); g.fill();
  g.fillStyle = 'rgba(20,70,100,0.18)';
  for (let y = -20; y < H + 40; y += 6) { g.fillRect(e.cx(y) + e.sw * 0.34, y, e.sw * 0.2, 6); }
  g.restore();

  // Pebbles along the banks.
  for (let i = 0; i < H / 14; i++) {
    const y = rand() * H, side = rand() < 0.5 ? -1 : 1;
    const x = e.cx(y) + side * (e.sw / 2 + 4 + rand() * 6);
    g.fillStyle = `rgba(${150 + rand() * 50 | 0},${145 + rand() * 40 | 0},${130 + rand() * 30 | 0},0.9)`;
    g.beginPath(); g.ellipse(x, y, 2 + rand() * 3.5, 1.6 + rand() * 2.4, rand() * 3, 0, Math.PI * 2); g.fill();
  }

  // Reeds on the far bank.
  g.strokeStyle = '#4f8a3a';
  g.lineWidth = 2;
  for (let i = 0; i < 6; i++) {
    const y = e.rect.y + rand() * e.rect.h;
    const x = e.cx(y) + e.sw / 2 + 8;
    if (x > W - 4) continue;
    for (let k = 0; k < 3; k++) {
      g.beginPath(); g.moveTo(x + k * 3, y); g.quadraticCurveTo(x + k * 3 + 2, y - 10, x + k * 4, y - 18 - rand() * 8); g.stroke();
    }
    g.fillStyle = '#7a5532';
    g.beginPath(); g.ellipse(x + 4, y - 22, 2, 5, 0.1, 0, Math.PI * 2); g.fill();
  }

  // Flowers and a couple of mushrooms below the board.
  const below = e.rect.y + e.rect.h + 10;
  for (let i = 0; i < Math.max(6, W / 40); i++) {
    const x = rand() * W, y = below + rand() * (H - below);
    if (Math.abs(x - e.cx(y)) < e.sw) continue;
    daisy(g, x, y, 3 + rand() * 2, rand() < 0.3 ? '#ffe36b' : '#ffffff');
  }
  for (let i = 0; i < 18; i++) {
    const x = rand() * W, y = rand() * H;
    if (Math.abs(x - e.cx(y)) < e.sw || (x > e.rect.x - 8 && x < e.rect.x + e.rect.w + 8 && y > e.rect.y - 8 && y < e.rect.y + e.rect.h + 8)) continue;
    daisy(g, x, y, 2.5 + rand() * 1.5, rand() < 0.5 ? '#ffffff' : '#f6b9d0');
  }
  mushroom(g, e.rect.x + 18, Math.min(H - 20, below + 22), 9);
  mushroom(g, e.rect.x + 36, Math.min(H - 14, below + 30), 6);

  // A soft vignette so the board reads as the subject.
  const v = g.createRadialGradient(W * 0.4, H * 0.45, Math.min(W, H) * 0.4, W * 0.4, H * 0.45, Math.max(W, H) * 0.85);
  v.addColorStop(0, 'rgba(30,50,20,0)');
  v.addColorStop(1, 'rgba(30,50,20,0.22)');
  g.fillStyle = v;
  g.fillRect(0, 0, W, H);
  return c;
}

function daisy(g, x, y, r, color) {
  g.fillStyle = color;
  for (let i = 0; i < 5; i++) {
    const a = (i / 5) * Math.PI * 2;
    g.beginPath(); g.arc(x + Math.cos(a) * r * 0.75, y + Math.sin(a) * r * 0.75, r * 0.55, 0, Math.PI * 2); g.fill();
  }
  g.fillStyle = '#f2b632';
  g.beginPath(); g.arc(x, y, r * 0.42, 0, Math.PI * 2); g.fill();
}

function mushroom(g, x, y, r) {
  g.fillStyle = '#f3ead8';
  g.fillRect(x - r * 0.3, y - r * 0.2, r * 0.6, r * 0.9);
  g.fillStyle = '#d9483b';
  g.beginPath(); g.ellipse(x, y - r * 0.2, r, r * 0.7, 0, Math.PI, 0); g.fill();
  g.fillStyle = '#fff';
  for (const [dx, dy] of [[-0.4, -0.5], [0.3, -0.6], [0.05, -0.3]]) { g.beginPath(); g.arc(x + dx * r, y + dy * r, r * 0.13, 0, Math.PI * 2); g.fill(); }
}

// A weathered, pale driftwood board with grain running along its length.
function paintBoard(w, h, dpr, seed) {
  const rand = mulberry32(seed);
  const cw = w * dpr, ch = h * dpr;
  const shape = makeCanvas(cw, ch), sg = shape.getContext('2d');
  sg.scale(dpr, dpr);
  // Slightly irregular outline: rounded, with a gentle wobble along the long edges.
  const r = Math.min(26, w * 0.08);
  sg.beginPath();
  const pts = [];
  const steps = 24;
  for (let i = 0; i <= steps; i++) pts.push([1 + Math.sin(i * 1.7 + rand() * 6) * 2.4, r + (h - 2 * r) * (i / steps)]);
  sg.moveTo(r, 1);
  sg.lineTo(w - r, 1 + rand() * 2);
  sg.quadraticCurveTo(w - 1, 1, w - 1, r);
  for (const [o, y] of pts) sg.lineTo(w - 1 - o, y);
  sg.quadraticCurveTo(w - 1, h - 1, w - r, h - 1);
  sg.lineTo(r, h - 1 - rand() * 2);
  sg.quadraticCurveTo(1, h - 1, 1, h - r);
  for (const [o, y] of pts.slice().reverse()) sg.lineTo(1 + o, y);
  sg.quadraticCurveTo(1, 1, r, 1);
  sg.closePath();
  sg.fillStyle = '#000';
  sg.fill();

  const c = makeCanvas(cw, ch), g = c.getContext('2d');
  g.scale(dpr, dpr);
  const base = g.createLinearGradient(0, 0, w, h);
  base.addColorStop(0, '#d9ccb4');
  base.addColorStop(0.5, '#cdbfa5');
  base.addColorStop(1, '#bfb096');
  g.fillStyle = base;
  g.fillRect(0, 0, w, h);
  // Grain: long wavy lines down the board.
  for (let i = 0; i < w / 5; i++) {
    const x0 = rand() * w;
    const amp = 2 + rand() * 4, fr = 0.004 + rand() * 0.01, ph = rand() * 6;
    g.strokeStyle = `rgba(${90 + rand() * 30 | 0},${75 + rand() * 20 | 0},${55 + rand() * 20 | 0},${0.07 + rand() * 0.12})`;
    g.lineWidth = 0.6 + rand() * 1.4;
    g.beginPath();
    for (let y = 0; y <= h; y += 8) {
      const x = x0 + Math.sin(y * fr + ph) * amp;
      y ? g.lineTo(x, y) : g.moveTo(x, y);
    }
    g.stroke();
  }
  // A knot or two, with grain bending around it.
  for (let k = 0; k < 2; k++) {
    const kx = w * (0.2 + rand() * 0.6), ky = h * (0.15 + rand() * 0.7), kr = 6 + rand() * 8;
    for (let i = 4; i >= 0; i--) {
      g.strokeStyle = `rgba(110,85,60,${0.1 + (4 - i) * 0.05})`;
      g.lineWidth = 1.2;
      g.beginPath(); g.ellipse(kx, ky, kr + i * 4, (kr + i * 4) * 1.8, 0, 0, Math.PI * 2); g.stroke();
    }
    g.fillStyle = 'rgba(95,70,48,0.55)';
    g.beginPath(); g.ellipse(kx, ky, kr * 0.6, kr, 0, 0, Math.PI * 2); g.fill();
  }
  // Weathered edges.
  const edge = g.createLinearGradient(0, 0, w, 0);
  edge.addColorStop(0, 'rgba(110,95,70,0.28)');
  edge.addColorStop(0.08, 'rgba(110,95,70,0)');
  edge.addColorStop(0.92, 'rgba(110,95,70,0)');
  edge.addColorStop(1, 'rgba(110,95,70,0.3)');
  g.fillStyle = edge;
  g.fillRect(0, 0, w, h);
  const hl = g.createLinearGradient(0, 0, 0, h);
  hl.addColorStop(0, 'rgba(255,255,255,0.18)');
  hl.addColorStop(0.3, 'rgba(255,255,255,0)');
  g.fillStyle = hl;
  g.fillRect(0, 0, w, h);

  g.globalCompositeOperation = 'destination-in';
  g.setTransform(1, 0, 0, 1, 0, 0);
  g.drawImage(shape, 0, 0);
  return { canvas: c, shape };
}

// Tiny tile of uneven charcoal coverage.
function paintGrain() {
  const rand = mulberry32(9);
  const n = 96, c = makeCanvas(n, n), g = c.getContext('2d');
  const img = g.createImageData(n, n);
  const soft = valueNoise(n, n, 5, rand);
  for (let i = 0; i < n * n; i++) {
    const a = 0.04 + 0.2 * soft[i] + 0.25 * rand() * rand();
    img.data[i * 4 + 3] = a * 255;
  }
  g.putImageData(img, 0, 0);
  return c;
}
