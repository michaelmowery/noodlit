// Rainbow ink (a Plus feature, see plus.js): the colour walks round the colour wheel as you
// draw, about once every RAINBOW_LAP px of line, and carries on from where it left off at the
// next stroke. Its brightness is matched to the scene's own inks, so on parchment it is a
// rainbow of deep pen inks and on a night sky a rainbow of bright glows.
//
// The hue moves in STEPS small steps rather than continuously. Scenes that remember each
// line's colour (Become, Stir, Echo) start a fresh piece of line when the ink changes, so
// steps keep that to one piece every ~20 px, which still reads as a smooth blend.

const RAINBOW_LAP = 1100; // px of drawing for one trip round the wheel
const STEPS = 54;

export const RAINBOW = 'rainbow'; // what's saved as the scene's ink

// A palette's lightness and saturation, roughly: the average of its inks, kept in a range
// where every hue still looks like itself.
function tone(palette) {
  let l = 0, s = 0;
  for (const { color } of palette) {
    const [, sat, lig] = hexToHsl(color);
    l += lig; s += sat;
  }
  l /= palette.length; s /= palette.length;
  return { l: Math.min(0.68, Math.max(0.34, l)), s: Math.min(0.9, Math.max(0.62, s + 0.25)) };
}

export function createRainbow() {
  let travelled = 0;
  let look = { l: 0.6, s: 0.85 };
  let step = -1;
  const last = new Map(); // pointerId -> { x, y }
  return {
    // Match the scene's inks. Returns the colour to start with.
    tune(palette) { look = tone(palette); step = -1; return this.color(); },
    color() {
      step = Math.floor((travelled / RAINBOW_LAP) * STEPS) % STEPS;
      return hslToHex(step / STEPS, look.s, look.l);
    },
    start(id, x, y) { last.set(id, { x, y }); },
    // Returns the new colour when the step changes, or null.
    move(id, x, y) {
      const p = last.get(id);
      if (!p) { last.set(id, { x, y }); return null; }
      travelled += Math.hypot(x - p.x, y - p.y);
      p.x = x; p.y = y;
      const next = Math.floor((travelled / RAINBOW_LAP) * STEPS) % STEPS;
      return next === step ? null : this.color();
    },
    end(id) { last.delete(id); },
  };
}

// The swatch: a little colour wheel.
export const RAINBOW_SWATCH = 'conic-gradient(from 200deg, #ff5a5a, #ffb84a, #f6e85a, #5ad87a, #4ac8ff, #7a6cff, #e45aff, #ff5a5a)';

function hexToHsl(hex) {
  let c = hex.replace('#', '');
  if (c.length === 3) c = [...c].map((ch) => ch + ch).join('');
  const r = parseInt(c.slice(0, 2), 16) / 255, g = parseInt(c.slice(2, 4), 16) / 255, b = parseInt(c.slice(4, 6), 16) / 255;
  const max = Math.max(r, g, b), min = Math.min(r, g, b), l = (max + min) / 2, d = max - min;
  if (!d) return [0, 0, l];
  const s = d / (1 - Math.abs(2 * l - 1));
  const h = max === r ? ((g - b) / d) % 6 : max === g ? (b - r) / d + 2 : (r - g) / d + 4;
  return [(h / 6 + 1) % 1, s, l];
}

// Always #rrggbb: some scenes add an alpha suffix to the ink (ink + '00').
function hslToHex(h, s, l) {
  const k = (n) => (n + h * 12) % 12;
  const a = s * Math.min(l, 1 - l);
  const f = (n) => Math.round(255 * (l - a * Math.max(-1, Math.min(k(n) - 3, 9 - k(n), 1))));
  return '#' + [f(0), f(8), f(4)].map((v) => v.toString(16).padStart(2, '0')).join('');
}
