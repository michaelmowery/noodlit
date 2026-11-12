// Tea leaves: a Stir environment.
//   Look:  a cup of loose-leaf tea from above. Your lines are drawn in tea leaves.
//   Stir:  the tea turns slowly. The leaves are carried round and drift down to the bottom of
//          the cup, where they settle and stay as dregs.
//   Clear: "Swirl the cup" gives it a proper swirl: everything left settles at once into a
//          pattern, and a quiet question floats up: what do you see? Swirl an empty-looking
//          cup again to pour it out and start a fresh one.

import { mulberry32, makeCanvas, smoothstep } from '../lib/util.js';
import { stageCanvas, blob } from '../lib/fade.js';
import { StirScene } from '../lib/stir.js';
import { sfx } from '../lib/sound.js';

// color: the leaves. tea: the liquor around them.
const PALETTE = [
  { name: 'Black tea', color: '#2b1a10', tea: ['#c2702a', '#7a3c12'] },
  { name: 'Green tea', color: '#3d4a1c', tea: ['#d7c76a', '#9a8f34'] },
  { name: 'Rooibos', color: '#6e2a14', tea: ['#d2552c', '#8a2a12'] },
  { name: 'Chamomile', color: '#7a6a2a', tea: ['#f2d77a', '#c9a640'] },
];

const ASK = 4.5;      // seconds the question stays
const POUR = 0.9;     // seconds to pour the dregs out

export const teaLeaves = {
  id: 'tea-leaves',
  name: 'Tea leaves',
  mode: 'stir',
  blurb: 'Swirl the cup and see what the leaves say',
  surface: 'Cup of loose-leaf tea to draw in',
  clearLabel: 'Swirl the cup',
  clearIcon: 'M5 9h11v4a5.5 5.5 0 0 1-11 0zM16 10h1.5a2.5 2.5 0 0 1 0 5H16M8 4.5c0 1 1 1 1 2M11 4.5c0 1 1 1 1 2',
  palette: PALETTE,
  create: () => new TeaLeaves(),
};

const hash = (i) => { const x = Math.sin(i * 127.1) * 43758.5453; return x - Math.floor(x); };

class TeaLeaves extends StirScene {
  constructor() {
    super({ ink: PALETTE[0].color, brush: 4, body: 1, edge: 0, spread: 0, turns: 0.7, sink: 0.35, cue: 'pour' });
    this.ask = 0;       // seconds left on the question
    this.pouring = 0;   // seconds left pouring the dregs out
    this.had = false;   // dregs in the cup
  }

  leaf() { return PALETTE.find((p) => p.color === this.ink) || PALETTE[0]; }

  resize(size) {
    super.resize(size);
    // A cup, not the whole screen: the swirl is centred on it.
    const { W, H } = this;
    this.cup = Math.min(W * 0.46, H * 0.36);
    this.R = this.cup;
    this.newDregs();
  }

  newDregs() {
    this.dregs = makeCanvas(this.W * this.dpr, this.H * this.dpr);
    const g = this.dregs.getContext('2d');
    g.setTransform(this.dpr, 0, 0, this.dpr, 0, 0);
    this.had = false;
  }

  paintBase() { return paintCup(this.W, this.H, this.dpr, this.cup || Math.min(this.W * 0.46, this.H * 0.36), this.leaf().tea); }

  setInk(color) {
    super.setInk(color);
    if (this.W) this.base = this.paintBase();
  }

  // A leaf that has finished drifting settles on the bottom.
  onExpire(ln) {
    const g = this.dregs.getContext('2d');
    g.globalAlpha = 0.75;
    this.flecks(g, ln);
    g.globalAlpha = 1;
    this.had = true;
  }

  // Lines are drawn as flecks of leaf, each its own size and angle.
  flecks(g, ln) {
    const p = ln.pts;
    g.fillStyle = ln.ink;
    for (let i = 0; i < p.length; i += 4) {
      const h = hash(i + p.length * 0.001), s = ln.r * (0.45 + h * 0.9), ang = h * 9;
      g.beginPath();
      g.ellipse(p[i] + (hash(i + 3) - 0.5) * ln.r, p[i + 1] + (hash(i + 7) - 0.5) * ln.r, s, s * 0.45, ang, 0, Math.PI * 2);
      g.fill();
    }
  }

  drawLines(ctx) {
    for (const ln of this.lines) {
      ctx.globalAlpha = 0.95;
      this.flecks(ctx, ln);
    }
    ctx.globalAlpha = 1;
  }

  drawUnder(ctx) {
    let a = 1;
    if (this.pouring > 0) a = this.pouring / POUR;
    ctx.globalAlpha = a;
    ctx.drawImage(this.dregs, 0, 0, this.W, this.H);
    ctx.globalAlpha = 1;
  }

  // ---------------------------------------------------------------- swirl and pour
  get clearing() { return this.whirl > 0 || this.pouring > 0; }

  clear() {
    if (!this.lines.length && this.had && !this.pouring) {
      this.commitDraft();
      this.ask = 0;
      this.pouring = POUR;
      sfx.cue('pour');
      return;
    }
    super.clear();
  }

  whirled() {
    if (!this.had) return;
    this.ask = ASK;
    sfx.cue('twinkle');
  }

  settling(dt) {
    let alive = false;
    if (this.pouring > 0) {
      this.pouring = Math.max(0, this.pouring - dt);
      if (this.pouring === 0) this.newDregs();
      alive = true;
    }
    if (this.ask > 0) { this.ask = Math.max(0, this.ask - dt); alive = true; }
    return alive;
  }

  update(dt) {
    const alive = super.update(dt);
    // (settling only runs once the cup is empty of fresh leaves; the question can outlive that.)
    if (this.lines.length && this.ask > 0) { this.ask = Math.max(0, this.ask - dt); return true; }
    return alive;
  }

  drawOver(ctx) {
    if (this.ask <= 0) return;
    const t = ASK - this.ask;
    const a = smoothstep(0, 0.8, t) * (1 - smoothstep(ASK - 1, ASK, t));
    const { W, cy, cup } = this;
    ctx.save();
    ctx.globalAlpha = a;
    ctx.fillStyle = 'rgba(255,248,235,0.92)';
    ctx.font = `500 ${Math.min(22, W * 0.055)}px "Bradley Hand", "Segoe Print", ui-rounded, system-ui, sans-serif`;
    ctx.textAlign = 'center'; ctx.textBaseline = 'middle';
    ctx.shadowColor = 'rgba(0,0,0,0.5)'; ctx.shadowBlur = 8;
    ctx.fillText('What do you see?', W / 2, cy + cup + 46);
    ctx.restore();
  }
}

// A white china cup on a saucer, on a wooden table, full of tea.
function paintCup(W, H, dpr, R, [light, dark]) {
  const rand = mulberry32(31);
  const { c, g } = stageCanvas(W, H, dpr);
  const cx = W / 2, cy = H * 0.46;
  // Table.
  g.fillStyle = '#5a3d29'; g.fillRect(0, 0, W, H);
  for (let y = 0; y < H; y += 3) {
    g.fillStyle = `rgba(${rand() > 0.5 ? '255,220,180' : '30,15,5'},${0.03 + rand() * 0.04})`;
    g.fillRect(0, y, W, 1 + rand() * 2);
  }
  // Saucer, then the cup's rim and inside.
  g.save();
  g.shadowColor = 'rgba(0,0,0,0.45)'; g.shadowBlur = 30; g.shadowOffsetY = 10;
  g.fillStyle = '#f4f1ec';
  g.beginPath(); g.arc(cx, cy, R * 1.5, 0, Math.PI * 2); g.fill();
  g.restore();
  g.strokeStyle = 'rgba(160,150,140,0.35)'; g.lineWidth = 2;
  g.beginPath(); g.arc(cx, cy, R * 1.35, 0, Math.PI * 2); g.stroke();
  // Handle.
  g.fillStyle = '#efebe5';
  g.beginPath(); g.ellipse(cx + R * 1.18, cy + R * 0.2, R * 0.32, R * 0.18, 0.4, 0, Math.PI * 2); g.fill();
  g.save();
  g.shadowColor = 'rgba(0,0,0,0.3)'; g.shadowBlur = 12; g.shadowOffsetY = 4;
  g.fillStyle = '#fbfaf7';
  g.beginPath(); g.arc(cx, cy, R * 1.12, 0, Math.PI * 2); g.fill();
  g.restore();
  // The tea.
  const tea = g.createRadialGradient(cx - R * 0.2, cy - R * 0.2, R * 0.1, cx, cy, R);
  tea.addColorStop(0, light);
  tea.addColorStop(1, dark);
  g.fillStyle = tea;
  g.beginPath(); g.arc(cx, cy, R, 0, Math.PI * 2); g.fill();
  g.strokeStyle = 'rgba(255,255,255,0.35)'; g.lineWidth = 1.5;
  g.beginPath(); g.arc(cx, cy, R - 1, Math.PI * 1.05, Math.PI * 1.6); g.stroke();
  blob(g, cx - R * 0.35, cy - R * 0.4, R * 0.5, R * 0.25, 'rgba(255,255,255,0.18)');
  return c;
}
