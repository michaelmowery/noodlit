// Whirlpool: a Stir environment.
//   Look:  deep water turning round a dark eye, seen from above. Your finger leaves a bright
//          line floating on it.
//   Stir:  the whirlpool catches every line, winds it round and draws it in, faster the
//          closer it gets, until it goes down the middle and is gone. The Paddle brush adds
//          nothing: it pushes what's floating there.
//   Clear: "Drain" spins everything down at once.

import { mulberry32 } from '../lib/util.js';
import { stageCanvas } from '../lib/fade.js';
import { StirScene } from '../lib/stir.js';

const PALETTE = [
  { name: 'Foam', color: '#f2fbff' },
  { name: 'Aqua', color: '#6fe3e1' },
  { name: 'Gold', color: '#ffd166' },
  { name: 'Coral', color: '#ff8a7a' },
  { name: 'Lime', color: '#b9f27c' },
  { name: 'Lilac', color: '#c9b3ff' },
];

export const whirlpool = {
  id: 'whirlpool',
  name: 'Whirlpool',
  mode: 'stir',
  blurb: 'Your lines spiral down the middle and are gone',
  surface: 'Whirlpool that draws your lines down into its eye',
  clearLabel: 'Drain',
  clearIcon: 'M12 12a1.6 1.6 0 1 1 1.6 1.6A4.4 4.4 0 1 1 16.4 9 7.4 7.4 0 1 0 19.4 15',
  palette: PALETTE,
  create: () => new Whirlpool(),
};

class Whirlpool extends StirScene {
  constructor() {
    super({ ink: PALETTE[0].color, brush: 4.2, turns: 1.5, sink: 1.15, spread: -0.55, edge: 0.2, body: 0.95, cue: 'wave' });
  }

  paintBase() { return paintPool(this.W, this.H, this.dpr); }
}

// Dark water with spiral arms of foam winding in to a black eye.
function paintPool(W, H, dpr) {
  const rand = mulberry32(41);
  const { c, g } = stageCanvas(W, H, dpr);
  const cx = W / 2, cy = H * 0.46, far = Math.hypot(W, H) * 0.62;
  const gr = g.createRadialGradient(cx, cy, 0, cx, cy, far);
  gr.addColorStop(0, '#010a12');
  gr.addColorStop(0.07, '#04202e');
  gr.addColorStop(0.3, '#0b4a5c');
  gr.addColorStop(0.65, '#0d5f72');
  gr.addColorStop(1, '#083845');
  g.fillStyle = gr; g.fillRect(0, 0, W, H);
  // Spiral arms: each a run of short strokes that tightens as it nears the eye.
  g.lineCap = 'round';
  for (let k = 0; k < 46; k++) {
    const a0 = rand() * Math.PI * 2, r0 = far * (0.12 + rand() * 0.95), sweep = 0.7 + rand() * 1.6;
    const light = rand() > 0.3;
    const alpha = light ? 0.05 + rand() * 0.12 : 0.1 + rand() * 0.14;
    g.strokeStyle = light ? `rgba(190,240,250,${alpha})` : `rgba(0,18,28,${alpha})`;
    g.lineWidth = 1 + rand() * 7;
    g.beginPath();
    for (let t = 0; t <= 1.001; t += 0.04) {
      const a = a0 + sweep * t, r = r0 * (1 - 0.42 * t);
      g.lineTo(cx + Math.cos(a) * r, cy + Math.sin(a) * r);
    }
    g.stroke();
  }
  // The eye: a soft black funnel with a glint on its lip.
  const e = Math.min(W, H) * 0.13;
  const eye = g.createRadialGradient(cx, cy, 0, cx, cy, e);
  eye.addColorStop(0, 'rgba(0,4,8,0.96)');
  eye.addColorStop(0.5, 'rgba(0,10,16,0.7)');
  eye.addColorStop(1, 'rgba(0,10,16,0)');
  g.fillStyle = eye; g.beginPath(); g.arc(cx, cy, e, 0, Math.PI * 2); g.fill();
  g.strokeStyle = 'rgba(200,245,255,0.16)'; g.lineWidth = 1.4;
  g.beginPath(); g.arc(cx, cy, e * 0.62, Math.PI * 1.05, Math.PI * 1.7); g.stroke();
  const vg = g.createRadialGradient(cx, cy, Math.min(W, H) * 0.45, cx, cy, far);
  vg.addColorStop(0, 'rgba(0,10,18,0)');
  vg.addColorStop(1, 'rgba(0,10,18,0.5)');
  g.fillStyle = vg; g.fillRect(0, 0, W, H);
  return c;
}
