// Turn a laid-out block of typed text into points, for scenes whose marks are made of
// particles rather than pixels (moss clumps, drops of milk).

import { makeCanvas, drawText, HAND } from './util.js';

// block: { lay, place } from layoutFor. Returns a flat [x, y, x, y, …] in CSS px, one point per
// `step` px of letter.
export function textDots(W, H, { lay, place }, weight = 400, step = 3) {
  const c = makeCanvas(W / step, H / step), g = c.getContext('2d', { willReadFrequently: true });
  g.scale(1 / step, 1 / step);
  g.fillStyle = g.strokeStyle = '#fff';
  g.font = `${weight} ${lay.size}px ${HAND}`;
  drawText(g, lay, place, Math.max(1, lay.size * 0.03));
  const px = g.getImageData(0, 0, c.width, c.height).data;
  const out = [];
  for (let j = 0; j < c.height; j++) {
    for (let i = 0; i < c.width; i++) {
      if (px[(j * c.width + i) * 4 + 3] > 110) out.push((i + 0.5) * step, (j + 0.5) * step);
    }
  }
  return out;
}
