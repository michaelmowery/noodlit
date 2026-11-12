// Brushes: every scene offers a few ways to make a mark that suit its surface (a fingertip,
// a fingernail or the side of your hand on fogged glass; a quill, a fine nib or a broad nib
// on parchment). The picker lists them from smallest to largest; the one with size 1 is the
// scene's original stroke and the default.
//
// A brush is { name, size, steady?, flow?, soft?, dry? }:
//   size    multiplies the scene's own stroke radius
//   steady  0..1: how much it ignores pressure and speed (1 = an even line, like a fine liner)
//   flow    0..1: how much a quick stroke thins it out (a soft brush or a quill)
//   soft    optional edge softness for map-based Fade scenes (low = feathered, high = crisp)
//   shape   'round' or 'flat' (set by the shell from the Tip picker, not in the lists below)
//   drag    lays nothing down; it pulls what's already there around (Stir scenes)
//   dry     breaks the stroke into bristle streaks (a dry brush, the side of a chalk stick);
//           scenes that draw ink onto a layer honour it (Release sheets, chalk)
//
// The shell puts the chosen brush on the scene instance as `brushType` and wraps the scene's
// radiusFor(info, speed) with brushRadius below, so every scene gets size, steady and flow.

const B = (name, size, extra = {}) => ({ name, size, ...extra });

const PEN = [B('Pen', 1), B('Fine liner', 0.55, { steady: 1 }), B('Marker', 3.4, { steady: 0.6 })];
const MARKER = [B('Marker', 1), B('Fine marker', 0.55, { steady: 1 }), B('Fat marker', 3.7, { steady: 0.5 })];
const SUMI = [B('Brush', 1, { flow: 0.6 }), B('Fine brush', 0.55, { flow: 0.6 }), B('Dry brush', 4.1, { dry: true })];
const FINGER_GLASS = [B('Fingertip', 1), B('Fingernail', 0.35, { steady: 0.7, soft: 0.85 })];

export const BRUSHES = {
  // Fade
  'shower-door': [...FINGER_GLASS, B('Side of hand', 4.1, { soft: 0.3 })],
  waves: [B('Finger', 1), B('Stick', 0.4, { steady: 0.6 }), B('Palm', 3.7)],
  snow: [B('Mitten', 1), B('Stick', 0.4, { steady: 0.6 }), B('Boot', 3.6)],
  whiteboard: [B('Marker', 1), B('Fine tip', 0.55, { steady: 1 }), B('Chisel tip', 3.7, { steady: 0.5 })],
  windshield: [...FINGER_GLASS, B('Sleeve', 4.4)],
  frost: [...FINGER_GLASS, B('Warm palm', 3.9, { soft: 0.25 })],
  chalk: [B('Chalk', 1), B('Sharp tip', 0.5), B('Side of chalk', 3.9, { dry: true })],
  stone: [B('Water brush', 1, { flow: 0.6 }), B('Fine brush', 0.5, { flow: 0.7 }), B('Sponge', 3.7, { soft: 0.2 })],
  zen: [B('Finger', 1), B('Stick', 0.45, { steady: 0.6 }), B('Hand', 3.6)],
  etch: [B('Fine', 1, { steady: 1 }), B('Bold', 1.9, { steady: 1 }), B('Heavy', 5.1, { steady: 1 })],
  breath: [...FINGER_GLASS, B('Side of hand', 3.9, { soft: 0.3 })],
  ink: [B('Dropper', 1, { flow: 0.4 }), B('Fine pipette', 0.5, { steady: 0.8 }), B('Ink brush', 3.2, { flow: 0.6 })],
  sparkler: [B('Sparkler', 1), B('Birthday sparkler', 0.55, { steady: 0.7 }), B('Fountain', 3.2)],
  starfield: [B('Fingertip', 1), B('Fine line', 0.5, { steady: 1 }), B('Comet', 3.4)],
  light: [B('Sparkler', 1), B('Fine wire', 0.5, { steady: 0.8 }), B('Glow stick', 3.4)],
  // Release
  stream: [B('Charcoal', 1), B('Fine charcoal', 0.55, { steady: 0.6 }), B('Charcoal side', 3.9, { dry: true })],
  bottle: [B('Quill', 1, { flow: 0.5 }), B('Fine nib', 0.55, { steady: 0.8 }), B('Broad nib', 3.1, { flow: 0.3 })],
  lantern: SUMI,
  'lantern-flock': SUMI,
  'rice-paper': SUMI,
  mailbox: [B('Fountain pen', 1, { flow: 0.3 }), B('Fine liner', 0.55, { steady: 1 }), B('Felt tip', 3.1, { steady: 0.6 })],
  'burning-page': PEN,
  shredder: PEN,
  'paper-airplane': PEN,
  'paper-boat': PEN,
  campfire: [B('Pencil', 1), B('Sharp pencil', 0.5, { steady: 0.6 }), B('Crayon', 3.6, { dry: true })],
  balloon: MARKER,
  kite: MARKER,
  rocket: MARKER,
  dandelion: [B('Pen', 1), B('Fine pen', 0.55, { steady: 1 }), B('Brush', 3.2, { flow: 0.6 })],
  leaf: [B('Pen', 1), B('Fine pen', 0.55, { steady: 1 }), B('Brush', 3.2, { flow: 0.6 })],
  // Become
  fireflies: [B('Fine thread', 0.5, { steady: 0.8 }), B('Glow line', 1), B('Wide glow', 3.2)],
  constellation: [B('Hairline', 0.55, { steady: 1 }), B('Silver line', 1), B('Bright line', 2.4)],
  bloom: [B('Tendril', 0.5, { steady: 0.8 }), B('Stem', 1), B('Thick vine', 2.6)],
  thaw: [B('Ice needle', 0.5, { steady: 0.8 }), B('Frost line', 1), B('Thick frost', 3)],
  // Reveal
  'bubble-wrap': [B('Pin', 0.3, { steady: 0.8 }), B('Fingertip', 1), B('Rolling pin', 3.2, { steady: 0.5 })],
  'scratch-card': [B('Fingernail', 0.4, { steady: 0.8 }), B('Coin', 1), B('Thumb', 2.4)],
  'scratch-art': [B('Needle', 0.45, { steady: 0.9 }), B('Stylus', 1), B('Flat scraper', 3.2, { steady: 0.5 })],
  'misty-window': [B('Fingernail', 0.35, { steady: 0.7 }), B('Fingertip', 1), B('Sleeve', 3.6)],
  'invisible-ink': [B('Match', 0.5, { steady: 0.7 }), B('Candle', 1), B('Lamp', 2.2, { steady: 0.6 })],
  'pencil-rubbing': [B('Pencil tip', 0.35, { steady: 0.6 }), B('Side of pencil', 1), B('Crayon block', 2.4, { steady: 0.6 })],
  'beach-dig': [B('Shell edge', 0.4, { steady: 0.7 }), B('Fingers', 1), B('Hand', 2.4)],
  // Stir (drag: a pick that pulls the milk around without pouring any)
  latte: [B('Fine pour', 0.5, { steady: 0.8 }), B('Milk pour', 1, { flow: 0.3 }), B('Latte pick', 1.3, { steady: 1, drag: true }), B('Big pour', 2.6)],
  rinse: [B('Fine brush', 0.5, { steady: 0.6 }), B('Brush', 1, { flow: 0.4 }), B('Stir stick', 1.3, { steady: 1, drag: true }), B('Loaded brush', 2.6)],
  flush: [B('Fine line', 0.5), B('Line', 1), B('Swish', 1.3, { steady: 1, drag: true }), B('Wide line', 2.6)],
  kaleidoscope: [B('Thread', 0.5, { steady: 0.8 }), B('Ribbon', 1), B('Twist', 1.3, { steady: 1, drag: true }), B('Band', 2.6)],
  marbling: [B('Fine brush', 0.5, { steady: 0.6 }), B('Brush', 1, { flow: 0.4 }), B('Comb', 1.3, { steady: 1, drag: true }), B('Ink drop', 2.4)],
  'tea-leaves': [B('Pinch', 0.6, { steady: 0.8 }), B('Leaves', 1), B('Spoon', 1.3, { steady: 1, drag: true }), B('Handful', 2.2)],
  galaxy: [B('Star trail', 0.5, { steady: 0.8 }), B('Stardust', 1), B('Gravity', 1.3, { steady: 1, drag: true }), B('Nebula', 2.8)],
  // Echo
  canyon: [B('Whisper', 0.5, { steady: 0.8 }), B('Call', 1), B('Shout', 2.6)],
  neon: [B('Thin tube', 0.55, { steady: 1 }), B('Tube', 1, { steady: 0.8 }), B('Fat tube', 2.2, { steady: 0.8 })],
  skywriting: [B('Thin trail', 0.5, { steady: 0.8 }), B('Smoke trail', 1), B('Wide trail', 2.4)],
  'music-box': [B('Sharp pencil', 0.6, { steady: 0.8 }), B('Pencil', 1), B('Big punch', 1.8, { steady: 0.8 })],
  pond: [B('Water strider', 0.5, { steady: 0.8 }), B('Fingertip', 1), B('Pebble', 2.4)],
  seismograph: [B('Fine nib', 0.6, { steady: 1 }), B('Pen', 1), B('Marker', 2.2, { steady: 0.6 })],
};

// Smallest to largest, however a list above happens to be written.
for (const id in BRUSHES) BRUSHES[id] = [...BRUSHES[id]].sort((a, b) => a.size - b.size);

export const brushesFor = (def) => def.brushes || BRUSHES[def.id] || null;
export const defaultBrush = (list) => list.find((b) => b.size === 1) || list[0];

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
  // Flat tip: a nib held at 45° (up and to the right). Moving along the nib draws a hairline,
  // moving across it draws the full width.
  if (brush.shape === 'flat' && info.angle != null) r *= 0.22 + 1.1 * Math.abs(Math.sin(info.angle + Math.PI / 4));
  return Math.max(0.4, r);
}

// Dry brush: the stroke breaks into a handful of bristle streaks with gaps that come and go
// along the line. `st` is the stroke's own state (bristles are set up on its first segment).
export function dryStroke(g, st, x0, y0, r0, x1, y1, r1) {
  if (!st.bristles) {
    st.bristles = [];
    const n = 9;
    for (let i = 0; i < n; i++) {
      st.bristles.push({ o: (i / (n - 1)) * 1.8 - 0.9 + (Math.random() - 0.5) * 0.2, w: 0.45 + Math.random() * 0.75, on: Math.random() > 0.15 });
    }
  }
  const dx = x1 - x0, dy = y1 - y0, d = Math.hypot(dx, dy) || 1;
  const nx = -dy / d, ny = dx / d;
  const alpha = g.globalAlpha;
  for (const b of st.bristles) {
    if (b.on ? Math.random() < d / 60 : Math.random() < d / 10) b.on = !b.on;
    if (!b.on) continue;
    g.globalAlpha = alpha * (0.55 + 0.45 * b.w);
    g.lineWidth = Math.max(0.6, ((r0 + r1) / 2) * 0.5 * b.w);
    g.beginPath();
    g.moveTo(x0 + nx * b.o * r0, y0 + ny * b.o * r0);
    g.lineTo(x1 + nx * b.o * r1 + 0.01, y1 + ny * b.o * r1);
    g.stroke();
  }
  g.globalAlpha = alpha;
}
