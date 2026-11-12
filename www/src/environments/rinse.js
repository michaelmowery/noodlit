// Rinse water: a Stir environment.
//   Look:  a white dish of clean water from above. Your brush leaves a line of paint in it.
//   Stir:  the water is turning. Colours are drawn out into ribbons, cross and mix where they
//          overlap, and thin away. Every line that mixes in tints the water a little, so the
//          dish slowly goes the colour of everything you've put in it. The Stir stick brush
//          adds no paint: it drags what's there.
//   Clear: "Fresh water" whirls it all in and the dish runs clear again.

import { mulberry32 } from '../lib/util.js';
import { stageCanvas, blob } from '../lib/fade.js';
import { StirScene } from '../lib/stir.js';

const PALETTE = [
  { name: 'Ultramarine', color: '#2f4fbf' },
  { name: 'Crimson', color: '#d0344a' },
  { name: 'Sap green', color: '#3f9a4d' },
  { name: 'Cadmium yellow', color: '#f2b418' },
  { name: 'Violet', color: '#7b3fa8' },
  { name: 'Black ink', color: '#22252b' },
];

export const rinse = {
  id: 'rinse',
  name: 'Rinse water',
  mode: 'stir',
  blurb: 'Paint swirls and mingles in the rinse jar',
  surface: 'Dish of clean water to paint in',
  clearLabel: 'Fresh water',
  clearIcon: 'M12 3.5c3 4 5.5 7 5.5 10.2a5.5 5.5 0 0 1-11 0C6.5 10.5 9 7.5 12 3.5zM9.5 14.5a2.5 2.5 0 0 0 2.5 2.5',
  palette: PALETTE,
  create: () => new Rinse(),
};

const rgb = (hex) => { const n = parseInt(hex.slice(1), 16); return [n >> 16, (n >> 8) & 255, n & 255]; };

class Rinse extends StirScene {
  constructor() {
    super({ ink: PALETTE[0].color, brush: 5, blend: 'multiply', body: 0.78, edge: 0.3, spread: 1.7, turns: 0.75 });
    this.murk = { c: [255, 255, 255], a: 0 }; // what the water has taken up so far
    this.fresh = false;
  }

  paintBase() { return paintDish(this.W, this.H, this.dpr); }

  // A line that has mixed in tints the water.
  onExpire(ln) {
    const add = ln.dots ? 0.012 : 0.03, m = this.murk, c = rgb(ln.ink);
    const a = Math.min(0.42, m.a + add), w = add / (m.a + add);
    m.c = m.c.map((v, i) => v + (c[i] - v) * w);
    m.a = a;
  }

  drawUnder(ctx) {
    const m = this.murk;
    if (m.a <= 0.003) return;
    ctx.fillStyle = `rgba(${m.c.map(Math.round)},${m.a})`;
    ctx.fillRect(0, 0, this.W, this.H);
  }

  clear() {
    const had = this.lines.length > 0;
    super.clear();
    if (!had && this.murk.a > 0) this.fresh = true; // nothing to whirl: just change the water
  }
  whirled() { this.fresh = true; }
  get clearing() { return this.whirl > 0 || this.fresh; }

  // The tinted water runs clear.
  settling(dt) {
    if (!this.fresh) return false;
    this.murk.a = Math.max(0, this.murk.a - dt / 0.9);
    if (this.murk.a === 0) { this.fresh = false; this.murk.c = [255, 255, 255]; }
    return true;
  }
}

// A white enamel dish of water, close enough that its rim is out of frame: pale and cool,
// with soft light moving on the bottom.
function paintDish(W, H, dpr) {
  const rand = mulberry32(17);
  const { c, g } = stageCanvas(W, H, dpr);
  const cx = W / 2, cy = H * 0.46, far = Math.hypot(W, H) * 0.62;
  const gr = g.createRadialGradient(cx, cy, 0, cx, cy, far);
  gr.addColorStop(0, '#f7fafc');
  gr.addColorStop(0.55, '#e9f0f4');
  gr.addColorStop(1, '#bfcdd6');
  g.fillStyle = gr; g.fillRect(0, 0, W, H);
  // Caustics: faint bright ripples of light on the bottom of the dish.
  g.lineCap = 'round';
  for (let k = 0; k < 34; k++) {
    const r = far * (0.06 + rand() * 0.9), a0 = rand() * Math.PI * 2, sweep = 0.4 + rand() * 1.3;
    g.strokeStyle = rand() > 0.4 ? `rgba(255,255,255,${0.25 + rand() * 0.4})` : `rgba(150,180,200,${0.05 + rand() * 0.08})`;
    g.lineWidth = 2 + rand() * 10;
    g.beginPath();
    for (let t = 0; t <= 1.001; t += 0.05) {
      const a = a0 + sweep * t, rr = r * (1 + 0.1 * Math.sin(t * 5 + k));
      g.lineTo(cx + Math.cos(a) * rr, cy + Math.sin(a) * rr);
    }
    g.stroke();
  }
  blob(g, cx - W * 0.22, cy - H * 0.2, W * 0.5, H * 0.26, 'rgba(255,255,255,0.5)');
  const vg = g.createRadialGradient(cx, cy, Math.min(W, H) * 0.4, cx, cy, far);
  vg.addColorStop(0, 'rgba(60,80,100,0)');
  vg.addColorStop(1, 'rgba(60,80,100,0.28)');
  g.fillStyle = vg; g.fillRect(0, 0, W, H);
  return c;
}
