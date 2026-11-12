// Rocket: a Release environment.
//   Look:  marker on the side of a little storybook rocket standing on its launch pad at
//          dusk, with a gantry tower beside it.
//   Decay: none. Nothing fades while you draw.
//   Clear: drag the handle up (or tap "Launch"). The engine lights, smoke billows across the
//          pad, and the rocket lifts off, slowly at first, then streaks up out of sight.
//          The next rocket rolls out onto the pad.

import { clamp, mulberry32, makeCanvas } from '../lib/util.js';
import { ReleaseScene, paintPaper } from '../lib/release.js';
import { sfx } from '../lib/sound.js';

const PALETTE = [
  { name: 'Black', color: '#1b1c22' },
  { name: 'Mission blue', color: '#1d3f9a' },
  { name: 'Red', color: '#c3261d' },
  { name: 'Orange', color: '#d9621a' },
  { name: 'Green', color: '#22693c' },
  { name: 'Purple', color: '#5a2a91' },
];

const IGNITE = 1.2;

export const rocket = {
  id: 'rocket',
  name: 'Rocket',
  blurb: 'Blast it off into space',
  clearLabel: 'Launch',
  clearIcon: 'M12 2c3 2 4.5 6 4.5 10L15 17H9l-1.5-5C7.5 8 9 4 12 2zM9 17l-2.5 3M15 17l2.5 3M12 9.5v.01',
  surface: 'A rocket on a launch pad to draw on. Drag the handle up to launch it.',
  fades: false,
  palette: PALETTE,
  create: () => new Rocket(),
};

class Rocket extends ReleaseScene {
  constructor() {
    super(81);
    this.ink = PALETTE[0].color;
    this.handleSide = 'top';
    this.arriveFrom = { x: 0, y: 40 };
    this.washUpAt = 2.6;
    this.washUp = 1;
    this.grain = 0.3;
    this.smoke = [];
  }

  layout() {
    const { W, H } = this;
    this.pad = H - clamp(H * 0.15, 100, 140);
    const top = clamp(H * 0.09, 60, 100);
    let h = this.pad - top, w = h * 0.5;
    if (w > W * 0.62) { w = W * 0.62; h = w / 0.5; }
    return { x: (W - w) / 2, y: this.pad - h, w, h };
  }

  textArea() {
    const { w, h } = this.rect;
    return { x: w * 0.24, y: h * 0.3, w: w * 0.52, h: h * 0.42 };
  }

  paintScene() { return paintDusk(this); }

  paintSheet(w, h, dpr, seed) {
    const bw = w * 0.56, bx = (w - bw) / 2;
    return paintPaper(w, h, dpr, seed, (g) => {
      // Body.
      const body = g.createLinearGradient(bx, 0, bx + bw, 0);
      body.addColorStop(0, '#d9dde4'); body.addColorStop(0.35, '#ffffff'); body.addColorStop(1, '#c4c9d2');
      g.fillStyle = body; g.fillRect(0, 0, w, h);
      // Nose cone and fins in red.
      g.fillStyle = '#e04a3a';
      g.fillRect(0, 0, w, h * 0.2);
      g.fillRect(0, h * 0.8, w, h);
      g.fillStyle = 'rgba(255,255,255,0.25)';
      g.fillRect(bx + bw * 0.18, 0, bw * 0.12, h);
      // Panel seams and a porthole.
      g.strokeStyle = 'rgba(90,100,115,0.35)'; g.lineWidth = 1;
      for (const f of [0.28, 0.76]) { g.beginPath(); g.moveTo(0, h * f); g.lineTo(w, h * f); g.stroke(); }
      g.fillStyle = '#4b5d78';
      g.beginPath(); g.arc(w / 2, h * 0.24, bw * 0.12, 0, Math.PI * 2); g.fill();
      g.strokeStyle = '#9aa4b2'; g.lineWidth = 3; g.stroke();
      g.fillStyle = 'rgba(255,255,255,0.5)';
      g.beginPath(); g.arc(w / 2 - bw * 0.04, h * 0.23, bw * 0.04, 0, Math.PI * 2); g.fill();
    }, (g) => {
      g.beginPath();
      g.moveTo(w / 2, 1);
      g.bezierCurveTo(bx + bw * 1.05, h * 0.08, bx + bw, h * 0.2, bx + bw, h * 0.3);
      g.lineTo(bx + bw, h * 0.72);
      g.lineTo(w - 1, h * 0.92); g.lineTo(w - 1, h - 1); g.lineTo(bx + bw, h * 0.9);
      g.lineTo(bx, h * 0.9);
      g.lineTo(1, h - 1); g.lineTo(1, h * 0.92); g.lineTo(bx, h * 0.72);
      g.lineTo(bx, h * 0.3);
      g.bezierCurveTo(bx, h * 0.2, bx - bw * 0.05, h * 0.08, w / 2, 1);
      g.closePath();
    });
  }

  launch() { sfx.cue('launch'); }

  carry(f, dt) {
    const t = f.t;
    f.s = 1; f.alpha = 1;
    if (t < IGNITE) {
      // Rumbling on the pad.
      f.x = f.from.x + Math.sin(t * 70) * 1.5 * (t / IGNITE);
      f.y = f.from.y;
      f.a = 0;
    } else {
      const u = t - IGNITE;
      f.x = f.from.x + u * u * 4;
      f.y = f.from.y - 0.5 * this.H * 0.55 * u * u - 8 * u;
      f.a = u * 0.03;
    }
    // Exhaust smoke from the nozzle.
    const nozzleY = f.y + this.rect.h * 0.45;
    const n = t < IGNITE ? 3 : t < IGNITE + 1.2 ? 4 : 1;
    for (let i = 0; i < n && this.smoke.length < 260; i++) {
      const onPad = nozzleY > this.pad - this.rect.h * 0.12;
      this.smoke.push({
        x: f.x + (Math.random() - 0.5) * 14, y: Math.min(nozzleY, this.pad - 6),
        vx: onPad ? (Math.random() - 0.5) * 220 : (Math.random() - 0.5) * 30,
        vy: onPad ? -Math.random() * 30 : 40 + Math.random() * 30,
        r: 14 + Math.random() * 14, t: 0, life: 2.5 + Math.random() * 2,
      });
    }
    f.flame = t < IGNITE ? t / IGNITE : 1;
    return f.y > -this.rect.h;
  }

  drawCarried(ctx, f) {
    const { h } = this.rect;
    // Flame under the nozzle.
    const fl = 0.8 + 0.2 * Math.sin(this.time * 40);
    const len = h * (0.15 + 0.35 * f.flame) * fl;
    ctx.save();
    ctx.translate(f.x, f.y);
    ctx.rotate(f.a);
    const y0 = h * 0.43;
    const g = ctx.createLinearGradient(0, y0, 0, y0 + len);
    g.addColorStop(0, 'rgba(255,250,210,1)');
    g.addColorStop(0.4, 'rgba(255,170,60,0.95)');
    g.addColorStop(1, 'rgba(255,80,30,0)');
    ctx.fillStyle = g;
    const fw = this.rect.w * 0.16;
    ctx.beginPath(); ctx.moveTo(-fw, y0); ctx.quadraticCurveTo(0, y0 + len * 1.2, fw, y0); ctx.fill();
    ctx.restore();
    this.drawSheetAt(ctx, f.sheet, f.x, f.y, 1, f.a, 1, 0.25);
  }

  updateFx(dt) {
    for (const s of this.smoke) {
      s.t += dt;
      s.x += s.vx * dt; s.y += s.vy * dt;
      s.vx *= 1 - dt * 1.2; s.vy = s.vy * (1 - dt * 1.5) - 8 * dt;
      s.r += dt * 18;
    }
    this.smoke = this.smoke.filter((s) => s.t < s.life);
    return this.smoke.length > 0;
  }

  drawFront(ctx) {
    for (const s of this.smoke) {
      const k = 1 - s.t / s.life;
      const g = ctx.createRadialGradient(s.x, s.y, 0, s.x, s.y, s.r);
      g.addColorStop(0, `rgba(232,228,236,${0.55 * k})`);
      g.addColorStop(0.6, `rgba(215,210,222,${0.35 * k})`);
      g.addColorStop(1, 'rgba(215,210,222,0)');
      ctx.fillStyle = g;
      ctx.beginPath(); ctx.arc(s.x, s.y, s.r, 0, Math.PI * 2); ctx.fill();
    }
  }
}

function paintDusk(e) {
  const { W, H, dpr, pad } = e;
  const rand = mulberry32(17);
  const c = makeCanvas(W * dpr, H * dpr), g = c.getContext('2d');
  g.scale(dpr, dpr);
  const sky = g.createLinearGradient(0, 0, 0, pad);
  sky.addColorStop(0, '#1a1840');
  sky.addColorStop(0.55, '#5a3f7a');
  sky.addColorStop(0.85, '#e0807a');
  sky.addColorStop(1, '#f6b67a');
  g.fillStyle = sky; g.fillRect(0, 0, W, H);
  for (let i = 0; i < (W * pad) / 2600; i++) {
    g.fillStyle = `rgba(255,255,255,${0.2 + rand() * 0.6})`;
    g.beginPath(); g.arc(rand() * W, rand() * pad * 0.5, 0.5 + rand() * 0.8, 0, Math.PI * 2); g.fill();
  }
  // A crescent moon.
  g.fillStyle = '#fbefd0';
  g.beginPath(); g.arc(W * 0.82, H * 0.12, 16, 0, Math.PI * 2); g.fill();
  g.fillStyle = '#26214c';
  g.beginPath(); g.arc(W * 0.82 + 7, H * 0.12 - 4, 14, 0, Math.PI * 2); g.fill();
  // Far hills.
  g.fillStyle = '#3c2f55';
  g.beginPath(); g.moveTo(0, pad);
  for (let x = 0; x <= W + 10; x += 10) g.lineTo(x, pad - 30 - Math.sin(x / W * 5) * 14);
  g.lineTo(W, pad); g.fill();
  // Ground and the pad.
  g.fillStyle = '#2b2a3a';
  g.fillRect(0, pad, W, H);
  g.fillStyle = '#5c5e6e';
  g.fillRect(W * 0.2, pad - 6, W * 0.6, 10);
  g.fillStyle = '#ffd36a';
  for (let x = W * 0.22; x < W * 0.78; x += 26) g.fillRect(x, pad - 3, 12, 3);
  // Gantry tower.
  const tx = W / 2 - Math.min(W * 0.31, e.rect.w * 0.5) - 34, top = pad - e.rect.h * 0.85;
  g.strokeStyle = '#c45a3a'; g.lineWidth = 3;
  g.strokeRect(tx, top, 24, pad - top);
  g.lineWidth = 1.5;
  for (let y = top; y < pad - 20; y += 20) {
    g.beginPath(); g.moveTo(tx, y); g.lineTo(tx + 24, y + 20); g.moveTo(tx + 24, y); g.lineTo(tx, y + 20); g.stroke();
  }
  g.fillStyle = '#ff5a4a';
  g.beginPath(); g.arc(tx + 12, top - 4, 3, 0, Math.PI * 2); g.fill();
  return c;
}
