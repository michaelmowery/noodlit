// Snow: a field of fresh powder at blue hour.
//   Look:  your finger presses soft grooves into the snow. The groove walls catch light on
//          one side and fall into cool blue shadow on the other, with a little ridge of
//          pushed-up snow along the edges.
//   Decay: snow keeps falling while there is something to bury. Grooves fill in unevenly,
//          shallow edges first, until the field is smooth again. Hold stops the snowfall.
//   Clear: a short squall blows through and lays a fresh blanket from the top down.

import { clamp, smoothstep, easeInOut, mulberry32, makeCanvas, valueNoise, layoutFor, drawText, TextOverlay, draftMethods } from '../lib/util.js';

const HOLD = 0.35;        // extra depth above 1.0 = a short "freshly pressed" hold before filling starts
const RIM = 0.22;         // height of the ridge of displaced snow beside a groove (as a fraction of depth)
const RELIEF = 16;        // how steep groove walls look; higher = crisper lighting
const MAX_FLAKES = 420;

// Palette: moonlit snow rather than glaring white, so it stays calm on a phone at night.
const SHADOW = [74, 94, 138];     // deep groove / shaded wall
const LIGHT = [255, 255, 255];    // lit wall

export const snow = {
  id: 'snow',
  name: 'Snow',
  blurb: 'Fresh snow fills in the grooves',
  clearLabel: 'Fresh snow',
  clearIcon: 'M12 3v18M4.2 7.5l15.6 9M4.2 16.5l15.6-9M9.5 4.5 12 7l2.5-2.5M9.5 19.5 12 17l2.5 2.5',
  surface: 'Snowfield drawing surface',
  create: () => new Snow(),
};

class Snow {
  constructor() {
    this.fadeSeconds = 20;
    this.paused = false;
    this.strokes = new Map();
    this.flakes = [];
    this.spawnDebt = 0;
    this.clearing = null;
    this.depth = null;
    this.cell = 0;
    this.mw = 0;
    this.mh = 0;
    this.filling = false;
  }

  // ---------------------------------------------------------------- setup
  resize({ width, height, dpr }) {
    this.dropDraft();
    // Depth map: one float per cell. Positive = pressed in, negative = pushed up.
    // Upscaled with bilinear smoothing at render time, which keeps groove edges soft.
    const cell = Math.max(2, Math.ceil(Math.sqrt((width * height) / 220000)));
    const mw = Math.ceil(width / cell) + 1;
    const mh = Math.ceil(height / cell) + 1;
    const next = new Float32Array(mw * mh);
    if (this.depth && cell === this.cell) {
      const cw = Math.min(mw, this.mw), ch = Math.min(mh, this.mh);
      for (let y = 0; y < ch; y++) next.set(this.depth.subarray(y * this.mw, y * this.mw + cw), y * mw);
    }
    Object.assign(this, { W: width, H: height, dpr, cell, mw, mh, depth: next });

    // Per-cell fill speed so snow drifts in patchily, and a fine grain so pressed
    // snow looks compacted rather than machined.
    const rand = mulberry32(11);
    const coarse = valueNoise(mw, mh, Math.max(6, Math.round(70 / cell)), rand);
    const fine = valueNoise(mw, mh, Math.max(2, Math.round(8 / cell)), rand);
    this.fill = new Float32Array(mw * mh);
    this.grain = new Float32Array(mw * mh);
    for (let i = 0; i < this.fill.length; i++) {
      this.fill[i] = 0.6 + 0.65 * coarse[i] + 0.3 * (fine[i] - 0.5);
      this.grain[i] = 0.9 + 0.16 * fine[i];
    }

    this.shade = makeCanvas(mw, mh);
    this.shadeCtx = this.shade.getContext('2d');
    this.shadeImg = this.shadeCtx.createImageData(mw, mh);

    this.field = paintField(width, height, dpr);
    this.sprite = paintFlake();
  }

  setFadeSeconds(s) { this.fadeSeconds = s; }
  setPaused(p) { this.paused = p; }

  // ---------------------------------------------------------------- strokes
  radiusFor(info, speed) {
    const r = info.pointerType === 'pen' ? 3 + 5 * (info.pressure || 0.5)
            : info.pointerType === 'mouse' ? 9 : 11;
    // A quick drag skims the surface and leaves a slightly narrower trench.
    return r * (1 - Math.min(0.28, speed / 4000));
  }

  strokeStart(id, x, y, info) {
    const r = this.radiusFor(info, 0);
    this.strokes.set(id, { x, y, r, t: info.time });
    this.press(x, y, r, x, y, r, 1 + HOLD);
  }

  strokeMove(id, x, y, info) {
    const s = this.strokes.get(id);
    if (!s) return;
    const d = Math.hypot(x - s.x, y - s.y);
    if (d < 0.75) return;
    const speed = (d / Math.max(4, info.time - s.t)) * 1000;
    const r = s.r + (this.radiusFor(info, speed) - s.r) * 0.25;
    this.press(s.x, s.y, s.r, x, y, r, 1 + HOLD);
    Object.assign(s, { x, y, r, t: info.time });
  }

  strokeEnd(id) { this.strokes.delete(id); }

  // Press a capsule from (x0,y0,r0) to (x1,y1,r1) into the depth map, pushing a ridge up beside it.
  press(x0, y0, r0, x1, y1, r1, peak) {
    const { cell, mw, mh, depth, grain } = this;
    const inv = 1 / cell, rmax = Math.max(r0, r1) * 1.7;
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
        const k = j * mw + i;
        if (dist < r) {
          // Rounded trench: deepest along the centre line, easing up to the rim.
          const u = dist / r;
          const v = peak * grain[k] * (1 - smoothstep(0.3, 1, u));
          if (v > depth[k]) depth[k] = v;
        } else if (dist < r * 1.7 && depth[k] <= 0) {
          // Displaced snow piles up just outside the trench (but never inside an older one).
          const u = (dist - r) / (r * 0.7);
          const v = -RIM * peak * grain[k] * Math.sin(Math.PI * Math.min(1, u * 1.1 + 0.05));
          if (v < depth[k]) depth[k] = v;
        }
      }
    }
  }

  // ---------------------------------------------------------------- snowfall
  // Flakes are drawn in three loose depth layers. Near flakes are bigger, faster and sway more.
  spawnFlake(fromTop, gust) {
    if (this.flakes.length >= MAX_FLAKES) return;
    const z = Math.random();
    const size = 0.7 + z * z * 2.6;
    this.flakes.push({
      x: Math.random() * (this.W + 80) - 40,
      y: fromTop ? -10 - Math.random() * 40 : Math.random() * this.H,
      vy: (18 + 34 * z) * (gust ? 2.4 : 1),
      wind: gust ? 60 + Math.random() * 90 : (Math.random() - 0.5) * 8,
      size,
      alpha: 0.45 + 0.5 * z,
      phase: Math.random() * Math.PI * 2,
      sway: 0.6 + Math.random() * 1.2,
      // Each flake settles somewhere on the field and melts into it.
      land: this.H * (0.15 + Math.random() * 0.95),
      life: 1,
    });
  }

  updateFlakes(dt) {
    // Snow falls only while there is something to bury (or during a squall), so the
    // render loop can go idle on a blank field and spare the battery.
    const want = this.clearing ? 260 : (this.filling && !this.paused ? (this.W * this.H) / 6500 : 0);
    if (want > 0) {
      this.spawnDebt += dt * want * (this.clearing ? 1 : 0.28);
      while (this.spawnDebt >= 1) { this.spawnDebt -= 1; this.spawnFlake(true, !!this.clearing); }
    } else this.spawnDebt = 0;

    for (let n = this.flakes.length - 1; n >= 0; n--) {
      const f = this.flakes[n];
      f.phase += dt * f.sway;
      f.y += f.vy * dt;
      f.x += (f.wind + Math.sin(f.phase) * 10 * f.sway) * dt;
      if (!this.clearing) f.wind *= 1 - Math.min(1, dt * 0.8);
      if (f.y >= f.land) f.life -= dt * 2.2;
      if (f.life <= 0 || f.y > this.H + 10 || f.x > this.W + 60) this.flakes.splice(n, 1);
    }
    return this.flakes.length > 0;
  }

  // ---------------------------------------------------------------- time
  clear() {
    this.clearing = { t: 0, dur: 1.6 };
    this.strokes.clear();
    // Kick off the squall with a screenful of flakes already in the air.
    for (let n = 0; n < 120; n++) this.spawnFlake(false, true);
  }

  update(dt) {
    const { depth, fill } = this;
    let alive = false;
    if (!this.paused) {
      const rate = ((1 + HOLD) / this.fadeSeconds) * dt;
      for (let i = 0; i < depth.length; i++) {
        const d = depth[i];
        if (d > 0) {
          const n = d - rate * fill[i];
          depth[i] = n > 0 ? n : 0;
          alive = true;
        } else if (d < 0) {
          // Ridges slump a little slower than trenches fill.
          const n = d + rate * fill[i] * RIM * 0.8;
          depth[i] = n < 0 ? n : 0;
          alive = true;
        }
      }
    } else {
      for (let i = 0; i < depth.length; i++) if (depth[i] !== 0) { alive = true; break; }
    }
    if (this.applyDrafts()) alive = true;
    this.filling = alive;

    if (this.clearing) {
      const cl = this.clearing;
      cl.t += dt;
      const p = Math.min(1, cl.t / cl.dur);
      const soft = 180;
      cl.front = -soft + (this.H + soft * 2) * easeInOut(p);
      const { cell, mw, mh } = this;
      for (let j = 0; j < mh; j++) {
        const f = clamp(((j + 0.5) * cell - cl.front) / soft, 0, 1);
        if (f >= 1) continue;
        const row = j * mw;
        for (let i = 0; i < mw; i++) depth[row + i] *= f;
      }
      if (p >= 1) { depth.fill(0); this.clearing = null; }
    }

    const falling = this.updateFlakes(dt);
    return alive || falling || !!this.clearing;
  }

  // ---------------------------------------------------------------- draw
  render(ctx) {
    const { depth, shadeImg, mw, mh, cell, dpr } = this;
    const data = shadeImg.data;
    // Gradients use a 2-cell stencil: wide enough to smooth the creases where stroke
    // segments overlap, narrow enough to keep groove walls crisp.
    const k = RELIEF / (4 * cell);
    // Light comes from the upper left, like a low moon.
    const lx = -0.62, ly = -0.78;
    for (let j = 0; j < mh; j++) {
      const up = Math.max(0, j - 2) * mw, dn = Math.min(mh - 1, j + 2) * mw, row = j * mw;
      for (let i = 0; i < mw; i++) {
        const o = (row + i) * 4;
        const d = depth[row + i];
        const l = row + Math.max(0, i - 2), r = row + Math.min(mw - 1, i + 2);
        if (d === 0 && depth[l] === 0 && depth[r] === 0 && depth[up + i] === 0 && depth[dn + i] === 0) {
          data[o + 3] = 0;
          continue;
        }
        const dc = d > 1 ? 1 : d;
        const gx = (depth[r] - depth[l]) * k;
        const gy = (depth[dn + i] - depth[up + i]) * k;
        // Normal of the surface h = -depth is (gx, gy, 1); light is (lx, ly, ~0.9).
        const lit = clamp((gx * lx + gy * ly) / Math.sqrt(1 + gx * gx + gy * gy), -1, 1);
        const cavity = dc > 0 ? 0.34 * dc * dc * (3 - 2 * dc) : 0;
        const net = cavity - lit * 0.75;
        if (net > 0) {
          data[o] = SHADOW[0]; data[o + 1] = SHADOW[1]; data[o + 2] = SHADOW[2];
          data[o + 3] = (net > 0.82 ? 0.82 : net) * 255;
        } else {
          data[o] = LIGHT[0]; data[o + 1] = LIGHT[1]; data[o + 2] = LIGHT[2];
          data[o + 3] = (-net > 0.7 ? 0.7 : -net) * 255;
        }
      }
    }
    this.shadeCtx.putImageData(shadeImg, 0, 0);

    ctx.setTransform(1, 0, 0, 1, 0, 0);
    ctx.drawImage(this.field, 0, 0);
    ctx.imageSmoothingEnabled = true;
    ctx.imageSmoothingQuality = 'high';
    // Shift by half a cell: map samples sit at cell centres.
    ctx.drawImage(this.shade, -cell * dpr * 0.5, -cell * dpr * 0.5, mw * cell * dpr, mh * cell * dpr);

    ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
    if (this.clearing) this.drawSquall(ctx);
    this.drawFlakes(ctx);
    ctx.setTransform(1, 0, 0, 1, 0, 0);
  }

  drawFlakes(ctx) {
    const s = this.sprite;
    for (const f of this.flakes) {
      ctx.globalAlpha = f.alpha * Math.max(0, f.life);
      const r = f.size * 2;
      ctx.drawImage(s, f.x - r, f.y - r, r * 2, r * 2);
    }
    ctx.globalAlpha = 1;
  }

  drawSquall(ctx) {
    const f = this.clearing.front;
    const g = ctx.createLinearGradient(0, f - 240, 0, f + 120);
    g.addColorStop(0, 'rgba(236,241,248,0)');
    g.addColorStop(0.65, 'rgba(244,247,252,0.55)');
    g.addColorStop(1, 'rgba(236,241,248,0)');
    ctx.fillStyle = g;
    ctx.fillRect(0, f - 240, this.W, 360);
  }

  // Pre-press a handwritten hint so the mechanic explains itself.
  intro(text, opts = {}) {
    this.stampText(text, opts).overlay.apply();
    this.filling = true;
  }

  // Typed text (see draftMethods) stays freshly pressed while typing, then the snowfall buries it.
  onDraftChange() { this.filling = true; }

  stampText(text, opts) {
    const { mw, mh, cell, W, H, depth } = this;
    const c = makeCanvas(mw, mh), g = c.getContext('2d');
    g.scale(1 / cell, 1 / cell);
    const { lay, place } = layoutFor(g, text, opts, { W, H, size: Math.min(W * 0.15, 76) });
    g.fillStyle = g.strokeStyle = '#fff';
    drawText(g, lay, place, Math.max(2.5, lay.size * 0.07));
    const px = g.getImageData(0, 0, mw, mh).data;
    const overlay = new TextOverlay();
    // 3x3 blur rounds the trench profile so the lighting reads as pressed snow.
    for (let j = 1; j < mh - 1; j++) {
      for (let i = 1; i < mw - 1; i++) {
        let sum = 0;
        for (let dy = -1; dy <= 1; dy++) for (let dx = -1; dx <= 1; dx++) sum += px[((j + dy) * mw + i + dx) * 4 + 3];
        const kk = j * mw + i;
        const v = smoothstep(0.1, 0.8, sum / (9 * 255)) * (1 + HOLD * 1.6) * this.grain[kk];
        if (v > 0) overlay.put(depth, kk, v);
      }
    }
    return { overlay, lay, place };
  }
}

// ------------------------------------------------------------------ scenery
// Untouched snow under a blue-hour sky: soft drifts, fine grain and a scatter of glints.
function paintField(W, H, dpr) {
  const rand = mulberry32(23);
  const c = makeCanvas(W * dpr, H * dpr), g = c.getContext('2d');
  g.scale(dpr, dpr);

  const base = g.createLinearGradient(0, 0, 0, H);
  base.addColorStop(0, '#c3cfe0');
  base.addColorStop(0.45, '#d6deea');
  base.addColorStop(1, '#e6ebf3');
  g.fillStyle = base;
  g.fillRect(0, 0, W, H);

  // Gentle drifts: low-frequency undulation shaded from the same upper-left light.
  const dw = Math.ceil(W / 6), dh = Math.ceil(H / 6);
  const drift = makeCanvas(dw, dh), dg = drift.getContext('2d');
  const img = dg.createImageData(dw, dh);
  const nA = valueNoise(dw, dh, 26, rand), nB = valueNoise(dw, dh, 9, rand);
  const hgt = new Float32Array(dw * dh);
  for (let i = 0; i < hgt.length; i++) hgt[i] = nA[i] * 0.8 + nB[i] * 0.2;
  for (let y = 0; y < dh; y++) {
    for (let x = 0; x < dw; x++) {
      const i = y * dw + x;
      const gx = hgt[y * dw + Math.min(dw - 1, x + 1)] - hgt[y * dw + Math.max(0, x - 1)];
      const gy = hgt[Math.min(dh - 1, y + 1) * dw + x] - hgt[Math.max(0, y - 1) * dw + x];
      const lit = clamp((-gx * -0.62 + -gy * -0.78) * 9, -1, 1);
      const o = i * 4;
      if (lit >= 0) { img.data[o] = img.data[o + 1] = img.data[o + 2] = 255; img.data[o + 3] = lit * 70; }
      else { img.data[o] = 96; img.data[o + 1] = 116; img.data[o + 2] = 160; img.data[o + 3] = -lit * 55; }
    }
  }
  dg.putImageData(img, 0, 0);
  g.imageSmoothingEnabled = true;
  g.imageSmoothingQuality = 'high';
  g.drawImage(drift, 0, 0, W, H);

  // Cool shade along the top where the sky meets the field, and a faint warm glow low on the right.
  const sky = g.createLinearGradient(0, 0, 0, H * 0.35);
  sky.addColorStop(0, 'rgba(92,110,150,0.28)');
  sky.addColorStop(1, 'rgba(92,110,150,0)');
  g.fillStyle = sky;
  g.fillRect(0, 0, W, H * 0.35);
  const warm = g.createRadialGradient(W * 0.85, H * 1.05, 0, W * 0.85, H * 1.05, Math.max(W, H) * 0.7);
  warm.addColorStop(0, 'rgba(255,214,176,0.22)');
  warm.addColorStop(1, 'rgba(255,214,176,0)');
  g.fillStyle = warm;
  g.fillRect(0, 0, W, H);

  // Grain: tiny crystals, a mix of shaded and bright.
  const count = Math.round((W * H) / 30);
  for (let n = 0; n < count; n++) {
    const x = rand() * W, y = rand() * H, r = 0.3 + rand() * 0.7;
    g.fillStyle = rand() < 0.5 ? 'rgba(120,138,175,0.10)' : 'rgba(255,255,255,0.35)';
    g.fillRect(x, y, r, r);
  }
  // Glints: a few crystals catching the light.
  const glints = Math.round((W * H) / 2600);
  for (let n = 0; n < glints; n++) {
    const x = rand() * W, y = rand() * H, a = 0.35 + rand() * 0.55, r = 0.5 + rand() * 0.8;
    g.fillStyle = `rgba(255,255,255,${a})`;
    g.beginPath(); g.arc(x, y, r, 0, Math.PI * 2); g.fill();
    if (rand() < 0.12) {
      g.strokeStyle = `rgba(255,255,255,${a * 0.5})`;
      g.lineWidth = 0.5;
      g.beginPath(); g.moveTo(x - 3, y); g.lineTo(x + 3, y); g.moveTo(x, y - 3); g.lineTo(x, y + 3); g.stroke();
    }
  }

  // Soft vignette keeps the eye in the middle.
  const v = g.createRadialGradient(W / 2, H * 0.45, Math.min(W, H) * 0.35, W / 2, H * 0.45, Math.max(W, H) * 0.85);
  v.addColorStop(0, 'rgba(60,76,110,0)');
  v.addColorStop(1, 'rgba(60,76,110,0.22)');
  g.fillStyle = v;
  g.fillRect(0, 0, W, H);
  return c;
}

// One soft flake sprite, scaled per flake at draw time.
function paintFlake() {
  const s = 32, c = makeCanvas(s, s), g = c.getContext('2d');
  const gr = g.createRadialGradient(s / 2, s / 2, 0, s / 2, s / 2, s / 2);
  gr.addColorStop(0, 'rgba(255,255,255,1)');
  gr.addColorStop(0.35, 'rgba(255,255,255,0.85)');
  gr.addColorStop(1, 'rgba(255,255,255,0)');
  g.fillStyle = gr;
  g.fillRect(0, 0, s, s);
  return c;
}

Object.assign(Snow.prototype, draftMethods);
