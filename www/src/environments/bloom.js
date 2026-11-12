// Bloom: a Become environment.
//   Look:   a bed of dark garden soil, seen from above. Your finger draws a green stem.
//   Become: pause, and the stem comes to life: leaves unfurl along it and small flowers open,
//           one after another, in the colour you picked.
//   Leave:  the petals drop, the leaves curl up and the stem sinks back into the soil.

import { clamp, mulberry32, smoothstep } from '../lib/util.js';
import { BecomeScene } from '../lib/become.js';
import { stageCanvas, blob, mottle, speckle } from '../lib/fade.js';
import { sfx } from '../lib/sound.js';

// The ink picker chooses the flowers; stems are always green.
const PALETTE = [
  { name: 'Poppy', color: '#ff5a4d' },
  { name: 'Buttercup', color: '#ffd24a' },
  { name: 'Lavender', color: '#b497ff' },
  { name: 'Blush', color: '#ff9ec4' },
  { name: 'Daisy', color: '#f6f3ea' },
];
const STEM = '#5fae54';

export const bloom = {
  id: 'bloom',
  name: 'Bloom',
  mode: 'become',
  blurb: 'Pause, and your stems sprout leaves and flowers',
  surface: 'Garden soil to draw green stems on',
  clearLabel: 'Become now',
  clearIcon: 'M12 21v-9M12 12c-4 0-6-2-6-5 3 0 6 1 6 5zM12 14c3.5 0 5.5-1.7 5.5-4.5-2.8 0-5.5 1-5.5 4.5zM12 7a2 2 0 1 0 0-4 2 2 0 0 0 0 4z',
  palette: PALETTE,
  brushes: [
    { name: 'Stem', size: 1 },
    { name: 'Tendril', size: 0.5, steady: 0.8 },
    { name: 'Thick vine', size: 2.6 },
  ],
  create: () => new Bloom(),
};

class Bloom extends BecomeScene {
  constructor() {
    // The stem stays while everything grows on it, then sinks away with the leaves.
    super({ ink: PALETTE[0].color, brush: 2.2, spacing: 15, cap: 900, seed: 67, ghostHold: 4.6, ghost: 2.2, settle: 9 });
  }

  paintBase() { return paintSoil(this.W, this.H, this.dpr); }

  paintSeg(g, x0, y0, r0, x1, y1, r1) {
    g.save();
    g.strokeStyle = STEM;
    g.lineWidth = r0 + r1;
    g.beginPath(); g.moveTo(x0, y0); g.lineTo(x1 + 0.01, y1); g.stroke();
    g.restore();
  }

  // Typed words are written in stem green too, then flower.
  drawBlock(g, block) { super.drawBlock(g, { ...block, ink: STEM }); }

  // ---------------------------------------------------------------- leaves and flowers
  spawn(p) {
    const rand = this.rand;
    this.count = (this.count || 0) + 1;
    // Roughly one flower for every two leaves, and letters mostly flower.
    p.flower = p.text ? rand() < 0.5 : this.count % 3 === 0;
    p.side = this.count % 2 ? 1 : -1;
    p.rot = p.ang + p.side * (0.7 + rand() * 0.6);      // which way it grows from the stem
    p.size = (p.flower ? 6.5 + rand() * 4 : 7 + rand() * 5) * clamp(0.75 + p.r / 6, 0.8, 1.6) * (p.text ? 0.6 : 1);
    p.grow = 0.7 + rand() * 0.6;                         // seconds to open
    p.hold = 3.6 + rand() * 1.2;                         // seconds before it wilts
    p.spin = (rand() - 0.5) * 2.4;
    p.sway = rand() * 6.3;
    p.fall = 26 + rand() * 30;
    p.petals = 5 + (rand() < 0.3 ? 1 : 0);
    p.k = 0; p.out = 0; p.dy = 0; p.dx = 0; p.turn = 0;
  }

  hurry(p) { p.hold = Math.min(p.hold, p.t + this.rand() * 0.5); }

  stepParticle(p, dt) {
    p.t += dt;
    // Open with a little overshoot, like something springing up.
    const u = clamp(p.t / p.grow, 0, 1);
    p.k = u < 1 ? 1 - Math.pow(1 - u, 3) * Math.cos(u * 4.2) : 1;
    const out = p.t - p.hold;
    if (out > 0) {
      p.out = smoothstep(0, p.flower ? 2.4 : 1.8, out);
      if (p.flower && !this.calm) {
        // Petals let go and drift down, turning as they fall.
        p.dy += p.fall * dt * (0.4 + p.out);
        p.dx = Math.sin(out * 2.2 + p.sway) * 9 * p.out;
        p.turn += p.spin * dt;
      }
      if (p.out >= 1) return false;
    }
    return true;
  }

  drawParticles(ctx, list) {
    ctx.save();
    // Leaves under flowers.
    for (const p of list) {
      if (p.flower || p.delay > 0) continue;
      const s = p.size * p.k * (1 - 0.75 * p.out);
      if (s <= 0.3) continue;
      // A wilting leaf curls towards the stem and browns.
      ctx.save();
      ctx.translate(p.hx, p.hy);
      ctx.rotate(p.rot + p.side * p.out * 0.9);
      ctx.globalAlpha = 1 - smoothstep(0.55, 1, p.out);
      ctx.fillStyle = mix('#4fa04a', '#6b5a2e', p.out);
      ctx.beginPath();
      ctx.moveTo(0, 0);
      ctx.quadraticCurveTo(s * 0.5, -s * 0.42, s, 0);
      ctx.quadraticCurveTo(s * 0.5, s * 0.42, 0, 0);
      ctx.fill();
      ctx.strokeStyle = 'rgba(20,50,20,0.5)';
      ctx.lineWidth = 0.7;
      ctx.beginPath(); ctx.moveTo(0, 0); ctx.lineTo(s * 0.85, 0); ctx.stroke();
      ctx.restore();
    }
    for (const p of list) {
      if (!p.flower || p.delay > 0) continue;
      const s = p.size * p.k;
      if (s <= 0.3) continue;
      // The flower sits just off the stem, on the side it grew from.
      const fx = p.hx + Math.cos(p.rot) * p.size * 0.5, fy = p.hy + Math.sin(p.rot) * p.size * 0.5;
      const a = 1 - smoothstep(0.5, 1, p.out);
      ctx.globalAlpha = a;
      ctx.fillStyle = p.ink;
      const spread = 1 + p.out * 1.6; // falling petals drift apart
      for (let i = 0; i < p.petals; i++) {
        const ang = p.rot + p.turn * (i % 2 ? 1 : -0.6) + (i / p.petals) * Math.PI * 2;
        const px = fx + p.dx * (0.6 + 0.2 * i) + Math.cos(ang) * s * 0.42 * spread;
        const py = fy + p.dy * (0.7 + 0.12 * i) + Math.sin(ang) * s * 0.42 * spread;
        ctx.beginPath();
        ctx.ellipse(px, py, s * 0.36, s * 0.24, ang, 0, Math.PI * 2);
        ctx.fill();
      }
      // The centre stays on the stem and fades.
      ctx.globalAlpha = a * (1 - p.out);
      ctx.fillStyle = p.ink === '#ffd24a' ? '#a8641e' : '#ffd24a';
      ctx.beginPath(); ctx.arc(fx, fy, s * 0.2, 0, Math.PI * 2); ctx.fill();
    }
    ctx.restore();
  }

  onBecome(n) { sfx.cue('bloom', { n }); }
}

// Blend two #rrggbb colours.
function mix(a, b, t) {
  const pa = parseInt(a.slice(1), 16), pb = parseInt(b.slice(1), 16);
  const ch = (sh) => Math.round(((pa >> sh) & 255) + (((pb >> sh) & 255) - ((pa >> sh) & 255)) * t);
  return `rgb(${ch(16)},${ch(8)},${ch(0)})`;
}

// Freshly turned soil from above: dark, crumbly, a few pebbles and a soft patch of light.
function paintSoil(W, H, dpr) {
  const rand = mulberry32(71);
  const { c, g } = stageCanvas(W, H, dpr);
  g.fillStyle = '#2a1d15';
  g.fillRect(0, 0, W, H);
  mottle(g, W, H, rand, { light: 26, dark: 70, scale: 7 });
  blob(g, W * 0.4, H * 0.35, W * 0.8, H * 0.5, 'rgba(120,84,52,0.22)');
  speckle(g, W, H, rand, (W * H) / 90, 'rgba(12,8,5,0.5)', 1.8);
  speckle(g, W, H, rand, (W * H) / 220, 'rgba(150,112,78,0.35)', 1.3);
  // Pebbles.
  for (let i = 0; i < (W * H) / 26000; i++) {
    const x = rand() * W, y = rand() * H, r = 2.5 + rand() * 5;
    g.fillStyle = 'rgba(0,0,0,0.35)';
    g.beginPath(); g.ellipse(x + 1.5, y + 2, r, r * 0.75, rand() * 3, 0, Math.PI * 2); g.fill();
    g.fillStyle = `rgb(${96 + rand() * 40 | 0},${88 + rand() * 30 | 0},${80 + rand() * 24 | 0})`;
    g.beginPath(); g.ellipse(x, y, r, r * 0.75, rand() * 3, 0, Math.PI * 2); g.fill();
  }
  // Darker towards the edges, like a bed with raised sides.
  const v = g.createRadialGradient(W / 2, H / 2, Math.min(W, H) * 0.3, W / 2, H / 2, Math.max(W, H) * 0.75);
  v.addColorStop(0, 'rgba(0,0,0,0)');
  v.addColorStop(1, 'rgba(0,0,0,0.5)');
  g.fillStyle = v; g.fillRect(0, 0, W, H);
  return c;
}
