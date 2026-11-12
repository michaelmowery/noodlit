// Canyon echo: the sample Echo environment.
//   Look:  a canyon at dusk. Your finger leaves a glowing line in the air between the walls.
//   Echo:  pause, and the drawing goes quiet, then plays itself back stroke by stroke in the
//          order you made it (typed words come back a letter at a time). The canyon answers
//          once more, fainter and further off.
//   Leave: then both fade.
//
// The playback itself lives in lib/echo.js.

import { mulberry32 } from '../lib/util.js';
import { EchoScene } from '../lib/echo.js';
import { stageCanvas, blob } from '../lib/fade.js';
import { sfx } from '../lib/sound.js';

const PALETTE = [
  { name: 'Ember', color: '#ffc46b' },
  { name: 'Moonlight', color: '#d5e6ff' },
  { name: 'Sage', color: '#b9e6a0' },
  { name: 'Rose', color: '#ffa9bd' },
];

export const canyon = {
  id: 'canyon',
  name: 'Canyon echo',
  mode: 'echo',
  blurb: 'Pause, and the canyon plays your lines back',
  surface: 'Canyon at dusk to draw glowing lines in',
  clearLabel: 'Echo now',
  clearIcon: 'M4 12a8 8 0 0 1 8-8M4 12a8 8 0 0 0 8 8M9 12a3 3 0 0 1 3-3M9 12a3 3 0 0 0 3 3M16 7.5a6 6 0 0 1 0 9M19.5 5a10 10 0 0 1 0 14',
  palette: PALETTE,
  create: () => new Canyon(),
};

class Canyon extends EchoScene {
  constructor() {
    super({
      ink: PALETTE[0].color, brush: 3, seed: 41,
      // The playback, then the canyon's answer: quicker, fainter, smaller and further off.
      passes: [
        { rate: 1, alpha: 1, scale: 1, hold: 0.3, fade: 1.6 },
        { gap: 0.3, rate: 1.25, alpha: 0.42, scale: 0.88, hold: 0.4, fade: 1.3 },
      ],
    });
  }

  paintBase() { return paintCanyon(this.W, this.H, this.dpr); }

  // A soft halo with a brighter core, in the chosen ink.
  paintSeg(g, x0, y0, r0, x1, y1, r1, ink = this.ink) {
    g.save();
    g.strokeStyle = ink;
    g.globalAlpha = 0.18;
    g.lineWidth = (r0 + r1) * 2.4;
    g.beginPath(); g.moveTo(x0, y0); g.lineTo(x1 + 0.01, y1); g.stroke();
    g.globalAlpha = 0.9;
    g.lineWidth = (r0 + r1) * 0.8;
    g.stroke();
    g.restore();
  }

  inkText(g) { g.shadowColor = g.fillStyle; g.shadowBlur = 8; }

  onStroke(n) { if (!n) sfx.cue('twinkle'); }
}

// A canyon just after sunset: the last light low in the sky, walls stepping back into haze on
// both sides, and a thread of river far below.
function paintCanyon(W, H, dpr) {
  const rand = mulberry32(57);
  const { c, g } = stageCanvas(W, H, dpr);

  const sky = g.createLinearGradient(0, 0, 0, H);
  sky.addColorStop(0, '#0b0f26');
  sky.addColorStop(0.38, '#2a2350');
  sky.addColorStop(0.62, '#7a3f5c');
  sky.addColorStop(0.8, '#d27a4e');
  sky.addColorStop(1, '#f2b46a');
  g.fillStyle = sky; g.fillRect(0, 0, W, H);
  blob(g, W * 0.5, H * 0.78, W * 0.7, H * 0.2, 'rgba(255,200,130,0.3)');

  for (let i = 0; i < (W * H) / 4200; i++) {
    const y = rand() * rand() * H * 0.5;
    g.fillStyle = `rgba(255,255,255,${0.15 + rand() * 0.5})`;
    g.beginPath(); g.arc(rand() * W, y, 0.4 + rand() * 0.7, 0, Math.PI * 2); g.fill();
  }

  // Walls, far to near: each a stepped mesa profile coming in from one side.
  const layers = 4;
  for (let l = 0; l < layers; l++) {
    const t = l / (layers - 1);                     // 0 far, 1 near
    const reach = W * (0.5 - 0.06 - 0.3 * t);       // how far in from the edge the foot comes
    const top = H * (0.56 - 0.44 * t);              // rim height at the edge
    const foot = H * (0.8 + 0.2 * t);
    const shade = [Math.round(120 - 104 * t), Math.round(62 - 50 * t), Math.round(84 - 62 * t)];
    for (const side of [-1, 1]) {
      const X = (d) => (side < 0 ? d : W - d);      // d = distance in from this side's edge
      g.beginPath();
      g.moveTo(X(-4), H + 4);
      g.lineTo(X(-4), top);
      let d = 0, y = top;
      const inner = W * 0.5 - reach;
      while (d < inner && y < foot) {
        d = Math.min(inner, d + W * (0.03 + rand() * 0.09));  // a ledge
        g.lineTo(X(d), y + (rand() - 0.5) * 4);
        y = Math.min(foot, y + H * (0.03 + rand() * 0.11));   // a drop
        g.lineTo(X(d + rand() * 5), y);
      }
      g.lineTo(X(inner + W * 0.04), H + 4);
      g.closePath();
      const gr = g.createLinearGradient(0, top, 0, H);
      gr.addColorStop(0, `rgb(${shade[0] + 26},${shade[1] + 14},${shade[2] + 8})`);
      gr.addColorStop(1, `rgb(${shade})`);
      g.fillStyle = gr;
      g.fill();
    }
    // Haze settling between the layers.
    if (l < layers - 1) blob(g, W * 0.5, H * (0.74 + 0.07 * t), W * 0.8, H * 0.1, 'rgba(255,170,130,0.1)');
  }

  // The river, catching the sky.
  const rv = g.createLinearGradient(0, H * 0.86, 0, H);
  rv.addColorStop(0, 'rgba(255,205,150,0.55)');
  rv.addColorStop(1, 'rgba(120,80,110,0.25)');
  g.fillStyle = rv;
  g.beginPath();
  g.moveTo(W * 0.49, H * 0.86);
  g.bezierCurveTo(W * 0.44, H * 0.92, W * 0.58, H * 0.95, W * 0.4, H + 4);
  g.lineTo(W * 0.62, H + 4);
  g.bezierCurveTo(W * 0.66, H * 0.95, W * 0.5, H * 0.92, W * 0.51, H * 0.86);
  g.closePath(); g.fill();

  // Keep the middle of the picture dark enough for glowing lines to read.
  const veil = g.createLinearGradient(0, 0, 0, H);
  veil.addColorStop(0, 'rgba(6,8,22,0.25)');
  veil.addColorStop(0.7, 'rgba(6,8,22,0.3)');
  veil.addColorStop(1, 'rgba(6,8,22,0.55)');
  g.fillStyle = veil; g.fillRect(0, 0, W, H);
  return c;
}
