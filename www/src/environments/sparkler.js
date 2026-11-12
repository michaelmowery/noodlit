// Sparkler: a Fade environment.
//   Look:  a backyard at dusk on a summer night. You write with a lit sparkler: the tip
//          fizzes and throws branching sparks, and the trail burns white-hot.
//   Decay: the trail cools from white to gold to a dull red ember, then goes out, sending up
//          thin curls of smoke that drift away.
//   Clear: dunk it in the bucket: a hiss and a puff of steam, and the night is dark again.

import { clamp, mulberry32, makeCanvas } from '../lib/util.js';
import { MapFade, stageCanvas, blob } from '../lib/fade.js';
import { sfx } from '../lib/sound.js';

export const sparkler = {
  id: 'sparkler',
  name: 'Sparkler',
  blurb: 'Sizzling trails cool to embers and smoke',
  surface: 'Summer night to write on with a sparkler',
  clearLabel: 'Dunk it',
  clearIcon: 'M5 10h14l-1.5 10h-11zM8 10V7M12 10V4M16 10V7',
  create: () => new Sparkler(),
};

// Temperature ramp: 0 = out, 1 = white hot.
const RAMP = [
  [0.0, [90, 20, 10, 0]],
  [0.12, [140, 30, 10, 0.55]],
  [0.35, [230, 80, 20, 0.85]],
  [0.65, [255, 170, 60, 0.95]],
  [0.9, [255, 235, 180, 1]],
  [1.0, [255, 255, 245, 1]],
];
const LUT = (() => {
  const lut = new Uint8ClampedArray(256 * 4);
  for (let n = 0; n < 256; n++) {
    const v = n / 255;
    let i = 0;
    while (i < RAMP.length - 2 && v > RAMP[i + 1][0]) i++;
    const [a, ca] = RAMP[i], [b, cb] = RAMP[i + 1];
    const t = clamp((v - a) / (b - a), 0, 1);
    for (let k = 0; k < 4; k++) lut[n * 4 + k] = (ca[k] + (cb[k] - ca[k]) * t) * (k === 3 ? 255 : 1);
  }
  return lut;
})();

class Sparkler extends MapFade {
  constructor() {
    super({ brush: 3.2, soft: 0.3, edgeFirst: 0.15, seed: 97, textWeight: 400 });
    this.textLine = 0.05;
    this.sparks = [];
    this.smoke = [];
    this.tips = new Set();
    this.steam = 0;
  }

  paintBase() { return paintYard(this.W, this.H, this.dpr); }
  paintLayer() { return null; }

  setup() {
    this.glow = makeCanvas(Math.ceil(this.mw / 4), Math.ceil(this.mh / 4));
    this.glowCtx = this.glow.getContext('2d');
  }

  onStrokeStart(s) { this.tips.add(s); }
  onStrokeEnd(s) { this.tips.delete(s); }
  onStrokeMove(s, x, y, d) {
    const n = 1 + Math.min(5, d / 5);
    for (let i = 0; i < n; i++) this.spark(x, y, 1);
  }

  spark(x, y, gen) {
    if (this.sparks.length > 320) return;
    const a = Math.random() * Math.PI * 2, v = (gen === 1 ? 70 : 40) + Math.random() * (gen === 1 ? 180 : 90);
    this.sparks.push({ x, y, vx: Math.cos(a) * v, vy: Math.sin(a) * v, t: 0, life: gen === 1 ? 0.18 + Math.random() * 0.25 : 0.1 + Math.random() * 0.15, gen });
  }

  updateFx(dt) {
    const born = [];
    for (const s of this.sparks) {
      s.t += dt; s.vy += 120 * dt;
      s.x += s.vx * dt; s.y += s.vy * dt;
      // A first-generation spark bursts into a little star of smaller ones.
      if (s.gen === 1 && s.t >= s.life) for (let k = 0; k < 3; k++) born.push([s.x, s.y]);
    }
    this.sparks = this.sparks.filter((s) => s.t < s.life);
    for (const [x, y] of born) this.spark(x, y, 2);

    // Smoke curls up from trails that are just going out.
    if (this.alive && !this.paused && this.smoke.length < 60 && Math.random() < dt * 5) {
      for (let n = 0; n < 8; n++) {
        const x = Math.random() * this.W, y = Math.random() * this.H, v = this.valueAt(x, y);
        if (v > 0.04 && v < 0.25) { this.smoke.push({ x, y, t: 0, life: 2.2 + Math.random() * 1.5, drift: 8 + Math.random() * 16 }); break; }
      }
    }
    for (const w of this.smoke) w.t += dt;
    this.smoke = this.smoke.filter((w) => w.t < w.life);
    if (this.steam > 0) this.steam = Math.max(0, this.steam - dt * 0.7);
    return this.sparks.length > 0 || this.smoke.length > 0 || this.tips.size > 0 || this.steam > 0;
  }

  clear() {
    sfx.cue('hiss');
    this.strokes.clear();
    this.tips.clear();
    this.commitDraft?.();
    this.sparks = [];
    this.steam = 1;
    this.clearing = { t: 0, dur: 0.5 };
  }

  clearStep(cl) {
    // Smoke rises from the trails as they're snuffed out.
    if (cl.t < 0.1) {
      for (let n = 0; n < 40 && this.smoke.length < 120; n++) {
        const x = Math.random() * this.W, y = Math.random() * this.H;
        if (this.valueAt(x, y) > 0.1) this.smoke.push({ x, y, t: 0, life: 1.6 + Math.random(), drift: 10 + Math.random() * 20 });
      }
    }
    this.scaleCells(() => 0.75);
    if (cl.t >= cl.dur) { this.map.fill(0); return false; }
    return true;
  }

  render(ctx) {
    const { map, maskImg, dpr, mw, mh, cell } = this;
    const data = maskImg.data;
    for (let i = 0, k = 0; i < map.length; i++, k += 4) {
      const c = map[i];
      if (c <= 0) { data[k + 3] = 0; continue; }
      // Fresh trails hold white-hot through the hold, then cool along the ramp.
      const n = (clamp(c, 0, 1) * 255) | 0;
      data[k] = LUT[n * 4]; data[k + 1] = LUT[n * 4 + 1]; data[k + 2] = LUT[n * 4 + 2]; data[k + 3] = LUT[n * 4 + 3];
    }
    this.maskCtx.putImageData(maskImg, 0, 0);
    ctx.setTransform(1, 0, 0, 1, 0, 0);
    ctx.drawImage(this.base, 0, 0);
    ctx.save();
    ctx.imageSmoothingEnabled = true;
    ctx.imageSmoothingQuality = 'high';
    ctx.globalCompositeOperation = 'lighter';
    // Glow: the same trail, shrunk and blown back up so it blurs.
    const gg = this.glowCtx;
    gg.clearRect(0, 0, this.glow.width, this.glow.height);
    gg.imageSmoothingEnabled = true;
    gg.drawImage(this.mask, 0, 0, this.glow.width, this.glow.height);
    ctx.globalAlpha = 0.9;
    ctx.drawImage(this.glow, -2 * cell * dpr, -2 * cell * dpr, mw * cell * dpr * 1.0 + 4 * cell * dpr, mh * cell * dpr + 4 * cell * dpr);
    ctx.globalAlpha = 1;
    ctx.drawImage(this.mask, 0, 0, mw * cell * dpr, mh * cell * dpr);
    ctx.restore();

    ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
    for (const w of this.smoke) {
      const k = w.t / w.life;
      const a = Math.sin(k * Math.PI) * 0.16;
      const x = w.x + Math.sin(w.t * 2 + w.x) * 6 + w.drift * k, y = w.y - k * 70;
      blob(ctx, x, y, 6 + k * 18, 10 + k * 26, `rgba(190,190,205,${a})`);
    }
    ctx.save();
    ctx.globalCompositeOperation = 'lighter';
    ctx.lineCap = 'round';
    for (const s of this.sparks) {
      const k = 1 - s.t / s.life;
      ctx.strokeStyle = s.gen === 1 ? `rgba(255,236,170,${k})` : `rgba(255,190,90,${k})`;
      ctx.lineWidth = s.gen === 1 ? 1.4 : 1;
      ctx.beginPath(); ctx.moveTo(s.x, s.y); ctx.lineTo(s.x - s.vx * 0.025, s.y - s.vy * 0.025); ctx.stroke();
    }
    for (const t of this.tips) {
      blob(ctx, t.x, t.y, 26, 26, 'rgba(255,220,150,0.35)');
      blob(ctx, t.x, t.y, 9, 9, 'rgba(255,255,240,0.9)');
    }
    ctx.restore();
    if (this.steam > 0) {
      const k = this.steam;
      blob(ctx, this.W / 2, this.H * (0.55 + (1 - k) * -0.2), this.W * 0.5, this.H * 0.3, `rgba(200,205,215,${k * 0.35})`);
    }
    ctx.setTransform(1, 0, 0, 1, 0, 0);
  }
}

// A backyard just after sunset: deep blue sky with the last glow low down, tree and fence
// silhouettes, and a few fireflies.
function paintYard(W, H, dpr) {
  const rand = mulberry32(44);
  const { c, g } = stageCanvas(W, H, dpr);
  const sky = g.createLinearGradient(0, 0, 0, H);
  sky.addColorStop(0, '#070a1c');
  sky.addColorStop(0.55, '#141b3c');
  sky.addColorStop(0.78, '#2b2547');
  sky.addColorStop(0.9, '#43304a');
  g.fillStyle = sky; g.fillRect(0, 0, W, H);
  for (let i = 0; i < (W * H) / 5000; i++) {
    g.fillStyle = `rgba(255,255,255,${0.15 + rand() * 0.4})`;
    g.beginPath(); g.arc(rand() * W, rand() * H * 0.5, 0.4 + rand() * 0.6, 0, Math.PI * 2); g.fill();
  }
  // Treeline.
  g.fillStyle = '#05070e';
  g.beginPath(); g.moveTo(0, H);
  for (let x = 0; x <= W + 12; x += 12) g.lineTo(x, H * 0.8 - Math.abs(Math.sin(x * 0.021)) * H * 0.07 - rand() * H * 0.02);
  g.lineTo(W, H); g.closePath(); g.fill();
  // Fence.
  g.fillStyle = '#0a0c16';
  for (let x = 4; x < W; x += 16) g.fillRect(x, H * 0.86, 10, H * 0.14);
  g.fillRect(0, H * 0.89, W, 4);
  // Grass.
  g.fillStyle = '#04060b';
  g.fillRect(0, H * 0.94, W, H * 0.06);
  for (let i = 0; i < 9; i++) blob(g, rand() * W, H * (0.6 + rand() * 0.3), 5, 5, 'rgba(210,255,140,0.35)');
  return c;
}
