// Pencil rubbing: a Reveal environment.
//   Look:   a sheet of thin white paper laid over a carved plate you can't see.
//   Reveal: shade over it and the carving comes up through the paper: a prompt in raised
//           letters, a border and a sprig of leaves, darker where the plate stands proud.
//   Clear:  "Fresh paper" lays a clean sheet over another plate.
//
// Typed words come out as if they were carved too. The ink picker chooses the pencil.

import { mulberry32, makeCanvas, layoutText, drawText, HAND } from '../lib/util.js';
import { stageCanvas, mottle } from '../lib/fade.js';
import { RevealScene } from '../lib/reveal.js';
import { PROMPTS } from '../lib/prompts.js';

const PALETTE = [
  { name: 'Graphite', color: '#3b3f47' },
  { name: 'Charcoal', color: '#1d1d20' },
  { name: 'Red crayon', color: '#b8432f' },
  { name: 'Blue crayon', color: '#2f5aa8' },
  { name: 'Green crayon', color: '#3d7a45' },
];

export const pencilRubbing = {
  id: 'pencil-rubbing',
  name: 'Pencil rubbing',
  mode: 'reveal',
  blurb: 'Shade over the paper to raise what is carved below',
  surface: 'Thin paper over a carved plate',
  clearLabel: 'Fresh paper',
  clearIcon: 'M6 4h9l4 4v12H6zM15 4v4h4M8.5 17.5l7-7M8.5 13.5l3-3',
  palette: PALETTE,
  create: () => new PencilRubbing(),
};

function nextPrompt(not) {
  let p;
  do { p = PROMPTS[Math.floor(Math.random() * PROMPTS.length)]; } while (p === not);
  return p;
}

const rgba = (hex, a) => { const n = parseInt(hex.slice(1), 16); return `rgba(${n >> 16},${(n >> 8) & 255},${n & 255},${a})`; };

class PencilRubbing extends RevealScene {
  constructor() {
    super({
      ink: PALETTE[0].color, brush: 13, soft: 0.35, deal: 'sweep', cue: 'fold', textWeight: 700,
      textInk: () => rgba(this.ink, 0.92),
      revealCaption: 'Shade over the paper to raise the carving', freshCaption: '…then lay fresh paper down',
    });
    this.prompt = nextPrompt();
    this.seed = 1;
  }

  next() { this.prompt = nextPrompt(this.prompt); this.seed++; }

  revealArea() { return { x: this.W * 0.06, y: this.H * 0.16, w: this.W * 0.88, h: this.H * 0.6 }; }

  // ---------------------------------------------------------------- the plate
  // Everything that stands proud of the plate, as a white mask on a clear canvas.
  carving() {
    const { W, H, dpr } = this;
    const { c, g } = stageCanvas(W, H, dpr);
    const rand = mulberry32(300 + this.seed);
    g.strokeStyle = g.fillStyle = '#fff';
    g.lineCap = g.lineJoin = 'round';
    // A double border.
    const m = Math.min(W, H) * 0.07, top = 70, bottom = H - 120;
    g.lineWidth = 3;
    g.beginPath(); g.roundRect(m, top, W - m * 2, bottom - top, 10); g.stroke();
    g.lineWidth = 1.4;
    g.beginPath(); g.roundRect(m + 8, top + 8, W - m * 2 - 16, bottom - top - 16, 6); g.stroke();
    // Leaf sprigs in two corners.
    const sprig = (x, y, ang, s) => {
      g.save(); g.translate(x, y); g.rotate(ang);
      g.lineWidth = 2;
      g.beginPath(); g.moveTo(0, 0); g.quadraticCurveTo(s * 0.5, -s * 0.1, s, 0); g.stroke();
      for (let k = 1; k <= 4; k++) {
        const t = k / 5, px = s * t, side = k % 2 ? 1 : -1, l = s * (0.34 - t * 0.12);
        g.save(); g.translate(px, -s * 0.05 * t); g.rotate(side * (0.7 + rand() * 0.2));
        g.beginPath();
        g.moveTo(0, 0); g.quadraticCurveTo(l * 0.5, -l * 0.32, l, 0); g.quadraticCurveTo(l * 0.5, l * 0.32, 0, 0);
        g.lineWidth = 1.6; g.stroke();
        g.lineWidth = 0.9; g.beginPath(); g.moveTo(0, 0); g.lineTo(l * 0.9, 0); g.stroke();
        g.restore();
      }
      g.restore();
    };
    const s = Math.min(W, H) * 0.2;
    sprig(m + 18, top + 22, 0.5, s);
    sprig(W - m - 18, bottom - 22, Math.PI + 0.5, s);
    // The prompt, in bold raised letters.
    g.textAlign = 'center'; g.textBaseline = 'middle';
    const size = Math.min(W * 0.085, 38);
    const lay = layoutText(g, this.prompt, { size, minSize: 16, maxWidth: W - m * 2 - 44, weight: 700, wrap: true, maxLines: 5 });
    const block = (lay.lines.length - 1) * lay.lh;
    g.font = `700 ${lay.size}px ${HAND}`;
    drawText(g, lay, { align: 'center', x: W / 2, y0: (top + bottom) / 2 - block / 2 }, Math.max(1.2, lay.size * 0.06));
    return c;
  }

  // Paper texture: what the graphite catches even on the flat parts of the plate.
  paper(g, rand) {
    const { W, H } = this;
    g.fillStyle = '#fbfaf6'; g.fillRect(0, 0, W, H);
    mottle(g, W, H, rand, { light: 10, dark: 10, scale: 6 });
  }

  paintUnder() {
    const { W, H, dpr } = this;
    const { c, g } = stageCanvas(W, H, dpr);
    const rand = mulberry32(12);
    this.paper(g, rand);
    // The flat of the plate: a light, even hatch with the paper's tooth showing through.
    const hatch = makeCanvas(W * dpr, H * dpr), h = hatch.getContext('2d');
    h.scale(dpr, dpr);
    h.strokeStyle = rgba(this.ink, 0.16);
    h.lineWidth = 1.1;
    for (let x = -H; x < W; x += 3) { h.beginPath(); h.moveTo(x, H); h.lineTo(x + H * 0.8, 0); h.stroke(); }
    for (let k = 0; k < (W * H) / 60; k++) { // tooth: specks the pencil skips
      h.clearRect(rand() * W, rand() * H, 1 + rand() * 1.5, 1);
    }
    g.drawImage(hatch, 0, 0, W, H);
    // The raised parts: dark, grainy, with a lighter halo where the paper dips around them.
    const carved = this.carving();
    const dark = makeCanvas(W * dpr, H * dpr), d = dark.getContext('2d');
    d.drawImage(carved, 0, 0);
    d.globalCompositeOperation = 'source-in';
    d.fillStyle = rgba(this.ink, 0.9); d.fillRect(0, 0, dark.width, dark.height);
    d.globalCompositeOperation = 'destination-out';
    for (let k = 0; k < (W * H) / 40; k++) {
      d.fillStyle = `rgba(0,0,0,${0.2 + rand() * 0.5})`;
      d.fillRect(rand() * dark.width, rand() * dark.height, dpr * (1 + rand()), dpr);
    }
    g.save();
    g.setTransform(1, 0, 0, 1, 0, 0);
    g.globalAlpha = 0.55;
    g.filter = `blur(${2 * dpr}px)`;
    g.globalCompositeOperation = 'destination-out';
    g.drawImage(carved, 0, 0); // the dip around each raised edge catches less
    g.filter = 'none';
    g.globalCompositeOperation = 'destination-over';
    g.globalAlpha = 1;
    g.fillStyle = '#fbfaf6'; g.fillRect(0, 0, c.width, c.height);
    g.globalCompositeOperation = 'source-over';
    g.drawImage(dark, 0, 0);
    g.restore();
    return c;
  }

  // Clean thin paper, just translucent enough to hint there's something below.
  paintCover(g) {
    const rand = mulberry32(9);
    this.paper(g, rand);
    const { W, H } = this;
    const vg = g.createRadialGradient(W / 2, H * 0.45, Math.min(W, H) * 0.3, W / 2, H * 0.45, Math.hypot(W, H) * 0.6);
    vg.addColorStop(0, 'rgba(0,0,0,0)');
    vg.addColorStop(1, 'rgba(90,85,70,0.1)');
    g.fillStyle = vg; g.fillRect(0, 0, W, H);
  }
}
