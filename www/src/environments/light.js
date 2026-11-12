// Light painting: a Fade environment.
//   Look:  glowing trails on a night skyline, like waving a sparkler in a long-exposure
//          photo. Sparks fly from your fingertip. Pick the colour of the light.
//   Decay: the trails fade the way an exposure does: the soft glow goes first, then the
//          bright core.
//   Clear: the shutter clicks: a flash, and the frame starts again dark.

import { clamp, mulberry32 } from '../lib/util.js';
import { MapFade, stageCanvas, blob } from '../lib/fade.js';
import { sfx } from '../lib/sound.js';

const PALETTE = [
  { name: 'Sparkler', color: '#ffc861' },
  { name: 'Electric', color: '#5fd4ff' },
  { name: 'Magenta', color: '#ff5fd2' },
  { name: 'Lime', color: '#a6ff5f' },
  { name: 'Violet', color: '#a77bff' },
  { name: 'Ember', color: '#ff6a3d' },
];

export const light = {
  id: 'light',
  name: 'Light painting',
  blurb: 'Glowing trails fade like a long exposure',
  surface: 'Night sky to paint glowing light trails on',
  clearLabel: 'Shutter',
  clearIcon: 'M4 8h3l2-3h6l2 3h3v11H4zM12 10a3.5 3.5 0 1 0 0 7 3.5 3.5 0 0 0 0-7z',
  palette: PALETTE,
  create: () => new Light(),
};

class Light extends MapFade {
  constructor() {
    super({ paint: true, blend: 'lighter', brush: 4.5, edgeFirst: 0.45, soft: 0.25, seed: 13, ink: PALETTE[0].color, textWeight: 400 });
    this.textLine = 0.05;
    this.sparks = [];
    this.tips = new Set();
    this.flash = 0;
  }

  paintBase() { return paintSkyline(this.W, this.H, this.dpr); }

  // The map is wider than the core line so the glow around it fades with it.
  mark(x0, y0, r0, x1, y1, r1) {
    this.raise(x0, y0, r0 * 3.2, x1, y1, r1 * 3.2, 1 + this.hold);
    this.paintSeg(this.paintCtx, x0, y0, r0, x1, y1, r1);
  }

  paintSeg(g, x0, y0, r0, x1, y1, r1) {
    g.save();
    g.globalCompositeOperation = 'lighter';
    g.strokeStyle = this.ink;
    g.globalAlpha = 0.18;
    g.lineWidth = (r0 + r1) * 2.6;
    g.beginPath(); g.moveTo(x0, y0); g.lineTo(x1 + 0.01, y1); g.stroke();
    g.globalAlpha = 0.6;
    g.lineWidth = (r0 + r1) * 1.1;
    g.stroke();
    g.globalAlpha = 0.9;
    g.strokeStyle = '#fffaf0';
    g.lineWidth = (r0 + r1) * 0.35;
    g.stroke();
    g.restore();
  }

  onStrokeStart(s) { this.tips.add(s); }
  onStrokeEnd(s) { this.tips.delete(s); }
  onStrokeMove(s, x, y, d) {
    const n = Math.min(4, d / 6);
    for (let i = 0; i < n; i++) {
      if (this.sparks.length > 220) break;
      const a = Math.random() * Math.PI * 2, v = 40 + Math.random() * 160;
      this.sparks.push({ x, y, vx: Math.cos(a) * v, vy: Math.sin(a) * v - 40, t: 0, life: 0.3 + Math.random() * 0.5, c: this.ink });
    }
  }

  updateFx(dt) {
    for (const s of this.sparks) {
      s.t += dt; s.vy += 260 * dt; s.vx *= 0.98;
      s.x += s.vx * dt; s.y += s.vy * dt;
    }
    this.sparks = this.sparks.filter((s) => s.t < s.life);
    if (this.flash > 0) this.flash = Math.max(0, this.flash - dt * 3);
    return this.sparks.length > 0 || this.flash > 0 || this.tips.size > 0;
  }

  clear() {
    sfx.cue('shutter');
    this.strokes.clear();
    this.tips.clear();
    this.flash = 1;
    const p = this.paintCtx;
    p.save(); p.setTransform(1, 0, 0, 1, 0, 0); p.clearRect(0, 0, this.paint.width, this.paint.height); p.restore();
    this.clearing = { t: 0, dur: 0.12 };
  }

  clearStep(cl) {
    this.map.fill(0);
    return cl.t < cl.dur;
  }

  drawFx(ctx) {
    ctx.save();
    ctx.globalCompositeOperation = 'lighter';
    for (const s of this.sparks) {
      const k = 1 - s.t / s.life;
      ctx.strokeStyle = s.c;
      ctx.globalAlpha = k;
      ctx.lineWidth = 1.3;
      ctx.beginPath(); ctx.moveTo(s.x, s.y); ctx.lineTo(s.x - s.vx * 0.03, s.y - s.vy * 0.03); ctx.stroke();
    }
    ctx.globalAlpha = 1;
    for (const t of this.tips) {
      blob(ctx, t.x, t.y, 18, 18, 'rgba(255,250,235,0.6)');
      ctx.fillStyle = '#fffdf6';
      ctx.beginPath(); ctx.arc(t.x, t.y, 2.4, 0, Math.PI * 2); ctx.fill();
    }
    ctx.restore();
    if (this.flash > 0) {
      ctx.fillStyle = `rgba(255,255,255,${this.flash * 0.7})`;
      ctx.fillRect(0, 0, this.W, this.H);
    }
  }
}

// A dark city skyline under a deep blue night, with a few soft distant lights.
function paintSkyline(W, H, dpr) {
  const rand = mulberry32(90);
  const { c, g } = stageCanvas(W, H, dpr);
  const sky = g.createLinearGradient(0, 0, 0, H);
  sky.addColorStop(0, '#05060f');
  sky.addColorStop(0.65, '#0d1330');
  sky.addColorStop(1, '#1b1a33');
  g.fillStyle = sky; g.fillRect(0, 0, W, H);
  for (let i = 0; i < (W * H) / 3000; i++) {
    g.fillStyle = `rgba(255,255,255,${0.15 + rand() * 0.45})`;
    g.beginPath(); g.arc(rand() * W, rand() * H * 0.6, 0.4 + rand() * 0.7, 0, Math.PI * 2); g.fill();
  }
  // Skyline.
  const base = H * 0.86;
  let x = -10;
  while (x < W + 10) {
    const w = 18 + rand() * 46, h = 30 + rand() * H * 0.22;
    g.fillStyle = `rgb(${8 + rand() * 8},${10 + rand() * 8},${22 + rand() * 12})`;
    g.fillRect(x, base - h, w, h + H);
    // A few lit windows.
    for (let wy = base - h + 6; wy < base - 4; wy += 9) {
      for (let wx = x + 4; wx < x + w - 4; wx += 7) {
        if (rand() < 0.12) { g.fillStyle = rand() < 0.7 ? 'rgba(255,210,140,0.55)' : 'rgba(160,210,255,0.45)'; g.fillRect(wx, wy, 3, 4); }
      }
    }
    x += w + rand() * 4;
  }
  // Ground and glow over the city.
  g.fillStyle = '#05060c';
  g.fillRect(0, base, W, H - base);
  blob(g, W * 0.5, base, W * 0.8, H * 0.18, 'rgba(255,150,90,0.12)');
  for (let i = 0; i < 6; i++) blob(g, rand() * W, base + 6 + rand() * (H - base), 16 + rand() * 20, 10, 'rgba(255,200,120,0.18)');
  return c;
}
