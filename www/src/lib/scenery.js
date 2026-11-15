// Little painted landscapes, drawn in code (no image files, so they cost nothing to download
// and work offline). Each painter fills a W x H area (CSS px) on `g` and uses `rand` for its
// layout, so the same seed paints the same picture at any size and a new seed a new one.
//
// Bright and saturated on purpose: they're made to be scratched out of black.

const TAU = Math.PI * 2;
const lerp = (a, b, t) => a + (b - a) * t;

function vgrad(g, y0, y1, stops) {
  const gr = g.createLinearGradient(0, y0, 0, y1);
  stops.forEach((s, i) => gr.addColorStop(i / (stops.length - 1), s));
  return gr;
}

function sky(g, W, H, stops, bottom = 1) {
  g.fillStyle = vgrad(g, 0, H * bottom, stops);
  g.fillRect(0, 0, W, H);
}

function glow(g, x, y, r, col, a = 0.55) {
  const gr = g.createRadialGradient(x, y, r * 0.6, x, y, r * 3.2);
  gr.addColorStop(0, col.replace('A', a));
  gr.addColorStop(1, col.replace('A', 0));
  g.fillStyle = gr;
  g.beginPath(); g.arc(x, y, r * 3.2, 0, TAU); g.fill();
}

function disc(g, x, y, r, col) {
  g.fillStyle = col;
  g.beginPath(); g.arc(x, y, r, 0, TAU); g.fill();
}

// A jagged ridge line (midpoint displacement) filled down to the bottom.
function ridge(g, W, H, base, amp, rough, fill, rand) {
  let pts = [base + (rand() - 0.5) * amp, base + (rand() - 0.5) * amp];
  let spread = amp;
  for (let level = 0; level < 7; level++) {
    const next = [];
    for (let i = 0; i < pts.length - 1; i++) {
      next.push(pts[i], (pts[i] + pts[i + 1]) / 2 + (rand() - 0.5) * spread);
    }
    next.push(pts[pts.length - 1]);
    pts = next;
    spread *= rough;
  }
  g.fillStyle = fill;
  g.beginPath(); g.moveTo(0, H);
  pts.forEach((y, i) => g.lineTo((i / (pts.length - 1)) * W, y));
  g.lineTo(W, H); g.closePath(); g.fill();
  return pts;
}

// Smooth rolling hills: a sum of a few sine waves.
function hill(g, W, H, base, amp, fill, rand) {
  const waves = [0, 1, 2].map((k) => ({ f: (1 + rand() * 1.5) * (k + 1), p: rand() * TAU, a: amp / (k + 1) }));
  const yAt = (x) => base + waves.reduce((s, w) => s + Math.sin((x / W) * w.f * Math.PI + w.p) * w.a, 0);
  g.fillStyle = fill;
  g.beginPath(); g.moveTo(0, H);
  for (let x = 0; x <= W + 8; x += 8) g.lineTo(x, yAt(x));
  g.lineTo(W, H); g.closePath(); g.fill();
  return yAt;
}

function pine(g, x, y, h, col) {
  const w = h * 0.36;
  g.fillStyle = col;
  g.beginPath();
  for (let k = 0; k < 3; k++) {
    const top = y - h + k * h * 0.22, bot = y - h * 0.62 + k * h * 0.27, ww = w * (0.55 + k * 0.25);
    g.moveTo(x, top); g.lineTo(x - ww, bot); g.lineTo(x + ww, bot); g.closePath();
  }
  g.fill();
  g.fillRect(x - h * 0.03, y - h * 0.12, h * 0.06, h * 0.14);
}

function stars(g, W, H, n, rand, maxY = 1) {
  for (let i = 0; i < n; i++) {
    const r = rand() < 0.08 ? 1.6 + rand() : 0.5 + rand() * 0.9;
    g.fillStyle = `rgba(255,255,255,${0.45 + rand() * 0.55})`;
    g.beginPath(); g.arc(rand() * W, rand() * H * maxY, r, 0, TAU); g.fill();
  }
}

// Horizontal glints on water, thicker and wider towards the viewer.
function glints(g, W, top, bottom, rand, col, n = 70, cx = null) {
  g.fillStyle = col;
  for (let i = 0; i < n; i++) {
    const t = rand(), y = lerp(top, bottom, t * t);
    const x = cx == null ? rand() * W : cx + (rand() - 0.5) * W * (0.08 + t * 0.35);
    const w = 6 + t * 40 * rand();
    g.fillRect(x - w / 2, y, w, 1 + t * 2);
  }
}

// ---------------------------------------------------------------- the scenes

function mountains(g, W, H, rand) {
  const hz = H * (0.58 + rand() * 0.08);
  sky(g, W, H, ['#3b2a8f', '#8a3fb5', '#f2547d', '#ff9a4d', '#ffe27a'], hz / H);
  const sx = W * (0.25 + rand() * 0.5), sy = hz - H * (0.36 + rand() * 0.08), sr = Math.min(W, H) * 0.09;
  glow(g, sx, sy, sr, 'rgba(255,236,150,A)', 0.6);
  disc(g, sx, sy, sr, '#fff3b5');
  const cols = ['#c25d9a', '#8f3f98', '#5e2f8a', '#38206b'];
  cols.forEach((c, i) => ridge(g, W, H, hz - H * (0.22 - i * 0.06), H * (0.32 - i * 0.05), 0.55, c, rand));
  // A lake catches the sky.
  g.fillStyle = vgrad(g, hz, H, ['#ff9a6b', '#c2508f', '#3b2a8f']);
  g.fillRect(0, hz, W, H - hz);
  glints(g, W, hz + 2, H, rand, 'rgba(255,240,180,0.7)', 80, sx);
  ridge(g, W, H, H * 0.94, H * 0.05, 0.5, '#24164f', rand);
}

function seaside(g, W, H, rand) {
  const hz = H * (0.5 + rand() * 0.08);
  sky(g, W, H, ['#2b8fe0', '#6cc6f2', '#bfeaf5', '#ffe9b0'], hz / H);
  const sx = W * (0.2 + rand() * 0.6), sr = Math.min(W, H) * 0.07;
  glow(g, sx, hz - H * 0.12, sr, 'rgba(255,250,210,A)', 0.7);
  disc(g, sx, hz - H * 0.12, sr, '#fffbe0');
  // Clouds.
  for (let k = 0; k < 4; k++) {
    const cx = rand() * W, cy = hz * (0.15 + rand() * 0.45), s = Math.min(W, H) * (0.04 + rand() * 0.04);
    g.fillStyle = 'rgba(255,255,255,0.9)';
    for (let j = 0; j < 5; j++) { g.beginPath(); g.arc(cx + (j - 2) * s * 0.9, cy - Math.sin((j / 4) * Math.PI) * s * 0.7, s * (0.7 + rand() * 0.4), 0, TAU); g.fill(); }
  }
  g.fillStyle = vgrad(g, hz, H, ['#1fb5c9', '#1386c2', '#0d5fa8']);
  g.fillRect(0, hz, W, H - hz);
  glints(g, W, hz + 2, H * 0.85, rand, 'rgba(255,255,255,0.65)', 110);
  // A sailboat on the horizon.
  const bx = W * (0.15 + rand() * 0.7), by = hz + H * 0.03, bs = Math.min(W, H) * 0.05;
  g.fillStyle = '#ffffff';
  g.beginPath(); g.moveTo(bx, by - bs * 1.6); g.lineTo(bx, by - bs * 0.1); g.lineTo(bx + bs * 0.9, by - bs * 0.1); g.closePath(); g.fill();
  g.fillStyle = '#ff5d5d';
  g.beginPath(); g.moveTo(bx - bs * 0.1, by - bs * 1.3); g.lineTo(bx - bs * 0.1, by - bs * 0.1); g.lineTo(bx - bs * 0.7, by - bs * 0.1); g.closePath(); g.fill();
  g.fillStyle = '#7a3b1e';
  g.beginPath(); g.moveTo(bx - bs * 0.8, by); g.lineTo(bx + bs * 1, by); g.lineTo(bx + bs * 0.7, by + bs * 0.3); g.lineTo(bx - bs * 0.55, by + bs * 0.3); g.closePath(); g.fill();
  // Sand along the bottom, and a foam line where the waves come in.
  const beach = hill(g, W, H, H * 0.86, H * 0.03, '#ffd98a', rand);
  g.strokeStyle = 'rgba(255,255,255,0.9)'; g.lineWidth = 3;
  g.beginPath();
  for (let x = 0; x <= W + 8; x += 8) g.lineTo(x, beach(x) - 2);
  g.stroke();
  // A palm leaning in from one side.
  const left = rand() < 0.5, px = left ? W * 0.1 : W * 0.9, lean = left ? 1 : -1, ph = H * 0.42;
  const tx = px + lean * W * 0.12, ty = H - ph;
  g.strokeStyle = '#8a5a2b'; g.lineWidth = Math.max(6, W * 0.018); g.lineCap = 'round';
  g.beginPath(); g.moveTo(px, H); g.quadraticCurveTo(px + lean * W * 0.01, H - ph * 0.6, tx, ty); g.stroke();
  g.strokeStyle = '#2f9e44'; g.lineWidth = Math.max(4, W * 0.012);
  for (let k = 0; k < 7; k++) {
    const a = -Math.PI / 2 + (k - 3) * 0.55, len = ph * (0.32 + rand() * 0.12);
    g.beginPath(); g.moveTo(tx, ty);
    g.quadraticCurveTo(tx + Math.cos(a) * len * 0.6, ty + Math.sin(a) * len * 0.6 - len * 0.15, tx + Math.cos(a) * len, ty + Math.sin(a) * len + len * 0.35);
    g.stroke();
  }
}

function nightSky(g, W, H, rand) {
  sky(g, W, H, ['#0b0d3a', '#1d1a6b', '#3a2a8f', '#5b3fa8']);
  stars(g, W, H, Math.round((W * H) / 2200), rand, 0.75);
  // Aurora ribbons.
  for (let k = 0; k < 3; k++) {
    const y0 = H * (0.18 + k * 0.08 + rand() * 0.05), amp = H * (0.05 + rand() * 0.05), f = 1 + rand() * 2, p = rand() * TAU;
    const hue = ['rgba(80,255,170,A)', 'rgba(60,220,255,A)', 'rgba(190,110,255,A)'][k];
    for (let x = 0; x < W; x += 3) {
      const y = y0 + Math.sin((x / W) * f * Math.PI + p) * amp;
      const gr = g.createLinearGradient(0, y - H * 0.14, 0, y + H * 0.03);
      gr.addColorStop(0, hue.replace('A', 0));
      gr.addColorStop(0.8, hue.replace('A', 0.3));
      gr.addColorStop(1, hue.replace('A', 0));
      g.fillStyle = gr; g.fillRect(x, y - H * 0.14, 3, H * 0.17);
    }
  }
  const mx = W * (0.2 + rand() * 0.6), my = H * (0.12 + rand() * 0.12), mr = Math.min(W, H) * 0.07;
  glow(g, mx, my, mr, 'rgba(220,230,255,A)', 0.35);
  disc(g, mx, my, mr, '#f4f1ff');
  disc(g, mx + mr * 0.3, my - mr * 0.15, mr * 0.18, 'rgba(180,180,220,0.45)');
  disc(g, mx - mr * 0.35, my + mr * 0.3, mr * 0.12, 'rgba(180,180,220,0.45)');
  hill(g, W, H, H * 0.72, H * 0.05, '#2a2470', rand);
  const near = hill(g, W, H, H * 0.82, H * 0.04, '#15123f', rand);
  const n = Math.round(W / 34);
  for (let i = 0; i < n; i++) {
    const x = rand() * W;
    pine(g, x, near(x) + 4, H * (0.08 + rand() * 0.1), '#0c0a2a');
  }
  // A lit cabin window.
  const cx = W * (0.2 + rand() * 0.6), cy = near(cx);
  g.fillStyle = '#0c0a2a'; g.fillRect(cx - 18, cy - 22, 36, 24);
  g.beginPath(); g.moveTo(cx - 24, cy - 20); g.lineTo(cx, cy - 38); g.lineTo(cx + 24, cy - 20); g.fill();
  glow(g, cx, cy - 12, 5, 'rgba(255,200,90,A)', 0.5);
  g.fillStyle = '#ffd36b'; g.fillRect(cx - 6, cy - 16, 12, 9);
}

function forest(g, W, H, rand) {
  sky(g, W, H, ['#9fe3ff', '#d6f5e6', '#fff6c9'], 0.6);
  const sx = W * (0.3 + rand() * 0.4), sy = H * (0.18 + rand() * 0.1), sr = Math.min(W, H) * 0.08;
  glow(g, sx, sy, sr, 'rgba(255,250,200,A)', 0.8);
  disc(g, sx, sy, sr, '#fffbd8');
  // Rays.
  g.save(); g.globalCompositeOperation = 'lighter';
  for (let k = 0; k < 9; k++) {
    const a = Math.PI * (0.15 + k * 0.09 + rand() * 0.03);
    g.fillStyle = 'rgba(255,240,170,0.07)';
    g.beginPath(); g.moveTo(sx, sy);
    g.lineTo(sx + Math.cos(a - 0.04) * H * 2, sy + Math.sin(a - 0.04) * H * 2);
    g.lineTo(sx + Math.cos(a + 0.04) * H * 2, sy + Math.sin(a + 0.04) * H * 2);
    g.fill();
  }
  g.restore();
  const rows = [['#8fd4a8', 0.5], ['#5fbf7f', 0.6], ['#2f9e5c', 0.72], ['#16703f', 0.86]];
  rows.forEach(([col, base], i) => {
    const line = hill(g, W, H, H * base, H * 0.03, col, rand);
    const n = Math.round(W / (26 - i * 3));
    for (let k = 0; k < n; k++) {
      const x = (k + rand() * 0.8) * (W / n);
      pine(g, x, line(x) + 6, H * (0.1 + i * 0.05) * (0.7 + rand() * 0.6), col);
    }
    // A breath of mist between rows.
    g.fillStyle = vgrad(g, H * base - H * 0.05, H * base + H * 0.04, ['rgba(255,255,255,0)', 'rgba(240,255,245,0.35)', 'rgba(255,255,255,0)']);
    g.fillRect(0, H * base - H * 0.05, W, H * 0.09);
  });
  // A river winding out towards you.
  const rx = W * (0.3 + rand() * 0.4);
  g.fillStyle = '#5fd0f0';
  g.beginPath();
  g.moveTo(rx - 4, H * 0.74);
  g.bezierCurveTo(rx - W * 0.2, H * 0.82, rx + W * 0.15, H * 0.9, rx - W * 0.2, H);
  g.lineTo(rx + W * 0.25, H);
  g.bezierCurveTo(rx + W * 0.25, H * 0.9, rx - W * 0.05, H * 0.82, rx + 4, H * 0.74);
  g.closePath(); g.fill();
  g.save(); g.clip();
  glints(g, W, H * 0.76, H, rand, 'rgba(255,255,255,0.7)', 40, rx);
  g.restore();
}

function desert(g, W, H, rand) {
  sky(g, W, H, ['#ff6f91', '#ff9671', '#ffc75f', '#fff1a8'], 0.62);
  const sx = W * (0.25 + rand() * 0.5), sy = H * (0.38 + rand() * 0.1), sr = Math.min(W, H) * 0.16;
  glow(g, sx, sy, sr, 'rgba(255,240,170,A)', 0.4);
  disc(g, sx, sy, sr, '#fff4c2');
  // Stripes across the sun, like an old travel poster.
  g.fillStyle = '#ffb36b';
  for (let k = 1; k < 5; k++) g.fillRect(sx - sr, sy + sr * (0.1 + k * 0.17), sr * 2, sr * 0.05 * k);
  ridge(g, W, H, H * 0.6, H * 0.12, 0.45, '#d9647a', rand);
  const dunes = ['#f28c50', '#e5673e', '#c44a3a', '#8f2f3f'];
  let last;
  dunes.forEach((c, i) => { last = hill(g, W, H, H * (0.66 + i * 0.08), H * (0.04 + i * 0.01), c, rand); });
  // Cacti on the nearest dune.
  for (let k = 0; k < 3; k++) {
    const x = W * (0.1 + k * 0.33 + rand() * 0.15), y = last(x), h = H * (0.1 + rand() * 0.08), w = Math.max(8, h * 0.14);
    g.strokeStyle = '#3f1d3a'; g.lineCap = 'round'; g.lineWidth = w;
    g.beginPath(); g.moveTo(x, y); g.lineTo(x, y - h); g.stroke();
    g.lineWidth = w * 0.7;
    g.beginPath(); g.moveTo(x, y - h * 0.45); g.lineTo(x - h * 0.22, y - h * 0.45); g.lineTo(x - h * 0.22, y - h * 0.75); g.stroke();
    g.beginPath(); g.moveTo(x, y - h * 0.6); g.lineTo(x + h * 0.2, y - h * 0.6); g.lineTo(x + h * 0.2, y - h * 0.85); g.stroke();
  }
}

function city(g, W, H, rand) {
  const hz = H * 0.7;
  sky(g, W, H, ['#241a5e', '#6b2fa0', '#e0457b', '#ff9e5e'], hz / H);
  stars(g, W, H, Math.round((W * H) / 9000), rand, 0.3);
  const sx = W * (0.2 + rand() * 0.6), sr = Math.min(W, H) * 0.1;
  glow(g, sx, hz - sr * 0.4, sr, 'rgba(255,190,120,A)', 0.5);
  disc(g, sx, hz - sr * 0.4, sr, '#ffd29a');
  const layers = [['#7a3f9e', 0.32, 'rgba(255,220,150,0.5)'], ['#3f2370', 0.22, 'rgba(255,214,110,0.9)']];
  layers.forEach(([col, tall, lit], li) => {
    let x = -rand() * 20;
    while (x < W) {
      const w = 22 + rand() * 40 - li * 4, h = H * tall * (0.35 + rand() * 0.65), top = hz - h;
      g.fillStyle = col; g.fillRect(x, top, w, h + 1);
      if (rand() < 0.25) { g.fillRect(x + w / 2 - 1.5, top - h * 0.18, 3, h * 0.18); }
      g.fillStyle = lit;
      for (let wy = top + 6; wy < hz - 6; wy += 9) {
        for (let wx = x + 4; wx < x + w - 6; wx += 8) if (rand() < 0.45) g.fillRect(wx, wy, 4, 5);
      }
      x += w + 2 + rand() * 6;
    }
  });
  // The harbour mirrors it all.
  g.save();
  g.translate(0, hz * 2); g.scale(1, -1);
  g.globalAlpha = 0.45;
  g.drawImage(g.canvas, 0, 0, g.canvas.width, g.canvas.height * (hz / H), 0, 0, W, hz);
  g.restore();
  g.fillStyle = 'rgba(30,20,90,0.45)'; g.fillRect(0, hz, W, H - hz);
  glints(g, W, hz + 2, H, rand, 'rgba(255,200,140,0.6)', 90);
}

function balloons(g, W, H, rand) {
  sky(g, W, H, ['#4aa8ff', '#8fd0ff', '#d9f2ff'], 0.7);
  for (let k = 0; k < 3; k++) {
    const cx = rand() * W, cy = H * (0.1 + rand() * 0.35), s = Math.min(W, H) * (0.035 + rand() * 0.03);
    g.fillStyle = 'rgba(255,255,255,0.85)';
    for (let j = 0; j < 5; j++) { g.beginPath(); g.arc(cx + (j - 2) * s * 0.9, cy - Math.sin((j / 4) * Math.PI) * s * 0.6, s * (0.7 + rand() * 0.4), 0, TAU); g.fill(); }
  }
  // Patchwork fields.
  const fields = ['#9ee36b', '#6fcf5a', '#ffd34f', '#4fb84f', '#c6ea6b', '#2e9a48'];
  fields.forEach((c, i) => hill(g, W, H, H * (0.62 + i * 0.065), H * 0.035, c, rand));
  const cols = [['#ff4d6d', '#ffd34f'], ['#5b6cff', '#ffffff'], ['#ff9838', '#c05cff'], ['#35c9f2', '#ff5db1'], ['#4fdc6b', '#ffe042']];
  const n = 3 + Math.floor(rand() * 3);
  for (let k = 0; k < n; k++) {
    const x = W * ((k + 0.5) / n + (rand() - 0.5) * 0.12), y = H * (0.2 + rand() * 0.35);
    const r = Math.min(W, H) * (0.06 + rand() * 0.06) * (0.6 + (y / H));
    const [a, b] = cols[(k + Math.floor(rand() * 5)) % cols.length];
    // Envelope in panels.
    g.save();
    g.beginPath();
    g.moveTo(x, y + r * 1.25);
    g.bezierCurveTo(x - r * 1.35, y + r * 0.35, x - r * 1.1, y - r * 1.1, x, y - r * 1.1);
    g.bezierCurveTo(x + r * 1.1, y - r * 1.1, x + r * 1.35, y + r * 0.35, x, y + r * 1.25);
    g.closePath(); g.clip();
    for (let p = 4; p >= 0; p--) {
      g.fillStyle = p % 2 ? b : a;
      g.beginPath(); g.ellipse(x, y, p * r * 0.32 + r * 0.14, r * 1.4, 0, 0, TAU); g.fill();
    }
    g.restore();
    g.strokeStyle = '#6b4a2b'; g.lineWidth = 1;
    g.beginPath(); g.moveTo(x - r * 0.3, y + r * 1.15); g.lineTo(x - r * 0.18, y + r * 1.55); g.moveTo(x + r * 0.3, y + r * 1.15); g.lineTo(x + r * 0.18, y + r * 1.55); g.stroke();
    g.fillStyle = '#8a5a2b'; g.fillRect(x - r * 0.2, y + r * 1.55, r * 0.4, r * 0.3);
  }
}

export const SCENERY = [
  { id: 'mountains', name: 'Mountains', paint: mountains },
  { id: 'seaside', name: 'Seaside', paint: seaside },
  { id: 'night', name: 'Night sky', paint: nightSky },
  { id: 'forest', name: 'Forest', paint: forest },
  { id: 'desert', name: 'Desert', paint: desert },
  { id: 'city', name: 'City lights', paint: city },
  { id: 'balloons', name: 'Balloons', paint: balloons },
];
