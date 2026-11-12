// Beach dig: a Reveal environment.
//   Look:   dry, pale sand at the top of the beach, rippled by the wind.
//   Reveal: brush it aside and there's wet sand underneath, with a message pressed into it (a
//           prompt) and a few shells. Sand grains kick up off your fingertip as you dig.
//   Clear:  "Tide comes in": a wash of foam smooths it all over and leaves fresh sand with a
//           new message under it.
//
// Typed words are pressed into the wet sand. The ink picker chooses the beach.

import { mulberry32, layoutText, drawText, HAND } from '../lib/util.js';
import { stageCanvas, mottle, speckle } from '../lib/fade.js';
import { RevealScene } from '../lib/reveal.js';
import { PROMPTS } from '../lib/prompts.js';

// color: the dry sand. wet: the sand underneath. groove: the message's shadow.
const PALETTE = [
  { name: 'Golden', color: '#e8cf9a', wet: '#9c7543', groove: '#5a3f1e' },
  { name: 'Coral white', color: '#f1ebdc', wet: '#ada085', groove: '#5e533e' },
  { name: 'Pink', color: '#efcfc4', wet: '#aa7f72', groove: '#5e3a32' },
  { name: 'Volcanic', color: '#55555a', wet: '#2b2b30', groove: '#0f0f12' },
];

export const beachDig = {
  id: 'beach-dig',
  name: 'Beach dig',
  mode: 'reveal',
  blurb: 'Brush the sand aside to find a message',
  surface: 'Dry sand with a message buried in the wet sand below',
  clearLabel: 'Tide comes in',
  clearIcon: 'M3 15c2 0 2-2 4.5-2s2.5 2 4.5 2 2-2 4.5-2 2.5 2 4.5 2M3 19c2 0 2-2 4.5-2s2.5 2 4.5 2 2-2 4.5-2 2.5 2 4.5 2M12 4l3 5H9z',
  palette: PALETTE,
  create: () => new BeachDig(),
};

function nextPrompt(not) {
  let p;
  do { p = PROMPTS[Math.floor(Math.random() * PROMPTS.length)]; } while (p === not);
  return p;
}

class BeachDig extends RevealScene {
  constructor() {
    super({
      ink: PALETTE[0].color, brush: 16, soft: 0.6, deal: 'fade', cue: 'wave', textWeight: 600,
      textInk: () => this.sand().groove,
      revealCaption: 'Brush the sand away to find a message', freshCaption: '…then let the tide come in',
    });
    this.cueOpts = { big: true };
    this.prompt = nextPrompt();
    this.seed = 3;
    this.grains = [];
    this.rand = mulberry32(19);
  }

  sand() { return PALETTE.find((p) => p.color === this.ink) || PALETTE[0]; }

  setup() { this.grains = []; }

  next() { this.prompt = nextPrompt(this.prompt); this.seed++; }

  revealArea() { return { x: this.W * 0.06, y: this.H * 0.18, w: this.W * 0.88, h: this.H * 0.55 }; }

  // ---------------------------------------------------------------- painting
  // Wet sand, smooth and darker, with the message pressed in and some shells.
  paintUnder() {
    const { W, H, dpr } = this;
    const s = this.sand();
    const { c, g } = stageCanvas(W, H, dpr);
    const rand = mulberry32(40 + this.seed);
    g.fillStyle = s.wet; g.fillRect(0, 0, W, H);
    mottle(g, W, H, rand, { light: 18, dark: 24, scale: 5 });
    speckle(g, W, H, rand, (W * H) / 90, 'rgba(255,255,255,0.12)', 0.8);
    speckle(g, W, H, rand, (W * H) / 120, 'rgba(0,0,0,0.12)', 0.8);
    // A sheen where water still sits on it.
    const sheen = g.createLinearGradient(0, 0, W, H);
    sheen.addColorStop(0, 'rgba(255,255,255,0.12)');
    sheen.addColorStop(0.5, 'rgba(255,255,255,0)');
    sheen.addColorStop(1, 'rgba(255,255,255,0.08)');
    g.fillStyle = sheen; g.fillRect(0, 0, W, H);

    // The message, written with a finger: a dark groove with a lit lip just below it.
    g.textAlign = 'center'; g.textBaseline = 'middle';
    const size = Math.min(W * 0.09, 42);
    const lay = layoutText(g, this.prompt, { size, minSize: 17, maxWidth: W * 0.8, weight: 600, wrap: true, maxLines: 5 });
    const block = (lay.lines.length - 1) * lay.lh, place = { align: 'center', x: W / 2, y0: H * 0.45 - block / 2 };
    const lw = Math.max(1.4, lay.size * 0.07);
    g.font = `600 ${lay.size}px ${HAND}`;
    g.fillStyle = g.strokeStyle = 'rgba(255,250,235,0.35)';
    drawText(g, lay, { ...place, y0: place.y0 + 1.6 }, lw);
    g.fillStyle = g.strokeStyle = s.groove;
    drawText(g, lay, place, lw);

    // Shells near the corners, clear of the words.
    const spots = [[0.14, 0.2], [0.86, 0.24], [0.16, 0.72], [0.84, 0.7], [0.5, 0.78]];
    for (const [fx, fy] of spots) {
      if (rand() < 0.3) continue;
      const kind = Math.floor(rand() * 3), x = W * fx + (rand() - 0.5) * 20, y = H * fy + (rand() - 0.5) * 20;
      const r = Math.min(W, H) * (0.035 + rand() * 0.02), a = rand() * Math.PI * 2;
      [scallop, spiral, starfish][kind](g, x, y, r, a, rand);
    }
    return c;
  }

  // Dry sand: lighter, grainy, with wind ripples across it.
  paintCover(g) {
    const { W, H } = this;
    const s = this.sand();
    const rand = mulberry32(8);
    g.fillStyle = s.color; g.fillRect(0, 0, W, H);
    mottle(g, W, H, rand, { light: 22, dark: 18, scale: 6 });
    for (let y = 6; y < H; y += 9 + rand() * 6) {
      g.strokeStyle = `rgba(0,0,0,${0.04 + rand() * 0.04})`;
      g.lineWidth = 2 + rand() * 2;
      g.beginPath();
      for (let x = -10; x <= W + 10; x += 14) g.lineTo(x, y + Math.sin(x * 0.03 + y) * 3 + (rand() - 0.5) * 1.5);
      g.stroke();
    }
    speckle(g, W, H, rand, (W * H) / 50, 'rgba(255,255,255,0.18)', 0.7);
    speckle(g, W, H, rand, (W * H) / 70, 'rgba(60,40,20,0.14)', 0.7);
  }

  // ---------------------------------------------------------------- grains
  rubbed(x, y, r) {
    if (this.calm || this.grains.length > 140) return;
    for (let k = 0; k < 3; k++) {
      const a = this.rand() * Math.PI * 2, v = 40 + this.rand() * 90;
      this.grains.push({ x: x + Math.cos(a) * r * 0.8, y: y + Math.sin(a) * r * 0.8, vx: Math.cos(a) * v, vy: Math.sin(a) * v, t: 0, life: 0.3 + this.rand() * 0.3 });
    }
  }

  tick(dt) {
    if (!this.grains.length) return false;
    for (const p of this.grains) {
      p.t += dt; p.x += p.vx * dt; p.y += p.vy * dt;
      p.vx *= 1 - 4 * dt; p.vy *= 1 - 4 * dt;
    }
    this.grains = this.grains.filter((p) => p.t < p.life);
    return true;
  }

  drawFront(ctx) {
    const s = this.sand();
    for (const p of this.grains) {
      ctx.globalAlpha = 1 - p.t / p.life;
      ctx.fillStyle = s.color;
      ctx.fillRect(p.x, p.y, 1.6, 1.6);
    }
    ctx.globalAlpha = 1;
    // The tide: a band of foam running up the beach while fresh sand arrives.
    if (this.deal) {
      const u = Math.min(1, this.deal.t / 0.7), { W, H } = this;
      const y = H * (1.05 - u * 1.2);
      const gr = ctx.createLinearGradient(0, y - 30, 0, y + 50);
      gr.addColorStop(0, 'rgba(255,255,255,0)');
      gr.addColorStop(0.4, 'rgba(255,255,255,0.85)');
      gr.addColorStop(1, 'rgba(200,230,240,0)');
      ctx.fillStyle = gr;
      ctx.beginPath(); ctx.moveTo(0, y + 50);
      for (let x = 0; x <= W; x += 16) ctx.lineTo(x, y + Math.sin(x * 0.05 + u * 8) * 8);
      ctx.lineTo(W, y + 50); ctx.closePath(); ctx.fill();
    }
  }

  clear() { this.grains = []; super.clear(); }
}

// ------------------------------------------------------------------ shells
function scallop(g, x, y, r, a) {
  g.save(); g.translate(x, y); g.rotate(a);
  g.fillStyle = '#f3dccb'; g.strokeStyle = 'rgba(140,90,70,0.6)'; g.lineWidth = 0.9;
  g.beginPath(); g.moveTo(0, r * 0.6);
  g.arc(0, -r * 0.1, r, Math.PI * 0.85, Math.PI * 2.15);
  g.closePath(); g.fill(); g.stroke();
  for (let k = -3; k <= 3; k++) { g.beginPath(); g.moveTo(0, r * 0.6); g.lineTo(Math.sin(k * 0.32) * r, -r * 0.1 - Math.cos(k * 0.32) * r); g.stroke(); }
  g.fillRect(-r * 0.25, r * 0.55, r * 0.5, r * 0.2);
  g.restore();
}

function spiral(g, x, y, r, a) {
  g.save(); g.translate(x, y); g.rotate(a);
  g.fillStyle = '#e9c9a4'; g.strokeStyle = 'rgba(120,80,50,0.7)'; g.lineWidth = 1;
  g.beginPath(); g.ellipse(0, 0, r, r * 0.62, 0, 0, Math.PI * 2); g.fill(); g.stroke();
  g.beginPath();
  for (let t = 0; t < 12; t += 0.2) { const rr = r * 0.62 * (1 - t / 13); g.lineTo(Math.cos(t) * rr * 1.4 - r * 0.2, Math.sin(t) * rr); }
  g.stroke();
  g.restore();
}

function starfish(g, x, y, r, a) {
  g.save(); g.translate(x, y); g.rotate(a);
  g.fillStyle = '#e07a4f'; g.strokeStyle = 'rgba(120,50,30,0.6)'; g.lineWidth = 1;
  g.beginPath();
  for (let k = 0; k < 10; k++) { const rr = k % 2 ? r * 0.42 : r * 1.15, t = (k / 10) * Math.PI * 2; g.lineTo(Math.cos(t) * rr, Math.sin(t) * rr); }
  g.closePath(); g.fill(); g.stroke();
  g.fillStyle = 'rgba(255,220,190,0.6)';
  for (let k = 0; k < 5; k++) { const t = (k / 5) * Math.PI * 2; g.beginPath(); g.arc(Math.cos(t) * r * 0.5, Math.sin(t) * r * 0.5, 1, 0, Math.PI * 2); g.fill(); }
  g.restore();
}
