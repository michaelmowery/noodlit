// "Show me": a short, hands-off demo of the current scene. A ghost fingertip picks a brush,
// sets the fade speed (Fade scenes), draws the Noodlit logo through the same stroke calls a real
// finger uses, and types "Noodlit" underneath, so it works on every scene. Then the scene does
// its thing: Fade scenes fade, Release scenes send the sheet off. Any touch, tap or key stops it,
// and the user's own brush and fade speed come back.

// The doodle: the Noodlit logo, a finger-painted N that ends in a touch point with ripple
// rings. Coordinates come from icons/icon.svg (a 512 box); each entry is one stroke.
function logo() {
  const ring = (r, from, to, step = 6) => {
    const pts = [];
    for (let a = from; a <= to; a += step) {
      const t = (a * Math.PI) / 180;
      pts.push([338 + r * Math.cos(t), 176 + r * Math.sin(t)]);
    }
    return pts;
  };
  const dot = [];
  for (let k = 0; k <= 60; k++) {
    const t = (k / 60) * Math.PI * 6, r = 2 + (k / 60) * 15; // a tight spiral reads as a filled dot
    dot.push([338 + r * Math.cos(t), 176 + r * Math.sin(t)]);
  }
  const strokes = [
    [[160, 360], [160, 180], [338, 352], [338, 196]],
    dot,
    ring(59.5, -90, 270),
    ring(88.4, -150, 70),
  ];
  // Fit the mark (x 130..440, y 80..380) into a unit box.
  return strokes.map((s) => s.map(([x, y]) => [(x - 132) / 308, (y - 76) / 308]));
}

// Resample a polyline into evenly spaced points, so the ghost finger moves at a steady pace.
function resample(pts, step) {
  const out = [pts[0]];
  let carry = 0;
  for (let i = 1; i < pts.length; i++) {
    const [ax, ay] = pts[i - 1], [bx, by] = pts[i];
    const len = Math.hypot(bx - ax, by - ay);
    let d = step - carry;
    while (d <= len) {
      const t = d / len;
      out.push([ax + (bx - ax) * t, ay + (by - ay) * t]);
      d += step;
    }
    carry = len - (d - step);
  }
  out.push(pts[pts.length - 1]);
  return out;
}

const sleep = (ms, run) => new Promise((res) => {
  const t = setTimeout(res, ms);
  run.timers.push(t);
});
const nextFrame = () => new Promise((res) => requestAnimationFrame(res));

// host: { env(), mode(), size() -> { W, H }, wake(), fadeSeconds(), held(), say(text, ms), sfx, onChange(running) }
export function createDemo(host, finger) {
  let run = null;
  const ID = 'demo';
  const PX_PER_SEC = 520; // ghost finger speed, a relaxed doodling pace
  const DEMO_SPEED = 90;  // fade slider position the demo picks (about 6 s, so nobody waits)

  // Where the logo goes, with room for the word underneath it.
  function box(env, W, H) {
    if (host.mode() === 'release' && env.rect) {
      const r = env.rect;
      const a = env.textArea?.() || { x: r.w * 0.15, y: r.h * 0.15, w: r.w * 0.7, h: r.h * 0.7 };
      const s = Math.min(a.w, a.h * 0.62) * 0.92;
      return { x: r.x + a.x + (a.w - s) / 2, y: r.y + a.y + a.h * 0.04, s };
    }
    const s = Math.min(W * 0.56, H * 0.36, 320);
    return { x: (W - s) / 2, y: H * 0.36 - s / 2, s };
  }

  function showFinger(x, y, down) {
    finger.style.transform = `translate(${x}px, ${y}px)`;
    finger.classList.toggle('down', down);
    finger.classList.add('show');
  }

  // Start from a blank surface so the doodle doesn't land on the intro prompt. Fade scenes
  // play their own clear (steam, eraser, rain…); Release scenes just get a fresh sheet in place.
  async function blank(env, me) {
    // Release scenes with a sheet just get a fresh one; the rest (the Zen garden) play their clear.
    if (host.mode() === 'release' && (env.sheet || env.board)) {
      if (env.sheet && env.newSheet) { env.sheet = env.newSheet(); env.strokes?.clear(); }
      else if (env.board && env.newBoard) { env.board = env.newBoard(); env.strokes?.clear(); }
      host.wake();
      return;
    }
    env.clear();
    host.wake();
    const t0 = performance.now();
    while (env.clearing && performance.now() - t0 < 2500) {
      await nextFrame();
      if (run !== me) return;
    }
    await sleep(150, me);
  }

  // The finger glides to an on-screen control and taps it.
  async function tap(el, me) {
    const r = el.getBoundingClientRect();
    const x = r.left + r.width / 2, y = r.top + r.height / 2;
    finger.classList.add('glide');
    showFinger(x, y, false);
    await sleep(560, me);
    if (run !== me) return false;
    showFinger(x, y, true);
    await sleep(150, me);
    showFinger(x, y, false);
    return run === me;
  }

  // Open a settings panel for the demo; stop() closes it if interrupted.
  function openPanel(p, me) { p.open(); me.panel = p; host.onPeek(true); }
  function closePanel(p, me) { p.close(); me.panel = null; host.onPeek(false); }

  async function draw(env, strokes, me) {
    for (const pts of strokes) {
      if (run !== me) return;
      const [x0, y0] = pts[0];
      showFinger(x0, y0, false);
      await sleep(140, me);
      if (run !== me) return;
      const t0 = performance.now();
      const info = () => ({ pointerType: 'touch', pressure: 0.5, width: 0, time: performance.now() });
      env.strokeStart(ID, x0, y0, info());
      me.down = true;
      showFinger(x0, y0, true);
      let i = 1, last = [x0, y0];
      while (i < pts.length) {
        await nextFrame();
        if (run !== me) return;
        const due = Math.min(pts.length - 1, Math.floor(((performance.now() - t0) / 1000) * PX_PER_SEC / 4));
        for (; i <= due; i++) {
          const [x, y] = pts[i];
          env.strokeMove(ID, x, y, { ...info(), angle: Math.atan2(y - last[1], x - last[0]) });
          last = [x, y];
        }
        host.sfx.stroke(PX_PER_SEC);
        showFinger(last[0], last[1], true);
        host.wake();
      }
      env.strokeEnd(ID);
      me.down = false;
      host.sfx.strokeEnd();
      showFinger(last[0], last[1], false);
      host.wake();
      await sleep(120, me);
    }
  }

  async function play() {
    const me = run;
    const env = host.env();
    await blank(env, me);
    if (run !== me) return;
    env.setPaused(true); // hold the fade until the drawing and the word are both done

    // 1. Pick a brush.
    const brush = host.brush();
    if (brush) {
      if (!(await tap(brush.button, me))) return;
      openPanel(brush, me);
      host.say('Pick a brush', 1800);
      await sleep(650, me);
      if (run !== me) return;
      const opt = brush.option();
      if (opt && !(await tap(opt, me))) return;
      opt?.click();
      await sleep(700, me);
      if (run !== me) return;
      closePanel(brush, me);
      await sleep(200, me);
    }

    // 2. Set how fast it fades (Fade scenes only).
    const speed = host.speed();
    if (speed) {
      if (!(await tap(speed.button, me))) return;
      openPanel(speed, me);
      host.say('Set how fast it fades', 2000);
      await sleep(400, me);
      if (run !== me) return;
      // Slide the knob: the finger rides along it.
      const r = speed.pop.querySelector('input').getBoundingClientRect();
      const knobX = (v) => r.left + 12 + (r.width - 24) * (v / 100);
      const from = speed.get(), cy = r.top + r.height / 2;
      finger.classList.remove('glide');
      showFinger(knobX(from), cy, true);
      const t0 = performance.now();
      for (let t = 0; t < 1;) {
        await nextFrame();
        if (run !== me) return;
        t = Math.min(1, (performance.now() - t0) / 800);
        const v = Math.round(from + (DEMO_SPEED - from) * (1 - (1 - t) ** 2));
        speed.set(v);
        showFinger(knobX(v), cy, true);
      }
      showFinger(knobX(DEMO_SPEED), cy, false);
      await sleep(700, me);
      if (run !== me) return;
      closePanel(speed, me);
      await sleep(200, me);
    }
    finger.classList.remove('glide');

    // 3. Draw the logo.
    const { W, H } = host.size();
    const b = box(env, W, H);
    const strokes = logo().map((s) => resample(s.map(([u, v]) => [b.x + u * b.s, b.y + v * b.s]), 4));
    host.say('Draw anything…', 2600);
    await draw(env, strokes, me);
    if (run !== me) return;

    // 4. Type the name underneath.
    if (!(await tap(host.typeButton, me))) return;
    finger.classList.remove('show', 'glide');
    host.say('…or type it', 2000);
    const at = (b.y + b.s + Math.min(W, H) * 0.09) / H;
    const word = 'Noodlit';
    for (let n = 1; n <= word.length; n++) {
      await sleep(n === 1 ? 250 : 170, me);
      if (run !== me) return;
      env.setDraft(word.slice(0, n), { at });
      me.typing = true;
      host.wake();
    }
    await sleep(500, me);
    if (run !== me) return;
    env.commitDraft();
    me.typing = false;
    host.wake();
    await sleep(500, me);
    if (run !== me) return;

    // 5. Let the scene take it.
    if (host.mode() === 'release') {
      host.say('…then let it go', 3000);
      env.clear(); // the same as tapping the release button
      host.wake();
      await sleep(4200, me);
    } else {
      host.say('…and watch it fade', 3000);
      env.setPaused(false);
      host.wake();
      await sleep(host.fadeSeconds() * 1000 + 1500, me);
    }
    if (run === me) stop();
  }

  function start() {
    if (run) return;
    run = { timers: [], down: false, snap: host.snapshot() };
    host.onChange(true);
    play().catch(() => stop());
  }

  // e: the touch or key that interrupted, if any. A tap inside an open settings panel leaves it
  // open so the user can carry on from there.
  // e: the touch or key that interrupted, if any. A tap inside an open settings panel leaves it
  // open so the user can carry on from there.
  function stop(e) {
    if (!run) return;
    const r = run;
    run = null;
    r.timers.forEach(clearTimeout);
    const env = host.env();
    if (r.panel) {
      if (!(e?.target && r.panel.pop.contains(e.target))) r.panel.close();
      host.onPeek(false);
    }
    if (r.down) { env.strokeEnd(ID); host.sfx.strokeEnd(); }
    if (r.typing) env.commitDraft();
    // Put back the user's own brush, fade speed and Hold.
    host.restore(r.snap);
    env.setPaused(host.held());
    finger.classList.remove('show', 'down', 'glide');
    host.onChange(false);
    host.wake();
  }

  return { start, stop, get running() { return !!run; } };
}
