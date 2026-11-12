// Ink in water: a Fade environment.
//   Look:  you draw with ink just under the surface of a wide glass bowl of still water.
//          The line goes down crisp, then starts to bloom.
//   Decay: each line blooms into soft clouds that curl, spread and thin out until the water
//          is clear again.
//   Clear: a fresh pour: the water swirls, the ink spins out and is gone.

import { clamp, mulberry32, makeCanvas, drawText } from '../lib/util.js';
import { MapFade, stageCanvas, blob } from '../lib/fade.js';
import { sfx } from '../lib/sound.js';

const PALETTE = [
  { name: 'Indigo', color: '#27306e' },
  { name: 'Black', color: '#1a1a1f' },
  { name: 'Crimson', color: '#9c1f33' },
  { name: 'Teal', color: '#0f6a6a' },
  { name: 'Violet', color: '#5b2a86' },
  { name: 'Sepia', color: '#6b4223' },
];

export const ink = {
  id: 'ink',
  name: 'Ink in water',
  blurb: 'Lines bloom like ink drops, then clear',
  surface: 'Bowl of clear water to draw ink into',
  clearLabel: 'Fresh water',
  clearIcon: 'M12 3c3 4 6 7 6 11a6 6 0 0 1-12 0c0-4 3-7 6-11zM9 15a3 3 0 0 0 3 3',
  palette: PALETTE,
  create: () => new Ink(),
};

const RES = 0.5;   // the bloom layer is drawn at half resolution (it is all soft anyway)
const MAX_PUFFS = 2600;

class Ink extends MapFade {
  constructor() {
    super({ paint: true, brush: 4, soft: 0.6, edgeFirst: 0.3, seed: 23, ink: PALETTE[0].color, textWeight: 400 });
    this.textLine = 0.06;
    this.puffs = [];
    this.decayScale = 3.2; // the crisp line goes quickly; the bloom carries the fade
    this.swirl = null;
  }

  paintBase() { return paintBowl(this.W, this.H, this.dpr); }

  setup() {
    const w = Math.ceil(this.W * this.dpr * RES), h = Math.ceil(this.H * this.dpr * RES);
    this.cloud = makeCanvas(w, h);
    this.cloudCtx = this.cloud.getContext('2d');
  }

  onStrokeMove(s, x, y, d) {
    // Puffs every few px along the line, sized to the brush.
    s.acc = (s.acc || 0) + d;
    const step = Math.max(2.5, s.r * 0.9);
    while (s.acc >= step) {
      s.acc -= step;
      const t = s.acc / Math.max(d, 0.001);
      this.addPuff(x - (x - s.x) * t, y - (y - s.y) * t, s.r, this.ink);
    }
  }

  onStrokeStart(s) {
    // A touch drops a little bead of ink that blooms on the spot.
    for (let i = 0; i < 3; i++) this.addPuff(s.x, s.y, s.r * 1.2, this.ink);
  }

  addPuff(x, y, r, col, delay = 0) {
    if (this.puffs.length >= MAX_PUFFS) this.puffs.shift();
    const a = Math.random() * Math.PI * 2;
    this.puffs.push({
      x, y, r0: r, col, age: -delay,
      // Each puff drifts and curls its own way, mostly sinking a little.
      vx: Math.cos(a) * (2 + Math.random() * 5), vy: Math.sin(a) * (2 + Math.random() * 5) + 3,
      spin: (Math.random() - 0.5) * 1.6,
      grow: 2.5 + Math.random() * 3.5,
    });
  }

  // Typed words: lay down the crisp letters, and puffs that will bloom from them.
  onCommit(blocks) {
    for (const b of blocks) this.seedText(b.lay, b.place);
  }

  seedText(lay, place) {
    const { W, H } = this;
    const k = 4;
    const c = makeCanvas(Math.ceil(W / k), Math.ceil(H / k)), g = c.getContext('2d');
    g.scale(1 / k, 1 / k);
    g.fillStyle = g.strokeStyle = '#fff';
    drawText(g, lay, place, Math.max(2.5, lay.size * this.textLine));
    const px = g.getImageData(0, 0, c.width, c.height).data;
    for (let j = 0; j < c.height; j++) {
      for (let i = 0; i < c.width; i++) {
        if (px[(j * c.width + i) * 4 + 3] > 100 && Math.random() < 0.7) this.addPuff(i * k + Math.random() * k, j * k + Math.random() * k, 3.5, this.ink);
      }
    }
  }

  intro(text, opts = {}) {
    const st = this.stampText(text, opts);
    st.overlay.apply();
    this.seedText(st.lay, st.place);
  }

  updateFx(dt) {
    const life = this.fadeSeconds * 1.1;
    const run = this.paused ? 0 : dt;
    const sw = this.swirl;
    const cx = this.W / 2, cy = this.H / 2;
    for (const p of this.puffs) {
      if (p.age < 0) { p.age += dt; continue; }
      p.age += run / life;
      const slow = 1 / (1 + p.age * 6);
      p.x += p.vx * run * slow; p.y += p.vy * run * slow;
      const a = p.spin * run * slow;
      const c = Math.cos(a), s = Math.sin(a);
      [p.vx, p.vy] = [p.vx * c - p.vy * s, p.vx * s + p.vy * c];
      if (sw) {
        // The swirl: everything orbits the middle and spirals out.
        const dx = p.x - cx, dy = p.y - cy, d = Math.hypot(dx, dy) || 1;
        const v = 420 * sw.k;
        p.x += (-dy / d * v + dx / d * v * 0.35) * dt;
        p.y += (dx / d * v + dy / d * v * 0.35) * dt;
        p.age += dt * 0.9;
      }
    }
    this.puffs = this.puffs.filter((p) => p.age < 1);
    return this.puffs.length > 0;
  }

  clear() {
    sfx.cue('pour');
    this.strokes.clear();
    this.commitDraft?.();
    this.clearing = { t: 0, dur: 1.6 };
    this.swirl = { k: 0 };
  }

  clearStep(cl) {
    const p = Math.min(1, cl.t / cl.dur);
    this.swirl.k = Math.sin(p * Math.PI);
    this.scaleCells(() => 0.8);
    if (p >= 1) {
      this.map.fill(0);
      this.puffs = [];
      const g = this.paintCtx;
      g.save(); g.setTransform(1, 0, 0, 1, 0, 0); g.clearRect(0, 0, this.paint.width, this.paint.height); g.restore();
      this.swirl = null;
      return false;
    }
    return true;
  }

  render(ctx) {
    // The crisp line (the base map/paint machinery), then the blooms on top.
    super.render(ctx);
    const g = this.cloudCtx, s = this.dpr * RES;
    g.setTransform(1, 0, 0, 1, 0, 0);
    g.clearRect(0, 0, this.cloud.width, this.cloud.height);
    g.setTransform(s, 0, 0, s, 0, 0);
    for (const p of this.puffs) {
      if (p.age < 0) continue;
      const t = p.age;
      // Blooms open slowly at first (the crisp line carries the first seconds), then spread
      // and thin out.
      const r = p.r0 * (1.2 + p.grow * (t * 2.4 + Math.sqrt(t) * 0.8));
      const a = clamp((1 - t) * (1 - t) * 0.4 * Math.min(1, t * 6), 0, 1);
      if (a < 0.01) continue;
      g.globalAlpha = a;
      g.drawImage(dot(p.col), p.x - r, p.y - r, r * 2, r * 2);
    }
    g.globalAlpha = 1;
    ctx.save();
    ctx.globalCompositeOperation = 'multiply';
    ctx.imageSmoothingEnabled = true;
    ctx.imageSmoothingQuality = 'high';
    ctx.drawImage(this.cloud, 0, 0, this.W * this.dpr, this.H * this.dpr);
    ctx.restore();
    ctx.setTransform(1, 0, 0, 1, 0, 0);
    ctx.drawImage(this.rim, 0, 0);
  }

  resize(o) {
    super.resize(o);
    this.rim = paintRim(this.W, this.H, this.dpr);
  }
}

// A soft round sprite of ink, one per colour (drawing sprites is far cheaper than gradients).
const dots = new Map();
function dot(col) {
  let c = dots.get(col);
  if (c) return c;
  c = makeCanvas(64, 64);
  const g = c.getContext('2d');
  const gr = g.createRadialGradient(32, 32, 0, 32, 32, 32);
  gr.addColorStop(0, col);
  gr.addColorStop(0.3, col + 'aa');
  gr.addColorStop(0.65, col + '33');
  gr.addColorStop(1, col + '00');
  g.fillStyle = gr; g.fillRect(0, 0, 64, 64);
  dots.set(col, c);
  return c;
}

// Looking down into a shallow white bowl of clear water, lit from a window.
function paintBowl(W, H, dpr) {
  const rand = mulberry32(31);
  const { c, g } = stageCanvas(W, H, dpr);
  const gr = g.createRadialGradient(W * 0.45, H * 0.4, 0, W / 2, H / 2, Math.max(W, H) * 0.75);
  gr.addColorStop(0, '#fbfcfc');
  gr.addColorStop(0.6, '#eef2f3');
  gr.addColorStop(1, '#d8dfe2');
  g.fillStyle = gr; g.fillRect(0, 0, W, H);
  // Soft caustic light on the bottom of the bowl.
  g.strokeStyle = 'rgba(150,190,205,0.07)';
  for (let i = 0; i < (W * H) / 9000; i++) {
    const x = rand() * W, y = rand() * H, r = 18 + rand() * 40;
    g.lineWidth = 2 + rand() * 3;
    g.beginPath(); g.arc(x, y, r, rand() * 6, rand() * 6 + 1.8); g.stroke();
  }
  // Window reflection on the water.
  blob(g, W * 0.72, H * 0.16, W * 0.18, H * 0.06, 'rgba(255,255,255,0.7)');
  return c;
}

// The bowl's glazed rim around the edge of the screen.
function paintRim(W, H, dpr) {
  const { c, g } = stageCanvas(W, H, dpr);
  const r = Math.max(W, H) * 0.72;
  const v = g.createRadialGradient(W / 2, H / 2, r * 0.72, W / 2, H / 2, r);
  v.addColorStop(0, 'rgba(160,175,185,0)');
  v.addColorStop(0.85, 'rgba(150,165,175,0.22)');
  v.addColorStop(1, 'rgba(120,135,145,0.4)');
  g.fillStyle = v; g.fillRect(0, 0, W, H);
  return c;
}
