// Tide pool: a Fade environment.
//   Look:  firm wet sand at the rim of a rock pool, with shells, pebbles and a strand of kelp.
//          Your finger presses a groove into the sand.
//   Decay: water seeps into the grooves from the pool side first: they fill with a glassy
//          shimmer, then the sand slumps and the lines soften away.
//   Clear: the tide rises: the pool brims over, slides across the sand and draws back,
//          leaving it smooth.

import { clamp, easeInOut, mulberry32, makeCanvas } from '../lib/util.js';
import { MapFade, stageCanvas, blob, mottle, speckle } from '../lib/fade.js';
import { sfx } from '../lib/sound.js';

export const tidepool = {
  id: 'tidepool',
  name: 'Tide pool',
  blurb: 'Water seeps into lines in the wet sand',
  surface: 'Wet sand at the edge of a tide pool to draw in',
  clearLabel: 'Tide in',
  clearIcon: 'M3 9c2-2 4-2 6 0s4 2 6 0 4-2 6 0M3 15c2-2 4-2 6 0s4 2 6 0 4-2 6 0',
  create: () => new TidePool(),
};

const POOL = 0.24; // the pool fills the top of the screen down to about here

class TidePool extends MapFade {
  constructor() {
    super({ brush: 9, soft: 0.5, edgeFirst: 0.2, seed: 83, textWeight: 500 });
    this.textLine = 0.1;
  }

  setup() {
    this.mask2 = makeCanvas(this.mw, this.mh);
    this.mask2Ctx = this.mask2.getContext('2d');
    this.mask2Img = this.mask2Ctx.createImageData(this.mw, this.mh);
    const d = this.mask2Img.data;
    for (let i = 0; i < d.length; i += 4) d[i] = d[i + 1] = d[i + 2] = 255;
    this.water = paintPoolWater(this.W, this.H, this.dpr);
    this.shells = paintShells(this.W, this.H, this.dpr);
  }

  // Lines close to the pool flood first; further up the beach they last longer.
  decayAt(x, y, coarse, fine) {
    const d = clamp((y - this.poolEdge(x)) / (this.H * 0.75), 0, 1);
    return 0.45 + 1.0 * Math.pow(1 - d, 1.4) + 0.45 * coarse + 0.3 * (fine - 0.5);
  }

  poolEdge(x) {
    return this.H * POOL + Math.sin(x * 0.012 + 1.3) * this.H * 0.025 + Math.sin(x * 0.031) * this.H * 0.01;
  }

  paintBase() { return paintSand(this); }

  // Words always land on the sand, never under the water.
  stampText(text, opts) {
    const top = POOL + 0.1;
    if (opts.y != null) opts = { ...opts, y: Math.max(opts.y, this.H * top) };
    else opts = { ...opts, at: Math.max(opts.at ?? 0.42, top) };
    return super.stampText(text, opts);
  }
  paintLayer() { return null; }

  onStrokeMove(s, x, y) {
    if (y < this.poolEdge(x) + 6 && Math.random() < 0.3) sfx.cue('drip');
  }

  clear() {
    if (this.clearing) return;
    sfx.cue('wave', { rise: 1.1, hold: 0.4, fall: 1.4 });
    this.strokes.clear();
    this.commitDraft?.();
    this.clearing = { t: 0, dur: 2.8, front: 0 };
  }

  clearStep(cl) {
    const p = Math.min(1, cl.t / cl.dur);
    const { H } = this;
    // The water slides down the sand (0..0.45), lingers, and draws back (0.6..1).
    const reach = p < 0.45 ? easeInOut(p / 0.45) : p < 0.6 ? 1 : 1 - easeInOut((p - 0.6) / 0.4);
    cl.front = H * POOL + reach * H * 0.9;
    if (p < 0.6) {
      const f = cl.front;
      this.scaleCells((x, y) => (y < f - 30 ? 0.86 : 1));
    }
    if (p >= 1) { this.map.fill(0); return false; }
    return true;
  }

  render(ctx) {
    const { map, maskImg, mask2Img, dpr } = this;
    const a = maskImg.data, b = mask2Img.data;
    for (let i = 0, k = 3; i < map.length; i++, k += 4) {
      const c = map[i] > 1 ? 1 : map[i];
      // Groove: crisp while fresh, slumping as it fades.
      const s = c * c * (3 - 2 * c);
      a[k] = (s * 255) | 0;
      // Seep: water fills the groove as it starts to go and is gone when the groove is.
      const w = c < 0.85 ? Math.sin((c / 0.85) * Math.PI) : 0;
      b[k] = (w * 255) | 0;
    }
    this.maskCtx.putImageData(maskImg, 0, 0);
    this.mask2Ctx.putImageData(mask2Img, 0, 0);
    ctx.setTransform(1, 0, 0, 1, 0, 0);
    ctx.drawImage(this.base, 0, 0);
    const g = this.workCtx;
    // A groove lit from the top left: bright far wall, shadowed near wall, darker wet floor.
    this.maskedLayer(g, 'rgba(244,226,186,0.8)', 1.6, 1.6);
    ctx.drawImage(this.work, 0, 0);
    this.maskedLayer(g, 'rgba(62,44,24,0.7)', -1.6, -1.6);
    ctx.drawImage(this.work, 0, 0);
    this.maskedLayer(g, 'rgba(112,90,58,0.8)');
    ctx.drawImage(this.work, 0, 0);
    // Seeping water, a glassy blue-green with a moving glint.
    g.setTransform(1, 0, 0, 1, 0, 0);
    g.globalCompositeOperation = 'copy';
    g.drawImage(this.mask2, 0, 0, this.mw * this.cell * dpr, this.mh * this.cell * dpr);
    g.globalCompositeOperation = 'source-in';
    g.drawImage(this.water, 0, 0);
    g.globalCompositeOperation = 'source-over';
    ctx.globalAlpha = 0.75;
    ctx.drawImage(this.work, 0, 0);
    ctx.globalAlpha = 1;
    ctx.drawImage(this.shells, 0, 0);
    ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
    this.drawPool(ctx);
    ctx.setTransform(1, 0, 0, 1, 0, 0);
  }

  // The pool itself, with a gently lapping rim, and the tide sheet when clearing.
  drawPool(ctx) {
    const { W, H, time } = this;
    const lap = Math.sin(time * 1.1) * 3;
    ctx.save();
    ctx.beginPath();
    ctx.moveTo(0, 0);
    for (let x = 0; x <= W + 8; x += 8) ctx.lineTo(x, this.poolEdge(x) + lap + Math.sin(x * 0.05 + time * 1.7) * 1.5);
    ctx.lineTo(W, 0);
    ctx.closePath();
    ctx.save();
    ctx.clip();
    ctx.drawImage(this.water, 0, 0, W, H);
    ctx.restore();
    ctx.strokeStyle = 'rgba(255,255,255,0.55)';
    ctx.lineWidth = 2;
    ctx.stroke();
    ctx.restore();

    const cl = this.clearing;
    if (cl) {
      const f = cl.front;
      ctx.save();
      ctx.beginPath();
      ctx.moveTo(0, 0);
      for (let x = 0; x <= W + 10; x += 10) ctx.lineTo(x, f + Math.sin(x * 0.03 + time * 3) * 8);
      ctx.lineTo(W, 0); ctx.closePath();
      ctx.save();
      ctx.clip();
      ctx.globalAlpha = 0.82;
      ctx.drawImage(this.water, 0, 0, W, H);
      ctx.restore();
      ctx.strokeStyle = 'rgba(255,255,255,0.8)';
      ctx.lineWidth = 3;
      ctx.stroke();
      ctx.restore();
    }
  }

  updateFx() { return true; } // the pool laps all the time
}

// Damp, fine-grained sand, darker toward the pool.
function paintSand(e) {
  const { W, H, dpr } = e;
  const rand = mulberry32(14);
  const { c, g } = stageCanvas(W, H, dpr);
  const grad = g.createLinearGradient(0, H * POOL, 0, H);
  grad.addColorStop(0, '#9a8463');
  grad.addColorStop(0.3, '#b29b76');
  grad.addColorStop(1, '#c4ad88');
  g.fillStyle = grad; g.fillRect(0, 0, W, H);
  mottle(g, W, H, rand, { light: 26, dark: 26, scale: 6 });
  speckle(g, W, H, rand, (W * H) / 25, 'rgba(70,56,40,0.28)', 0.8);
  speckle(g, W, H, rand, (W * H) / 60, 'rgba(250,240,220,0.3)', 0.7);
  // Wet sheen along the waterline.
  for (let x = 0; x < W; x += 30) blob(g, x, e.poolEdge(x) + 14, 40, 18, 'rgba(70,60,50,0.22)');
  return c;
}

// Clear, shallow water over pale rocks and sand, with weed and caustic light.
function paintPoolWater(W, H, dpr) {
  const rand = mulberry32(60);
  const { c, g } = stageCanvas(W, H, dpr);
  const grad = g.createLinearGradient(0, 0, 0, H * 0.4);
  grad.addColorStop(0, '#1f5f6a');
  grad.addColorStop(1, '#4f9a96');
  g.fillStyle = grad; g.fillRect(0, 0, W, H);
  for (let i = 0; i < 14; i++) blob(g, rand() * W, rand() * H * 0.25, 20 + rand() * 40, 14 + rand() * 24, 'rgba(160,140,110,0.35)');
  for (let i = 0; i < 6; i++) blob(g, rand() * W, rand() * H * 0.2, 16 + rand() * 20, 8 + rand() * 10, 'rgba(60,110,50,0.4)');
  // Caustics: a net of thin bright curves.
  g.strokeStyle = 'rgba(220,255,250,0.22)';
  for (let i = 0; i < (W * H) / 5000; i++) {
    const x = rand() * W, y = rand() * H, r = 6 + rand() * 14;
    g.lineWidth = 0.6 + rand();
    g.beginPath(); g.arc(x, y, r, rand() * 6, rand() * 6 + 2); g.stroke();
  }
  return c;
}

// Shells, pebbles and kelp scattered along the sand, kept clear of the middle.
function paintShells(W, H, dpr) {
  const rand = mulberry32(8);
  const { c, g } = stageCanvas(W, H, dpr);
  const spots = [[0.08, 0.92], [0.9, 0.86], [0.86, 0.34], [0.12, 0.38], [0.94, 0.62], [0.05, 0.66]];
  for (const [fx, fy] of spots) {
    const x = fx * W, y = fy * H;
    g.save();
    g.translate(x, y); g.rotate(rand() * 6);
    if (rand() < 0.5) {
      // Scallop.
      g.fillStyle = '#e8cfb4';
      g.beginPath(); g.moveTo(0, 8); g.arc(0, 0, 11, Math.PI * 0.95, Math.PI * 2.05); g.closePath(); g.fill();
      g.strokeStyle = 'rgba(150,110,80,0.6)'; g.lineWidth = 0.8;
      for (let a = -0.8; a <= 0.8; a += 0.32) { g.beginPath(); g.moveTo(0, 7); g.lineTo(Math.sin(a) * 11, -Math.cos(a) * 11); g.stroke(); }
    } else {
      // Pebble.
      g.fillStyle = `hsl(${20 + rand() * 30},${6 + rand() * 10}%,${45 + rand() * 25}%)`;
      g.shadowColor = 'rgba(60,40,20,0.35)'; g.shadowBlur = 4; g.shadowOffsetY = 2;
      g.beginPath(); g.ellipse(0, 0, 9 + rand() * 6, 6 + rand() * 4, 0, 0, Math.PI * 2); g.fill();
    }
    g.restore();
  }
  // A strand of kelp near the waterline.
  g.strokeStyle = 'rgba(70,80,30,0.8)'; g.lineWidth = 3; g.lineCap = 'round';
  g.beginPath(); g.moveTo(W * 0.68, H * 0.29);
  g.bezierCurveTo(W * 0.74, H * 0.31, W * 0.78, H * 0.27, W * 0.84, H * 0.3); g.stroke();
  return c;
}
