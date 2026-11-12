// Shared machinery for Release surfaces (everything except Stream, which came first).
//
// A Release surface is a storybook scene plus one "sheet" you draw on: a piece of paper,
// a lantern panel, a leaf, a balloon. Nothing fades. When you let it go (drag the orange
// handle, or tap the clear button) the scene carries the sheet off in its own way, and a
// fresh sheet arrives a moment later.
//
// A scene subclass provides:
//   layout()                     -> { x, y, w, h }  where the sheet sits (CSS px)
//   paintScene()                 -> canvas           static background at full resolution
//   paintSheet(w, h, dpr, seed)  -> { canvas, shape } sheet texture and its outline mask
//   launch(f)                    set up a released sheet `f` (f.from = its centre)
//   carry(f, dt) -> boolean      move it along (set f.x, f.y, f.s, f.a, f.alpha); false when gone
// and optionally:
//   drawCarried(ctx, f)          default: the sheet itself at f's transform
//   drawBack(ctx) / drawFront(ctx)   animated scenery behind the sheet / over everything
//   updateFx(dt) -> boolean      advance scenery; true while it still needs frames
//   tapScene(x, y)               a tap that missed the sheet
//   textArea()                   -> { x, y, w, h } in sheet coordinates, where words fit
// Config fields (set in the subclass constructor): ink (the default colour; the shell can
// change it with setInk from the scene's palette), handleSide ('right'|'top'|'bottom'),
// arriveFrom { x, y } (offset the new sheet slides in from), washUpAt, washUp, grain (0..1).

import { clamp, easeInOut, mulberry32, makeCanvas, valueNoise, layoutText, drawText, HAND } from './util.js';
import { sfx } from './sound.js';

const SIDES = {
  right: { dx: 1, dy: 0, angle: 0 },
  top: { dx: 0, dy: -1, angle: -Math.PI / 2 },
  bottom: { dx: 0, dy: 1, angle: Math.PI / 2 },
};

export class ReleaseScene {
  constructor(seed = 1) {
    this.strokes = new Map();
    this.time = 0;
    this.carried = [];
    this.sheet = null;
    this.drag = null;
    this.drafts = { base: null, held: [], cur: null };
    this.rand = mulberry32(seed);
    this.ink = '#2a2320';
    this.handleSide = 'right';
    this.arriveFrom = { x: -60, y: 0 };
    this.washUpAt = 1.4;
    this.washUp = 0.8;
    this.grain = 1;
  }

  // ---------------------------------------------------------------- setup
  resize({ width, height, dpr }) {
    const old = this.sheet;
    this.drafts = { base: null, held: [], cur: null };
    Object.assign(this, { W: width, H: height, dpr });
    this.rect = this.layout();
    this.setup?.();
    this.scene = this.paintScene();
    this.grainPattern = makeCanvas(1, 1).getContext('2d').createPattern(paintGrain(this.grain), 'repeat');
    this.sheet = this.newSheet();
    if (old) {
      const g = this.sheet.inkCtx;
      g.save(); g.setTransform(1, 0, 0, 1, 0, 0);
      g.drawImage(old.ink, 0, 0, this.sheet.ink.width, this.sheet.ink.height);
      g.restore();
      this.sheet.inked = old.inked;
    }
    this.carried = [];
  }

  newSheet() {
    const { w, h } = this.rect;
    const seed = (this.rand() * 1e9) | 0;
    const tex = this.paintSheet(w, h, this.dpr, seed);
    const ink = makeCanvas(w * this.dpr, h * this.dpr);
    const inkCtx = ink.getContext('2d');
    inkCtx.setTransform(this.dpr, 0, 0, this.dpr, 0, 0);
    inkCtx.lineCap = inkCtx.lineJoin = 'round';
    inkCtx.strokeStyle = inkCtx.fillStyle = this.ink;
    const comp = makeCanvas(w * this.dpr, h * this.dpr);
    return { tex: tex.canvas, shape: tex.shape, ink, inkCtx, comp, inked: false, dirty: true, offX: 0, offY: 0, arrive: 1, seed };
  }

  setFadeSeconds() {}
  setPaused() {}

  // New strokes and typed words use this colour; what's already on the sheet keeps its own.
  setInk(color) {
    this.ink = color;
    const g = this.sheet?.inkCtx;
    if (g) g.strokeStyle = g.fillStyle = color;
  }

  // ---------------------------------------------------------------- input
  handleRect() {
    const s = this.sheet, r = this.rect;
    const thick = 30, long = Math.min(96, (this.handleSide === 'right' ? r.h : r.w) * 0.3);
    const a = this.handleAnchor?.() || null;
    let cx, cy, w, h;
    if (this.handleSide === 'right') { cx = a ? a.x : r.x + r.w - thick * 0.05; cy = a ? a.y : r.y + r.h / 2; w = thick; h = long; }
    else if (this.handleSide === 'top') { cx = a ? a.x : r.x + r.w / 2; cy = a ? a.y : r.y + thick * 0.05; w = long; h = thick; }
    else { cx = a ? a.x : r.x + r.w / 2; cy = a ? a.y : r.y + r.h - thick * 0.05; w = long; h = thick; }
    return { x: cx - w / 2 + s.offX, y: cy - h / 2 + s.offY, w, h, cx: cx + s.offX, cy: cy + s.offY, long, thick };
  }

  strokeStart(id, x, y, info) {
    const s = this.sheet;
    if (s && s.arrive >= 1 && !this.drag) {
      const hr = this.handleRect();
      if (x > hr.x - 14 && x < hr.x + hr.w + 14 && y > hr.y - 14 && y < hr.y + hr.h + 14) {
        this.drag = { id, sx: x, sy: y };
        return;
      }
      const lx = x - this.rect.x, ly = y - this.rect.y;
      if (lx >= 0 && ly >= 0 && lx <= this.rect.w && ly <= this.rect.h) {
        const r = this.radiusFor(info);
        this.strokes.set(id, { x: lx, y: ly, r });
        const g = s.inkCtx;
        g.beginPath(); g.arc(lx, ly, r, 0, Math.PI * 2); g.fill();
        s.inked = true; s.dirty = true;
        return;
      }
    }
    this.tapScene?.(x, y);
  }

  strokeMove(id, x, y, info) {
    if (this.drag && this.drag.id === id) {
      const s = this.sheet, d = SIDES[this.handleSide];
      const mx = x - this.drag.sx, my = y - this.drag.sy;
      const along = Math.max(0, mx * d.dx + my * d.dy);
      const across = clamp((mx * -d.dy + my * d.dx) * 0.35, -30, 30);
      s.offX = d.dx * along - d.dy * across;
      s.offY = d.dy * along + d.dx * across;
      s.dirty = true;
      return;
    }
    const st = this.strokes.get(id);
    if (!st || !this.sheet) return;
    const lx = x - this.rect.x, ly = y - this.rect.y;
    if (Math.hypot(lx - st.x, ly - st.y) < 0.75) return;
    const r = st.r + (this.radiusFor(info) - st.r) * 0.25;
    const g = this.sheet.inkCtx;
    g.lineWidth = st.r + r;
    g.beginPath(); g.moveTo(st.x, st.y); g.lineTo(lx, ly); g.stroke();
    Object.assign(st, { x: lx, y: ly, r });
    this.sheet.dirty = true;
  }

  strokeEnd(id) {
    if (this.drag && this.drag.id === id) {
      const s = this.sheet, d = SIDES[this.handleSide];
      const along = s.offX * d.dx + s.offY * d.dy;
      const span = this.handleSide === 'right' ? this.rect.w : this.rect.h;
      this.drag = null;
      if (along > Math.min(120, span * 0.28)) this.release();
      else s.spring = true;
      return;
    }
    this.strokes.delete(id);
  }

  radiusFor(info) {
    return info.pointerType === 'pen' ? 1.4 + 2 * (info.pressure || 0.5)
         : info.pointerType === 'mouse' ? 2.6 : 3.2;
  }

  // ---------------------------------------------------------------- release
  clear() { this.release(); }

  release() {
    const s = this.sheet;
    if (!s || s.arrive < 1) return;
    this.strokes.clear();
    this.drag = null;
    this.drafts = { base: null, held: [], cur: null };
    this.compose(s);
    const { x, y, w, h } = this.rect;
    const f = {
      sheet: s, t: 0, seed: this.rand() * 10,
      from: { x: x + w / 2 + s.offX, y: y + h / 2 + s.offY },
      x: x + w / 2 + s.offX, y: y + h / 2 + s.offY, s: 1, a: 0, alpha: 1,
    };
    sfx.cue('release');
    this.launch(f);
    this.carried.push(f);
    this.sheet = null;
    this.washAt = this.time + this.washUpAt;
  }

  // ---------------------------------------------------------------- time
  update(dt) {
    this.time += dt;
    let active = false;
    const s = this.sheet;
    if (s) {
      if (s.arrive < 1) { s.arrive = Math.min(1, s.arrive + dt / this.washUp); active = true; }
      if (s.spring) {
        const k = Math.min(1, dt * 12);
        s.offX += (0 - s.offX) * k; s.offY += (0 - s.offY) * k;
        if (Math.abs(s.offX) < 0.5 && Math.abs(s.offY) < 0.5) { s.offX = s.offY = 0; s.spring = false; }
        active = true;
      }
      if (this.drag) active = true;
    } else if (this.time >= this.washAt) {
      this.sheet = this.newSheet();
      this.sheet.arrive = 0;
      sfx.cue('arrive');
      active = true;
    } else active = true;

    for (const f of this.carried) { f.t += dt; f.alive = this.carry(f, dt); }
    this.carried = this.carried.filter((f) => f.alive);
    if (this.carried.length) active = true;
    if (this.updateFx?.(dt)) active = true;
    return active;
  }

  // ---------------------------------------------------------------- draw
  compose(s) {
    if (!s.dirty) return;
    const g = s.comp.getContext('2d');
    g.setTransform(1, 0, 0, 1, 0, 0);
    g.globalCompositeOperation = 'copy';
    g.drawImage(s.ink, 0, 0);
    // Ink never covers perfectly: knock a little grain out of it.
    g.globalCompositeOperation = 'destination-out';
    g.fillStyle = this.grainPattern;
    g.fillRect(0, 0, s.comp.width, s.comp.height);
    g.globalCompositeOperation = 'destination-in';
    g.drawImage(s.shape, 0, 0);
    g.globalCompositeOperation = 'destination-over';
    g.drawImage(s.tex, 0, 0);
    g.globalCompositeOperation = 'source-over';
    s.dirty = false;
  }

  // The sheet centred at (cx, cy), scaled and rotated, in CSS px.
  drawSheetAt(ctx, s, cx, cy, scale = 1, angle = 0, alpha = 1, shadow = 0.3) {
    const { w, h } = this.rect;
    this.compose(s);
    ctx.save();
    ctx.globalAlpha = alpha;
    ctx.translate(cx, cy);
    ctx.rotate(angle);
    ctx.scale(scale, scale);
    if (shadow) {
      ctx.shadowColor = `rgba(15,20,30,${shadow})`;
      ctx.shadowBlur = 14 * scale;
      ctx.shadowOffsetY = 6 * scale;
    }
    ctx.drawImage(s.comp, -w / 2, -h / 2, w, h);
    ctx.restore();
  }

  drawCarried(ctx, f) {
    this.drawSheetAt(ctx, f.sheet, f.x, f.y, f.s, f.a, f.alpha);
  }

  render(ctx) {
    const { dpr, rect } = this;
    ctx.setTransform(1, 0, 0, 1, 0, 0);
    ctx.drawImage(this.scene, 0, 0);
    ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
    this.drawBack?.(ctx);

    const s = this.sheet;
    if (s) {
      const p = easeInOut(s.arrive);
      const lifted = this.drag || Math.hypot(s.offX, s.offY) > 1 ? 1 : 0;
      ctx.save();
      ctx.globalAlpha = Math.min(1, 0.15 + p);
      ctx.translate(rect.x + rect.w / 2 + s.offX + (1 - p) * this.arriveFrom.x, rect.y + rect.h / 2 + s.offY + (1 - p) * this.arriveFrom.y);
      ctx.rotate((1 - p) * -0.05);
      this.compose(s);
      ctx.shadowColor = 'rgba(15,20,30,0.32)';
      ctx.shadowBlur = 16 + lifted * 14;
      ctx.shadowOffsetY = 6 + lifted * 8;
      ctx.drawImage(s.comp, -rect.w / 2, -rect.h / 2, rect.w, rect.h);
      ctx.restore();
      if (p >= 1) drawHandle(ctx, this.handleRect(), SIDES[this.handleSide].angle, !!this.drag);
    }
    // Whatever was let go travels over the fresh sheet as it arrives.
    for (const f of this.carried) this.drawCarried(ctx, f);
    this.drawFront?.(ctx);
    ctx.setTransform(1, 0, 0, 1, 0, 0);
  }

  // ---------------------------------------------------------------- text
  textArea() {
    const { w, h } = this.rect;
    return { x: 20, y: 22, w: w - 40, h: h - 44 };
  }

  layoutOnSheet(text, opts, typed) {
    const a = this.textArea();
    const g = this.sheet.inkCtx;
    const lay = typed
      ? layoutText(g, text, { size: Math.min(a.w * 0.13, 46), minSize: Math.min(20, a.w * 0.08), maxWidth: a.w, weight: 400, wrap: true, maxLines: 6, pad: 0 })
      : layoutText(g, text, { size: Math.min(a.w * 0.15, 54), maxWidth: a.w, weight: 400, pad: 0 });
    const ink = this.ink;
    const block = (lay.lines.length - 1) * lay.lh;
    const top = a.y + lay.size * 0.5, bottom = Math.max(top, a.y + a.h - lay.size * 0.5 - block);
    let place;
    if (opts.x != null && opts.y != null) {
      place = {
        align: 'left',
        x: clamp(opts.x - this.rect.x, a.x, Math.max(a.x, a.x + a.w - lay.widest)),
        y0: clamp(opts.y - this.rect.y, top, bottom),
      };
    } else {
      const cy = opts.at != null ? this.H * opts.at - this.rect.y : a.y + a.h * 0.4;
      place = { align: 'center', x: a.x + a.w / 2, y0: clamp(cy - block / 2, top, bottom) };
    }
    return { lay, place, ink };
  }

  writeOnSheet({ lay, place, ink }, alpha) {
    const g = this.sheet.inkCtx;
    g.save();
    g.globalAlpha = alpha;
    g.fillStyle = g.strokeStyle = ink || this.ink;
    g.font = `400 ${lay.size}px ${HAND}`;
    drawText(g, lay, place, Math.max(1.4, lay.size * 0.04));
    g.restore();
    this.sheet.inked = true;
    this.sheet.dirty = true;
  }

  intro(text, opts = {}) {
    if (!this.sheet) return;
    this.writeOnSheet(this.layoutOnSheet(text, opts, false), 0.5);
  }

  // Typing: words land on the sheet as you type and stay there until you let it go.
  setDraft(text, opts = {}) {
    const s = this.sheet;
    if (!s) return;
    const d = this.drafts;
    if (!d.base) {
      d.base = makeCanvas(s.ink.width, s.ink.height);
      d.base.getContext('2d').drawImage(s.ink, 0, 0);
    }
    d.cur = text.trim() ? this.layoutOnSheet(text, opts, true) : null;
    const g = s.inkCtx;
    g.save(); g.setTransform(1, 0, 0, 1, 0, 0); g.globalCompositeOperation = 'copy'; g.drawImage(d.base, 0, 0); g.restore();
    for (const blk of [...d.held, ...(d.cur ? [d.cur] : [])]) this.writeOnSheet(blk, 1);
    s.dirty = true;
  }

  nextDraft() {
    if (this.drafts.cur) this.drafts.held.push(this.drafts.cur);
    this.drafts.cur = null;
  }

  commitDraft() { this.drafts = { base: null, held: [], cur: null }; }

  dispose() {}
}

// ------------------------------------------------------------------ helpers
// The orange "let it go" handle; chevrons point the way to drag.
export function drawHandle(ctx, r, angle, active) {
  ctx.save();
  ctx.translate(r.cx, r.cy);
  ctx.rotate(angle);
  const w = r.thick, h = r.long;
  ctx.shadowColor = 'rgba(60,30,0,0.35)';
  ctx.shadowBlur = active ? 14 : 8;
  ctx.shadowOffsetY = 3;
  ctx.fillStyle = active ? '#ff9a3d' : '#f58a2e';
  roundRect(ctx, -w / 2, -h / 2, w, h, w / 2);
  ctx.fill();
  ctx.shadowColor = 'transparent';
  ctx.strokeStyle = '#fff6ea';
  ctx.lineWidth = 2.2;
  ctx.lineCap = ctx.lineJoin = 'round';
  for (const dy of [-8, 8]) {
    ctx.beginPath(); ctx.moveTo(-4, dy - 5); ctx.lineTo(3, dy); ctx.lineTo(-4, dy + 5); ctx.stroke();
  }
  ctx.restore();
}

export function roundRect(ctx, x, y, w, h, r) {
  ctx.beginPath();
  ctx.moveTo(x + r, y);
  ctx.arcTo(x + w, y, x + w, y + h, r);
  ctx.arcTo(x + w, y + h, x, y + h, r);
  ctx.arcTo(x, y + h, x, y, r);
  ctx.arcTo(x, y, x + w, y, r);
  ctx.closePath();
}

// Fit a sheet into a w x h box keeping aspect `ratio` (w/h), centred at the bottom of the box.
export function fitRect(x, y, w, h, ratio) {
  let fw = w, fh = w / ratio;
  if (fh > h) { fh = h; fw = h * ratio; }
  return { x: x + (w - fw) / 2, y: y + (h - fh) / 2, w: fw, h: fh };
}

// A sheet of paper with a slightly wobbly or torn outline. Returns { canvas, shape }.
// paint(g, w, h, rand) fills the texture; outline(g, w, h, rand) traces the path.
export function paintPaper(w, h, dpr, seed, paint, outline) {
  const rand = mulberry32(seed);
  const cw = w * dpr, ch = h * dpr;
  const shape = makeCanvas(cw, ch), sg = shape.getContext('2d');
  sg.scale(dpr, dpr);
  outline(sg, w, h, rand);
  sg.fillStyle = '#000';
  sg.fill();
  const c = makeCanvas(cw, ch), g = c.getContext('2d');
  g.scale(dpr, dpr);
  paint(g, w, h, rand);
  g.globalCompositeOperation = 'destination-in';
  g.setTransform(1, 0, 0, 1, 0, 0);
  g.drawImage(shape, 0, 0);
  return { canvas: c, shape };
}

// Rectangle with rough, torn-looking edges.
export function tornOutline(rough = 3, corner = 6) {
  return (g, w, h, rand) => {
    const edge = (x0, y0, x1, y1, n) => {
      for (let i = 1; i <= n; i++) {
        const t = i / n;
        const jx = (y1 - y0) ? (rand() - 0.5) * rough * 2 : 0;
        const jy = (x1 - x0) ? (rand() - 0.5) * rough * 2 : 0;
        g.lineTo(x0 + (x1 - x0) * t + jx, y0 + (y1 - y0) * t + jy);
      }
    };
    const m = rough + 1;
    g.beginPath();
    g.moveTo(m + corner, m);
    edge(m + corner, m, w - m, m, Math.ceil(w / 9));
    edge(w - m, m, w - m, h - m, Math.ceil(h / 9));
    edge(w - m, h - m, m, h - m, Math.ceil(w / 9));
    edge(m, h - m, m, m + corner, Math.ceil(h / 9));
    g.closePath();
  };
}

// Soft fibrous paper texture over a base colour.
export function paperFibres(g, w, h, rand, base, fibre = 'rgba(120,100,70,0.06)') {
  g.fillStyle = base;
  g.fillRect(0, 0, w, h);
  g.strokeStyle = fibre;
  g.lineWidth = 0.7;
  for (let i = 0; i < (w * h) / 900; i++) {
    const x = rand() * w, y = rand() * h, a = rand() * Math.PI, l = 3 + rand() * 8;
    g.beginPath(); g.moveTo(x, y); g.lineTo(x + Math.cos(a) * l, y + Math.sin(a) * l); g.stroke();
  }
}

// Tiny tile of uneven ink coverage. strength 1 = charcoal, lower = smoother pen.
function paintGrain(strength) {
  const rand = mulberry32(9);
  const n = 96, c = makeCanvas(n, n), g = c.getContext('2d');
  const img = g.createImageData(n, n);
  const soft = valueNoise(n, n, 5, rand);
  for (let i = 0; i < n * n; i++) {
    const a = (0.04 + 0.2 * soft[i] + 0.25 * rand() * rand()) * strength;
    img.data[i * 4 + 3] = a * 255;
  }
  g.putImageData(img, 0, 0);
  return c;
}

// Fluffy storybook cloud.
export function cloud(g, x, y, r, color = '#ffffff') {
  g.fillStyle = color;
  for (const [dx, dy, k] of [[-1.1, 0.15, 0.6], [-0.45, -0.25, 0.8], [0.35, -0.15, 0.75], [1, 0.15, 0.55], [0, 0.25, 0.7]]) {
    g.beginPath(); g.arc(x + dx * r, y + dy * r, k * r, 0, Math.PI * 2); g.fill();
  }
}
