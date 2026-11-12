// Fireflies: a Become environment.
//   Look:   a meadow at dusk. Your finger leaves a soft glowing line in the air.
//   Become: pause, and the line breaks into fireflies. They wake along the path you drew, one
//           after another, and blink there for a moment so the shape is still readable.
//   Leave:  then they lift off, wander up over the meadow and wink out.

import { clamp, mulberry32, smoothstep, makeCanvas } from '../lib/util.js';
import { BecomeScene } from '../lib/become.js';
import { stageCanvas, blob } from '../lib/fade.js';
import { sfx } from '../lib/sound.js';

const PALETTE = [
  { name: 'Firefly', color: '#d9f27a' },
  { name: 'Amber', color: '#ffc861' },
  { name: 'Moonlight', color: '#cfe4ff' },
  { name: 'Rose', color: '#ffa8c8' },
];

export const fireflies = {
  id: 'fireflies',
  name: 'Fireflies',
  mode: 'become',
  blurb: 'Pause, and your lines lift off as fireflies',
  surface: 'Dusk meadow to draw glowing lines on',
  clearLabel: 'Become now',
  clearIcon: 'M12 3l1.8 5.2L19 10l-5.2 1.8L12 17l-1.8-5.2L5 10l5.2-1.8zM18.5 15.5l.8 2.2 2.2.8-2.2.8-.8 2.2-.8-2.2-2.2-.8 2.2-.8z',
  palette: PALETTE,
  create: () => new Fireflies(),
};

class Fireflies extends BecomeScene {
  constructor() {
    super({ ink: PALETTE[0].color, brush: 3, spacing: 7, cap: 1500, seed: 23, settle: 9.5 });
    this.sprites = new Map();
  }

  paintBase() { return paintMeadow(this.W, this.H, this.dpr); }

  // A soft halo with a brighter core, in the chosen ink.
  paintSeg(g, x0, y0, r0, x1, y1, r1) {
    g.save();
    g.strokeStyle = this.ink;
    g.globalAlpha = 0.16;
    g.lineWidth = (r0 + r1) * 2.4;
    g.beginPath(); g.moveTo(x0, y0); g.lineTo(x1 + 0.01, y1); g.stroke();
    g.globalAlpha = 0.85;
    g.lineWidth = (r0 + r1) * 0.8;
    g.stroke();
    g.restore();
  }

  inkText(g) { g.shadowColor = g.fillStyle; g.shadowBlur = 8; }

  // ---------------------------------------------------------------- fireflies
  spawn(p) {
    const rand = this.rand;
    p.size = 0.7 + rand() * 0.8;
    p.bf = 2.2 + rand() * 2.6;          // blink speed
    p.bph = rand() * 6.3;
    p.wf = 0.8 + rand() * 1.4;          // wander speed
    p.wph = rand() * 6.3;
    p.leaveAt = 2.1 + rand() * 1.7;     // seconds on the line before lifting off
    p.life = 3 + rand() * 2.6;          // seconds in the air
    p.lift = 26 + rand() * 46;          // px/s upward once away
    p.side = (rand() - 0.5) * 30;       // a steady sideways lean
    p.vx = p.vy = 0;
    p.a = 0;
  }

  hurry(p) { p.leaveAt = Math.min(p.leaveAt, p.t + this.rand() * 0.6); }

  stepParticle(p, dt) {
    p.t += dt;
    const wake = smoothstep(0, 0.5, p.t);
    // Fireflies glow in slow pulses, each to its own rhythm.
    const pulse = 0.5 + 0.5 * Math.sin(p.t * p.bf + p.bph);
    let a = wake * (0.3 + 0.7 * pulse * pulse);
    if (p.t < p.leaveAt) {
      // Hovering on the line: a tiny restless wobble around home.
      const k = this.calm ? 0 : Math.min(1, p.t) * 1.6;
      p.x = p.hx + Math.sin(p.t * p.wf * 2.1 + p.wph) * k;
      p.y = p.hy + Math.cos(p.t * p.wf * 1.7 + p.wph * 1.3) * k;
    } else {
      const u = p.t - p.leaveAt;
      if (u >= p.life) return false;
      if (!this.calm) {
        // Ease up to a lazy climb, weaving from side to side.
        const tx = p.side + Math.sin(p.t * p.wf + p.wph) * 34;
        const ty = -p.lift + Math.cos(p.t * p.wf * 0.8 + p.wph) * 16;
        const ease = Math.min(1, dt * 1.6);
        p.vx += (tx - p.vx) * ease;
        p.vy += (ty - p.vy) * ease;
        p.x += p.vx * dt;
        p.y += p.vy * dt;
        if (p.y < -24 || p.x < -24 || p.x > this.W + 24) return false;
      }
      a *= 1 - smoothstep(this.calm ? 0.1 : 0.55, 1, u / p.life);
    }
    p.a = a;
    return true;
  }

  sprite(ink) {
    let s = this.sprites.get(ink);
    if (!s) {
      const n = 64;
      s = makeCanvas(n, n);
      const g = s.getContext('2d');
      const gr = g.createRadialGradient(n / 2, n / 2, 0, n / 2, n / 2, n / 2);
      gr.addColorStop(0, '#ffffff');
      gr.addColorStop(0.1, ink);
      gr.addColorStop(0.32, ink + '55');
      gr.addColorStop(1, ink + '00');
      g.fillStyle = gr;
      g.fillRect(0, 0, n, n);
      this.sprites.set(ink, s);
    }
    return s;
  }

  drawParticles(ctx, list) {
    ctx.save();
    ctx.globalCompositeOperation = 'lighter';
    for (const p of list) {
      if (p.delay > 0 || p.a <= 0.01) continue;
      const d = (15 + 13 * p.a) * p.size;
      ctx.globalAlpha = clamp(p.a, 0, 1);
      ctx.drawImage(this.sprite(p.ink), p.x - d / 2, p.y - d / 2, d, d);
    }
    ctx.restore();
  }

  onBecome(n) { sfx.cue('fireflies', { n }); }
}

// A meadow just after sunset: a deep teal sky with the last warm light on the horizon, a far
// line of trees, mist over the field and tall grass in the foreground.
function paintMeadow(W, H, dpr) {
  const rand = mulberry32(31);
  const { c, g } = stageCanvas(W, H, dpr);
  const horizon = H * 0.7;

  const sky = g.createLinearGradient(0, 0, 0, horizon);
  sky.addColorStop(0, '#060b1c');
  sky.addColorStop(0.5, '#0e1d36');
  sky.addColorStop(0.82, '#243a4e');
  sky.addColorStop(1, '#5a5148');
  g.fillStyle = sky; g.fillRect(0, 0, W, horizon + 2);
  // The last of the sunset, low and off to one side.
  blob(g, W * 0.28, horizon, W * 0.7, H * 0.16, 'rgba(255,170,96,0.22)');
  blob(g, W * 0.28, horizon, W * 0.32, H * 0.07, 'rgba(255,196,128,0.2)');

  // A few early stars, more of them higher up.
  for (let i = 0; i < (W * H) / 5200; i++) {
    const y = rand() * rand() * horizon * 0.8;
    g.fillStyle = `rgba(255,255,255,${0.15 + rand() * 0.45})`;
    g.beginPath(); g.arc(rand() * W, y, 0.4 + rand() * 0.7, 0, Math.PI * 2); g.fill();
  }
  // A thin crescent moon.
  const mx = W * 0.78, my = H * 0.13, mr = Math.min(W, H) * 0.035;
  blob(g, mx, my, mr * 4, mr * 4, 'rgba(200,220,255,0.1)');
  g.fillStyle = '#e8eefc';
  g.beginPath(); g.arc(mx, my, mr, 0, Math.PI * 2); g.fill();
  g.fillStyle = '#0c1830';
  g.beginPath(); g.arc(mx + mr * 0.45, my - mr * 0.15, mr * 0.95, 0, Math.PI * 2); g.fill();

  // Far tree line: lumpy silhouettes against the glow.
  g.fillStyle = '#0a1418';
  g.beginPath(); g.moveTo(0, horizon + 4);
  let x = -20;
  while (x < W + 40) {
    const w = 40 + rand() * 90, h = H * (0.012 + rand() * 0.03);
    g.quadraticCurveTo(x + w * 0.5, horizon - h * 2, x + w, horizon - h * 0.35);
    x += w;
  }
  g.lineTo(W + 40, horizon + 4); g.closePath(); g.fill();

  // The field, darker towards your feet.
  const field = g.createLinearGradient(0, horizon, 0, H);
  field.addColorStop(0, '#0d1d1c');
  field.addColorStop(0.5, '#08130f');
  field.addColorStop(1, '#030705');
  g.fillStyle = field; g.fillRect(0, horizon, W, H - horizon);
  // Mist lying in the dip of the field.
  for (let i = 0; i < 9; i++) {
    blob(g, rand() * W, horizon + H * 0.02 + rand() * H * 0.05, W * (0.2 + rand() * 0.3), H * 0.035, 'rgba(150,180,190,0.07)');
  }

  // Grass: rows of blades, taller and darker the closer they are.
  g.lineCap = 'round';
  for (let row = 0; row < 5; row++) {
    const t = row / 4;
    const by = horizon + (H - horizon) * (0.18 + 0.82 * t) + 6;
    const tall = H * (0.03 + 0.1 * t);
    const shade = Math.round(22 - 16 * t);
    g.strokeStyle = `rgb(${shade * 0.5 | 0},${shade + 6},${shade * 0.7 | 0})`;
    const gap = 5 - 1.5 * t;
    for (let bx = -6; bx < W + 6; bx += gap * (0.5 + rand())) {
      const h = tall * (0.45 + rand() * 0.75), lean = (rand() - 0.5) * h * 0.7;
      g.lineWidth = 0.8 + t * 1.6 * rand();
      g.beginPath();
      g.moveTo(bx, by);
      g.quadraticCurveTo(bx + lean * 0.2, by - h * 0.6, bx + lean, by - h);
      g.stroke();
    }
  }
  return c;
}
