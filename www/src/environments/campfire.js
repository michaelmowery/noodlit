// Campfire: a Release environment.
//   Look:  pencil on a torn scrap of brown paper, held up over a little campfire in a
//          storybook forest at night.
//   Decay: none. Nothing fades while you draw.
//   Clear: tap "Into the fire". The scrap drops in,
//          curls, and burns away from the bottom up with a glowing edge; the fire flares and
//          throws up sparks, and a fresh scrap is found.

import { clamp, easeInOut, mulberry32, makeCanvas, valueNoise } from '../lib/util.js';
import { ReleaseScene, fitRect, paintPaper, tornOutline, paperFibres } from '../lib/release.js';
import { sfx } from '../lib/sound.js';

const DROP = 0.8;     // scrap falls into the fire
const BURN = 3.6;     // then burns away

// Inks that suit the material, default first.
const PALETTE = [
  { name: 'Pencil', color: '#2b2118' },
  { name: 'Charcoal', color: '#121010' },
  { name: 'Red crayon', color: '#9e2a1e' },
  { name: 'Blue pencil', color: '#2a3f7a' },
  { name: 'White chalk', color: '#efe8da' },
  { name: 'Green', color: '#2f5a2a' },
];

export const campfire = {
  id: 'campfire',
  name: 'Campfire',
  blurb: 'Toss it into the fire',
  clearLabel: 'Into the fire',
  clearIcon: 'M12 3c1 3 4 4.5 4 8.5a4 4 0 0 1-8 0c0-1.6.8-2.6 1.6-3.4.2 1.4.9 2.2 1.9 2.4C11 8.5 11 5.5 12 3zM5 20l14-3M5 17l14 3',
  surface: 'Scrap of paper over a campfire. Tap Into the fire to let it go.',
  fades: false,
  palette: PALETTE,
  create: () => new Campfire(),
};

class Campfire extends ReleaseScene {
  constructor() {
    super(41);
    this.ink = PALETTE[0].color;
    this.arriveFrom = { x: 0, y: -50 };
    this.washUpAt = 3.2;
    this.grain = 0.9;
    this.sparks = [];
    this.flare = 0;
    this.poke = -10;
  }

  layout() {
    const { W, H } = this;
    this.fx = W / 2;
    this.fy = H - clamp(H * 0.13, 96, 130);           // base of the flames
    this.fw = clamp(Math.min(W, H) * 0.3, 90, 170);   // fire width
    const top = clamp(H * 0.09, 56, 110);
    const bottom = this.fy - this.fw * 0.95;
    return fitRect(20, top, W - 40, bottom - top, 0.95);
  }

  paintScene() { return paintForest(this); }

  paintSheet(w, h, dpr, seed) {
    return paintPaper(w, h, dpr, seed, (g, w, h, rand) => {
      paperFibres(g, w, h, rand, '#d8c09a', 'rgba(110,80,40,0.08)');
      const v = g.createRadialGradient(w / 2, h / 2, Math.min(w, h) * 0.3, w / 2, h / 2, Math.max(w, h) * 0.7);
      v.addColorStop(0, 'rgba(255,240,210,0.25)');
      v.addColorStop(1, 'rgba(120,80,40,0.25)');
      g.fillStyle = v; g.fillRect(0, 0, w, h);
      // A fold crease and a coffee ring, because it's a scrap.
      g.strokeStyle = 'rgba(110,80,45,0.18)'; g.lineWidth = 1;
      g.beginPath(); g.moveTo(0, h * (0.4 + rand() * 0.2)); g.lineTo(w, h * (0.4 + rand() * 0.2)); g.stroke();
      g.strokeStyle = 'rgba(130,85,40,0.12)'; g.lineWidth = 3;
      g.beginPath(); g.arc(w * (0.7 + rand() * 0.15), h * (0.15 + rand() * 0.2), 22 + rand() * 10, 0.4, Math.PI * 1.7); g.stroke();
    }, tornOutline(3.5, 4));
  }

  strokeStart(id, x, y, info) { this.poke = this.time; super.strokeStart(id, x, y, info); }
  tapScene(x, y) { if (Math.abs(x - this.fx) < this.fw && Math.abs(y - this.fy) < this.fw) { this.flare = Math.max(this.flare, 0.5); this.burst(10); } }

  launch(f) {
    const { w, h } = this.rect;
    f.scale = (this.fw * 1.15) / w;
    f.drop = { x: this.fx, y: this.fy - this.fw * 0.55 - h * f.scale * 0.5 };
    f.burnt = false;
    f.burn = makeBurn(w, h, f.seed);
    f.canvas = makeCanvas(f.sheet.comp.width, f.sheet.comp.height);
    this.poke = this.time;
  }

  carry(f, dt) {
    if (f.t < DROP) {
      const p = easeInOut(f.t / DROP);
      f.x = f.from.x + (f.drop.x - f.from.x) * p;
      f.y = f.from.y + (f.drop.y - f.from.y) * p - Math.sin(Math.PI * p) * 30;
      f.s = 1 + (f.scale - 1) * p;
      f.a = Math.sin(p * Math.PI) * 0.25;
      f.p = 0;
      return true;
    }
    if (!f.burnt) { f.burnt = true; sfx.cue('ignite'); this.flare = 1; this.burst(26); }
    const q = (f.t - DROP) / BURN;
    f.p = q;
    f.a = 0.08 * Math.sin(f.t * 3 + f.seed) - q * 0.2;
    f.y = f.drop.y + q * 14;
    f.s = f.scale * (1 - q * 0.25);
    if (this.rand() < 0.5) this.spark(f.x + (this.rand() - 0.5) * this.fw * 0.6, f.y);
    this.flare = Math.max(this.flare, 0.6 * (1 - q));
    return q < 1;
  }

  burst(n) { for (let i = 0; i < n; i++) this.spark(this.fx + (this.rand() - 0.5) * this.fw * 0.5, this.fy - this.fw * 0.3); }
  spark(x, y) {
    const r = this.rand;
    this.sparks.push({ x, y, vx: (r() - 0.5) * 40, vy: -60 - r() * 110, life: 1 + r() * 1.4, t: 0, ph: r() * 6 });
  }

  updateFx(dt) {
    this.flare = Math.max(0, this.flare - dt * 0.5);
    for (const s of this.sparks) {
      s.t += dt;
      s.x += (s.vx + Math.sin(this.time * 3 + s.ph) * 20) * dt;
      s.y += s.vy * dt;
      s.vy *= 1 - dt * 0.3;
    }
    this.sparks = this.sparks.filter((s) => s.t < s.life);
    // Keep the flames dancing for a while after any touch, then let the loop rest.
    if (this.sparks.length < 3 && this.time - this.poke < 7 && this.rand() < dt * 4) this.spark(this.fx + (this.rand() - 0.5) * this.fw * 0.4, this.fy - this.fw * 0.4);
    return this.sparks.length > 0 || this.time - this.poke < 7 || this.flare > 0;
  }

  drawBack(ctx) {
    // Warm light on the ground that breathes with the flames.
    const { fx, fy, fw } = this;
    const k = 0.75 + 0.1 * Math.sin(this.time * 7) + 0.08 * Math.sin(this.time * 11.3) + this.flare * 0.4;
    ctx.save();
    ctx.globalCompositeOperation = 'lighter';
    const g = ctx.createRadialGradient(fx, fy - fw * 0.3, 0, fx, fy - fw * 0.3, fw * 3.2);
    g.addColorStop(0, `rgba(255,150,60,${0.32 * k})`);
    g.addColorStop(0.4, `rgba(200,90,30,${0.12 * k})`);
    g.addColorStop(1, 'rgba(0,0,0,0)');
    ctx.fillStyle = g;
    ctx.fillRect(fx - fw * 3.2, fy - fw * 3.5, fw * 6.4, fw * 6.4);
    ctx.restore();
  }

  drawCarried(ctx, f) {
    const { w, h } = this.rect;
    if (!f.p) { this.drawSheetAt(ctx, f.sheet, f.x, f.y, f.s, f.a, 1, 0.25); return; }
    this.compose(f.sheet);
    const g = f.canvas.getContext('2d');
    const b = f.burn;
    paintBurn(b, f.p);
    g.setTransform(1, 0, 0, 1, 0, 0);
    g.globalCompositeOperation = 'copy';
    g.drawImage(f.sheet.comp, 0, 0);
    g.imageSmoothingEnabled = true;
    g.globalCompositeOperation = 'destination-in';
    g.drawImage(b.mask, 0, 0, f.canvas.width, f.canvas.height);
    g.globalCompositeOperation = 'source-atop';
    g.drawImage(b.char, 0, 0, f.canvas.width, f.canvas.height);
    g.globalCompositeOperation = 'source-over';
    ctx.save();
    ctx.translate(f.x, f.y);
    ctx.rotate(f.a);
    ctx.scale(f.s, f.s * (1 - f.p * 0.15));
    ctx.drawImage(f.canvas, -w / 2, -h / 2, w, h);
    ctx.globalCompositeOperation = 'lighter';
    ctx.drawImage(b.glow, -w / 2, -h / 2, w, h);
    ctx.restore();
  }

  drawFront(ctx) {
    drawFlames(ctx, this);
    for (const s of this.sparks) {
      const a = 1 - s.t / s.life;
      ctx.fillStyle = `rgba(255,${180 + 60 * a | 0},90,${a})`;
      ctx.beginPath(); ctx.arc(s.x, s.y, 1.2 + a * 1.4, 0, Math.PI * 2); ctx.fill();
    }
  }
}

// ------------------------------------------------------------------ burning
// A low-res noise field decides which parts of the scrap go first: the bottom, then
// ragged tongues working up. Mask, char band and glowing edge are tiny canvases scaled up.
function makeBurn(w, h, seed) {
  const nw = Math.ceil(w / 5), nh = Math.ceil(h / 5);
  const n = valueNoise(nw, nh, 7, mulberry32(seed * 1000 | 0));
  const v = new Float32Array(nw * nh);
  for (let y = 0; y < nh; y++) for (let x = 0; x < nw; x++) v[y * nw + x] = 0.5 * n[y * nw + x] + 0.5 * (1 - y / nh);
  const mk = () => { const c = makeCanvas(nw, nh); return { c, g: c.getContext('2d'), img: c.getContext('2d').createImageData(nw, nh) }; };
  const m = mk(), ch = mk(), gl = mk();
  return { nw, nh, v, m, ch, gl, mask: m.c, char: ch.c, glow: gl.c };
}

function paintBurn(b, p) {
  const th = -0.08 + p * 1.2, e = 0.07;
  const md = b.m.img.data, cd = b.ch.img.data, gd = b.gl.img.data;
  for (let i = 0; i < b.v.length; i++) {
    const d = b.v[i] - th;
    const o = i * 4;
    md[o + 3] = d <= 0 ? 0 : 255;
    // Charred band just above the burn line.
    const c = d > 0 && d < e * 2 ? 1 - d / (e * 2) : 0;
    cd[o] = 40; cd[o + 1] = 22; cd[o + 2] = 10; cd[o + 3] = c * 235;
    // Glowing edge right at the line.
    const gg = Math.max(0, 1 - Math.abs(d) / (e * 0.8));
    gd[o] = 255; gd[o + 1] = 120 + 80 * gg; gd[o + 2] = 30; gd[o + 3] = gg * 255 * (d > -e * 0.3 ? 1 : 0);
  }
  b.m.g.putImageData(b.m.img, 0, 0);
  b.ch.g.putImageData(b.ch.img, 0, 0);
  b.gl.g.putImageData(b.gl.img, 0, 0);
}

// ------------------------------------------------------------------ flames
function drawFlames(ctx, e) {
  const { fx, fy, fw, time: t } = e;
  const k = 1 + e.flare * 0.7;
  ctx.save();
  const layers = [
    ['#e2542a', 1.0, 0.95],
    ['#f6882c', 0.78, 0.8],
    ['#ffc94a', 0.5, 0.6],
    ['#fff1a8', 0.26, 0.38],
  ];
  for (const [color, wf, hf] of layers) {
    ctx.fillStyle = color;
    for (let i = -2; i <= 2; i++) {
      const ph = i * 1.9 + wf * 4;
      const hh = fw * hf * k * (0.85 + 0.2 * Math.sin(t * 6.3 + ph) + 0.1 * Math.sin(t * 13 + ph * 2)) * (1 - Math.abs(i) * 0.22);
      const ww = fw * wf * 0.28;
      const x = fx + i * fw * wf * 0.16;
      const sway = Math.sin(t * 4.1 + ph) * ww * 0.35;
      ctx.beginPath();
      ctx.moveTo(x - ww, fy);
      ctx.bezierCurveTo(x - ww, fy - hh * 0.45, x + sway - ww * 0.2, fy - hh * 0.7, x + sway, fy - hh);
      ctx.bezierCurveTo(x + sway + ww * 0.2, fy - hh * 0.7, x + ww, fy - hh * 0.45, x + ww, fy);
      ctx.closePath();
      ctx.fill();
    }
  }
  // Logs and stones in front of the flame base.
  ctx.fillStyle = '#5b3a24';
  for (const s of [-1, 1]) {
    ctx.save();
    ctx.translate(fx, fy + 4);
    ctx.rotate(s * 0.28);
    ctx.beginPath(); ctx.ellipse(0, 0, fw * 0.62, fw * 0.09, 0, 0, Math.PI * 2); ctx.fill();
    ctx.fillStyle = '#c99a68';
    ctx.beginPath(); ctx.ellipse(s * fw * 0.6, 0, fw * 0.05, fw * 0.085, 0, 0, Math.PI * 2); ctx.fill();
    ctx.fillStyle = '#5b3a24';
    ctx.restore();
  }
  const rand = mulberry32(5);
  for (let i = 0; i < 9; i++) {
    const a = Math.PI * (0.05 + (i / 8) * 0.9);
    const x = fx + Math.cos(a) * fw * 0.8, y = fy + 8 + Math.sin(a) * fw * 0.16;
    const shade = 120 + rand() * 40 | 0;
    ctx.fillStyle = `rgb(${shade},${shade - 6},${shade - 14})`;
    ctx.beginPath(); ctx.ellipse(x, y, fw * (0.11 + rand() * 0.04), fw * 0.08, rand(), 0, Math.PI * 2); ctx.fill();
    ctx.fillStyle = `rgba(255,170,90,${0.25 + e.flare * 0.2})`;
    ctx.beginPath(); ctx.ellipse(x, y - fw * 0.04, fw * 0.07, fw * 0.03, 0, Math.PI, 0); ctx.fill();
  }
  ctx.restore();
}

// ------------------------------------------------------------------ painting
function paintForest(e) {
  const { W, H, dpr, fx, fy, fw } = e;
  const rand = mulberry32(17);
  const c = makeCanvas(W * dpr, H * dpr), g = c.getContext('2d');
  g.scale(dpr, dpr);
  const sky = g.createLinearGradient(0, 0, 0, H);
  sky.addColorStop(0, '#0f1530');
  sky.addColorStop(0.6, '#1b2440');
  sky.addColorStop(1, '#202a2a');
  g.fillStyle = sky; g.fillRect(0, 0, W, H);
  for (let i = 0; i < (W * H) / 2500; i++) {
    const a = rand();
    g.fillStyle = `rgba(255,255,240,${0.3 + a * 0.6})`;
    g.beginPath(); g.arc(rand() * W, rand() * H * 0.6, a < 0.9 ? 0.8 : 1.6, 0, Math.PI * 2); g.fill();
  }
  // Moon.
  g.fillStyle = '#f4ecc8';
  g.beginPath(); g.arc(W * 0.84, H * 0.08, Math.min(W, H) * 0.045, 0, Math.PI * 2); g.fill();
  g.fillStyle = '#0f1530';
  g.beginPath(); g.arc(W * 0.84 + Math.min(W, H) * 0.02, H * 0.08 - Math.min(W, H) * 0.012, Math.min(W, H) * 0.04, 0, Math.PI * 2); g.fill();
  // Two rows of pines.
  for (const [base, color, size] of [[H * 0.62, '#18233a', 1], [H * 0.72, '#122019', 1.3]]) {
    g.fillStyle = color;
    let x = -20;
    while (x < W + 30) {
      const s = (28 + rand() * 26) * size;
      const y = base + rand() * 20;
      pine(g, x, y, s);
      x += s * (0.7 + rand() * 0.5);
    }
    g.fillRect(0, base + 10, W, H);
  }
  // Clearing.
  g.fillStyle = '#26301f';
  g.beginPath(); g.ellipse(fx, fy + fw * 0.2, W * 0.75, fw * 1.4, 0, 0, Math.PI * 2); g.fill();
  g.fillStyle = '#1d140e';
  g.beginPath(); g.ellipse(fx, fy + 10, fw * 0.9, fw * 0.22, 0, 0, Math.PI * 2); g.fill();
  // Grass tufts around the clearing.
  g.strokeStyle = 'rgba(80,110,60,0.5)'; g.lineWidth = 1.2; g.lineCap = 'round';
  for (let i = 0; i < W / 6; i++) {
    const x = rand() * W, y = fy - fw * 0.6 + rand() * (H - fy + fw * 0.6);
    if (Math.abs(x - fx) < fw * 1.1 && Math.abs(y - fy) < fw * 0.4) continue;
    for (let k = -1; k <= 1; k++) { g.beginPath(); g.moveTo(x + k * 2, y); g.lineTo(x + k * 4, y - 6 - rand() * 4); g.stroke(); }
  }
  // A sitting log on each side.
  for (const s of [-1, 1]) {
    const lx = fx + s * Math.min(W * 0.36, fw * 2.1), ly = fy + fw * 0.15;
    g.fillStyle = '#4a3020';
    g.beginPath(); g.ellipse(lx, ly, fw * 0.55, fw * 0.13, s * 0.08, 0, Math.PI * 2); g.fill();
    g.fillStyle = '#a77a4e';
    g.beginPath(); g.ellipse(lx - s * fw * 0.52, ly, fw * 0.07, fw * 0.12, 0, 0, Math.PI * 2); g.fill();
  }
  return c;
}

function pine(g, x, y, s) {
  g.beginPath();
  g.moveTo(x, y - s * 1.8);
  for (let i = 0; i < 3; i++) {
    const yy = y - s * 1.8 + (i + 1) * s * 0.6;
    const ww = s * (0.3 + i * 0.18);
    g.lineTo(x + ww, yy);
    g.lineTo(x + ww * 0.45, yy);
  }
  g.lineTo(x + s * 0.08, y);
  g.lineTo(x - s * 0.08, y);
  for (let i = 2; i >= 0; i--) {
    const yy = y - s * 1.8 + (i + 1) * s * 0.6;
    const ww = s * (0.3 + i * 0.18);
    g.lineTo(x - ww * 0.45, yy);
    g.lineTo(x - ww, yy);
  }
  g.closePath();
  g.fill();
}


