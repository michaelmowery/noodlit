// Chalk sidewalk: a Fade environment.
//   Look:  bright, grainy sidewalk chalk on concrete slabs, in the colour you pick.
//   Decay: a light rain: drops spot the pavement dark and the chalk slowly washes out,
//          speckled where the drops land.
//   Clear: a downpour sweeps down the sidewalk and washes everything away.

import { clamp, easeInOut, mulberry32, makeCanvas } from '../lib/util.js';
import { MapFade, stageCanvas, mottle, speckle, grainTile } from '../lib/fade.js';
import { sfx } from '../lib/sound.js';

const PALETTE = [
  { name: 'Pink', color: '#ff8fb8' },
  { name: 'Sky', color: '#7cc8ff' },
  { name: 'Sunshine', color: '#ffe066' },
  { name: 'Mint', color: '#86e3b0' },
  { name: 'Lilac', color: '#c7a6ff' },
  { name: 'White', color: '#f6f4ee' },
];

export const chalk = {
  id: 'chalk',
  name: 'Chalk sidewalk',
  blurb: 'Rain washes the chalk away',
  surface: 'Concrete sidewalk to draw on with chalk',
  clearLabel: 'Downpour',
  clearIcon: 'M7 15a4 4 0 0 1 .5-8A5 5 0 0 1 17 8a3.5 3.5 0 0 1 0 7M8 18l-1 3M12 18l-1 3M16 18l-1 3',
  palette: PALETTE,
  create: () => new Chalk(),
};

class Chalk extends MapFade {
  constructor() {
    super({ paint: true, brush: 9, seed: 23, ink: PALETTE[0].color, textWeight: 400 });
    this.textLine = 0.035;
    this.drops = [];
    this.spots = [];
    this.dropClock = 0;
  }

  paintBase() { return paintSidewalk(this.W, this.H, this.dpr); }

  setup() {
    const g = makeCanvas(1, 1).getContext('2d');
    this.grain = g.createPattern(grainTile(1.05, 11), 'repeat');
  }

  // Chalk is dry and dusty: a rough, slightly wobbly line with a dusty fringe.
  paintSeg(g, x0, y0, r0, x1, y1, r1) {
    g.strokeStyle = this.ink;
    g.lineWidth = (r0 + r1) * 0.9;
    g.beginPath(); g.moveTo(x0, y0); g.lineTo(x1 + 0.01, y1); g.stroke();
    g.fillStyle = this.ink;
    const n = 3;
    for (let i = 0; i < n; i++) {
      const t = Math.random(), a = Math.random() * Math.PI * 2, d = r1 * (0.8 + Math.random() * 0.5);
      g.globalAlpha = 0.5;
      g.beginPath(); g.arc(x0 + (x1 - x0) * t + Math.cos(a) * d, y0 + (y1 - y0) * t + Math.sin(a) * d, 0.8 + Math.random(), 0, Math.PI * 2); g.fill();
    }
    g.globalAlpha = 1;
  }

  finishWork(g) {
    g.globalCompositeOperation = 'destination-out';
    g.fillStyle = this.grain;
    g.fillRect(0, 0, this.work.width, this.work.height);
    g.globalCompositeOperation = 'source-over';
  }

  updateFx(dt) {
    // Rain falls while there's chalk to wash; heavier when the fade is quick.
    if (this.alive && !this.paused) {
      this.dropClock += dt * (this.W * this.H) / 9000 * (20 / this.fadeSeconds);
      while (this.dropClock > 1) {
        this.dropClock -= 1;
        const x = Math.random() * this.W, y = Math.random() * this.H;
        this.drops.push({ x, y, t: 0 });
        this.scaleDisc(x, y, 5 + Math.random() * 4, 0.55);
      }
    }
    for (const d of this.drops) d.t += dt;
    this.drops = this.drops.filter((d) => d.t < 0.45);
    for (const s of this.spots) s.t += dt;
    for (const d of this.drops) if (d.t >= 0.12 && !d.spot) { d.spot = true; this.spots.push({ x: d.x, y: d.y, r: 3 + Math.random() * 5, t: 0 }); }
    this.spots = this.spots.filter((s) => s.t < 5);
    if (this.spots.length > 400) this.spots.splice(0, this.spots.length - 400);
    return this.drops.length > 0 || this.spots.length > 0;
  }

  clear() {
    sfx.cue('downpour');
    this.strokes.clear();
    this.clearing = { t: 0, dur: 1.9 };
  }

  clearStep(cl) {
    const p = Math.min(1, cl.t / cl.dur);
    const soft = 180;
    cl.front = -soft + (this.H + soft * 2) * easeInOut(p);
    const f = cl.front;
    this.scaleCells((x, y) => clamp((y - f + soft * 0.3) / soft, 0, 1));
    if (p >= 1) { this.map.fill(0); return false; }
    return true;
  }

  drawFx(ctx) {
    // Wet spots darken the concrete for a few seconds.
    for (const s of this.spots) {
      ctx.fillStyle = `rgba(30,32,38,${0.16 * (1 - s.t / 5)})`;
      ctx.beginPath(); ctx.arc(s.x, s.y, s.r, 0, Math.PI * 2); ctx.fill();
    }
    ctx.strokeStyle = 'rgba(220,230,240,0.55)';
    ctx.lineWidth = 1;
    for (const d of this.drops) {
      if (d.t < 0.12) {
        const k = 1 - d.t / 0.12;
        ctx.beginPath(); ctx.moveTo(d.x - 6 * k, d.y - 40 * k); ctx.lineTo(d.x - 4 * k, d.y - 28 * k); ctx.stroke();
      } else {
        const k = (d.t - 0.12) / 0.33;
        ctx.globalAlpha = 1 - k;
        ctx.beginPath(); ctx.ellipse(d.x, d.y, 2 + k * 9, 1 + k * 5, 0, 0, Math.PI * 2); ctx.stroke();
        ctx.globalAlpha = 1;
      }
    }
    const cl = this.clearing;
    if (cl) {
      const f = cl.front, { W, H } = this;
      // The wet sheet behind the front, and heavy rain over everything.
      const wet = ctx.createLinearGradient(0, f - 260, 0, f + 40);
      wet.addColorStop(0, 'rgba(30,40,55,0.0)');
      wet.addColorStop(0.8, 'rgba(30,40,55,0.28)');
      wet.addColorStop(1, 'rgba(200,215,230,0.35)');
      ctx.fillStyle = wet; ctx.fillRect(0, Math.max(0, f - 260), W, Math.min(H, 300));
      ctx.strokeStyle = 'rgba(210,225,240,0.45)';
      ctx.lineWidth = 1.2;
      const k = Math.sin(Math.min(1, cl.t / cl.dur) * Math.PI);
      for (let i = 0; i < 160 * k; i++) {
        const x = Math.random() * W, y = Math.random() * H;
        ctx.beginPath(); ctx.moveTo(x, y); ctx.lineTo(x - 5, y + 26); ctx.stroke();
      }
    }
  }
}

// Concrete slabs seen from above: speckled aggregate, expansion joints, a crack or two,
// and a strip of grass along one side.
function paintSidewalk(W, H, dpr) {
  const rand = mulberry32(77);
  const { c, g } = stageCanvas(W, H, dpr);
  g.fillStyle = '#8e8f93';
  g.fillRect(0, 0, W, H);
  mottle(g, W, H, rand, { light: 40, dark: 45, scale: 6 });
  speckle(g, W, H, rand, (W * H) / 25, 'rgba(60,60,64,0.35)', 1.1);
  speckle(g, W, H, rand, (W * H) / 45, 'rgba(210,210,214,0.35)', 0.9);
  const grass = Math.min(46, W * 0.08);
  // Joints.
  const slab = clamp(W * 0.55, 220, 420);
  g.strokeStyle = 'rgba(40,40,44,0.55)';
  g.lineWidth = 3;
  for (let y = slab * 0.6; y < H; y += slab) { g.beginPath(); g.moveTo(grass, y); g.lineTo(W, y); g.stroke(); }
  g.strokeStyle = 'rgba(230,230,234,0.25)';
  g.lineWidth = 1;
  for (let y = slab * 0.6; y < H; y += slab) { g.beginPath(); g.moveTo(grass, y + 2.5); g.lineTo(W, y + 2.5); g.stroke(); }
  // A hairline crack.
  g.strokeStyle = 'rgba(40,40,44,0.45)';
  g.lineWidth = 1;
  let x = W * 0.7, y = H * 0.3;
  g.beginPath(); g.moveTo(x, y);
  for (let i = 0; i < 18; i++) { x += (rand() - 0.6) * 14; y += 8 + rand() * 8; g.lineTo(x, y); }
  g.stroke();
  // Grass verge and kerb on the left.
  g.fillStyle = '#5f8f3e';
  g.fillRect(0, 0, grass, H);
  g.strokeStyle = '#7fb04f'; g.lineWidth = 1.5;
  for (let i = 0; i < H / 2.5; i++) {
    const gy = rand() * H, gx = rand() * grass;
    g.beginPath(); g.moveTo(gx, gy); g.lineTo(gx + (rand() - 0.3) * 6, gy - 5 - rand() * 6); g.stroke();
  }
  g.fillStyle = '#a6a7aa';
  g.fillRect(grass, 0, 5, H);
  // Sunlight.
  const sun = g.createLinearGradient(0, 0, W, H);
  sun.addColorStop(0, 'rgba(255,240,210,0.12)');
  sun.addColorStop(1, 'rgba(0,0,20,0.12)');
  g.fillStyle = sun; g.fillRect(0, 0, W, H);
  return c;
}
