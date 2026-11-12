// Invisible ink: a Reveal environment.
//   Look:   a blank sheet of old letter paper. Somebody wrote on it in lemon juice.
//   Reveal: your finger is a warm candle held under the page: wherever it lingers the hidden
//           writing browns into view (a prompt). Leave it, and the heat goes out of the paper:
//           the writing slowly pales away again.
//   Clear:  "New page" slides in another sheet with another secret on it.
//
// Typed words are written in the same scorched brown. The ink picker chooses the ink.

import { mulberry32, makeCanvas, smoothstep, layoutText, drawText, HAND } from '../lib/util.js';
import { stageCanvas, mottle, blob } from '../lib/fade.js';
import { RevealScene } from '../lib/reveal.js';
import { PROMPTS } from '../lib/prompts.js';

// The swatch is the colour the writing turns when it's warmed.
const PALETTE = [
  { name: 'Lemon juice', color: '#8a4a17' },
  { name: 'Milk', color: '#5e3b1f' },
  { name: 'Onion', color: '#a0612a' },
  { name: 'UV pen', color: '#7b5cff' },
];

const COOL = 40;        // seconds for warmed writing to pale away completely
const GLOW = 0.6;       // seconds the candle's glow lingers after the finger moves on

export const invisibleInk = {
  id: 'invisible-ink',
  name: 'Invisible ink',
  mode: 'reveal',
  blurb: 'Warm the page to bring out a hidden note',
  surface: 'Blank letter paper with a secret written in invisible ink',
  clearLabel: 'New page',
  clearIcon: 'M6 3h9l4 4v14H6zM15 3v4h4M12 11c1.4 1.6 2 2.7 2 3.6a2 2 0 0 1-4 0c0-.9.6-2 2-3.6z',
  palette: PALETTE,
  create: () => new InvisibleInk(),
};

function nextPrompt(not) {
  let p;
  do { p = PROMPTS[Math.floor(Math.random() * PROMPTS.length)]; } while (p === not);
  return p;
}

class InvisibleInk extends RevealScene {
  constructor() {
    super({
      ink: PALETTE[0].color, brush: 15, soft: 0.85, deal: 'sweep', cue: 'fold', textWeight: 500,
      textInk: () => this.inkColor(),
      revealCaption: 'Warm the page to find the hidden note', freshCaption: '…then take a new page',
    });
    this.prompt = nextPrompt();
    this.glows = [];
    this.cooling = 0;   // seconds left in which the writing is still paling
  }

  get uv() { return this.ink === '#7b5cff'; }
  inkColor() { return this.uv ? '#b9a4ff' : this.ink; }

  resize(size) { this.paper = null; super.resize(size); }
  setup() { this.glows = []; }

  next() { this.prompt = nextPrompt(this.prompt); }

  revealArea() { return { x: this.W * 0.08, y: this.H * 0.2, w: this.W * 0.84, h: this.H * 0.5 }; }

  // ---------------------------------------------------------------- painting
  // The plain sheet (and, under the cover, the same sheet with the writing on it).
  paintPaper(dark = this.uv) {
    const { W, H, dpr } = this;
    const { c, g } = stageCanvas(W, H, dpr);
    const rand = mulberry32(64);
    if (dark) {
      // Under a UV lamp: a dim violet room.
      g.fillStyle = '#1c1830'; g.fillRect(0, 0, W, H);
      mottle(g, W, H, rand, { light: 14, dark: 22, scale: 6 });
      blob(g, W / 2, H * 0.45, W * 0.6, H * 0.4, 'rgba(120,90,255,0.12)');
      return c;
    }
    const gr = g.createRadialGradient(W / 2, H * 0.45, Math.min(W, H) * 0.2, W / 2, H * 0.45, Math.hypot(W, H) * 0.65);
    gr.addColorStop(0, '#f6ecd4');
    gr.addColorStop(1, '#e2cfa5');
    g.fillStyle = gr; g.fillRect(0, 0, W, H);
    mottle(g, W, H, rand, { light: 26, dark: 22, scale: 5 });
    for (let k = 0; k < (W * H) / 1400; k++) { // fibres
      const x = rand() * W, y = rand() * H, a = rand() * Math.PI, l = 3 + rand() * 9;
      g.strokeStyle = rand() > 0.5 ? 'rgba(255,250,235,0.18)' : 'rgba(120,90,40,0.08)';
      g.lineWidth = 0.6;
      g.beginPath(); g.moveTo(x, y); g.lineTo(x + Math.cos(a) * l, y + Math.sin(a) * l); g.stroke();
    }
    // Old folds across the sheet.
    g.strokeStyle = 'rgba(140,110,60,0.12)'; g.lineWidth = 1.2;
    g.beginPath(); g.moveTo(0, H * 0.34); g.lineTo(W, H * 0.33); g.moveTo(0, H * 0.67); g.lineTo(W, H * 0.68); g.stroke();
    g.strokeStyle = 'rgba(255,255,245,0.35)'; g.lineWidth = 1;
    g.beginPath(); g.moveTo(0, H * 0.34 + 1.5); g.lineTo(W, H * 0.33 + 1.5); g.moveTo(0, H * 0.67 + 1.5); g.lineTo(W, H * 0.68 + 1.5); g.stroke();
    return c;
  }

  // Under the "cover" is only the writing, on clear: render() lays it over the paper wherever
  // the page has been warmed. (Stacking two copies of the same paper would show faint seams.)
  paintUnder() {
    const { W, H, dpr } = this;
    const { c, g } = stageCanvas(W, H, dpr);
    const col = this.inkColor();
    // The secret: a little heading and the prompt.
    g.fillStyle = g.strokeStyle = col;
    g.textAlign = 'center'; g.textBaseline = 'middle';
    g.font = `500 ${Math.min(20, W * 0.05)}px ${HAND}`;
    g.globalAlpha = 0.8;
    g.fillText('psst…', W / 2, H * 0.25);
    g.globalAlpha = 1;
    const size = Math.min(W * 0.085, 40);
    const lay = layoutText(g, this.prompt, { size, minSize: 16, maxWidth: W * 0.78, weight: 500, wrap: true, maxLines: 5 });
    const block = (lay.lines.length - 1) * lay.lh;
    if (this.uv) { g.shadowColor = col; g.shadowBlur = 10; }
    drawText(g, lay, { align: 'center', x: W / 2, y0: H * 0.46 - block / 2 }, Math.max(0.8, lay.size * 0.035));
    g.shadowBlur = 0;
    // Uneven scorching: paler flecks through the writing.
    const rand = mulberry32(5);
    g.globalCompositeOperation = 'destination-out';
    for (let k = 0; k < (W * H) / 900; k++) {
      g.fillStyle = `rgba(0,0,0,${0.08 + rand() * 0.2})`;
      g.fillRect(rand() * W, rand() * H, 1 + rand() * 3, 1 + rand() * 2);
    }
    g.globalCompositeOperation = 'source-over';
    return c;
  }

  // The cover is a mask: solid where the page is cold, rubbed away where it's warm.
  paintCover(g) {
    g.fillStyle = '#000';
    g.fillRect(0, 0, this.W, this.H);
  }

  render(ctx) {
    const { W, H, dpr } = this;
    const paper = this.paper || (this.paper = this.paintPaper());
    const m = this.mix || (this.mix = makeCanvas(1, 1));
    if (m.width !== W * dpr || m.height !== H * dpr) { m.width = W * dpr; m.height = H * dpr; }
    const g = m.getContext('2d');
    g.setTransform(1, 0, 0, 1, 0, 0);
    g.globalCompositeOperation = 'copy';
    g.drawImage(this.under, 0, 0);
    g.globalCompositeOperation = 'destination-out';
    g.drawImage(this.cover, 0, 0);
    g.globalCompositeOperation = 'source-over';
    ctx.setTransform(1, 0, 0, 1, 0, 0);
    ctx.drawImage(paper, 0, 0);
    ctx.drawImage(m, 0, 0);
    ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
    for (const d of this.held || []) this.drawBlock(ctx, d);
    if (this.draft) this.drawBlock(ctx, this.draft);
    this.drawFront(ctx);
    if (this.deal) {
      // A fresh sheet slides over from the left, a glint on its edge.
      const u = smoothstep(0, 1, this.deal.t / 0.7), edge = W * u;
      ctx.save();
      ctx.beginPath(); ctx.rect(0, 0, edge, H); ctx.clip();
      ctx.setTransform(1, 0, 0, 1, 0, 0);
      ctx.drawImage(paper, 0, 0);
      ctx.restore();
      const gl = ctx.createLinearGradient(edge - 46, 0, edge, 0);
      gl.addColorStop(0, 'rgba(255,255,255,0)');
      gl.addColorStop(1, this.uv ? 'rgba(160,140,255,0.3)' : 'rgba(255,255,255,0.5)');
      ctx.fillStyle = gl;
      ctx.fillRect(edge - 46, 0, 46, H);
    }
    ctx.setTransform(1, 0, 0, 1, 0, 0);
  }

  setInk(color) {
    const lamp = (color === '#7b5cff') !== this.uv;
    if (lamp) this.paper = null; // the paper changes with the lamp
    super.setInk(color);
  }

  // ---------------------------------------------------------------- warmth
  rubbed(x, y, r) {
    this.cooling = COOL;
    const last = this.glows[this.glows.length - 1];
    if (last && Math.hypot(last.x - x, last.y - y) < r * 0.6) { last.t = 0; return; }
    this.glows.push({ x, y, r, t: 0 });
    if (this.glows.length > 40) this.glows.shift();
  }

  // The paper cools: the blank sheet creeps back over whatever was warmed.
  tick(dt) {
    for (const g of this.glows) g.t += dt;
    this.glows = this.glows.filter((g) => g.t < GLOW);
    if (this.cooling > 0 && !this.strokes.size && !this.deal) {
      this.cooling = Math.max(0, this.cooling - dt);
      const g = this.cover.g, a = 1 - Math.pow(0.01, dt / COOL);
      g.save();
      g.setTransform(1, 0, 0, 1, 0, 0);
      g.globalAlpha = a;
      g.fillStyle = '#000';
      g.fillRect(0, 0, this.cover.width, this.cover.height);
      g.restore();
      if (this.cooling === 0) this.cover = this.coat(); // fully cool: tidy up the last trace
    }
    return this.glows.length > 0 || this.cooling > 0;
  }

  // The candle's warm glow under the page.
  drawFront(ctx) {
    ctx.save();
    ctx.globalCompositeOperation = this.uv ? 'lighter' : 'multiply';
    for (const g of this.glows) {
      const a = (1 - g.t / GLOW) * 0.35, R = g.r * 2.2;
      const gr = ctx.createRadialGradient(g.x, g.y, 0, g.x, g.y, R);
      gr.addColorStop(0, this.uv ? `rgba(140,110,255,${a * 0.5})` : `rgba(255,190,110,${a})`);
      gr.addColorStop(1, this.uv ? 'rgba(140,110,255,0)' : 'rgba(255,220,170,0)');
      ctx.fillStyle = gr;
      ctx.beginPath(); ctx.arc(g.x, g.y, R, 0, Math.PI * 2); ctx.fill();
    }
    ctx.restore();
  }

  clear() { this.glows = []; this.cooling = 0; super.clear(); }
}
