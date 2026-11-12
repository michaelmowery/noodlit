// Frosted window: a Fade environment.
//   Look:  your fingertip melts clear lines through feathery frost on a cold window; behind it
//          a snowy blue evening with pines and a few warm lit windows down the hill.
//   Decay: frost creeps back in from the edges of the pane first, then fills the middle.
//   Clear: a cold snap: frost grows in from every edge until the whole pane is white.

import { clamp, easeInOut, mulberry32, makeCanvas } from '../lib/util.js';
import { MapFade, stageCanvas, blurred, blob, mottle } from '../lib/fade.js';
import { sfx } from '../lib/sound.js';

export const frost = {
  id: 'frost',
  name: 'Frosted window',
  blurb: 'Frost creeps back over your lines',
  surface: 'Frosted window pane drawing surface',
  clearLabel: 'Cold snap',
  clearIcon: 'M12 3v18M4.2 7.5l15.6 9M4.2 16.5l15.6-9M9.5 4.5 12 7l2.5-2.5M9.5 19.5 12 17l2.5 2.5',
  create: () => new Frost(),
};

class Frost extends MapFade {
  constructor() {
    super({ cover: true, brush: 11, edgeFirst: 0.25, seed: 31 });
  }

  // Frost comes back fastest near the frame and along fern-like fronts.
  decayAt(x, y, coarse, fine) {
    const m = Math.min(this.W, this.H) / 2;
    const edge = clamp(Math.min(x, this.W - x, y, this.H - y) / m, 0, 1);
    return 0.45 + 1.15 * Math.pow(1 - edge, 1.6) + 0.45 * coarse + 0.3 * (fine - 0.5);
  }

  paintBase() { return paintEvening(this.W, this.H, this.dpr); }

  paintLayer() {
    const { W, H, dpr } = this;
    const rand = mulberry32(5);
    const c = blurred(this.base, W, H, dpr, 22), g = c.getContext('2d');
    g.scale(dpr, dpr);
    g.fillStyle = 'rgba(214,230,244,0.78)';
    g.fillRect(0, 0, W, H);
    // Thicker frost around the frame.
    const e = g.createRadialGradient(W / 2, H / 2, Math.min(W, H) * 0.25, W / 2, H / 2, Math.max(W, H) * 0.75);
    e.addColorStop(0, 'rgba(255,255,255,0)');
    e.addColorStop(1, 'rgba(250,253,255,0.55)');
    g.fillStyle = e; g.fillRect(0, 0, W, H);
    mottle(g, W, H, rand, { light: 50, dark: 22, scale: 7 });
    // Fern frost: branching crystal feathers.
    g.lineCap = 'round';
    const fern = (x, y, a, len, depth) => {
      if (len < 3 || depth > 5) return;
      const x2 = x + Math.cos(a) * len, y2 = y + Math.sin(a) * len;
      g.strokeStyle = `rgba(255,255,255,${0.22 + 0.1 * (5 - depth) / 5})`;
      g.lineWidth = Math.max(0.5, 1.6 - depth * 0.25);
      g.beginPath(); g.moveTo(x, y); g.lineTo(x2, y2); g.stroke();
      const n = 3 + (rand() * 3 | 0);
      for (let i = 1; i <= n; i++) {
        const t = i / (n + 1), bx = x + (x2 - x) * t, by = y + (y2 - y) * t;
        const bl = len * (0.42 - t * 0.2);
        fern(bx, by, a + 0.9 + rand() * 0.25, bl, depth + 1);
        fern(bx, by, a - 0.9 - rand() * 0.25, bl, depth + 1);
      }
    };
    const count = Math.round((W + H) / 30);
    for (let i = 0; i < count; i++) {
      // Grow from the frame inwards.
      const side = rand() * 4 | 0;
      const t = rand();
      const [x, y, a] = side === 0 ? [t * W, 0, Math.PI / 2] : side === 1 ? [W, t * H, Math.PI]
        : side === 2 ? [t * W, H, -Math.PI / 2] : [0, t * H, 0];
      fern(x, y, a + (rand() - 0.5) * 1.2, 40 + rand() * Math.min(W, H) * 0.22, 0);
    }
    // Ice sparkle.
    for (let i = 0; i < (W * H) / 260; i++) {
      const x = rand() * W, y = rand() * H, r = 0.3 + rand() * rand() * 1.4;
      g.fillStyle = `rgba(255,255,255,${0.35 + rand() * 0.5})`;
      g.beginPath(); g.arc(x, y, r, 0, Math.PI * 2); g.fill();
    }
    return c;
  }

  clear() {
    sfx.cue('frost');
    this.strokes.clear();
    this.clearing = { t: 0, dur: 1.5, prev: 0 };
  }

  clearStep(cl) {
    const p = Math.min(1, cl.t / cl.dur);
    const m = Math.min(this.W, this.H) / 2 + 60, soft = 70;
    cl.front = easeInOut(p) * m;
    const f = cl.front;
    this.scaleCells((x, y) => clamp((Math.min(x, this.W - x, y, this.H - y) - f + soft) / soft, 0, 1));
    if (p >= 1) { this.map.fill(0); return false; }
    return true;
  }

  drawFx(ctx) {
    const cl = this.clearing;
    if (!cl) return;
    const f = cl.front, { W, H } = this;
    ctx.save();
    ctx.strokeStyle = 'rgba(240,250,255,0.22)';
    ctx.lineWidth = 14;
    ctx.shadowColor = 'rgba(255,255,255,0.9)';
    ctx.shadowBlur = 24;
    ctx.strokeRect(f - 12, f - 12, W - 2 * f + 24, H - 2 * f + 24);
    ctx.restore();
  }
}

// What's outside: a snowy hillside at blue hour.
function paintEvening(W, H, dpr) {
  const rand = mulberry32(12);
  const { c, g } = stageCanvas(W, H, dpr);
  const sky = g.createLinearGradient(0, 0, 0, H);
  sky.addColorStop(0, '#1d2b4f');
  sky.addColorStop(0.5, '#3c5584');
  sky.addColorStop(0.75, '#8496bd');
  sky.addColorStop(1, '#c6cfe4');
  g.fillStyle = sky; g.fillRect(0, 0, W, H);
  for (let i = 0; i < (W * H) / 5000; i++) {
    g.fillStyle = `rgba(255,255,255,${0.3 + rand() * 0.5})`;
    g.beginPath(); g.arc(rand() * W, rand() * H * 0.4, 0.5 + rand() * 0.8, 0, Math.PI * 2); g.fill();
  }
  // Rolling snowy hills.
  const hill = (y0, amp, col, ph) => {
    g.fillStyle = col;
    g.beginPath(); g.moveTo(0, H);
    for (let x = 0; x <= W + 10; x += 10) g.lineTo(x, y0 + Math.sin(x / W * 3 + ph) * amp + Math.sin(x / W * 9 + ph * 2) * amp * 0.25);
    g.lineTo(W, H); g.fill();
  };
  hill(H * 0.62, 26, '#a9b6d4', 1);
  // Pines on the far hill.
  const pine = (x, y, h, col) => {
    g.fillStyle = col;
    for (let k = 0; k < 3; k++) {
      const w = h * (0.36 - k * 0.07), top = y - h * (0.35 + k * 0.3);
      g.beginPath(); g.moveTo(x, top - h * 0.25); g.lineTo(x + w, top + h * 0.22); g.lineTo(x - w, top + h * 0.22); g.fill();
    }
  };
  for (let i = 0; i < W / 26; i++) pine(rand() * W, H * 0.62 + 10 + rand() * 20, 30 + rand() * 30, '#2e3d5c');
  // Warm lit cabin windows.
  for (let i = 0; i < 4; i++) {
    const x = W * (0.15 + i * 0.22 + rand() * 0.08), y = H * (0.66 + rand() * 0.05);
    g.fillStyle = '#3a3346';
    g.fillRect(x - 16, y - 12, 32, 22);
    g.beginPath(); g.moveTo(x - 20, y - 12); g.lineTo(x, y - 28); g.lineTo(x + 20, y - 12); g.fill();
    g.fillStyle = '#f2f4fb';
    g.beginPath(); g.moveTo(x - 21, y - 12); g.lineTo(x, y - 29); g.lineTo(x + 21, y - 12); g.lineTo(x + 14, y - 12); g.lineTo(x, y - 22); g.lineTo(x - 14, y - 12); g.fill();
    blob(g, x - 6, y - 3, 22, 22, 'rgba(255,190,110,0.35)');
    g.fillStyle = '#ffc775';
    g.fillRect(x - 10, y - 6, 7, 7); g.fillRect(x + 3, y - 6, 7, 7);
  }
  hill(H * 0.8, 18, '#d3dbec', 3);
  for (let i = 0; i < W / 60; i++) pine(rand() * W, H * 0.82 + rand() * 30, 70 + rand() * 50, '#1f2b45');
  hill(H * 0.92, 10, '#eef2fa', 5);
  // A little warm light from inside the room reflecting on the glass.
  blob(g, W * 0.85, H * 0.1, W * 0.4, H * 0.25, 'rgba(255,200,140,0.12)');
  return c;
}
