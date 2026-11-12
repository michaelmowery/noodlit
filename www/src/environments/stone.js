// Water on hot stone: a Fade environment.
//   Look:  you paint with water on a sun-warmed slate; wet stone goes dark and glossy.
//   Decay: the water evaporates from the thin edges in, so lines shrink as they dry, and a
//          wisp of vapour curls up now and then.
//   Clear: the sun breaks through: a warm glare sweeps across and dries everything at once.

import { clamp, easeInOut, mulberry32, makeCanvas, valueNoise } from '../lib/util.js';
import { MapFade, stageCanvas, mottle, speckle, blob } from '../lib/fade.js';
import { sfx } from '../lib/sound.js';

export const stone = {
  id: 'stone',
  name: 'Water on hot stone',
  blurb: 'Paint with water; the sun dries it',
  surface: 'Warm slate to paint on with water',
  clearLabel: 'Sunshine',
  clearIcon: 'M12 8a4 4 0 1 0 0 8 4 4 0 0 0 0-8zM12 2v2M12 20v2M4.9 4.9l1.4 1.4M17.7 17.7l1.4 1.4M2 12h2M20 12h2M4.9 19.1l1.4-1.4M17.7 6.3l1.4-1.4',
  create: () => new Stone(),
};

class Stone extends MapFade {
  constructor() {
    super({ brush: 13, edgeFirst: 0.6, soft: 0.45, seed: 41, textWeight: 500 });
    this.textLine = 0.12;
    this.wisps = [];
  }

  paintBase() { return paintSlate(this.W, this.H, this.dpr); }

  // Wet stone: darker, a little cooler, with a soft sheen of sky.
  paintLayer() {
    const { W, H, dpr } = this;
    const { c, g } = stageCanvas(W, H, dpr);
    g.drawImage(this.base, 0, 0, W, H);
    g.fillStyle = 'rgba(12,16,22,0.55)';
    g.fillRect(0, 0, W, H);
    const sheen = g.createLinearGradient(0, 0, W, H);
    sheen.addColorStop(0, 'rgba(170,200,230,0.16)');
    sheen.addColorStop(0.5, 'rgba(170,200,230,0.04)');
    sheen.addColorStop(1, 'rgba(255,230,190,0.1)');
    g.fillStyle = sheen; g.fillRect(0, 0, W, H);
    return c;
  }

  onStrokeMove(s, x, y) {
    if (Math.random() < 0.04) this.wisps.push({ x, y, t: 0, life: 1.6 + Math.random(), drift: (Math.random() - 0.5) * 20 });
  }

  updateFx(dt) {
    if (this.alive && !this.paused && Math.random() < dt * 1.2) {
      // Vapour rises from somewhere that's still wet.
      for (let n = 0; n < 6; n++) {
        const x = Math.random() * this.W, y = Math.random() * this.H;
        if (this.valueAt(x, y) > 0.3) { this.wisps.push({ x, y, t: 0, life: 1.6 + Math.random(), drift: (Math.random() - 0.5) * 20 }); break; }
      }
    }
    for (const w of this.wisps) w.t += dt;
    this.wisps = this.wisps.filter((w) => w.t < w.life);
    return this.wisps.length > 0;
  }

  clear() {
    sfx.cue('sizzle');
    this.strokes.clear();
    this.clearing = { t: 0, dur: 1.6 };
    for (let i = 0; i < 18; i++) this.wisps.push({ x: Math.random() * this.W, y: Math.random() * this.H, t: -Math.random() * 0.8, life: 1.8, drift: (Math.random() - 0.5) * 30 });
  }

  clearStep(cl) {
    const p = Math.min(1, cl.t / cl.dur);
    const soft = 220;
    cl.front = -soft + (this.W + soft * 2) * easeInOut(p);
    const f = cl.front;
    this.scaleCells((x, y) => clamp((x + y * 0.3 - f) / soft, 0, 1));
    if (p >= 1) { this.map.fill(0); return false; }
    return true;
  }

  drawFx(ctx) {
    for (const w of this.wisps) {
      if (w.t < 0) continue;
      const k = w.t / w.life;
      const a = Math.sin(k * Math.PI) * 0.22;
      const x = w.x + Math.sin(w.t * 3 + w.x) * 6 + w.drift * k, y = w.y - k * 60;
      blob(ctx, x, y, 10 + k * 16, 14 + k * 22, `rgba(255,255,255,${a})`);
    }
    const cl = this.clearing;
    if (cl) {
      const f = cl.front, { W, H } = this;
      const glare = ctx.createLinearGradient(f - 260, 0, f + 140, 0);
      const k = Math.sin(Math.min(1, cl.t / cl.dur) * Math.PI);
      glare.addColorStop(0, 'rgba(255,220,150,0)');
      glare.addColorStop(0.75, `rgba(255,236,190,${0.45 * k})`);
      glare.addColorStop(1, 'rgba(255,220,150,0)');
      ctx.fillStyle = glare; ctx.fillRect(0, 0, W, H);
    }
  }
}

// A flat slab of warm grey slate in afternoon sun, with a mossy pebble border.
function paintSlate(W, H, dpr) {
  const rand = mulberry32(19);
  const { c, g } = stageCanvas(W, H, dpr);
  g.fillStyle = '#6f7276';
  g.fillRect(0, 0, W, H);
  // Layered bands, as slate splits.
  const bands = makeCanvas(Math.ceil(W / 4), Math.ceil(H / 4)), bg = bands.getContext('2d');
  const img = bg.createImageData(bands.width, bands.height);
  const n = valueNoise(bands.width, bands.height, 18, rand), m = valueNoise(bands.width, bands.height, 4, rand);
  for (let j = 0; j < bands.height; j++) {
    for (let i = 0; i < bands.width; i++) {
      const k = j * bands.width + i;
      const v = Math.sin((i * 0.05 + j * 0.018) * 3 + n[k] * 2.2) * 0.5 + 0.5;
      const t = v * 0.7 + m[k] * 0.3;
      img.data[k * 4] = 84 + t * 44; img.data[k * 4 + 1] = 86 + t * 42; img.data[k * 4 + 2] = 92 + t * 44;
      img.data[k * 4 + 3] = 255;
    }
  }
  bg.putImageData(img, 0, 0);
  g.imageSmoothingEnabled = true;
  g.drawImage(bands, 0, 0, W, H);
  mottle(g, W, H, rand, { light: 22, dark: 22, scale: 5 });
  speckle(g, W, H, rand, (W * H) / 40, 'rgba(40,36,34,0.3)', 0.9);
  speckle(g, W, H, rand, (W * H) / 90, 'rgba(230,220,205,0.25)', 0.8);
  // Pebbles and moss peeking in at the corners.
  for (let i = 0; i < 26; i++) {
    const corner = i % 2;
    const x = corner ? W - rand() * W * 0.22 : rand() * W * 0.2;
    const y = corner ? rand() * H * 0.12 : H - rand() * H * 0.1;
    g.fillStyle = `hsl(${30 + rand() * 20},${8 + rand() * 10}%,${55 + rand() * 25}%)`;
    g.beginPath(); g.ellipse(x, y, 8 + rand() * 12, 6 + rand() * 8, rand() * 3, 0, Math.PI * 2); g.fill();
  }
  blob(g, 0, H, W * 0.25, H * 0.12, 'rgba(70,110,50,0.55)');
  blob(g, W, 0, W * 0.25, H * 0.1, 'rgba(70,110,50,0.5)');
  // Warm afternoon light with soft leaf shadows.
  const sun = g.createRadialGradient(W * 0.75, H * 0.2, 0, W * 0.75, H * 0.2, Math.max(W, H));
  sun.addColorStop(0, 'rgba(255,225,170,0.28)');
  sun.addColorStop(1, 'rgba(60,40,30,0.18)');
  g.fillStyle = sun; g.fillRect(0, 0, W, H);
  for (let i = 0; i < 7; i++) blob(g, rand() * W, rand() * H, 40 + rand() * 60, 30 + rand() * 40, 'rgba(30,25,20,0.12)');
  return c;
}
