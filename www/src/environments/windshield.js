// Windshield: a rain-misted windshield at night, looking out at a city street.
//   Look:  your finger wipes clear lines through the rain film, and the street lights behind
//          snap into focus through them.
//   Decay: rain keeps landing. New drops speckle your lines back in, and the film creeps
//          back slowly. Every so often (sooner on faster fade speeds) the intermittent wipers
//          make a pass and take whatever is left with them; the glass beads up again a moment
//          later, ready for the next thought. Hold parks the wipers.
//   Clear: the wipers sweep straight away.

import { clamp, smoothstep, easeInOut, mulberry32, makeCanvas, valueNoise, layoutFor, drawText, TextOverlay, draftMethods } from '../lib/util.js';

const HOLD = 0.35;        // extra clarity above 1.0 = a short "fully clear" hold before rain returns
const PARK = 0.05;        // blade angle at rest (radians, measured from pointing right)
const END = Math.PI - 0.05;
const REMIST = 1.7;       // seconds for freshly wiped glass to bead up again
const DROP_HIT = 0.55;    // how much clarity one landing raindrop takes away

export const windshield = {
  id: 'windshield',
  name: 'Windshield',
  surface: 'Rainy windshield drawing surface',
  clearLabel: 'Wipe',
  clearIcon: 'M3.5 18A10 10 0 0 1 20.5 18M12 20.5 6.5 6.5M11 20.5h2',
  create: () => new Windshield(),
};

class Windshield {
  constructor() {
    this.fadeSeconds = 20;
    this.paused = false;
    this.strokes = new Map();
    this.sweep = null;        // { t, up, rest, down, a } while the wipers are moving
    this.timer = 0;           // seconds of rain since the last pass
    this.dropDebt = 0;
    this.rand = mulberry32(1337);
    this.clarity = null;      // what you wiped (decays with rain, zeroed by the wipers)
    this.fresh = null;        // freshly wiped glass behind the blades, beads up in REMIST seconds
    this.cell = 0;
    this.mw = 0;
    this.mh = 0;
  }

  // ---------------------------------------------------------------- setup
  resize({ width, height, dpr }) {
    this.dropDraft();
    const cell = Math.max(2, Math.ceil(Math.sqrt((width * height) / 220000)));
    const mw = Math.ceil(width / cell) + 1;
    const mh = Math.ceil(height / cell) + 1;
    const next = new Float32Array(mw * mh);
    if (this.clarity && cell === this.cell) {
      const cw = Math.min(mw, this.mw), ch = Math.min(mh, this.mh);
      for (let y = 0; y < ch; y++) next.set(this.clarity.subarray(y * this.mw, y * this.mw + cw), y * mw);
    }
    Object.assign(this, { W: width, H: height, dpr, cell, mw, mh, clarity: next });
    this.fresh = new Float32Array(mw * mh);

    // Rain film returns in patches, not uniformly.
    const rand = mulberry32(5);
    const coarse = valueNoise(mw, mh, Math.max(6, Math.round(70 / cell)), rand);
    const fine = valueNoise(mw, mh, Math.max(2, Math.round(10 / cell)), rand);
    this.decay = new Float32Array(mw * mh);
    for (let i = 0; i < this.decay.length; i++) this.decay[i] = 0.55 + 0.7 * coarse[i] + 0.35 * (fine[i] - 0.5);

    // Two tandem wipers pivoting just below the glass. The driver's blade is long enough to
    // reach every corner; the passenger blade covers the patch right around the driver's pivot.
    const py = height * 1.03;
    const left = { x: width * 0.2, y: py };
    left.R = Math.hypot(width - left.x, py) * 1.02;
    const right = { x: width * 0.66, y: py, R: left.R * 0.78 };
    this.blades = [left, right].map((b) => {
      const ang = new Float32Array(mw * mh), rad = new Float32Array(mw * mh);
      for (let j = 0; j < mh; j++) {
        const dy = b.y - (j + 0.5) * cell;
        for (let i = 0; i < mw; i++) {
          const dx = (i + 0.5) * cell - b.x;
          ang[j * mw + i] = Math.atan2(dy, dx);
          rad[j * mw + i] = Math.hypot(dx, dy);
        }
      }
      return { ...b, rIn: b.R * 0.08, ang, rad };
    });

    this.mask = makeCanvas(mw, mh);
    this.maskCtx = this.mask.getContext('2d');
    this.maskImg = this.maskCtx.createImageData(mw, mh);
    const d = this.maskImg.data;
    for (let i = 0; i < d.length; i += 4) d[i] = d[i + 1] = d[i + 2] = 255;

    this.backdrop = paintStreet(width, height, dpr);
    this.film = paintRainFilm(this.backdrop, width, height, dpr);
    this.work = makeCanvas(width * dpr, height * dpr);
    this.workCtx = this.work.getContext('2d');
  }

  setFadeSeconds(s) { this.fadeSeconds = s; }
  setPaused(p) { this.paused = p; }

  // How long between wiper passes: intermittent, quicker on the faster speeds.
  interval() { return Math.max(5, this.fadeSeconds * 0.7); }

  // ---------------------------------------------------------------- strokes
  radiusFor(info, speed) {
    const r = info.pointerType === 'pen' ? 3 + 5 * (info.pressure || 0.5)
            : info.pointerType === 'mouse' ? 8 : 10;
    return r * (1 - Math.min(0.3, speed / 4000));
  }

  strokeStart(id, x, y, info) {
    const r = this.radiusFor(info, 0);
    this.strokes.set(id, { x, y, r, t: info.time });
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
    Object.assign(s, { x, y, r, t: info.time });
  }

  strokeEnd(id) { this.strokes.delete(id); }

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

  // ---------------------------------------------------------------- rain
  // A raindrop lands: knock clarity down in a small disc, so cleared lines fill back in
  // as a speckle of beads rather than a uniform fade.
  landDrop(x, y, r, maps) {
    const { cell, mw, mh } = this;
    const inv = 1 / cell;
    const minX = Math.max(0, Math.floor((x - r) * inv)), maxX = Math.min(mw - 1, Math.ceil((x + r) * inv));
    const minY = Math.max(0, Math.floor((y - r) * inv)), maxY = Math.min(mh - 1, Math.ceil((y + r) * inv));
    for (let j = minY; j <= maxY; j++) {
      const py = (j + 0.5) * cell;
      for (let i = minX; i <= maxX; i++) {
        const px = (i + 0.5) * cell;
        const dist = Math.hypot(px - x, py - y);
        if (dist >= r) continue;
        const hit = DROP_HIT * (1 - smoothstep(r * 0.5, r, dist));
        const k = j * mw + i;
        for (const m of maps) if (m[k] > 0) m[k] = Math.max(0, m[k] - hit);
      }
    }
  }

  rain(dt, maps) {
    // Enough drops that a cleared line gets about 1.2 hits per fade period.
    const rate = (this.W * this.H) / (Math.PI * 16) * 1.2 / this.fadeSeconds;
    this.dropDebt += rate * dt;
    const n = Math.min(400, this.dropDebt | 0);
    this.dropDebt -= n;
    const rand = this.rand;
    for (let k = 0; k < n; k++) this.landDrop(rand() * this.W, rand() * this.H, 2 + rand() * rand() * 5, maps);
  }

  // ---------------------------------------------------------------- wipers
  clear() {
    this.strokes.clear();
    this.startSweep(0.55);
  }

  startSweep(leg = 0.75) {
    if (this.sweep) return;
    this.sweep = { t: 0, up: leg, rest: 0.12, down: leg, a: PARK };
    this.timer = 0;
  }

  bladeAngle(sw) {
    const t = sw.t;
    if (t < sw.up) return PARK + (END - PARK) * easeInOut(t / sw.up);
    if (t < sw.up + sw.rest) return END;
    const p = Math.min(1, (t - sw.up - sw.rest) / sw.down);
    return END + (PARK - END) * easeInOut(p);
  }

  // Everything the blades passed over since last frame is wiped clean.
  advanceSweep(dt) {
    const sw = this.sweep;
    sw.t += dt;
    const a0 = sw.a, a1 = this.bladeAngle(sw);
    sw.a = a1;
    let lo = Math.min(a0, a1), hi = Math.max(a0, a1);
    // At either end of the stroke, take in the strip below the blade's resting line too.
    if (lo <= PARK + 1e-4) lo = -1;
    if (hi >= END - 1e-4) hi = 4;
    if (hi - lo > 1e-5) {
      const { clarity, fresh } = this;
      for (const b of this.blades) {
        const { ang, rad, rIn, R } = b;
        for (let k = 0; k < ang.length; k++) {
          const a = ang[k];
          if (a < lo || a > hi) continue;
          const r = rad[k];
          if (r < rIn || r > R) continue;
          clarity[k] = 0;
          fresh[k] = 1 + HOLD * 0.5;
        }
      }
    }
    if (sw.t >= sw.up + sw.rest + sw.down) { this.sweep = null; this.timer = 0; }
  }

  // ---------------------------------------------------------------- time
  update(dt) {
    const { clarity, fresh, decay } = this;
    let drawing = false, beading = false;

    if (!this.paused) {
      const rate = ((1 + HOLD) / (this.fadeSeconds * 1.8)) * dt;
      for (let i = 0; i < clarity.length; i++) {
        const c = clarity[i];
        if (c > 0) {
          const n = c - rate * decay[i];
          clarity[i] = n > 0 ? n : 0;
          drawing = true;
        }
      }
    }
    // Freshly wiped glass beads up on its own, even while holding.
    const remist = ((1 + HOLD) / REMIST) * dt;
    for (let i = 0; i < fresh.length; i++) {
      const f = fresh[i];
      if (f > 0) {
        const n = f - remist * decay[i];
        fresh[i] = n > 0 ? n : 0;
        beading = true;
      }
    }
    if (drawing || beading) this.rain(dt, this.paused ? [fresh] : [clarity, fresh]);

    const drafting = this.applyDrafts();
    if (this.sweep) this.advanceSweep(dt);
    else if (!this.paused && (drawing || drafting)) {
      this.timer += dt;
      if (this.timer >= this.interval()) this.startSweep();
    } else if (!drawing && !drafting) this.timer = 0;

    return drawing || beading || drafting || !!this.sweep;
  }

  // ---------------------------------------------------------------- draw
  render(ctx) {
    const { clarity, fresh, maskImg, dpr } = this;
    const data = maskImg.data;
    for (let i = 0, k = 3; i < clarity.length; i++, k += 4) {
      let c = clarity[i] > fresh[i] ? clarity[i] : fresh[i];
      if (c > 1) c = 1;
      data[k] = 255 - ((c * c * (3 - 2 * c)) * 255) | 0;
    }
    this.maskCtx.putImageData(maskImg, 0, 0);

    const g = this.workCtx;
    g.globalCompositeOperation = 'copy';
    g.imageSmoothingEnabled = true;
    g.imageSmoothingQuality = 'high';
    g.drawImage(this.mask, 0, 0, this.mw * this.cell * dpr, this.mh * this.cell * dpr);
    g.globalCompositeOperation = 'source-in';
    g.drawImage(this.film, 0, 0);
    g.globalCompositeOperation = 'source-over';

    ctx.setTransform(1, 0, 0, 1, 0, 0);
    ctx.drawImage(this.backdrop, 0, 0);
    ctx.drawImage(this.work, 0, 0);

    ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
    this.drawBlades(ctx, this.sweep ? this.sweep.a : PARK);
    ctx.setTransform(1, 0, 0, 1, 0, 0);
  }

  drawBlades(ctx, a) {
    const ux = Math.cos(a), uy = -Math.sin(a);
    ctx.lineCap = 'round';
    for (const b of this.blades) {
      const at = (r) => [b.x + ux * r, b.y + uy * r];
      const [ax, ay] = at(b.R * 0.62);
      // Arm: from the pivot up to the blade's mounting point.
      ctx.strokeStyle = '#0d1014';
      ctx.lineWidth = 5;
      ctx.beginPath(); ctx.moveTo(b.x, b.y); ctx.lineTo(ax, ay); ctx.stroke();
      // Blade: rubber squeegee along the arm, with a wet highlight on its leading edge.
      const [sx, sy] = at(b.rIn * 1.4), [ex, ey] = at(b.R * 0.985);
      ctx.strokeStyle = '#07090b';
      ctx.lineWidth = 8;
      ctx.beginPath(); ctx.moveTo(sx, sy); ctx.lineTo(ex, ey); ctx.stroke();
      const nx = -uy * 3, ny = ux * 3;
      ctx.strokeStyle = 'rgba(170,190,210,0.35)';
      ctx.lineWidth = 1.2;
      ctx.beginPath(); ctx.moveTo(sx + nx, sy + ny); ctx.lineTo(ex + nx, ey + ny); ctx.stroke();
    }
  }

  // Pre-wipe a handwritten hint so the mechanic explains itself.
  intro(text, opts = {}) {
    this.stampText(text, opts).overlay.apply();
  }

  stampText(text, opts) {
    const { mw, mh, cell, W, H, clarity } = this;
    const c = makeCanvas(mw, mh), g = c.getContext('2d');
    g.scale(1 / cell, 1 / cell);
    const { lay, place } = layoutFor(g, text, opts, { W, H, size: Math.min(W * 0.15, 76) });
    g.fillStyle = g.strokeStyle = '#fff';
    drawText(g, lay, place, Math.max(2.5, lay.size * 0.07));
    const px = g.getImageData(0, 0, mw, mh).data;
    const overlay = new TextOverlay();
    for (let j = 1; j < mh - 1; j++) {
      for (let i = 1; i < mw - 1; i++) {
        let sum = 0;
        for (let dy = -1; dy <= 1; dy++) for (let dx = -1; dx <= 1; dx++) sum += px[((j + dy) * mw + i + dx) * 4 + 3];
        const v = smoothstep(0.15, 0.75, sum / (9 * 255)) * (1 + HOLD * 1.6);
        if (v > 0) overlay.put(clarity, j * mw + i, v);
      }
    }
    return { overlay, lay, place };
  }
}

// ------------------------------------------------------------------ scenery
// The view through the glass: a wet city street at night, traffic lights and tail lights ahead.
function paintStreet(W, H, dpr) {
  const rand = mulberry32(808);
  const c = makeCanvas(W * dpr, H * dpr), g = c.getContext('2d');
  g.scale(dpr, dpr);
  const hz = H * 0.5, vx = W * 0.5;

  const sky = g.createLinearGradient(0, 0, 0, hz);
  sky.addColorStop(0, '#0a1020');
  sky.addColorStop(1, '#2a2840');
  g.fillStyle = sky;
  g.fillRect(0, 0, W, hz);
  const road = g.createLinearGradient(0, hz, 0, H);
  road.addColorStop(0, '#1c1c26');
  road.addColorStop(1, '#0b0c10');
  g.fillStyle = road;
  g.fillRect(0, hz, W, H - hz);

  // Buildings on both sides with a scatter of lit windows.
  for (const side of [-1, 1]) {
    for (let n = 0; n < 7; n++) {
      const d = 0.25 + n * 0.11;                       // distance toward the vanishing point
      const x0 = vx + side * W * (0.62 - d * 0.55);
      const bw = W * (0.2 - d * 0.12) * (0.8 + rand() * 0.5);
      const top = hz - H * (0.32 - d * 0.22) * (0.6 + rand() * 0.7);
      const bx = side < 0 ? x0 - bw : x0;
      g.fillStyle = `rgb(${14 + n * 3},${15 + n * 3},${26 + n * 3})`;
      g.fillRect(bx, top, bw, hz - top + 2);
      for (let wy = top + 6; wy < hz - 6; wy += 9 - d * 4) {
        for (let wx = bx + 4; wx < bx + bw - 4; wx += 8 - d * 4) {
          if (rand() < 0.22) {
            g.fillStyle = rand() < 0.7 ? 'rgba(255,205,130,0.75)' : 'rgba(170,210,255,0.6)';
            g.fillRect(wx, wy, 3 - d * 1.5, 4 - d * 2);
          }
        }
      }
    }
  }

  // Road edges and lane dashes converging on the horizon.
  g.strokeStyle = 'rgba(200,200,190,0.25)';
  g.lineWidth = 2;
  for (const s of [-1, 1]) { g.beginPath(); g.moveTo(vx + s * 6, hz); g.lineTo(vx + s * W * 0.9, H); g.stroke(); }
  g.fillStyle = 'rgba(235,225,180,0.45)';
  for (let t = 0.06; t < 1; t *= 1.55) {
    const y0 = hz + (H - hz) * t, y1 = hz + (H - hz) * t * 1.25;
    const w0 = 1 + t * 5, w1 = 1 + t * 1.25 * 5;
    g.beginPath(); g.moveTo(vx - w0, y0); g.lineTo(vx + w0, y0); g.lineTo(vx + w1, y1); g.lineTo(vx - w1, y1); g.fill();
  }

  const glow = (x, y, r, col, a) => {
    const gr = g.createRadialGradient(x, y, 0, x, y, r);
    gr.addColorStop(0, `rgba(${col},${a})`);
    gr.addColorStop(0.25, `rgba(${col},${a * 0.35})`);
    gr.addColorStop(1, `rgba(${col},0)`);
    g.fillStyle = gr;
    g.beginPath(); g.arc(x, y, r, 0, Math.PI * 2); g.fill();
  };
  // Wet-road reflection: a vertical smear of light under each lamp.
  const reflect = (x, y, len, col, a) => {
    const gr = g.createLinearGradient(0, hz, 0, hz + len);
    gr.addColorStop(0, `rgba(${col},${a})`);
    gr.addColorStop(1, `rgba(${col},0)`);
    g.fillStyle = gr;
    g.fillRect(x - 2.5, hz + (y - hz) * 0.1, 5, len);
  };

  // Street lamps receding along both sides.
  for (const s of [-1, 1]) {
    for (let n = 0; n < 6; n++) {
      const t = 1 / (1 + n * 0.9);
      const x = vx + s * W * 0.55 * t, y = hz - H * 0.28 * t;
      glow(x, y, 50 * t + 8, '255,180,90', 0.9);
      glow(x, y, 4 * t + 1.5, '255,235,200', 1);
      reflect(x, y, (H - hz) * 0.7 * t, '255,170,80', 0.22);
    }
  }
  // Tail lights of the cars ahead, and a green signal.
  for (let n = 0; n < 4; n++) {
    const t = 0.18 + n * 0.12 + rand() * 0.05;
    const x = vx + (rand() - 0.5) * W * 0.25 * t, y = hz + (H - hz) * t * 0.45;
    const sep = W * 0.16 * t;
    for (const s of [-1, 1]) {
      glow(x + s * sep, y, 22 * t + 6, '255,40,40', 0.85);
      glow(x + s * sep, y, 2.5 * t + 1.2, '255,180,170', 1);
      reflect(x + s * sep, y, (H - hz) * 0.5 * t + 20, '255,40,40', 0.25);
    }
  }
  glow(vx + W * 0.08, hz - H * 0.12, 26, '80,255,150', 0.8);
  glow(vx + W * 0.08, hz - H * 0.12, 3, '220,255,230', 1);

  // Inside the car: a darker band at the bottom where the dash would be.
  const dash = g.createLinearGradient(0, H * 0.82, 0, H);
  dash.addColorStop(0, 'rgba(0,0,0,0)');
  dash.addColorStop(1, 'rgba(0,0,0,0.6)');
  g.fillStyle = dash;
  g.fillRect(0, H * 0.82, W, H * 0.18);
  return c;
}

// The rain film: the street smeared out of focus, a cool haze, and a field of beaded drops
// that catch the lights behind them.
function paintRainFilm(backdrop, W, H, dpr) {
  const rand = mulberry32(31);
  const c = makeCanvas(W * dpr, H * dpr), g = c.getContext('2d');
  const tiny = makeCanvas(W / 22, H / 22), tg = tiny.getContext('2d');
  tg.drawImage(backdrop, 0, 0, tiny.width, tiny.height);
  g.imageSmoothingEnabled = true;
  g.imageSmoothingQuality = 'high';
  g.drawImage(tiny, 0, 0, c.width, c.height);
  g.scale(dpr, dpr);

  const haze = g.createLinearGradient(0, 0, 0, H);
  haze.addColorStop(0, 'rgba(120,135,165,0.42)');
  haze.addColorStop(1, 'rgba(90,100,125,0.40)');
  g.fillStyle = haze;
  g.fillRect(0, 0, W, H);

  // Drops pick up the colour of whatever light is behind them.
  const px = tg.getImageData(0, 0, tiny.width, tiny.height).data;
  const lightAt = (x, y) => {
    const i = (clamp((y / 22) | 0, 0, tiny.height - 1) * tiny.width + clamp((x / 22) | 0, 0, tiny.width - 1)) * 4;
    return [px[i], px[i + 1], px[i + 2]];
  };
  const drop = (x, y, r) => {
    const [lr, lg, lb] = lightAt(x, y);
    const lum = (lr + lg + lb) / 765;
    g.fillStyle = 'rgba(10,14,24,0.30)';
    g.beginPath(); g.arc(x, y + r * 0.15, r, 0, Math.PI * 2); g.fill();
    g.fillStyle = `rgba(${Math.min(255, lr * 2 + 60)},${Math.min(255, lg * 2 + 60)},${Math.min(255, lb * 2 + 70)},${Math.min(0.9, (0.2 + lum * 0.9) * Math.min(1, r / 1.5))})`;
    g.beginPath(); g.arc(x, y + r * 0.3, r * 0.55, 0, Math.PI * 2); g.fill();
    if (r > 1.2) {
      g.fillStyle = 'rgba(255,255,255,0.7)';
      g.beginPath(); g.arc(x - r * 0.3, y - r * 0.35, r * 0.25, 0, Math.PI * 2); g.fill();
    }
  };
  const fine = Math.round((W * H) / 45);
  for (let n = 0; n < fine; n++) drop(rand() * W, rand() * H, 0.5 + rand() * rand() * 1.8);
  const big = Math.round((W * H) / 1400);
  for (let n = 0; n < big; n++) drop(rand() * W, rand() * H, 2.5 + rand() * rand() * 5);
  return c;
}

Object.assign(Windshield.prototype, draftMethods);
