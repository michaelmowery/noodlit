// Paper airplane: a Release environment.
//   Look:  pencil on a page of lined notebook paper, up on a rooftop above a little town.
//   Decay: none. Nothing fades while you draw.
//   Clear: drag the handle to the right (or tap "Throw it"). The page folds into a paper
//          airplane with your drawing on its wings, gets thrown, does a loop-the-loop and
//          glides away over the rooftops. The pigeons scatter; a fresh page is torn out.

import { clamp, easeInOut, smoothstep, mulberry32, makeCanvas } from '../lib/util.js';
import { ReleaseScene, fitRect, paintPaper, tornOutline, paperFibres, cloud } from '../lib/release.js';
import { sfx } from '../lib/sound.js';

const FOLD = 0.8;
const FLY = 5.2;

// Inks that suit the material, default first.
const PALETTE = [
  { name: 'Pencil', color: '#2f3440' },
  { name: 'Ballpoint', color: '#1f3a8a' },
  { name: 'Black', color: '#151515' },
  { name: 'Red pen', color: '#b3261e' },
  { name: 'Green', color: '#2f6b3a' },
  { name: 'Purple', color: '#5b2a86' },
];

export const paperAirplane = {
  id: 'paper-airplane',
  name: 'Paper airplane',
  blurb: 'Fold it up and throw it',
  clearLabel: 'Throw it',
  clearIcon: 'M3 11l18-7-6 16-3.5-6.5L3 11zM11.5 13.5L21 4',
  surface: 'A notebook page to draw on. Drag the handle to the right to fold it into a paper airplane and throw it.',
  fades: false,
  palette: PALETTE,
  create: () => new PaperAirplane(),
};

class PaperAirplane extends ReleaseScene {
  constructor() {
    super(33);
    this.ink = PALETTE[0].color;
    this.handleSide = 'right';
    this.arriveFrom = { x: -40, y: 20 };
    this.washUpAt = 2.4;
    this.grain = 0.85;
    this.pigeons = [];
    this.trail = [];
  }

  layout() {
    const { W, H } = this;
    this.roof = H - clamp(H * 0.15, 110, 150);
    const top = clamp(H * 0.09, 56, 110);
    const bottom = this.roof + 10;
    return fitRect(20, top, W - 64, bottom - top, 0.77);
  }

  setup() {
    this.planeW = clamp(Math.min(this.W, this.H) * 0.28, 90, 160);
    // Two pigeons sit on the chimney.
    const y = this.roof - 58, cx = this.W - 46;
    this.pigeons = [0, 1].map((i) => ({ x: cx + 2 + i * 16, y, fly: -1, ph: i * 1.7 }));
  }

  paintScene() { return paintTown(this); }

  paintSheet(w, h, dpr, seed) {
    return paintPaper(w, h, dpr, seed, (g, w, h, rand) => {
      paperFibres(g, w, h, rand, '#fdfcf7', 'rgba(110,110,120,0.04)');
      g.strokeStyle = 'rgba(90,140,200,0.32)'; g.lineWidth = 1;
      for (let y = 46; y < h - 6; y += 24) { g.beginPath(); g.moveTo(0, y); g.lineTo(w, y); g.stroke(); }
      g.strokeStyle = 'rgba(220,90,90,0.45)';
      g.beginPath(); g.moveTo(44, 0); g.lineTo(44, h); g.stroke();
      // Binder holes along the torn-out edge.
      g.fillStyle = 'rgba(0,0,0,1)';
      g.globalCompositeOperation = 'destination-out';
      for (const f of [0.15, 0.5, 0.85]) { g.beginPath(); g.arc(18, h * f, 6, 0, Math.PI * 2); g.fill(); }
      g.globalCompositeOperation = 'source-over';
    }, tornOutline(0.8, 1));
  }

  launch(f) {
    sfx.cue('fold');
    const { w } = this.rect;
    f.foldAt = { x: this.rect.x + this.rect.w * 0.55, y: this.rect.y + this.rect.h * 0.45 };
    f.foldScale = (this.planeW * 0.9) / w;
    f.plane = makePlaneArt(f.sheet.comp, this.rect, this.dpr);
    f.heading = -0.2;
    for (const p of this.pigeons) p.fly = 0;
    this.trail = [];
  }

  // Thrown right, climbs into a loop-the-loop, then glides off to the upper right.
  flightPos(t) {
    const { W, H } = this;
    const sx = this.rect.x + this.rect.w * 0.55, sy = this.rect.y + this.rect.h * 0.45;
    const V = (W * 0.6) / FLY + 30;
    const R = clamp(Math.min(W, H) * 0.16, 50, 110);
    const phi = Math.PI * 2 * smoothstep(0.4, 2.0, t);
    const after = Math.max(0, t - 2.0);    // past the loop it picks up speed and climbs away
    return {
      x: sx + V * t * 0.8 + R * Math.sin(phi) + 240 * Math.pow(after, 1.3),
      y: sy - 26 * t - R * (1 - Math.cos(phi)) - 60 * after + Math.sin(t * 2) * 8,
    };
  }

  carry(f) {
    if (f.t < FOLD) {
      const p = easeInOut(f.t / FOLD);
      f.x = f.from.x + (f.foldAt.x - f.from.x) * p;
      f.y = f.from.y + (f.foldAt.y - f.from.y) * p;
      f.s = 1 + (f.foldScale - 1) * p;
      f.fold = smoothstep(0.4, 0.95, p);
      f.a = p * -0.15;
      f.k = 1;
      return true;
    }
    f.fold = 1;
    const t = f.t - FOLD;
    const p = this.flightPos(t), p2 = this.flightPos(t + 0.02);
    f.x = p.x; f.y = p.y;
    f.heading = Math.atan2(p2.y - p.y, p2.x - p.x);
    f.k = 1 - 0.45 * (t / FLY);
    if (this.trail.length === 0 || Math.hypot(this.trail[this.trail.length - 1].x - f.x, this.trail[this.trail.length - 1].y - f.y) > 8) this.trail.push({ x: f.x, y: f.y, t: this.time });
    return t < FLY && f.x < this.W + this.planeW && f.y > -this.planeW;
  }

  drawCarried(ctx, f) {
    if (f.fold < 1) this.drawSheetAt(ctx, f.sheet, f.x, f.y, f.s, f.a, 1 - f.fold, 0.25);
    if (f.fold <= 0) return;
    const pw = this.planeW * f.k;
    ctx.save();
    ctx.globalAlpha = f.fold;
    ctx.translate(f.x, f.y);
    ctx.rotate(f.heading);
    ctx.shadowColor = 'rgba(30,50,80,0.25)';
    ctx.shadowBlur = 8;
    ctx.shadowOffsetY = 10;
    ctx.drawImage(f.plane, -pw / 2, -pw * 0.3, pw, pw * 0.6);
    ctx.restore();
  }

  updateFx(dt) {
    let active = false;
    for (const p of this.pigeons) if (p.fly >= 0) { p.fly += dt; active = true; if (p.fly > 6.5) p.fly = -1; }
    this.trail = this.trail.filter((d) => this.time - d.t < 1.2);
    if (this.trail.length) active = true;
    return active;
  }

  drawBack(ctx) {
    // A faint swoosh behind the plane.
    ctx.save();
    ctx.lineCap = 'round';
    for (let i = 1; i < this.trail.length; i++) {
      const a = this.trail[i - 1], b = this.trail[i];
      const k = 1 - (this.time - b.t) / 1.2;
      ctx.strokeStyle = `rgba(255,255,255,${0.6 * k})`;
      ctx.lineWidth = 2.5 * k;
      ctx.beginPath(); ctx.moveTo(a.x, a.y); ctx.lineTo(b.x, b.y); ctx.stroke();
    }
    ctx.restore();
  }

  drawFront(ctx) {
    for (const p of this.pigeons) {
      if (p.fly < 0) { pigeon(ctx, p.x, p.y, 0, true); continue; }
      const t = p.fly;
      const out = Math.min(1, t / 2.5), back = Math.max(0, (t - 4) / 2.5);
      const k = out - back;
      pigeon(ctx, p.x + k * 120 + Math.sin(t * 3 + p.ph) * 6, p.y - k * (160 + p.ph * 20), t * 16 + p.ph, k < 0.02);
    }
  }
}

// Top-down paper plane: two wings meeting at the nose, with the page printed across them.
function makePlaneArt(comp, rect, dpr) {
  const pw = 200, ph = 120;
  const c = makeCanvas(pw * dpr, ph * dpr), g = c.getContext('2d');
  g.scale(dpr, dpr);
  const nose = [pw, ph / 2], tail = [0, ph / 2];
  const wing = (side) => { g.beginPath(); g.moveTo(...nose); g.lineTo(pw * 0.05, ph / 2 + side * ph * 0.48); g.lineTo(pw * 0.2, ph / 2 + side * 4); g.lineTo(...tail); g.closePath(); };
  for (const side of [-1, 1]) {
    g.save();
    wing(side);
    g.fillStyle = '#fdfcf7'; g.fill();
    g.clip();
    const aspect = rect.w / rect.h;
    g.globalAlpha = 0.9;
    if (side < 0) g.drawImage(comp, 0, 0, pw, pw / aspect * 0.5);
    else { g.translate(0, ph); g.scale(1, -1); g.drawImage(comp, 0, 0, pw, pw / aspect * 0.5); }
    g.globalAlpha = 1;
    g.fillStyle = side < 0 ? 'rgba(255,255,255,0.05)' : 'rgba(110,120,140,0.14)';
    wing(side); g.fill();
    g.restore();
  }
  g.strokeStyle = 'rgba(70,80,100,0.45)'; g.lineWidth = 1.3; g.lineJoin = 'round';
  wing(-1); g.stroke(); wing(1); g.stroke();
  // Keel fold down the middle.
  g.strokeStyle = 'rgba(70,80,100,0.6)'; g.lineWidth = 2;
  g.beginPath(); g.moveTo(...tail); g.lineTo(...nose); g.stroke();
  return c;
}

function pigeon(ctx, x, y, flap, perched) {
  ctx.save();
  ctx.translate(x, y);
  ctx.fillStyle = '#8a8fa3';
  ctx.beginPath(); ctx.ellipse(0, -5, 8, 5.5, 0, 0, Math.PI * 2); ctx.fill();
  ctx.fillStyle = '#6f7488';
  ctx.beginPath(); ctx.arc(-6, -10, 3.6, 0, Math.PI * 2); ctx.fill();
  ctx.fillStyle = '#e1a54a';
  ctx.beginPath(); ctx.moveTo(-9, -10); ctx.lineTo(-12.5, -9); ctx.lineTo(-9, -8.5); ctx.fill();
  ctx.fillStyle = '#5d6276';
  const wy = perched ? 0 : Math.sin(flap) * 8;
  ctx.beginPath(); ctx.moveTo(-2, -6); ctx.lineTo(8, -8 - wy); ctx.lineTo(5, -3); ctx.fill();
  if (perched) { ctx.strokeStyle = '#d0704a'; ctx.lineWidth = 1; ctx.beginPath(); ctx.moveTo(-1, 0); ctx.lineTo(-1, 3); ctx.moveTo(2, 0); ctx.lineTo(2, 3); ctx.stroke(); }
  ctx.restore();
}

// ------------------------------------------------------------------ painting
function paintTown(e) {
  const { W, H, dpr, roof } = e;
  const rand = mulberry32(58);
  const c = makeCanvas(W * dpr, H * dpr), g = c.getContext('2d');
  g.scale(dpr, dpr);
  const sky = g.createLinearGradient(0, 0, 0, H);
  sky.addColorStop(0, '#5fb4e8');
  sky.addColorStop(0.7, '#bfe3f7');
  sky.addColorStop(1, '#e8f5fb');
  g.fillStyle = sky; g.fillRect(0, 0, W, H);
  const u = Math.min(W, H);
  cloud(g, W * 0.8, H * 0.12, u * 0.06);
  cloud(g, W * 0.3, H * 0.06, u * 0.04, 'rgba(255,255,255,0.9)');
  cloud(g, W * 0.6, H * 0.4, u * 0.05, 'rgba(255,255,255,0.85)');
  // Town skyline below: little houses with pitched roofs and a church spire.
  const base = roof - 24;
  const colors = ['#e9a07a', '#f2cf7a', '#9cc7a4', '#c5b1d8', '#f0b8a8', '#a9c9e4'];
  let x = -10;
  while (x < W + 10) {
    const w = 26 + rand() * 30, h = 26 + rand() * 40;
    g.fillStyle = colors[(rand() * colors.length) | 0];
    g.fillRect(x, base - h, w, h + 30);
    g.fillStyle = '#b5554a';
    g.beginPath(); g.moveTo(x - 3, base - h); g.lineTo(x + w / 2, base - h - w * 0.45); g.lineTo(x + w + 3, base - h); g.fill();
    g.fillStyle = 'rgba(255,248,220,0.9)';
    for (let wy = base - h + 8; wy < base - 6; wy += 14) for (let wx = x + 5; wx < x + w - 8; wx += 11) g.fillRect(wx, wy, 5, 7);
    x += w + 2;
  }
  const sx = W * 0.3;
  g.fillStyle = '#e9e1d2';
  g.fillRect(sx - 9, base - 90, 18, 90);
  g.fillStyle = '#7a8aa8';
  g.beginPath(); g.moveTo(sx - 11, base - 90); g.lineTo(sx, base - 128); g.lineTo(sx + 11, base - 90); g.fill();
  // Our rooftop: the ledge in front, with a chimney.
  g.fillStyle = '#8d5a46';
  g.fillRect(0, roof, W, H - roof);
  g.fillStyle = '#a86c54';
  for (let yy = roof + 6; yy < H; yy += 14) for (let xx = ((yy / 14) | 0) % 2 ? -12 : 0; xx < W; xx += 24) {
    g.beginPath(); g.arc(xx + 12, yy, 12, 0, Math.PI); g.fill();
  }
  g.fillStyle = '#6e4334';
  g.fillRect(0, roof - 3, W, 6);
  const cx = W - 46;
  g.fillStyle = '#b0594a'; g.fillRect(cx - 3, roof - 52, 26, 52);
  g.fillStyle = '#7a3c32'; g.fillRect(cx - 6, roof - 58, 32, 8);
  return c;
}
