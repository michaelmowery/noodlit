// "Show me": a short, hands-off demo of the current scene. A ghost fingertip draws the Noodlit
// logo through the same stroke calls a real finger uses and types "Noodlit" underneath, so it
// works on every scene. Then the scene does its thing: Fade scenes fade, Release scenes send the
// sheet off. "Show me everything" (from About, and on the very first visit) is the longer tour: it
// picks Shower door from the scene menu for the Fade features (brush and fade trays, prompt, Hold),
// then Mailbox for the Release ones (Undo, send), opens Preferences and points out Show me.
// Any touch, tap or key stops either one, and the user's own brush, fade speed and Hold come back.

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

// host: { env(), mode(), size() -> { W, H }, wake(), fadeSeconds(), held(), say(text, ms), sfx, onChange(running),
//   brush(), speed(), typeButton, snapshot(), restore(snap), onPeek(on), and for the tour: tour.* (see main.js) }
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
    // Release scenes with a sheet just get a fresh one; the rest (Zen garden, Whiteboard,
    // Shake sketch) play their clear. (Whiteboard has a `board` too, but it's the backdrop,
    // not a fresh-able sheet.)
    if (host.mode() === 'release' && ((env.sheet && env.newSheet) || (env.board && env.newBoard))) {
      if (env.sheet && env.newSheet) { env.sheet = env.newSheet(); env.strokes?.clear(); }
      else if (env.board && env.newBoard) { env.board = env.newBoard(); env.strokes?.clear(); }
      env.undoReset?.(); // undo steps belonged to the old sheet
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
  function closePanel(p, me) { p.close(); me.panel = null; host.onPeek(me.kind === 'tour'); }

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

  // Glide to a control, show a caption, wait. For buttons the tour only points at.
  async function point(el, text, ms, me) {
    if (!el || el.hidden) return run === me;
    if (!(await tap(el, me))) return false;
    host.say(text, ms + 400);
    await sleep(ms, me);
    return run === me;
  }

  async function pickBrush(me) {
    const brush = host.brush();
    if (!brush) return true;
    if (!(await tap(brush.button, me))) return false;
    openPanel(brush, me);
    host.say('Pick a brush', 1800);
    await sleep(650, me);
    if (run !== me) return false;
    const opt = brush.option();
    if (opt && !(await tap(opt, me))) return false;
    opt?.click();
    await sleep(700, me);
    if (run !== me) return false;
    closePanel(brush, me);
    await sleep(200, me);
    return run === me;
  }

  async function setSpeed(me) {
    const speed = host.speed();
    if (!speed) return true;
    if (!(await tap(speed.button, me))) return false;
    openPanel(speed, me);
    host.say('Set how fast it fades', 2000);
    await sleep(400, me);
    if (run !== me) return false;
    // Slide the knob: the finger rides along it.
    const r = speed.pop.querySelector('input').getBoundingClientRect();
    const knobX = (v) => r.left + 12 + (r.width - 24) * (v / 100);
    const from = speed.get(), cy = r.top + r.height / 2;
    finger.classList.remove('glide');
    showFinger(knobX(from), cy, true);
    const t0 = performance.now();
    for (let t = 0; t < 1;) {
      await nextFrame();
      if (run !== me) return false;
      t = Math.min(1, (performance.now() - t0) / 800);
      const v = Math.round(from + (DEMO_SPEED - from) * (1 - (1 - t) ** 2));
      speed.set(v);
      showFinger(knobX(v), cy, true);
    }
    showFinger(knobX(DEMO_SPEED), cy, false);
    await sleep(700, me);
    if (run !== me) return false;
    closePanel(speed, me);
    await sleep(200, me);
    return run === me;
  }

  // Draw the logo and type the name under it.
  async function drawAndType(env, me) {
    finger.classList.remove('glide');
    const { W, H } = host.size();
    const b = box(env, W, H);
    const strokes = logo().map((s) => resample(s.map(([u, v]) => [b.x + u * b.s, b.y + v * b.s]), 4));
    host.say('Draw anything…', 2600);
    await draw(env, strokes, me);
    if (run !== me) return false;

    if (!(await tap(host.typeButton, me))) return false;
    finger.classList.remove('show', 'glide');
    host.say('…or type it', 2000);
    const at = (b.y + b.s + Math.min(W, H) * 0.09) / H;
    const word = 'Noodlit';
    for (let n = 1; n <= word.length; n++) {
      await sleep(n === 1 ? 250 : 170, me);
      if (run !== me) return false;
      env.setDraft(word.slice(0, n), { at });
      me.typing = true;
      host.wake();
    }
    await sleep(500, me);
    if (run !== me) return false;
    env.commitDraft();
    me.typing = false;
    host.wake();
    await sleep(500, me);
    return run === me;
  }

  // Release scenes: a quick scribble, then Undo takes it back.
  async function showUndo(env, me) {
    const t = host.tour;
    if (host.mode() !== 'release' || !t.canUndo()) return true;
    const { W, H } = host.size();
    const b = box(env, W, H);
    const y = b.y + b.s * 0.92, x0 = b.x + b.s * 0.1, x1 = b.x + b.s * 0.9;
    const squiggle = [];
    for (let k = 0; k <= 40; k++) squiggle.push([x0 + (x1 - x0) * (k / 40), y + Math.sin(k / 3) * 8]);
    host.say('Oops?', 1400);
    await draw(env, [resample(squiggle, 4)], me);
    if (run !== me) return false;
    if (!(await tap(t.undoButton, me))) return false;
    t.undo();
    host.say('Undo takes back the last mark', 2000);
    await sleep(1600, me);
    return run === me;
  }

  // About (ⓘ) → Preferences, for a look, then closed again.
  async function showPrefs(me) {
    const t = host.tour;
    if (!t.infoButton || !t.prefsButton) return true;
    if (!(await tap(t.infoButton, me))) return false;
    t.openAbout();
    host.say('ⓘ opens About', 1600);
    await sleep(900, me);
    if (run !== me) return false;
    if (!(await tap(t.prefsButton, me))) return false;
    finger.classList.remove('show');
    t.openPrefs(); // opens scrolled to the top
    host.say('Make it yours in Preferences', 2800);
    await sleep(2800, me);
    t.closePanels();
    await sleep(300, me);
    return run === me;
  }

  // Let the scene take it: Fade scenes fade, Release scenes let it go.
  async function letGo(env, me, viaButton) {
    if (host.mode() === 'release') {
      if (viaButton && !(await tap(host.tour.clearButton, me))) return;
      host.say('…then let it go', 3000);
      env.clear(); // the same as tapping the release button
      host.wake();
      await sleep(4200, me);
    } else if (host.mode() === 'become') {
      host.say('…pause, and watch what it becomes', 3200);
      env.setPaused(false);
      host.wake();
      await sleep((env.becomeTime?.() ?? 10) * 1000, me);
    } else {
      if (viaButton) {
        if (!(await tap(host.tour.holdButton, me))) return;
        host.tour.setHeld(false);
      }
      host.say('…and watch it fade', 3000);
      env.setPaused(false);
      host.wake();
      await sleep(host.fadeSeconds() * 1000 + 1500, me);
    }
  }

  // The scene demo: draw, type, let go. It quietly uses a quick fade so nobody waits.
  async function playScene(me) {
    const env = host.env();
    await blank(env, me);
    if (run !== me) return;
    env.setPaused(true); // hold the fade until the drawing and the word are both done
    const speed = host.speed(); // false on Release scenes (no fade speed there)
    if (speed) speed.set(DEMO_SPEED);
    if (!(await drawAndType(env, me))) return;
    await letGo(env, me, false);
    if (run !== me) return;
    // Sign-off: the toolbar lights up and points at the rest of the settings.
    host.signoff?.(true);
    host.say('Check out the brushes and other settings in the tray', 3200);
    await sleep(3000, me);
  }

  // The full tour, on whatever scene is showing.
  // Open the scene menu (from the top) and pick a scene from it, scrolling to its tile if needed.
  async function chooseScene(id, caption, me) {
    const t = host.tour;
    if (!(await tap(t.sceneButton, me))) return false;
    finger.classList.remove('show');
    t.openScenes();
    host.say(caption, 3000);
    await sleep(1000, me);
    if (run !== me) return false;
    const tile = t.tile(id);
    if (tile) {
      t.revealTile(tile);
      await sleep(700, me);
      if (!(await tap(tile, me))) return false;
    }
    t.switchScene(id);
    finger.classList.remove('show');
    await sleep(700, me);
    return run === me;
  }

  // The full tour: Shower door for the Fade features, then Mailbox for the Release ones, then
  // Preferences and the Show me button. The user's own scene comes back at the end.
  async function playTour(me) {
    const t = host.tour;
    host.onPeek(true); // keep the toolbar bright: the tour is about it

    // Fade: Shower door.
    if (!(await chooseScene('shower-door', 'Pick a scene: Fade scenes disappear on their own', me))) return;
    let env = host.env();
    await blank(env, me);
    if (run !== me) return;
    env.setPaused(true);
    if (!(await pickBrush(me))) return;
    if (!(await setSpeed(me))) return;
    if (!(await drawAndType(env, me))) return;
    // A prompt floats up from the lightbulb, then pops (unless prompts are off in Preferences).
    if (!t.promptButton.hidden) {
      if (!(await tap(t.promptButton, me))) return;
      t.showPrompt();
      host.say('Stuck? Tap the bulb for a prompt', 3600);
      await sleep(3600, me); // long enough to read a full-sentence prompt
      if (run !== me) return;
      t.popPrompt();
      await sleep(400, me);
      if (run !== me) return;
    }
    if (!(await tap(t.holdButton, me))) return;
    t.setHeld(true);
    host.say('Hold keeps a thought from fading', 2200);
    await sleep(2000, me);
    if (run !== me) return;
    if (!(await tap(t.holdButton, me))) return;
    t.setHeld(false);
    host.say('…let go, and it fades', 2600);
    await sleep(Math.min(host.fadeSeconds() * 1000, 5000), me);
    if (run !== me) return;

    // Release: Mailbox.
    if (!(await chooseScene('mailbox', 'Release scenes keep it until you send it off', me))) return;
    env = host.env();
    await blank(env, me);
    if (run !== me) return;
    if (!(await pickBrush(me))) return;
    if (!(await drawAndType(env, me))) return;
    if (!(await showUndo(env, me))) return;
    if (!(await tap(t.clearButton, me))) return;
    host.say('…then let it go', 3000);
    env.clear(); // the same as tapping the send button
    host.wake();
    await sleep(4200, me);
    if (run !== me) return;

    // The rest.
    if (!(await showPrefs(me))) return;
    await point(t.demoButton, 'Show me runs a quick demo of any scene', 2600, me);
  }

  async function play(kind) {
    const me = run;
    if (kind === 'tour') await playTour(me);
    else await playScene(me);
    if (run === me) stop();
  }

  // kind: 'scene' (the Show me button) or 'tour' (Show me everything).
  function start(kind = 'scene') {
    if (run) return;
    run = { timers: [], down: false, snap: host.snapshot(), kind };
    host.onChange(true);
    play(kind).catch((err) => { console.error("demo failed", err?.stack || err); stop(); });
  }

  // e: the touch or key that interrupted, if any. A tap inside an open settings panel leaves it
  // open so the user can carry on from there.
  function stop(e) {
    if (!run) return;
    const r = run;
    run = null;
    r.timers.forEach(clearTimeout);
    const env = host.env();
    if (r.panel && !(e?.target && r.panel.pop.contains(e.target))) r.panel.close();
    host.onPeek(false);
    host.signoff?.(false);
    if (r.kind === 'tour') { host.tour.popPrompt(); host.tour.closeScenes(e?.target); host.tour.closePanels(e?.target); }
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
