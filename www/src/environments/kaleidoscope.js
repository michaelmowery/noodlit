// Kaleidoscope: a Stir environment.
//   Look:  the dark inside of a kaleidoscope. Whatever you draw appears in all twelve
//          mirrored wedges at once, in light.
//   Stir:  the tube is turning, so the pattern winds round the middle, folds into itself and
//          thins away. The Twist brush draws nothing: it drags the pattern.
//   Clear: "Twist" spins the whole thing out.

import { mulberry32 } from '../lib/util.js';
import { stageCanvas, blob } from '../lib/fade.js';
import { StirScene } from '../lib/stir.js';

const PALETTE = [
  { name: 'Ruby', color: '#ff4d6d' },
  { name: 'Amber', color: '#ffb347' },
  { name: 'Emerald', color: '#3ddc97' },
  { name: 'Sapphire', color: '#4d9bff' },
  { name: 'Amethyst', color: '#b77dff' },
  { name: 'Pearl', color: '#f4f1ff' },
];
const WEDGES = 6;

export const kaleidoscope = {
  id: 'kaleidoscope',
  name: 'Kaleidoscope',
  mode: 'stir',
  blurb: 'Your lines mirror, turn and melt together',
  surface: 'Kaleidoscope to draw mirrored patterns in',
  clearLabel: 'Twist',
  clearIcon: 'M12 3l7.8 4.5v9L12 21l-7.8-4.5v-9zM12 3v18M4.2 7.5l15.6 9M19.8 7.5l-15.6 9',
  palette: PALETTE,
  create: () => new Kaleidoscope(),
};

class Kaleidoscope extends StirScene {
  constructor() {
    super({ ink: PALETTE[0].color, brush: 3.2, blend: 'lighter', body: 0.8, edge: 0.2, spread: 0.6, turns: 1.1, mirror: WEDGES, cue: 'constellation' });
  }
  paintBase() { return paintTube(this.W, this.H, this.dpr); }
}

// Dark glass with the faint seams of the mirrors meeting in the middle.
function paintTube(W, H, dpr) {
  const rand = mulberry32(5);
  const { c, g } = stageCanvas(W, H, dpr);
  const cx = W / 2, cy = H * 0.46, far = Math.hypot(W, H) * 0.62;
  const gr = g.createRadialGradient(cx, cy, 0, cx, cy, far);
  gr.addColorStop(0, '#1b1436');
  gr.addColorStop(0.5, '#110c26');
  gr.addColorStop(1, '#05040d');
  g.fillStyle = gr; g.fillRect(0, 0, W, H);
  for (let k = 0; k < WEDGES * 2; k++) {
    const a = (k / (WEDGES * 2)) * Math.PI * 2;
    g.strokeStyle = `rgba(190,170,255,${k % 2 ? 0.035 : 0.07})`;
    g.lineWidth = 1;
    g.beginPath(); g.moveTo(cx, cy); g.lineTo(cx + Math.cos(a) * far, cy + Math.sin(a) * far); g.stroke();
  }
  for (let k = 0; k < 5; k++) blob(g, cx + (rand() - 0.5) * W, cy + (rand() - 0.5) * H, W * 0.4, W * 0.4, `rgba(${120 + rand() * 100 | 0},${60 + rand() * 80 | 0},255,0.05)`);
  return c;
}
