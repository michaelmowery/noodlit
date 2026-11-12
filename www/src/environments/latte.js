// Latte art: the sample Stir environment.
//   Look:  a cup of coffee from above. Your finger pours a line of steamed milk onto the crema.
//   Stir:  the cup is turning, slowly, faster towards the middle. Lines are wound into
//          spirals and into each other, spread out, and mix away into the coffee. The speed
//          slider sets how fast; Hold stops the cup. The Latte pick brush pours nothing: it
//          drags the milk that's already there, the way a barista etches a pattern.
//   Clear: "Stir" gives the cup a proper whirl and everything mixes in.
//
// The swirl itself lives in lib/stir.js.

import { mulberry32 } from '../lib/util.js';
import { stageCanvas, blob, mottle } from '../lib/fade.js';
import { StirScene } from '../lib/stir.js';

const PALETTE = [
  { name: 'Milk', color: '#fbf1dc' },
  { name: 'Caramel', color: '#eeb45e' },
  { name: 'Matcha', color: '#c3d984' },
  { name: 'Strawberry', color: '#f7a9bb' },
  { name: 'Cocoa', color: '#2a1508' },
];

export const latte = {
  id: 'latte',
  name: 'Latte art',
  mode: 'stir',
  blurb: 'Pour milk lines; the cup swirls them away',
  surface: 'Cup of coffee to pour milk lines on',
  clearLabel: 'Stir',
  clearIcon: 'M12 4a8 8 0 1 1-8 8M12 8a4 4 0 1 0 4 4M4 12a8 8 0 0 1 2-5.3M12 12h.01',
  palette: PALETTE,
  create: () => new Latte(),
};

class Latte extends StirScene {
  constructor() { super({ ink: PALETTE[0].color, brush: 4.5 }); }
  paintBase() { return paintCoffee(this.W, this.H, this.dpr); }
}

// Coffee seen from above, close enough that the cup's rim is out of frame: dark in the
// middle, a paler ring of crema, faint streaks from the last stir and a few bubbles.
function paintCoffee(W, H, dpr) {
  const rand = mulberry32(73);
  const { c, g } = stageCanvas(W, H, dpr);
  const cx = W / 2, cy = H * 0.46, far = Math.hypot(W, H) * 0.62;
  const gr = g.createRadialGradient(cx, cy, 0, cx, cy, far);
  gr.addColorStop(0, '#7a4a25');
  gr.addColorStop(0.45, '#6a3d1c');
  gr.addColorStop(0.8, '#55301a');
  gr.addColorStop(1, '#2e180c');
  g.fillStyle = gr; g.fillRect(0, 0, W, H);
  mottle(g, W, H, rand, { light: 34, dark: 46, scale: 6 });

  // Streaks of paler crema, curling round the middle.
  g.lineCap = 'round';
  for (let k = 0; k < 26; k++) {
    const r = far * (0.08 + rand() * 0.85), a0 = rand() * Math.PI * 2, sweep = 0.5 + rand() * 1.6;
    g.strokeStyle = `rgba(214,160,100,${0.03 + rand() * 0.06})`;
    g.lineWidth = 3 + rand() * 16;
    g.beginPath();
    for (let t = 0; t <= 1.001; t += 0.05) {
      const a = a0 + sweep * t, rr = r * (1 + 0.14 * t);
      g.lineTo(cx + Math.cos(a) * rr, cy + Math.sin(a) * rr);
    }
    g.stroke();
  }
  blob(g, cx - W * 0.2, cy - H * 0.2, W * 0.5, H * 0.3, 'rgba(255,220,170,0.07)');

  // Fine bubbles, mostly out towards the edge.
  for (let k = 0; k < (W * H) / 2600; k++) {
    const a = rand() * Math.PI * 2, r = far * (0.35 + 0.65 * Math.sqrt(rand()));
    const x = cx + Math.cos(a) * r, y = cy + Math.sin(a) * r, s = 0.6 + rand() * rand() * 2.6;
    g.strokeStyle = `rgba(240,200,150,${0.12 + rand() * 0.2})`;
    g.lineWidth = 0.6;
    g.beginPath(); g.arc(x, y, s, 0, Math.PI * 2); g.stroke();
  }
  const vg = g.createRadialGradient(cx, cy, Math.min(W, H) * 0.35, cx, cy, far);
  vg.addColorStop(0, 'rgba(0,0,0,0)');
  vg.addColorStop(1, 'rgba(0,0,0,0.45)');
  g.fillStyle = vg; g.fillRect(0, 0, W, H);
  return c;
}
