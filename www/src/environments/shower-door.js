// Shower door: a fogged pane of glass.
//   Look:  your finger wipes clear, slightly soft-edged lines through condensation.
//          Heavier wiping sheds little drips that run down and leave clear trails.
//   Decay: condensation creeps back unevenly (thin edges first, then patches).
//   Clear: a roll of steam sweeps up from the bottom and fogs the whole door.

import { clamp, smoothstep, easeInOut, mulberry32, makeCanvas, valueNoise } from '../lib/util.js';

const HOLD = 0.35;       // extra clarity above 1.0 = a short "fully clear" hold before fog returns
const MAX_DRIPS = 40;

export const showerDoor = {
  id: 'shower-door',
  name: 'Shower door',
  clearLabel: 'Steam up',
  create: () => new ShowerDoor(),
};

class ShowerDoor {
  constructor() {
    this.fadeSeconds = 20;
    this.paused = false;
    this.strokes = new Map();
    this.drips = [];
    this.clearing = null;
    this.clarity = null;
    this.cell = 0;
    this.mw = 0;
    this.mh = 0;
  }

  // ---------------------------------------------------------------- setup
  resize({ width, height, dpr }) {
    // Clarity map: one float per cell. Upscaled with bilinear smoothing at render time,
    // which gives wiped edges a natural softness for free.
    const cell = Math.max(2, Math.ceil(Math.sqrt((width * height) / 220000)));
    const mw = Math.ceil(width / cell) + 1;
    const mh = Math.ceil(height / cell) + 1;
    const next = new Float32Array(mw * mh);
    if (this.clarity && cell === this.cell) {
      const cw = Math.min(mw, this.mw), ch = Math.min(mh, this.mh);
      for (let y = 0; y < ch; y++) {
        next.set(this.clarity.subarray(y * this.mw, y * this.mw + cw), y * mw);
      }
    }
    Object.assign(this, { W: width, H: height, dpr, cell, mw, mh, clarity: next });

    // Per-cell decay speed so fog returns in patches, not uniformly.
    const rand = mulberry32(7);
    const coarse = valueNoise(mw, mh, Math.max(6, Math.round(60 / cell)), rand);
    const fine = valueNoise(mw, mh, Math.max(2, Math.round(10 / cell)), rand);
    this.decay = new Float32Array(mw * mh);
    for (let i = 0; i < this.decay.length; i++) {
      this.decay[i] = 0.55 + 0.7 * coarse[i] + 0.35 * (fine[i] - 0.5);
    }

    this.mask = makeCanvas(mw, mh);
    this.maskCtx = this.mask.getContext('2d');
    this.maskImg = this.maskCtx.createImageData(mw, mh);
    const d = this.maskImg.data;
    for (let i = 0; i < d.length; i += 4) d[i] = d[i + 1] = d[i + 2] = 255;

    this.backdrop = paintBackdrop(width, height, dpr);
    this.fog = paintFog(this.backdrop, width, height, dpr);
    this.work = makeCanvas(width * dpr, height * dpr);
    this.workCtx = this.work.getContext('2d');
  }

  setFadeSeconds(s) { this.fadeSeconds = s; }
  setPaused(p) { this.paused = p; }

  // ---------------------------------------------------------------- strokes
  radiusFor(info, speed) {
    let r = info.pointerType === 'pen' ? 3 + 5 * (info.pressure || 0.5)
          : info.pointerType === 'mouse' ? 8 : 10;
    // A fast swipe thins out a little, like a real fingertip skating across glass.
    return r * (1 - Math.min(0.3, speed / 4000));
  }

  strokeStart(id, x, y, info) {
    const r = this.radiusFor(info, 0);
    this.strokes.set(id, { x, y, r, t: info.time, drip: 0 });
    this.wipe(x, y, r, x, y, r, 1 + HOLD);
  }

  strokeMove(id, x, y, info) {
    const s = this.strokes.get(id);
    if (!s) return;
    const d = Math.hypot(x - s.x, y - s.y);
    if (d < 0.75) return;
    const speed = (d / Math.max(4, info.time - s.t)) * 1000;
    const r = s.r + (this.radiusFor(info, speed) - s.r) * 0.25;
    this.wipe(s.x, s.y, s.r, x, y, r, 1 + HOLD);
    // Wiped water gathers and occasionally runs.
    s.drip += d;
    while (s.drip > 80) {
      s.drip -= 80;
      if (Math.random() < 0.2) this.spawnDrip(x + (Math.random() - 0.5) * r, y + r * 0.55);
    }
    Object.assign(s, { x, y, r, t: info.time });
  }

  strokeEnd(id) {
    const s = this.strokes.get(id);
    if (s && Math.random() < 0.25) this.spawnDrip(s.x, s.y + s.r * 0.55);
    this.strokes.delete(id);
  }

  // Clear a capsule from (x0,y0,r0) to (x1,y1,r1) in the clarity map.
  wipe(x0, y0, r0, x1, y1, r1, peak) {
    const { cell, mw, mh, clarity } = this;
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
        const v = peak * (1 - smoothstep(r * 0.55, r, dist));
        const k = j * mw + i;
        if (v > clarity[k]) clarity[k] = v;
      }
    }
  }

  clarityAt(x, y) {
    const i = clamp((x / this.cell) | 0, 0, this.mw - 1);
    const j = clamp((y / this.cell) | 0, 0, this.mh - 1);
    return this.clarity[j * this.mw + i];
  }

  // ---------------------------------------------------------------- drips
  spawnDrip(x, y) {
    if (this.drips.length >= MAX_DRIPS || y > this.H - 4) return;
    this.drips.push({
      x, y, vy: 0, pause: 0.15 + Math.random() * 0.4,
      size: 2.2 + Math.random() * 1.3,
      remaining: 20 + Math.random() * 150,
      seed: Math.random() * 1000,
      moving: true,
    });
  }

  updateDrips(dt) {
    let active = false;
    for (let n = this.drips.length - 1; n >= 0; n--) {
      const d = this.drips[n];
      if (d.moving) {
        active = true;
        if (d.pause > 0) { d.pause -= dt; continue; }
        d.vy = Math.min(80, d.vy + 140 * dt);
        if (Math.random() < dt * 1.2) { d.pause = 0.1 + Math.random() * 0.6; d.vy *= 0.15; }
        const step = d.vy * dt;
        const nx = d.x + Math.sin((d.y + d.seed) * 0.11) * 0.25;
        const ny = d.y + step;
        this.wipe(d.x, d.y, d.size, nx, ny, d.size, 1 + HOLD * 2);
        d.x = nx; d.y = ny; d.remaining -= step;
        // Drips slowly shed water and shrink as they travel.
        d.size = Math.max(1.8, d.size - step * 0.004);
        if (d.remaining <= 0 || d.y > this.H) d.moving = false;
      } else if (this.clarityAt(d.x, d.y) < 0.06) {
        this.drips.splice(n, 1);
      }
    }
    return active;
  }

  // ---------------------------------------------------------------- time
  clear() {
    this.clearing = { t: 0, dur: 1.15 };
    this.strokes.clear();
  }

  update(dt) {
    const { clarity, decay } = this;
    let alive = false;
    if (!this.paused) {
      const rate = ((1 + HOLD) / this.fadeSeconds) * dt;
      for (let i = 0; i < clarity.length; i++) {
        const c = clarity[i];
        if (c > 0) {
          const n = c - rate * decay[i];
          clarity[i] = n > 0 ? n : 0;
          alive = true;
        }
      }
    }
    const dripping = this.updateDrips(dt);

    if (this.clearing) {
      const cl = this.clearing;
      cl.t += dt;
      const p = Math.min(1, cl.t / cl.dur);
      const soft = 160;
      cl.front = this.H + soft - (this.H + soft * 2) * easeInOut(p);
      const { cell, mw, mh } = this;
      for (let j = 0; j < mh; j++) {
        const f = clamp((cl.front - (j + 0.5) * cell) / soft, 0, 1);
        if (f >= 1) continue;
        const row = j * mw;
        for (let i = 0; i < mw; i++) clarity[row + i] *= f;
      }
      this.drips = this.drips.filter((d) => d.y < cl.front);
      if (p >= 1) { clarity.fill(0); this.drips.length = 0; this.clearing = null; }
    }
    return alive || dripping || !!this.clearing;
  }

  // ---------------------------------------------------------------- draw
  render(ctx) {
    const { clarity, maskImg, dpr } = this;
    const data = maskImg.data;
    for (let i = 0, k = 3; i < clarity.length; i++, k += 4) {
      const c = clarity[i] > 1 ? 1 : clarity[i];
      // Fog opacity: smooth so the return is gentle at both ends.
      data[k] = 255 - ((c * c * (3 - 2 * c)) * 255) | 0;
    }
    this.maskCtx.putImageData(maskImg, 0, 0);

    const w = this.work, g = this.workCtx;
    g.globalCompositeOperation = 'copy';
    g.imageSmoothingEnabled = true;
    g.imageSmoothingQuality = 'high';
    g.drawImage(this.mask, 0, 0, this.mw * this.cell * dpr, this.mh * this.cell * dpr);
    g.globalCompositeOperation = 'source-in';
    g.drawImage(this.fog, 0, 0);
    g.globalCompositeOperation = 'source-over';

    ctx.setTransform(1, 0, 0, 1, 0, 0);
    ctx.drawImage(this.backdrop, 0, 0);
    ctx.drawImage(w, 0, 0);

    ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
    this.drawDrips(ctx);
    if (this.clearing) this.drawSteam(ctx);
    ctx.setTransform(1, 0, 0, 1, 0, 0);
  }

  drawDrips(ctx) {
    for (const d of this.drips) {
      const a = Math.min(1, this.clarityAt(d.x, d.y) * 1.4);
      if (a <= 0.02) continue;
      const rx = d.size * 0.95, ry = d.size * (d.moving ? 1.35 : 1.1);
      ctx.globalAlpha = a;
      const body = ctx.createRadialGradient(d.x, d.y + ry * 0.25, 0, d.x, d.y, ry);
      body.addColorStop(0, 'rgba(210,225,235,0.10)');
      body.addColorStop(0.7, 'rgba(20,28,34,0.25)');
      body.addColorStop(1, 'rgba(8,12,16,0.55)');
      ctx.fillStyle = body;
      ctx.beginPath();
      ctx.ellipse(d.x, d.y, rx, ry, 0, 0, Math.PI * 2);
      ctx.fill();
      ctx.fillStyle = 'rgba(255,255,255,0.8)';
      ctx.beginPath();
      ctx.ellipse(d.x - rx * 0.32, d.y - ry * 0.38, rx * 0.3, ry * 0.22, -0.5, 0, Math.PI * 2);
      ctx.fill();
    }
    ctx.globalAlpha = 1;
  }

  drawSteam(ctx) {
    const f = this.clearing.front;
    const g = ctx.createLinearGradient(0, f - 140, 0, f + 220);
    g.addColorStop(0, 'rgba(235,242,246,0)');
    g.addColorStop(0.4, 'rgba(240,246,250,0.35)');
    g.addColorStop(1, 'rgba(235,242,246,0)');
    ctx.fillStyle = g;
    ctx.fillRect(0, f - 140, this.W, 360);
  }

  // Pre-wipe a handwritten hint so the mechanic explains itself.
  intro(text) {
    const { mw, mh, cell, W, H, clarity } = this;
    const c = makeCanvas(mw, mh), g = c.getContext('2d');
    g.scale(1 / cell, 1 / cell);
    const lines = text.split('\n');
    const family = '"Bradley Hand", "Segoe Print", "Noteworthy", ui-rounded, system-ui, sans-serif';
    // Start from a comfortable size, then shrink so the widest line fits with side margins.
    let size = Math.min(W * 0.15, 76);
    g.font = `300 ${size}px ${family}`;
    const widest = Math.max(...lines.map((ln) => g.measureText(ln).width)) + size * 0.14;
    const maxWidth = W * 0.82;
    if (widest > maxWidth) size *= maxWidth / widest;
    g.font = `300 ${size}px ${family}`;
    g.textAlign = 'center';
    g.textBaseline = 'middle';
    g.lineWidth = Math.max(2.5, size * 0.07);
    g.lineCap = g.lineJoin = 'round';
    g.fillStyle = g.strokeStyle = '#fff';
    const y0 = H * 0.42 - ((lines.length - 1) * size * 1.15) / 2;
    lines.forEach((ln, n) => {
      g.fillText(ln, W / 2, y0 + n * size * 1.15);
      g.strokeText(ln, W / 2, y0 + n * size * 1.15);
    });
    const px = g.getImageData(0, 0, mw, mh).data;
    // Light 3x3 blur so the low-res raster gets the same soft edge as a finger wipe.
    for (let j = 1; j < mh - 1; j++) {
      for (let i = 1; i < mw - 1; i++) {
        let sum = 0;
        for (let dy = -1; dy <= 1; dy++) for (let dx = -1; dx <= 1; dx++) sum += px[((j + dy) * mw + i + dx) * 4 + 3];
        const k = j * mw + i;
        const v = smoothstep(0.15, 0.75, sum / (9 * 255)) * (1 + HOLD * 1.6);
        if (v > clarity[k]) clarity[k] = v;
      }
    }
    // A couple of drips under the writing for life.
    for (let n = 0; n < 3; n++) this.spawnDrip(W * (0.3 + Math.random() * 0.4), y0 + (lines.length - 0.6) * size * 1.15);
  }
}

// ------------------------------------------------------------------ scenery
// What you see through the glass: a dim, warm-lit bathroom, deliberately out of focus.
function paintBackdrop(W, H, dpr) {
  const rand = mulberry32(42);
  const c = makeCanvas(W * dpr, H * dpr), g = c.getContext('2d');
  g.scale(dpr, dpr);

  const base = g.createLinearGradient(0, 0, 0, H);
  base.addColorStop(0, '#465862');
  base.addColorStop(0.55, '#2b3942');
  base.addColorStop(1, '#1b252b');
  g.fillStyle = base;
  g.fillRect(0, 0, W, H);

  // Soft tile grid, blurred by painting small and scaling up.
  const s = 10, tw = Math.ceil(W / s), th = Math.ceil(H / s);
  const tiles = makeCanvas(tw, th), tg = tiles.getContext('2d');
  tg.strokeStyle = 'rgba(200,220,230,0.10)';
  tg.lineWidth = 0.6;
  const tile = 64 / s;
  for (let x = (rand() * tile); x < tw; x += tile) { tg.beginPath(); tg.moveTo(x, 0); tg.lineTo(x, th); tg.stroke(); }
  for (let y = (rand() * tile); y < th; y += tile) { tg.beginPath(); tg.moveTo(0, y); tg.lineTo(tw, y); tg.stroke(); }
  g.imageSmoothingEnabled = true;
  g.drawImage(tiles, 0, 0, W, H);

  // Warm overhead light.
  const glow = g.createRadialGradient(W * 0.72, -H * 0.05, 0, W * 0.72, -H * 0.05, Math.max(W, H) * 0.85);
  glow.addColorStop(0, 'rgba(255,206,150,0.42)');
  glow.addColorStop(0.5, 'rgba(255,190,130,0.10)');
  glow.addColorStop(1, 'rgba(255,190,130,0)');
  g.fillStyle = glow;
  g.fillRect(0, 0, W, H);

  // Out-of-focus shapes: a towel, a plant, a shelf of bottles.
  const blob = (x, y, rx, ry, col) => {
    const gr = g.createRadialGradient(x, y, 0, x, y, Math.max(rx, ry));
    gr.addColorStop(0, col);
    gr.addColorStop(1, 'rgba(0,0,0,0)');
    g.save();
    g.translate(x, y); g.scale(rx / Math.max(rx, ry), ry / Math.max(rx, ry)); g.translate(-x, -y);
    g.fillStyle = gr;
    g.beginPath(); g.arc(x, y, Math.max(rx, ry), 0, Math.PI * 2); g.fill();
    g.restore();
  };
  blob(W * 0.12, H * 0.78, W * 0.22, H * 0.2, 'rgba(70,110,85,0.45)');
  blob(W * 0.9, H * 0.55, W * 0.16, H * 0.24, 'rgba(180,150,120,0.28)');
  for (let n = 0; n < 4; n++) {
    blob(W * (0.35 + n * 0.08), H * 0.3, W * 0.03, H * 0.06, `rgba(${150 + rand() * 80},${120 + rand() * 60},${110 + rand() * 60},0.35)`);
  }
  // Bokeh highlights.
  for (let n = 0; n < 9; n++) {
    const warm = rand() < 0.6;
    blob(rand() * W, rand() * H * 0.7, 14 + rand() * 40, 14 + rand() * 40,
      warm ? 'rgba(255,214,160,0.18)' : 'rgba(170,215,235,0.14)');
  }

  // Vignette.
  const v = g.createRadialGradient(W / 2, H * 0.45, Math.min(W, H) * 0.3, W / 2, H * 0.45, Math.max(W, H) * 0.8);
  v.addColorStop(0, 'rgba(0,0,0,0)');
  v.addColorStop(1, 'rgba(0,0,0,0.45)');
  g.fillStyle = v;
  g.fillRect(0, 0, W, H);
  return c;
}

// The condensation itself: a milky, mottled, beaded layer over a heavily blurred backdrop.
function paintFog(backdrop, W, H, dpr) {
  const rand = mulberry32(99);
  const c = makeCanvas(W * dpr, H * dpr), g = c.getContext('2d');
  const tiny = makeCanvas(W / 28, H / 28);
  tiny.getContext('2d').drawImage(backdrop, 0, 0, tiny.width, tiny.height);
  g.imageSmoothingEnabled = true;
  g.imageSmoothingQuality = 'high';
  g.drawImage(tiny, 0, 0, c.width, c.height);
  g.scale(dpr, dpr);

  const haze = g.createLinearGradient(0, 0, 0, H);
  haze.addColorStop(0, 'rgba(222,231,236,0.80)');
  haze.addColorStop(1, 'rgba(196,208,215,0.74)');
  g.fillStyle = haze;
  g.fillRect(0, 0, W, H);

  // Mottling: low-frequency light/dark patches.
  const mw = Math.ceil(W / 8), mh = Math.ceil(H / 8);
  const mot = makeCanvas(mw, mh), mg = mot.getContext('2d');
  const img = mg.createImageData(mw, mh);
  const nA = valueNoise(mw, mh, 9, rand), nB = valueNoise(mw, mh, 3, rand);
  for (let i = 0; i < mw * mh; i++) {
    const v = nA[i] * 0.75 + nB[i] * 0.25;
    const light = v > 0.5;
    img.data[i * 4] = img.data[i * 4 + 1] = img.data[i * 4 + 2] = light ? 255 : 90;
    img.data[i * 4 + 3] = Math.abs(v - 0.5) * 2 * (light ? 60 : 40);
  }
  mg.putImageData(img, 0, 0);
  g.drawImage(mot, 0, 0, W, H);

  // Micro-droplets of condensation.
  const count = Math.round((W * H) / 40);
  for (let n = 0; n < count; n++) {
    const x = rand() * W, y = rand() * H, r = 0.35 + rand() * rand() * 1.6;
    g.fillStyle = 'rgba(70,85,95,0.16)';
    g.beginPath(); g.arc(x + r * 0.25, y + r * 0.3, r, 0, Math.PI * 2); g.fill();
    g.fillStyle = 'rgba(255,255,255,0.55)';
    g.beginPath(); g.arc(x - r * 0.2, y - r * 0.25, r * 0.55, 0, Math.PI * 2); g.fill();
  }
  return c;
}
