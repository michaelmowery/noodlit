// Small shared helpers. Nothing environment-specific lives here.

export const clamp = (v, lo, hi) => (v < lo ? lo : v > hi ? hi : v);

export function smoothstep(e0, e1, x) {
  const t = clamp((x - e0) / (e1 - e0), 0, 1);
  return t * t * (3 - 2 * t);
}

export const easeInOut = (t) => (t < 0.5 ? 2 * t * t : 1 - Math.pow(-2 * t + 2, 2) / 2);

// Seeded PRNG so procedural scenery is identical across resizes.
export function mulberry32(seed) {
  let a = seed >>> 0;
  return function () {
    a = (a + 0x6d2b79f5) >>> 0;
    let t = a;
    t = Math.imul(t ^ (t >>> 15), t | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

export function makeCanvas(w, h) {
  const c = document.createElement('canvas');
  c.width = Math.max(1, Math.round(w));
  c.height = Math.max(1, Math.round(h));
  return c;
}

// Smooth value noise on a grid, returned as Float32Array in [0,1].
export function valueNoise(w, h, period, rand) {
  const gw = Math.ceil(w / period) + 2;
  const gh = Math.ceil(h / period) + 2;
  const grid = new Float32Array(gw * gh);
  for (let i = 0; i < grid.length; i++) grid[i] = rand();
  const out = new Float32Array(w * h);
  for (let y = 0; y < h; y++) {
    const gy = y / period, y0 = gy | 0, ty = smoothstep(0, 1, gy - y0);
    for (let x = 0; x < w; x++) {
      const gx = x / period, x0 = gx | 0, tx = smoothstep(0, 1, gx - x0);
      const a = grid[y0 * gw + x0], b = grid[y0 * gw + x0 + 1];
      const c = grid[(y0 + 1) * gw + x0], d = grid[(y0 + 1) * gw + x0 + 1];
      out[y * w + x] = (a + (b - a) * tx) * (1 - ty) + (c + (d - c) * tx) * ty;
    }
  }
  return out;
}

// ------------------------------------------------------------------ handwritten text
// Shared by every environment's prompts (intro) and typed text (setDraft), so writing
// looks and sits the same on every surface; each environment only decides how the
// rasterised letters turn into fog, grooves or ink.

export const HAND = '"Bradley Hand", "Segoe Print", "Noteworthy", ui-rounded, system-ui, sans-serif';

// Lay out `text` in the hand font. Prompts keep their own line breaks and shrink to fit;
// typed text (wrap: true) also word-wraps, shrinking towards minSize before it gives up.
export function layoutText(g, text, { size, minSize = size, maxWidth, weight = 300, wrap = false, maxLines = 4, pad = 0.14 }) {
  const setFont = (s) => { g.font = `${weight} ${s}px ${HAND}`; };
  const width = (ln) => g.measureText(ln).width;
  const breakLines = (s) => {
    setFont(s);
    if (!wrap) return text.split('\n');
    const out = [];
    for (const para of text.split('\n')) {
      let cur = '';
      for (const word of para.split(/ +/)) {
        const next = cur ? cur + ' ' + word : word;
        if (cur && width(next) > maxWidth) { out.push(cur); cur = word; } else cur = next;
      }
      out.push(cur);
    }
    return out;
  };
  let lines = breakLines(size);
  while (wrap && lines.length > maxLines && size > minSize) {
    size = Math.max(minSize, size * 0.9);
    lines = breakLines(size);
  }
  setFont(size);
  let widest = Math.max(...lines.map(width)) + size * pad;
  if (widest > maxWidth) { size *= maxWidth / widest; widest = maxWidth; setFont(size); }
  return { lines, size, widest, lh: size * 1.15 };
}

// Where a laid-out block goes. With x/y (a tap) it starts there, left-aligned, nudged to
// stay on screen; otherwise it's centred at `at` (fraction of height), like the prompts.
// top: `at` marks the first line rather than the middle of the block (text that hangs below something).
export function placeText(lay, { W, H, at, x, y, top = false, defaultAt = 0.42 }) {
  const block = (lay.lines.length - 1) * lay.lh;
  if (x != null && y != null) {
    return {
      align: 'left',
      x: clamp(x - lay.size * 0.12, 16, Math.max(16, W - 16 - lay.widest)),
      y0: clamp(y, 40 + lay.size * 0.5, Math.max(40 + lay.size * 0.5, H - 40 - block)),
    };
  }
  return {
    align: 'center',
    x: W / 2,
    y0: clamp(H * (at ?? defaultAt) - (top ? 0 : block / 2), 56 + lay.size * 0.6, H - 130 - block),
  };
}

// Outline width for text wiped into a fog/frost/snow surface. Those surfaces soften every edge,
// which thickens strokes, so typed text (smaller, on phones) gets a lighter outline and a little
// letter spacing or its e's and o's fill in. Prompts keep the heavier outline (`k` x size).
export function wipedTextLine(g, lay, opts, k = 0.07) {
  if (!opts.typed) return Math.max(2.5, lay.size * k);
  if ('letterSpacing' in g) g.letterSpacing = `${(lay.size * 0.05).toFixed(1)}px`;
  return Math.max(1.2, lay.size * 0.03);
}

export function drawText(g, lay, place, lineWidth) {
  g.textAlign = place.align;
  g.textBaseline = 'middle';
  g.lineWidth = lineWidth;
  g.lineCap = g.lineJoin = 'round';
  lay.lines.forEach((ln, n) => {
    const y = place.y0 + n * lay.lh;
    g.fillText(ln, place.x, y);
    g.strokeText(ln, place.x, y);
  });
}

// Typed text is a "draft" while the keyboard is open: it is held at full strength every
// frame so it can't fade (or be washed away) mid-sentence, and can be retyped or deleted
// without leaving traces. When typing is done the hold simply stops and it decays like
// any stroke. `put` records a value for a cell; `restore` puts back what was there before.
export class TextOverlay {
  constructor() { this.writes = new Map(); }
  put(arr, k, v) {
    let w = this.writes.get(arr);
    if (!w) this.writes.set(arr, (w = { arr, idx: [], val: [], base: [] }));
    w.idx.push(k); w.val.push(v); w.base.push(arr[k]);
  }
  apply() {
    for (const { arr, idx, val } of this.writes.values()) {
      for (let n = 0; n < idx.length; n++) if (val[n] > arr[idx[n]]) arr[idx[n]] = val[n];
    }
  }
  restore() {
    for (const { arr, idx, base } of this.writes.values()) {
      for (let n = 0; n < idx.length; n++) arr[idx[n]] = base[n];
    }
  }
}

// Layout + placement in one go. Prompts use the environment's own size; typed text
// (opts.typed) is a little smaller and wraps so a sentence fits on a phone. opts.scale shrinks
// typed text further (the demo's quoted prompt); opts.top hangs it below `at` (see placeText).
export function layoutFor(g, text, opts, { W, H, size, maxFrac = 0.82, weight = 300, defaultAt = 0.42, pad = 0.14 }) {
  const k = opts.scale || 1;
  const lay = layoutText(g, text, opts.typed
    ? { size: Math.min(W * 0.11, 54) * k, minSize: Math.min(26, W * 0.07) * k, maxWidth: W - 40, weight, wrap: true, pad }
    : { size, maxWidth: W * maxFrac, weight, pad });
  return { lay, place: placeText(lay, { W, H, at: opts.at, x: opts.x, y: opts.y, top: opts.top, defaultAt }) };
}

// Draft handling shared by every environment. An environment provides stampText(text, opts)
// -> { overlay, lay, place } and calls applyDrafts() in update() after its own decay.
// While typing, the current block is `draft`; tapping elsewhere starts a new block and the
// finished ones wait in `held`, still at full strength. commitDraft() lets them all go at once.
// Optional hooks: onDraftChange(), onCommit(blocks), onDrop().
export const draftMethods = {
  setDraft(text, opts = {}) {
    // On surfaces with undo (Release scenes), each typed block is one step: snapshot before
    // its first letter lands. Inlined rather than imported from undo.js to avoid a cycle.
    if (!this.draft && !this.undoMarked && text.trim()) this.undoMarked = !!this.undoPush?.();
    this.draft?.overlay.restore();
    this.draft = text.trim() ? this.stampText(text, { ...opts, typed: true }) : null;
    this.onDraftChange?.();
    this.draft?.overlay.apply();
  },
  nextDraft() {
    if (this.undoMarked && !this.draft) this.undoDrop?.();
    this.undoMarked = false;
    if (this.draft) (this.held ||= []).push(this.draft);
    this.draft = null;
  },
  commitDraft() {
    if (this.undoMarked && !this.draft) this.undoDrop?.();
    this.undoMarked = false;
    const blocks = [...(this.held || []), ...(this.draft ? [this.draft] : [])];
    this.held = [];
    this.draft = null;
    if (blocks.length) this.onCommit?.(blocks);
  },
  dropDraft() {
    this.draft?.overlay.restore();
    for (const d of (this.held || []).reverse()) d.overlay.restore();
    this.draft = null;
    this.held = [];
    this.undoMarked = false;
    this.onDrop?.();
  },
  hasDrafts() { return !!this.draft || !!this.held?.length; },
  applyDrafts() {
    if (!this.hasDrafts()) return false;
    for (const d of this.held || []) d.overlay.apply();
    this.draft?.overlay.apply();
    return true;
  },
};
