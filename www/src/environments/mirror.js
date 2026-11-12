// Steamy mirror: a Fade environment (a cousin of the shower door).
//   Look:  you wipe lines through steam on a bathroom mirror, revealing a bright reflection:
//          vanity bulbs, pale tiles, a towel and a plant.
//   Decay: steam drifts up from the hot sink below, so the bottom fogs over first and the
//          mist climbs the glass.
//   Clear: run the hot tap: a billow of steam rolls up from the bottom and fogs the mirror.

import { clamp, easeInOut, mulberry32, makeCanvas } from '../lib/util.js';
import { MapFade, stageCanvas, blurred, blob, mottle } from '../lib/fade.js';
import { sfx } from '../lib/sound.js';

export const mirror = {
  id: 'mirror',
  name: 'Steamy mirror',
  blurb: 'Steam rises from the sink and fogs it',
  surface: 'Steamy bathroom mirror drawing surface',
  clearLabel: 'Hot tap',
  clearIcon: 'M8 21c0-3 2-3 2-6s-2-3-2-6M12 21c0-3 2-3 2-6s-2-3-2-6M16 21c0-3 2-3 2-6s-2-3-2-6',
  create: () => new Mirror(),
};

class Mirror extends MapFade {
  constructor() {
    super({ cover: true, brush: 12, seed: 17 });
    this.puffs = [];
  }

  decayAt(x, y, coarse, fine) {
    return 0.35 + 1.0 * Math.pow(y / this.H, 1.3) + 0.55 * coarse + 0.3 * (fine - 0.5);
  }

  paintBase() { return paintReflection(this.W, this.H, this.dpr); }

  paintLayer() {
    const { W, H, dpr } = this;
    const rand = mulberry32(8);
    const c = blurred(this.base, W, H, dpr, 30), g = c.getContext('2d');
    g.scale(dpr, dpr);
    const haze = g.createLinearGradient(0, 0, 0, H);
    haze.addColorStop(0, 'rgba(236,239,240,0.6)');
    haze.addColorStop(1, 'rgba(244,246,247,0.74)');
    g.fillStyle = haze; g.fillRect(0, 0, W, H);
    mottle(g, W, H, rand, { light: 45, dark: 18, scale: 10 });
    // Fine mist beads, smaller and fainter than the shower door's.
    for (let n = 0; n < (W * H) / 70; n++) {
      const x = rand() * W, y = rand() * H, r = 0.3 + rand() * rand();
      g.fillStyle = 'rgba(120,130,140,0.1)';
      g.beginPath(); g.arc(x + r * 0.3, y + r * 0.3, r, 0, Math.PI * 2); g.fill();
      g.fillStyle = 'rgba(255,255,255,0.5)';
      g.beginPath(); g.arc(x - r * 0.2, y - r * 0.2, r * 0.5, 0, Math.PI * 2); g.fill();
    }
    return c;
  }

  clear() {
    sfx.cue('steam');
    sfx.cue('tap');
    this.strokes.clear();
    this.clearing = { t: 0, dur: 1.8 };
    const rand = Math.random;
    this.puffs = Array.from({ length: 14 }, () => ({ x: rand() * this.W, r: 50 + rand() * 90, d: rand() * 0.5, v: 0.8 + rand() * 0.5 }));
  }

  clearStep(cl) {
    const p = Math.min(1, cl.t / cl.dur);
    const soft = 200;
    const front = this.H + soft - (this.H + soft * 2) * easeInOut(p);
    cl.front = front;
    // A billowing, uneven front.
    this.scaleCells((x, y) => clamp((front + Math.sin(x * 0.02 + cl.t * 3) * 30 - y) / soft, 0, 1));
    if (p >= 1) { this.map.fill(0); this.puffs = []; return false; }
    return true;
  }

  drawFx(ctx) {
    const cl = this.clearing;
    if (!cl) return;
    for (const p of this.puffs) {
      const t = clamp((cl.t - p.d) / cl.dur, 0, 1);
      const y = this.H + p.r - (this.H + p.r * 2) * easeInOut(Math.min(1, t * p.v));
      blob(ctx, p.x, y, p.r * 1.3, p.r, `rgba(250,250,250,${0.45 * Math.sin(t * Math.PI)})`);
    }
  }
}

// The reflection: a bright bathroom behind you.
function paintReflection(W, H, dpr) {
  const rand = mulberry32(64);
  const { c, g } = stageCanvas(W, H, dpr);
  const wall = g.createLinearGradient(0, 0, 0, H);
  wall.addColorStop(0, '#c9d6d8');
  wall.addColorStop(1, '#9fb2b6');
  g.fillStyle = wall; g.fillRect(0, 0, W, H);
  // Subway tiles.
  const tw = 46, th = 22;
  g.strokeStyle = 'rgba(255,255,255,0.45)';
  g.lineWidth = 1.2;
  for (let row = 0; row * th < H; row++) {
    const y = row * th;
    g.beginPath(); g.moveTo(0, y); g.lineTo(W, y); g.stroke();
    for (let x = (row % 2) * tw / 2; x < W; x += tw) { g.beginPath(); g.moveTo(x, y); g.lineTo(x, y + th); g.stroke(); }
  }
  g.fillStyle = 'rgba(70,90,95,0.06)';
  for (let row = 0; row * th < H; row++) g.fillRect(0, row * th + th - 3, W, 3);
  // A door frame and a hanging towel.
  g.fillStyle = '#e9e3d6';
  g.fillRect(W * 0.66, H * 0.18, W * 0.3, H);
  g.fillStyle = '#d7cfbd';
  g.fillRect(W * 0.68, H * 0.2, W * 0.26, H);
  g.fillStyle = '#8a7d6a';
  g.fillRect(W * 0.04, H * 0.42, W * 0.32, 5);
  const towel = g.createLinearGradient(W * 0.07, 0, W * 0.32, 0);
  towel.addColorStop(0, '#d57c6b'); towel.addColorStop(0.5, '#e8988a'); towel.addColorStop(1, '#c86e5e');
  g.fillStyle = towel;
  g.beginPath(); g.moveTo(W * 0.07, H * 0.42); g.lineTo(W * 0.32, H * 0.42); g.lineTo(W * 0.31, H * 0.68); g.quadraticCurveTo(W * 0.2, H * 0.7, W * 0.08, H * 0.68); g.fill();
  g.fillStyle = 'rgba(255,255,255,0.35)';
  g.fillRect(W * 0.07, H * 0.6, W * 0.25, 6);
  // A plant on a shelf.
  g.fillStyle = '#efe9df';
  g.fillRect(W * 0.38, H * 0.6, W * 0.24, 6);
  g.fillStyle = '#d9a37a';
  g.fillRect(W * 0.45, H * 0.53, W * 0.1, H * 0.07);
  g.strokeStyle = '#4c8a5a'; g.lineWidth = 5; g.lineCap = 'round';
  for (let i = 0; i < 9; i++) {
    const a = -Math.PI / 2 + (rand() - 0.5) * 2.2, l = 30 + rand() * 40;
    g.beginPath(); g.moveTo(W * 0.5, H * 0.54); g.quadraticCurveTo(W * 0.5 + Math.cos(a) * l * 0.4, H * 0.54 - l * 0.6, W * 0.5 + Math.cos(a) * l, H * 0.54 + Math.sin(a) * l); g.stroke();
  }
  // Vanity bulbs reflected along the top.
  const n = Math.max(3, Math.round(W / 110));
  for (let i = 0; i < n; i++) {
    const x = (i + 0.5) * W / n, y = 34;
    blob(g, x, y, 70, 70, 'rgba(255,236,200,0.55)');
    g.fillStyle = '#fffaf0';
    g.beginPath(); g.arc(x, y, 13, 0, Math.PI * 2); g.fill();
  }
  // Warm overall light.
  blob(g, W * 0.5, 0, W * 0.9, H * 0.6, 'rgba(255,225,190,0.25)');
  const v = g.createRadialGradient(W / 2, H * 0.45, Math.min(W, H) * 0.35, W / 2, H * 0.45, Math.max(W, H) * 0.8);
  v.addColorStop(0, 'rgba(0,0,0,0)');
  v.addColorStop(1, 'rgba(30,40,45,0.3)');
  g.fillStyle = v; g.fillRect(0, 0, W, H);
  return c;
}
