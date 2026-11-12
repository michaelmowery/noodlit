// Music box: an Echo environment.
//   Look:   a strip of music box paper on a wooden lid. You sketch on it in pencil.
//   Echo:   pause, and a punch runs along every line in the order you drew it, punching
//           holes, and each hole plays a note: higher up the strip, higher the note. Typed
//           words come back a letter at a time and each letter rings.
//   Leave:  the punched strip feeds away through the box and is gone.

import { mulberry32 } from '../lib/util.js';
import { EchoScene } from '../lib/echo.js';
import { stageCanvas, mottle } from '../lib/fade.js';
import { sfx } from '../lib/sound.js';

const PALETTE = [
  { name: 'Graphite', color: '#4a4d55' },
  { name: 'Red pencil', color: '#b8433a' },
  { name: 'Blue pencil', color: '#3a5fae' },
  { name: 'Green pencil', color: '#3f7d4a' },
];

const HOLE = 20;  // px between holes along a line

export const musicBox = {
  id: 'music-box',
  name: 'Music box',
  mode: 'echo',
  blurb: 'Pause, and your lines are punched and played as a tune',
  surface: 'Music box paper strip to sketch a tune on',
  clearLabel: 'Play',
  clearIcon: 'M8 5.5v13l10.5-6.5z',
  palette: PALETTE,
  create: () => new MusicBox(),
};

class MusicBox extends EchoScene {
  constructor() {
    super({ ink: PALETTE[0].color, brush: 2.2, seed: 27, sparks: false, quiet: 0.35, passes: [{ rate: 0.4, hold: 0.5, fade: 2.2 }] });
    this.carry = 0;
  }

  paintBase() { return paintStrip(this.W, this.H, this.dpr); }

  // The strip's top and bottom edges, so notes follow how high up the strip a hole is.
  get band() { return [this.H * 0.14, this.H * 0.8]; }

  paintSeg(g, x0, y0, r0, x1, y1, r1, ink = this.ink) {
    if (!this.playing) {
      // Pencil: a fine grey line with a bit of grain.
      g.save();
      g.strokeStyle = ink;
      g.globalAlpha = 0.75;
      g.lineWidth = Math.max(1, (r0 + r1) * 0.55);
      g.beginPath(); g.moveTo(x0, y0); g.lineTo(x1 + 0.01, y1); g.stroke();
      g.restore();
      return;
    }
    // Played back: a punched hole every so often along the line, and a note for each.
    const d = Math.hypot(x1 - x0, y1 - y0);
    if (d === 0 && this.carry > 0) return;
    let at = d === 0 ? 0 : HOLE - this.carry;
    while (at <= d) {
      const t = d ? at / d : 0, x = x0 + (x1 - x0) * t, y = y0 + (y1 - y0) * t;
      this.punch(g, x, y, Math.max(2.2, (r0 + r1) * 0.7));
      const [top, bottom] = this.band;
      sfx.cue('musicbox', { pitch: 1 - Math.min(1, Math.max(0, (y - top) / (bottom - top))) });
      at += HOLE;
    }
    this.carry = d === 0 ? 0 : (this.carry + d) % HOLE;
  }

  // A slot punched through the card: dark inside, a lit edge below.
  punch(g, x, y, r) {
    g.save();
    g.fillStyle = 'rgba(255,255,255,0.6)';
    g.beginPath(); g.roundRect(x - r * 1.3, y - r * 0.7 + 1, r * 2.6, r * 1.4, r * 0.5); g.fill();
    g.fillStyle = '#3b2a1c';
    g.beginPath(); g.roundRect(x - r * 1.3, y - r * 0.7, r * 2.6, r * 1.4, r * 0.5); g.fill();
    g.restore();
  }

  onStroke() { this.carry = 0; }

  inkText(g) {
    if (this.playing) { g.globalAlpha = 0.9; g.fillStyle = g.strokeStyle = '#3b2a1c'; }
    else g.globalAlpha = 0.75;
  }

  // Each letter that comes back rings, too.
  drawPartial(g, block, n) {
    if (n !== this.lastLetter) { this.lastLetter = n; sfx.cue('musicbox', { pitch: (n * 0.37) % 1 }); }
    super.drawPartial(g, block, n);
  }

  // Once it has played, the strip feeds away to the left.
  look(p, age) { return this.calm ? null : { dx: -age * age * 120 }; }

  // The punch: a small brass die.
  drawHead(ctx, h) {
    ctx.save();
    ctx.fillStyle = '#d8b25a';
    ctx.strokeStyle = 'rgba(90,60,20,0.8)';
    ctx.lineWidth = 1.2;
    ctx.beginPath(); ctx.arc(h.x, h.y, 6, 0, Math.PI * 2); ctx.fill(); ctx.stroke();
    ctx.fillStyle = 'rgba(255,245,210,0.8)';
    ctx.beginPath(); ctx.arc(h.x - 1.8, h.y - 1.8, 1.8, 0, Math.PI * 2); ctx.fill();
    ctx.restore();
  }
}

// A wooden lid, and a long strip of cream card running across it with faint note lines.
function paintStrip(W, H, dpr) {
  const rand = mulberry32(61);
  const { c, g } = stageCanvas(W, H, dpr);
  const wood = g.createLinearGradient(0, 0, 0, H);
  wood.addColorStop(0, '#6b4127');
  wood.addColorStop(1, '#4a2b18');
  g.fillStyle = wood; g.fillRect(0, 0, W, H);
  for (let y = 0; y < H; y += 2) {
    g.fillStyle = `rgba(${rand() > 0.5 ? '255,210,160' : '20,8,0'},${0.03 + rand() * 0.05})`;
    g.fillRect(0, y + Math.sin(y * 0.05) * 2, W, 1 + rand() * 2);
  }
  const top = H * 0.12, bottom = H * 0.82;
  g.save();
  g.shadowColor = 'rgba(0,0,0,0.45)'; g.shadowBlur = 18; g.shadowOffsetY = 6;
  g.fillStyle = '#f6efdc';
  g.fillRect(-10, top, W + 20, bottom - top);
  g.restore();
  mottle(g, W, H, rand, { light: 8, dark: 8, scale: 6 });
  g.fillStyle = 'rgba(0,0,0,0)';
  // Note lines across the strip, and sprocket holes along both edges.
  const lines = 15;
  for (let k = 1; k < lines; k++) {
    const y = top + ((bottom - top) * k) / lines;
    g.strokeStyle = k % 5 === 0 ? 'rgba(170,120,80,0.32)' : 'rgba(170,120,80,0.16)';
    g.lineWidth = 1;
    g.beginPath(); g.moveTo(0, y); g.lineTo(W, y); g.stroke();
  }
  for (let x = 8; x < W; x += 16) {
    for (const y of [top + 7, bottom - 7]) {
      g.fillStyle = '#4a2b18';
      g.beginPath(); g.arc(x, y, 2.4, 0, Math.PI * 2); g.fill();
    }
  }
  // The box's comb at the left, where the strip feeds in.
  g.fillStyle = 'rgba(200,170,110,0.9)';
  for (let k = 0; k < 18; k++) {
    const y = top + 14 + ((bottom - top - 28) * k) / 17;
    g.fillRect(0, y - 1, 10 + (k % 3) * 2, 2);
  }
  return c;
}
