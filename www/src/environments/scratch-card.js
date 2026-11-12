// Scratch card: the sample Reveal environment.
//   Look:   a card on a felt table with a panel of foil across it. Your finger is a coin: it
//           scrapes the foil away and flakes fall off.
//   Reveal: there's a prompt printed under the foil. Scratch off a bit over half and the rest
//           lets go on its own. After that the card is yours to jot on in pencil.
//   Clear:  "New card" deals a fresh one with another prompt.
//
// Typed words are written on the foil in marker (or pencilled onto the card once it's
// revealed). The ink picker chooses the foil.

import { clamp, smoothstep, mulberry32, makeCanvas, layoutText, layoutFor, drawText, draftMethods, HAND } from '../lib/util.js';
import { stageCanvas, blob, mottle } from '../lib/fade.js';
import { PROMPTS } from '../lib/prompts.js';
import { sfx } from '../lib/sound.js';

const PALETTE = [
  { name: 'Silver', color: '#a7afb9' },
  { name: 'Gold', color: '#d9b45a' },
  { name: 'Rose gold', color: '#dc9f93' },
  { name: 'Emerald', color: '#5fae8c' },
  { name: 'Sapphire', color: '#6f93d6' },
];

const NO_OVERLAY = { apply() {}, restore() {} }; // drafts are drawn live, not stamped into a map
const PENCIL = '#3a3f4a';
const REVEAL_AT = 0.55;   // this much foil scratched off and the rest lets go
const DEAL = 0.7;         // seconds for a new card to sweep in

export const scratchCard = {
  id: 'scratch-card',
  name: 'Scratch card',
  mode: 'reveal',
  blurb: 'Scratch off the foil to find a prompt',
  surface: 'Scratch card with a prompt hidden under foil',
  clearLabel: 'New card',
  clearIcon: 'M5 7.5h10a2 2 0 0 1 2 2V19H7a2 2 0 0 1-2-2zM8 4.5h9a2 2 0 0 1 2 2V16M8.5 12h5M8.5 15h3',
  palette: PALETTE,
  create: () => new ScratchCard(),
};

// Mix a #rrggbb colour towards white (t > 0) or black (t < 0).
function tint(hex, t) {
  const n = parseInt(hex.slice(1), 16);
  const to = t > 0 ? 255 : 0, k = Math.abs(t);
  const ch = (v) => Math.round(v + (to - v) * k);
  return `rgb(${ch(n >> 16)},${ch((n >> 8) & 255)},${ch(n & 255)})`;
}

// A prompt for the next card, never the one that's showing.
function nextPrompt(not) {
  let p;
  do { p = PROMPTS[Math.floor(Math.random() * PROMPTS.length)]; } while (p === not);
  return p;
}

class ScratchCard {
  constructor() {
    this.ink = PALETTE[0].color;
    this.strokes = new Map();
    this.flakes = [];
    this.rand = mulberry32(19);
    this.prompt = nextPrompt();
    this.revealed = false;
    this.foilAlpha = 1;
    this.deal = null;       // { t, base, foil } while a new card sweeps in
    this.revealCaption = '…scratch it off to find a prompt'; // Show me's captions
    this.freshCaption = '…then deal a fresh card';
    this.calm = typeof matchMedia === 'function' && matchMedia('(prefers-reduced-motion: reduce)').matches;
  }

  get clearing() { return !!this.deal; }

  // ---------------------------------------------------------------- setup
  resize({ width, height, dpr }) {
    this.dropDraft();
    Object.assign(this, { W: width, H: height, dpr });
    // The foil panel: clear of the chips at the top and the toolbar at the bottom.
    const top = 64, bottom = Math.max(top + 120, height - 118);
    this.panel = { x: 16, y: top, w: width - 32, h: bottom - top };
    this.base = this.paintCard(this.prompt);
    this.foil = this.paintFoil();
    this.notes = this.layer();
    this.revealed = false;
    this.foilAlpha = 1;
    this.deal = null;
    this.strokes.clear();
  }

  layer() {
    const c = makeCanvas(this.W * this.dpr, this.H * this.dpr), g = c.getContext('2d');
    g.setTransform(this.dpr, 0, 0, this.dpr, 0, 0);
    g.lineCap = g.lineJoin = 'round';
    c.g = g;
    return c;
  }

  // The table and the card, with its prompt printed where the foil will cover it.
  paintCard(prompt) {
    const { W, H, dpr, panel: p } = this;
    const rand = mulberry32(3);
    const { c, g } = stageCanvas(W, H, dpr);
    const felt = g.createRadialGradient(W / 2, H * 0.45, 0, W / 2, H * 0.45, Math.hypot(W, H) * 0.62);
    felt.addColorStop(0, '#1f5a44');
    felt.addColorStop(1, '#0b2a20');
    g.fillStyle = felt; g.fillRect(0, 0, W, H);
    mottle(g, W, H, rand, { light: 14, dark: 22, scale: 3 });

    // The card: a little bigger than the foil, with a soft shadow.
    const m = 8, r = 16;
    g.save();
    g.shadowColor = 'rgba(0,0,0,0.5)'; g.shadowBlur = 22; g.shadowOffsetY = 8;
    g.fillStyle = '#f6efdf';
    g.beginPath(); g.roundRect(p.x - m, p.y - m, p.w + m * 2, p.h + m * 2, r); g.fill();
    g.restore();
    g.save();
    g.beginPath(); g.roundRect(p.x, p.y, p.w, p.h, 10); g.clip();
    g.fillStyle = '#fbf6ea'; g.fillRect(p.x, p.y, p.w, p.h);
    // A sunburst behind the prompt, like a prize.
    g.translate(p.x + p.w / 2, p.y + p.h / 2);
    g.fillStyle = 'rgba(240,190,90,0.14)';
    for (let k = 0; k < 14; k++) {
      g.rotate((Math.PI * 2) / 14);
      g.beginPath(); g.moveTo(0, 0); g.lineTo(-Math.max(p.w, p.h) * 0.11, -Math.max(p.w, p.h)); g.lineTo(Math.max(p.w, p.h) * 0.11, -Math.max(p.w, p.h)); g.fill();
    }
    g.restore();

    g.fillStyle = '#b0863a';
    g.font = `600 ${Math.min(12, W * 0.034)}px system-ui, sans-serif`;
    g.textAlign = 'center'; g.textBaseline = 'middle';
    g.letterSpacing = '2px';
    g.fillText('YOUR PROMPT', W / 2, p.y + 24);
    g.letterSpacing = '0px';

    g.fillStyle = g.strokeStyle = '#2d3340';
    const size = Math.min(W * 0.085, 34);
    const lh = 1.15;
    const lay = layoutText(g, prompt, {
      size, minSize: 15, maxWidth: p.w - 36, weight: 400, wrap: true,
      maxLines: Math.max(2, Math.floor((p.h - 76) / (size * lh))),
    });
    const block = (lay.lines.length - 1) * lay.lh;
    drawText(g, lay, { align: 'center', x: W / 2, y0: p.y + p.h / 2 + 8 - block / 2 }, Math.max(0.6, lay.size * 0.02));
    return c;
  }

  // A fresh panel of foil in the chosen colour: brushed metal with a faint pattern.
  paintFoil() {
    const { W, H, panel: p, ink } = this;
    const c = this.layer(), g = c.g;
    const rand = mulberry32(29);
    g.save();
    g.beginPath(); g.roundRect(p.x, p.y, p.w, p.h, 10); g.clip();
    const gr = g.createLinearGradient(p.x, p.y, p.x + p.w, p.y + p.h);
    gr.addColorStop(0, tint(ink, 0.3));
    gr.addColorStop(0.3, tint(ink, -0.05));
    gr.addColorStop(0.5, tint(ink, 0.42));
    gr.addColorStop(0.72, tint(ink, -0.12));
    gr.addColorStop(1, tint(ink, 0.2));
    g.fillStyle = gr; g.fillRect(p.x, p.y, p.w, p.h);
    // Brushed streaks.
    for (let k = 0; k < p.h * 0.9; k++) {
      const y = p.y + rand() * p.h;
      g.strokeStyle = rand() > 0.5 ? `rgba(255,255,255,${0.03 + rand() * 0.06})` : `rgba(0,0,0,${0.02 + rand() * 0.05})`;
      g.lineWidth = 0.5 + rand();
      g.beginPath(); g.moveTo(p.x, y); g.lineTo(p.x + p.w, y + (rand() - 0.5) * 3); g.stroke();
    }
    // A scatter of little embossed stars.
    g.fillStyle = tint(ink, -0.28);
    g.globalAlpha = 0.35;
    const step = 44;
    for (let y = p.y + 22, row = 0; y < p.y + p.h - 8; y += step * 0.62, row++) {
      for (let x = p.x + 20 + (row % 2) * step / 2; x < p.x + p.w - 8; x += step) star(g, x, y, 4.2);
    }
    g.globalAlpha = 0.55;
    g.font = `700 ${Math.min(13, W * 0.038)}px system-ui, sans-serif`;
    g.textAlign = 'center'; g.textBaseline = 'middle';
    g.letterSpacing = '3px';
    const label = 'SCRATCH HERE', lw = g.measureText(label).width + 26;
    g.globalAlpha = 1;
    g.fillStyle = tint(ink, 0.25);
    g.beginPath(); g.roundRect(W / 2 - lw / 2, p.y + p.h / 2 - 15, lw, 30, 15); g.fill();
    g.fillStyle = tint(ink, -0.5);
    g.fillText(label, W / 2 + 1.5, p.y + p.h / 2 + 1);
    g.letterSpacing = '0px';
    g.restore();
    return c;
  }

  setFadeSeconds() {}
  setPaused() {}

  // The ink picker chooses the foil: what's left of it changes colour, scratches and all.
  setInk(color) {
    if (color === this.ink) return;
    this.ink = color;
    if (!this.foil) return;
    const fresh = this.paintFoil(), g = this.foil.g;
    g.save();
    g.setTransform(1, 0, 0, 1, 0, 0);
    g.globalCompositeOperation = 'source-in';
    g.drawImage(fresh, 0, 0);
    g.restore();
  }

  // ---------------------------------------------------------------- strokes
  // A coin's edge on foil; the pencil afterwards is much finer.
  radiusFor(info) {
    const b = 9;
    return info.pointerType === 'pen' ? b * (0.5 + 0.9 * (info.pressure || 0.5))
         : info.pointerType === 'mouse' ? b * 0.85 : b;
  }

  inPanel(x, y) {
    const p = this.panel;
    return x > p.x && x < p.x + p.w && y > p.y && y < p.y + p.h;
  }

  mark(x0, y0, x1, y1, r) {
    if (this.revealed) {
      const g = this.notes.g;
      g.strokeStyle = PENCIL;
      g.globalAlpha = 0.85;
      g.lineWidth = Math.max(1.2, r * 0.36);
      g.beginPath(); g.moveTo(x0, y0); g.lineTo(x1 + 0.01, y1); g.stroke();
      return;
    }
    const g = this.foil.g;
    g.save();
    g.globalCompositeOperation = 'destination-out';
    g.lineWidth = r * 2;
    g.beginPath(); g.moveTo(x0, y0); g.lineTo(x1 + 0.01, y1); g.stroke();
    g.restore();
    if (!this.calm && this.inPanel(x1, y1)) this.shed(x1, y1, r);
  }

  shed(x, y, r) {
    if (this.flakes.length > 140) return;
    const rand = this.rand;
    const n = rand() < 0.6 ? 1 : 2;
    for (let k = 0; k < n; k++) {
      this.flakes.push({
        x: x + (rand() - 0.5) * r * 1.6, y: y + (rand() - 0.5) * r * 1.6,
        vx: (rand() - 0.5) * 70, vy: -20 - rand() * 50, s: 1.5 + rand() * 2.6,
        a: rand() * 6.3, va: (rand() - 0.5) * 14, t: 0, life: 0.6 + rand() * 0.6,
        col: tint(this.ink, rand() * 0.5 - 0.15),
      });
    }
  }

  strokeStart(id, x, y, info) {
    if (this.deal) return;
    const r = this.radiusFor(info, 0);
    this.strokes.set(id, { x, y, r, t: info.time });
    this.mark(x, y, x, y, r);
  }

  strokeMove(id, x, y, info) {
    const s = this.strokes.get(id);
    if (!s) return;
    const d = Math.hypot(x - s.x, y - s.y);
    if (d < 0.75) return;
    const speed = (d / Math.max(4, info.time - s.t)) * 1000;
    const r = s.r + (this.radiusFor(info, speed) - s.r) * 0.25;
    this.mark(s.x, s.y, x, y, r);
    Object.assign(s, { x, y, r, t: info.time });
  }

  strokeEnd(id) {
    if (!this.strokes.delete(id)) return;
    if (!this.revealed && !this.strokes.size && this.scratched() >= REVEAL_AT) this.revealAll();
  }

  // How much of the foil panel has been scratched away, 0..1 (read from a small copy).
  scratched() {
    const { panel: p, dpr } = this;
    const n = 40;
    const c = (this.probe ||= makeCanvas(n, n)), g = c.getContext('2d', { willReadFrequently: true });
    g.clearRect(0, 0, n, n);
    g.drawImage(this.foil, p.x * dpr, p.y * dpr, p.w * dpr, p.h * dpr, 0, 0, n, n);
    const px = g.getImageData(0, 0, n, n).data;
    let gone = 0;
    for (let i = 3; i < px.length; i += 4) if (px[i] < 110) gone++;
    return gone / (n * n);
  }

  // The rest of the foil lets go and the prompt is out in the open.
  revealAll() {
    if (this.revealed || this.deal) return;
    this.commitDraft(); // words being typed land on the foil first, and go with it
    this.revealed = true;
    this.strokes.clear();
    sfx.cue('twinkle');
    if (this.calm) return;
    // A last shower of flakes from wherever foil was left.
    const p = this.panel, rand = this.rand;
    for (let k = 0; k < 60; k++) this.shed(p.x + rand() * p.w, p.y + rand() * p.h, 6);
  }

  // ---------------------------------------------------------------- new card
  clear() {
    if (this.deal) return;
    this.commitDraft();
    this.strokes.clear();
    this.prompt = nextPrompt(this.prompt);
    this.deal = { t: 0, base: this.paintCard(this.prompt), foil: this.paintFoil() };
    sfx.cue('fold');
  }

  finishDeal() {
    this.base = this.deal.base;
    this.foil = this.deal.foil;
    this.notes = this.layer();
    this.deal = null;
    this.revealed = false;
    this.foilAlpha = 1;
  }

  // ---------------------------------------------------------------- time
  update(dt) {
    let alive = false;
    if (this.revealed && this.foilAlpha > 0) {
      this.foilAlpha = Math.max(0, this.foilAlpha - dt / (this.calm ? 0.4 : 0.8));
      alive = true;
    }
    if (this.deal) {
      this.deal.t += dt;
      if (this.deal.t >= DEAL) this.finishDeal();
      alive = true;
    }
    if (this.flakes.length) {
      for (const f of this.flakes) {
        f.t += dt;
        f.vy += 520 * dt;
        f.x += f.vx * dt;
        f.y += f.vy * dt;
        f.a += f.va * dt;
      }
      this.flakes = this.flakes.filter((f) => f.t < f.life);
      alive = true;
    }
    if (this.hasDrafts()) alive = true;
    return alive;
  }

  // ---------------------------------------------------------------- draw
  render(ctx) {
    const { W, H, dpr } = this;
    ctx.setTransform(1, 0, 0, 1, 0, 0);
    ctx.drawImage(this.base, 0, 0);
    ctx.drawImage(this.notes, 0, 0);
    if (this.foilAlpha > 0) {
      ctx.globalAlpha = this.foilAlpha;
      ctx.drawImage(this.foil, 0, 0);
      ctx.globalAlpha = 1;
    }
    ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
    for (const d of this.held || []) this.drawBlock(ctx, d);
    if (this.draft) this.drawBlock(ctx, this.draft);

    if (this.deal) {
      // The new card sweeps across from the left with a glint on its leading edge.
      const u = smoothstep(0, 1, this.deal.t / DEAL), edge = W * u;
      ctx.save();
      ctx.beginPath(); ctx.rect(0, 0, edge, H); ctx.clip();
      ctx.setTransform(1, 0, 0, 1, 0, 0);
      ctx.drawImage(this.deal.base, 0, 0);
      ctx.drawImage(this.deal.foil, 0, 0);
      ctx.restore();
      const gl = ctx.createLinearGradient(edge - 46, 0, edge, 0);
      gl.addColorStop(0, 'rgba(255,255,255,0)');
      gl.addColorStop(1, 'rgba(255,255,255,0.5)');
      ctx.fillStyle = gl;
      ctx.fillRect(edge - 46, 0, 46, H);
    }

    for (const f of this.flakes) {
      ctx.save();
      ctx.globalAlpha = clamp(1.4 - (f.t / f.life) * 1.4, 0, 1);
      ctx.translate(f.x, f.y);
      ctx.rotate(f.a);
      ctx.fillStyle = f.col;
      ctx.fillRect(-f.s / 2, -f.s / 2, f.s, f.s * 0.7);
      ctx.restore();
    }
    ctx.setTransform(1, 0, 0, 1, 0, 0);
  }

  // ---------------------------------------------------------------- text
  intro(text, opts = {}) { this.onCommit([this.stampText(text, opts)]); }

  stampText(text, opts) {
    const { lay, place } = layoutFor(this.foil.g, text, opts, {
      W: this.W, H: this.H, size: Math.min(this.W * 0.15, 76), weight: 600,
    });
    return { overlay: NO_OVERLAY, lay, place };
  }

  // Words are written on the foil in marker (and go with it when it's scratched away), or
  // pencilled on the bare card once it's revealed.
  drawBlock(g, { lay, place }) {
    g.save();
    g.fillStyle = g.strokeStyle = this.revealed ? PENCIL : tint(this.ink, -0.68);
    g.font = `600 ${lay.size}px ${HAND}`;
    drawText(g, lay, place, Math.max(1.4, lay.size * 0.06));
    g.restore();
  }

  onCommit(blocks) {
    for (const b of blocks) {
      if (this.revealed) { this.drawBlock(this.notes.g, b); continue; }
      const g = this.foil.g;
      g.save();
      g.globalCompositeOperation = 'source-atop'; // only where there's still foil to write on
      this.drawBlock(g, b);
      g.restore();
    }
  }

  dispose() {}
}

Object.assign(ScratchCard.prototype, draftMethods);

function star(g, x, y, r) {
  g.beginPath();
  for (let k = 0; k < 8; k++) {
    const a = (k / 8) * Math.PI * 2 - Math.PI / 2, d = k % 2 ? r * 0.42 : r;
    g.lineTo(x + Math.cos(a) * d, y + Math.sin(a) * d);
  }
  g.closePath(); g.fill();
}
