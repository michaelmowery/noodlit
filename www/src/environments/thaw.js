// Thaw: a Become environment.
//   Look:   a pane of ice-cold glass, frosted over. Your finger draws in bright white frost.
//   Become: pause, and the frost line glistens, cracks and turns to beads of meltwater.
//   Leave:  the beads run down the pane, leaving thin wet trails that frost over again.

import { clamp, mulberry32, smoothstep } from '../lib/util.js';
import { BecomeScene } from '../lib/become.js';
import { stageCanvas, blob, mottle, speckle } from '../lib/fade.js';
import { sfx } from '../lib/sound.js';

// Frost takes a tint from whatever light is behind the glass. The meltwater keeps it.
const PALETTE = [
  { name: 'Frost white', color: '#ffffff' },
  { name: 'Glacier', color: '#7fe3ff' },
  { name: 'Aurora', color: '#8dffc4' },
  { name: 'Lilac', color: '#dcbcff' },
  { name: 'Dawn', color: '#ffc4d8' },
];

export const thaw = {
  id: 'thaw',
  name: 'Thaw',
  mode: 'become',
  blurb: 'Pause, and your frost lines melt and run',
  surface: 'Frosted glass to draw frost lines on',
  clearLabel: 'Become now',
  clearIcon: 'M12 3c3 4.5 5.5 7.6 5.5 11a5.5 5.5 0 0 1-11 0C6.5 10.6 9 7.5 12 3zM9.5 14.5a2.5 2.5 0 0 0 2.5 2.5',
  palette: PALETTE,
  create: () => new Thaw(),
};

class Thaw extends BecomeScene {
  constructor() {
    super({ ink: PALETTE[0].color, brush: 3.4, spacing: 11, cap: 1000, seed: 83, ghost: 2.6, settle: 9 });
  }

  paintBase() { return paintPane(this.W, this.H, this.dpr); }

  // Frost: a feathery white line with a hard bright core.
  paintSeg(g, x0, y0, r0, x1, y1, r1) {
    g.save();
    g.strokeStyle = this.ink;
    g.globalAlpha = 0.28;
    g.lineWidth = (r0 + r1) * 1.7;
    g.beginPath(); g.moveTo(x0, y0); g.lineTo(x1 + 0.01, y1); g.stroke();
    g.globalAlpha = 0.95;
    g.lineWidth = (r0 + r1) * 0.85;
    g.stroke();
    // Tiny ice needles off the side of the line.
    const d = Math.hypot(x1 - x0, y1 - y0);
    if (d > 0.5) {
      g.globalAlpha = 0.7;
      g.lineWidth = 0.7;
      const n = Math.ceil(d / 5);
      for (let i = 0; i < n; i++) {
        const t = Math.random(), a = Math.random() * Math.PI * 2, len = (r0 + r1) * (0.5 + Math.random() * 0.7);
        const x = x0 + (x1 - x0) * t, y = y0 + (y1 - y0) * t;
        g.beginPath(); g.moveTo(x, y); g.lineTo(x + Math.cos(a) * len, y + Math.sin(a) * len); g.stroke();
      }
    }
    g.restore();
  }

  // ---------------------------------------------------------------- meltwater
  spawn(p) {
    const rand = this.rand;
    p.size = (1.6 + rand() * 2.2) * clamp(0.8 + p.r / 8, 0.8, 1.5) * (p.text ? 0.8 : 1);
    p.glint = rand() * 0.9;              // when its sparkle flashes
    p.melt = 1.5 + rand() * 1.5;         // seconds as ice before it lets go
    p.g = 55 + rand() * 120;             // how hard it's pulled down the glass
    p.stick = 0.4 + rand() * 0.8;        // beads stick and slip
    p.wob = rand() * 6.3;
    p.life = 3.4 + rand() * 2.2;
    p.vy = 0; p.trail = 0; p.a = 0; p.spark = 0;
  }

  hurry(p) { p.melt = Math.min(p.melt, p.t + this.rand() * 0.4); }

  stepParticle(p, dt) {
    p.t += dt;
    // A glint as the ice catches the light, then again as it cracks.
    const g1 = 1 - Math.abs(p.t - 0.25 - p.glint) / 0.22, g2 = 1 - Math.abs(p.t - p.melt + 0.15) / 0.18;
    p.spark = Math.max(0, g1, g2);
    const run = p.t - p.melt;
    if (run <= 0) {
      p.a = smoothstep(0.3, p.melt, p.t); // the bead swells as the frost around it melts
      return true;
    }
    if (run >= p.life) return false;
    if (!this.calm) {
      // Stick, slip, stick: a bead gathers speed, then catches for a moment.
      const slip = 0.35 + 0.65 * Math.max(0, Math.sin(run * p.stick * 3 + p.wob));
      p.vy += p.g * slip * dt;
      p.vy *= 1 - 0.9 * dt;
      p.y += p.vy * dt;
      p.x = p.hx + Math.sin(run * 1.7 + p.wob) * 1.6;
      p.trail = Math.min(p.y - p.hy, 10 + p.vy * 0.25);
      if (p.y > this.H + 12) return false;
    }
    p.a = 1 - smoothstep(this.calm ? 0.1 : 0.7, 1, run / p.life);
    return true;
  }

  drawParticles(ctx, list) {
    ctx.save();
    ctx.lineCap = 'round';
    // Wet trails first: clear streaks through the frost that thin out behind each bead.
    for (const p of list) {
      if (p.delay > 0 || p.trail < 2 || p.a <= 0.01) continue;
      const gr = ctx.createLinearGradient(0, p.y - p.trail, 0, p.y);
      gr.addColorStop(0, 'rgba(20,50,80,0)');
      gr.addColorStop(1, `rgba(20,50,80,${0.22 * p.a})`);
      ctx.strokeStyle = gr;
      ctx.lineWidth = p.size * 0.8;
      ctx.beginPath(); ctx.moveTo(p.hx, p.y - p.trail); ctx.lineTo(p.x, p.y); ctx.stroke();
    }
    for (const p of list) {
      if (p.delay > 0 || p.a <= 0.01) continue;
      const r = p.size * (0.5 + 0.5 * p.a);
      // The bead: dark at the top where it bends the view, bright at the bottom.
      ctx.globalAlpha = clamp(p.a, 0, 1);
      ctx.fillStyle = 'rgba(24,60,96,0.55)';
      ctx.beginPath(); ctx.ellipse(p.x, p.y, r, r * 1.15, 0, 0, Math.PI * 2); ctx.fill();
      ctx.fillStyle = p.ink === '#ffffff' ? 'rgba(210,235,255,0.75)' : p.ink + 'd0'; // the bead keeps the frost's tint
      ctx.beginPath(); ctx.ellipse(p.x, p.y + r * 0.35, r * 0.7, r * 0.55, 0, 0, Math.PI * 2); ctx.fill();
      ctx.fillStyle = '#ffffff';
      ctx.beginPath(); ctx.arc(p.x - r * 0.3, p.y - r * 0.4, Math.max(0.5, r * 0.22), 0, Math.PI * 2); ctx.fill();
    }
    // Glints.
    ctx.globalCompositeOperation = 'lighter';
    ctx.lineWidth = 1;
    for (const p of list) {
      if (p.delay > 0 || p.spark <= 0.02) continue;
      ctx.strokeStyle = p.ink;
      const L = (4 + p.size * 2.2) * p.spark;
      ctx.globalAlpha = p.spark;
      ctx.beginPath();
      ctx.moveTo(p.x - L, p.y); ctx.lineTo(p.x + L, p.y);
      ctx.moveTo(p.x, p.y - L); ctx.lineTo(p.x, p.y + L);
      ctx.stroke();
    }
    ctx.restore();
  }

  onBecome(n) { sfx.cue('thaw', { n }); }
}

// A window iced over on a bright winter morning: pale blue glass under a skin of frost, with
// fern-like crystals creeping in from the edges.
function paintPane(W, H, dpr) {
  const rand = mulberry32(89);
  const { c, g } = stageCanvas(W, H, dpr);
  const glass = g.createLinearGradient(0, 0, W * 0.3, H);
  glass.addColorStop(0, '#9fc3dc');
  glass.addColorStop(0.5, '#7aa6c6');
  glass.addColorStop(1, '#5b88ad');
  g.fillStyle = glass; g.fillRect(0, 0, W, H);
  // Blurred shapes of a winter garden behind the glass.
  for (let i = 0; i < 9; i++) {
    blob(g, rand() * W, H * (0.5 + rand() * 0.5), 50 + rand() * 90, 70 + rand() * 120, 'rgba(40,70,100,0.16)');
  }
  blob(g, W * 0.7, H * 0.2, W * 0.5, H * 0.3, 'rgba(255,250,235,0.3)');
  // The frost skin.
  g.fillStyle = 'rgba(232,243,252,0.34)';
  g.fillRect(0, 0, W, H);
  mottle(g, W, H, rand, { light: 70, dark: 26, scale: 6 });
  speckle(g, W, H, rand, (W * H) / 120, 'rgba(255,255,255,0.5)', 1);
  // Frost ferns growing in from the corners and edges.
  g.strokeStyle = 'rgba(255,255,255,0.5)';
  g.lineCap = 'round';
  const fern = (x, y, a, len, w) => {
    if (len < 5) return;
    const x1 = x + Math.cos(a) * len, y1 = y + Math.sin(a) * len;
    g.lineWidth = w;
    g.beginPath(); g.moveTo(x, y); g.lineTo(x1, y1); g.stroke();
    const n = Math.floor(len / 7);
    for (let i = 1; i < n; i++) {
      const t = i / n, bx = x + (x1 - x) * t, by = y + (y1 - y) * t, bl = len * 0.34 * (1 - t * 0.6);
      for (const s of [-1, 1]) {
        g.lineWidth = w * 0.6;
        g.beginPath(); g.moveTo(bx, by); g.lineTo(bx + Math.cos(a + s * 0.9) * bl, by + Math.sin(a + s * 0.9) * bl); g.stroke();
      }
    }
    fern(x1, y1, a + (rand() - 0.5) * 0.7, len * 0.62, w * 0.8);
  };
  const edge = Math.round((W + H) / 60);
  for (let i = 0; i < edge; i++) {
    const side = Math.floor(rand() * 4);
    const x = side === 0 ? 0 : side === 1 ? W : rand() * W;
    const y = side === 2 ? 0 : side === 3 ? H : rand() * H;
    const inward = Math.atan2(H / 2 - y, W / 2 - x) + (rand() - 0.5) * 1.2;
    fern(x, y, inward, 28 + rand() * 50, 1.3);
  }
  return c;
}
