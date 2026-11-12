// Bubble wrap: a Reveal environment.
//   Look:   a sheet of bubble wrap over a parcel. Every bubble your finger crosses pops.
//   Reveal: there's a prompt on the parcel's label, and each popped bubble is a little window
//           onto it. Pop most of the sheet and the rest goes off in a rattle and the wrap
//           lifts away.
//   Clear:  "New sheet" wraps a fresh parcel with another prompt.
//
// Typed words pop the bubbles under their letters. The ink picker tints the wrap.

import { clamp, mulberry32, makeCanvas, layoutText, drawText, HAND } from '../lib/util.js';
import { stageCanvas, mottle } from '../lib/fade.js';
import { RevealScene } from '../lib/reveal.js';
import { PROMPTS } from '../lib/prompts.js';
import { sfx } from '../lib/sound.js';

const PALETTE = [
  { name: 'Clear', color: '#dfe8ee' },
  { name: 'Pink', color: '#f6b6cf' },
  { name: 'Mint', color: '#a9e6cf' },
  { name: 'Sky', color: '#a9d4f5' },
  { name: 'Lilac', color: '#cdb9f2' },
  { name: 'Lemon', color: '#f3e59a' },
];

const REVEAL_AT = 0.7;  // this much of the sheet popped and the rest goes by itself
const BURST = 0.24;     // seconds a pop's little burst lasts
const LIFT = 0.7;       // seconds for the spent wrap to lift away

export const bubbleWrap = {
  id: 'bubble-wrap',
  name: 'Bubble wrap',
  mode: 'reveal',
  blurb: 'Pop the bubbles to see what is wrapped up',
  surface: 'Bubble wrap over a parcel with a prompt on its label',
  clearLabel: 'New sheet',
  clearIcon: 'M5 5h14v14H5zM9.2 9.2m-1.7 0a1.7 1.7 0 1 0 3.4 0a1.7 1.7 0 1 0-3.4 0M14.8 9.2m-1.7 0a1.7 1.7 0 1 0 3.4 0a1.7 1.7 0 1 0-3.4 0M9.2 14.8m-1.7 0a1.7 1.7 0 1 0 3.4 0a1.7 1.7 0 1 0-3.4 0M14.8 14.8m-1.7 0a1.7 1.7 0 1 0 3.4 0a1.7 1.7 0 1 0-3.4 0',
  palette: PALETTE,
  create: () => new BubbleWrap(),
};

// Mix a #rrggbb colour towards white (t > 0) or black (t < 0), with an alpha.
function tint(hex, t, a = 1) {
  const n = parseInt(hex.slice(1), 16);
  const to = t > 0 ? 255 : 0, k = Math.abs(t);
  const ch = (v) => Math.round(v + (to - v) * k);
  return `rgba(${ch(n >> 16)},${ch((n >> 8) & 255)},${ch(n & 255)},${a})`;
}

// A prompt for the next parcel, never the one that's showing.
function nextPrompt(not) {
  let p;
  do { p = PROMPTS[Math.floor(Math.random() * PROMPTS.length)]; } while (p === not);
  return p;
}

class BubbleWrap extends RevealScene {
  constructor() {
    super({
      ink: PALETTE[0].color, brush: 9,
      revealCaption: 'Pop the bubbles to see what is inside', freshCaption: '…then wrap a fresh one',
    });
    this.prompt = nextPrompt();
    this.bubbles = null;
    this.bursts = [];
    this.queue = [];      // bubbles waiting to go off once the sheet lets go
    this.revealed = false;
    this.lift = 0;
    this.buzzed = 0;
  }

  resize(size) {
    this.bubbles = null;
    this.bursts = [];
    this.queue = [];
    this.revealed = false;
    this.lift = 0;
    super.resize(size);
  }

  // Where Show me pops: the whole sheet above the toolbar.
  revealArea() { return { x: 0, y: 58, w: this.W, h: Math.max(160, this.H - 58 - 104) }; }

  // A honeycomb of bubbles that runs off every edge.
  layout() {
    const { W, H } = this;
    const R = clamp(Math.min(W, H) / 15, 17, 27);
    const dx = R * 2 + 3, dy = dx * 0.866;
    const out = [];
    for (let row = 0, y = R * 0.6; y < H + R; row++, y += dy) {
      for (let x = (row % 2 ? dx / 2 : 0) + R * 0.4; x < W + R; x += dx) out.push({ x, y, popped: false });
    }
    this.R = R;
    return out;
  }

  // ---------------------------------------------------------------- painting
  // The parcel: brown paper, string, and a label with the prompt on it.
  paintUnder() {
    const { W, H, dpr } = this;
    const rand = mulberry32(31);
    const { c, g } = stageCanvas(W, H, dpr);
    g.fillStyle = '#b88a5a'; g.fillRect(0, 0, W, H);
    mottle(g, W, H, rand, { light: 20, dark: 26, scale: 4 });
    for (let k = 0; k < (W * H) / 900; k++) { // paper fibres
      const x = rand() * W, y = rand() * H, a = rand() * Math.PI, l = 4 + rand() * 12;
      g.strokeStyle = rand() > 0.5 ? 'rgba(255,240,215,0.10)' : 'rgba(70,40,15,0.10)';
      g.lineWidth = 0.7;
      g.beginPath(); g.moveTo(x, y); g.lineTo(x + Math.cos(a) * l, y + Math.sin(a) * l); g.stroke();
    }
    // String round the parcel.
    g.strokeStyle = 'rgba(245,232,205,0.85)'; g.lineWidth = 2.2;
    g.beginPath(); g.moveTo(W * 0.5, 0); g.lineTo(W * 0.5, H); g.moveTo(0, H * 0.5); g.lineTo(W, H * 0.5); g.stroke();

    // The label, clear of the chips at the top and the toolbar at the bottom.
    const top = 74, bottom = Math.max(top + 150, H - 128);
    const p = { x: 22, y: top, w: W - 44, h: bottom - top };
    g.save();
    g.shadowColor = 'rgba(40,20,5,0.4)'; g.shadowBlur = 16; g.shadowOffsetY = 5;
    g.fillStyle = '#fbf5e6';
    g.beginPath(); g.roundRect(p.x, p.y, p.w, p.h, 14); g.fill();
    g.restore();
    g.strokeStyle = 'rgba(176,134,58,0.5)'; g.lineWidth = 1.2; g.setLineDash([5, 5]);
    g.beginPath(); g.roundRect(p.x + 8, p.y + 8, p.w - 16, p.h - 16, 9); g.stroke();
    g.setLineDash([]);

    g.fillStyle = '#b0863a';
    g.font = `600 ${Math.min(12, W * 0.034)}px system-ui, sans-serif`;
    g.textAlign = 'center'; g.textBaseline = 'middle';
    g.letterSpacing = '2px';
    g.fillText('YOUR PROMPT', W / 2, p.y + 30);
    g.letterSpacing = '0px';

    g.fillStyle = g.strokeStyle = '#2d3340';
    const size = Math.min(W * 0.085, 34);
    const lay = layoutText(g, this.prompt, {
      size, minSize: 15, maxWidth: p.w - 44, weight: 400, wrap: true,
      maxLines: Math.max(2, Math.floor((p.h - 90) / (size * 1.15))),
    });
    const block = (lay.lines.length - 1) * lay.lh;
    drawText(g, lay, { align: 'center', x: W / 2, y0: p.y + p.h / 2 + 8 - block / 2 }, Math.max(0.6, lay.size * 0.02));
    return c;
  }

  // The wrap: a cloudy film with a dome on it for every bubble still whole.
  paintCover(g) {
    const { W, H } = this;
    if (!this.bubbles) this.bubbles = this.layout();
    g.fillStyle = tint(this.ink, 0.25, 0.97); g.fillRect(0, 0, W, H);
    for (const b of this.bubbles) (b.popped ? this.paintPopped : this.paintDome).call(this, g, b);
  }

  paintDome(g, b) {
    const R = this.R;
    const gr = g.createRadialGradient(b.x - R * 0.32, b.y - R * 0.36, R * 0.05, b.x, b.y, R);
    gr.addColorStop(0, tint(this.ink, 0.85, 1));
    gr.addColorStop(0.55, tint(this.ink, 0.3, 1));
    gr.addColorStop(1, tint(this.ink, -0.2, 1));
    g.fillStyle = gr;
    g.beginPath(); g.arc(b.x, b.y, R, 0, Math.PI * 2); g.fill();
    g.strokeStyle = 'rgba(255,255,255,0.55)'; g.lineWidth = 1;
    g.beginPath(); g.arc(b.x, b.y, R - 0.6, Math.PI * 0.95, Math.PI * 1.75); g.stroke();
    g.fillStyle = 'rgba(255,255,255,0.8)';
    g.beginPath(); g.ellipse(b.x - R * 0.36, b.y - R * 0.4, R * 0.2, R * 0.11, -0.7, 0, Math.PI * 2); g.fill();
  }

  // A popped bubble is a clear window with a flat, creased rim.
  paintPopped(g, b) {
    const R = this.R;
    g.save();
    g.globalCompositeOperation = 'destination-out';
    g.fillStyle = '#000';
    g.beginPath(); g.arc(b.x, b.y, R + 0.5, 0, Math.PI * 2); g.fill();
    g.restore();
    g.fillStyle = tint(this.ink, 0.3, 0.1);
    g.beginPath(); g.arc(b.x, b.y, R, 0, Math.PI * 2); g.fill();
    g.strokeStyle = 'rgba(255,255,255,0.6)'; g.lineWidth = 1.4;
    g.beginPath(); g.arc(b.x, b.y, R - 0.8, 0, Math.PI * 2); g.stroke();
    const a = (b.x * 7 + b.y * 13) % 6.28; // each one creases its own way
    g.strokeStyle = 'rgba(255,255,255,0.4)'; g.lineWidth = 1;
    g.beginPath();
    g.moveTo(b.x + Math.cos(a) * R * 0.75, b.y + Math.sin(a) * R * 0.75);
    g.quadraticCurveTo(b.x, b.y + R * 0.15, b.x + Math.cos(a + 2.5) * R * 0.7, b.y + Math.sin(a + 2.5) * R * 0.7);
    g.stroke();
  }

  // The picker tints the wrap; what's popped stays popped.
  setInk(color) {
    if (color === this.ink) return;
    this.ink = color;
    if (!this.W) return;
    const alpha = this.cover.alpha;
    this.cover = this.coat();
    this.cover.alpha = alpha;
  }

  // ---------------------------------------------------------------- popping
  pop(b) {
    if (b.popped) return;
    b.popped = true;
    this.paintPopped(this.cover.g, b);
    if (!this.calm && this.bursts.length < 60) this.bursts.push({ x: b.x, y: b.y, t: 0 });
    sfx.cue('bubble');
    // A tick under the finger where the device can do it (and only once it's been touched).
    const now = performance.now();
    if (now - this.buzzed > 45 && navigator.vibrate && navigator.userActivation?.hasBeenActive) {
      this.buzzed = now;
      try { navigator.vibrate(8); } catch { /* not allowed here */ }
    }
  }

  // Every whole bubble the finger's path crosses goes.
  rub(x0, y0, x1, y1, r) {
    if (this.revealed) return;
    const reach = r + this.R * 0.45;
    const vx = x1 - x0, vy = y1 - y0, len2 = vx * vx + vy * vy;
    for (const b of this.bubbles) {
      if (b.popped) continue;
      const t = len2 ? clamp(((b.x - x0) * vx + (b.y - y0) * vy) / len2, 0, 1) : 0;
      if (Math.hypot(b.x - (x0 + vx * t), b.y - (y0 + vy * t)) <= reach) this.pop(b);
    }
    this.last = { x: x1, y: y1 };
  }

  lifted() {
    if (this.revealed || this.strokes.size) return;
    const seen = this.bubbles.filter((b) => b.x > 0 && b.x < this.W && b.y > 0 && b.y < this.H);
    if (seen.filter((b) => b.popped).length >= seen.length * REVEAL_AT) this.revealAll();
  }

  // The rest of the sheet goes off, nearest first, and the spent wrap lifts away.
  revealAll() {
    if (this.revealed || this.deal) return;
    this.commitDraft();
    this.revealed = true;
    const o = this.last || { x: this.W / 2, y: this.H / 2 };
    const rest = this.bubbles.filter((b) => !b.popped).sort((a, b) => Math.hypot(a.x - o.x, a.y - o.y) - Math.hypot(b.x - o.x, b.y - o.y));
    const step = Math.min(0.016, 0.8 / Math.max(1, rest.length));
    this.queue = rest.map((b, i) => ({ b, at: i * step }));
    this.clock = 0;
    this.lift = 0;
  }

  next() {
    this.prompt = nextPrompt(this.prompt);
    this.bubbles = null;
    this.bursts = [];
    this.queue = [];
    this.revealed = false;
    this.last = null;
  }

  tick(dt) {
    for (const p of this.bursts) p.t += dt;
    this.bursts = this.bursts.filter((p) => p.t < BURST);
    let alive = this.bursts.length > 0;
    if (this.revealed && !this.deal) {
      if (this.queue.length) {
        this.clock += dt;
        while (this.queue.length && this.queue[0].at <= this.clock) this.pop(this.queue.shift().b);
        alive = true;
      } else if (this.lift < 1) {
        this.lift = Math.min(1, this.lift + dt / LIFT);
        this.cover.alpha = 1 - this.lift;
        alive = true;
      }
    }
    return alive;
  }

  // A pop: a quick ring and a few flecks.
  drawFront(ctx) {
    if (!this.bursts.length) return;
    const R = this.R;
    ctx.save();
    ctx.lineCap = 'round';
    for (const p of this.bursts) {
      const u = p.t / BURST;
      ctx.globalAlpha = (1 - u) * 0.9;
      ctx.strokeStyle = '#ffffff';
      ctx.lineWidth = 2 * (1 - u) + 0.5;
      ctx.beginPath(); ctx.arc(p.x, p.y, R * (0.55 + u * 0.75), 0, Math.PI * 2); ctx.stroke();
      for (let k = 0; k < 5; k++) {
        const a = k * 1.257 + p.x, d0 = R * (0.9 + u * 0.5), d1 = d0 + R * 0.28;
        ctx.beginPath();
        ctx.moveTo(p.x + Math.cos(a) * d0, p.y + Math.sin(a) * d0);
        ctx.lineTo(p.x + Math.cos(a) * d1, p.y + Math.sin(a) * d1);
        ctx.stroke();
      }
    }
    ctx.restore();
  }

  // ---------------------------------------------------------------- text
  // Words are written on the wrap in marker while you type…
  drawBlock(g, { lay, place }) {
    g.save();
    g.fillStyle = g.strokeStyle = 'rgba(38,44,58,0.82)';
    g.font = `${this.textWeight} ${lay.size}px ${HAND}`;
    drawText(g, lay, place, Math.max(1.4, lay.size * 0.05));
    g.restore();
  }

  // …and on Done every bubble under a letter pops.
  onCommit(blocks) {
    if (this.revealed || !this.bubbles) return;
    const k = 0.25, c = makeCanvas(Math.ceil(this.W * k), Math.ceil(this.H * k));
    const g = c.getContext('2d', { willReadFrequently: true });
    g.setTransform(k, 0, 0, k, 0, 0);
    g.lineCap = g.lineJoin = 'round';
    g.fillStyle = g.strokeStyle = '#000';
    for (const { lay, place } of blocks) {
      g.font = `${this.textWeight} ${lay.size}px ${HAND}`;
      drawText(g, lay, place, this.R * 0.9);
    }
    const img = g.getImageData(0, 0, c.width, c.height);
    for (const b of this.bubbles) {
      const x = Math.round(b.x * k), y = Math.round(b.y * k);
      if (x < 0 || y < 0 || x >= c.width || y >= c.height) continue;
      if (img.data[(y * c.width + x) * 4 + 3] > 40) this.pop(b);
    }
    this.lifted();
  }
}
