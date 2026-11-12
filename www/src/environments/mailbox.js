// Mailbox: a Release environment.
//   Look:  ink on a sheet of ruled letter paper, lying on the lawn of a storybook front yard.
//   Decay: none. Nothing fades while you write.
//   Clear: tap "Mail it". The letter folds in
//          thirds, slides into an envelope that seals itself, then flies across the yard
//          into the mailbox. The door clunks shut, the flag pops up, and the bluebird on top
//          startles and settles. A fresh sheet slides in.

import { clamp, easeInOut, mulberry32, makeCanvas } from '../lib/util.js';
import { ReleaseScene, fitRect, paintPaper, roundRect, cloud } from '../lib/release.js';
import { sfx } from '../lib/sound.js';

// Fountain-pen inks for letter paper: blue-black first (the default).
const PALETTE = [
  { name: 'Blue-black', color: '#1f2d55' },
  { name: 'Royal blue', color: '#2449a8' },
  { name: 'Black', color: '#1b1b1e' },
  { name: 'Burgundy', color: '#7a1f35' },
  { name: 'Forest', color: '#2d5b3a' },
  { name: 'Brown', color: '#5a3a22' },
];

const FOLD = 1.0;     // folds in thirds
const ENV = 1.1;      // slides into the envelope, flap closes, seal
const FLY = 1.0;      // flies across the yard to the mailbox
const IN = 0.45;      // slips inside
const PAPER = '#fbf6ea';
const PAPER_BACK = '#efe6d2';

export const mailbox = {
  id: 'mailbox',
  name: 'Mailbox',
  blurb: 'Seal it up and send it off',
  clearLabel: 'Mail it',
  clearIcon: 'M3 6h18v12H3zM3 6l9 7 9-7',
  surface: 'A sheet of letter paper on a front lawn. Tap Mail it to fold it into an envelope and mail it.',
  fades: false,
  palette: PALETTE,
  create: () => new Mailbox(),
};

class Mailbox extends ReleaseScene {
  constructor() {
    super(83);
    this.ink = PALETTE[0].color;
    this.arriveFrom = { x: 0, y: 50 };
    this.washUpAt = 3.1;
    this.washUp = 0.9;
    this.grain = 0.35;
    this.door = 0;          // 0 closed .. 1 hanging open
    this.doorTo = 0;
    this.flag = 0;          // 0 down .. 1 up
    this.flagTo = 0;
    this.wiggle = 0;
    this.bird = { hop: 0, look: 0 };
  }

  layout() {
    const { W, H } = this;
    const portrait = H >= W;
    this.ground = H * (portrait ? 0.27 : 0.3);
    const top = this.ground + clamp(H * 0.05, 22, 60);
    const bottom = H - clamp(H * 0.13, 96, 130);
    return fitRect(30, top, W - 60, bottom - top, 0.77);
  }

  setup() {
    const { W, ground } = this;
    const u = clamp(Math.min(W, this.H) * 0.17, 56, 120);
    const fw = u * 0.62, sh = u * 0.36, dx = u * 0.85, dy = -u * 0.17;
    const mx = Math.min(W * 0.74, W - fw / 2 - dx - u * 0.2 - 12);
    const by = ground - u * 0.42;
    this.m = { u, fw, sh, dx, dy, mx, by, ah: sh + fw / 2 };
  }

  textArea() {
    const { w, h } = this.rect;
    return { x: w * 0.15, y: h * 0.1, w: w * 0.75, h: h * 0.8 };
  }

  paintScene() { return paintYard(this); }

  paintSheet(w, h, dpr, seed) {
    return paintPaper(w, h, dpr, seed, (g, w, h, rand) => {
      g.fillStyle = PAPER; g.fillRect(0, 0, w, h);
      g.strokeStyle = 'rgba(150,130,90,0.05)'; g.lineWidth = 0.6;
      for (let i = 0; i < (w * h) / 1200; i++) {
        const x = rand() * w, y = rand() * h, a = rand() * Math.PI, l = 3 + rand() * 6;
        g.beginPath(); g.moveTo(x, y); g.lineTo(x + Math.cos(a) * l, y + Math.sin(a) * l); g.stroke();
      }
      // Ruled lines and a red margin.
      const gap = h / 15;
      g.strokeStyle = 'rgba(90,140,200,0.35)'; g.lineWidth = 1;
      for (let y = h * 0.13; y < h - gap * 0.6; y += gap) { g.beginPath(); g.moveTo(0, y); g.lineTo(w, y); g.stroke(); }
      g.strokeStyle = 'rgba(210,80,80,0.4)';
      g.beginPath(); g.moveTo(w * 0.11, 0); g.lineTo(w * 0.11, h); g.stroke();
      // A little printed forget-me-not sprig in the corner.
      const fx = w * 0.88, fy = h * 0.065, r = Math.min(w, h) * 0.018;
      g.strokeStyle = 'rgba(80,130,80,0.55)'; g.lineWidth = 1;
      g.beginPath(); g.moveTo(fx - r * 4, fy + r * 2.5); g.quadraticCurveTo(fx - r * 2, fy + r, fx, fy); g.stroke();
      for (const [ox, oy] of [[0, 0], [-r * 2.6, r * 1.4], [r * 2, r * 1.6]]) {
        g.fillStyle = 'rgba(110,150,220,0.7)';
        for (let i = 0; i < 5; i++) {
          const a = i * Math.PI * 0.4;
          g.beginPath(); g.arc(fx + ox + Math.cos(a) * r, fy + oy + Math.sin(a) * r, r * 0.7, 0, Math.PI * 2); g.fill();
        }
        g.fillStyle = 'rgba(240,200,80,0.9)';
        g.beginPath(); g.arc(fx + ox, fy + oy, r * 0.45, 0, Math.PI * 2); g.fill();
      }
    }, (g, w, h) => roundRect(g, 1, 1, w - 2, h - 2, 4));
  }

  // ---------------------------------------------------------------- release
  launch(f) {
    const { m } = this;
    f.rest = { x: this.W / 2, y: this.rect.y + this.rect.h * 0.3 };
    f.slot = { x: m.mx, y: m.by - m.ah * 0.42 };
    f.folds = 0;
    f.sealed = false;
    f.posted = false;
  }

  carry(f) {
    const { w, h } = this.rect;
    const t = f.t;
    if (t < FOLD) {
      const p = t / FOLD;
      f.phase = 'fold';
      f.fold = p;
      f.s = 1 - 0.15 * easeInOut(p);
      f.x = f.from.x + (f.rest.x - f.from.x) * easeInOut(p);
      f.y = f.from.y + (f.rest.y - f.from.y) * easeInOut(p);
      if (f.folds === 0 && p > 0.2) { f.folds = 1; sfx.cue('fold'); }
      if (f.folds === 1 && p > 0.7) { f.folds = 2; sfx.cue('fold'); }
      return true;
    }
    if (t < FOLD + ENV) {
      const p = (t - FOLD) / ENV;
      f.phase = 'env';
      f.env = p;
      f.s = 0.85 - 0.2 * easeInOut(p);
      f.x = f.rest.x; f.y = f.rest.y;
      if (!f.sealed && p > 0.78) { f.sealed = true; sfx.cue('seal'); }
      if (p > 0.6 && this.doorTo === 0) { this.doorTo = 1; sfx.cue('creak'); }
      return true;
    }
    // Envelope proportions in sheet units, and the scale that fits it through the door.
    const ew = w * 1.06;
    const fit = (this.m.fw * 0.78) / ew;
    if (t < FOLD + ENV + FLY) {
      const p = easeInOut((t - FOLD - ENV) / FLY);
      f.phase = 'fly';
      f.s = 0.65 + (fit - 0.65) * p;
      f.x = f.rest.x + (f.slot.x - f.rest.x) * p;
      f.y = f.rest.y + (f.slot.y - f.rest.y) * p - Math.sin(Math.PI * p) * Math.min(this.H * 0.12, h * 0.4);
      f.a = Math.sin(p * Math.PI) * -0.25;
      return true;
    }
    const p = (t - FOLD - ENV - FLY) / IN;
    f.phase = 'in';
    f.a = 0;
    f.x = f.slot.x; f.y = f.slot.y;
    f.s = fit * (1 - 0.45 * p);
    f.alpha = 1 - p;
    if (p >= 1 && !f.posted) {
      f.posted = true;
      this.doorTo = 0;
      this.closing = 0.35;      // the flag follows the door
      return false;
    }
    return p < 1;
  }

  drawCarried(ctx, f) {
    const { w, h } = this.rect;
    ctx.save();
    ctx.translate(f.x, f.y);
    ctx.rotate(f.a || 0);
    ctx.scale(f.s, f.s);
    if (f.phase === 'fold') {
      this.drawFolding(ctx, f.sheet, f.fold, w, h);
    } else if (f.phase === 'env') {
      this.drawEnveloping(ctx, f.sheet, f.env, w, h);
    } else {
      if (f.phase === 'in') {
        // Only what's still in the doorway shows.
        ctx.restore();
        ctx.save();
        archPath(ctx, this.m.mx, this.m.by - 1, this.m.fw * 0.86, this.m.sh, 1);
        ctx.clip();
        ctx.translate(f.x, f.y);
        ctx.scale(f.s, f.s);
        ctx.globalAlpha = f.alpha;
      }
      drawEnvelope(ctx, w * 1.06, h / 3 * 1.3, 1, true, 1);
    }
    ctx.restore();
  }

  // Bottom third folds up, then the top third folds down over it.
  drawFolding(ctx, s, p, w, h) {
    this.compose(s);
    const c = s.comp, cw = c.width, ch = c.height;
    const a1 = Math.PI * easeInOut(clamp(p / 0.45, 0, 1));
    const a2 = Math.PI * easeInOut(clamp((p - 0.5) / 0.45, 0, 1));
    ctx.shadowColor = 'rgba(15,20,30,0.28)';
    ctx.shadowBlur = 14; ctx.shadowOffsetY = 6;
    ctx.drawImage(c, 0, ch / 3, cw, ch / 3, -w / 2, -h / 6, w, h / 3);
    ctx.shadowColor = 'transparent';
    const band = (sy, hinge, angle, dir) => {
      const k = Math.cos(angle);
      ctx.save();
      ctx.translate(0, hinge);
      ctx.scale(1, k);
      // Drawn as if unfolded: dir -1 = band above the hinge, +1 = below it.
      const y0 = dir < 0 ? -h / 3 : 0;
      if (k > 0) {
        ctx.drawImage(c, 0, sy, cw, ch / 3, -w / 2, y0, w, h / 3);
        ctx.fillStyle = `rgba(60,50,30,${0.25 * (1 - k)})`;
        ctx.fillRect(-w / 2, y0, w, h / 3);
      } else {
        ctx.fillStyle = PAPER_BACK;
        ctx.fillRect(-w / 2, y0, w, h / 3);
        ctx.fillStyle = `rgba(60,50,30,${0.18 * (1 + k)})`;
        ctx.fillRect(-w / 2, y0, w, h / 3);
      }
      ctx.restore();
    };
    band((ch * 2) / 3, h / 6, a1, 1);
    band(0, -h / 6, a2, -1);
    if (p > 0.95) {
      ctx.strokeStyle = 'rgba(120,100,70,0.25)'; ctx.lineWidth = 1;
      ctx.beginPath(); ctx.moveTo(-w / 2, h / 6 - 2); ctx.lineTo(w / 2, h / 6 - 2); ctx.stroke();
    }
  }

  // The folded letter drops into an open envelope, the flap closes and a seal stamps it.
  drawEnveloping(ctx, s, p, w, h) {
    const ew = w * 1.06, eh = h / 3 * 1.3;
    const fade = clamp(p / 0.2, 0, 1);
    const slide = easeInOut(clamp(p / 0.45, 0, 1));
    const flap = easeInOut(clamp((p - 0.48) / 0.3, 0, 1));
    const seal = clamp((p - 0.78) / 0.2, 0, 1);
    ctx.save();
    ctx.globalAlpha = fade;
    ctx.shadowColor = 'rgba(15,20,30,0.28)';
    ctx.shadowBlur = 14; ctx.shadowOffsetY = 6;
    // Inside of the envelope.
    ctx.fillStyle = '#cdb88f';
    roundRect(ctx, -ew / 2, -eh / 2, ew, eh, 3); ctx.fill();
    ctx.shadowColor = 'transparent';
    // Open flap points up, behind the letter.
    if (flap < 0.5) drawFlap(ctx, ew, eh, 1 - flap * 2, false);
    ctx.restore();
    // Folded letter (its back faces us) sliding down into the pocket.
    const ly = -eh * 0.85 * (1 - slide) + eh * 0.05;
    ctx.save();
    ctx.beginPath(); ctx.rect(-ew, -eh * 3, ew * 2, eh * 3 + eh / 2 - 2); ctx.clip();
    ctx.fillStyle = PAPER_BACK;
    ctx.fillRect(-w / 2, ly - h / 6, w, h / 3);
    ctx.strokeStyle = 'rgba(120,100,70,0.3)'; ctx.lineWidth = 1;
    ctx.beginPath(); ctx.moveTo(-w / 2, ly + h / 6 - 3); ctx.lineTo(w / 2, ly + h / 6 - 3); ctx.stroke();
    ctx.restore();
    ctx.save();
    ctx.globalAlpha = fade;
    drawEnvelope(ctx, ew, eh, 1, false, 0);
    if (flap >= 0.5) drawFlap(ctx, ew, eh, (flap - 0.5) * 2, true);
    if (seal > 0) drawSeal(ctx, 0, eh * 0.02, eh * 0.15 * (1 + 0.4 * Math.sin(seal * Math.PI)), seal);
    ctx.restore();
  }

  // ---------------------------------------------------------------- scenery
  updateFx(dt) {
    let active = false;
    const step = (v, to, rate) => (v < to ? Math.min(to, v + dt * rate) : Math.max(to, v - dt * rate));
    if (this.door !== this.doorTo) {
      const was = this.door;
      this.door = step(this.door, this.doorTo, this.doorTo ? 3 : 4);
      if (was > 0 && this.door === 0) { sfx.cue('clunk'); this.bird.hop = 1; sfx.cue('chirp'); }
      active = true;
    }
    if (this.closing != null) {
      this.closing -= dt;
      if (this.closing <= 0) {
        this.closing = null;
        if (this.flagTo === 1) this.wiggle = 1;
        this.flagTo = 1;
      }
      active = true;
    }
    if (this.flag !== this.flagTo) { this.flag = step(this.flag, this.flagTo, 2.5); active = true; }
    if (this.wiggle > 0) { this.wiggle = Math.max(0, this.wiggle - dt * 1.5); active = true; }
    if (this.bird.hop > 0) { this.bird.hop = Math.max(0, this.bird.hop - dt * 1.4); active = true; }
    return active;
  }

  tapScene(x, y) {
    const b = this.birdPos();
    if (Math.hypot(x - b.x, y - b.y) < 30 && this.bird.hop === 0) {
      this.bird.hop = 1;
      sfx.cue('chirp');
    }
  }

  birdPos() {
    const { mx, by, ah, dx, dy } = this.m;
    return { x: mx + dx * 0.5, y: by - ah + dy * 0.5 };
  }

  drawBack(ctx) {
    const { mx, by, fw, sh, dx, dy, u } = this.m;
    // Flag on the far side, behind the body: pivot on the side panel near the front.
    const px = mx + fw / 2 + dx * 0.35, py = by - sh * 0.45 + dy * 0.35;
    const down = Math.atan2(-dy, -dx) + Math.PI;   // pointing back along the box
    const up = -Math.PI / 2;
    const wig = Math.sin(this.wiggle * 18) * this.wiggle * 0.25;
    const ang = down + (up - down) * easeInOut(this.flag) + wig;
    ctx.save();
    ctx.translate(px, py);
    ctx.rotate(ang);
    ctx.fillStyle = '#9a2e22';
    ctx.fillRect(0, -u * 0.025, u * 0.5, u * 0.05);
    ctx.fillStyle = '#d8432f';
    roundRect(ctx, u * 0.32, -u * 0.12, u * 0.2, u * 0.16, 2); ctx.fill();
    ctx.restore();
    ctx.fillStyle = '#5b5b5b';
    ctx.beginPath(); ctx.arc(px, py, u * 0.03, 0, Math.PI * 2); ctx.fill();

    // The door: hinged at the bottom, it swings down toward us.
    const ang2 = this.door * 1.95;
    if (this.door > 0) {
      ctx.fillStyle = '#1d2733';
      archPath(ctx, mx, by - 1, fw * 0.86, sh, 1); ctx.fill();
    }
    const k = Math.cos(ang2);
    ctx.save();
    ctx.translate(mx, by);
    ctx.scale(1, k);
    archPath(ctx, 0, 0, fw, sh, 1);
    ctx.fillStyle = k >= 0 ? '#5fa6d4' : '#2f6990';
    ctx.fill();
    ctx.strokeStyle = 'rgba(20,50,80,0.45)'; ctx.lineWidth = 1.2 / Math.max(0.2, Math.abs(k));
    ctx.stroke();
    if (k >= 0) {
      // Latch tab at the top of the door.
      ctx.fillStyle = '#c9d4dc';
      ctx.fillRect(-fw * 0.08, -sh - fw / 2 - u * 0.035, fw * 0.16, u * 0.08);
    }
    ctx.restore();
  }

  drawFront(ctx) {
    const b = this.birdPos();
    const hop = this.bird.hop;
    const lift = Math.sin(hop * Math.PI) * this.m.u * 0.5;
    drawBird(ctx, b.x, b.y - lift, this.m.u * 0.13, hop > 0 ? Math.sin(this.time * 40) : 0);
  }
}

// ------------------------------------------------------------------ drawing helpers
// A mailbox door outline: straight sides `sh` tall, a semicircular top, width `fw`.
function archPath(ctx, x, by, fw, sh, dir) {
  ctx.beginPath();
  ctx.moveTo(x - fw / 2, by);
  ctx.lineTo(x - fw / 2, by - sh * dir);
  ctx.arc(x, by - sh * dir, fw / 2, Math.PI, 0, dir < 0);
  ctx.lineTo(x + fw / 2, by);
  ctx.closePath();
}

// Back of an envelope, flap side toward us. withFlap draws the closed flap and seal too.
function drawEnvelope(ctx, ew, eh, alpha, withFlap, sealed) {
  ctx.save();
  ctx.globalAlpha *= alpha;
  if (withFlap) {
    ctx.shadowColor = 'rgba(15,20,30,0.28)';
    ctx.shadowBlur = 10; ctx.shadowOffsetY = 4;
    ctx.fillStyle = '#f2e3c4';
    roundRect(ctx, -ew / 2, -eh / 2, ew, eh, 3); ctx.fill();
    ctx.shadowColor = 'transparent';
  }
  // Side and bottom pockets.
  ctx.fillStyle = '#f2e3c4';
  ctx.beginPath();
  ctx.moveTo(-ew / 2, -eh / 2 + 2);
  ctx.lineTo(0, eh * 0.08);
  ctx.lineTo(ew / 2, -eh / 2 + 2);
  ctx.lineTo(ew / 2, eh / 2 - 3);
  ctx.quadraticCurveTo(ew / 2, eh / 2, ew / 2 - 3, eh / 2);
  ctx.lineTo(-ew / 2 + 3, eh / 2);
  ctx.quadraticCurveTo(-ew / 2, eh / 2, -ew / 2, eh / 2 - 3);
  ctx.closePath();
  ctx.fill();
  ctx.strokeStyle = 'rgba(140,110,60,0.35)'; ctx.lineWidth = 1;
  ctx.beginPath();
  ctx.moveTo(-ew / 2, eh / 2); ctx.lineTo(-ew * 0.08, eh * 0.02);
  ctx.moveTo(ew / 2, eh / 2); ctx.lineTo(ew * 0.08, eh * 0.02);
  ctx.stroke();
  if (withFlap) {
    drawFlap(ctx, ew, eh, 1, true);
    drawSeal(ctx, 0, eh * 0.02, eh * 0.15, sealed);
  }
  ctx.restore();
}

// The top flap; t = 1 fully up (open) or fully down (closed), shrinking toward the fold line.
function drawFlap(ctx, ew, eh, t, closed) {
  const tip = closed ? -eh / 2 + eh * 0.58 * t : -eh / 2 - eh * 0.58 * t;
  ctx.fillStyle = closed ? '#ead7b0' : '#e2cc9f';
  ctx.beginPath();
  ctx.moveTo(-ew / 2, -eh / 2);
  ctx.lineTo(ew / 2, -eh / 2);
  ctx.lineTo(ew * 0.06, tip);
  ctx.quadraticCurveTo(0, tip + (closed ? eh * 0.04 : -eh * 0.04), -ew * 0.06, tip);
  ctx.closePath();
  ctx.fill();
  ctx.strokeStyle = 'rgba(140,110,60,0.35)'; ctx.lineWidth = 1;
  ctx.stroke();
}

// A red wax seal with a little heart pressed in.
function drawSeal(ctx, x, y, r, alpha) {
  if (alpha <= 0) return;
  ctx.save();
  ctx.globalAlpha *= alpha;
  ctx.fillStyle = '#b8322a';
  ctx.beginPath();
  for (let i = 0; i < 14; i++) {
    const a = (i / 14) * Math.PI * 2, rr = r * (i % 2 ? 0.92 : 1.05);
    ctx.lineTo(x + Math.cos(a) * rr, y + Math.sin(a) * rr);
  }
  ctx.closePath(); ctx.fill();
  ctx.fillStyle = '#9a2720';
  ctx.beginPath(); ctx.arc(x, y, r * 0.7, 0, Math.PI * 2); ctx.fill();
  ctx.fillStyle = '#d4584c';
  const k = r * 0.32;
  ctx.beginPath();
  ctx.moveTo(x, y + k * 0.9);
  ctx.bezierCurveTo(x - k * 1.6, y - k * 0.2, x - k * 0.6, y - k * 1.3, x, y - k * 0.4);
  ctx.bezierCurveTo(x + k * 0.6, y - k * 1.3, x + k * 1.6, y - k * 0.2, x, y + k * 0.9);
  ctx.fill();
  ctx.restore();
}

function drawBird(ctx, x, y, r, flap) {
  ctx.save();
  ctx.translate(x, y);
  // Tail.
  ctx.fillStyle = '#2f5f9e';
  ctx.beginPath(); ctx.moveTo(r * 0.6, -r * 0.2); ctx.lineTo(r * 1.7, -r * 0.7); ctx.lineTo(r * 1.6, r * 0.05); ctx.closePath(); ctx.fill();
  // Body and breast.
  ctx.fillStyle = '#4a86cf';
  ctx.beginPath(); ctx.ellipse(0, -r * 0.55, r, r * 0.8, 0, 0, Math.PI * 2); ctx.fill();
  ctx.fillStyle = '#ef9a5a';
  ctx.beginPath(); ctx.ellipse(-r * 0.35, -r * 0.35, r * 0.55, r * 0.5, 0, 0, Math.PI * 2); ctx.fill();
  // Head, eye, beak.
  ctx.fillStyle = '#4a86cf';
  ctx.beginPath(); ctx.arc(-r * 0.55, -r * 1.25, r * 0.55, 0, Math.PI * 2); ctx.fill();
  ctx.fillStyle = '#1c1c22';
  ctx.beginPath(); ctx.arc(-r * 0.75, -r * 1.35, r * 0.12, 0, Math.PI * 2); ctx.fill();
  ctx.fillStyle = '#f2b640';
  ctx.beginPath(); ctx.moveTo(-r * 1.05, -r * 1.3); ctx.lineTo(-r * 1.45, -r * 1.18); ctx.lineTo(-r * 1.05, -r * 1.08); ctx.closePath(); ctx.fill();
  // Wing, flapping while it hops.
  ctx.fillStyle = '#3a6fb4';
  ctx.save();
  ctx.translate(r * 0.2, -r * 0.7);
  ctx.rotate(-0.3 - flap * 0.7);
  ctx.beginPath(); ctx.ellipse(r * 0.3, 0, r * 0.65, r * 0.35, 0, 0, Math.PI * 2); ctx.fill();
  ctx.restore();
  // Feet.
  ctx.strokeStyle = '#8a5a2e'; ctx.lineWidth = Math.max(1, r * 0.12);
  ctx.beginPath(); ctx.moveTo(-r * 0.2, r * 0.15); ctx.lineTo(-r * 0.2, -r * 0.05); ctx.moveTo(r * 0.15, r * 0.15); ctx.lineTo(r * 0.15, -r * 0.05); ctx.stroke();
  ctx.restore();
}

// ------------------------------------------------------------------ painting
function paintYard(e) {
  const { W, H, dpr, ground, m } = e;
  const rand = mulberry32(44);
  const c = makeCanvas(W * dpr, H * dpr), g = c.getContext('2d');
  g.scale(dpr, dpr);
  const u = Math.min(W, H);
  // Morning sky and sun.
  const sky = g.createLinearGradient(0, 0, 0, ground);
  sky.addColorStop(0, '#8fd0f0');
  sky.addColorStop(1, '#e4f5fb');
  g.fillStyle = sky; g.fillRect(0, 0, W, ground + 1);
  const sx = W * 0.12, sy = ground * 0.28, sr = u * 0.05;
  const glow = g.createRadialGradient(sx, sy, sr * 0.5, sx, sy, sr * 3);
  glow.addColorStop(0, 'rgba(255,240,170,0.7)');
  glow.addColorStop(1, 'rgba(255,240,170,0)');
  g.fillStyle = glow; g.fillRect(sx - sr * 3, sy - sr * 3, sr * 6, sr * 6);
  g.fillStyle = '#ffe58a';
  g.beginPath(); g.arc(sx, sy, sr, 0, Math.PI * 2); g.fill();
  cloud(g, W * 0.55, ground * 0.25, u * 0.035);
  cloud(g, W * 0.85, ground * 0.12, u * 0.025, 'rgba(255,255,255,0.85)');
  // Rolling hills.
  g.fillStyle = '#a9d68a';
  g.beginPath(); g.moveTo(0, ground);
  for (let x = 0; x <= W + 10; x += 10) g.lineTo(x, ground - ground * 0.16 - Math.sin(x * 0.012 + 1) * ground * 0.07);
  g.lineTo(W, ground); g.fill();
  g.fillStyle = '#93c977';
  g.beginPath(); g.moveTo(0, ground);
  for (let x = 0; x <= W + 10; x += 10) g.lineTo(x, ground - ground * 0.07 - Math.sin(x * 0.02 + 3) * ground * 0.04);
  g.lineTo(W, ground); g.fill();
  // A little cottage on the left.
  const hx = W * 0.2, hw = u * 0.16, hh = hw * 0.62, hb = ground - 3;
  g.fillStyle = '#a2523c';
  g.fillRect(hx + hw * 0.22, hb - hh - hw * 0.42, hw * 0.1, hw * 0.25);
  g.fillStyle = '#f4e3c3';
  g.fillRect(hx - hw / 2, hb - hh, hw, hh);
  g.fillStyle = '#d2614a';
  g.beginPath(); g.moveTo(hx - hw * 0.6, hb - hh + 1); g.lineTo(hx, hb - hh - hw * 0.4); g.lineTo(hx + hw * 0.6, hb - hh + 1); g.closePath(); g.fill();
  g.fillStyle = '#6a4630';
  g.fillRect(hx - hw * 0.08, hb - hh * 0.55, hw * 0.16, hh * 0.55);
  g.fillStyle = '#8fc3e0';
  for (const s of [-1, 1]) g.fillRect(hx + s * hw * 0.3 - hw * 0.08, hb - hh * 0.7, hw * 0.16, hh * 0.25);
  // Lawn.
  const lawn = g.createLinearGradient(0, ground, 0, H);
  lawn.addColorStop(0, '#7dbd5e');
  lawn.addColorStop(1, '#5fa048');
  g.fillStyle = lawn; g.fillRect(0, ground, W, H - ground);
  g.strokeStyle = 'rgba(40,90,30,0.35)'; g.lineWidth = 1; g.lineCap = 'round';
  for (let i = 0; i < (W * (H - ground)) / 500; i++) {
    const x = rand() * W, y = ground + 4 + rand() * (H - ground);
    g.beginPath(); g.moveTo(x, y); g.lineTo(x - 1.5, y - 4 - rand() * 3); g.moveTo(x + 2, y); g.lineTo(x + 3, y - 3 - rand() * 3); g.stroke();
  }
  for (let i = 0; i < 18; i++) {
    const x = rand() * W, y = ground + 10 + rand() * (H - ground - 14), r = 2 + rand() * 1.5;
    g.fillStyle = rand() < 0.6 ? '#ffffff' : '#ffd0e0';
    for (let k = 0; k < 5; k++) { const a = k * 1.2566; g.beginPath(); g.arc(x + Math.cos(a) * r, y + Math.sin(a) * r, r * 0.65, 0, Math.PI * 2); g.fill(); }
    g.fillStyle = '#f5c842';
    g.beginPath(); g.arc(x, y, r * 0.5, 0, Math.PI * 2); g.fill();
  }
  // White picket fence along the edge of the yard.
  const pw = clamp(u * 0.03, 8, 16), ph = clamp(u * 0.09, 22, 46);
  g.fillStyle = '#f7f4ec';
  g.fillRect(0, ground - ph * 0.75, W, pw * 0.4);
  g.fillRect(0, ground - ph * 0.35, W, pw * 0.4);
  for (let x = pw * 0.4; x < W; x += pw * 1.7) {
    g.beginPath();
    g.moveTo(x, ground + 2); g.lineTo(x, ground - ph + pw * 0.4); g.lineTo(x + pw / 2, ground - ph); g.lineTo(x + pw, ground - ph + pw * 0.4); g.lineTo(x + pw, ground + 2);
    g.closePath(); g.fill();
    g.fillStyle = 'rgba(120,120,110,0.18)';
    g.fillRect(x + pw * 0.7, ground - ph + pw * 0.5, pw * 0.3, ph - pw * 0.4);
    g.fillStyle = '#f7f4ec';
  }

  // The mailbox: wooden post, then the body as an extruded arch, back to front.
  const { mx, by, fw, sh, dx, dy } = m;
  const postW = m.u * 0.12;
  g.fillStyle = '#8a5a36';
  g.fillRect(mx + dx * 0.45 - postW / 2, by - 2, postW, ground + 6 - by);
  g.fillStyle = 'rgba(60,30,10,0.25)';
  g.fillRect(mx + dx * 0.45 + postW * 0.15, by - 2, postW * 0.35, ground + 6 - by);
  g.fillStyle = '#7a4e2e';
  g.fillRect(mx - fw * 0.1, by - 1, dx + fw * 0.2, m.u * 0.06);
  g.fillStyle = 'rgba(0,0,0,0.18)';
  g.beginPath(); g.ellipse(mx + dx * 0.45, ground + 6, postW * 1.6, postW * 0.35, 0, 0, Math.PI * 2); g.fill();
  const n = 28;
  for (let i = n; i >= 1; i--) {
    const t = i / n;
    archPath(g, mx + dx * t, by + dy * t, fw, sh, 1);
    g.fillStyle = i === n ? '#2c5f85' : '#3b79a6';
    g.fill();
  }
  // Highlight along the curved top.
  g.strokeStyle = 'rgba(255,255,255,0.45)'; g.lineWidth = Math.max(1.5, m.u * 0.025); g.lineCap = 'round';
  g.beginPath();
  g.moveTo(mx - fw * 0.12, by - sh - fw / 2 + fw * 0.03);
  g.lineTo(mx + dx - fw * 0.12, by + dy - sh - fw / 2 + fw * 0.03);
  g.stroke();
  // Rim around the doorway.
  archPath(g, mx, by, fw, sh, 1);
  g.fillStyle = '#2f6990'; g.fill();
  return c;
}
