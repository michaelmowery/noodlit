// Paper marbling: a Stir environment.
//   Look:  a shallow tray of thickened water, seen from above. Your brush floats a line of
//          ink on the surface.
//   Stir:  the water drifts slowly round, drawing the inks out into feathered ribbons. The
//          Comb brush lays no ink: its five tines drag through what's there, the way a
//          marbler combs a pattern.
//   Clear: "Take a print" lays a sheet of paper on the water and lifts it away with the
//          pattern on it, leaving the tray clean.

import { mulberry32, makeCanvas, smoothstep } from '../lib/util.js';
import { stageCanvas, blob, mottle } from '../lib/fade.js';
import { StirScene } from '../lib/stir.js';
import { sfx } from '../lib/sound.js';

const PALETTE = [
  { name: 'Indigo', color: '#2c3e8f' },
  { name: 'Oxblood', color: '#8e2a35' },
  { name: 'Ochre', color: '#d29a2c' },
  { name: 'Teal', color: '#21837f' },
  { name: 'Sumi black', color: '#1e2024' },
  { name: 'Rose', color: '#d4728a' },
];

const LOWER = 0.55;   // seconds for the paper to settle on the water
const LIFT = 1.3;     // seconds to peel it off and away
const TINES = 5;

export const marbling = {
  id: 'marbling',
  name: 'Paper marbling',
  mode: 'stir',
  blurb: 'Float inks, comb them, and pull a print',
  surface: 'Marbling tray to float ink on',
  clearLabel: 'Take a print',
  clearIcon: 'M5 6h14v12H5zM5 6c3 2 5-2 7 0s4 2 7 0M5 12c3 2 5-2 7 0s4 2 7 0',
  palette: PALETTE,
  create: () => new Marbling(),
};

class Marbling extends StirScene {
  constructor() {
    super({ ink: PALETTE[0].color, brush: 4.5, blend: 'multiply', body: 0.85, edge: 0.12, spread: 0.7, turns: 0.6, cue: 'fold' });
    this.print = null;   // { t, sheet } while a print is being pulled
  }

  paintBase() { return paintTray(this.W, this.H, this.dpr); }

  // The Comb: drag at five points across the direction of travel, each with a narrow reach.
  pull(x, y, dx, dy, reach) {
    if (this.brushType?.name !== 'Comb') return super.pull(x, y, dx, dy, reach);
    const d = Math.hypot(dx, dy) || 1, nx = -dy / d, ny = dx / d;
    const gap = Math.max(16, reach * 0.9), r = Math.max(8, reach * 0.35);
    for (let k = 0; k < TINES; k++) {
      const o = (k - (TINES - 1) / 2) * gap;
      super.pull(x + nx * o, y + ny * o, dx, dy, r);
    }
  }

  // ---------------------------------------------------------------- the print
  get clearing() { return this.whirl > 0 || !!this.print; }

  clear() {
    this.commitDraft();
    this.strokes.clear();
    if (!this.lines.length || this.print) return;
    // The sheet takes up exactly what's on the water now.
    const { W, H, dpr } = this;
    const sheet = makeCanvas(W * dpr, H * dpr), g = sheet.getContext('2d');
    g.setTransform(dpr, 0, 0, dpr, 0, 0);
    g.fillStyle = '#f7f1e3'; g.fillRect(0, 0, W, H);
    g.lineCap = g.lineJoin = 'round';
    g.globalCompositeOperation = 'multiply';
    this.drawLines(g);
    g.globalCompositeOperation = 'source-over';
    g.globalAlpha = 1;
    this.print = { t: 0, sheet };
    sfx.cue('fold');
  }

  update(dt) {
    const alive = super.update(dt);
    if (!this.print) return alive;
    this.print.t += dt;
    if (this.print.t >= LOWER && this.lines.length) { this.lines = []; sfx.cue('arrive'); }
    if (this.print.t >= LOWER + LIFT) this.print = null;
    return true;
  }

  drawOver(ctx) {
    const p = this.print;
    if (!p) return;
    const { W, H } = this;
    ctx.save();
    if (p.t < LOWER) {
      // Settling onto the water: it fades in from the corner it was laid from.
      const u = smoothstep(0, 1, p.t / LOWER);
      ctx.globalAlpha = u;
      ctx.fillStyle = '#f7f1e3';
      ctx.fillRect(0, 0, W, H);
    } else {
      // Peeled up and away, the pattern on its face.
      const u = smoothstep(0, 1, (p.t - LOWER) / LIFT);
      const y = -H * 1.1 * u, tilt = -0.06 * u;
      ctx.translate(W / 2, y + H / 2);
      ctx.rotate(tilt);
      ctx.shadowColor = 'rgba(0,0,0,0.3)'; ctx.shadowBlur = 24 * u; ctx.shadowOffsetY = 10 * u;
      ctx.drawImage(p.sheet, -W / 2, -H / 2, W, H);
    }
    ctx.restore();
  }
}

// A shallow tray of size (thickened water): pale, faintly milky, a soft reflection across it.
function paintTray(W, H, dpr) {
  const rand = mulberry32(23);
  const { c, g } = stageCanvas(W, H, dpr);
  const gr = g.createLinearGradient(0, 0, 0, H);
  gr.addColorStop(0, '#e9ece6');
  gr.addColorStop(1, '#d6dbd2');
  g.fillStyle = gr; g.fillRect(0, 0, W, H);
  mottle(g, W, H, rand, { light: 14, dark: 12, scale: 7 });
  blob(g, W * 0.3, H * 0.2, W * 0.6, H * 0.18, 'rgba(255,255,255,0.4)');
  // Tiny specks of colour left from earlier prints.
  for (let k = 0; k < (W * H) / 9000; k++) {
    const col = PALETTE[Math.floor(rand() * PALETTE.length)].color, n = parseInt(col.slice(1), 16);
    g.fillStyle = `rgba(${n >> 16},${(n >> 8) & 255},${n & 255},0.12)`;
    g.beginPath(); g.arc(rand() * W, rand() * H, 0.6 + rand() * 1.4, 0, Math.PI * 2); g.fill();
  }
  const vg = g.createRadialGradient(W / 2, H / 2, Math.min(W, H) * 0.4, W / 2, H / 2, Math.hypot(W, H) * 0.6);
  vg.addColorStop(0, 'rgba(60,70,60,0)');
  vg.addColorStop(1, 'rgba(60,70,60,0.18)');
  g.fillStyle = vg; g.fillRect(0, 0, W, H);
  return c;
}
