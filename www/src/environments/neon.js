// Neon sign: an Echo environment.
//   Look:  a brick wall at night. Your finger bends glass tubing: dim, unlit lines.
//   Echo:  pause, and the sign comes on tube by tube in the order you bent it (typed words
//          light a letter at a time). It glows for a moment, buzzes and flickers, and goes dark.

import { mulberry32 } from '../lib/util.js';
import { EchoScene } from '../lib/echo.js';
import { stageCanvas, blob, mottle } from '../lib/fade.js';
import { sfx } from '../lib/sound.js';

const PALETTE = [
  { name: 'Hot pink', color: '#ff4fa3' },
  { name: 'Electric blue', color: '#4fd8ff' },
  { name: 'Lime', color: '#b6ff5c' },
  { name: 'Orange', color: '#ff9a3c' },
  { name: 'Violet', color: '#b98bff' },
  { name: 'Warm white', color: '#fff1dc' },
];

export const neon = {
  id: 'neon',
  name: 'Neon sign',
  mode: 'echo',
  blurb: 'Pause, and your lines light up tube by tube',
  surface: 'Brick wall at night to bend neon tubes on',
  clearLabel: 'Switch on',
  clearIcon: 'M13 3L6 13.5h5l-1 7.5 7-10.5h-5z',
  palette: PALETTE,
  create: () => new Neon(),
};

class Neon extends EchoScene {
  constructor() {
    super({ ink: PALETTE[0].color, brush: 3.4, seed: 67, sparks: false, passes: [{ hold: 1.7, fade: 0.3 }] });
  }

  paintBase() { return paintWall(this.W, this.H, this.dpr); }

  paintSeg(g, x0, y0, r0, x1, y1, r1, ink = this.ink) {
    const w = r0 + r1;
    g.save();
    g.strokeStyle = ink;
    g.beginPath(); g.moveTo(x0, y0); g.lineTo(x1 + 0.01, y1);
    if (this.playing) {
      // Lit: a wide glow on the bricks, the coloured tube, and a white-hot core.
      g.globalAlpha = 0.16; g.lineWidth = w * 4.4; g.stroke();
      g.globalAlpha = 0.95; g.lineWidth = w; g.stroke();
      g.strokeStyle = '#ffffff';
      g.globalAlpha = 0.8; g.lineWidth = w * 0.38; g.stroke();
    } else {
      // Unlit glass tubing.
      g.globalAlpha = 0.3; g.lineWidth = w; g.stroke();
      g.strokeStyle = '#ffffff';
      g.globalAlpha = 0.14; g.lineWidth = Math.max(0.6, w * 0.3); g.stroke();
    }
    g.restore();
  }

  inkText(g) {
    if (this.playing) { g.shadowColor = g.fillStyle; g.shadowBlur = 14; } else g.globalAlpha = 0.34;
  }

  // On for a second, then a failing tube's stutter before it goes dark.
  look(p, age) {
    if (this.calm || age < 0.95) return null;
    return { alpha: Math.sin(age * 61) + Math.sin(age * 37) > 0.2 ? 1 : 0.18 };
  }

  onStroke() { sfx.cue('twinkle'); }
}

// Dark brickwork under a little spill of street light.
function paintWall(W, H, dpr) {
  const rand = mulberry32(12);
  const { c, g } = stageCanvas(W, H, dpr);
  g.fillStyle = '#0d0b10'; g.fillRect(0, 0, W, H);
  const bh = Math.max(16, Math.min(W, H) / 22), bw = bh * 2.6;
  for (let y = 0, row = 0; y < H; y += bh, row++) {
    for (let x = -(row % 2) * bw / 2; x < W; x += bw) {
      const v = 26 + rand() * 16;
      g.fillStyle = `rgb(${v + 14},${v * 0.72},${v * 0.74})`;
      g.fillRect(x + 1, y + 1, bw - 2, bh - 2);
    }
  }
  mottle(g, W, H, rand, { light: 14, dark: 50, scale: 3 });
  blob(g, W * 0.5, H * 0.38, W * 0.9, H * 0.5, 'rgba(90,80,140,0.14)');
  const vg = g.createRadialGradient(W / 2, H * 0.42, Math.min(W, H) * 0.25, W / 2, H * 0.42, Math.hypot(W, H) * 0.62);
  vg.addColorStop(0, 'rgba(0,0,0,0)');
  vg.addColorStop(1, 'rgba(0,0,0,0.72)');
  g.fillStyle = vg; g.fillRect(0, 0, W, H);
  return c;
}
