// Paper boat: a Release environment.
//   Look:  pencil on a sheet of paper resting on a little wooden dock at the edge of a lake.
//   Decay: none. Nothing fades while you draw.
//   Clear: drag the handle up toward the water (or tap "Sail away"). The sheet folds into a
//          paper boat with your drawing on its side, settles on the lake and sails off toward
//          the far shore, getting smaller until it's gone. A new sheet is set on the dock.

import { clamp, easeInOut, smoothstep, mulberry32, makeCanvas } from '../lib/util.js';
import { ReleaseScene, fitRect, paintPaper, tornOutline, paperFibres, cloud } from '../lib/release.js';
import { sfx } from '../lib/sound.js';

const FOLD = 1.0;
const SAIL = 9;

// Inks that suit the material, default first.
const PALETTE = [
  { name: 'Pencil', color: '#30333d' },
  { name: 'Ballpoint', color: '#1f3a8a' },
  { name: 'Black', color: '#151515' },
  { name: 'Red pen', color: '#b3261e' },
  { name: 'Green', color: '#2f6b3a' },
  { name: 'Teal', color: '#1d6670' },
];

export const paperBoat = {
  id: 'paper-boat',
  name: 'Paper boat',
  blurb: 'Fold a boat and sail it away',
  clearLabel: 'Sail away',
  clearIcon: 'M3 15h18l-3 4H6l-3-4zM12 4v11M12 4l6 9h-6',
  surface: 'A sheet of paper on a dock by a lake. Drag the handle up to fold it into a boat and sail it away.',
  fades: false,
  palette: PALETTE,
  create: () => new PaperBoat(),
};

class PaperBoat extends ReleaseScene {
  constructor() {
    super(19);
    this.ink = PALETTE[0].color;
    this.handleSide = 'top';
    this.arriveFrom = { x: 0, y: 70 };
    this.washUpAt = 1.8;
    this.grain = 0.8;
    this.wakes = [];
    this.ducks = [];
  }

  layout() {
    const { W, H } = this;
    const portrait = H >= W;
    this.horizon = H * (portrait ? 0.2 : 0.24);
    const top = this.horizon + clamp(H * 0.16, 100, 180);
    const bottom = H - clamp(H * 0.13, 96, 130);
    return fitRect(26, top, W - 52, bottom - top, 0.78);
  }

  setup() {
    // Where boats head for: a point on the far shore.
    this.vanish = { x: this.W * 0.62, y: this.horizon + 10 };
    this.boatW = clamp(Math.min(this.W, this.H) * 0.3, 90, 170);
    const y = this.horizon + (this.rect.y - this.horizon) * 0.55;
    this.ducks = [
      { x: this.W * 0.14, y, size: 7, dir: -1, scoot: 0 },
      { x: this.W * 0.14 + 20, y: y + 4, size: 4.5, dir: -1, scoot: 0 },
    ];
  }

  paintScene() { return paintLake(this); }

  paintSheet(w, h, dpr, seed) {
    return paintPaper(w, h, dpr, seed, (g, w, h, rand) => {
      paperFibres(g, w, h, rand, '#fbf8f0', 'rgba(120,110,90,0.05)');
      // Faint squared grid, like a page from a sketchbook.
      g.strokeStyle = 'rgba(90,130,170,0.13)'; g.lineWidth = 1;
      for (let x = 18; x < w; x += 22) { g.beginPath(); g.moveTo(x, 0); g.lineTo(x, h); g.stroke(); }
      for (let y = 18; y < h; y += 22) { g.beginPath(); g.moveTo(0, y); g.lineTo(w, y); g.stroke(); }
      const sh = g.createLinearGradient(0, 0, w, h);
      sh.addColorStop(0, 'rgba(255,255,255,0.2)');
      sh.addColorStop(1, 'rgba(150,140,120,0.12)');
      g.fillStyle = sh; g.fillRect(0, 0, w, h);
    }, tornOutline(0.6, 2));
  }

  launch(f) {
    sfx.cue('fold');
    const { w } = this.rect;
    f.water = { x: clamp(f.from.x, this.W * 0.3, this.W * 0.7), y: this.rect.y - clamp(this.H * 0.04, 20, 40) };
    f.foldScale = (this.boatW * 0.8) / w;
    f.boat = makeBoatArt(f.sheet.comp, this.rect, this.dpr);
    f.lastWake = 0;
    for (const d of this.ducks) d.scoot = 1;
  }

  carry(f) {
    if (f.t < FOLD) {
      const p = easeInOut(f.t / FOLD);
      f.x = f.from.x + (f.water.x - f.from.x) * p;
      f.y = f.from.y + (f.water.y - f.from.y) * p - Math.sin(Math.PI * p) * 20;
      f.s = 1 + (f.foldScale - 1) * p;
      f.fold = smoothstep(0.35, 0.9, p);
      f.a = Math.sin(Math.PI * p) * 0.1;
      f.k = 1;
      return true;
    }
    f.fold = 1;
    const t = f.t - FOLD, q = Math.min(1, t / SAIL);
    const e = 1 - Math.pow(1 - q, 1.7);
    f.x = f.water.x + (this.vanish.x - f.water.x) * e + Math.sin(t * 0.8 + f.seed) * 6;
    f.y = f.water.y + (this.vanish.y - f.water.y) * e;
    f.k = 1 - 0.94 * e;                 // perspective: smaller toward the far shore
    f.a = Math.sin(t * 2.2 + f.seed) * 0.05;
    f.alpha = q > 0.85 ? (1 - q) / 0.15 : 1;
    if (t - f.lastWake > 0.5 && q < 0.85) { f.lastWake = t; this.wakes.push({ x: f.x, y: f.y + 6 * f.k, k: f.k, t: 0 }); }
    return q < 1;
  }

  drawCarried(ctx, f) {
    if (f.fold < 1) this.drawSheetAt(ctx, f.sheet, f.x, f.y, f.s, f.a, 1 - f.fold, 0.25);
    if (f.fold <= 0) return;
    const bw = this.boatW * f.k;
    ctx.save();
    ctx.globalAlpha = f.fold * f.alpha;
    ctx.translate(f.x, f.y);
    ctx.rotate(f.a);
    // Reflection.
    ctx.save();
    ctx.scale(1, -0.45);
    ctx.globalAlpha *= 0.25;
    ctx.drawImage(f.boat, -bw / 2, -bw * 0.62, bw, bw * 0.62);
    ctx.restore();
    ctx.drawImage(f.boat, -bw / 2, -bw * 0.62, bw, bw * 0.62);
    ctx.restore();
  }

  tapScene(x, y) {
    if (y > this.horizon + 6) sfx.cue('splash', { size: 0.35 });
    if (y > this.horizon + 6) this.wakes.push({ x, y, k: Math.min(1, (y - this.horizon) / (this.H * 0.5)) + 0.2, t: 0, ring: true });
  }

  updateFx(dt) {
    for (const w of this.wakes) w.t += dt;
    this.wakes = this.wakes.filter((w) => w.t < 2.2);
    let active = this.wakes.length > 0;
    for (const d of this.ducks) {
      if (d.scoot > 0) { d.scoot = Math.max(0, d.scoot - dt * 0.25); d.x += dt * 30 * d.dir * d.scoot; active = true; }
    }
    return active;
  }

  drawBack(ctx) {
    ctx.save();
    for (const w of this.wakes) {
      const p = w.t / 2.2;
      ctx.strokeStyle = `rgba(255,255,255,${0.55 * (1 - p)})`;
      ctx.lineWidth = 1.5;
      const r = (10 + p * 50) * w.k;
      ctx.beginPath(); ctx.ellipse(w.x, w.y, r, r * 0.28, 0, w.ring ? 0 : 0.15, w.ring ? Math.PI * 2 : Math.PI - 0.15); ctx.stroke();
    }
    ctx.restore();
    for (const d of this.ducks) duck(ctx, d.x, d.y, d.size);
  }
}

// Draw a paper boat with the page's drawing printed across the hull and sail, once.
function makeBoatArt(comp, rect, dpr) {
  const bw = 200, bh = 124;
  const c = makeCanvas(bw * dpr, bh * dpr), g = c.getContext('2d');
  g.scale(dpr, dpr);
  const hull = () => { g.beginPath(); g.moveTo(0, bh * 0.52); g.lineTo(bw, bh * 0.52); g.lineTo(bw * 0.8, bh); g.lineTo(bw * 0.2, bh); g.closePath(); };
  const sail = () => { g.beginPath(); g.moveTo(bw * 0.22, bh * 0.52); g.lineTo(bw * 0.5, 0); g.lineTo(bw * 0.78, bh * 0.52); g.closePath(); };
  const side = (path, x, y, w, h, shade) => {
    g.save();
    path(); g.fillStyle = '#fbf8f0'; g.fill();
    g.clip();
    g.globalAlpha = 0.9;
    g.drawImage(comp, x, y, w, h);
    g.globalAlpha = 1;
    g.fillStyle = shade; g.fill();
    g.restore();
  };
  // Keep the page's aspect while covering each panel.
  const aspect = rect.w / rect.h;
  side(sail, bw * 0.22, 0, bw * 0.56, bw * 0.56 / aspect, 'rgba(255,255,255,0.05)');
  side(hull, 0, bh * 0.52 - bw / aspect * 0.35, bw, bw / aspect, 'rgba(120,130,150,0.12)');
  g.strokeStyle = 'rgba(80,90,110,0.45)'; g.lineWidth = 1.4; g.lineJoin = 'round';
  hull(); g.stroke(); sail(); g.stroke();
  g.beginPath(); g.moveTo(bw * 0.5, 0); g.lineTo(bw * 0.5, bh * 0.52); g.strokeStyle = 'rgba(80,90,110,0.25)'; g.stroke();
  return c;
}

function duck(ctx, x, y, r) {
  ctx.save();
  ctx.translate(x, y);
  ctx.fillStyle = 'rgba(255,255,255,0.3)';
  ctx.beginPath(); ctx.ellipse(0, r * 0.35, r * 1.4, r * 0.3, 0, 0, Math.PI * 2); ctx.fill();
  ctx.fillStyle = '#f4f1e8';
  ctx.beginPath(); ctx.ellipse(0, 0, r * 1.1, r * 0.6, 0, 0, Math.PI * 2); ctx.fill();
  ctx.fillStyle = '#3f7d4f';
  ctx.beginPath(); ctx.arc(r * 0.8, -r * 0.6, r * 0.42, 0, Math.PI * 2); ctx.fill();
  ctx.fillStyle = '#f2a03b';
  ctx.beginPath(); ctx.moveTo(r * 1.15, -r * 0.62); ctx.lineTo(r * 1.55, -r * 0.5); ctx.lineTo(r * 1.15, -r * 0.42); ctx.fill();
  ctx.restore();
}

// ------------------------------------------------------------------ painting
function paintLake(e) {
  const { W, H, dpr, horizon, rect } = e;
  const rand = mulberry32(44);
  const c = makeCanvas(W * dpr, H * dpr), g = c.getContext('2d');
  g.scale(dpr, dpr);
  const sky = g.createLinearGradient(0, 0, 0, horizon);
  sky.addColorStop(0, '#f6c9a8');
  sky.addColorStop(1, '#fde8c6');
  g.fillStyle = sky; g.fillRect(0, 0, W, horizon + 2);
  const u = Math.min(W, H);
  cloud(g, W * 0.22, horizon * 0.45, u * 0.04, 'rgba(255,255,255,0.8)');
  cloud(g, W * 0.78, horizon * 0.3, u * 0.03, 'rgba(255,255,255,0.7)');
  // Far shore: hills and a row of round trees.
  g.fillStyle = '#9cbf8c';
  g.beginPath(); g.moveTo(0, horizon);
  for (let x = 0; x <= W + 8; x += 8) g.lineTo(x, horizon - 14 - Math.sin(x / W * 4 + 0.5) * 10);
  g.lineTo(W, horizon); g.fill();
  for (let x = 4; x < W; x += 9 + rand() * 12) {
    g.fillStyle = rand() < 0.5 ? '#6f9e62' : '#5d8c55';
    g.beginPath(); g.arc(x, horizon - 4, 5 + rand() * 6, Math.PI, 0); g.fill();
  }
  // A tiny cabin on the far shore, where the boats go.
  const cx = W * 0.62;
  g.fillStyle = '#b5654a'; g.fillRect(cx - 7, horizon - 12, 14, 10);
  g.fillStyle = '#7a3f30'; g.beginPath(); g.moveTo(cx - 9, horizon - 12); g.lineTo(cx, horizon - 19); g.lineTo(cx + 9, horizon - 12); g.fill();
  // Lake.
  const lake = g.createLinearGradient(0, horizon, 0, H);
  lake.addColorStop(0, '#a9d6e2');
  lake.addColorStop(1, '#4f9db8');
  g.fillStyle = lake; g.fillRect(0, horizon, W, H - horizon);
  g.strokeStyle = 'rgba(255,255,255,0.35)'; g.lineCap = 'round';
  for (let i = 0; i < (W * (H - horizon)) / 3000; i++) {
    const y = horizon + 4 + Math.pow(rand(), 1.6) * (H - horizon);
    const k = (y - horizon) / (H - horizon);
    const x = rand() * W, l = 6 + k * 26;
    g.lineWidth = 0.8 + k * 1.4;
    g.beginPath(); g.moveTo(x, y); g.lineTo(x + l, y); g.stroke();
  }
  // Lily pads.
  for (let i = 0; i < 6; i++) {
    const side = i % 2 ? 1 : -1;
    const x = side > 0 ? W - 20 - rand() * W * 0.12 : 20 + rand() * W * 0.12;
    const y = horizon + 30 + rand() * (H - horizon - 60);
    const r = 6 + (y - horizon) / (H - horizon) * 14;
    g.fillStyle = '#5f9a4a';
    g.beginPath(); g.moveTo(x, y); g.ellipse(x, y, r, r * 0.45, 0, 0.4, Math.PI * 2 - 0.1); g.closePath(); g.fill();
    if (rand() < 0.4) { g.fillStyle = '#f6b9d0'; g.beginPath(); g.arc(x - r * 0.2, y - 2, r * 0.25, 0, Math.PI * 2); g.fill(); }
  }
  // The dock the sheet rests on: planks running out into the water.
  const dx = rect.x + 10, dw = rect.w - 20, dy = rect.y - 16;
  g.fillStyle = 'rgba(20,60,80,0.25)';
  g.fillRect(dx + 6, dy + 10, dw, H - dy);
  for (let x = dx, i = 0; x < dx + dw; x += 26, i++) {
    g.fillStyle = i % 2 ? '#b98a5a' : '#c49565';
    g.fillRect(x, dy, Math.min(25, dx + dw - x), H - dy);
    g.fillStyle = 'rgba(90,60,30,0.3)';
    g.fillRect(x + 25, dy, 1, H - dy);
    g.fillStyle = 'rgba(80,50,25,0.5)';
    g.beginPath(); g.arc(x + 5, dy + 8, 1.4, 0, Math.PI * 2); g.arc(x + 20, dy + 8, 1.4, 0, Math.PI * 2); g.fill();
  }
  g.fillStyle = '#8d6440';
  for (const px of [dx - 4, dx + dw - 6]) g.fillRect(px, dy - 10, 10, 26);
  return c;
}
