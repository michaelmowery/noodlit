// Galaxy: a Stir environment.
//   Look:  deep space. Your finger leaves a trail of stardust: a soft glow with stars in it.
//   Stir:  the galaxy turns, faster near the middle, so every line is wound into a spiral arm
//          and thins away. Everything that winds in feeds the bright core a little. The
//          Gravity brush lays nothing down: it drags the stars around.
//   Clear: "Spin" whirls it all into the core.

import { mulberry32, smoothstep } from '../lib/util.js';
import { stageCanvas, blob } from '../lib/fade.js';
import { StirScene } from '../lib/stir.js';

const PALETTE = [
  { name: 'Nebula pink', color: '#ff7ac6' },
  { name: 'Blue giant', color: '#7fb4ff' },
  { name: 'Starlight', color: '#fff1c9' },
  { name: 'Aurora', color: '#6ff0c4' },
  { name: 'Red dwarf', color: '#ff8a5c' },
];

export const galaxy = {
  id: 'galaxy',
  name: 'Galaxy',
  mode: 'stir',
  blurb: 'Your lines turn to stardust and wind into spiral arms',
  surface: 'Deep space to draw stardust in',
  clearLabel: 'Spin',
  clearIcon: 'M12 12m-1.5 0a1.5 1.5 0 1 0 3 0a1.5 1.5 0 1 0-3 0M12 10.5C12 6 16 4 19 6M13.5 12c4.5 0 6.5 4 4.5 7M12 13.5c0 4.5-4 6.5-7 4.5M10.5 12C6 12 4 8 6 5',
  palette: PALETTE,
  create: () => new Galaxy(),
};

const hash = (i) => { const x = Math.sin(i * 91.7 + 3.1) * 43758.5453; return x - Math.floor(x); };

class Galaxy extends StirScene {
  constructor() {
    super({ ink: PALETTE[0].color, brush: 4, blend: 'lighter', body: 0.16, edge: 0.14, spread: 2.2, turns: 1.6, cue: 'constellation' });
    this.core = 0;    // how much has wound into the core lately (0..1)
    this.clock = 0;
  }

  paintBase() { return paintSpace(this.W, this.H, this.dpr); }

  onExpire(ln) { this.core = Math.min(1, this.core + (ln.dots ? 0.03 : 0.08)); }

  update(dt) {
    this.clock += dt;
    const alive = super.update(dt);
    if (this.core > 0.002) { this.core *= Math.pow(0.5, dt / 3); return true; }
    return alive;
  }

  // The glow of each line (the base drawLines, soft and additive), then the stars in it.
  drawLines(ctx, reflection) {
    super.drawLines(ctx, reflection);
    const { life, clock } = this;
    for (const ln of this.lines) {
      const u = ln.age / life, a = 1 - smoothstep(0.5, 1, u);
      if (a <= 0.01) continue;
      const p = ln.pts, every = ln.dots ? 6 : 2;
      for (let i = 0; i < p.length; i += every) {
        const h = hash(i), tw = 0.55 + 0.45 * Math.sin(clock * (2 + h * 4) + h * 20);
        const s = 0.8 + h * 1.8;
        ctx.globalAlpha = a * tw;
        ctx.fillStyle = h > 0.7 ? '#ffffff' : ln.ink;
        ctx.fillRect(p[i] + (hash(i + 1) - 0.5) * ln.r * 4 - s / 2, p[i + 1] + (hash(i + 2) - 0.5) * ln.r * 4 - s / 2, s, s);
      }
    }
  }

  // The core: brighter for whatever has fallen in.
  drawUnder(ctx) {
    const { cx, cy, R } = this, k = 0.25 + this.core * 0.75;
    const r = R * (0.18 + this.core * 0.12);
    ctx.save();
    ctx.globalCompositeOperation = 'lighter';
    const gr = ctx.createRadialGradient(cx, cy, 0, cx, cy, r);
    gr.addColorStop(0, `rgba(255,246,225,${0.55 * k})`);
    gr.addColorStop(0.3, `rgba(255,200,170,${0.22 * k})`);
    gr.addColorStop(1, 'rgba(255,180,200,0)');
    ctx.fillStyle = gr;
    ctx.beginPath(); ctx.arc(cx, cy, r, 0, Math.PI * 2); ctx.fill();
    ctx.restore();
  }
}

// Deep space: near-black blue, faint dust clouds, thousands of distant stars.
function paintSpace(W, H, dpr) {
  const rand = mulberry32(88);
  const { c, g } = stageCanvas(W, H, dpr);
  const cx = W / 2, cy = H * 0.46, far = Math.hypot(W, H) * 0.62;
  const gr = g.createRadialGradient(cx, cy, 0, cx, cy, far);
  gr.addColorStop(0, '#14102a');
  gr.addColorStop(0.6, '#080a1a');
  gr.addColorStop(1, '#03040b');
  g.fillStyle = gr; g.fillRect(0, 0, W, H);
  for (let k = 0; k < 6; k++) blob(g, rand() * W, rand() * H, W * (0.3 + rand() * 0.3), H * (0.15 + rand() * 0.2), `rgba(${90 + rand() * 80 | 0},${60 + rand() * 60 | 0},${160 + rand() * 90 | 0},0.06)`);
  for (let k = 0; k < (W * H) / 900; k++) {
    g.fillStyle = `rgba(255,255,255,${0.1 + rand() * rand() * 0.8})`;
    const s = rand() < 0.97 ? 0.7 : 1.4;
    g.fillRect(rand() * W, rand() * H, s, s);
  }
  return c;
}
