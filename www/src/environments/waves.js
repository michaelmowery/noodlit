// Waves: wet sand at the shoreline, seen from above.
//   Look:  your finger carves a soft groove in firm wet sand, with a low ridge of pushed-up
//          sand along the edges, lit from the upper left so it reads as real relief.
//   Decay: water seeps in and the grooves slowly slump. Every few seconds a wave washes up
//          from the sea at the top; wherever the swash reaches, it smooths the sand fast,
//          so marks near the water go first and marks further up the beach linger.
//   Clear: one big wave runs up past the bottom of the screen and leaves the beach smooth.

import { clamp, smoothstep, easeInOut, mulberry32, makeCanvas, valueNoise } from '../lib/util.js';

const HOLD = 0.35;          // extra depth above 1.0 = a short "fully crisp" hold before slumping
const RIPPLE = 1.9;         // berm reach, as a multiple of groove radius

export const waves = {
  id: 'waves',
  name: 'Waves',
  surface: 'Wet sand drawing surface',
  clearLabel: 'Big wave',
  clearIcon: 'M3 15c2.5 0 3-3 6-3s3.5 3 6 3 3.5-3 6-3M3 19c2.5 0 3-3 6-3s3.5 3 6 3 3.5-3 6-3M6 9c1.5-3 4-4.5 6.5-4.5 2 0 3.5 1 4.5 2.5',
  create: () => new Waves(),
};

class Waves {
  constructor() {
    this.fadeSeconds = 20;
    this.paused = false;
    this.strokes = new Map();
    this.wave = null;
    this.nextWave = 2.5;
    this.time = 0;
    this.waveSeed = 1;
    this.rand = mulberry32(2024);
    this.cell = 0;
    this.mw = 0;
    this.mh = 0;
  }

  // ---------------------------------------------------------------- setup
  resize({ width, height, dpr }) {
    const cell = Math.max(2, Math.ceil(Math.sqrt((width * height) / 220000)));
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
    const groove = keep(this.groove), berm = keep(this.berm);
    Object.assign(this, { W: width, H: height, dpr, cell, mw, mh, groove, berm });
    this.height = new Float32Array(mw * mh);
    this.front = new Float32Array(mw);
    this.wetY = new Float32Array(mw).fill(this.restY());

    // Sand doesn't smooth uniformly: firmer and softer patches.
    const rand = mulberry32(11);
    const coarse = valueNoise(mw, mh, Math.max(6, Math.round(70 / cell)), rand);
    const fine = valueNoise(mw, mh, Math.max(2, Math.round(12 / cell)), rand);
    this.decay = new Float32Array(mw * mh);
    for (let i = 0; i < this.decay.length; i++) this.decay[i] = 0.6 + 0.6 * coarse[i] + 0.3 * (fine[i] - 0.5);

    this.shadow = makeCanvas(mw, mh);
    this.shadowCtx = this.shadow.getContext('2d');
    this.shadowImg = this.shadowCtx.createImageData(mw, mh);
    this.light = makeCanvas(mw, mh);
    this.lightCtx = this.light.getContext('2d');
    this.lightImg = this.lightCtx.createImageData(mw, mh);
    const sd = this.shadowImg.data, ld = this.lightImg.data;
    for (let i = 0; i < sd.length; i += 4) {
      sd[i] = 52; sd[i + 1] = 38; sd[i + 2] = 28;
      ld[i] = 255; ld[i + 1] = 247; ld[i + 2] = 232;
    }

    this.sand = paintSand(width, height, dpr, this.restY());
    this.computeFront();
  }

  restY() { return Math.max(34, (this.H || 800) * 0.07); }

  setFadeSeconds(s) { this.fadeSeconds = s; }
  setPaused(p) { this.paused = p; }

  // ---------------------------------------------------------------- strokes
  radiusFor(info, speed) {
    const r = info.pointerType === 'pen' ? 2.5 + 4 * (info.pressure || 0.5)
            : info.pointerType === 'mouse' ? 6 : 7.5;
    return r * (1 - Math.min(0.25, speed / 5000));
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

  // Press a capsule from (x0,y0,r0) to (x1,y1,r1) into the sand: a groove plus a ridge.
  carve(x0, y0, r0, x1, y1, r1, peak) {
    const { cell, mw, mh, groove, berm } = this;
    const inv = 1 / cell, rmax = Math.max(r0, r1) * RIPPLE;
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
        if (dist >= r * RIPPLE) continue;
        const k = j * mw + i;
        if (dist < r) {
          const g = peak * (1 - smoothstep(r * 0.3, r, dist));
          if (g > groove[k]) groove[k] = g;
        }
        const b = smoothstep(r * 0.55, r * 1.05, dist) * (1 - smoothstep(r * 1.15, r * RIPPLE, dist)) * peak;
        if (b > berm[k]) berm[k] = b;
      }
    }
  }

  // ---------------------------------------------------------------- waves
  spawnWave(big) {
    const rnd = this.rand, H = this.H, rest = this.restY();
    // Most waves stop on the upper beach; every so often one runs a long way up.
    const reach = big ? H + 140
      : rnd() < 0.2 ? H * (0.7 + 0.3 * rnd())
      : rest + (H - rest) * (0.12 + 0.5 * Math.pow(rnd(), 1.4));
    const dist = reach - rest;
    this.wave = {
      t: 0,
      big,
      reach,
      rise: big ? 1.15 : clamp(0.9 + dist / 520, 1.0, 2.4),
      hold: big ? 0.2 : 0.25 + 0.3 * rnd(),
      fall: big ? 1.7 : clamp(1.2 + dist / 450, 1.4, 2.8),
      amp: big ? 26 : 10 + 12 * rnd(),
      p1: rnd() * 6.28, p2: rnd() * 6.28, f1: 0.006 + 0.006 * rnd(), f2: 0.017 + 0.01 * rnd(),
      seed: this.waveSeed++,
      erode: big ? 6 : 1.1,
      cleared: false,
    };
  }

  // 0 at rest, 1 at full reach; also reports which way the water is moving.
  waveProgress(w) {
    if (w.t < w.rise) {
      const u = w.t / w.rise;
      return { p: 1 - Math.pow(1 - u, 2.2), advancing: true };
    }
    if (w.t < w.rise + w.hold) return { p: 1, advancing: false };
    const u = Math.min(1, (w.t - w.rise - w.hold) / w.fall);
    return { p: 1 - easeInOut(u), advancing: false };
  }

  computeFront() {
    const { mw, cell, front, time } = this;
    const rest = this.restY();
    const w = this.wave;
    const st = w ? this.waveProgress(w) : { p: 0 };
    this.waveState = st;
    for (let i = 0; i < mw; i++) {
      const x = i * cell;
      let y = rest + Math.sin(time * 0.9 + x * 0.012) * 3 + Math.sin(time * 0.5 + x * 0.004 + 1.7) * 4;
      if (w) {
        // The leading edge is lacy: two sine trains whose amplitude grows as the water runs up.
        const lace = Math.sin(x * w.f1 + w.p1 + time * 0.35) * 0.65 + Math.sin(x * w.f2 + w.p2 - time * 0.6) * 0.35;
        y += (w.reach - rest) * st.p + lace * w.amp * (0.3 + 0.7 * st.p);
      }
      front[i] = y;
    }
  }

  // ---------------------------------------------------------------- time
  clear() {
    this.strokes.clear();
    this.spawnWave(true);
  }

  update(dt) {
    this.time += dt;
    const { groove, berm, decay, mw, mh, cell } = this;
    let content = false;

    // Slow slump everywhere: water seeps into the grooves and the ridges settle.
    const seep = this.paused ? 0 : ((1 + HOLD) / this.fadeSeconds) * dt;
    for (let k = 0; k < groove.length; k++) {
      const g = groove[k], b = berm[k];
      if (g <= 0 && b <= 0) continue;
      content = true;
      if (!seep) continue;
      const r = seep * decay[k];
      groove[k] = g > r ? g - r : 0;
      berm[k] = b > r * 1.25 ? b - r * 1.25 : 0;
    }

    // Waves only come while there is something on the sand (and the user isn't holding).
    if (!this.wave && content && !this.paused) {
      this.nextWave -= dt;
      if (this.nextWave <= 0) {
        this.spawnWave(false);
        const base = clamp(this.fadeSeconds * 0.22, 3.2, 10);
        this.nextWave = base * (0.75 + 0.5 * this.rand());
      }
    }

    const w = this.wave;
    if (w) w.t += dt;
    this.computeFront();

    if (w) {
      const { p, advancing } = this.waveState;
      const erosive = !this.paused || w.big;
      // Where the water covers the sand, it smooths it, hardest at the foamy leading edge.
      if (erosive) {
        const base = w.erode * (advancing ? 1 : 0.5) * dt;
        for (let i = 0; i < mw; i++) {
          const f = this.front[i];
          const jMax = Math.min(mh - 1, Math.floor(f / cell));
          for (let j = 0; j <= jMax; j++) {
            const k = j * mw + i;
            if (groove[k] <= 0 && berm[k] <= 0) continue;
            const edge = advancing ? 1 + 1.6 * smoothstep(f - 46, f - 4, j * cell) : 1;
            const a = Math.min(1, base * edge * decay[k]);
            groove[k] *= 1 - a;
            berm[k] *= 1 - Math.min(1, a * 1.4);
            if (groove[k] < 0.01) groove[k] = 0;
            if (berm[k] < 0.01) berm[k] = 0;
          }
        }
      }
      if (w.big && p >= 0.999 && !w.cleared) { groove.fill(0); berm.fill(0); w.cleared = true; }
      if (w.t >= w.rise + w.hold + w.fall) this.wave = null;
    }

    // The wet line follows the water up and dries back slowly behind it.
    const rest = this.restY();
    for (let i = 0; i < mw; i++) {
      const f = this.front[i];
      if (f > this.wetY[i]) this.wetY[i] = f;
      else this.wetY[i] = Math.max(rest, this.wetY[i] - 16 * dt);
    }

    const drying = this.wetY.some((y) => y > rest + 24);
    return (content && !this.paused) || !!this.wave || drying;
  }

  // ---------------------------------------------------------------- draw
  render(ctx) {
    this.renderRelief();
    const { dpr, W, H } = this;
    ctx.setTransform(1, 0, 0, 1, 0, 0);
    ctx.drawImage(this.sand, 0, 0);
    ctx.imageSmoothingEnabled = true;
    ctx.imageSmoothingQuality = 'high';
    const sw = this.mw * this.cell * dpr, sh = this.mh * this.cell * dpr;
    ctx.drawImage(this.shadow, 0, 0, sw, sh);
    ctx.drawImage(this.light, 0, 0, sw, sh);
    ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
    this.drawWater(ctx, W, H);
    ctx.setTransform(1, 0, 0, 1, 0, 0);
  }

  // Turn the groove/ridge fields into a heightmap and light it from the upper left.
  renderRelief() {
    const { groove, berm, height: h, mw, mh, cell, wetY } = this;
    for (let k = 0; k < h.length; k++) {
      const g = groove[k] > 1 ? 1 : groove[k];
      h[k] = berm[k] * 0.3 * (1 - g) - g;
    }
    const sd = this.shadowImg.data, ld = this.lightImg.data;
    const slope = 1.25 / cell;
    for (let j = 0; j < mh; j++) {
      const y = (j + 0.5) * cell;
      for (let i = 0; i < mw; i++) {
        const k = j * mw + i, o = k * 4 + 3;
        const hl = i > 0 ? h[k - 1] : h[k], hr = i < mw - 1 ? h[k + 1] : h[k];
        const hu = j > 0 ? h[k - mw] : h[k], hd = j < mh - 1 ? h[k + mw] : h[k];
        const shade = ((hr - hl) + (hd - hu)) * slope;
        const wet = 1 - smoothstep(wetY[i] - 60, wetY[i] + 2, y);
        const depth = h[k] < 0 ? -h[k] : 0;
        const dark = (shade < 0 ? -shade * 0.6 : 0) + depth * 0.2 + wet * 0.14;
        const lite = (shade > 0 ? shade * 0.45 : 0) + wet * depth * 0.06;
        sd[o] = dark >= 1 ? 255 : (dark * 255) | 0;
        ld[o] = lite >= 1 ? 255 : (lite * 255) | 0;
      }
    }
    this.shadowCtx.putImageData(this.shadowImg, 0, 0);
    this.lightCtx.putImageData(this.lightImg, 0, 0);
  }

  drawWater(ctx, W, H) {
    const { front, cell, mw } = this;
    let maxF = 0;
    for (let i = 0; i < mw; i++) if (front[i] > maxF) maxF = front[i];
    const rest = this.restY();
    const w = this.wave;
    const st = this.waveState || { p: 0, advancing: false };

    // Body of water: deep slate-teal at the top, thinning to a clear film at the edge.
    const body = ctx.createLinearGradient(0, 0, 0, maxF + 2);
    const restStop = clamp(rest / (maxF + 2), 0.05, 0.95);
    body.addColorStop(0, 'rgba(30,62,74,0.97)');
    body.addColorStop(restStop * 0.8, 'rgba(46,92,104,0.9)');
    body.addColorStop(Math.min(0.97, restStop + (1 - restStop) * 0.35), 'rgba(92,146,152,0.5)');
    body.addColorStop(1, 'rgba(170,206,204,0.16)');
    ctx.beginPath();
    ctx.moveTo(-2, -2);
    for (let i = 0; i < mw; i++) ctx.lineTo(i * cell, front[i]);
    ctx.lineTo(W + 2, front[mw - 1]);
    ctx.lineTo(W + 2, -2);
    ctx.closePath();
    ctx.fillStyle = body;
    ctx.fill();

    // A wet sheen just ahead of the water, then the foam line itself.
    const foamA = w ? (st.advancing ? 0.85 : 0.45 + 0.4 * st.p) : 0.55;
    ctx.lineJoin = ctx.lineCap = 'round';
    ctx.beginPath();
    for (let i = 0; i < mw; i++) ctx[i ? 'lineTo' : 'moveTo'](i * cell, front[i] - 4);
    ctx.strokeStyle = `rgba(240,248,248,${0.18 * foamA})`;
    ctx.lineWidth = 9;
    ctx.stroke();
    ctx.beginPath();
    for (let i = 0; i < mw; i++) ctx[i ? 'lineTo' : 'moveTo'](i * cell, front[i]);
    ctx.strokeStyle = `rgba(250,253,252,${0.7 * foamA})`;
    ctx.lineWidth = 2.2;
    ctx.stroke();

    // Lacy foam bubbles trailing behind the edge; seeded per wave so they ride with it.
    const rnd = mulberry32((w ? w.seed : 0) * 7919 + 13);
    ctx.fillStyle = `rgba(250,253,252,${0.45 * foamA})`;
    const n = Math.round(W / 7);
    ctx.beginPath();
    for (let b = 0; b < n; b++) {
      const x = rnd() * W;
      const back = Math.pow(rnd(), 2) * (w ? 34 + 30 * st.p : 16);
      const r = 0.6 + rnd() * 1.8;
      const i = clamp(Math.round(x / cell), 0, mw - 1);
      const y = front[i] - 2 - back;
      ctx.moveTo(x + r, y);
      ctx.arc(x, y, r, 0, Math.PI * 2);
    }
    ctx.fill();
  }

  // Pre-carve a handwritten hint so the mechanic explains itself.
  intro(text, { at } = {}) {
    const { mw, mh, cell, W, H, groove, berm } = this;
    const c = makeCanvas(mw, mh), g = c.getContext('2d');
    g.scale(1 / cell, 1 / cell);
    const lines = text.split('\n');
    const family = '"Bradley Hand", "Segoe Print", "Noteworthy", ui-rounded, system-ui, sans-serif';
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
    const block = (lines.length - 1) * size * 1.15;
    const y0 = clamp(H * (at ?? 0.46) - block / 2, 56 + size * 0.6, H - 130 - block);
    lines.forEach((ln, n) => {
      g.fillText(ln, W / 2, y0 + n * size * 1.15);
      g.strokeText(ln, W / 2, y0 + n * size * 1.15);
    });
    const px = g.getImageData(0, 0, mw, mh).data;
    const R = 2;
    for (let j = R; j < mh - R; j++) {
      for (let i = R; i < mw - R; i++) {
        let near = 0, wide = 0;
        for (let dy = -R; dy <= R; dy++) {
          for (let dx = -R; dx <= R; dx++) {
            const a = px[((j + dy) * mw + i + dx) * 4 + 3];
            wide += a;
            if (dx >= -1 && dx <= 1 && dy >= -1 && dy <= 1) near += a;
          }
        }
        const k = j * mw + i;
        const gv = smoothstep(0.15, 0.75, near / (9 * 255)) * (1 + HOLD * 1.6);
        const bv = smoothstep(0.05, 0.4, wide / (25 * 255)) * (1 + HOLD);
        if (gv > groove[k]) groove[k] = gv;
        if (bv > berm[k]) berm[k] = bv;
      }
    }
  }

  dispose() {
    this.sand = this.shadow = this.light = null;
  }
}

// ------------------------------------------------------------------ scenery
// Firm wet sand in soft evening light: fine grain, faint ripple marks, darker near the water.
function paintSand(W, H, dpr, rest) {
  const rand = mulberry32(5);
  const c = makeCanvas(W * dpr, H * dpr), g = c.getContext('2d');
  g.scale(dpr, dpr);

  const base = g.createLinearGradient(0, 0, 0, H);
  base.addColorStop(0, '#8a755f');
  base.addColorStop(Math.min(0.5, (rest + 80) / H), '#a18a70');
  base.addColorStop(1, '#bba483');
  g.fillStyle = base;
  g.fillRect(0, 0, W, H);

  // Grain and ripple marks, applied per device pixel so they stay crisp.
  const cw = c.width, ch = c.height;
  const img = g.getImageData(0, 0, cw, ch);
  const d = img.data;
  const nw = Math.ceil(W / 6) + 2, nh = Math.ceil(H / 6) + 2;
  const warp = valueNoise(nw, nh, 14, rand);
  const patch = valueNoise(nw, nh, 30, rand);
  const s = 1 / dpr;
  for (let y = 0; y < ch; y++) {
    const cy = y * s, ny = (cy / 6) | 0;
    for (let x = 0; x < cw; x++) {
      const cx = x * s, nk = ny * nw + ((cx / 6) | 0);
      const ripple = Math.sin((cy + cx * 0.18 + warp[nk] * 40) * 0.29) * (patch[nk] - 0.35) * 7;
      let v = ripple + (rand() - 0.5) * 16;
      const r = rand();
      if (r < 0.012) v += 26; else if (r < 0.024) v -= 24;
      const o = (y * cw + x) * 4;
      d[o] = clamp(d[o] + v, 0, 255);
      d[o + 1] = clamp(d[o + 1] + v * 0.92, 0, 255);
      d[o + 2] = clamp(d[o + 2] + v * 0.8, 0, 255);
    }
  }
  g.putImageData(img, 0, 0);

  // Low sun from the upper left, and a soft vignette to keep attention on the middle.
  const glow = g.createRadialGradient(W * 0.15, H * 0.2, 0, W * 0.15, H * 0.2, Math.max(W, H) * 0.9);
  glow.addColorStop(0, 'rgba(255,224,180,0.16)');
  glow.addColorStop(1, 'rgba(255,224,180,0)');
  g.fillStyle = glow;
  g.fillRect(0, 0, W, H);
  const v = g.createRadialGradient(W / 2, H * 0.5, Math.min(W, H) * 0.35, W / 2, H * 0.5, Math.max(W, H) * 0.8);
  v.addColorStop(0, 'rgba(0,0,0,0)');
  v.addColorStop(1, 'rgba(20,12,6,0.32)');
  g.fillStyle = v;
  g.fillRect(0, 0, W, H);
  return c;
}
