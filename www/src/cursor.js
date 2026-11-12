// Brush cursor: with a mouse, trackpad or a hovering pen, the pointer over the canvas becomes
// a ring the size and colour of what you're about to draw. A flat tip shows as a slim nib held
// at 45°; a drag brush (Stir's pick) shows a dashed ring as wide as the area it pulls. Over the
// toolbar and menus, while typing, during Show me, and off a Release sheet, the normal cursor
// comes back. Touch never sees it (there's no cursor to replace).
//
// host: { env(), busy() -> true when the canvas isn't for drawing right now }

const MIN = 6; // smallest ring, in CSS px, so a hairline brush still shows where it lands

// Light ink gets a dark outline and dark ink a light one, so the ring reads on any scene.
function isLight(color) {
  const c = document.createElement('canvas').getContext('2d');
  c.fillStyle = '#000';
  c.fillStyle = color;
  const v = c.fillStyle; // normalised to #rrggbb or rgba(...)
  let r, g, b;
  if (v[0] === '#') [r, g, b] = [1, 3, 5].map((i) => parseInt(v.slice(i, i + 2), 16));
  else [r, g, b] = v.match(/[\d.]+/g).map(Number);
  return 0.2126 * r + 0.7152 * g + 0.0722 * b > 140;
}

export function createBrushCursor(canvas, el, host) {
  let shown = false, inside = false, lastType = null, x = 0, y = 0;
  let look = null; // { w, h, flat, drag } in CSS px, rebuilt when the brush or ink changes

  // Where a stroke would actually land. Release scenes only take ink on their sheet.
  function drawableAt(px, py) {
    const env = host.env();
    if (!env || host.busy()) return false;
    if (env.deal) return false; // a Reveal scene dealing a fresh cover ignores strokes
    if ('sheet' in env && env.rect) {
      const s = env.sheet, r = env.rect;
      if (!s || s.arrive < 1) return false;
      return px >= r.x && py >= r.y && px <= r.x + r.w && py <= r.y + r.h;
    }
    return true;
  }

  function measure(pointerType) {
    const env = host.env();
    if (!env?.radiusFor) return null;
    const type = pointerType === 'pen' ? 'pen' : 'mouse';
    const r = env.radiusFor({ pointerType: type, pressure: 0.5, width: 0, angle: null }, 0);
    const b = env.brushType || {};
    if (b.drag) {
      const reach = 22 + r * 3; // matches Stir's pull reach
      return { w: reach * 2, h: reach * 2, drag: true };
    }
    if (b.shape === 'flat') return { w: Math.max(MIN, r * 2 * 1.32), h: Math.max(3, r * 2 * 0.22), flat: true };
    const d = Math.max(MIN, r * 2);
    return { w: d, h: d };
  }

  // Called by the shell when the scene, brush, tip or ink changes.
  function refresh(color) {
    const ink = color || 'rgba(255,255,255,0.92)';
    el.style.setProperty('--ring', ink);
    el.style.setProperty('--halo', isLight(ink) ? 'rgba(0,0,0,0.55)' : 'rgba(255,255,255,0.75)');
    look = null;
    if (shown) place();
  }

  function place() {
    if (!look) look = measure(lastType);
    if (!look) { hide(); return; }
    el.classList.toggle('flat', !!look.flat);
    el.classList.toggle('drag', !!look.drag);
    el.classList.toggle('big', look.w >= 28 && !look.flat);
    el.style.width = `${look.w}px`;
    el.style.height = `${look.h}px`;
    el.style.transform = `translate(${x - look.w / 2}px, ${y - look.h / 2}px)${look.flat ? ' rotate(-45deg)' : ''}`;
  }

  function show() {
    if (!shown) { shown = true; el.hidden = false; canvas.classList.add('ring-cursor'); }
    place();
  }

  function hide() {
    if (!shown) return;
    shown = false;
    el.hidden = true;
    canvas.classList.remove('ring-cursor');
  }

  function track(e) {
    if (e.pointerType !== 'mouse' && e.pointerType !== 'pen') { hide(); return; }
    if (e.pointerType !== lastType) { lastType = e.pointerType; look = null; }
    x = e.clientX; y = e.clientY;
    inside = true;
    if (drawableAt(x, y)) show(); else hide();
  }

  canvas.addEventListener('pointermove', track);
  canvas.addEventListener('pointerover', track);
  canvas.addEventListener('pointerdown', track);
  const leave = () => { inside = false; hide(); };
  canvas.addEventListener('pointerleave', leave);
  canvas.addEventListener('pointercancel', leave);
  window.addEventListener('blur', leave);

  return {
    refresh,
    // Something changed under a still pointer (a sheet arrived, Show me started). Cheap
    // enough to call every frame: it only touches the page when the answer flips.
    recheck() {
      if (!inside) return;
      const can = drawableAt(x, y);
      if (can !== shown) (can ? show : hide)();
    },
    hide,
  };
}
