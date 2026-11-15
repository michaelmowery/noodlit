// Scratch art: a Reveal environment.
//   Look:   a sheet of black scratch paper. Your finger is the stylus.
//   Reveal: every line cuts through the black to a picture printed underneath: mountains, a
//           beach, a night sky… a different one each sheet, unless the ink picker names one.
//   Clear:  "New sheet" slides a fresh black one over, with a new picture under it.

import { mulberry32 } from '../lib/util.js';
import { stageCanvas } from '../lib/fade.js';
import { SCENERY } from '../lib/scenery.js';
import { RevealScene } from '../lib/reveal.js';

// The ink picker chooses the picture: one particular scene, or a different one each sheet.
// Swatches are hints at the colours; the picture itself is painted by lib/scenery.js.
const SWATCH = { mountains: '#c25d9a', seaside: '#1fb5c9', night: '#1d2a8f', forest: '#2f9e5c', desert: '#f28c50', city: '#a64fe0', balloons: '#ffd34f' };
const ANY = '#ff7aa8';
const PALETTE = [
  { name: 'Any scene', color: ANY },
  ...SCENERY.map((s) => ({ name: s.name, color: SWATCH[s.id], scene: s })),
];

export const scratchArt = {
  id: 'scratch-art',
  name: 'Scratch art',
  mode: 'reveal',
  blurb: 'Scrape through black to a hidden picture',
  surface: 'Black scratch paper with a picture underneath',
  clearLabel: 'New sheet',
  clearIcon: 'M6 4h9l4 4v12H6zM15 4v4h4',
  palette: PALETTE,
  create: () => new ScratchArt(),
};

class ScratchArt extends RevealScene {
  constructor() {
    super({ ink: PALETTE[0].color, brush: 3.4, revealCaption: 'Scratch through to the picture below', freshCaption: '…then take a fresh sheet' });
    this.roll();
  }

  // Pick the next picture: a fresh layout every sheet, and with "Any scene" a different scene
  // from the last one. Kept across resizes so turning the phone doesn't swap the picture.
  roll() {
    const fixed = PALETTE.find((p) => p.color === this.ink)?.scene;
    let scene = fixed;
    if (!scene) {
      const others = SCENERY.filter((s) => s !== this.pick?.scene);
      scene = others[Math.floor(Math.random() * others.length)];
    }
    this.pick = { scene, seed: (Math.random() * 2 ** 31) >>> 0 };
  }

  next() { this.roll(); }

  setInk(color) {
    if (color === this.ink) return;
    this.ink = color;
    this.roll();
    if (!this.W) return;
    this.under = this.paintUnder();
    this.pattern = null;
  }

  paintUnder() {
    const { W, H, dpr } = this;
    const { c, g } = stageCanvas(W, H, dpr);
    this.pick.scene.paint(g, W, H, mulberry32(this.pick.seed));
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
