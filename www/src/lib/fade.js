// Shared machinery for "map" Fade surfaces (frost, steam, chalk, water, gravel, light...).
//
// A strength map holds one float per cell: 0 = untouched surface, 1 = a fresh stroke, a little
// above 1 = a short hold before decay starts. Strokes raise it, time lowers it, and render()
// turns it into an alpha mask (bilinear upscaling gives soft edges for free).
//
//   cover: true   the map wipes a covering layer away (frost, steam, powder): you see base
//                 where you've drawn and `layer` everywhere else.
//   cover: false  the map lays something down (chalk, water, light): you see `layer` (or the
//                 `paint` canvas strokes draw their colour into) where you've drawn.
//
// A scene subclass provides:
//   paintBase() -> canvas            full-res background
//   paintLayer() -> canvas           full-res covering / stroke layer (not needed with paint: true)
// and optionally:
//   decayAt(x, y, coarse, fine)      per-cell decay speed (default: patchy noise)
//   paintSeg(g, x0, y0, r0, x1, y1, r1)   draw a stroke segment's colour (paint: true)
//   clear() / clearStep(cl, dt) -> boolean   the clear animation (this.clearing = {...})
//   updateFx(dt) -> boolean / drawFx(ctx)   animated extras in CSS px
//   finishWork(g)                    touch up the masked layer before it's drawn (grain...)
//   onStrokeMove(s, x, y, d) / onStrokeStart(s) / onStrokeEnd(s)
//   setup()                          after every resize

import { dryStroke } from './brushes.js';
import { clamp, smoothstep, mulberry32, makeCanvas, valueNoise, layoutFor, drawText, TextOverlay, draftMethods, HAND } from './util.js';

export class MapFade {
  constructor(o = {}) {
    this.hold = o.hold ?? 0.35;
    this.budget = o.budget ?? 220000;   // roughly how many map cells to aim for
    this.cover = !!o.cover;
    this.usePaint = !!o.paint;
    this.blend = o.blend || 'source-over';
    this.edgeFirst = o.edgeFirst || 0;  // 0..1: thin, faint parts go first so lines shrink
    this.soft = o.soft ?? 0.55;          // inner fraction of a stroke at full strength
    this.brush = o.brush ?? 10;          // finger radius, CSS px
    this.textSize = o.textSize ?? 0.15;
    this.textWeight = o.textWeight ?? 300;
    this.seed = o.seed ?? 7;
    this.ink = o.ink || '#ffffff';
    this.fadeSeconds = 20;
    this.paused = false;
    this.strokes = new Map();
    this.map = null;
    this.cell = 0;
    this.mw = this.mh = 0;
    this.time = 0;
    this.clearing = null;
  }

  // ---------------------------------------------------------------- setup
  resize({ width, height, dpr }) {
    this.dropDraft();
    const cell = Math.max(1, Math.ceil(Math.sqrt((width * height) / this.budget)));
    const mw = Math.ceil(width / cell) + 1;
    const mh = Math.ceil(height / cell) + 1;
    const next = new Float32Array(mw * mh);
    if (this.map && cell === this.cell) {
      const cw = Math.min(mw, this.mw), ch = Math.min(mh, this.mh);
      for (let y = 0; y < ch; y++) next.set(this.map.subarray(y * this.mw, y * this.mw + cw), y * mw);
    }
    Object.assign(this, { W: width, H: height, dpr, cell, mw, mh, map: next });

    const rand = mulberry32(this.seed);
    const coarse = valueNoise(mw, mh, Math.max(6, Math.round(60 / cell)), rand);
    const fine = valueNoise(mw, mh, Math.max(2, Math.round(10 / cell)), rand);
    this.decay = new Float32Array(mw * mh);
    for (let j = 0; j < mh; j++) {
      for (let i = 0; i < mw; i++) {
        const k = j * mw + i;
        this.decay[k] = this.decayAt
          ? this.decayAt((i + 0.5) * cell, (j + 0.5) * cell, coarse[k], fine[k])
          : 0.55 + 0.7 * coarse[k] + 0.35 * (fine[k] - 0.5);
      }
    }

    this.mask = makeCanvas(mw, mh);
    this.maskCtx = this.mask.getContext('2d');
    this.maskImg = this.maskCtx.createImageData(mw, mh);
    const d = this.maskImg.data;
    for (let i = 0; i < d.length; i += 4) d[i] = d[i + 1] = d[i + 2] = 255;

    this.base = this.paintBase();
    if (this.usePaint) {
      const old = this.paint;
      this.paint = makeCanvas(width * dpr, height * dpr);
      this.paintCtx = this.paint.getContext('2d');
      if (old) this.paintCtx.drawImage(old, 0, 0, this.paint.width, this.paint.height);
      this.paintCtx.setTransform(dpr, 0, 0, dpr, 0, 0);
      this.paintCtx.lineCap = this.paintCtx.lineJoin = 'round';
    } else {
      this.layer = this.paintLayer();
    }
    this.work = makeCanvas(width * dpr, height * dpr);
    this.workCtx = this.work.getContext('2d');
    this.setup?.();
  }

  setFadeSeconds(s) { this.fadeSeconds = s; }
  setPaused(p) { this.paused = p; }
  setInk(color) { this.ink = color; }

  // ---------------------------------------------------------------- strokes
  radiusFor(info, speed = 0) {
    const b = this.brush;
    const r = info.pointerType === 'pen' ? b * (0.3 + 0.5 * (info.pressure || 0.5))
            : info.pointerType === 'mouse' ? b * 0.8 : b;
    return r * (1 - Math.min(0.3, speed / 4000));
  }

  strokeStart(id, x, y, info) {
    const r = this.radiusFor(info, 0);
    const s = { x, y, r, t: info.time, dist: 0 };
    this.strokes.set(id, s);
    this.cur = s;
    this.mark(x, y, r, x, y, r);
    this.onStrokeStart?.(s);
  }

  strokeMove(id, x, y, info) {
    const s = this.strokes.get(id);
    if (!s) return;
    const d = Math.hypot(x - s.x, y - s.y);
    if (d < 0.75) return;
    const speed = (d / Math.max(4, info.time - s.t)) * 1000;
    const r = s.r + (this.radiusFor(info, speed) - s.r) * 0.25;
    this.cur = s;
    this.mark(s.x, s.y, s.r, x, y, r);
    s.dist += d;
    this.onStrokeMove?.(s, x, y, d);
    Object.assign(s, { x, y, r, t: info.time });
  }

  strokeEnd(id) {
    const s = this.strokes.get(id);
    if (s) this.onStrokeEnd?.(s);
    this.strokes.delete(id);
  }

  mark(x0, y0, r0, x1, y1, r1) {
    this.raise(x0, y0, r0, x1, y1, r1, 1 + this.hold);
    if (!this.paint) return;
    if (this.brushType?.dry && this.cur) {
      if (x0 === x1 && y0 === y1) return; // a dry brush has no round dab to start with
      this.paintCtx.strokeStyle = this.ink;
      dryStroke(this.paintCtx, this.cur, x0, y0, r0, x1, y1, r1);
    } else this.paintSeg(this.paintCtx, x0, y0, r0, x1, y1, r1);
  }

  paintSeg(g, x0, y0, r0, x1, y1, r1) {
    g.strokeStyle = this.ink;
    g.lineWidth = r0 + r1;
    g.beginPath(); g.moveTo(x0, y0); g.lineTo(x1 + 0.01, y1); g.stroke();
  }

  // Raise a capsule from (x0,y0,r0) to (x1,y1,r1) in the map to at least `peak`.
  raise(x0, y0, r0, x1, y1, r1, peak) {
    const { cell, mw, mh, map } = this;
    const soft = this.brushType?.soft ?? this.soft;
    const inv = 1 / cell, rmax = Math.max(r0, r1);
    const minX = Math.max(0, Math.floor((Math.min(x0, x1) - rmax) * inv));
    const maxX = Math.min(mw - 1, Math.ceil((Math.max(x0, x1) + rmax) * inv));
    const minY = Math.max(0, Math.floor((Math.min(y0, y1) - rmax) * inv));
    const maxY = Math.min(mh - 1, Math.ceil((Math.max(y0, y1) + rmax) * inv));
    const dx = x1 - x0, dy = y1 - y0, len2 = dx * dx + dy * dy;
    for (let j = minY; j <= maxY; j++) {
      const py = (j + 0.5) * cell;
      for (let i = minX; i <= maxX; i++) {
        const px = (i + 0.5) * cell;
        let t = len2 > 0 ? ((px - x0) * dx + (py - y0) * dy) / len2 : 0;
        t = t < 0 ? 0 : t > 1 ? 1 : t;
        const qx = x0 + dx * t - px, qy = y0 + dy * t - py;
        const dist = Math.sqrt(qx * qx + qy * qy);
        const r = r0 + (r1 - r0) * t;
        if (dist >= r) continue;
        const v = peak * (1 - smoothstep(r * soft, r, dist));
        const k = j * mw + i;
        if (v > map[k]) map[k] = v;
      }
    }
  }

  // Multiply every cell by fn(x, y) (CSS px), e.g. for a sweeping clear.
  scaleCells(fn) {
    const { cell, mw, mh, map } = this;
    for (let j = 0; j < mh; j++) {
      const y = (j + 0.5) * cell;
      for (let i = 0; i < mw; i++) {
        const k = j * mw + i;
        if (map[k] > 0) map[k] *= fn((i + 0.5) * cell, y);
      }
    }
  }

  // Multiply every cell in a disc by `f`.
  scaleDisc(x, y, r, f) {
    const { cell, mw, mh, map } = this;
    const i0 = Math.max(0, ((x - r) / cell) | 0), i1 = Math.min(mw - 1, ((x + r) / cell) | 0);
    const j0 = Math.max(0, ((y - r) / cell) | 0), j1 = Math.min(mh - 1, ((y + r) / cell) | 0);
    for (let j = j0; j <= j1; j++) {
      for (let i = i0; i <= i1; i++) {
        const dx = (i + 0.5) * cell - x, dy = (j + 0.5) * cell - y;
        if (dx * dx + dy * dy < r * r) map[j * mw + i] *= f;
      }
    }
  }

  valueAt(x, y) {
    const i = clamp((x / this.cell) | 0, 0, this.mw - 1);
    const j = clamp((y / this.cell) | 0, 0, this.mh - 1);
    return this.map[j * this.mw + i];
  }

  // ---------------------------------------------------------------- time
  clear() { this.map.fill(0); this.strokes.clear(); }

  update(dt) {
    this.time += dt;
    const { map, decay } = this;
    let alive = false;
    if (!this.paused) {
      const rate = ((1 + this.hold) / this.fadeSeconds) * dt * (this.decayScale ?? 1);
      const ef = this.edgeFirst;
      for (let i = 0; i < map.length; i++) {
        const c = map[i];
        if (c > 0) {
          const k = ef ? 1 + ef * (1 - 2 * (c < 1 ? c : 1)) : 1;
          const n = c - rate * decay[i] * k;
          map[i] = n > 0.004 ? n : 0;
          alive = true;
        }
      }
    } else {
      for (let i = 0; i < map.length; i += 7) if (map[i] > 0) { alive = true; break; }
    }
    this.alive = alive;
    if (this.applyDrafts()) alive = true;
    if (this.updateFx?.(dt)) alive = true;
    if (this.clearing) {
      this.clearing.t += dt;
      if (!this.clearStep(this.clearing, dt)) this.clearing = null;
      alive = true;
    }
    return alive;
  }

  // ---------------------------------------------------------------- draw
  render(ctx) {
    const { map, maskImg, dpr } = this;
    const data = maskImg.data;
    const cover = this.cover;
    for (let i = 0, k = 3; i < map.length; i++, k += 4) {
      const c = map[i] > 1 ? 1 : map[i];
      const s = c * c * (3 - 2 * c);
      data[k] = (cover ? 255 - s * 255 : s * 255) | 0;
    }
    this.maskCtx.putImageData(maskImg, 0, 0);
    const g = this.workCtx;
    this.maskedLayer(g, this.paint || this.layer);
    this.finishWork?.(g);

    ctx.setTransform(1, 0, 0, 1, 0, 0);
    if (this.drawBase) this.drawBase(ctx); else ctx.drawImage(this.base, 0, 0);
    ctx.globalCompositeOperation = this.blend;
    ctx.drawImage(this.work, 0, 0);
    ctx.globalCompositeOperation = 'source-over';
    ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
    this.drawFx?.(ctx);
    ctx.setTransform(1, 0, 0, 1, 0, 0);
  }

  // work := mask (upscaled, shifted by dx/dy CSS px) applied to `src` (canvas or fill style).
  maskedLayer(g, src, dx = 0, dy = 0) {
    const { dpr } = this;
    g.setTransform(1, 0, 0, 1, 0, 0);
    g.globalCompositeOperation = 'copy';
    g.imageSmoothingEnabled = true;
    g.imageSmoothingQuality = 'high';
    g.drawImage(this.mask, dx * dpr, dy * dpr, this.mw * this.cell * dpr, this.mh * this.cell * dpr);
    g.globalCompositeOperation = 'source-in';
    if (typeof src === 'string') { g.fillStyle = src; g.fillRect(0, 0, this.work.width, this.work.height); }
    else g.drawImage(src, 0, 0);
    g.globalCompositeOperation = 'source-over';
  }

  // ---------------------------------------------------------------- text
  intro(text, opts = {}) { this.stampText(text, opts).overlay.apply(); }

  stampText(text, opts) {
    const { mw, mh, cell, W, H, map } = this;
    const c = makeCanvas(mw, mh), g = c.getContext('2d');
    g.scale(1 / cell, 1 / cell);
    const { lay, place } = layoutFor(g, text, opts, { W, H, size: Math.min(W * this.textSize, 76), weight: this.textWeight });
    const lw = Math.max(2.5, lay.size * (this.textLine ?? 0.07));
    g.fillStyle = g.strokeStyle = '#fff';
    drawText(g, lay, place, lw);
    const px = g.getImageData(0, 0, mw, mh).data;
    const overlay = new TextOverlay();
    const peak = 1 + this.hold * 1.6;
    for (let j = 1; j < mh - 1; j++) {
      for (let i = 1; i < mw - 1; i++) {
        let sum = 0;
        for (let dy = -1; dy <= 1; dy++) for (let dx = -1; dx <= 1; dx++) sum += px[((j + dy) * mw + i + dx) * 4 + 3];
        const v = smoothstep(0.15, 0.75, sum / (9 * 255)) * peak;
        if (v > 0) overlay.put(map, j * mw + i, v);
      }
    }
    if (this.paint) {
      const p = this.paintCtx;
      p.save();
      p.fillStyle = p.strokeStyle = this.ink;
      p.font = `${this.textWeight} ${lay.size}px ${HAND}`;
      drawText(p, lay, place, lw + cell * 3);
      p.restore();
    }
    return { overlay, lay, place };
  }

  dispose() {}
}

Object.assign(MapFade.prototype, draftMethods);

// ------------------------------------------------------------------ painting helpers
// A canvas the size of the stage, scaled so drawing is in CSS px.
export function stageCanvas(W, H, dpr) {
  const c = makeCanvas(W * dpr, H * dpr), g = c.getContext('2d');
  g.scale(dpr, dpr);
  return { c, g };
}

// A blurred copy of `src` (paint small, scale up), for things seen through frost or steam.
export function blurred(src, W, H, dpr, k = 28) {
  const c = makeCanvas(W * dpr, H * dpr), g = c.getContext('2d');
  const tiny = makeCanvas(W / k, H / k);
  tiny.getContext('2d').drawImage(src, 0, 0, tiny.width, tiny.height);
  g.imageSmoothingEnabled = true;
  g.imageSmoothingQuality = 'high';
  g.drawImage(tiny, 0, 0, c.width, c.height);
  return c;
}

// A soft radial blob (out-of-focus shape).
export function blob(g, x, y, rx, ry, col) {
  const r = Math.max(rx, ry);
  const gr = g.createRadialGradient(x, y, 0, x, y, r);
  gr.addColorStop(0, col);
  // Fade to the same colour, fully transparent (fading to transparent black leaves dark halos).
  gr.addColorStop(1, col.replace(/[\d.]+\)$/, '0)'));
  g.save();
  g.translate(x, y); g.scale(rx / r, ry / r); g.translate(-x, -y);
  g.fillStyle = gr;
  g.beginPath(); g.arc(x, y, r, 0, Math.PI * 2); g.fill();
  g.restore();
}

// Low-frequency light/dark mottling, drawn over a W x H area.
export function mottle(g, W, H, rand, { light = 60, dark = 40, scale = 8 } = {}) {
  const mw = Math.ceil(W / scale), mh = Math.ceil(H / scale);
  const mot = makeCanvas(mw, mh), mg = mot.getContext('2d');
  const img = mg.createImageData(mw, mh);
  const nA = valueNoise(mw, mh, 9, rand), nB = valueNoise(mw, mh, 3, rand);
  for (let i = 0; i < mw * mh; i++) {
    const v = nA[i] * 0.75 + nB[i] * 0.25;
    const l = v > 0.5;
    img.data[i * 4] = img.data[i * 4 + 1] = img.data[i * 4 + 2] = l ? 255 : 60;
    img.data[i * 4 + 3] = Math.abs(v - 0.5) * 2 * (l ? light : dark);
  }
  mg.putImageData(img, 0, 0);
  g.imageSmoothingEnabled = true;
  g.drawImage(mot, 0, 0, W, H);
}

// Speckle: n random dots of colour `col`, radius up to rmax.
export function speckle(g, W, H, rand, n, col, rmax = 1.2) {
  g.fillStyle = col;
  for (let i = 0; i < n; i++) {
    g.beginPath(); g.arc(rand() * W, rand() * H, 0.3 + rand() * rand() * rmax, 0, Math.PI * 2); g.fill();
  }
}

// A tile of transparent noise, used to knock grain out of chalk or powder.
export function grainTile(strength = 1, seed = 5, n = 128) {
  const rand = mulberry32(seed);
  const c = makeCanvas(n, n), g = c.getContext('2d');
  const img = g.createImageData(n, n);
  const soft = valueNoise(n, n, 4, rand);
  for (let i = 0; i < n * n; i++) {
    img.data[i * 4 + 3] = Math.min(255, (0.1 + 0.45 * soft[i] * soft[i] + 0.45 * rand() * rand()) * strength * 255);
  }
  g.putImageData(img, 0, 0);
  return c;
}
