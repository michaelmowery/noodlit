// Dandelion: a Release environment.
//   Look:  ink on a big white dandelion clock, standing in a meadow at golden hour.
//   Decay: none. Nothing fades while you draw.
//   Clear: drag the handle up (or tap "Blow"). A breath of wind takes the seeds, each one
//          carrying its own little piece of your drawing off across the meadow on a tiny
//          parachute. A new flower opens on the stem.

import { clamp, easeInOut, mulberry32, makeCanvas } from '../lib/util.js';
import { ReleaseScene, fitRect, paintPaper } from '../lib/release.js';
import { sfx } from '../lib/sound.js';

const PALETTE = [
  { name: 'Charcoal', color: '#2e2a33' },
  { name: 'Twilight', color: '#2f4a8a' },
  { name: 'Moss', color: '#3f6a2a' },
  { name: 'Plum', color: '#6b2a5e' },
  { name: 'Rust', color: '#a5481e' },
  { name: 'Teal', color: '#1f6b6b' },
];

const SEED = 15;     // size of each seed's piece of the drawing, CSS px

export const dandelion = {
  id: 'dandelion',
  name: 'Dandelion',
  blurb: 'Make a wish and blow the seeds away',
  clearLabel: 'Blow',
  clearIcon: 'M12 22V12M12 12a5 5 0 1 0 0-10 5 5 0 0 0 0 10zM17 6l3-2M18 10l3 0M16 13l3 2',
  surface: 'A dandelion seed head to draw on. Drag the handle up to blow the seeds away.',
  fades: false,
  palette: PALETTE,
  create: () => new Dandelion(),
};

class Dandelion extends ReleaseScene {
  constructor() {
    super(71);
    this.ink = PALETTE[0].color;
    this.handleSide = 'top';
    this.arriveFrom = { x: 0, y: 14 };
    this.washUpAt = 2.2;
    this.washUp = 1.1;
    this.grain = 0.4;
  }

  layout() {
    const { W, H } = this;
    this.ground = H - clamp(H * 0.16, 100, 150);
    const top = clamp(H * 0.1, 64, 110);
    const size = Math.min(W - 48, (this.ground - top) * 0.72);
    return fitRect(24, top, W - 48, size, 1);
  }

  textArea() {
    const { w, h } = this.rect;
    return { x: w * 0.18, y: h * 0.2, w: w * 0.64, h: h * 0.6 };
  }

  paintScene() { return paintMeadow(this); }

  paintSheet(w, h, dpr, seed) {
    return paintPaper(w, h, dpr, seed, (g, w, h, rand) => {
      const cx = w / 2, cy = h / 2, r = w / 2;
      const base = g.createRadialGradient(cx, cy, 0, cx, cy, r);
      base.addColorStop(0, '#fffdf6');
      base.addColorStop(0.75, '#f6f3ea');
      base.addColorStop(1, 'rgba(240,238,230,0.75)');
      g.fillStyle = base; g.fillRect(0, 0, w, h);
      // Filaments radiating from the centre, and the fluffy tips.
      g.strokeStyle = 'rgba(170,165,150,0.22)'; g.lineWidth = 0.6;
      for (let i = 0; i < 260; i++) {
        const a = rand() * Math.PI * 2, l = r * (0.7 + rand() * 0.3);
        g.beginPath(); g.moveTo(cx + Math.cos(a) * r * 0.12, cy + Math.sin(a) * r * 0.12); g.lineTo(cx + Math.cos(a) * l, cy + Math.sin(a) * l); g.stroke();
      }
      for (let i = 0; i < 140; i++) {
        const a = rand() * Math.PI * 2, l = r * (0.86 + rand() * 0.12);
        g.fillStyle = 'rgba(255,255,255,0.9)';
        g.beginPath(); g.arc(cx + Math.cos(a) * l, cy + Math.sin(a) * l, 2 + rand() * 3, 0, Math.PI * 2); g.fill();
      }
      g.fillStyle = 'rgba(150,120,70,0.35)';
      g.beginPath(); g.arc(cx, cy, r * 0.08, 0, Math.PI * 2); g.fill();
    }, (g, w, h, rand) => {
      const cx = w / 2, cy = h / 2, r = w / 2 - 2;
      g.beginPath();
      for (let i = 0; i <= 90; i++) {
        const a = (i / 90) * Math.PI * 2, k = r * (0.95 + rand() * 0.05);
        i ? g.lineTo(cx + Math.cos(a) * k, cy + Math.sin(a) * k) : g.moveTo(cx + Math.cos(a) * k, cy + Math.sin(a) * k);
      }
      g.closePath();
    });
  }

  launch(f) {
    sfx.cue('blow');
    const { w, h } = this.rect;
    const r = w / 2;
    f.seeds = [];
    const dpr = this.dpr;
    for (let y = SEED / 2; y < h; y += SEED) {
      for (let x = SEED / 2; x < w; x += SEED) {
        const dx = x - r, dy = y - r;
        if (dx * dx + dy * dy > (r - 2) * (r - 2)) continue;
        f.seeds.push({
          sx: x - SEED / 2, sy: y - SEED / 2,
          x: f.from.x + dx, y: f.from.y + dy,
          // Blown from the left: that side lets go first.
          delay: (x / w) * 0.5 + Math.random() * 0.5,
          vx: 70 + Math.random() * 110, vy: -25 - Math.random() * 70,
          spin: (Math.random() - 0.5) * 2, a: 0, ph: Math.random() * 6,
        });
      }
    }
    f.dpr = dpr;
  }

  carry(f, dt) {
    let any = false;
    for (const s of f.seeds) {
      if (f.t < s.delay) { any = true; continue; }
      const t = f.t - s.delay;
      s.x += s.vx * dt;
      s.y += (s.vy + Math.sin(t * 2.4 + s.ph) * 22) * dt;
      s.vx *= 1 - dt * 0.15;
      s.a += s.spin * dt;
      s.alpha = t < 4 ? 1 : Math.max(0, 1 - (t - 4) / 1.5);
      if (s.alpha > 0 && s.x < this.W + 40 && s.y > -40) any = true;
    }
    return any;
  }

  drawCarried(ctx, f) {
    const comp = f.sheet.comp, d = f.dpr;
    for (const s of f.seeds) {
      if (s.alpha === 0) continue;
      const loose = f.t > s.delay;
      ctx.save();
      ctx.globalAlpha = s.alpha ?? 1;
      ctx.translate(s.x, s.y);
      if (loose) {
        ctx.rotate(s.a);
        // A tiny parachute: a stalk and a puff of fluff.
        ctx.strokeStyle = 'rgba(255,255,255,0.85)'; ctx.lineWidth = 0.8;
        ctx.beginPath(); ctx.moveTo(0, 0); ctx.lineTo(0, -SEED * 0.9); ctx.stroke();
        for (let k = -3; k <= 3; k++) {
          ctx.beginPath(); ctx.moveTo(0, -SEED * 0.9); ctx.lineTo(k * 2.2, -SEED * 1.3 + Math.abs(k) * 0.6); ctx.stroke();
        }
        ctx.fillStyle = '#7a5a30';
        ctx.beginPath(); ctx.ellipse(0, 1, 1.2, 2.4, 0, 0, Math.PI * 2); ctx.fill();
      }
      ctx.drawImage(comp, s.sx * d, s.sy * d, SEED * d, SEED * d, -SEED / 2, -SEED / 2, SEED, SEED);
      ctx.restore();
    }
  }

  drawBack(ctx) {
    // The stem; a bare green head when the seeds have gone.
    const r = this.rect, s = this.sheet;
    const cx = r.x + r.w / 2 + (s ? s.offX : 0), cy = r.y + r.h / 2 + (s ? s.offY : 0);
    ctx.strokeStyle = '#5f8a3a';
    ctx.lineWidth = 6;
    ctx.lineCap = 'round';
    ctx.beginPath(); ctx.moveTo(this.W * 0.5 + 8, this.H + 10); ctx.quadraticCurveTo(this.W * 0.5 - 20, (cy + this.H) / 2, cx, cy); ctx.stroke();
    ctx.fillStyle = '#6e9a43';
    ctx.beginPath(); ctx.arc(cx, cy + 4, 12, 0, Math.PI * 2); ctx.fill();
  }
}

function paintMeadow(e) {
  const { W, H, dpr, ground } = e;
  const rand = mulberry32(5);
  const c = makeCanvas(W * dpr, H * dpr), g = c.getContext('2d');
  g.scale(dpr, dpr);
  const sky = g.createLinearGradient(0, 0, 0, ground);
  sky.addColorStop(0, '#f7c98a');
  sky.addColorStop(0.6, '#fbe0b0');
  sky.addColorStop(1, '#fff1d0');
  g.fillStyle = sky; g.fillRect(0, 0, W, H);
  // Low sun.
  const sx = W * 0.82, sy = ground - 40;
  const halo = g.createRadialGradient(sx, sy, 0, sx, sy, Math.max(W, H) * 0.6);
  halo.addColorStop(0, 'rgba(255,240,200,0.9)');
  halo.addColorStop(0.15, 'rgba(255,220,150,0.45)');
  halo.addColorStop(1, 'rgba(255,200,120,0)');
  g.fillStyle = halo; g.fillRect(0, 0, W, H);
  // Distant hills and the meadow.
  g.fillStyle = '#c9b77a';
  g.beginPath(); g.moveTo(0, ground);
  for (let x = 0; x <= W + 10; x += 10) g.lineTo(x, ground - 30 - Math.sin(x / W * 3) * 14);
  g.lineTo(W, ground); g.fill();
  const field = g.createLinearGradient(0, ground - 20, 0, H);
  field.addColorStop(0, '#a7a656');
  field.addColorStop(1, '#5d7a32');
  g.fillStyle = field; g.fillRect(0, ground - 20, W, H);
  // Grass blades catching the light, and a few more dandelion clocks far off.
  for (let i = 0; i < W * 1.4; i++) {
    const x = rand() * W, y = ground - 10 + rand() * (H - ground + 10), h = 8 + rand() * 22;
    g.strokeStyle = rand() < 0.3 ? 'rgba(240,220,140,0.6)' : 'rgba(70,95,35,0.6)';
    g.lineWidth = 1.2;
    g.beginPath(); g.moveTo(x, y); g.quadraticCurveTo(x + 2, y - h / 2, x + (rand() - 0.5) * 8, y - h); g.stroke();
  }
  for (let i = 0; i < 6; i++) {
    const x = rand() * W, y = ground - 5 + rand() * 30, r = 4 + rand() * 4;
    g.strokeStyle = 'rgba(80,110,40,0.7)'; g.lineWidth = 1;
    g.beginPath(); g.moveTo(x, y); g.lineTo(x, y + 20); g.stroke();
    g.fillStyle = 'rgba(255,252,240,0.85)';
    g.beginPath(); g.arc(x, y, r, 0, Math.PI * 2); g.fill();
  }
  return c;
}
