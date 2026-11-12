// Starfield: a Fade environment.
//   Look:  a deep, clear night sky full of stars. Your finger leaves a faint silver line, and
//          every star it passes flares up and is joined to the next, like a constellation.
//   Decay: dawn creeps up from the horizon: lines low in the sky fade first, then the ones
//          higher up, and the stars settle back to a twinkle.
//   Clear: sunrise in fast motion: the sky floods with light from the horizon, washing the
//          constellations out, then night falls again.

import { clamp, mulberry32, smoothstep } from '../lib/util.js';
import { MapFade, stageCanvas, blob } from '../lib/fade.js';
import { sfx } from '../lib/sound.js';

export const starfield = {
  id: 'starfield',
  name: 'Starfield',
  blurb: 'Join the stars; they fade as dawn comes up',
  surface: 'Night sky to draw constellations on',
  clearLabel: 'Sunrise',
  clearIcon: 'M3 18h18M7 18a5 5 0 0 1 10 0M12 4v3M5 9l2 2M19 9l-2 2',
  create: () => new Starfield(),
};

const SNAP = 16; // how close (CSS px) a stroke must pass to light a star

class Starfield extends MapFade {
  constructor() {
    super({ paint: true, brush: 2.2, soft: 0.4, edgeFirst: 0.2, seed: 101, ink: '#cfe0ff', textWeight: 400 });
    this.textLine = 0.05;
    this.links = [];
    this.dawn = 0;
    this.twinkle = 0;
  }

  // Dawn rises from the bottom: low lines go first.
  decayAt(x, y, coarse, fine) {
    return 0.45 + 1.1 * Math.pow(y / this.H, 1.6) + 0.35 * coarse + 0.2 * (fine - 0.5);
  }

  paintBase() { return paintNight(this.W, this.H, this.dpr); }

  setup() {
    // A field of stars to join, spaced so they never clump (a jittered grid).
    const rand = mulberry32(5);
    const { W, H } = this;
    const gap = 30;
    this.stars = [];
    for (let y = gap / 2; y < H * 0.95; y += gap) {
      for (let x = gap / 2; x < W; x += gap) {
        if (rand() < 0.62) this.stars.push({ x: x + (rand() - 0.5) * gap * 0.8, y: y + (rand() - 0.5) * gap * 0.8, m: 0.35 + rand() * rand() * 1.2, ph: rand() * 6.3 });
      }
    }
    this.grid = new Map();
    this.stars.forEach((s, i) => {
      const key = ((s.x / SNAP) | 0) + ',' + ((s.y / SNAP) | 0);
      (this.grid.get(key) || this.grid.set(key, []).get(key)).push(i);
    });
    this.links = [];
  }

  // The faint line itself.
  paintSeg(g, x0, y0, r0, x1, y1, r1) {
    g.strokeStyle = this.ink;
    g.globalAlpha = 0.55;
    g.lineWidth = (r0 + r1) * 0.6;
    g.beginPath(); g.moveTo(x0, y0); g.lineTo(x1 + 0.01, y1); g.stroke();
    g.globalAlpha = 1;
  }

  near(x, y) {
    let best = -1, bd = SNAP * SNAP;
    const gx = (x / SNAP) | 0, gy = (y / SNAP) | 0;
    for (let j = gy - 1; j <= gy + 1; j++) {
      for (let i = gx - 1; i <= gx + 1; i++) {
        for (const n of this.grid.get(i + ',' + j) || []) {
          const s = this.stars[n], d = (s.x - x) ** 2 + (s.y - y) ** 2;
          if (d < bd) { bd = d; best = n; }
        }
      }
    }
    return best;
  }

  onStrokeStart(s) { s.last = -1; this.hit(s, s.x, s.y); }
  onStrokeMove(s, x, y) { this.hit(s, x, y); }

  hit(s, x, y) {
    const n = this.near(x, y);
    if (n < 0 || n === s.last) return;
    const st = this.stars[n];
    // Light the star (it shares the map, so it fades with the line around it).
    this.raise(st.x, st.y, 7, st.x, st.y, 7, 1 + this.hold);
    if (s.last >= 0) this.links.push([s.last, n]);
    if (this.links.length > 600) this.links.shift();
    s.last = n;
    sfx.cue('twinkle');
  }

  updateFx(dt) {
    this.twinkle += dt;
    if (this.clearing) return true;
    // Forget links once both ends have faded.
    if (this.links.length && Math.random() < dt * 2) {
      this.links = this.links.filter(([a, b]) => this.valueAt(this.stars[a].x, this.stars[a].y) > 0.01 || this.valueAt(this.stars[b].x, this.stars[b].y) > 0.01);
    }
    return this.alive;
  }

  clear() {
    if (this.clearing) return;
    sfx.cue('dawn');
    this.strokes.clear();
    this.commitDraft?.();
    this.clearing = { t: 0, dur: 2.6 };
  }

  clearStep(cl) {
    const p = Math.min(1, cl.t / cl.dur);
    this.dawn = Math.sin(p * Math.PI);
    if (p > 0.3) this.scaleCells(() => 0.85);
    if (p >= 1) {
      this.map.fill(0);
      this.links = [];
      const g = this.paintCtx;
      g.save(); g.setTransform(1, 0, 0, 1, 0, 0); g.clearRect(0, 0, this.paint.width, this.paint.height); g.restore();
      this.dawn = 0;
      return false;
    }
    return true;
  }

  drawFx(ctx) {
    const { W, H } = this;
    ctx.save();
    ctx.globalCompositeOperation = 'lighter';
    // Constellation lines between lit stars.
    ctx.lineCap = 'round';
    for (const [a, b] of this.links) {
      const A = this.stars[a], B = this.stars[b];
      const v = Math.min(this.valueAt(A.x, A.y), this.valueAt(B.x, B.y));
      if (v <= 0.01) continue;
      ctx.strokeStyle = `rgba(200,220,255,${0.75 * smoothstep(0, 0.6, Math.min(1, v))})`;
      ctx.lineWidth = 1.3;
      ctx.beginPath(); ctx.moveTo(A.x, A.y); ctx.lineTo(B.x, B.y); ctx.stroke();
    }
    // Stars: a twinkle always, a flare where the drawing is.
    const t = this.twinkle;
    for (const s of this.stars) {
      const v = Math.min(1, this.valueAt(s.x, s.y));
      const tw = 0.55 + 0.45 * Math.sin(t * (1.3 + s.m) + s.ph);
      const r = s.m * (0.9 + v * 1.6);
      ctx.fillStyle = `rgba(235,242,255,${clamp(0.35 + tw * 0.35 + v * 0.5, 0, 1)})`;
      ctx.beginPath(); ctx.arc(s.x, s.y, r, 0, Math.PI * 2); ctx.fill();
      if (v > 0.05) {
        blob(ctx, s.x, s.y, 10 + v * 8, 10 + v * 8, `rgba(170,200,255,${0.45 * v})`);
        // A four-point glint on lit stars.
        ctx.strokeStyle = `rgba(230,240,255,${0.7 * v})`;
        ctx.lineWidth = 0.8;
        const L = 5 + v * 7;
        ctx.beginPath(); ctx.moveTo(s.x - L, s.y); ctx.lineTo(s.x + L, s.y); ctx.moveTo(s.x, s.y - L); ctx.lineTo(s.x, s.y + L); ctx.stroke();
      }
    }
    ctx.restore();
    if (this.dawn > 0) {
      const k = this.dawn;
      const g = ctx.createLinearGradient(0, H, 0, H * (1 - 1.2 * k));
      g.addColorStop(0, `rgba(255,190,130,${0.9 * k})`);
      g.addColorStop(0.4, `rgba(255,170,160,${0.6 * k})`);
      g.addColorStop(1, 'rgba(120,150,220,0)');
      ctx.fillStyle = g; ctx.fillRect(0, 0, W, H);
    }
  }
}

// A clear, moonless sky: deep blue-black with a faint Milky Way and a hint of the horizon.
function paintNight(W, H, dpr) {
  const rand = mulberry32(17);
  const { c, g } = stageCanvas(W, H, dpr);
  const sky = g.createLinearGradient(0, 0, 0, H);
  sky.addColorStop(0, '#03040c');
  sky.addColorStop(0.7, '#0a1030');
  sky.addColorStop(1, '#1a1c3c');
  g.fillStyle = sky; g.fillRect(0, 0, W, H);
  // Milky Way: a soft diagonal band of haze and tiny stars.
  for (let i = 0; i < 40; i++) {
    const t = rand();
    blob(g, t * W * 1.2 - W * 0.1, H * 0.15 + t * H * 0.55 + (rand() - 0.5) * 60, 50 + rand() * 60, 30 + rand() * 40, 'rgba(150,160,220,0.06)');
  }
  for (let i = 0; i < (W * H) / 260; i++) {
    const t = rand();
    const onBand = rand() < 0.5;
    const x = onBand ? t * W : rand() * W;
    const y = onBand ? H * 0.15 + t * H * 0.55 + (rand() - 0.5) * 120 : rand() * H;
    g.fillStyle = `rgba(255,255,255,${0.08 + rand() * 0.3})`;
    g.fillRect(x, y, 0.8, 0.8);
  }
  // A dark hill line at the bottom.
  g.fillStyle = '#020309';
  g.beginPath(); g.moveTo(0, H);
  for (let x = 0; x <= W + 10; x += 10) g.lineTo(x, H * 0.95 - Math.sin(x * 0.008 + 1) * H * 0.02);
  g.lineTo(W, H); g.closePath(); g.fill();
  return c;
}
