// "Show me": a short, hands-off demo of the current scene. The surface is wiped, then a ghost
// fingertip draws the Noodlit logo through the same stroke calls a real finger uses, so it works
// on every scene. Then the scene does its thing: Fade scenes fade (sped up so you don't wait
// 20 s), Release scenes send the sheet off. Any touch, tap or key stops it.

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
  const DEMO_FADE = 4;    // seconds: how fast a Fade scene clears while showing off

  function box(env, W, H) {
    if (host.mode() === 'release' && env.rect) {
      const r = env.rect;
      const a = env.textArea?.() || { x: r.w * 0.15, y: r.h * 0.15, w: r.w * 0.7, h: r.h * 0.7 };
      const s = Math.min(a.w, a.h) * 0.95;
      return { x: r.x + a.x + (a.w - s) / 2, y: r.y + a.y + (a.h - s) / 2, s };
    }
    const s = Math.min(W * 0.62, H * 0.42, 340);
    return { x: (W - s) / 2, y: H * 0.42 - s / 2, s };
  }

  function showFinger(x, y, down) {
    finger.style.transform = `translate(${x}px, ${y}px)`;
    finger.classList.toggle('down', down);
    finger.classList.add('show');
  }

  // Start from a blank surface so the doodle doesn't land on the intro prompt. Fade scenes
  // play their own clear (steam, eraser, rain…); Release scenes just get a fresh sheet in place.
  async function blank(env, me) {
    if (host.mode() === 'release') {
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

  async function play() {
    const me = run;
    const env = host.env();
    await blank(env, me);
    if (run !== me) return;
    const { W, H } = host.size();
    const b = box(env, W, H);
    const strokes = logo().map((s) => resample(s.map(([u, v]) => [b.x + u * b.s, b.y + v * b.s]), 4));

    host.say(host.mode() === 'release' ? "Write what's on your mind…" : 'Draw whatever comes to mind…', 2600);
    const [sx, sy] = strokes[0][0];
    showFinger(sx, sy - 40, false);
    await sleep(500, me);

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
    if (run !== me) return;

    // Lift away, then let the scene take it.
    const [lx, ly] = strokes[strokes.length - 1].at(-1);
    showFinger(lx + 30, ly - 50, false);
    await sleep(500, me);
    finger.classList.remove('show');
    if (run !== me) return;

    // A quick look at the settings: the finger taps each button, its panel opens with a caption,
    // then closes again. Nothing is changed.
    for (const pk of host.peeks()) {
      const r = pk.el.getBoundingClientRect();
      finger.classList.add('glide');
      showFinger(r.left + r.width / 2, r.top + r.height / 2, false);
      await sleep(520, me);
      if (run !== me) return;
      showFinger(r.left + r.width / 2, r.top + r.height / 2, true);
      await sleep(160, me);
      if (run !== me) return;
      pk.open();
      me.peek = pk;
      host.onPeek(true);
      showFinger(r.left + r.width / 2, r.top + r.height / 2, false);
      host.say(pk.say, 2200);
      await sleep(2300, me);
      if (run !== me) return;
      pk.close();
      me.peek = null;
      host.onPeek(false);
      await sleep(250, me);
      if (run !== me) return;
    }
    finger.classList.remove('show', 'glide');

    if (host.mode() === 'release') {
      host.say('…then let it go', 3000);
      env.clear(); // the same as tapping the release button
      host.wake();
      await sleep(4200, me);
    } else {
      host.say('…and watch it fade away', 3200);
      env.setPaused(false);
      env.setFadeSeconds(DEMO_FADE);
      host.wake();
      await sleep(DEMO_FADE * 1000 + 1200, me);
    }
    if (run === me) stop();
  }

  function start() {
    if (run) return;
    run = { timers: [], down: false };
    host.onChange(true);
    play().catch(() => stop());
  }

  // e: the touch or key that interrupted, if any. A tap inside an open settings panel leaves it
  // open so the user can carry on from there.
  function stop(e) {
    if (!run) return;
    const r = run;
    if (r.peek) {
      if (!(e?.target && r.peek.pop.contains(e.target))) r.peek.close();
      host.onPeek(false);
    }
    run = null;
    r.timers.forEach(clearTimeout);
    const env = host.env();
    if (r.down) { env.strokeEnd(ID); host.sfx.strokeEnd(); }
    // Put back the user's own fade speed and Hold.
    env.setFadeSeconds(host.fadeSeconds());
    env.setPaused(host.held());
    finger.classList.remove('show', 'down', 'glide');
    host.onChange(false);
    host.wake();
  }

  return { start, stop, get running() { return !!run; } };
}
