// Paper lantern: a Release environment.
//   Look:  ink on the warm paper of a sky lantern, on a quiet lakeshore at night.
//   Decay: none. Nothing fades while you draw.
//   Clear: drag the handle up (or tap "Light it"). The lantern lights from inside, glows,
//          and rises into the night, swaying and shrinking until it's one more far-off
//          light among the others. A new lantern is unfolded.

import { clamp, easeInOut, mulberry32, makeCanvas } from '../lib/util.js';
import { ReleaseScene, fitRect, paintPaper } from '../lib/release.js';
import { sfx } from '../lib/sound.js';

const LIGHT = 1.1;    // flame catches and the paper warms up
const RISE = 9;

export const lantern = {
  id: 'lantern',
  name: 'Paper lantern',
  blurb: 'Light it and let it rise',
  clearLabel: 'Light it',
  clearIcon: 'M8 4h8l1.5 12h-11L8 4zM9.5 16l.5 3h4l.5-3M12 19v2',
  surface: 'A paper sky lantern to draw on. Drag the handle up to light it and let it rise.',
  fades: false,
  create: () => new Lantern(),
};

class Lantern extends ReleaseScene {
  constructor() {
    super(52);
    this.ink = '#3b1d10';
    this.handleSide = 'top';
    this.arriveFrom = { x: 0, y: 60 };
    this.washUpAt = 2;
    this.washUp = 1;
    this.grain = 0.5;
    this.twinkle = 0;
  }

  layout() {
    const { W, H } = this;
    this.shore = H - clamp(H * 0.17, 115, 160);
    const top = clamp(H * 0.12, 70, 130);
    const bottom = this.shore + 10;
    return fitRect(30, top, W - 60, bottom - top, 0.74);
  }

  textArea() {
    const { w, h } = this.rect;
    return { x: w * 0.16, y: h * 0.12, w: w * 0.68, h: h * 0.7 };
  }

  setup() {
    const rand = mulberry32(8);
    // Far-off lanterns already drifting in the sky.
    this.far = Array.from({ length: 9 }, () => ({ x: rand() * this.W, y: rand() * this.H * 0.45 + 20, s: 2 + rand() * 4, ph: rand() * 6 }));
  }

  paintScene() { return paintNight(this); }

  paintSheet(w, h, dpr, seed) {
    return paintPaper(w, h, dpr, seed, (g, w, h, rand) => {
      const base = g.createLinearGradient(0, 0, 0, h);
      base.addColorStop(0, '#f6dfb4');
      base.addColorStop(1, '#efc48c');
      g.fillStyle = base; g.fillRect(0, 0, w, h);
      // Rice-paper fibres and the bamboo ribs showing through.
      g.strokeStyle = 'rgba(160,100,40,0.08)'; g.lineWidth = 0.7;
      for (let i = 0; i < (w * h) / 700; i++) {
        const x = rand() * w, y = rand() * h, a = rand() * Math.PI, l = 4 + rand() * 10;
        g.beginPath(); g.moveTo(x, y); g.lineTo(x + Math.cos(a) * l, y + Math.sin(a) * l); g.stroke();
      }
      g.strokeStyle = 'rgba(150,90,40,0.16)'; g.lineWidth = 2;
      for (const f of [0.25, 0.5, 0.75]) {
        g.beginPath(); g.moveTo(w * (0.5 + (f - 0.5) * 0.9), 4); g.lineTo(w * (0.5 + (f - 0.5) * 0.74), h); g.stroke();
      }
      const glow = g.createRadialGradient(w / 2, h * 0.75, 0, w / 2, h * 0.7, h * 0.8);
      glow.addColorStop(0, 'rgba(255,240,200,0.35)');
      glow.addColorStop(1, 'rgba(180,90,40,0.18)');
      g.fillStyle = glow; g.fillRect(0, 0, w, h);
      // Wire ring around the open bottom.
      g.fillStyle = 'rgba(120,70,35,0.5)';
      g.fillRect(0, h - 8, w, 8);
    }, lanternPath);
  }

  launch(f) {
    sfx.cue('ignite');
    f.drift = (this.rand() - 0.4) * this.W * 0.3;
    const c = f.sheet.comp;
    // A warm-lit version of the panel to fade to as the flame catches.
    f.lit = makeCanvas(c.width, c.height);
    const g = f.lit.getContext('2d');
    g.drawImage(c, 0, 0);
    g.globalCompositeOperation = 'source-atop';
    const gr = g.createRadialGradient(c.width / 2, c.height * 0.85, 0, c.width / 2, c.height * 0.7, c.height * 0.9);
    gr.addColorStop(0, 'rgba(255,220,120,0.75)');
    gr.addColorStop(0.6, 'rgba(255,150,60,0.45)');
    gr.addColorStop(1, 'rgba(230,90,40,0.35)');
    g.fillStyle = gr; g.fillRect(0, 0, c.width, c.height);
  }

  carry(f) {
    const lit = Math.min(1, f.t / LIGHT);
    f.lit01 = lit;
    if (f.t < LIGHT) {
      f.x = f.from.x; f.y = f.from.y - easeInOut(lit) * 10; f.s = 1; f.a = 0;
      return true;
    }
    const t = f.t - LIGHT, q = t / RISE;
    f.s = 1 / (1 + t * 0.9);
    f.y = f.from.y - 10 - (f.from.y + 40) * (1 - Math.pow(1 - q, 1.6));
    f.x = f.from.x + f.drift * q + Math.sin(t * 0.9 + f.seed) * 18 * (1 - q);
    f.a = Math.sin(t * 1.2 + f.seed) * 0.06;
    f.alpha = q > 0.8 ? (1 - q) / 0.2 : 1;
    return q < 1;
  }

  drawCarried(ctx, f) {
    const { w, h } = this.rect;
    this.compose(f.sheet);
    ctx.save();
    ctx.translate(f.x, f.y);
    ctx.rotate(f.a);
    ctx.scale(f.s, f.s);
    ctx.globalAlpha = f.alpha;
    // Halo.
    ctx.globalCompositeOperation = 'lighter';
    const flick = 0.85 + 0.15 * Math.sin(this.time * 9 + f.seed) * Math.sin(this.time * 5.3);
    const r = Math.max(w, h) * 0.9;
    const halo = ctx.createRadialGradient(0, h * 0.2, 0, 0, h * 0.1, r);
    halo.addColorStop(0, `rgba(255,170,70,${0.4 * f.lit01 * flick})`);
    halo.addColorStop(1, 'rgba(255,120,40,0)');
    ctx.fillStyle = halo;
    ctx.fillRect(-r, -r, r * 2, r * 2);
    ctx.globalCompositeOperation = 'source-over';
    ctx.drawImage(f.sheet.comp, -w / 2, -h / 2, w, h);
    ctx.globalAlpha = f.alpha * f.lit01 * flick;
    ctx.drawImage(f.lit, -w / 2, -h / 2, w, h);
    // Flame in the opening.
    ctx.globalAlpha = f.alpha * f.lit01;
    ctx.fillStyle = '#ffd25a';
    ctx.beginPath(); ctx.ellipse(0, h / 2 - 2, w * 0.05, h * 0.03 * flick, 0, 0, Math.PI * 2); ctx.fill();
    ctx.restore();
  }

  updateFx(dt) {
    return false;
  }

  drawBack(ctx) {
    // The far lanterns flicker only while something is moving (the loop rests otherwise).
    for (const l of this.far) {
      const k = 0.75 + 0.25 * Math.sin(this.time * 2 + l.ph);
      ctx.save();
      ctx.globalCompositeOperation = 'lighter';
      const g = ctx.createRadialGradient(l.x, l.y, 0, l.x, l.y, l.s * 4);
      g.addColorStop(0, `rgba(255,190,90,${0.5 * k})`);
      g.addColorStop(1, 'rgba(255,140,50,0)');
      ctx.fillStyle = g;
      ctx.fillRect(l.x - l.s * 4, l.y - l.s * 4, l.s * 8, l.s * 8);
      ctx.restore();
      ctx.fillStyle = `rgba(255,${200 + 30 * k | 0},120,1)`;
      ctx.beginPath(); ctx.ellipse(l.x, l.y, l.s * 0.45, l.s * 0.6, 0, 0, Math.PI * 2); ctx.fill();
    }
    // Reflections of rising lanterns in the lake.
    for (const f of this.carried) {
      if (!f.lit01) continue;
      const y = this.shore + (this.shore - f.y) * 0.08 + 30;
      if (y > this.H) continue;
      ctx.fillStyle = `rgba(255,190,90,${0.35 * f.lit01 * f.alpha})`;
      ctx.beginPath(); ctx.ellipse(f.x, Math.min(this.H - 10, y), 18 * f.s + 4, 3, 0, 0, Math.PI * 2); ctx.fill();
    }
  }
}

function lanternPath(g, w, h) {
  const top = w * 0.46, bot = w * 0.36, cx = w / 2;
  g.beginPath();
  g.moveTo(cx - top + 18, 2);
  g.quadraticCurveTo(cx, -6, cx + top - 18, 2);
  g.quadraticCurveTo(cx + top, 4, cx + top, 22);
  g.quadraticCurveTo(cx + top + 6, h * 0.5, cx + bot, h - 1);
  g.lineTo(cx - bot, h - 1);
  g.quadraticCurveTo(cx - top - 6, h * 0.5, cx - top, 22);
  g.quadraticCurveTo(cx - top, 4, cx - top + 18, 2);
  g.closePath();
}

// ------------------------------------------------------------------ painting
function paintNight(e) {
  const { W, H, dpr, shore } = e;
  const rand = mulberry32(27);
  const c = makeCanvas(W * dpr, H * dpr), g = c.getContext('2d');
  g.scale(dpr, dpr);
  const sky = g.createLinearGradient(0, 0, 0, shore);
  sky.addColorStop(0, '#0d1236');
  sky.addColorStop(0.65, '#2a2a5e');
  sky.addColorStop(1, '#5b4675');
  g.fillStyle = sky; g.fillRect(0, 0, W, H);
  for (let i = 0; i < (W * shore) / 1800; i++) {
    const a = rand();
    g.fillStyle = `rgba(255,250,235,${0.25 + a * 0.6})`;
    g.beginPath(); g.arc(rand() * W, rand() * shore * 0.85, a > 0.92 ? 1.5 : 0.8, 0, Math.PI * 2); g.fill();
  }
  // Full moon with a soft halo.
  const mx = W * 0.18, my = H * 0.1, mr = Math.min(W, H) * 0.05;
  const halo = g.createRadialGradient(mx, my, mr, mx, my, mr * 4);
  halo.addColorStop(0, 'rgba(255,245,210,0.25)');
  halo.addColorStop(1, 'rgba(255,245,210,0)');
  g.fillStyle = halo; g.fillRect(mx - mr * 4, my - mr * 4, mr * 8, mr * 8);
  g.fillStyle = '#fbf1cf';
  g.beginPath(); g.arc(mx, my, mr, 0, Math.PI * 2); g.fill();
  g.fillStyle = 'rgba(220,205,160,0.5)';
  g.beginPath(); g.arc(mx - mr * 0.3, my - mr * 0.2, mr * 0.18, 0, Math.PI * 2); g.fill();
  g.beginPath(); g.arc(mx + mr * 0.25, my + mr * 0.3, mr * 0.12, 0, Math.PI * 2); g.fill();
  // Far hills.
  g.fillStyle = '#231d44';
  g.beginPath(); g.moveTo(0, shore);
  for (let x = 0; x <= W + 8; x += 8) g.lineTo(x, shore - 26 - Math.sin(x / W * 4 + 1) * 18 - Math.sin(x / W * 11) * 6);
  g.lineTo(W, shore); g.fill();
  // Lake with the moon's reflection.
  const lake = g.createLinearGradient(0, shore, 0, H);
  lake.addColorStop(0, '#2b2a5a');
  lake.addColorStop(1, '#141634');
  g.fillStyle = lake; g.fillRect(0, shore, W, H - shore);
  g.strokeStyle = 'rgba(255,240,200,0.35)'; g.lineWidth = 2; g.lineCap = 'round';
  for (let i = 0; i < 9; i++) {
    const y = shore + 8 + i * ((H - shore) / 10), ww = mr * (1.4 - i * 0.08) * (0.6 + rand() * 0.6);
    g.beginPath(); g.moveTo(mx - ww, y); g.lineTo(mx + ww, y); g.stroke();
  }
  // Reeds on the shore.
  g.strokeStyle = '#141230'; g.lineWidth = 2;
  for (let i = 0; i < W / 30; i++) {
    const x = rand() * W;
    if (x > W * 0.25 && x < W * 0.75) continue;
    for (let k = 0; k < 3; k++) { g.beginPath(); g.moveTo(x + k * 3, shore + 4); g.quadraticCurveTo(x + k * 3 + 3, shore - 12, x + k * 5, shore - 22 - rand() * 12); g.stroke(); }
  }
  return c;
}
