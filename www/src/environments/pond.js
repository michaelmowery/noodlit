// Pond ripples: an Echo environment.
//   Look:   a still pond at dusk, seen from above, lily pads round the edges. Your finger
//           leaves a faint line of light on the water.
//   Echo:   pause, and a drop of light runs along every line in the order you drew it. The
//           line is drawn in ripples: rings spread out from it, cross, and soften. A second,
//           gentler pass follows, the way a thought keeps going round.
//   Leave:  the rings spread wide and the water goes still again.

import { mulberry32 } from '../lib/util.js';
import { EchoScene } from '../lib/echo.js';
import { stageCanvas, blob } from '../lib/fade.js';
import { sfx } from '../lib/sound.js';

const PALETTE = [
  { name: 'Moonlight', color: '#d8e8ff' },
  { name: 'Dusk gold', color: '#ffd38a' },
  { name: 'Lily pink', color: '#ffb3cf' },
  { name: 'Reed green', color: '#bfe8a8' },
];

const GAP = 16;       // px between ripples along a line
const LIFE = 2.4;     // seconds a ripple lasts
const MAX = 260;

export const pond = {
  id: 'pond',
  name: 'Pond ripples',
  mode: 'echo',
  blurb: 'Pause, and your lines play back as ripples',
  surface: 'Still pond at dusk to draw on',
  clearLabel: 'Ripple now',
  clearIcon: 'M12 12m-2 0a2 2 0 1 0 4 0a2 2 0 1 0-4 0M12 12m-5.5 0a5.5 5.5 0 1 0 11 0a5.5 5.5 0 1 0-11 0M12 12m-9 0a9 9 0 1 0 18 0a9 9 0 1 0-18 0',
  palette: PALETTE,
  create: () => new Pond(),
};

class Pond extends EchoScene {
  constructor() {
    super({
      ink: PALETTE[0].color, brush: 2.6, seed: 33, sparks: false,
      passes: [
        { rate: 0.8, alpha: 0.85, hold: 0.2, fade: 1.6 },
        { gap: 0.4, rate: 1, alpha: 0.4, hold: 0.2, fade: 1.4 },
      ],
    });
    this.ripples = [];
    this.carry = 0;
    this.pass = 0;
  }

  setup() { super.setup(); this.ripples = []; }

  paintBase() { return paintPond(this.W, this.H, this.dpr); }

  paintSeg(g, x0, y0, r0, x1, y1, r1, ink = this.ink) {
    g.save();
    g.strokeStyle = ink;
    g.beginPath(); g.moveTo(x0, y0); g.lineTo(x1 + 0.01, y1);
    if (this.playing) {
      // A thin line of light on the water, with rings spreading out from it.
      g.shadowColor = ink; g.shadowBlur = 6 * this.dpr;
      g.globalAlpha = 0.55; g.lineWidth = Math.max(1, (r0 + r1) * 0.5); g.stroke();
      this.drops(x0, y0, x1, y1, (r0 + r1) / 2, ink);
    } else {
      g.globalAlpha = 0.5; g.lineWidth = Math.max(1, (r0 + r1) * 0.6); g.stroke();
    }
    g.restore();
  }

  drops(x0, y0, x1, y1, r, ink) {
    const d = Math.hypot(x1 - x0, y1 - y0);
    let at = d === 0 ? 0 : GAP - this.carry;
    if (d === 0 && this.carry > 0) return;
    const strength = this.pass ? 0.45 : 1;
    while (at <= d) {
      const t = d ? at / d : 0;
      if (this.ripples.length < MAX) this.ripples.push({ x: x0 + (x1 - x0) * t, y: y0 + (y1 - y0) * t, t: 0, size: 22 + r * 7, ink, a: strength });
      at += GAP;
    }
    this.carry = d === 0 ? 0 : (this.carry + d) % GAP;
    if (!this.pass) sfx.cue('drip');
  }

  onStroke(n) { this.pass = n; this.carry = 0; }

  inkText(g) { if (this.playing) { g.shadowColor = g.fillStyle; g.shadowBlur = 6 * this.dpr; } else g.globalAlpha = 0.5; }

  // Typed words come back a letter at a time; each new letter drops a ring where it lands.
  drawPartial(g, block, n) {
    if (n !== this.lastLetter && this.ripples.length < MAX) {
      this.lastLetter = n;
      const { lay, place } = block, line = lay.lines[0] || '';
      const w = lay.size * 0.5 * line.length;
      const x = place.align === 'center' ? place.x - w / 2 + Math.min(n, line.length) * lay.size * 0.5 : place.x + n * lay.size * 0.5;
      this.ripples.push({ x, y: place.y0, t: 0, size: lay.size * 0.9, ink: block.ink, a: 0.8 });
    }
    super.drawPartial(g, block, n);
  }

  updateFx(dt) {
    const alive = super.updateFx(dt);
    for (const r of this.ripples) r.t += dt;
    this.ripples = this.ripples.filter((r) => r.t < LIFE);
    return alive || this.ripples.length > 0;
  }

  get clearing() { return this.replays.length > 0 || this.ripples.length > 0; }

  drawFront(ctx) {
    super.drawFront(ctx);
    if (!this.ripples.length) return;
    ctx.save();
    ctx.globalCompositeOperation = 'lighter';
    for (const r of this.ripples) {
      const u = r.t / LIFE, rad = 2 + r.size * (this.calm ? 0.4 : 1) * Math.sqrt(u);
      const a = r.a * (1 - u) * (1 - u);
      ctx.strokeStyle = r.ink;
      ctx.globalAlpha = a * 0.55;
      ctx.lineWidth = 1.4;
      ctx.beginPath(); ctx.arc(r.x, r.y, rad, 0, Math.PI * 2); ctx.stroke();
      ctx.globalAlpha = a * 0.25;
      ctx.lineWidth = 1;
      ctx.beginPath(); ctx.arc(r.x, r.y, rad * 0.62, 0, Math.PI * 2); ctx.stroke();
    }
    ctx.restore();
  }

  // The drop of light that runs the line.
  drawHead(ctx, h) {
    const gr = ctx.createRadialGradient(h.x, h.y, 0, h.x, h.y, 10);
    gr.addColorStop(0, '#ffffff');
    gr.addColorStop(0.4, h.ink);
    gr.addColorStop(1, h.ink + '00');
    ctx.globalCompositeOperation = 'lighter';
    ctx.fillStyle = gr;
    ctx.beginPath(); ctx.arc(h.x, h.y, 10, 0, Math.PI * 2); ctx.fill();
    ctx.globalCompositeOperation = 'source-over';
  }
}

// A dark, still pond from above: deep blue-green, the dusk sky's glow on it, lily pads at the
// edges and a few reeds' reflections.
function paintPond(W, H, dpr) {
  const rand = mulberry32(73);
  const { c, g } = stageCanvas(W, H, dpr);
  const gr = g.createLinearGradient(0, 0, 0, H);
  gr.addColorStop(0, '#16263a');
  gr.addColorStop(0.5, '#0e1d2b');
  gr.addColorStop(1, '#0a1620');
  g.fillStyle = gr; g.fillRect(0, 0, W, H);
  blob(g, W * 0.65, H * 0.3, W * 0.7, H * 0.25, 'rgba(255,170,140,0.08)');
  blob(g, W * 0.3, H * 0.75, W * 0.6, H * 0.2, 'rgba(120,170,200,0.06)');
  // Reflected stars, a little smeared.
  for (let k = 0; k < (W * H) / 6000; k++) {
    g.fillStyle = `rgba(255,255,255,${0.08 + rand() * 0.25})`;
    g.fillRect(rand() * W, rand() * H, 0.8 + rand() * 2.4, 0.8);
  }
  // Lily pads around the edges.
  const pad = (x, y, r) => {
    const a = rand() * Math.PI * 2;
    g.fillStyle = `rgb(${30 + rand() * 20 | 0},${80 + rand() * 30 | 0},${50 + rand() * 20 | 0})`;
    g.beginPath(); g.moveTo(x, y); g.arc(x, y, r, a + 0.25, a + Math.PI * 2 - 0.25); g.closePath(); g.fill();
    g.strokeStyle = 'rgba(160,220,150,0.18)'; g.lineWidth = 1;
    for (let k = 0; k < 6; k++) { const t = a + 0.5 + k * 0.95; g.beginPath(); g.moveTo(x, y); g.lineTo(x + Math.cos(t) * r * 0.85, y + Math.sin(t) * r * 0.85); g.stroke(); }
    if (rand() < 0.3) {
      g.fillStyle = '#f6c9dc';
      for (let k = 0; k < 7; k++) { const t = (k / 7) * Math.PI * 2; g.beginPath(); g.ellipse(x + Math.cos(t) * r * 0.2, y + Math.sin(t) * r * 0.2, r * 0.22, r * 0.1, t, 0, Math.PI * 2); g.fill(); }
      g.fillStyle = '#ffe18a'; g.beginPath(); g.arc(x, y, r * 0.08, 0, Math.PI * 2); g.fill();
    }
  };
  const s = Math.min(W, H);
  for (let k = 0; k < 14; k++) {
    const side = k % 4, t = rand();
    const x = side === 0 ? t * W : side === 1 ? W - rand() * s * 0.08 : side === 2 ? t * W : rand() * s * 0.08;
    const y = side === 0 ? rand() * s * 0.08 + 50 : side === 2 ? H - rand() * s * 0.1 - 20 : t * H;
    pad(x, y, s * (0.04 + rand() * 0.04));
  }
  return c;
}
