// Scratch art: a Reveal environment.
//   Look:   a sheet of black scratch paper. Your finger is the stylus.
//   Reveal: every line cuts through the black to the colours printed underneath, so plain
//           lines and words come out in rainbow. The ink picker chooses what's under there.
//   Clear:  "New sheet" slides a fresh black one over.

import { mulberry32 } from '../lib/util.js';
import { stageCanvas, blob } from '../lib/fade.js';
import { RevealScene } from '../lib/reveal.js';

// The swatch is a hint; `stops` is what's really printed under the black.
const PALETTE = [
  { name: 'Rainbow', color: '#ff5d8f', stops: ['#ff3d6e', '#ff9838', '#ffe042', '#4fdc6b', '#35c9f2', '#5b6cff', '#c05cff', '#ff5db1'] },
  { name: 'Sunset', color: '#ff9a4d', stops: ['#ffe066', '#ff9a4d', '#f2545b', '#b5338a', '#5a2d91'] },
  { name: 'Ocean', color: '#3fc1c9', stops: ['#c6f7e2', '#5fe0c8', '#3fb2e6', '#3d6fe0', '#4a3fb5'] },
  { name: 'Gold leaf', color: '#f0c14b', stops: ['#fff3b0', '#f0c14b', '#c98b2b', '#fbe28a', '#d9a23a', '#fff0a8'] },
];

export const scratchArt = {
  id: 'scratch-art',
  name: 'Scratch art',
  mode: 'reveal',
  blurb: 'Scrape through black to the colours below',
  surface: 'Black scratch paper with colours underneath',
  clearLabel: 'New sheet',
  clearIcon: 'M6 4h9l4 4v12H6zM15 4v4h4',
  palette: PALETTE,
  create: () => new ScratchArt(),
};

class ScratchArt extends RevealScene {
  constructor() {
    super({ ink: PALETTE[0].color, brush: 3.4, revealCaption: 'Scratch through to the colours below', freshCaption: '…then take a fresh sheet' });
  }

  paintUnder() {
    const { W, H, dpr } = this;
    const { stops } = PALETTE.find((p) => p.color === this.ink) || PALETTE[0];
    const rand = mulberry32(21);
    const { c, g } = stageCanvas(W, H, dpr);
    const gr = g.createLinearGradient(0, 0, W, H);
    stops.forEach((s, i) => gr.addColorStop(i / (stops.length - 1), s));
    g.fillStyle = gr; g.fillRect(0, 0, W, H);
    // Break the bands up so a line changes colour as it goes, whichever way it runs.
    for (let k = 0; k < 14; k++) {
      const s = stops[Math.floor(rand() * stops.length)], n = parseInt(s.slice(1), 16);
      const r = Math.max(W, H) * (0.12 + rand() * 0.2);
      blob(g, rand() * W, rand() * H, r, r, `rgba(${n >> 16},${(n >> 8) & 255},${n & 255},0.55)`);
    }
    return c;
  }

  // Matte black wax, with a little tooth to it.
  paintCover(g) {
    const { W, H } = this, rand = mulberry32(8);
    g.fillStyle = '#131317'; g.fillRect(0, 0, W, H);
    for (let k = 0; k < (W * H) / 260; k++) {
      g.fillStyle = `rgba(255,255,255,${0.012 + rand() * 0.03})`;
      g.fillRect(rand() * W, rand() * H, 1 + rand() * 1.6, 1);
    }
    const vg = g.createRadialGradient(W / 2, H * 0.45, Math.min(W, H) * 0.2, W / 2, H * 0.45, Math.hypot(W, H) * 0.62);
    vg.addColorStop(0, 'rgba(70,70,90,0.16)');
    vg.addColorStop(1, 'rgba(0,0,0,0)');
    g.fillStyle = vg; g.fillRect(0, 0, W, H);
  }
}
