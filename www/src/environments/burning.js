// Burning page: a Release environment.
//   Look:  pen on a lined notebook page, held over a glowing hearth at night.
//   Decay: none. Nothing fades while you draw.
//   Clear: tap "Burn it". Flame catches the bottom
//          edge, a glowing line eats inward from the edges, the page chars and curls, and
//          embers drift up the chimney. A fresh page is torn from the pad.

import { clamp, easeInOut, mulberry32, makeCanvas, valueNoise } from '../lib/util.js';
import { ReleaseScene, fitRect, paintPaper, tornOutline, paperFibres } from '../lib/release.js';
import { sfx } from '../lib/sound.js';

const PALETTE = [
  { name: 'Ballpoint', color: '#1f3a8a' },
  { name: 'Black', color: '#17171a' },
  { name: 'Pencil', color: '#4a4a4f' },
  { name: 'Red pen', color: '#b3261e' },
  { name: 'Green', color: '#2f6b3a' },
  { name: 'Purple', color: '#5b2a86' },
];

const BURN = 3.4;

export const burning = {
  id: 'burning-page',
  name: 'Burning page',
  blurb: 'It curls and burns into embers',
  clearLabel: 'Burn it',
  clearIcon: 'M12 3c1 3 4 4.5 4 9a4 4 0 0 1-8 0c0-2 1-3 1-3 0 1.5 1 2 1.5 2C10 8 12 6 12 3z',
  surface: 'A notebook page held over a fire. Tap Burn it to set it alight.',
  fades: false,
  palette: PALETTE,
  create: () => new Burning(),
};

class Burning extends ReleaseScene {
  constructor() {
    super(33);
    this.ink = PALETTE[0].color;
    this.arriveFrom = { x: 0, y: -50 };
    this.washUpAt = 1.6;
    this.washUp = 0.8;
    this.grain = 0.3;
    this.embers = [];
  }

  layout() {
    const { W, H } = this;
    this.hearth = H - clamp(H * 0.24, 150, 230);
    const top = clamp(H * 0.1, 64, 110);
    return fitRect(30, top, W - 60, this.hearth - 30 - top, 0.78);
  }

  textArea() {
    const { w, h } = this.rect;
    return { x: w * 0.14, y: h * 0.1, w: w * 0.78, h: h * 0.8 };
  }

  paintScene() { return paintHearth(this); }

  paintSheet(w, h, dpr, seed) {
    return paintPaper(w, h, dpr, seed, (g, w, h, rand) => {
      paperFibres(g, w, h, rand, '#fbf8ef', 'rgba(140,120,90,0.05)');
      g.strokeStyle = 'rgba(80,130,200,0.28)'; g.lineWidth = 1;
      for (let y = h * 0.1; y < h - 6; y += 22) { g.beginPath(); g.moveTo(0, y); g.lineTo(w, y); g.stroke(); }
      g.strokeStyle = 'rgba(220,80,90,0.4)';
      g.beginPath(); g.moveTo(w * 0.1, 0); g.lineTo(w * 0.1, h); g.stroke();
    }, tornOutline(1.5, 2));
  }

  launch(f) {
    sfx.cue('burn');
    const s = f.sheet, { w, h } = this.rect;
    // Burn order: edges first, bottom (nearest the fire) soonest, with a ragged front.
    const gw = Math.max(8, Math.round(w / 4)), gh = Math.max(8, Math.round(h / 4));
    const rand = mulberry32(s.seed);
    const noise = valueNoise(gw, gh, 6, rand), fine = valueNoise(gw, gh, 2, rand);
    const order = new Float32Array(gw * gh);
    let lo = Infinity, hi = -Infinity;
    for (let j = 0; j < gh; j++) {
      for (let i = 0; i < gw; i++) {
        const k = j * gw + i;
        const edge = Math.min(i / gw, 1 - i / gw, j / gh, 1 - j / gh) * 2;
        const v = edge * 0.45 + noise[k] * 0.35 + fine[k] * 0.08 + (j / gh) * -0.25 + 0.25;
        order[k] = v; lo = Math.min(lo, v); hi = Math.max(hi, v);
      }
    }
    for (let k = 0; k < order.length; k++) order[k] = (order[k] - lo) / (hi - lo);
    Object.assign(f, { gw, gh, order, alphaC: makeCanvas(gw, gh), charC: makeCanvas(gw, gh), glowC: makeCanvas(gw, gh), tmp: makeCanvas(s.comp.width, s.comp.height) });
    f.alphaImg = f.alphaC.getContext('2d').createImageData(gw, gh);
    f.charImg = f.charC.getContext('2d').createImageData(gw, gh);
    f.glowImg = f.glowC.getContext('2d').createImageData(gw, gh);
  }

  carry(f, dt) {
    const p = f.t / BURN;
    f.thr = -0.08 + Math.pow(p, 0.85) * 1.2;
    f.x = f.from.x; f.y = f.from.y - p * 14; f.s = 1; f.a = Math.sin(f.t * 2) * 0.01;
    // Embers shed from the burning edge.
    const { w, h } = this.rect;
    for (let n = 0; n < 10; n++) {
      const i = (Math.random() * f.gw) | 0, j = (Math.random() * f.gh) | 0;
      const v = f.order[j * f.gw + i];
      if (Math.abs(v - f.thr) < 0.03 && this.embers.length < 260) {
        this.embers.push({
          x: f.x - w / 2 + (i / f.gw) * w, y: f.y - h / 2 + (j / f.gh) * h,
          vx: (Math.random() - 0.5) * 30, vy: -30 - Math.random() * 60, t: 0, life: 1 + Math.random() * 1.8,
          ash: Math.random() < 0.3, r: 1 + Math.random() * 1.8,
        });
      }
    }
    return f.thr < 1.15;
  }

  drawCarried(ctx, f) {
    const { gw, gh, order, thr } = f;
    const a = f.alphaImg.data, c = f.charImg.data, gl = f.glowImg.data;
    for (let k = 0; k < order.length; k++) {
      const d = order[k] - thr;
      const o = k * 4;
      a[o + 3] = d <= 0 ? 0 : d < 0.015 ? (d / 0.015) * 255 : 255;
      // Char: dark brown fading into the paper over a band past the burning line.
      const ch = d > 0 && d < 0.12 ? 1 - d / 0.12 : 0;
      c[o] = 40; c[o + 1] = 22; c[o + 2] = 10; c[o + 3] = ch * ch * 235;
      // Glowing edge.
      const gv = d > -0.01 && d < 0.035 ? 1 - Math.abs(d - 0.012) / 0.024 : 0;
      gl[o] = 255; gl[o + 1] = 140 + gv * 80; gl[o + 2] = 40; gl[o + 3] = clamp(gv, 0, 1) * 255;
    }
    f.alphaC.getContext('2d').putImageData(f.alphaImg, 0, 0);
    f.charC.getContext('2d').putImageData(f.charImg, 0, 0);
    f.glowC.getContext('2d').putImageData(f.glowImg, 0, 0);
    const t = f.tmp, g = t.getContext('2d');
    g.globalCompositeOperation = 'copy';
    g.drawImage(f.sheet.comp, 0, 0);
    g.imageSmoothingEnabled = true;
    g.globalCompositeOperation = 'source-atop';
    g.drawImage(f.charC, 0, 0, t.width, t.height);
    g.globalCompositeOperation = 'destination-in';
    g.drawImage(f.alphaC, 0, 0, t.width, t.height);
    g.globalCompositeOperation = 'source-over';
    const { w, h } = this.rect;
    const p = clamp(f.t / BURN, 0, 1);
    ctx.save();
    ctx.translate(f.x, f.y);
    ctx.rotate(f.a);
    // The page curls a little as it burns.
    ctx.scale(1 - p * 0.06, 1 - p * 0.1);
    ctx.shadowColor = 'rgba(0,0,0,0.4)'; ctx.shadowBlur = 14; ctx.shadowOffsetY = 6;
    ctx.drawImage(t, -w / 2, -h / 2, w, h);
    ctx.shadowColor = 'transparent';
    ctx.globalCompositeOperation = 'lighter';
    ctx.drawImage(f.glowC, -w / 2, -h / 2, w, h);
    ctx.globalAlpha = 0.5;
    ctx.filter = 'none';
    ctx.drawImage(f.glowC, -w / 2 - 2, -h / 2 - 3, w + 4, h + 4);
    ctx.restore();
  }

  updateFx(dt) {
    for (const e of this.embers) {
      e.t += dt;
      e.vy -= (e.ash ? 5 : 20) * dt;
      e.vx += Math.sin(e.t * 4 + e.r * 9) * 20 * dt;
      e.x += e.vx * dt; e.y += e.vy * dt;
    }
    this.embers = this.embers.filter((e) => e.t < e.life);
    return this.embers.length > 0;
  }

  drawFront(ctx) {
    for (const e of this.embers) {
      const k = 1 - e.t / e.life;
      if (e.ash) {
        ctx.fillStyle = `rgba(60,55,50,${0.7 * k})`;
        ctx.fillRect(e.x, e.y, e.r * 2, e.r * 1.4);
      } else {
        ctx.fillStyle = `rgba(255,${150 + 80 * k | 0},60,${k})`;
        ctx.beginPath(); ctx.arc(e.x, e.y, e.r * (0.6 + k * 0.5), 0, Math.PI * 2); ctx.fill();
      }
    }
  }

  drawBack(ctx) {
    // The fire flickers whenever anything is moving.
    const { W, hearth } = this;
    const fl = 0.8 + 0.2 * Math.sin(this.time * 11) * Math.sin(this.time * 7.3);
    const g = ctx.createRadialGradient(W / 2, hearth + 70, 0, W / 2, hearth + 70, W * 0.45);
    g.addColorStop(0, `rgba(255,160,60,${0.35 * fl})`);
    g.addColorStop(1, 'rgba(255,100,30,0)');
    ctx.fillStyle = g;
    ctx.fillRect(0, hearth - W * 0.3, W, W * 0.8);
    flames(ctx, W / 2, hearth + 92, Math.min(W * 0.36, 180), this.time);
  }
}

function flames(ctx, cx, base, w, t) {
  for (let i = 0; i < 7; i++) {
    const x = cx + (i - 3) * w / 7;
    const h = (34 + 18 * Math.sin(t * 6 + i * 1.7) + (i % 2 ? 10 : 22)) * (1 - Math.abs(i - 3) * 0.12);
    const gr = ctx.createLinearGradient(0, base, 0, base - h);
    gr.addColorStop(0, 'rgba(255,220,120,0.95)');
    gr.addColorStop(0.5, 'rgba(255,140,40,0.8)');
    gr.addColorStop(1, 'rgba(220,60,20,0)');
    ctx.fillStyle = gr;
    ctx.beginPath();
    ctx.moveTo(x - w / 12, base);
    ctx.quadraticCurveTo(x - w / 18, base - h * 0.5, x + Math.sin(t * 5 + i) * 4, base - h);
    ctx.quadraticCurveTo(x + w / 18, base - h * 0.5, x + w / 12, base);
    ctx.fill();
  }
}

// A brick hearth at night with logs on the grate.
function paintHearth(e) {
  const { W, H, dpr, hearth } = e;
  const rand = mulberry32(14);
  const c = makeCanvas(W * dpr, H * dpr), g = c.getContext('2d');
  g.scale(dpr, dpr);
  g.fillStyle = '#2a1712';
  g.fillRect(0, 0, W, H);
  // Bricks.
  const bw = 46, bh = 20;
  for (let row = 0; row * bh < H; row++) {
    for (let x = (row % 2) * -bw / 2; x < W; x += bw) {
      const l = 22 + rand() * 12;
      g.fillStyle = `hsl(${8 + rand() * 10},${35 + rand() * 15}%,${l}%)`;
      g.fillRect(x + 1.5, row * bh + 1.5, bw - 3, bh - 3);
    }
  }
  // Firebox opening.
  const fw = Math.min(W * 0.8, 420), fx = (W - fw) / 2, ft = hearth;
  g.fillStyle = '#120806';
  g.beginPath(); g.moveTo(fx, H); g.lineTo(fx, ft + 30); g.quadraticCurveTo(W / 2, ft - 20, fx + fw, ft + 30); g.lineTo(fx + fw, H); g.fill();
  // Mantel shadow and warm wash from the fire below.
  const glow = g.createRadialGradient(W / 2, H, 0, W / 2, H, Math.max(W, H) * 0.9);
  glow.addColorStop(0, 'rgba(255,140,50,0.35)');
  glow.addColorStop(0.5, 'rgba(160,60,20,0.15)');
  glow.addColorStop(1, 'rgba(0,0,0,0.35)');
  g.fillStyle = glow; g.fillRect(0, 0, W, H);
  // Logs and glowing coals.
  const ly = hearth + 100;
  for (const [dx, a] of [[-0.12, 0.12], [0.1, -0.1]]) {
    g.save();
    g.translate(W / 2 + dx * fw, ly);
    g.rotate(a);
    g.fillStyle = '#4a2c1a';
    g.fillRect(-fw * 0.22, -10, fw * 0.44, 20);
    g.fillStyle = '#6b4128';
    g.beginPath(); g.ellipse(fw * 0.22, 0, 6, 10, 0, 0, Math.PI * 2); g.fill();
    g.restore();
  }
  for (let i = 0; i < 40; i++) {
    g.fillStyle = `rgba(255,${80 + rand() * 120 | 0},30,${0.5 + rand() * 0.5})`;
    g.beginPath(); g.arc(W / 2 + (rand() - 0.5) * fw * 0.6, ly + 12 + rand() * 10, 1.5 + rand() * 3, 0, Math.PI * 2); g.fill();
  }
  return c;
}
