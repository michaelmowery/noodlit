// Whiteboard: a glossy dry-erase board.
//   Look:  crisp navy marker lines with a slight dry-ink grain, under the board's sheen.
//   Decay: ink dries and lifts unevenly, breaking into patches, then leaves a faint
//          ghost of the line that lingers well after the ink itself is gone.
//   Clear: a felt eraser sweeps the board in a few quick passes, leaving soft smudges
//          that settle away like the ghosting on a real, well-used board.

import { clamp, smoothstep, easeInOut, mulberry32, makeCanvas, valueNoise, layoutFor, drawText, TextOverlay, draftMethods, HAND } from '../lib/util.js';

const HOLD = 0.3;          // extra life above 1.0 = a short "fresh ink" hold before it starts to lift
const GHOST = 0.13;        // opacity of the trace a stroke leaves behind
const GHOST_LIFE = 3;      // a ghost lasts about this many fade periods
const ERASE_GHOST = 0.06;  // smudge an eraser pass leaves where ink was
const INK = '#1f2d55';

export const whiteboard = {
  id: 'whiteboard',
  name: 'Whiteboard',
  clearLabel: 'Erase',
  clearIcon: 'M4 15l7-7a2 2 0 0 1 2.8 0l3.2 3.2a2 2 0 0 1 0 2.8L13 18H7zM9 10l5 5M13 18h7',
  surface: 'Whiteboard drawing surface',
  create: () => new Whiteboard(),
};

class Whiteboard {
  constructor() {
    this.fadeSeconds = 20;
    this.paused = false;
    this.strokes = new Map();
    this.clearing = null;
    this.life = null;
    this.ghost = null;
    this.cell = 0;
    this.mw = 0;
    this.mh = 0;
    this.inked = false;
  }

  // ---------------------------------------------------------------- setup
  resize({ width, height, dpr }) {
    this.dropDraft();
    // Two low-res maps drive the decay: `life` (fresh ink) and `ghost` (the trace left
    // behind). The full-res `ink` canvas only holds the shape of everything drawn.
    const cell = Math.max(1, Math.ceil(Math.sqrt((width * height) / 300000)));
    const mw = Math.ceil(width / cell) + 1;
    const mh = Math.ceil(height / cell) + 1;
    const keep = (old) => {
      const next = new Float32Array(mw * mh);
      if (old && cell === this.cell) {
        const cw = Math.min(mw, this.mw), ch = Math.min(mh, this.mh);
        for (let y = 0; y < ch; y++) next.set(old.subarray(y * this.mw, y * this.mw + cw), y * mw);
      }
      return next;
    };
    const life = keep(this.life), ghost = keep(this.ghost);
    const oldInk = this.ink;
    Object.assign(this, { W: width, H: height, dpr, cell, mw, mh, life, ghost });

    // Ink lifts in patches: some areas of the board hold ink longer than others.
    const rand = mulberry32(11);
    const coarse = valueNoise(mw, mh, Math.max(5, Math.round(40 / cell)), rand);
    const fine = valueNoise(mw, mh, Math.max(2, Math.round(5 / cell)), rand);
    this.decay = new Float32Array(mw * mh);
    for (let i = 0; i < this.decay.length; i++) {
      this.decay[i] = 0.6 + 0.55 * coarse[i] + 0.55 * (fine[i] - 0.5);
    }

    this.mask = makeCanvas(mw, mh);
    this.maskCtx = this.mask.getContext('2d');
    this.maskImg = this.maskCtx.createImageData(mw, mh);
    const d = this.maskImg.data;
    for (let i = 0; i < d.length; i += 4) d[i] = d[i + 1] = d[i + 2] = 255;

    this.ink = makeCanvas(width * dpr, height * dpr);
    this.inkCtx = this.ink.getContext('2d');
    if (oldInk) this.inkCtx.drawImage(oldInk, 0, 0);
    const ig = this.inkCtx;
    ig.setTransform(dpr, 0, 0, dpr, 0, 0);
    ig.strokeStyle = ig.fillStyle = INK;
    ig.lineCap = ig.lineJoin = 'round';

    this.board = paintBoard(width, height, dpr);
    this.sheen = paintSheen(width, height, dpr);
    this.work = makeCanvas(width * dpr, height * dpr);
    this.workCtx = this.work.getContext('2d');
    this.grain = this.workCtx.createPattern(paintGrain(), 'repeat');
  }

  setFadeSeconds(s) { this.fadeSeconds = s; }
  setPaused(p) { this.paused = p; }

  // ---------------------------------------------------------------- strokes
  radiusFor(info, speed) {
    const r = info.pointerType === 'pen' ? 1.6 + 1.8 * (info.pressure || 0.5)
            : info.pointerType === 'mouse' ? 2.8 : 3.4;
    // A quick flick lays down a touch less ink.
    return r * (1 - Math.min(0.22, speed / 5000));
  }

  strokeStart(id, x, y, info) {
    const r = this.radiusFor(info, 0);
    this.strokes.set(id, { x, y, r, t: info.time });
    const g = this.inkCtx;
    g.beginPath(); g.arc(x, y, r, 0, Math.PI * 2); g.fill();
    this.mark(x, y, r, x, y, r);
  }

  strokeMove(id, x, y, info) {
    const s = this.strokes.get(id);
    if (!s) return;
    const d = Math.hypot(x - s.x, y - s.y);
    if (d < 0.75) return;
    const speed = (d / Math.max(4, info.time - s.t)) * 1000;
    const r = s.r + (this.radiusFor(info, speed) - s.r) * 0.2;
    const g = this.inkCtx;
    g.lineWidth = s.r + r;
    g.beginPath(); g.moveTo(s.x, s.y); g.lineTo(x, y); g.stroke();
    this.mark(s.x, s.y, s.r, x, y, r);
    Object.assign(s, { x, y, r, t: info.time });
  }

  strokeEnd(id) { this.strokes.delete(id); }

  // Give fresh life (and a future ghost) to the cells under a capsule.
  mark(x0, y0, r0, x1, y1, r1) {
    const { cell, mw, mh, life, ghost } = this;
    const inv = 1 / cell, pad = cell * 1.2, rmax = Math.max(r0, r1) + pad;
    const minX = Math.max(0, Math.floor((Math.min(x0, x1) - rmax) * inv));
    const maxX = Math.min(mw - 1, Math.ceil((Math.max(x0, x1) + rmax) * inv));
    const minY = Math.max(0, Math.floor((Math.min(y0, y1) - rmax) * inv));
    const maxY = Math.min(mh - 1, Math.ceil((Math.max(y0, y1) + rmax) * inv));
    const dx = x1 - x0, dy = y1 - y0, len2 = dx * dx + dy * dy;
    const peak = 1 + HOLD;
    for (let j = minY; j <= maxY; j++) {
      const py = (j + 0.5) * cell;
      for (let i = minX; i <= maxX; i++) {
        const px = (i + 0.5) * cell;
        let t = len2 > 0 ? ((px - x0) * dx + (py - y0) * dy) / len2 : 0;
        t = t < 0 ? 0 : t > 1 ? 1 : t;
        const qx = x0 + dx * t - px, qy = y0 + dy * t - py;
        const dist = Math.sqrt(qx * qx + qy * qy);
        const r = r0 + (r1 - r0) * t + pad;
        if (dist >= r) continue;
        const k = j * mw + i;
        life[k] = peak;
        if (ghost[k] < GHOST) ghost[k] = GHOST;
      }
    }
    this.inked = true;
  }

  // ---------------------------------------------------------------- time
  clear() {
    const { W, H } = this;
    const passes = Math.max(3, Math.ceil(H / 210));
    const band = H / passes;
    const ew = clamp(W * 0.13, 52, 84);
    this.clearing = {
      t: 0, passes, band, ew, eh: band + 26,
      pass: 0.3, turn: 0.04,
      x: -ew, y: band / 2, prevX: -ew, prevY: band / 2, tilt: 0,
    };
    this.strokes.clear();
  }

  update(dt) {
    const { life, ghost, decay } = this;
    let alive = false;
    if (!this.paused) {
      const rate = ((1 + HOLD) / this.fadeSeconds) * dt;
      const grate = (GHOST / (this.fadeSeconds * GHOST_LIFE)) * dt;
      for (let i = 0; i < life.length; i++) {
        const l = life[i], gh = ghost[i];
        if (l > 0) {
          const n = l - rate * decay[i];
          life[i] = n > 0 ? n : 0;
          alive = true;
        }
        if (gh > 0) {
          // Ghosts only start to settle once the ink above them has gone.
          if (l <= 0.25) { const n = gh - grate * (0.5 + decay[i] * 0.5); ghost[i] = n > 0 ? n : 0; }
          alive = true;
        }
      }
    } else {
      for (let i = 0; i < life.length; i++) if (life[i] > 0 || ghost[i] > 0) { alive = true; break; }
    }

    if (this.applyDrafts()) alive = true;
    if (this.clearing) this.updateEraser(dt);

    // Nothing left anywhere: drop the ink shapes so old lines can't resurface later.
    if (!alive && this.inked && !this.clearing) {
      const g = this.inkCtx;
      g.save(); g.setTransform(1, 0, 0, 1, 0, 0); g.clearRect(0, 0, this.ink.width, this.ink.height); g.restore();
      this.inked = false;
    }
    return alive || !!this.clearing;
  }

  updateEraser(dt) {
    const cl = this.clearing;
    cl.t += dt;
    const leg = cl.pass + cl.turn;
    const total = cl.passes * leg - cl.turn;
    const t = Math.min(cl.t, total);
    const n = Math.min(cl.passes - 1, Math.floor(t / leg));
    const local = t - n * leg;
    const left = -cl.ew * 0.7, right = this.W + cl.ew * 0.7;
    const dir = n % 2 === 0 ? 1 : -1;
    let x, y = cl.band * (n + 0.5);
    if (local <= cl.pass) {
      const p = easeInOut(local / cl.pass);
      x = dir > 0 ? left + (right - left) * p : right - (right - left) * p;
    } else {
      // Off-screen turn down to the next band.
      x = dir > 0 ? right : left;
      y += cl.band * easeInOut((local - cl.pass) / cl.turn);
    }
    cl.prevX = cl.x; cl.prevY = cl.y;
    cl.x = x; cl.y = y;
    const vx = (x - cl.prevX) / Math.max(dt, 1e-3);
    cl.tilt += (clamp(-vx / 9000, -0.07, 0.07) - cl.tilt) * Math.min(1, dt * 12);
    if (cl.prevY === y) this.erase(Math.min(cl.prevX, x) - cl.ew / 2, Math.max(cl.prevX, x) + cl.ew / 2, y - cl.eh / 2, y + cl.eh / 2);
    if (cl.t >= total) {
      // Belt and braces: whatever the passes missed is gone too, as a smudge.
      for (let i = 0; i < this.life.length; i++) this.smudge(i);
      this.clearing = null;
    }
  }

  // Wipe a rectangle of the board: ink goes, a faint smear of it stays.
  erase(x0, x1, y0, y1) {
    const { cell, mw, mh } = this;
    const i0 = Math.max(0, Math.floor(x0 / cell)), i1 = Math.min(mw - 1, Math.ceil(x1 / cell));
    const j0 = Math.max(0, Math.floor(y0 / cell)), j1 = Math.min(mh - 1, Math.ceil(y1 / cell));
    for (let j = j0; j <= j1; j++) for (let i = i0; i <= i1; i++) this.smudge(j * mw + i);
  }

  smudge(k) {
    const l = this.life[k];
    if (l <= 0 && this.ghost[k] <= 0) return;
    const was = Math.max(Math.min(1, l), this.ghost[k] / GHOST);
    this.life[k] = 0;
    this.ghost[k] = ERASE_GHOST * was * (0.55 + 0.45 * this.decay[k]);
  }

  // ---------------------------------------------------------------- draw
  render(ctx) {
    const { life, ghost, maskImg, dpr } = this;
    const data = maskImg.data;
    for (let i = 0, k = 3; i < life.length; i++, k += 4) {
      const l = life[i] > 1 ? 1 : life[i];
      // Ink thins out smoothly, then the ghost underneath takes over.
      const a = l * l * (3 - 2 * l);
      data[k] = (a > ghost[i] ? a : ghost[i]) * 255;
    }
    this.maskCtx.putImageData(maskImg, 0, 0);

    const g = this.workCtx, w = this.work;
    g.globalCompositeOperation = 'copy';
    g.imageSmoothingEnabled = true;
    g.imageSmoothingQuality = 'high';
    g.drawImage(this.mask, 0, 0, this.mw * this.cell * dpr, this.mh * this.cell * dpr);
    g.globalCompositeOperation = 'source-in';
    g.drawImage(this.ink, 0, 0);
    // Dry-erase ink never lays down perfectly flat.
    g.globalCompositeOperation = 'destination-out';
    g.fillStyle = this.grain;
    g.fillRect(0, 0, w.width, w.height);
    g.globalCompositeOperation = 'source-over';

    ctx.setTransform(1, 0, 0, 1, 0, 0);
    ctx.drawImage(this.board, 0, 0);
    ctx.drawImage(w, 0, 0);
    ctx.drawImage(this.sheen, 0, 0);
    if (this.clearing) {
      ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
      this.drawEraser(ctx);
      ctx.setTransform(1, 0, 0, 1, 0, 0);
    }
  }

  drawEraser(ctx) {
    const { x, y, ew, eh, tilt } = this.clearing;
    const w = ew, h = eh * 0.86, r = Math.min(12, w * 0.2);
    ctx.save();
    ctx.translate(x, y);
    ctx.rotate(tilt);
    // Soft contact shadow.
    ctx.shadowColor = 'rgba(20,28,40,0.28)';
    ctx.shadowBlur = 22;
    ctx.shadowOffsetY = 8;
    ctx.fillStyle = '#d8d3ca';
    roundRect(ctx, -w / 2, -h / 2, w, h, r);
    ctx.fill();
    ctx.shadowColor = 'transparent';
    // Felt edge peeking out under the handle.
    ctx.fillStyle = '#cbc5ba';
    roundRect(ctx, -w / 2, -h / 2, w, h, r);
    ctx.fill();
    // Handle.
    const body = ctx.createLinearGradient(-w / 2, 0, w / 2, 0);
    body.addColorStop(0, '#3b4350');
    body.addColorStop(0.5, '#2c333e');
    body.addColorStop(1, '#232931');
    ctx.fillStyle = body;
    roundRect(ctx, -w / 2 + 4, -h / 2 + 4, w - 8, h - 8, r - 3);
    ctx.fill();
    // Grip groove and a top highlight.
    ctx.strokeStyle = 'rgba(255,255,255,0.10)';
    ctx.lineWidth = 2;
    ctx.beginPath(); ctx.moveTo(0, -h / 2 + 18); ctx.lineTo(0, h / 2 - 18); ctx.stroke();
    ctx.fillStyle = 'rgba(255,255,255,0.08)';
    roundRect(ctx, -w / 2 + 6, -h / 2 + 6, w * 0.32, h - 12, r - 4);
    ctx.fill();
    ctx.restore();
  }

  // Pre-write a hint in marker so the mechanic explains itself.
  intro(text, opts = {}) {
    this.stampText(text, opts).overlay.apply();
    this.inked = true;
  }

  // Typed text (see draftMethods): fresh ink while typing, then it dries and lifts like
  // any line. The ink canvas only ever grows, so keep a copy of it from before typing
  // started and redraw the typed blocks on top of it whenever one changes.
  onDraftChange() {
    if (!this.inkBase) {
      this.inkBase = makeCanvas(this.ink.width, this.ink.height);
      this.inkBase.getContext('2d').drawImage(this.ink, 0, 0);
    }
    this.restoreInk();
    for (const d of [...(this.held || []), ...(this.draft ? [this.draft] : [])]) this.inkText(d);
    if (this.hasDrafts()) this.inked = true;
  }

  onCommit() { this.inkBase = null; }

  onDrop() {
    if (this.inkBase) this.restoreInk();
    this.inkBase = null;
  }

  restoreInk() {
    const g = this.inkCtx;
    g.save();
    g.setTransform(1, 0, 0, 1, 0, 0);
    g.globalCompositeOperation = 'copy';
    g.drawImage(this.inkBase, 0, 0);
    g.restore();
  }

  inkText({ lay, place }) {
    const ig = this.inkCtx;
    ig.save();
    ig.font = `400 ${lay.size}px ${HAND}`;
    drawText(ig, lay, place, Math.max(1.5, lay.size * 0.035));
    ig.restore();
  }

  stampText(text, opts) {
    const { mw, mh, cell, W, H, life, ghost } = this;
    const style = { W, H, size: Math.min(W * 0.14, 68), maxFrac: 0.8, weight: 400, pad: 0 };
    const { lay, place } = layoutFor(this.inkCtx, text, opts, style);
    // The ink itself, at full resolution (typed drafts are inked in onDraftChange).
    if (!opts.typed) this.inkText({ lay, place });
    // And its life, on the low-res map (dilated a touch so the mask fully covers the ink).
    const c = makeCanvas(mw, mh), g = c.getContext('2d');
    g.scale(1 / cell, 1 / cell);
    g.fillStyle = g.strokeStyle = '#fff';
    g.font = `400 ${lay.size}px ${HAND}`;
    drawText(g, lay, place, Math.max(1.5, lay.size * 0.035));
    const px = g.getImageData(0, 0, mw, mh).data;
    const overlay = new TextOverlay();
    for (let j = 1; j < mh - 1; j++) {
      for (let i = 1; i < mw - 1; i++) {
        let m = 0;
        for (let dy = -1; dy <= 1; dy++) for (let dx = -1; dx <= 1; dx++) m = Math.max(m, px[((j + dy) * mw + i + dx) * 4 + 3]);
        if (m < 20) continue;
        const k = j * mw + i;
        overlay.put(life, k, 1 + HOLD * 1.6);
        overlay.put(ghost, k, GHOST);
      }
    }
    return { overlay, lay, place };
  }
}

function roundRect(ctx, x, y, w, h, r) {
  ctx.beginPath();
  ctx.moveTo(x + r, y);
  ctx.arcTo(x + w, y, x + w, y + h, r);
  ctx.arcTo(x + w, y + h, x, y + h, r);
  ctx.arcTo(x, y + h, x, y, r);
  ctx.arcTo(x, y, x + w, y, r);
  ctx.closePath();
}

// ------------------------------------------------------------------ scenery
// The board: a cool, slightly glossy white with the faint memory of past meetings.
function paintBoard(W, H, dpr) {
  const rand = mulberry32(23);
  const c = makeCanvas(W * dpr, H * dpr), g = c.getContext('2d');
  g.scale(dpr, dpr);

  const base = g.createLinearGradient(0, 0, W * 0.4, H);
  base.addColorStop(0, '#f6f7f5');
  base.addColorStop(0.6, '#eef0ee');
  base.addColorStop(1, '#e4e7e6');
  g.fillStyle = base;
  g.fillRect(0, 0, W, H);

  // The faint memory of earlier erasing, painted small and scaled up so it stays soft.
  const s = 4, sw = Math.ceil(W / s), sh = Math.ceil(H / s);
  const old = makeCanvas(sw, sh), og = old.getContext('2d');
  // A couple of broad eraser smears.
  for (let n = 0; n < 3; n++) {
    og.fillStyle = 'rgba(80,90,110,0.018)';
    og.beginPath();
    og.ellipse(rand() * sw, rand() * sh, sw * (0.2 + rand() * 0.2), sh * 0.03, (rand() - 0.5) * 0.3, 0, Math.PI * 2);
    og.fill();
  }
  g.imageSmoothingEnabled = true;
  g.drawImage(old, 0, 0, W, H);

  // Room light falling on the board.
  const glow = g.createRadialGradient(W * 0.25, -H * 0.1, 0, W * 0.25, -H * 0.1, Math.max(W, H) * 0.9);
  glow.addColorStop(0, 'rgba(255,255,255,0.55)');
  glow.addColorStop(1, 'rgba(255,255,255,0)');
  g.fillStyle = glow;
  g.fillRect(0, 0, W, H);

  // Edges fall off a little, as if the board sits in its frame.
  const v = g.createRadialGradient(W / 2, H * 0.45, Math.min(W, H) * 0.45, W / 2, H * 0.45, Math.max(W, H) * 0.85);
  v.addColorStop(0, 'rgba(90,100,110,0)');
  v.addColorStop(1, 'rgba(90,100,110,0.16)');
  g.fillStyle = v;
  g.fillRect(0, 0, W, H);
  return c;
}

// Gloss reflection, drawn over the ink so lines sit under the surface.
function paintSheen(W, H, dpr) {
  const c = makeCanvas(W * dpr, H * dpr), g = c.getContext('2d');
  g.scale(dpr, dpr);
  const L = Math.hypot(W, H);
  const band = g.createLinearGradient(0, 0, W, H);
  band.addColorStop(0.18, 'rgba(255,255,255,0)');
  band.addColorStop(0.3, 'rgba(255,255,255,0.20)');
  band.addColorStop(0.36, 'rgba(255,255,255,0.06)');
  band.addColorStop(0.44, 'rgba(255,255,255,0.14)');
  band.addColorStop(0.58, 'rgba(255,255,255,0)');
  g.fillStyle = band;
  g.fillRect(0, 0, W, H);
  // Faint bounce at the bottom edge.
  const low = g.createLinearGradient(0, H - L * 0.12, 0, H);
  low.addColorStop(0, 'rgba(255,255,255,0)');
  low.addColorStop(1, 'rgba(255,255,255,0.10)');
  g.fillStyle = low;
  g.fillRect(0, H - L * 0.12, W, L * 0.12);
  return c;
}

// Tiny tile of uneven ink coverage, knocked out of the marker layer.
function paintGrain() {
  const rand = mulberry32(5);
  const n = 96, c = makeCanvas(n, n), g = c.getContext('2d');
  const img = g.createImageData(n, n);
  const soft = valueNoise(n, n, 6, rand);
  for (let i = 0; i < n * n; i++) {
    const a = 0.06 + 0.16 * soft[i] + 0.12 * rand() * rand();
    img.data[i * 4 + 3] = a * 255;
  }
  g.putImageData(img, 0, 0);
  return c;
}

Object.assign(Whiteboard.prototype, draftMethods);
