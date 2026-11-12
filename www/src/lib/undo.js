// Undo for Release surfaces: take back the last stroke or typed block, one at a time.
//
// Nothing fades on a Release surface, so a drawing is just its pixels (plus, for map-based
// scenes, a map of where the marks are). Before each stroke or typed block the surface keeps
// a snapshot of that state; undo puts the newest one back. Letting the drawing go (or
// erasing the board) forgets them all, since there is nothing left to take back.
//
// A surface mixes in undoMethods and provides:
//   undoSnapshot()      -> a snapshot of what can be undone, or null when there's nothing to draw on
//   undoRestore(snap)   put a snapshot back
// and optionally:
//   undoReady()         -> false while undo makes no sense (a sheet still arriving, an eraser mid-wipe)
// It calls undoPush() just before a mark lands (a stroke's first touch, a typed block's first
// letter), undoDrop() if that block came to nothing, and undoReset() when it lets go.

import { makeCanvas } from './util.js';

// At most this many steps, and no more snapshot memory than BUDGET (a full-screen board on a
// big phone keeps fewer steps than a small sheet of paper).
const LIMIT = 30;
const BUDGET = 64e6;

export function snapshotBytes(snap) {
  let n = 0;
  for (const v of Object.values(snap)) {
    if (v?.byteLength) n += v.byteLength;
    else if (v?.width && v?.height) n += v.width * v.height * 4;
  }
  return n;
}

export const undoMethods = {
  undoPush() {
    const snap = this.undoSnapshot();
    if (!snap) return false;
    snap.bytes = snapshotBytes(snap);
    const st = (this.undoStack ||= []);
    st.push(snap);
    let total = st.reduce((n, s) => n + s.bytes, 0);
    while (st.length > 1 && (st.length > LIMIT || total > BUDGET)) total -= st.shift().bytes;
    this.undoPushes = (this.undoPushes || 0) + 1;
    return true;
  },
  undoDrop() { this.undoStack?.pop(); },
  undoReset() { if (this.undoStack) this.undoStack.length = 0; },
  canUndo() {
    return !!this.undoStack?.length && !this.strokes?.size && this.undoReady?.() !== false;
  },
  undo() {
    if (!this.canUndo()) return false;
    this.undoRestore(this.undoStack.pop());
    return true;
  },
  // How many snapshots have ever been taken, so the shell can tell what one gesture added.
  undoCount() { return this.undoPushes || 0; },
};

export function copyCanvas(c) {
  const k = makeCanvas(c.width, c.height);
  k.getContext('2d').drawImage(c, 0, 0);
  return k;
}

// Replace dst's pixels with src's (scaled if the surface was resized in between).
export function pasteCanvas(dst, src) {
  const g = dst.getContext('2d');
  g.save();
  g.setTransform(1, 0, 0, 1, 0, 0);
  g.globalCompositeOperation = 'copy';
  g.drawImage(src, 0, 0, dst.width, dst.height);
  g.restore();
}

// Copy b into a when they are the same size (a resize in between makes old maps meaningless).
export function restoreArray(a, b) {
  if (a && b && a.length === b.length) a.set(b);
}

// Typed text: a block becomes one undo step when its first letter lands. Call from setDraft
// before redrawing (`had` = a block is already in progress), and from nextDraft/commitDraft.
export function markTypedBlock(o, text, had) {
  if (!had && !o.undoMarked && text.trim()) o.undoMarked = !!o.undoPush?.();
}
export function endTypedBlock(o, had) {
  if (o.undoMarked && !had) o.undoDrop?.(); // the block was emptied again: nothing to take back
  o.undoMarked = false;
}
