// Breath on glass: a Fade environment.
//   Look:  a cold window on a rainy evening. Every stroke brings its own breath: a soft patch of
//          fog blooms around your fingertip and the line is drawn clear through it.
//   Decay: the fog shrinks back from its edges toward the line, the way breath does on a cold
//          pane, and when the fog is gone the line goes with it.
//   Clear: one big breath fogs the whole pane, then it melts away from the edges, leaving
//          clean glass.

import { clamp, easeInOut, mulberry32, makeCanvas, smoothstep, valueNoise, layoutFor, drawText, TextOverlay, wipedTextLine } from '../lib/util.js';
import { MapFade, stageCanvas, blurred, blob, mottle } from '../lib/fade.js';
import { sfx } from '../lib/sound.js';

export const breath = {
  id: 'breath',
  name: 'Breath on glass',
  blurb: 'Breathe on a cold window and draw in the fog',
  surface: 'Cold window to breathe on and draw in the fog',
  clearLabel: 'Big breath',
  clearIcon: 'M4 12c3-4 6-4 9 0s5 4 7 1M4 7c2-2 4-2 6 0M14 17c2 2 4 2 6 0',
  create: () => new Breath(),
};

const HALO = 5; // how far the breath reaches beyond the line, in brush radii

class Breath extends MapFade {
  // The map is the fog; `wipe` is the line drawn through it.
  constructor() {
    super({ cover: false, brush: 9, edgeFirst: 0, soft: 0.15, seed: 53, textWeight: 400 });
    this.textLine = 0.075;
  }

  setup() {
    const n = this.mw * this.mh;
    const old = this.wipe;
    this.wipe = old && old.length === n ? old : new Float32Array(n);
    this.wipeMask = makeCanvas(this.mw, this.mh);
    this.wipeCtx = this.wipeMask.getContext('2d');
    this.wipeImg = this.wipeCtx.createImageData(this.mw, this.mh);
    const d = this.wipeImg.data;
    for (let i = 0; i < d.length; i += 4) d[i] = d[i + 1] = d[i + 2] = 255;
    // Cloudy edges: where the fog's edge sits varies across the glass.
    const rand = mulberry32(3);
    const a = valueNoise(this.mw, this.mh, Math.max(3, Math.round(26 / this.cell)), rand);
    const b = valueNoise(this.mw, this.mh, Math.max(2, Math.round(8 / this.cell)), rand);
    this.edge = new Float32Array(this.mw * this.mh);
    for (let i = 0; i < this.edge.length; i++) this.edge[i] = 0.12 + 0.3 * a[i] + 0.12 * b[i];
  }

  // Breath leaves the pane from the outside in: the thin rim of each patch goes first.
  decayAt(x, y, coarse, fine) { return 0.7 + 0.45 * coarse + 0.35 * (fine - 0.5); }

  paintBase() { return paintStreet(this.W, this.H, this.dpr); }

  // Breath fog: the street gone soft and milky, with a fine bead texture.
  paintLayer() {
    const { W, H, dpr } = this;
    const rand = mulberry32(12);
    const c = blurred(this.base, W, H, dpr, 26), g = c.getContext('2d');
    g.scale(dpr, dpr);
    g.fillStyle = 'rgba(206,214,224,0.7)';
    g.fillRect(0, 0, W, H);
    mottle(g, W, H, rand, { light: 40, dark: 14, scale: 9 });
    for (let n = 0; n < (W * H) / 60; n++) {
      const x = rand() * W, y = rand() * H, r = 0.3 + rand() * 0.7;
      g.fillStyle = 'rgba(255,255,255,0.35)';
      g.beginPath(); g.arc(x, y, r, 0, Math.PI * 2); g.fill();
    }
    return c;
  }

  onStrokeStart(s) {
    if (this.valueAt(s.x, s.y) < 0.3) sfx.cue('breath');
  }

  mark(x0, y0, r0, x1, y1, r1) {
    const peak = 1 + this.hold;
    // Fresh breath over an old, faded line fogs it over again.
    this.raiseFog(x0, y0, r0 * HALO + 24, x1, y1, r1 * HALO + 24, peak);
    this.raiseArr(this.wipe, x0, y0, r0, x1, y1, r1, 1, this.brushType?.soft ?? 0.55);
  }

  raiseFog(x0, y0, r0, x1, y1, r1, peak) {
    const { map, wipe } = this;
    this.raiseArr(map, x0, y0, r0, x1, y1, r1, peak, 0, (k, v) => { if (map[k] < 0.35) wipe[k] = 0; map[k] = v; });
  }

  // A capsule into `arr` (like MapFade.raise, with a choice of array and edge softness).
  raiseArr(arr, x0, y0, r0, x1, y1, r1, peak, soft, set) {
    const { cell, mw, mh } = this;
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
        if (v > arr[k]) { if (set) set(k, v); else arr[k] = v; }
      }
    }
  }

  // Typed words: a breath-shaped cloud of fog around the letters, the letters wiped through it.
  stampText(text, opts) {
    const { mw, mh, cell, W, H, map, wipe } = this;
    const c = makeCanvas(mw, mh), g = c.getContext('2d');
    g.scale(1 / cell, 1 / cell);
    const { lay, place } = layoutFor(g, text, opts, { W, H, size: Math.min(W * this.textSize, 76), weight: this.textWeight });
    const lw = wipedTextLine(g, lay, opts, this.textLine);
    g.fillStyle = g.strokeStyle = '#fff';
    drawText(g, lay, place, lw);
    const px = g.getImageData(0, 0, mw, mh).data;
    const cov = new Float32Array(mw * mh);
    for (let i = 0; i < mw * mh; i++) cov[i] = px[i * 4 + 3] / 255;
    // Fog = the letters spread out a long way (a cheap two-pass box blur, then boosted).
    const rad = Math.max(2, Math.round((lay.size * 0.45) / cell));
    const fog = boxBlur(boxBlur(cov, mw, mh, rad), mw, mh, rad);
    const overlay = new TextOverlay();
    const peak = 1 + this.hold * 1.6;
    for (let k = 0; k < mw * mh; k++) {
      const f = smoothstep(0.01, 0.12, fog[k]) * peak;
      if (f > 0.01) overlay.put(map, k, f);
      if (cov[k] > 0.15) overlay.put(wipe, k, smoothstep(0.15, 0.7, cov[k]));
    }
    return { overlay, lay, place };
  }

  update(dt) {
    const alive = super.update(dt);
    // Where the fog has gone, so has the line.
    const { map, wipe } = this;
    for (let i = 0; i < map.length; i++) if (map[i] === 0 && wipe[i] !== 0) wipe[i] = 0;
    return alive;
  }

  clear() {
    sfx.cue('breath', { big: true });
    this.strokes.clear();
    this.commitDraft?.();
    this.clearing = { t: 0, dur: 2.4 };
  }

  clearStep(cl) {
    const p = Math.min(1, cl.t / cl.dur);
    const { map, wipe, W, H, cell, mw, mh } = this;
    if (p < 0.3) {
      // Breathe in: fog rolls out from the middle and covers the lines.
      const reach = easeInOut(p / 0.3) * Math.hypot(W, H) * 0.6;
      for (let j = 0; j < mh; j++) {
        for (let i = 0; i < mw; i++) {
          const k = j * mw + i;
          const d = Math.hypot((i + 0.5) * cell - W / 2, ((j + 0.5) * cell - H / 2) * 0.8);
          const f = clamp((reach - d) / 80, 0, 1);
          if (f > 0) { if (f > map[k]) map[k] = f; wipe[k] *= 1 - f; }
        }
      }
    } else {
      // Then it melts back from the edges to the centre.
      const q = easeInOut((p - 0.3) / 0.7);
      const reach = (1 - q) * Math.hypot(W, H) * 0.62;
      for (let j = 0; j < mh; j++) {
        for (let i = 0; i < mw; i++) {
          const k = j * mw + i;
          const d = Math.hypot((i + 0.5) * cell - W / 2, ((j + 0.5) * cell - H / 2) * 0.8);
          map[k] = Math.min(map[k], clamp((reach - d) / 90, 0, 1));
          wipe[k] = 0;
        }
      }
    }
    if (p >= 1) { map.fill(0); wipe.fill(0); return false; }
    return true;
  }

  render(ctx) {
    const { map, wipe, maskImg, wipeImg, dpr } = this;
    const data = maskImg.data, wd = wipeImg.data;
    for (let i = 0, k = 3; i < map.length; i++, k += 4) {
      // A breath patch has a soft but definite edge, so as the fog thins the edge visibly
      // pulls inward instead of the whole patch just going pale.
      const c = map[i], lo = this.edge[i];
      const u = (c - lo) / 0.3;
      const f = u <= 0 ? 0 : u >= 1 ? 1 : u * u * (3 - 2 * u);
      const w = wipe[i] > 1 ? 1 : wipe[i];
      data[k] = (f * (1 - w * 0.92) * 255) | 0;
      // The wiped line keeps a faint wet edge where it meets the fog.
      wd[k] = (f * w * (1 - w) * 4 * 255) | 0;
    }
    this.maskCtx.putImageData(maskImg, 0, 0);
    this.wipeCtx.putImageData(wipeImg, 0, 0);
    ctx.setTransform(1, 0, 0, 1, 0, 0);
    ctx.drawImage(this.base, 0, 0);
    const g = this.workCtx;
    this.maskedLayer(g, this.layer);
    ctx.drawImage(this.work, 0, 0);
    // Wet rim of each line: a thin bright edge.
    g.setTransform(1, 0, 0, 1, 0, 0);
    g.globalCompositeOperation = 'copy';
    g.drawImage(this.wipeMask, 0, 0, this.mw * this.cell * dpr, this.mh * this.cell * dpr);
    g.globalCompositeOperation = 'source-in';
    g.fillStyle = 'rgba(240,246,255,0.32)';
    g.fillRect(0, 0, this.work.width, this.work.height);
    g.globalCompositeOperation = 'source-over';
    ctx.drawImage(this.work, 0, 0);
    // Rain on the outside of the glass.
    ctx.drawImage(this.drops, 0, 0);
  }

  resize(o) {
    super.resize(o);
    this.drops = paintDrops(this.W, this.H, this.dpr);
  }
}

function boxBlur(src, w, h, r) {
  const tmp = new Float32Array(w * h), out = new Float32Array(w * h);
  const n = 2 * r + 1;
  for (let j = 0; j < h; j++) {
    let s = 0;
    for (let i = -r; i <= r; i++) s += src[j * w + clamp(i, 0, w - 1)];
    for (let i = 0; i < w; i++) {
      tmp[j * w + i] = s / n;
      s += src[j * w + Math.min(w - 1, i + r + 1)] - src[j * w + Math.max(0, i - r)];
    }
  }
  for (let i = 0; i < w; i++) {
    let s = 0;
    for (let j = -r; j <= r; j++) s += tmp[clamp(j, 0, h - 1) * w + i];
    for (let j = 0; j < h; j++) {
      out[j * w + i] = s / n;
      s += tmp[Math.min(h - 1, j + r + 1) * w + i] - tmp[Math.max(0, j - r) * w + i];
    }
  }
  return out;
}

// A rainy street at dusk seen through the window: wet road, shop lights and streetlamps
// blurred by the rain, and a dark window frame at the edges.
function paintStreet(W, H, dpr) {
  const rand = mulberry32(77);
  const { c, g } = stageCanvas(W, H, dpr);
  const sky = g.createLinearGradient(0, 0, 0, H);
  sky.addColorStop(0, '#1f2a3d');
  sky.addColorStop(0.5, '#2c3a52');
  sky.addColorStop(0.62, '#3a3f52');
  sky.addColorStop(1, '#151a26');
  g.fillStyle = sky; g.fillRect(0, 0, W, H);
  // Buildings across the street.
  let x = -20;
  while (x < W + 20) {
    const w = 50 + rand() * 90, h = H * (0.25 + rand() * 0.25);
    g.fillStyle = `rgb(${24 + rand() * 12},${28 + rand() * 12},${40 + rand() * 14})`;
    g.fillRect(x, H * 0.62 - h, w, h);
    for (let wy = H * 0.62 - h + 12; wy < H * 0.6; wy += 22) {
      for (let wx = x + 8; wx < x + w - 12; wx += 18) {
        if (rand() < 0.35) blob(g, wx + 5, wy + 6, 7, 8, rand() < 0.75 ? 'rgba(255,196,120,0.55)' : 'rgba(150,200,255,0.45)');
      }
    }
    x += w + 4;
  }
  // Wet road with reflections.
  const road = g.createLinearGradient(0, H * 0.62, 0, H);
  road.addColorStop(0, '#2a2f3e'); road.addColorStop(1, '#10131b');
  g.fillStyle = road; g.fillRect(0, H * 0.62, W, H * 0.38);
  for (let i = 0; i < 7; i++) {
    const lx = rand() * W, col = ['rgba(255,190,110,', 'rgba(255,110,90,', 'rgba(120,200,255,'][i % 3];
    blob(g, lx, H * (0.5 + rand() * 0.1), 18 + rand() * 16, 18 + rand() * 16, col + '0.7)');
    blob(g, lx, H * 0.8, 10 + rand() * 6, H * 0.14, col + '0.22)');
  }
  // Window frame vignette.
  const v = g.createRadialGradient(W / 2, H / 2, Math.min(W, H) * 0.35, W / 2, H / 2, Math.max(W, H) * 0.75);
  v.addColorStop(0, 'rgba(0,0,0,0)'); v.addColorStop(1, 'rgba(5,8,14,0.6)');
  g.fillStyle = v; g.fillRect(0, 0, W, H);
  return c;
}

// Raindrops on the far side of the glass, with a few streaks.
function paintDrops(W, H, dpr) {
  const rand = mulberry32(29);
  const { c, g } = stageCanvas(W, H, dpr);
  for (let n = 0; n < (W * H) / 2600; n++) {
    const x = rand() * W, y = rand() * H, r = 0.8 + rand() * rand() * 3;
    g.fillStyle = 'rgba(10,14,24,0.25)';
    g.beginPath(); g.ellipse(x + r * 0.2, y + r * 0.3, r, r * 1.1, 0, 0, Math.PI * 2); g.fill();
    g.fillStyle = 'rgba(220,232,255,0.3)';
    g.beginPath(); g.arc(x - r * 0.3, y - r * 0.35, r * 0.35, 0, Math.PI * 2); g.fill();
  }
  g.strokeStyle = 'rgba(200,215,240,0.12)';
  for (let n = 0; n < W / 40; n++) {
    const x = rand() * W, y = rand() * H * 0.7;
    g.lineWidth = 0.8 + rand();
    g.beginPath(); g.moveTo(x, y); g.lineTo(x + (rand() - 0.5) * 4, y + 30 + rand() * 90); g.stroke();
  }
  return c;
}
