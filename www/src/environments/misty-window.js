// Misty window: a Reveal environment.
//   Look:   a window misted over from the inside. There's a view out there somewhere.
//   Reveal: wipe with a fingertip (or your sleeve) and the view is sharp where you've wiped.
//           A wiped line beads at its end and a drip runs down the glass. The ink picker
//           chooses the view: mountains at dawn, city lights, or the seaside at sunset.
//   Clear:  "Mist over" breathes the glass white again. (The mist never comes back on its
//           own: that's Breath on glass, in Fade.)

import { mulberry32 } from '../lib/util.js';
import { stageCanvas, blob, mottle } from '../lib/fade.js';
import { RevealScene } from '../lib/reveal.js';

const PALETTE = [
  { name: 'Mountains', color: '#9cc4e4' },
  { name: 'City lights', color: '#f4c95d' },
  { name: 'Seaside', color: '#f28b66' },
];

export const mistyWindow = {
  id: 'misty-window',
  name: 'Misty window',
  mode: 'reveal',
  blurb: 'Wipe the mist away to see the view',
  surface: 'Misted window with a view behind it',
  clearLabel: 'Mist over',
  clearIcon: 'M4 9h10a3 3 0 1 0-3-3M4 13h14a3 3 0 1 1-3 3M4 17h7',
  palette: PALETTE,
  create: () => new MistyWindow(),
};

class MistyWindow extends RevealScene {
  constructor() {
    super({ ink: PALETTE[0].color, brush: 12, soft: 0.55, deal: 'fade', cue: 'breath', revealCaption: 'Wipe the mist off to see the view', freshCaption: '…then mist it over again' });
    this.cueOpts = { big: true };
    this.drips = [];
    this.rand = mulberry32(77);
  }

  setup() { this.drips = []; }

  paintUnder() {
    const { W, H, dpr } = this;
    const { c, g } = stageCanvas(W, H, dpr);
    const view = PALETTE.findIndex((p) => p.color === this.ink);
    [mountains, city, seaside][Math.max(0, view)](g, W, H);
    return c;
  }

  // Mist: nearly opaque, a touch uneven, beaded here and there.
  paintCover(g) {
    const { W, H } = this, rand = mulberry32(14);
    const gr = g.createLinearGradient(0, 0, 0, H);
    gr.addColorStop(0, 'rgba(214,222,228,0.9)');
    gr.addColorStop(1, 'rgba(196,206,214,0.92)');
    g.fillStyle = gr; g.fillRect(0, 0, W, H);
    mottle(g, W, H, rand, { light: 40, dark: 26, scale: 6 });
    for (let k = 0; k < (W * H) / 3200; k++) {
      const x = rand() * W, y = rand() * H, r = 0.6 + rand() * rand() * 2.4;
      g.fillStyle = 'rgba(120,135,150,0.22)';
      g.beginPath(); g.arc(x, y + r * 0.3, r, 0, Math.PI * 2); g.fill();
      g.fillStyle = 'rgba(255,255,255,0.55)';
      g.beginPath(); g.arc(x - r * 0.3, y - r * 0.3, r * 0.45, 0, Math.PI * 2); g.fill();
    }
  }

  // Lift your finger and the water it gathered runs down from where the line ended.
  lifted(s) {
    if (this.calm || this.drips.length > 10 || this.rand() < 0.35) return;
    const r = Math.max(1.2, Math.min(3, s.r * 0.16));
    this.drips.push({ x: s.x + (this.rand() - 0.5) * s.r * 0.6, y: s.y + s.r * 0.5, r, left: 30 + this.rand() * 110, v: 26 + this.rand() * 30 });
  }

  tick(dt) {
    if (!this.drips.length) return false;
    for (const d of this.drips) {
      const step = Math.min(d.left, d.v * dt);
      const nx = d.x + (this.rand() - 0.5) * 0.8, ny = d.y + step;
      const g = this.cover.g;
      g.save();
      g.globalCompositeOperation = 'destination-out';
      g.globalAlpha = 0.85;
      g.lineWidth = d.r * 2;
      g.beginPath(); g.moveTo(d.x, d.y); g.lineTo(nx, ny); g.stroke();
      g.restore();
      d.x = nx; d.y = ny; d.left -= step;
      d.v = Math.max(8, d.v - 10 * dt); // it slows as it runs out of water
    }
    this.drips = this.drips.filter((d) => d.left > 0);
    return true;
  }

  // The bead at the foot of each drip.
  drawFront(ctx) {
    for (const d of this.drips) {
      ctx.fillStyle = 'rgba(255,255,255,0.75)';
      ctx.beginPath(); ctx.arc(d.x, d.y, d.r * 1.25, 0, Math.PI * 2); ctx.fill();
    }
  }

  clear() { this.drips = []; super.clear(); }
}

// ------------------------------------------------------------------ the views

// A jagged ridge line from one side of the picture to the other, filled down to the bottom.
function ridge(g, W, H, rand, y, rough, col) {
  g.fillStyle = col;
  g.beginPath(); g.moveTo(-4, H + 4); g.lineTo(-4, y);
  let yy = y;
  for (let x = 0; x <= W + 12; x += 10 + rand() * 16) {
    yy += (rand() - 0.5) * rough;
    yy += (y - yy) * 0.12;
    g.lineTo(x, yy);
  }
  g.lineTo(W + 4, H + 4); g.closePath(); g.fill();
}

function mountains(g, W, H) {
  const rand = mulberry32(101);
  const sky = g.createLinearGradient(0, 0, 0, H * 0.7);
  sky.addColorStop(0, '#5f8fd0');
  sky.addColorStop(0.6, '#f4c9a8');
  sky.addColorStop(1, '#ffe9c4');
  g.fillStyle = sky; g.fillRect(0, 0, W, H);
  blob(g, W * 0.66, H * 0.36, W * 0.5, W * 0.5, 'rgba(255,240,200,0.6)');
  g.fillStyle = '#fff6dc';
  g.beginPath(); g.arc(W * 0.66, H * 0.36, Math.min(W, H) * 0.055, 0, Math.PI * 2); g.fill();
  // A snow-capped peak, then ridges coming nearer and darker.
  g.fillStyle = '#8fa6c8';
  g.beginPath(); g.moveTo(W * 0.02, H * 0.62); g.lineTo(W * 0.34, H * 0.2); g.lineTo(W * 0.52, H * 0.44); g.lineTo(W * 0.7, H * 0.62); g.closePath(); g.fill();
  g.fillStyle = '#f7fbff';
  g.beginPath(); g.moveTo(W * 0.34, H * 0.2); g.lineTo(W * 0.25, H * 0.32); g.lineTo(W * 0.31, H * 0.3); g.lineTo(W * 0.35, H * 0.35); g.lineTo(W * 0.4, H * 0.3); g.lineTo(W * 0.44, H * 0.33); g.closePath(); g.fill();
  ridge(g, W, H, rand, H * 0.52, 26, '#7d95b8');
  ridge(g, W, H, rand, H * 0.6, 22, '#5d7898');
  ridge(g, W, H, rand, H * 0.68, 18, '#3f5a6e');
  // Pines along the nearest slope.
  ridge(g, W, H, rand, H * 0.78, 10, '#1f3a36');
  g.fillStyle = '#17302c';
  for (let x = -6; x < W + 6; x += 9 + rand() * 12) {
    const base = H * (0.78 + rand() * 0.02), h = H * (0.05 + rand() * 0.07), w = h * 0.34;
    g.beginPath(); g.moveTo(x, base - h); g.lineTo(x - w, base + 4); g.lineTo(x + w, base + 4); g.closePath(); g.fill();
  }
  const lake = g.createLinearGradient(0, H * 0.86, 0, H);
  lake.addColorStop(0, '#9fc3dc');
  lake.addColorStop(1, '#4f7ea6');
  g.fillStyle = lake; g.fillRect(0, H * 0.87, W, H * 0.13);
  for (let k = 0; k < 16; k++) {
    g.fillStyle = `rgba(255,255,255,${0.15 + rand() * 0.25})`;
    g.fillRect(rand() * W, H * (0.88 + rand() * 0.11), 14 + rand() * 40, 1.2);
  }
}

function city(g, W, H) {
  const rand = mulberry32(202);
  const sky = g.createLinearGradient(0, 0, 0, H);
  sky.addColorStop(0, '#0a1030');
  sky.addColorStop(0.6, '#2b2a5e');
  sky.addColorStop(1, '#6b3f70');
  g.fillStyle = sky; g.fillRect(0, 0, W, H);
  for (let k = 0; k < (W * H) / 3000; k++) {
    g.fillStyle = `rgba(255,255,255,${0.2 + rand() * 0.6})`;
    g.beginPath(); g.arc(rand() * W, rand() * H * 0.5, 0.4 + rand() * 0.8, 0, Math.PI * 2); g.fill();
  }
  const mr = Math.min(W, H) * 0.06;
  blob(g, W * 0.26, H * 0.17, mr * 4, mr * 4, 'rgba(230,235,255,0.22)');
  g.fillStyle = '#f3f1e2';
  g.beginPath(); g.arc(W * 0.26, H * 0.17, mr, 0, Math.PI * 2); g.fill();
  // Two rows of towers; the nearer row darker, both with lit windows.
  for (const [top, shade, lit] of [[0.42, '#232a52', 0.4], [0.56, '#11142c', 0.55]]) {
    for (let x = -10; x < W;) {
      const w = 26 + rand() * 46, h = H * (0.1 + rand() * (1 - top - 0.1) * 0.9), y = H * top + (H * (1 - top) - h) * 0.25 * rand();
      g.fillStyle = shade;
      g.fillRect(x, y, w, H - y);
      const cols = Math.max(2, Math.floor(w / 9)), cw = w / cols;
      for (let cy = y + 6; cy < H - 4; cy += 9) {
        for (let k = 0; k < cols; k++) {
          if (rand() > lit) continue;
          g.fillStyle = rand() > 0.2 ? `rgba(255,214,120,${0.55 + rand() * 0.45})` : 'rgba(170,220,255,0.8)';
          g.fillRect(x + k * cw + cw * 0.25, cy, cw * 0.5, 4.5);
        }
      }
      x += w + 2 + rand() * 6;
    }
  }
  blob(g, W * 0.5, H, W * 0.9, H * 0.25, 'rgba(255,170,110,0.25)');
}

function seaside(g, W, H) {
  const rand = mulberry32(303);
  const hz = H * 0.6;
  const sky = g.createLinearGradient(0, 0, 0, hz);
  sky.addColorStop(0, '#35508f');
  sky.addColorStop(0.55, '#d9776a');
  sky.addColorStop(1, '#ffd28a');
  g.fillStyle = sky; g.fillRect(0, 0, W, hz);
  const sx = W * 0.62, sr = Math.min(W, H) * 0.085;
  blob(g, sx, hz, W * 0.7, H * 0.26, 'rgba(255,220,150,0.5)');
  g.fillStyle = '#fff1c2';
  g.beginPath(); g.arc(sx, hz - sr * 0.2, sr, Math.PI, 0); g.fill();
  const sea = g.createLinearGradient(0, hz, 0, H);
  sea.addColorStop(0, '#e9a26a');
  sea.addColorStop(0.25, '#5a7fae');
  sea.addColorStop(1, '#1d3558');
  g.fillStyle = sea; g.fillRect(0, hz, W, H - hz);
  // The sun's road on the water.
  for (let k = 0; k < 46; k++) {
    const t = rand(), y = hz + 2 + t * (H - hz) * 0.9, w = (6 + rand() * 30) * (0.4 + t);
    g.fillStyle = `rgba(255,236,180,${0.5 * (1 - t * 0.7)})`;
    g.fillRect(sx - w / 2 + (rand() - 0.5) * 40 * t, y, w, 1.6);
  }
  // A headland with a lighthouse.
  g.fillStyle = '#1a2233';
  g.beginPath(); g.moveTo(-4, H * 0.7); g.quadraticCurveTo(W * 0.16, H * 0.5, W * 0.34, hz + 6); g.lineTo(W * 0.4, H * 0.72); g.lineTo(-4, H * 0.8); g.closePath(); g.fill();
  const lx = W * 0.17, lw = Math.max(9, W * 0.032), ltop = H * 0.4, lbase = H * 0.58;
  g.fillStyle = '#f2ede2';
  g.beginPath(); g.moveTo(lx - lw, lbase); g.lineTo(lx - lw * 0.6, ltop); g.lineTo(lx + lw * 0.6, ltop); g.lineTo(lx + lw, lbase); g.closePath(); g.fill();
  g.fillStyle = '#c8433c';
  g.fillRect(lx - lw * 0.82, ltop + (lbase - ltop) * 0.36, lw * 1.64, (lbase - ltop) * 0.2);
  g.fillStyle = '#1a2233';
  g.fillRect(lx - lw * 0.8, ltop - 4, lw * 1.6, 4);
  g.fillStyle = '#ffe9a0';
  g.fillRect(lx - lw * 0.42, ltop - 14, lw * 0.84, 10);
  g.fillStyle = '#1a2233';
  g.beginPath(); g.moveTo(lx - lw * 0.6, ltop - 14); g.lineTo(lx, ltop - 22); g.lineTo(lx + lw * 0.6, ltop - 14); g.closePath(); g.fill();
  const beam = g.createLinearGradient(lx, 0, W, 0);
  beam.addColorStop(0, 'rgba(255,240,180,0.5)');
  beam.addColorStop(1, 'rgba(255,240,180,0)');
  g.fillStyle = beam;
  g.beginPath(); g.moveTo(lx, ltop - 9); g.lineTo(W, ltop - H * 0.16); g.lineTo(W, ltop - H * 0.04); g.closePath(); g.fill();
  // Gulls.
  g.strokeStyle = 'rgba(20,26,40,0.8)'; g.lineWidth = 1.4; g.lineCap = 'round';
  for (let k = 0; k < 5; k++) {
    const x = W * (0.35 + rand() * 0.6), y = H * (0.12 + rand() * 0.25), s = 5 + rand() * 6;
    g.beginPath(); g.moveTo(x - s, y); g.quadraticCurveTo(x - s * 0.4, y - s * 0.7, x, y); g.quadraticCurveTo(x + s * 0.4, y - s * 0.7, x + s, y); g.stroke();
  }
}
