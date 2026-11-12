// Zen garden: a Fade environment.
//   Look:  your finger cuts a furrow through raked gravel: shadow on one wall, light on the
//          other. Three mossy stones sit in the garden.
//   Decay: a bamboo rake drifts across the garden whenever there's something to smooth,
//          combing the gravel back into straight lines behind it.
//   Clear: the rake makes one quick pass over everything.

import { clamp, easeInOut, mulberry32, makeCanvas } from '../lib/util.js';
import { MapFade, stageCanvas, speckle, mottle, blob } from '../lib/fade.js';
import { sfx } from '../lib/sound.js';

const SAND = '#d9cfbb';

export const zen = {
  id: 'zen',
  name: 'Zen garden',
  blurb: 'A rake slowly smooths the gravel',
  surface: 'Raked gravel garden to draw furrows in',
  clearLabel: 'Rake it',
  clearIcon: 'M5 3v18M5 7h14M8 7v4M11 7v4M14 7v4M17 7v4',
  create: () => new Zen(),
};

class Zen extends MapFade {
  constructor() {
    super({ brush: 9, soft: 0.5, seed: 61, textWeight: 500 });
    this.textLine = 0.1;
    this.decayScale = 0.12; // the rake does the real work; this only tidies stragglers
    this.rake = { x: -60, on: false, speed: 0 };
  }

  paintBase() { return paintGarden(this); }
  paintLayer() { return null; }

  setup() {
    const { W, H } = this;
    const m = Math.min(W, H);
    this.rocks = [
      { x: W * 0.8, y: H * 0.2, r: m * 0.09, s: 3 },
      { x: W * 0.16, y: H * 0.68, r: m * 0.07, s: 5 },
      { x: W * 0.24, y: H * 0.74, r: m * 0.04, s: 8 },
    ];
    this.rockArt = paintRocks(this);
  }

  // The rake walks left to right at a pace set by the fade speed, then comes round again.
  updateFx(dt) {
    const rk = this.rake;
    if (this.clearing) return true;
    if (!rk.on && this.alive && !this.paused) { rk.on = true; rk.x = -60; sfx.cue('rake', { soft: true }); }
    if (!rk.on) return false;
    if (this.paused) return false;
    rk.x += dt * (this.W + 120) / (this.fadeSeconds * 0.9);
    this.smooth(rk.x);
    if (rk.x > this.W + 60) { rk.on = false; rk.x = -60; }
    return true;
  }

  smooth(x) {
    const band = 26, { cell, mw, mh, map } = this;
    const i0 = Math.max(0, ((x - band) / cell) | 0), i1 = Math.min(mw - 1, ((x + 4) / cell) | 0);
    for (let j = 0; j < mh; j++) for (let i = i0; i <= i1; i++) map[j * mw + i] *= 0.5;
  }

  clear() {
    sfx.cue('rake');
    this.strokes.clear();
    this.clearing = { t: 0, dur: 1.4 };
  }

  clearStep(cl) {
    const p = Math.min(1, cl.t / cl.dur);
    this.rake.on = true;
    this.rake.x = -60 + (this.W + 120) * easeInOut(p);
    const x = this.rake.x;
    this.scaleCells((cx) => (cx < x ? 0 : 1));
    if (p >= 1) { this.map.fill(0); this.rake.on = false; this.rake.x = -60; return false; }
    return true;
  }

  render(ctx) {
    const { map, maskImg, dpr } = this;
    const data = maskImg.data;
    for (let i = 0, k = 3; i < map.length; i++, k += 4) {
      const c = map[i] > 1 ? 1 : map[i];
      data[k] = (c * c * (3 - 2 * c) * 255) | 0;
    }
    this.maskCtx.putImageData(maskImg, 0, 0);
    ctx.setTransform(1, 0, 0, 1, 0, 0);
    ctx.drawImage(this.base, 0, 0);
    // A furrow, lit from the top left: bright lower-right wall, shadowed upper-left wall,
    // and a slightly darker floor.
    const g = this.workCtx;
    this.maskedLayer(g, 'rgba(255,250,236,0.75)', 1.6, 1.6);
    ctx.drawImage(this.work, 0, 0);
    this.maskedLayer(g, 'rgba(92,76,52,0.6)', -1.6, -1.6);
    ctx.drawImage(this.work, 0, 0);
    this.maskedLayer(g, 'rgba(176,162,136,0.85)');
    ctx.drawImage(this.work, 0, 0);
    ctx.drawImage(this.rockArt, 0, 0);
    ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
    if (this.rake.on) drawRake(ctx, this.rake.x, this.H);
    ctx.setTransform(1, 0, 0, 1, 0, 0);
  }
}

function drawRake(ctx, x, H) {
  ctx.save();
  ctx.shadowColor = 'rgba(60,45,25,0.35)';
  ctx.shadowBlur = 10; ctx.shadowOffsetX = 4; ctx.shadowOffsetY = 4;
  // Tines trailing to the left, then the bamboo head.
  ctx.fillStyle = '#8a6a3c';
  for (let y = 10; y < H; y += 14) ctx.fillRect(x - 16, y - 1.5, 16, 3);
  const g = ctx.createLinearGradient(x, 0, x + 12, 0);
  g.addColorStop(0, '#c9a46a'); g.addColorStop(0.5, '#e0c08a'); g.addColorStop(1, '#a8834c');
  ctx.fillStyle = g;
  ctx.fillRect(x, -10, 12, H + 20);
  ctx.shadowColor = 'transparent';
  ctx.fillStyle = 'rgba(110,80,40,0.5)';
  for (let y = 40; y < H; y += 120) ctx.fillRect(x, y, 12, 3);
  ctx.restore();
}

// Gravel combed into straight lines, with rings around each stone.
function paintGarden(e) {
  const { W, H, dpr } = e;
  const rand = mulberry32(3);
  const { c, g } = stageCanvas(W, H, dpr);
  g.fillStyle = SAND;
  g.fillRect(0, 0, W, H);
  mottle(g, W, H, rand, { light: 30, dark: 22, scale: 7 });
  const m = Math.min(W, H);
  const rocks = [[W * 0.8, H * 0.2, m * 0.09], [W * 0.2, H * 0.71, m * 0.1]];
  const inRing = (x, y) => rocks.some(([rx, ry, r]) => Math.hypot(x - rx, y - ry) < r * 2.3);
  // Straight grooves.
  const gap = 9;
  for (let y = gap; y < H; y += gap) {
    for (const [col, off] of [['rgba(120,102,74,0.32)', -1.2], ['rgba(255,252,240,0.55)', 1.2]]) {
      g.strokeStyle = col; g.lineWidth = 1.4;
      g.beginPath();
      let pen = false;
      for (let x = 0; x <= W; x += 4) {
        const yy = y + off + Math.sin(x * 0.01 + y) * 0.6;
        if (inRing(x, y)) { pen = false; continue; }
        if (!pen) { g.moveTo(x, yy); pen = true; } else g.lineTo(x, yy);
      }
      g.stroke();
    }
  }
  // Rings.
  for (const [rx, ry, r] of rocks) {
    for (let k = r * 1.15; k < r * 2.3; k += gap) {
      g.strokeStyle = 'rgba(120,102,74,0.32)'; g.lineWidth = 1.4;
      g.beginPath(); g.ellipse(rx, ry, k, k * 0.92, 0, 0, Math.PI * 2); g.stroke();
      g.strokeStyle = 'rgba(255,252,240,0.55)';
      g.beginPath(); g.ellipse(rx + 1.2, ry + 1.2, k, k * 0.92, 0, 0, Math.PI * 2); g.stroke();
    }
  }
  speckle(g, W, H, rand, (W * H) / 30, 'rgba(110,95,70,0.3)', 0.9);
  speckle(g, W, H, rand, (W * H) / 40, 'rgba(255,255,250,0.5)', 0.8);
  // Soft late-day light.
  const sun = g.createLinearGradient(0, 0, W, H);
  sun.addColorStop(0, 'rgba(255,240,210,0.15)');
  sun.addColorStop(1, 'rgba(80,60,40,0.12)');
  g.fillStyle = sun; g.fillRect(0, 0, W, H);
  return c;
}

function paintRocks(e) {
  const { W, H, dpr } = e;
  const { c, g } = stageCanvas(W, H, dpr);
  const m = Math.min(W, H);
  const rocks = [[W * 0.8, H * 0.2, m * 0.085, 3], [W * 0.17, H * 0.69, m * 0.075, 5], [W * 0.255, H * 0.745, m * 0.045, 8]];
  for (const [x, y, r, s] of rocks) {
    const rand = mulberry32(s);
    g.save();
    g.shadowColor = 'rgba(60,45,25,0.45)';
    g.shadowBlur = r * 0.4; g.shadowOffsetX = r * 0.18; g.shadowOffsetY = r * 0.22;
    g.beginPath();
    for (let i = 0; i <= 12; i++) {
      const a = (i / 12) * Math.PI * 2, k = r * (0.85 + rand() * 0.25);
      const px = x + Math.cos(a) * k * 1.15, py = y + Math.sin(a) * k * 0.9;
      i ? g.lineTo(px, py) : g.moveTo(px, py);
    }
    g.closePath();
    const fill = g.createRadialGradient(x - r * 0.4, y - r * 0.4, 0, x, y, r * 1.3);
    fill.addColorStop(0, '#9c958c'); fill.addColorStop(1, '#4f4a45');
    g.fillStyle = fill; g.fill();
    g.restore();
    g.save();
    g.clip();
    blob(g, x - r * 0.2, y - r * 0.55, r * 0.9, r * 0.45, 'rgba(90,130,60,0.85)');
    g.restore();
  }
  return c;
}
