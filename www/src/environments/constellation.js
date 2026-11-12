// Constellation: a Become environment.
//   Look:   a still night over the mountains. Your finger leaves a thin silver line.
//   Become: pause, and the line snaps into a constellation: a star at every end and corner,
//           joined by faint lines, each star arriving with a small flash.
//   Leave:  the joining lines fade first, then the stars dim back into the sky.

import { clamp, mulberry32, smoothstep, makeCanvas } from '../lib/util.js';
import { BecomeScene } from '../lib/become.js';
import { stageCanvas, blob } from '../lib/fade.js';
import { sfx } from '../lib/sound.js';

const PALETTE = [
  { name: 'Silver', color: '#dbe6ff' },
  { name: 'Gold', color: '#ffe2a0' },
  { name: 'Ice blue', color: '#9fd8ff' },
  { name: 'Rose', color: '#ffb8d0' },
];

export const constellation = {
  id: 'constellation',
  name: 'Constellation',
  mode: 'become',
  blurb: 'Pause, and your lines snap into stars',
  surface: 'Night sky to draw silver lines on',
  clearLabel: 'Become now',
  clearIcon: 'M5 17l5-9 5 6 4-8M5 17h.01M10 8h.01M15 14h.01M19 6h.01',
  palette: PALETTE,
  brushes: [
    { name: 'Silver line', size: 1 },
    { name: 'Hairline', size: 0.55, steady: 1 },
    { name: 'Bright line', size: 2.4 },
  ],
  create: () => new Constellation(),
};

const CORNER = 10;   // how far (CSS px) a line may bend before it earns a star
const REACH = 64;    // the longest gap between two joined stars

class Constellation extends BecomeScene {
  constructor() {
    super({ ink: PALETTE[0].color, brush: 1.7, spacing: 9, cap: 900, seed: 41, ghost: 1.1, settle: 8.5 });
    this.sprites = new Map();
  }

  paintBase() { return paintNight(this.W, this.H, this.dpr); }

  paintSeg(g, x0, y0, r0, x1, y1, r1) {
    g.save();
    g.strokeStyle = this.ink;
    g.globalAlpha = 0.14;
    g.lineWidth = (r0 + r1) * 2.6;
    g.beginPath(); g.moveTo(x0, y0); g.lineTo(x1 + 0.01, y1); g.stroke();
    g.globalAlpha = 0.8;
    g.lineWidth = (r0 + r1) * 0.75;
    g.stroke();
    g.restore();
  }

  inkText(g) { g.shadowColor = g.fillStyle; g.shadowBlur = 6; }

  // ---------------------------------------------------------------- stars
  // A star at every end and corner of a line (and along long stretches), each joined to the
  // one before it. Typed letters become a dusting of small stars with no lines.
  plan(paths, dots) {
    const seeds = [];
    let along = 0;
    for (const { pts, ink } of paths) {
      const line = [];
      for (let i = 0; i < pts.length; i += 3) line.push({ x: pts[i], y: pts[i + 1], r: pts[i + 2] });
      const corners = simplify(line, CORNER);
      let prev = null, last = null;
      for (const c of corners) {
        // Long straight stretches get smaller stars along the way.
        const gap = prev ? Math.hypot(c.x - prev.x, c.y - prev.y) : 0;
        const steps = Math.max(1, Math.ceil(gap / REACH));
        for (let k = 1; k <= steps; k++) {
          const t = k / steps;
          const at = prev ? { x: prev.x + (c.x - prev.x) * t, y: prev.y + (c.y - prev.y) * t } : c;
          along += gap / steps;
          last = { x: at.x, y: at.y, r: c.r, ink, along, fixed: true, link: last, big: k === steps };
          seeds.push(last);
        }
        prev = c;
      }
      along += 30; // a beat between one line and the next
    }
    const keep = Math.min(1, 220 / Math.max(1, dots.length)) * 0.5;
    for (const d of dots) {
      if (this.rand() < keep) seeds.push({ ...d, along: (along += 6), link: null, big: false, dust: true });
    }
    return seeds;
  }

  spawn(p) {
    const rand = this.rand;
    p.size = p.dust ? 0.45 + rand() * 0.3 : p.big ? 0.95 + rand() * 0.5 : 0.6 + rand() * 0.25;
    p.tf = 1.6 + rand() * 2.4;
    p.tph = rand() * 6.3;
    p.hold = 3 + rand() * 0.8;   // seconds the constellation stands
    p.a = 0; p.la = 0; p.pop = 0;
  }

  onBecome(n) {
    // plan() linked seeds to each other; point each star at the star made from its seed.
    const made = this.particles.slice(-n);
    for (const p of made) p.prev = p.link?.particle || null;
    sfx.cue('constellation', { n: made.filter((p) => !p.dust).length });
  }

  hurry(p) { p.hold = Math.min(p.hold, p.t + 0.2); }

  stepParticle(p, dt) {
    p.t += dt;
    const wake = smoothstep(0, 0.35, p.t);
    p.pop = 1 - smoothstep(0, 0.6, p.t);                       // the arriving flash
    const twinkle = 0.78 + 0.22 * Math.sin(p.t * p.tf + p.tph);
    const out = p.t - p.hold;
    p.la = smoothstep(0.1, 0.7, p.t) * (1 - smoothstep(0, 1.1, out));   // lines go first
    p.a = wake * twinkle * (1 - smoothstep(0.8, 3.6, out));             // then the stars
    return out < 3.7;
  }

  sprite(ink) {
    let s = this.sprites.get(ink);
    if (!s) {
      const n = 64, c = n / 2;
      s = makeCanvas(n, n);
      const g = s.getContext('2d');
      const gr = g.createRadialGradient(c, c, 0, c, c, c);
      gr.addColorStop(0, '#ffffff');
      gr.addColorStop(0.08, '#ffffff');
      gr.addColorStop(0.2, ink + 'aa');
      gr.addColorStop(0.5, ink + '22');
      gr.addColorStop(1, ink + '00');
      g.fillStyle = gr; g.fillRect(0, 0, n, n);
      // Four fine rays.
      g.strokeStyle = '#ffffff';
      g.globalAlpha = 0.75;
      g.lineWidth = 1;
      g.beginPath(); g.moveTo(c, 6); g.lineTo(c, n - 6); g.moveTo(6, c); g.lineTo(n - 6, c); g.stroke();
      this.sprites.set(ink, s);
    }
    return s;
  }

  drawParticles(ctx, list) {
    ctx.save();
    ctx.globalCompositeOperation = 'lighter';
    ctx.lineCap = 'round';
    ctx.lineWidth = 1.1;
    for (const p of list) {
      const q = p.prev;
      if (!q || p.delay > 0 || p.la <= 0.01) continue;
      // The line reaches out from the star before it.
      const grow = smoothstep(0, 0.45, p.t);
      ctx.strokeStyle = p.ink;
      ctx.globalAlpha = 0.5 * Math.min(p.la, q.delay > 0 ? 0 : Math.max(q.la, p.la));
      ctx.beginPath();
      ctx.moveTo(q.x, q.y);
      ctx.lineTo(q.x + (p.x - q.x) * grow, q.y + (p.y - q.y) * grow);
      ctx.stroke();
    }
    for (const p of list) {
      if (p.delay > 0 || p.a <= 0.01) continue;
      const d = (20 + 26 * p.pop) * p.size;
      ctx.globalAlpha = clamp(p.a, 0, 1);
      ctx.drawImage(this.sprite(p.ink), p.x - d / 2, p.y - d / 2, d, d);
    }
    ctx.restore();
  }
}

// Ramer-Douglas-Peucker: keep the ends and every point where the line bends by more than `tol`.
function simplify(line, tol) {
  if (line.length < 3) return line.length === 2 && Math.hypot(line[1].x - line[0].x, line[1].y - line[0].y) < 4 ? [line[0]] : line.slice();
  const keep = new Uint8Array(line.length);
  keep[0] = keep[line.length - 1] = 1;
  const stack = [[0, line.length - 1]];
  while (stack.length) {
    const [a, b] = stack.pop();
    const A = line[a], B = line[b];
    const dx = B.x - A.x, dy = B.y - A.y, len = Math.hypot(dx, dy) || 1;
    let far = -1, most = tol;
    for (let i = a + 1; i < b; i++) {
      // Closed shapes end where they began: measure from the start point then.
      const d = len < 2 ? Math.hypot(line[i].x - A.x, line[i].y - A.y) : Math.abs((line[i].x - A.x) * dy - (line[i].y - A.y) * dx) / len;
      if (d > most) { most = d; far = i; }
    }
    if (far > 0) { keep[far] = 1; stack.push([a, far], [far, b]); }
  }
  return line.filter((_, i) => keep[i]);
}

// A clear night over a mountain lake: deep indigo, a band of faint stars, dark ridges.
function paintNight(W, H, dpr) {
  const rand = mulberry32(53);
  const { c, g } = stageCanvas(W, H, dpr);
  const sky = g.createLinearGradient(0, 0, 0, H);
  sky.addColorStop(0, '#04050f');
  sky.addColorStop(0.55, '#0b1030');
  sky.addColorStop(0.85, '#1b1f4a');
  sky.addColorStop(1, '#2a2552');
  g.fillStyle = sky; g.fillRect(0, 0, W, H);
  // A faint violet haze where the Milky Way would be.
  for (let i = 0; i < 26; i++) {
    const t = rand();
    blob(g, W * (1 - t) * 1.1 - W * 0.05, H * 0.08 + t * H * 0.6 + (rand() - 0.5) * 50, 60 + rand() * 70, 34 + rand() * 40, 'rgba(140,130,220,0.05)');
  }
  // Background stars: small and dim, so the ones you make stand out.
  for (let i = 0; i < (W * H) / 900; i++) {
    g.fillStyle = `rgba(255,255,255,${0.06 + rand() * rand() * 0.5})`;
    g.fillRect(rand() * W, rand() * H * 0.9, 0.9, 0.9);
  }
  // Two mountain ridges, the nearer one darker.
  const ridge = (base, rough, col, seed) => {
    const r = mulberry32(seed);
    g.fillStyle = col;
    g.beginPath(); g.moveTo(0, H);
    let y = base;
    for (let x = 0; x <= W + 12; x += 12) {
      y += (r() - 0.5) * rough;
      y += (base - y) * 0.08;
      g.lineTo(x, y);
    }
    g.lineTo(W, H); g.closePath(); g.fill();
  };
  ridge(H * 0.86, H * 0.035, '#0c0f2a', 7);
  ridge(H * 0.92, H * 0.028, '#05060f', 19);
  return c;
}
