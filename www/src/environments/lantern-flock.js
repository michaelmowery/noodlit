// Lantern festival: a Release environment built on the paper lantern.
//   Look:  the same warm paper lantern on the lakeshore at night.
//   Decay: none. Nothing fades while you draw.
//   Clear: drag the handle up (or tap "Light it"). Your lantern lights and rises, and as it
//          goes, lanterns all along the far shore light and rise with it, a whole festival
//          of lights drifting up into the night. A few stay in the sky each time.

import { lantern, Lantern } from './lantern.js';

export const lanternFlock = {
  ...lantern,
  id: 'lantern-flock',
  name: 'Lantern festival',
  blurb: 'Yours rises with hundreds of others',
  surface: 'A paper sky lantern to draw on. Drag the handle up to light it and release it with the festival.',
  create: () => new LanternFlock(),
};

class LanternFlock extends Lantern {
  constructor() {
    super();
    this.flock = [];
  }

  setup() {
    super.setup();
    this.flock = [];
  }

  launch(f) {
    super.launch(f);
    const { W, shore } = this;
    const n = Math.round(Math.min(160, 70 + W / 6));
    for (let i = 0; i < n; i++) {
      const depth = Math.random();           // 0 far, 1 near
      this.flock.push({
        x: Math.random() * W,
        y: shore - 6 - depth * 30 + Math.random() * 8,
        s: 1.6 + depth * depth * 7,
        v: 10 + depth * 26 + Math.random() * 10,
        sway: Math.random() * 6,
        delay: 0.6 + Math.random() * 4.5,
        t: 0,
        life: 10 + Math.random() * 8,
      });
    }
    // Leave a few more far-off lights hanging in the sky each time.
    for (let i = 0; i < 4 && this.far.length < 60; i++) {
      this.far.push({ x: Math.random() * W, y: Math.random() * this.H * 0.4 + 20, s: 2 + Math.random() * 3, ph: Math.random() * 6 });
    }
  }

  updateFx(dt) {
    for (const l of this.flock) l.t += dt;
    this.flock = this.flock.filter((l) => l.t < l.delay + l.life);
    return this.flock.length > 0;
  }

  drawBack(ctx) {
    super.drawBack(ctx);
    for (const l of this.flock) {
      const t = l.t - l.delay;
      if (t < 0) continue;
      const q = t / l.life;
      const x = l.x + Math.sin(t * 0.7 + l.sway) * 8 * (1 - q);
      const y = l.y - l.v * t * (1 + t * 0.02);
      const s = l.s * (1 - q * 0.6);
      const a = Math.min(1, t * 1.5) * (q > 0.7 ? (1 - q) / 0.3 : 1);
      if (y < -20) continue;
      const flick = 0.8 + 0.2 * Math.sin(this.time * 7 + l.sway * 5);
      ctx.save();
      ctx.globalCompositeOperation = 'lighter';
      const g = ctx.createRadialGradient(x, y, 0, x, y, s * 3.2);
      g.addColorStop(0, `rgba(255,180,80,${0.45 * a * flick})`);
      g.addColorStop(1, 'rgba(255,120,40,0)');
      ctx.fillStyle = g;
      ctx.fillRect(x - s * 3.2, y - s * 3.2, s * 6.4, s * 6.4);
      ctx.restore();
      ctx.globalAlpha = a;
      ctx.fillStyle = '#ffcf7a';
      ctx.beginPath(); ctx.moveTo(x - s * 0.5, y - s * 0.6); ctx.lineTo(x + s * 0.5, y - s * 0.6); ctx.lineTo(x + s * 0.38, y + s * 0.6); ctx.lineTo(x - s * 0.38, y + s * 0.6); ctx.closePath(); ctx.fill();
      ctx.globalAlpha = 1;
    }
  }
}
