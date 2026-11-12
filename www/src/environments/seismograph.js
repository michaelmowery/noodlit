// Seismograph: an Echo environment.
//   Look:   a roll of chart paper under a recording pen. You sketch on it in faint pencil.
//   Echo:   pause, and the pen arm swings over and traces every line in the order you drew
//           it, in ink, with the faint tremor of a needle that feels everything.
//   Leave:  the chart rolls on and carries the trace away off the edge.

import { mulberry32 } from '../lib/util.js';
import { EchoScene } from '../lib/echo.js';
import { stageCanvas } from '../lib/fade.js';
import { sfx } from '../lib/sound.js';

const PALETTE = [
  { name: 'Red ink', color: '#c8332d' },
  { name: 'Blue ink', color: '#2c4fa8' },
  { name: 'Black ink', color: '#22242a' },
  { name: 'Green ink', color: '#2f7a46' },
];

export const seismograph = {
  id: 'seismograph',
  name: 'Seismograph',
  mode: 'echo',
  blurb: 'Pause, and a recording pen traces it onto the chart',
  surface: 'Chart paper under a recording pen',
  clearLabel: 'Record',
  clearIcon: 'M3 12h4l2-6 3 12 3-9 2 3h4',
  palette: PALETTE,
  create: () => new Seismograph(),
};

class Seismograph extends EchoScene {
  constructor() {
    super({ ink: PALETTE[0].color, brush: 1.8, seed: 51, sparks: false, quiet: 0.4, passes: [{ rate: 0.85, hold: 0.6, fade: 1.8 }] });
    this.wob = 0;
  }

  paintBase() { return paintChart(this.W, this.H, this.dpr); }

  // Where the pen arm is pivoted: off the top right corner.
  get pivot() { return [this.W + 30, -30]; }

  paintSeg(g, x0, y0, r0, x1, y1, r1, ink = this.ink) {
    g.save();
    g.lineCap = g.lineJoin = 'round';
    if (this.playing) {
      // Ink, with a fine tremor across the line.
      const d = Math.hypot(x1 - x0, y1 - y0) || 1, nx = -(y1 - y0) / d, ny = (x1 - x0) / d;
      const n = Math.max(1, Math.round(d / 3));
      g.strokeStyle = ink;
      g.globalAlpha = 0.92;
      g.lineWidth = Math.max(1.1, (r0 + r1) * 0.55);
      g.beginPath(); g.moveTo(x0 + nx * this.wob, y0 + ny * this.wob);
      for (let k = 1; k <= n; k++) {
        const t = k / n;
        this.wob = this.calm ? 0 : this.wob * 0.4 + (this.rand() - 0.5) * 2.2;
        g.lineTo(x0 + (x1 - x0) * t + nx * this.wob, y0 + (y1 - y0) * t + ny * this.wob);
      }
      g.stroke();
    } else {
      // The sketch: soft pencil.
      g.strokeStyle = '#6b6f78';
      g.globalAlpha = 0.45;
      g.lineWidth = Math.max(1, (r0 + r1) * 0.6);
      g.beginPath(); g.moveTo(x0, y0); g.lineTo(x1 + 0.01, y1); g.stroke();
    }
    g.restore();
  }

  inkText(g) {
    if (this.playing) return;
    g.fillStyle = g.strokeStyle = '#6b6f78';
    g.globalAlpha = 0.45;
  }

  onStroke(n) { if (!n) sfx.cue('stylus'); }

  // The chart rolls on, carrying the trace away to the left.
  look(p, age) { return this.calm ? null : { dx: -age * 140 }; }

  // The pen arm: a thin steel rod from the pivot down to the nib.
  drawHead(ctx, h) {
    const [px, py] = this.pivot;
    ctx.save();
    ctx.strokeStyle = 'rgba(60,64,72,0.85)';
    ctx.lineWidth = 2.4;
    ctx.lineCap = 'round';
    ctx.shadowColor = 'rgba(0,0,0,0.25)'; ctx.shadowBlur = 4; ctx.shadowOffsetX = 3; ctx.shadowOffsetY = 3;
    ctx.beginPath(); ctx.moveTo(px, py); ctx.lineTo(h.x, h.y); ctx.stroke();
    ctx.shadowColor = 'transparent';
    ctx.fillStyle = '#2b2e35';
    ctx.beginPath(); ctx.arc(h.x, h.y, 3.2, 0, Math.PI * 2); ctx.fill();
    ctx.fillStyle = h.ink;
    ctx.beginPath(); ctx.arc(h.x, h.y, 1.6, 0, Math.PI * 2); ctx.fill();
    ctx.restore();
  }
}

// Chart paper: pale green-cream, a fine grid with heavier lines every fifth, and time marks
// printed along the bottom.
function paintChart(W, H, dpr) {
  const rand = mulberry32(17);
  const { c, g } = stageCanvas(W, H, dpr);
  g.fillStyle = '#f3f4e8'; g.fillRect(0, 0, W, H);
  for (let k = 0; k < (W * H) / 500; k++) {
    g.fillStyle = `rgba(${rand() > 0.5 ? '255,255,255' : '120,130,100'},${0.04 + rand() * 0.05})`;
    g.fillRect(rand() * W, rand() * H, 2, 1);
  }
  const step = 12;
  for (let i = 0, x = 0; x < W; i++, x += step) {
    g.strokeStyle = i % 5 ? 'rgba(120,170,140,0.22)' : 'rgba(110,160,130,0.45)';
    g.lineWidth = i % 5 ? 0.6 : 1;
    g.beginPath(); g.moveTo(x + 0.5, 0); g.lineTo(x + 0.5, H); g.stroke();
  }
  for (let i = 0, y = 0; y < H; i++, y += step) {
    g.strokeStyle = i % 5 ? 'rgba(120,170,140,0.22)' : 'rgba(110,160,130,0.45)';
    g.lineWidth = i % 5 ? 0.6 : 1;
    g.beginPath(); g.moveTo(0, y + 0.5); g.lineTo(W, y + 0.5); g.stroke();
  }
  g.fillStyle = 'rgba(90,130,105,0.6)';
  g.font = '9px ui-monospace, Menlo, monospace';
  for (let i = 0, x = step * 5; x < W; i++, x += step * 10) g.fillText(`${String(i).padStart(2, '0')}:00`, x + 2, H - 112);
  // A soft shadow at each edge where the paper curls over its rollers.
  for (const [x0, x1] of [[0, 26], [W, W - 26]]) {
    const gr = g.createLinearGradient(x0, 0, x1, 0);
    gr.addColorStop(0, 'rgba(60,70,60,0.25)');
    gr.addColorStop(1, 'rgba(60,70,60,0)');
    g.fillStyle = gr; g.fillRect(Math.min(x0, x1), 0, 26, H);
  }
  return c;
}
