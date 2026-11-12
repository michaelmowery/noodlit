// Flush: a Stir environment.
//   Look:  a clean white toilet seen from above, on a tiled floor: the cistern at the top with
//          its chrome handle, the bowl full of clear water. Your finger leaves a line of ink
//          floating in the bowl.
//   Stir:  the water is slowly turning. It catches every line, winds it round and draws it
//          in, thinning as it goes, until it's gone down the middle. The Swish brush adds
//          nothing: it pushes what's floating there.
//   Clear: "Flush" (or a tap on the handle) sends everything round and down at once.

import { mulberry32 } from '../lib/util.js';
import { stageCanvas } from '../lib/fade.js';
import { StirScene } from '../lib/stir.js';
import { sfx } from '../lib/sound.js';

const PALETTE = [
  { name: 'Blue ink', color: '#2a62d8' },
  { name: 'Teal', color: '#0f9c94' },
  { name: 'Crimson', color: '#d0344a' },
  { name: 'Violet', color: '#7b3fa8' },
  { name: 'Orange', color: '#ee7d1f' },
  { name: 'Charcoal', color: '#2a2f3a' },
];

const PRESS = 0.55; // seconds the handle takes to go down and come back
const RUSH = 1.8;   // seconds an empty bowl's flush runs

export const flush = {
  id: 'flush',
  name: 'Flush',
  mode: 'stir',
  blurb: 'Your lines swirl round the bowl and are flushed away',
  surface: 'Toilet bowl that swirls your lines down and away',
  clearLabel: 'Flush',
  clearIcon: 'M12 12a1.6 1.6 0 1 1 1.6 1.6A4.4 4.4 0 1 1 16.4 9 7.4 7.4 0 1 0 19.4 15',
  palette: PALETTE,
  create: () => new Flush(),
};

// Where things sit for a screen W x H. The bowl is centred on the swirl (lib/stir.js).
function plan(W, H) {
  const cx = W / 2, cy = H * 0.46;
  const ry = H * 0.36, rx = Math.min(W * 0.46, ry * 0.8);
  const rim = Math.max(11, Math.min(W, H) * 0.036);
  const tank = cy - ry + ry * 0.2;                 // the cistern runs down behind the back of the bowl
  const pivot = { x: 32, y: Math.max(78, tank - 42) };
  return { cx, cy, rx, ry, rim, tank, pivot, arm: Math.min(46, W * 0.13) };
}

class Flush extends StirScene {
  constructor() {
    super({ ink: PALETTE[0].color, brush: 4.2, turns: 1.5, sink: 1.15, spread: -0.55, edge: 0.2, body: 0.92, cue: 'flush' });
    this.pressedAt = -1e9;
    this.emptyAt = -1e9;  // when an empty bowl was last flushed
    this.spin = 0;
  }

  resize(size) {
    super.resize(size);
    this.plan = plan(this.W, this.H);
  }

  paintBase() { return paintToilet(this.W, this.H, this.dpr, plan(this.W, this.H)); }

  // A tap on the handle flushes instead of drawing.
  strokeStart(id, x, y, info) {
    const { pivot, arm } = this.plan;
    if (Math.hypot(x - (pivot.x + arm * 0.5), y - pivot.y) < 30) { this.clear(); return; }
    super.strokeStart(id, x, y, info);
  }

  // For Show me: where to press, and a way to empty the bowl without the flush (the demo
  // saves that for the end).
  handleAt() { const { pivot, arm } = this.plan; return { x: pivot.x + arm * 0.55, y: pivot.y }; }
  blank() {
    this.dropDraft();
    this.strokes.clear();
    this.lines = [];
    this.whirl = 0;
  }

  clear() {
    const had = this.lines.length > 0 && this.whirl <= 0;
    if (performance.now() - this.pressedAt > PRESS * 1000) this.pressedAt = performance.now();
    super.clear();
    if (!had && this.whirl <= 0 && performance.now() - this.emptyAt > RUSH * 1000) { // an empty bowl still flushes
      this.emptyAt = performance.now();
      sfx.cue('flush');
    }
  }

  // Keeps the screen moving while the handle comes back up over an empty bowl.
  settling() { return performance.now() - Math.max(this.pressedAt, this.emptyAt) < RUSH * 1000; }

  // The rush of water round the bowl while it flushes.
  drawUnder(ctx) {
    if (this.calm) return;
    const u = this.whirl > 0 ? 1 - this.whirl / 2.2 : (performance.now() - this.emptyAt) / (RUSH * 1000);
    if (u >= 1) return;
    const { cx, cy, rx, ry, rim } = this.plan;
    const a = Math.sin(Math.PI * Math.min(1, u)) * 0.5;
    this.spin = u * 9;
    ctx.save();
    ctx.beginPath(); ctx.ellipse(cx, cy, rx - rim, ry - rim, 0, 0, Math.PI * 2); ctx.clip();
    ctx.lineCap = 'round';
    for (let k = 0; k < 11; k++) {
      const a0 = this.spin * (1 + (k % 3) * 0.25) + k * 0.571, r0 = (0.25 + ((k * 0.37) % 0.75));
      ctx.strokeStyle = `rgba(255,255,255,${a * (0.5 + (k % 4) * 0.15)})`;
      ctx.lineWidth = 2 + (k % 3) * 2.5;
      ctx.beginPath();
      for (let t = 0; t <= 1.001; t += 0.1) {
        const ang = a0 + t * 1.5, r = r0 * (1 - 0.45 * t);
        ctx.lineTo(cx + Math.cos(ang) * r * (rx - rim), cy + Math.sin(ang) * r * (ry - rim));
      }
      ctx.stroke();
    }
    ctx.restore();
  }

  // The chrome handle on the cistern: it dips when you flush.
  drawOver(ctx) {
    const { pivot, arm } = this.plan;
    const u = Math.min(1, (performance.now() - this.pressedAt) / (PRESS * 1000));
    const dip = this.calm ? 0 : Math.sin(Math.PI * u) * 0.55;
    ctx.save();
    ctx.translate(pivot.x, pivot.y);
    ctx.fillStyle = 'rgba(40,60,80,0.22)'; // shadow on the porcelain
    ctx.beginPath(); ctx.ellipse(arm * 0.45, 5, arm * 0.62, 7, 0.08 + dip, 0, Math.PI * 2); ctx.fill();
    ctx.rotate(0.06 + dip);
    const g = ctx.createLinearGradient(0, -5, 0, 5);
    g.addColorStop(0, '#f4f7fa'); g.addColorStop(0.45, '#b9c3cc'); g.addColorStop(1, '#7f8b96');
    ctx.fillStyle = g;
    ctx.beginPath(); ctx.roundRect(-2, -4.5, arm, 9, 4.5); ctx.fill();
    ctx.beginPath(); ctx.arc(arm - 2, 0, 6.5, 0, Math.PI * 2); ctx.fill();
    const k = ctx.createRadialGradient(-3, -3, 1, 0, 0, 11);
    k.addColorStop(0, '#ffffff'); k.addColorStop(0.5, '#c3ccd4'); k.addColorStop(1, '#77838e');
    ctx.fillStyle = k;
    ctx.beginPath(); ctx.arc(0, 0, 10.5, 0, Math.PI * 2); ctx.fill();
    ctx.restore();
  }
}

// Floor tiles, the cistern, and a white bowl of clear water with its outlet in the middle.
function paintToilet(W, H, dpr, p) {
  const rand = mulberry32(53);
  const { c, g } = stageCanvas(W, H, dpr);
  const { cx, cy, rx, ry, rim, tank } = p;

  // Tiles.
  g.fillStyle = '#cfdbe2'; g.fillRect(0, 0, W, H);
  const t = Math.max(40, Math.min(W, H) / 7);
  for (let y = 0; y < H; y += t) {
    for (let x = 0; x < W; x += t) {
      const v = 226 + rand() * 14;
      g.fillStyle = `rgb(${v - 12},${v - 3},${v + 3})`;
      g.fillRect(x + 1, y + 1, t - 2, t - 2);
    }
  }

  // The cistern lid across the top.
  g.save();
  g.shadowColor = 'rgba(40,60,80,0.35)'; g.shadowBlur = 18; g.shadowOffsetY = 6;
  const lid = g.createLinearGradient(0, 0, 0, tank);
  lid.addColorStop(0, '#ffffff'); lid.addColorStop(1, '#eaf0f4');
  g.fillStyle = lid;
  g.beginPath(); g.roundRect(8, -20, W - 16, tank + 20, 18); g.fill();
  g.restore();
  g.strokeStyle = 'rgba(120,140,160,0.25)'; g.lineWidth = 1.2;
  g.beginPath(); g.roundRect(16, -20, W - 32, tank + 12, 13); g.stroke();

  // The bowl: its shadow, the white rim, the slope down to the water.
  g.save();
  g.shadowColor = 'rgba(40,60,80,0.4)'; g.shadowBlur = 24; g.shadowOffsetY = 8;
  g.fillStyle = '#fbfdfe';
  g.beginPath(); g.ellipse(cx, cy, rx, ry, 0, 0, Math.PI * 2); g.fill();
  g.restore();
  const seat = g.createLinearGradient(0, cy - ry, 0, cy + ry);
  seat.addColorStop(0, '#ffffff'); seat.addColorStop(1, '#e6edf2');
  g.fillStyle = seat;
  g.beginPath(); g.ellipse(cx, cy, rx, ry, 0, 0, Math.PI * 2); g.fill();

  const ix = rx - rim, iy = ry - rim;
  g.save();
  g.beginPath(); g.ellipse(cx, cy, ix, iy, 0, 0, Math.PI * 2); g.clip();
  g.translate(cx, cy); g.scale(1, iy / ix);
  const water = g.createRadialGradient(0, 0, 0, 0, 0, ix);
  water.addColorStop(0, '#9fd3e6');
  water.addColorStop(0.22, '#c4e6f1');
  water.addColorStop(0.7, '#e3f3f8');
  water.addColorStop(0.93, '#f3f9fb');
  water.addColorStop(1, '#c9d6dd');   // the shaded lip under the rim
  g.fillStyle = water; g.fillRect(-ix, -ix, ix * 2, ix * 2);
  // Light on the water.
  g.lineCap = 'round';
  for (let k = 0; k < 16; k++) {
    const r = ix * (0.2 + rand() * 0.7), a0 = rand() * Math.PI * 2, sweep = 0.4 + rand() * 1.1;
    g.strokeStyle = `rgba(255,255,255,${0.25 + rand() * 0.35})`;
    g.lineWidth = 2 + rand() * 6;
    g.beginPath(); g.arc(0, 0, r, a0, a0 + sweep); g.stroke();
  }
  g.restore();

  // The outlet.
  const e = Math.min(W, H) * 0.075;
  const hole = g.createRadialGradient(cx, cy, 0, cx, cy, e * 1.5);
  hole.addColorStop(0, 'rgba(38,70,92,0.95)');
  hole.addColorStop(0.55, 'rgba(60,110,138,0.7)');
  hole.addColorStop(1, 'rgba(120,180,205,0)');
  g.fillStyle = hole; g.beginPath(); g.ellipse(cx, cy, e * 1.5, e * 1.75, 0, 0, Math.PI * 2); g.fill();

  // A highlight along the rim.
  g.strokeStyle = 'rgba(255,255,255,0.9)'; g.lineWidth = 2;
  g.beginPath(); g.ellipse(cx, cy, rx - rim * 0.45, ry - rim * 0.45, 0, Math.PI * 1.1, Math.PI * 1.7); g.stroke();
  g.strokeStyle = 'rgba(110,135,155,0.3)'; g.lineWidth = 1;
  g.beginPath(); g.ellipse(cx, cy, ix, iy, 0, 0, Math.PI * 2); g.stroke();
  return c;
}
