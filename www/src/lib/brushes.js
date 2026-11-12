// Brushes: every scene offers a few ways to make a mark that suit its surface (a fingertip,
// a fingernail or the side of your hand on fogged glass; a quill, a fine nib or a broad nib
// on parchment). The first brush in each list is the scene's original stroke.
//
// A brush is { name, size, steady?, flow?, soft?, dry? }:
//   size    multiplies the scene's own stroke radius
//   steady  0..1: how much it ignores pressure and speed (1 = an even line, like a fine liner)
//   flow    0..1: how much a quick stroke thins it out (a soft brush or a quill)
//   soft    optional edge softness for map-based Fade scenes (low = feathered, high = crisp)
//   dry     breaks the stroke into bristle streaks (a dry brush, the side of a chalk stick);
//           scenes that draw ink onto a layer honour it (Release sheets, chalk)
//
// The shell puts the chosen brush on the scene instance as `brushType` and wraps the scene's
// radiusFor(info, speed) with brushRadius below, so every scene gets size, steady and flow.

const B = (name, size, extra = {}) => ({ name, size, ...extra });

const PEN = [B('Pen', 1), B('Fine liner', 0.55, { steady: 1 }), B('Marker', 2, { steady: 0.6 })];
const MARKER = [B('Marker', 1), B('Fine marker', 0.55, { steady: 1 }), B('Fat marker', 2.2, { steady: 0.5 })];
const SUMI = [B('Brush', 1, { flow: 0.6 }), B('Fine brush', 0.55, { flow: 0.6 }), B('Dry brush', 2, { dry: true })];
const FINGER_GLASS = [B('Fingertip', 1), B('Fingernail', 0.35, { steady: 0.7, soft: 0.85 })];

export const BRUSHES = {
  // Fade
  'shower-door': [...FINGER_GLASS, B('Side of hand', 2.4, { soft: 0.3 })],
  waves: [B('Finger', 1), B('Stick', 0.4, { steady: 0.6 }), B('Palm', 2.2)],
  snow: [B('Mitten', 1), B('Stick', 0.4, { steady: 0.6 }), B('Boot', 2.1)],
  whiteboard: [B('Marker', 1), B('Fine tip', 0.55, { steady: 1 }), B('Chisel tip', 2.2, { steady: 0.5 })],
  windshield: [...FINGER_GLASS, B('Sleeve', 2.6)],
  frost: [...FINGER_GLASS, B('Warm palm', 2.3, { soft: 0.25 })],
  mirror: [...FINGER_GLASS, B('Towel', 2.6, { soft: 0.2 })],
  chalk: [B('Chalk', 1), B('Sharp tip', 0.5), B('Side of chalk', 2.3, { dry: true })],
  stone: [B('Water brush', 1, { flow: 0.6 }), B('Fine brush', 0.5, { flow: 0.7 }), B('Sponge', 2.2, { soft: 0.2 })],
  zen: [B('Finger', 1), B('Stick', 0.45, { steady: 0.6 }), B('Hand', 2.1)],
  etch: [B('Fine', 1, { steady: 1 }), B('Bold', 1.9, { steady: 1 }), B('Heavy', 3, { steady: 1 })],
  light: [B('Sparkler', 1), B('Fine wire', 0.5, { steady: 0.8 }), B('Glow stick', 2)],
  // Release
  stream: [B('Charcoal', 1), B('Fine charcoal', 0.55, { steady: 0.6 }), B('Charcoal side', 2.3, { dry: true })],
  bottle: [B('Quill', 1, { flow: 0.5 }), B('Fine nib', 0.55, { steady: 0.8 }), B('Broad nib', 1.8, { flow: 0.3 })],
  lantern: SUMI,
  'lantern-flock': SUMI,
  'rice-paper': SUMI,
  mailbox: [B('Fountain pen', 1, { flow: 0.3 }), B('Fine liner', 0.55, { steady: 1 }), B('Felt tip', 1.8, { steady: 0.6 })],
  burning: PEN,
  shredder: PEN,
  'paper-airplane': PEN,
  'paper-boat': PEN,
  campfire: [B('Pencil', 1), B('Sharp pencil', 0.5, { steady: 0.6 }), B('Crayon', 2.1, { dry: true })],
  balloon: MARKER,
  kite: MARKER,
  rocket: MARKER,
  dandelion: [B('Pen', 1), B('Fine pen', 0.55, { steady: 1 }), B('Brush', 1.9, { flow: 0.6 })],
  leaf: [B('Pen', 1), B('Fine pen', 0.55, { steady: 1 }), B('Brush', 1.9, { flow: 0.6 })],
};

export const brushesFor = (def) => def.brushes || BRUSHES[def.id] || null;

// Wrap a scene's own radiusFor(info, speed) so it draws with `brush`. The scene keeps its
// character (a fingertip on glass is wider than a pen on paper); the brush scales and shapes it.
const NEUTRAL = { pointerType: 'touch', pressure: 0.5, width: 0 };
export function brushRadius(base, info, speed, brush) {
  let r = base(info, speed);
  if (!brush) return r;
  if (brush.steady) {
    const even = base({ ...NEUTRAL, pointerType: info.pointerType === 'mouse' ? 'mouse' : 'touch' }, 0);
    r += (even - r) * brush.steady;
  }
  r *= brush.size;
  if (brush.flow) r *= 1 - brush.flow * Math.min(0.6, speed / 1600);
  return Math.max(0.4, r);
}

// Dry brush: the stroke breaks into a handful of bristle streaks with gaps that come and go
// along the line. `st` is the stroke's own state (bristles are set up on its first segment).
export function dryStroke(g, st, x0, y0, r0, x1, y1, r1) {
  if (!st.bristles) {
    st.bristles = [];
    const n = 7;
    for (let i = 0; i < n; i++) {
      st.bristles.push({ o: (i / (n - 1)) * 2 - 1 + (Math.random() - 0.5) * 0.25, w: 0.5 + Math.random() * 0.7, on: Math.random() > 0.2 });
    }
  }
  const dx = x1 - x0, dy = y1 - y0, d = Math.hypot(dx, dy) || 1;
  const nx = -dy / d, ny = dx / d;
  const alpha = g.globalAlpha;
  for (const b of st.bristles) {
    if (b.on ? Math.random() < d / 70 : Math.random() < d / 16) b.on = !b.on;
    if (!b.on) continue;
    g.globalAlpha = alpha * (0.55 + 0.45 * b.w);
    g.lineWidth = Math.max(0.6, ((r0 + r1) / 2) * 0.32 * b.w);
    g.beginPath();
    g.moveTo(x0 + nx * b.o * r0, y0 + ny * b.o * r0);
    g.lineTo(x1 + nx * b.o * r1 + 0.01, y1 + ny * b.o * r1);
    g.stroke();
  }
  g.globalAlpha = alpha;
}
