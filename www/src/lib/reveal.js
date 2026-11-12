// Shared machinery for Reveal surfaces: something is hidden under a cover, and your finger
// takes the cover off.
//
//   1. Under.  A finished picture, painted once (paintUnder).
//   2. Cover.  A layer over all of it (paintCover): black wax, mist on glass…
//   3. Reveal. Strokes rub the cover away (soft-edged if `soft` is set) and what's under shows
//              through. Typed words are cut out of the cover in the shape of the letters.
//   4. Clear.  The tray button puts a fresh cover on (and next() can change what's under it).
//
// Nothing fades and nothing moves on its own, so the shell hides fade speed and Hold.
//
// A scene subclass provides paintUnder() -> canvas (full-res) and paintCover(g) (CSS px), and
// may set: brush (stroke radius), soft (0..1: how feathered the rubbed edge is), deal ('sweep'
// or 'fade': how a fresh cover arrives), cue (sound for it), revealCaption, freshCaption (Show me's captions).
// Optional hooks: next() before a fresh cover is painted, rubbed(x, y, r) after each mark,
// lifted(stroke) when a finger lifts, tick(dt) -> boolean for animation of its own.

import { smoothstep, makeCanvas, layoutFor, drawText, draftMethods, HAND } from './util.js';
import { sfx } from './sound.js';

const NO_OVERLAY = { apply() {}, restore() {} }; // drafts are drawn live, not stamped into a map
const DEAL = 0.7;

export class RevealScene {
  constructor(o = {}) {
    this.ink = o.ink || '#ffffff';
    this.brush = o.brush ?? 6;
    this.soft = o.soft ?? 0;
    this.dealStyle = o.deal || 'sweep';
    this.cue = o.cue || 'fold';
    this.revealCaption = o.revealCaption;
    this.freshCaption = o.freshCaption;
    this.textWeight = o.textWeight ?? 600;
    this.strokes = new Map();
    this.deal = null;   // { t, under, cover } while a fresh cover arrives
    this.calm = typeof matchMedia === 'function' && matchMedia('(prefers-reduced-motion: reduce)').matches;
  }

  get clearing() { return !!this.deal; }

  // ---------------------------------------------------------------- setup
  resize({ width, height, dpr }) {
    this.dropDraft();
    Object.assign(this, { W: width, H: height, dpr });
    this.under = this.paintUnder();
    this.cover = this.coat();
    this.pattern = null;
    this.deal = null;
    this.strokes.clear();
    this.setup?.();
  }

  coat() {
    const c = makeCanvas(this.W * this.dpr, this.H * this.dpr), g = c.getContext('2d');
    g.setTransform(this.dpr, 0, 0, this.dpr, 0, 0);
    g.lineCap = g.lineJoin = 'round';
    c.g = g;
    this.paintCover(g);
    return c;
  }

  setFadeSeconds() {}
  setPaused() {}

  // The ink picker chooses what's underneath: it changes at once, wherever it already shows.
  setInk(color) {
    if (color === this.ink) return;
    this.ink = color;
    if (!this.W) return;
    this.under = this.paintUnder();
    this.pattern = null;
  }

  // ---------------------------------------------------------------- strokes
  radiusFor(info) {
    const b = this.brush;
    return info.pointerType === 'pen' ? b * (0.5 + 0.9 * (info.pressure || 0.5))
         : info.pointerType === 'mouse' ? b * 0.85 : b;
  }

  rub(x0, y0, x1, y1, r) {
    const g = this.cover.g;
    g.save();
    g.globalCompositeOperation = 'destination-out';
    if (this.soft) {
      // A feathered edge: a narrower line whose shadow does the rest of the rubbing.
      g.shadowColor = '#000';
      g.shadowBlur = r * this.soft * this.dpr;
      g.lineWidth = r * 2 * (1 - this.soft * 0.4);
    } else g.lineWidth = r * 2;
    g.beginPath(); g.moveTo(x0, y0); g.lineTo(x1 + 0.01, y1); g.stroke();
    g.restore();
    this.rubbed?.(x1, y1, r);
  }

  strokeStart(id, x, y, info) {
    if (this.deal) return;
    const r = this.radiusFor(info, 0);
    this.strokes.set(id, { x, y, r, t: info.time });
    this.rub(x, y, x, y, r);
  }

  strokeMove(id, x, y, info) {
    const s = this.strokes.get(id);
    if (!s) return;
    const d = Math.hypot(x - s.x, y - s.y);
    if (d < 0.75) return;
    const speed = (d / Math.max(4, info.time - s.t)) * 1000;
    const r = s.r + (this.radiusFor(info, speed) - s.r) * 0.25;
    this.rub(s.x, s.y, x, y, r);
    Object.assign(s, { x, y, r, t: info.time });
  }

  strokeEnd(id) {
    const s = this.strokes.get(id);
    if (!s) return;
    this.strokes.delete(id);
    this.lifted?.(s);
  }

  // ---------------------------------------------------------------- fresh cover
  clear() {
    if (this.deal) return;
    this.commitDraft();
    this.strokes.clear();
    this.next?.();
    this.deal = { t: 0, under: this.paintUnder(), cover: this.coat() };
    sfx.cue(this.cue, this.cueOpts || {});
  }

  // ---------------------------------------------------------------- time
  update(dt) {
    let alive = false;
    if (this.deal) {
      this.deal.t += dt;
      if (this.deal.t >= DEAL) {
        this.under = this.deal.under;
        this.cover = this.deal.cover;
        this.pattern = null;
        this.deal = null;
      }
      alive = true;
    }
    if (this.tick?.(dt)) alive = true;
    if (this.hasDrafts()) alive = true;
    return alive;
  }

  // ---------------------------------------------------------------- draw
  render(ctx) {
    const { W, H, dpr } = this;
    ctx.setTransform(1, 0, 0, 1, 0, 0);
    ctx.drawImage(this.under, 0, 0);
    ctx.globalAlpha = this.cover.alpha ?? 1; // a cover can lift off as a whole
    ctx.drawImage(this.cover, 0, 0);
    ctx.globalAlpha = 1;
    ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
    for (const d of this.held || []) this.drawBlock(ctx, d);
    if (this.draft) this.drawBlock(ctx, this.draft);
    this.drawFront?.(ctx);

    if (this.deal) {
      const u = smoothstep(0, 1, this.deal.t / DEAL);
      ctx.save();
      if (this.dealStyle === 'fade') ctx.globalAlpha = u;
      else {
        // The fresh one sweeps across from the left with a glint on its leading edge.
        ctx.beginPath(); ctx.rect(0, 0, W * u, H); ctx.clip();
      }
      ctx.setTransform(1, 0, 0, 1, 0, 0);
      // (A cover that fades in, like mist, mustn't flash what's under it on the way.)
      if (this.dealStyle !== 'fade') ctx.drawImage(this.deal.under, 0, 0);
      ctx.drawImage(this.deal.cover, 0, 0);
      ctx.restore();
      if (this.dealStyle !== 'fade') {
        const edge = W * u, gl = ctx.createLinearGradient(edge - 46, 0, edge, 0);
        gl.addColorStop(0, 'rgba(255,255,255,0)');
        gl.addColorStop(1, 'rgba(255,255,255,0.4)');
        ctx.fillStyle = gl;
        ctx.fillRect(edge - 46, 0, 46, H);
      }
    }
    ctx.setTransform(1, 0, 0, 1, 0, 0);
  }

  // ---------------------------------------------------------------- text
  intro(text, opts = {}) { this.onCommit([this.stampText(text, opts)]); }

  stampText(text, opts) {
    const { lay, place } = layoutFor(this.cover.g, text, opts, {
      W: this.W, H: this.H, size: Math.min(this.W * 0.15, 76), weight: this.textWeight,
    });
    return { overlay: NO_OVERLAY, lay, place };
  }

  // While typing, the letters already show what's under them (they're filled with it); on
  // Done they're cut out of the cover for real.
  drawBlock(g, { lay, place }) {
    if (!this.pattern) {
      this.pattern = g.createPattern(this.under, 'no-repeat');
      this.pattern.setTransform(new DOMMatrix().scale(1 / this.dpr));
    }
    g.save();
    g.fillStyle = g.strokeStyle = this.pattern;
    g.font = `${this.textWeight} ${lay.size}px ${HAND}`;
    drawText(g, lay, place, Math.max(1.4, lay.size * 0.06));
    g.restore();
  }

  onCommit(blocks) {
    const g = this.cover.g;
    for (const { lay, place } of blocks) {
      g.save();
      g.globalCompositeOperation = 'destination-out';
      g.fillStyle = g.strokeStyle = '#000';
      g.font = `${this.textWeight} ${lay.size}px ${HAND}`;
      drawText(g, lay, place, Math.max(1.4, lay.size * 0.06));
      g.restore();
    }
  }

  dispose() {}
}

Object.assign(RevealScene.prototype, draftMethods);
