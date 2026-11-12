// Skywriting: an Echo environment.
//   Look:  a clear afternoon sky. Your finger sketches a faint flight plan.
//   Echo:  pause, and a little plane flies the plan, trailing smoke along every line in the
//          order you drew it (typed words are written a letter at a time).
//   Leave: the wind carries the writing off and it thins away.

import { mulberry32 } from '../lib/util.js';
import { EchoScene } from '../lib/echo.js';
import { stageCanvas, blob } from '../lib/fade.js';

const PALETTE = [
  { name: 'Cloud white', color: '#ffffff' },
  { name: 'Peach', color: '#ffd9b8' },
  { name: 'Rose', color: '#ffc4dc' },
  { name: 'Lemon', color: '#fff4a8' },
];

export const skywriting = {
  id: 'skywriting',
  name: 'Skywriting',
  mode: 'echo',
  blurb: 'Pause, and a plane writes it across the sky',
  surface: 'Blue sky to sketch a flight plan on',
  clearLabel: 'Take off',
  clearIcon: 'M3 13.5l18-7.5-4.5 13-4-5.5zM12.5 13.5L21 6M12.5 13.5V19l2.2-3',
  palette: PALETTE,
  create: () => new Skywriting(),
};

class Skywriting extends EchoScene {
  constructor() {
    super({ ink: PALETTE[0].color, brush: 3.6, seed: 9, sparks: false, passes: [{ hold: 0.7, fade: 2.4 }] });
  }

  paintBase() { return paintSky(this.W, this.H, this.dpr); }

  paintSeg(g, x0, y0, r0, x1, y1, r1, ink = this.ink) {
    const w = r0 + r1;
    g.save();
    g.strokeStyle = ink;
    g.beginPath(); g.moveTo(x0, y0); g.lineTo(x1 + 0.01, y1);
    if (this.playing) {
      // Smoke: soft-edged and a little wider than the plan.
      g.shadowColor = ink; g.shadowBlur = 7 * this.dpr;
      g.globalAlpha = 0.9; g.lineWidth = w * 1.5; g.stroke();
    } else {
      // The flight plan: a fine pale line.
      g.globalAlpha = 0.6; g.lineWidth = Math.max(1, w * 0.4); g.stroke();
    }
    g.restore();
  }

  inkText(g) {
    if (this.playing) { g.shadowColor = g.fillStyle; g.shadowBlur = 7 * this.dpr; } else g.globalAlpha = 0.6;
  }

  // Once it's written, the wind takes it.
  look(p, age) { return this.calm ? null : { dx: age * 16, dy: -age * 3 }; }

  // The plane, nose along its heading.
  drawHead(ctx, h) {
    ctx.save();
    ctx.translate(h.x, h.y);
    ctx.rotate(h.ang);
    ctx.fillStyle = '#ffffff';
    ctx.strokeStyle = 'rgba(20,50,100,0.75)';
    ctx.lineWidth = 1.2;
    ctx.lineJoin = 'round';
    ctx.beginPath();
    ctx.moveTo(13, 0);            // nose
    ctx.lineTo(3, -2.2);
    ctx.lineTo(-1, -10);          // wing tip
    ctx.lineTo(-4, -10);
    ctx.lineTo(-2.5, -2.2);
    ctx.lineTo(-8, -1.8);
    ctx.lineTo(-10, -5);          // tail
    ctx.lineTo(-12, -5);
    ctx.lineTo(-11, 0);
    ctx.lineTo(-12, 5);
    ctx.lineTo(-10, 5);
    ctx.lineTo(-8, 1.8);
    ctx.lineTo(-2.5, 2.2);
    ctx.lineTo(-4, 10);
    ctx.lineTo(-1, 10);
    ctx.lineTo(3, 2.2);
    ctx.closePath();
    ctx.fill(); ctx.stroke();
    ctx.restore();
  }
}

// A blue afternoon: deeper overhead, pale at the horizon, with fair-weather clouds low down.
function paintSky(W, H, dpr) {
  const rand = mulberry32(44);
  const { c, g } = stageCanvas(W, H, dpr);
  const sky = g.createLinearGradient(0, 0, 0, H);
  sky.addColorStop(0, '#1f5fb8');
  sky.addColorStop(0.55, '#4d93dc');
  sky.addColorStop(1, '#a9d3f2');
  g.fillStyle = sky; g.fillRect(0, 0, W, H);
  blob(g, W * 0.86, H * 0.1, W * 0.5, W * 0.5, 'rgba(255,250,220,0.35)');
  // Cumulus along the bottom, and a couple of wisps higher up.
  const puff = (x, y, s, a) => {
    for (let k = 0; k < 9; k++) {
      const px = x + (rand() - 0.5) * s * 2.2, py = y + (rand() - 0.3) * s * 0.5, r = s * (0.35 + rand() * 0.5);
      blob(g, px, py, r * 1.3, r, `rgba(255,255,255,${a})`);
    }
  };
  for (let k = 0; k < 7; k++) puff(rand() * W, H * (0.86 + rand() * 0.12), Math.min(W, H) * (0.1 + rand() * 0.1), 0.5);
  for (let k = 0; k < 3; k++) puff(rand() * W, H * (0.08 + rand() * 0.12), Math.min(W, H) * 0.07, 0.14);
  return c;
}
