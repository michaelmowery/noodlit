// Sand: a quiet bed of fine, dry sand in low evening light.
//   Look:  your finger presses a soft groove into the sand and pushes a low ridge up on
//          either side. Low-angle light shades each wall, so marks read as carved, not inked.
//   Decay: a steady breeze from the left. Ridges blow away first, then loose sand drifts
//          into the grooves from the windward side. Gusts move through in bands, so
//          some parts of a thought soften before others.
//   Clear: a long gust sweeps a veil of blowing sand across and leaves the bed smooth.
//
// The surface is a height field (one float per cell, negative = groove, positive = ridge).
// Wind is a small upwind advection plus diffusion on that field, so marks shift, soften
// and fill in the way dry sand actually behaves, rather than fading in place.

import { clamp, smoothstep, easeInOut, mulberry32, makeCanvas, valueNoise } from '../lib/util.js';

const HOLD = 0.35;          // extra depth past 1.0 = a short "freshly carved" hold before it softens
const RIM = 0.38;           // ridge height pushed up beside a groove
const DEPTH_PX = 4.2;       // how deep a full groove looks, in CSS px (drives the shading)
const DRIFT_PX = 14;        // how far a mark drifts downwind over its life
const GRAINS = 46;          // airborne sand streaks while the wind is working
const LIGHT = normalize(-0.62, -0.58, 0.53);   // low sun from the upper left

export const sand = {
  id: 'sand',
  name: 'Sand',
  clearLabel: 'Gust',
  clearIcon: 'M3 8h10a3 3 0 1 0-3-3M3 12h14a3 3 0 1 1-3 3M3 16h7',
  surface: 'Sand drawing surface',
  create: () => new Sand(),
};

class Sand {
  constructor() {
    this.fadeSeconds = 20;
    this.paused = false;
    this.strokes = new Map();
    this.clearing = null;
    this.h = null;
    this.cell = 0;
    this.mw = 0;
    this.mh = 0;
    this.time = 0;
    this.windAlpha = 0;
    this.grains = [];
  }

  // ---------------------------------------------------------------- setup
  resize({ width, height, dpr }) {
    const cell = Math.max(2, Math.ceil(Math.sqrt((width * height) / 160000)));
    const mw = Math.ceil(width / cell) + 2;
    const mh = Math.ceil(height / cell) + 2;
    const next = new Float32Array(mw * mh);
    if (this.h && cell === this.cell) {
      const cw = Math.min(mw, this.mw), ch = Math.min(mh, this.mh);
      for (let y = 0; y < ch; y++) next.set(this.h.subarray(y * this.mw, y * this.mw + cw), y * mw);
    }
    Object.assign(this, { W: width, H: height, dpr, cell, mw, mh, h: next, tmp: new Float32Array(mw * mh) });

    // Some patches are more sheltered than others.
    const rand = mulberry32(23);
    const coarse = valueNoise(mw, mh, Math.max(6, Math.round(90 / cell)), rand);
    const fine = valueNoise(mw, mh, Math.max(2, Math.round(14 / cell)), rand);
    this.exposure = new Float32Array(mw * mh);
    for (let i = 0; i < mw * mh; i++) this.exposure[i] = 0.6 + 0.6 * coarse[i] + 0.3 * (fine[i] - 0.5);
    this.gustCol = new Float32Array(mw);

    this.shade = makeCanvas(mw, mh);
    this.shadeCtx = this.shade.getContext('2d');
    this.shadeImg = this.shadeCtx.createImageData(mw, mh);
    this.bed = paintSand(width, height, dpr);

    const r = mulberry32(5);
    this.grains = Array.from({ length: GRAINS }, () => ({
      x: r() * width, y: r() * height,
      v: 70 + r() * 110, len: 6 + r() * 16, a: 0.35 + r() * 0.65, wob: r() * 10,
    }));
  }

  setFadeSeconds(s) { this.fadeSeconds = s; }
  setPaused(p) { this.paused = p; }

  // ---------------------------------------------------------------- strokes
  radiusFor(info, speed) {
    const r = info.pointerType === 'pen' ? 2.5 + 4 * (info.pressure || 0.5)
            : info.pointerType === 'mouse' ? 6.5 : 8.5;
    // A quick flick skims the surface and leaves a shallower, narrower line.
    return r * (1 - Math.min(0.3, speed / 4000));
  }

  strokeStart(id, x, y, info) {
    const r = this.radiusFor(info, 0);
    this.strokes.set(id, { x, y, r, t: info.time });
    this.carve(x, y, r, x, y, r, 1 + HOLD);
  }

  strokeMove(id, x, y, info) {
    const s = this.strokes.get(id);
    if (!s) return;
    const d = Math.hypot(x - s.x, y - s.y);
    if (d < 0.75) return;
    const speed = (d / Math.max(4, info.time - s.t)) * 1000;
    const r = s.r + (this.radiusFor(info, speed) - s.r) * 0.25;
    this.carve(s.x, s.y, s.r, x, y, r, 1 + HOLD);
    Object.assign(s, { x, y, r, t: info.time });
  }

  strokeEnd(id) { this.strokes.delete(id); }

  // Press a capsule from (x0,y0,r0) to (x1,y1,r1) into the sand: a rounded groove
  // with a low ridge of displaced sand along each side.
  carve(x0, y0, r0, x1, y1, r1, peak) {
    const { cell, mw, mh, h } = this;
    const inv = 1 / cell, reach = Math.max(r0, r1) * 1.9;
    const minX = Math.max(1, Math.floor((Math.min(x0, x1) - reach) * inv));
    const maxX = Math.min(mw - 2, Math.ceil((Math.max(x0, x1) + reach) * inv));
    const minY = Math.max(1, Math.floor((Math.min(y0, y1) - reach) * inv));
    const maxY = Math.min(mh - 2, Math.ceil((Math.max(y0, y1) + reach) * inv));
    const dx = x1 - x0, dy = y1 - y0, len2 = dx * dx + dy * dy;
    for (let j = minY; j <= maxY; j++) {
      const py = (j - 0.5) * cell;
      for (let i = minX; i <= maxX; i++) {
        const px = (i - 0.5) * cell;
        let t = len2 > 0 ? ((px - x0) * dx + (py - y0) * dy) / len2 : 0;
        t = t < 0 ? 0 : t > 1 ? 1 : t;
        const qx = x0 + dx * t - px, qy = y0 + dy * t - py;
        const dist = Math.sqrt(qx * qx + qy * qy);
        const r = r0 + (r1 - r0) * t;
        const k = j * mw + i;
        if (dist < r) {
          const u = dist / r;
          const v = -peak * (1 - u * u) * (1 - 0.25 * u * u);
          if (v < h[k]) h[k] = v;
        } else if (dist < r * 1.9 && h[k] > -0.02) {
          const v = RIM * Math.sin(Math.PI * (dist - r) / (r * 0.9));
          if (v > h[k]) h[k] = v;
        }
      }
    }
  }

  // ---------------------------------------------------------------- time
  clear() {
    this.clearing = { t: 0, dur: 1.5, front: -200 };
    this.strokes.clear();
  }

  update(dt) {
    const { mw, mh } = this;
    let alive = false;
    if (!this.paused) {
      this.time += dt;
      alive = this.blow(dt);
    }
    // Wind streaks ease in while sand is moving and ease out once it settles.
    const want = alive || this.clearing ? 1 : 0;
    this.windAlpha += (want - this.windAlpha) * Math.min(1, dt * 2.2);
    if (this.windAlpha < 0.01 && !want) this.windAlpha = 0;
    if (this.windAlpha > 0) this.moveGrains(dt);

    if (this.clearing) {
      const cl = this.clearing;
      cl.t += dt;
      const p = Math.min(1, cl.t / cl.dur);
      const soft = 180;
      cl.front = -soft + (this.W + soft * 2) * easeInOut(p);
      const { cell, h } = this;
      for (let i = 0; i < mw; i++) {
        // Behind the front the bed is swept flat; in the band itself it is half buried.
        const f = clamp(((i - 0.5) * cell - cl.front) / soft + 0.5, 0, 1);
        if (f >= 1) continue;
        for (let j = 0, k = i; j < mh; j++, k += mw) h[k] *= f;
      }
      if (p >= 1) { h.fill(0); this.clearing = null; }
    }
    return alive || !!this.clearing || this.windAlpha > 0;
  }

  // One wind step on the height field. Returns true while anything is still marked.
  blow(dt) {
    const { mw, mh, h, tmp, exposure, gustCol, cell, fadeSeconds } = this;
    const rate = ((1 + HOLD) / fadeSeconds) * dt;
    const ax = Math.min(0.45, (DRIFT_PX / fadeSeconds) * dt / cell);
    const ay = ax * 0.16;
    const diff = Math.min(0.2, (5 / fadeSeconds) * dt);

    // Gusts: soft bands that travel downwind across the bed.
    const t = this.time;
    for (let i = 0; i < mw; i++) {
      const x = i * cell - t * 55;
      gustCol[i] = 0.72 + 0.28 * Math.sin(x * 0.011) + 0.16 * Math.sin(x * 0.027 + 1.7);
    }

    let alive = false;
    for (let j = 1; j < mh - 1; j++) {
      const row = j * mw;
      for (let i = 1; i < mw - 1; i++) {
        const k = row + i;
        const c = h[k], l = h[k - 1], r = h[k + 1], u = h[k - mw], d = h[k + mw];
        if (c === 0 && l === 0 && r === 0 && u === 0 && d === 0) { tmp[k] = 0; continue; }
        let v = c + ax * (l - c) + ay * (u - c) + diff * (l + r + u + d - 4 * c);
        const g = exposure[k] * gustCol[i];
        // Ridges are exposed and blow away first; grooves fill more slowly.
        if (v > 0) v = Math.max(0, v - rate * g * 0.42);
        else v = Math.min(0, v + rate * g);
        if (v > -0.004 && v < 0.004) v = 0;
        else alive = true;
        tmp[k] = v;
      }
    }
    this.h = tmp;
    this.tmp = h;
    return alive;
  }

  moveGrains(dt) {
    const { W, H } = this;
    for (const g of this.grains) {
      g.x += g.v * dt;
      g.y += Math.sin(this.time * 1.3 + g.wob) * 6 * dt + g.v * 0.06 * dt;
      if (g.x - g.len > W || g.y > H + 4) {
        g.x = -g.len - Math.random() * 60;
        g.y = Math.random() * H;
      }
    }
  }

  // ---------------------------------------------------------------- draw
  render(ctx) {
    const { h, mw, mh, shadeImg, cell, dpr } = this;
    const data = shadeImg.data;
    const s = DEPTH_PX / (2 * cell);
    const [lx, ly, lz] = LIGHT;
    for (let j = 1; j < mh - 1; j++) {
      const row = j * mw;
      for (let i = 1; i < mw - 1; i++) {
        const k = row + i, o = k * 4;
        const c = h[k], l = h[k - 1], r = h[k + 1], u = h[k - mw], d = h[k + mw];
        if (c === 0 && l === 0 && r === 0 && u === 0 && d === 0) { data[o + 3] = 0; continue; }
        // Clamp so the extra "hold" depth reads as a fresh, crisp groove, not a deeper one.
        const gx = (cl(r) - cl(l)) * s, gy = (cl(d) - cl(u)) * s;
        const inv = 1 / Math.sqrt(gx * gx + gy * gy + 1);
        const lit = (-gx * lx - gy * ly + lz) * inv - lz;
        // The floor of a groove sits in a little shade of its own.
        const v = lit * 1.15 - (c < 0 ? Math.min(1, -c) * 0.1 : 0);
        if (v >= 0) {
          data[o] = 255; data[o + 1] = 244; data[o + 2] = 222;
          data[o + 3] = Math.min(1, v * 1.5) * 215;
        } else {
          data[o] = 74; data[o + 1] = 50; data[o + 2] = 30;
          data[o + 3] = Math.min(1, -v * 1.7) * 235;
        }
      }
    }
    this.shadeCtx.putImageData(shadeImg, 0, 0);

    ctx.setTransform(1, 0, 0, 1, 0, 0);
    ctx.drawImage(this.bed, 0, 0);
    ctx.imageSmoothingEnabled = true;
    ctx.imageSmoothingQuality = 'high';
    // Cell (i, j) is centred on CSS ((i - 0.5) * cell, (j - 0.5) * cell).
    ctx.drawImage(this.shade, -cell * dpr, -cell * dpr, mw * cell * dpr, mh * cell * dpr);

    ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
    if (this.windAlpha > 0) this.drawGrains(ctx);
    if (this.clearing) this.drawGust(ctx);
    ctx.setTransform(1, 0, 0, 1, 0, 0);
  }

  drawGrains(ctx) {
    ctx.lineCap = 'round';
    ctx.lineWidth = 1;
    for (const g of this.grains) {
      ctx.strokeStyle = `rgba(255,242,220,${0.16 * g.a * this.windAlpha})`;
      ctx.beginPath();
      ctx.moveTo(g.x - g.len, g.y - g.len * 0.06);
      ctx.lineTo(g.x, g.y);
      ctx.stroke();
    }
  }

  drawGust(ctx) {
    const f = this.clearing.front, H = this.H;
    const veil = ctx.createLinearGradient(f - 260, 0, f + 120, 0);
    veil.addColorStop(0, 'rgba(226,206,170,0)');
    veil.addColorStop(0.65, 'rgba(232,214,182,0.42)');
    veil.addColorStop(1, 'rgba(226,206,170,0)');
    ctx.fillStyle = veil;
    ctx.fillRect(f - 260, 0, 380, H);
    // Dense streaks riding the leading edge of the gust.
    const rand = mulberry32((this.clearing.t * 30) | 0);
    ctx.lineCap = 'round';
    for (let n = 0; n < 90; n++) {
      const x = f - 200 + rand() * 300, y = rand() * H, len = 10 + rand() * 30;
      ctx.strokeStyle = `rgba(255,240,214,${0.08 + rand() * 0.18})`;
      ctx.lineWidth = 0.6 + rand() * 1.2;
      ctx.beginPath();
      ctx.moveTo(x - len, y - len * 0.05);
      ctx.lineTo(x, y);
      ctx.stroke();
    }
  }

  // Pre-carve a handwritten hint so the mechanic explains itself.
  intro(text) {
    const { mw, mh, cell, W, H, h } = this;
    const c = makeCanvas(mw, mh), g = c.getContext('2d');
    g.translate(1, 1);
    g.scale(1 / cell, 1 / cell);
    const lines = text.split('\n');
    const family = '"Bradley Hand", "Segoe Print", "Noteworthy", ui-rounded, system-ui, sans-serif';
    let size = Math.min(W * 0.15, 76);
    g.font = `300 ${size}px ${family}`;
    const widest = Math.max(...lines.map((ln) => g.measureText(ln).width)) + size * 0.14;
    if (widest > W * 0.82) size *= (W * 0.82) / widest;
    g.font = `300 ${size}px ${family}`;
    g.textAlign = 'center';
    g.textBaseline = 'middle';
    g.lineWidth = Math.max(2, size * 0.05);
    g.lineCap = g.lineJoin = 'round';
    g.fillStyle = g.strokeStyle = '#fff';
    const y0 = H * 0.42 - ((lines.length - 1) * size * 1.15) / 2;
    lines.forEach((ln, n) => {
      g.fillText(ln, W / 2, y0 + n * size * 1.15);
      g.strokeText(ln, W / 2, y0 + n * size * 1.15);
    });
    const px = g.getImageData(0, 0, mw, mh).data;
    const a = new Float32Array(mw * mh);
    for (let i = 0; i < a.length; i++) a[i] = px[i * 4 + 3] / 255;
    const core = boxBlur(a, mw, mh, 1);
    const wide = boxBlur(a, mw, mh, Math.max(2, Math.round(5 / cell)));
    for (let k = 0; k < h.length; k++) {
      const groove = smoothstep(0.12, 0.8, core[k]);
      const v = groove > 0.02 ? -groove * (1 + HOLD * 1.4)
              : RIM * 0.8 * smoothstep(0.02, 0.35, wide[k]);
      if (v < 0 ? v < h[k] : (h[k] > -0.02 && v > h[k])) h[k] = v;
    }
  }
}

const cl = (v) => (v < -1 ? -1 : v > 1 ? 1 : v);

function normalize(x, y, z) {
  const l = Math.hypot(x, y, z);
  return [x / l, y / l, z / l];
}

function boxBlur(src, w, h, r) {
  const out = new Float32Array(w * h), n = (2 * r + 1) * (2 * r + 1);
  for (let j = r; j < h - r; j++) {
    for (let i = r; i < w - r; i++) {
      let sum = 0;
      for (let dy = -r; dy <= r; dy++) for (let dx = -r; dx <= r; dx++) sum += src[(j + dy) * w + i + dx];
      out[j * w + i] = sum / n;
    }
  }
  return out;
}

// ------------------------------------------------------------------ scenery
// The undisturbed bed: warm, muted sand with faint wind ripples and real grain,
// lit low from the upper left and falling off toward the edges.
function paintSand(W, H, dpr) {
  const rand = mulberry32(31);
  const c = makeCanvas(W * dpr, H * dpr), g = c.getContext('2d');
  g.scale(dpr, dpr);

  const base = g.createLinearGradient(0, 0, W * 0.4, H);
  base.addColorStop(0, '#d3bf9c');
  base.addColorStop(0.55, '#c3ab86');
  base.addColorStop(1, '#a88e6b');
  g.fillStyle = base;
  g.fillRect(0, 0, W, H);

  // Mottling plus wind ripples, painted at half resolution and scaled up softly.
  const s = 2, mw = Math.ceil(W / s), mh = Math.ceil(H / s);
  const low = makeCanvas(mw, mh), lg = low.getContext('2d');
  const img = lg.createImageData(mw, mh);
  const mot = valueNoise(mw, mh, Math.round(70 / s), rand);
  const warp = valueNoise(mw, mh, Math.round(60 / s), rand);
  const fade = valueNoise(mw, mh, Math.round(120 / s), rand);
  for (let j = 0; j < mh; j++) {
    for (let i = 0; i < mw; i++) {
      const k = j * mw + i;
      // Ripple crests run roughly across the wind (which blows left to right).
      const x = i * s + warp[k] * 46 + j * s * 0.18;
      const ph = Math.sin((x / 15) * Math.PI * 2);
      const rip = (ph > 0 ? ph * ph : -ph * ph * 0.7) * (0.25 + 0.75 * fade[k]);
      const m = (mot[k] - 0.5) * 2;
      const v = rip * 0.42 + m * 0.5;
      const o = k * 4;
      if (v >= 0) { img.data[o] = 255; img.data[o + 1] = 246; img.data[o + 2] = 228; img.data[o + 3] = v * 34; }
      else { img.data[o] = 90; img.data[o + 1] = 62; img.data[o + 2] = 38; img.data[o + 3] = -v * 30; }
    }
  }
  lg.putImageData(img, 0, 0);
  g.imageSmoothingEnabled = true;
  g.drawImage(low, 0, 0, W, H);

  // Low sun from the upper left.
  const sun = g.createRadialGradient(-W * 0.1, -H * 0.08, 0, -W * 0.1, -H * 0.08, Math.max(W, H) * 1.1);
  sun.addColorStop(0, 'rgba(255,226,180,0.30)');
  sun.addColorStop(0.5, 'rgba(255,214,160,0.08)');
  sun.addColorStop(1, 'rgba(255,214,160,0)');
  g.fillStyle = sun;
  g.fillRect(0, 0, W, H);

  const v = g.createRadialGradient(W / 2, H * 0.45, Math.min(W, H) * 0.35, W / 2, H * 0.45, Math.max(W, H) * 0.8);
  v.addColorStop(0, 'rgba(40,26,14,0)');
  v.addColorStop(1, 'rgba(40,26,14,0.38)');
  g.fillStyle = v;
  g.fillRect(0, 0, W, H);

  // Grain, at full device resolution: every pixel nudged a little, a few bright and dark specks.
  const full = g.getImageData(0, 0, c.width, c.height), d = full.data;
  for (let o = 0; o < d.length; o += 4) {
    const r = rand();
    let n = (r - 0.5) * 22;
    if (r > 0.985) n += 26;
    else if (r < 0.012) n -= 30;
    d[o] += n; d[o + 1] += n * 0.95; d[o + 2] += n * 0.85;
  }
  g.putImageData(full, 0, 0);
  return c;
}
