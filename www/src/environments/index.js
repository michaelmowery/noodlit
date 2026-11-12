// Fade environment registry.
//
// Every environment answers three questions:
//   1. How do strokes LOOK?   (strokeStart / strokeMove / strokeEnd + render)
//   2. How do they DECAY?     (update(dt), driven by setFadeSeconds / setPaused)
//   3. How do they CLEAR?     (clear(), the environment's own "blank slate" animation)
//
// Contract (all coordinates are CSS pixels; the shell handles devicePixelRatio):
//
//   export const myEnv = {
//     id: 'waves',                 // stable id, used for saved settings
//     name: 'Waves',               // shown in the UI
//     blurb: 'Wet sand, …',        // optional: one short line under the name in the scene menu
//     clearLabel: 'Big wave',      // label for the clear button
//     clearIcon: 'M3 15c…',        // optional: SVG path d (24x24) for the clear button
//     surface: 'Wet sand …',       // optional: aria-label for the canvas
//     fades: false,                // optional: a Release surface (nothing decays; clear() is the
//                                  //   release), so the shell hides fade speed and Hold
//     mode: 'become',              // optional: a Become surface (lib/become.js): the drawing turns
//                                  //   into something after a pause; the speed slider sets the pause
//     palette: [{ name, color }],  // optional: inks that suit the material, default first. The
//                                  //   shell shows an ink picker and calls instance.setInk(color)
//     create: () => instance,      // returns an object with the methods below
//   };
//
//   instance.resize({ width, height, dpr })   // (re)build buffers; keep content if possible
//   instance.strokeStart(id, x, y, info)      // info: { pointerType, pressure, width }
//   instance.strokeMove(id, x, y, info)
//   instance.strokeEnd(id)
//   instance.update(dt) -> boolean            // advance time; return true while still animating
//   instance.render(ctx)                      // ctx is the full-res stage, identity transform
//   instance.clear()                          // start the clear animation
//   instance.setFadeSeconds(s)                // roughly how long a fresh stroke lasts
//   instance.setPaused(bool)                  // freeze decay ("hold this thought")
//   instance.intro?(text, { at })             // optional: pre-draw a hint/prompt; `at` = vertical
//                                             //   centre as a fraction of height (env default if omitted)
//   instance.setDraft?(text, { x, y } | { at })  // optional: typed text, held at full strength
//   instance.nextDraft?()                     //   while typing; nextDraft starts another block,
//   instance.commitDraft?()                   //   commitDraft lets them all fade. Most of this
//                                             //   comes from draftMethods in lib/util.js; an env
//                                             //   supplies stampText() and calls applyDrafts().
//   instance.setInk?(color)                   // optional (with palette): colour for new strokes/words
//   instance.radiusFor(info, speed)           // stroke radius; the shell wraps it with the chosen brush
//                                             //   (lib/brushes.js) and sets instance.brushType
//   instance.dispose?()
//
// Environments come in families: Fade surfaces decay on their own; Release surfaces
// (fades: false) keep the drawing until you let it go; Become surfaces (mode: 'become') turn
// the drawing into something that leaves. Three newer ones: Reveal (scratch or wipe to uncover
// something, lib/reveal.js), Stir (the surface swirls the drawing together, lib/stir.js) and
// Echo (the drawing plays back stroke by stroke, then fades, lib/echo.js). The scene menu (top right) lists every
// family, sorted by environmentsFor() below; main.js (MODES) says how the shell treats each.
//
// Scenes load on demand. The list below is the catalogue: what the menu and Preferences need
// to name a scene (id, name, family, blurb) and how to fetch its code. Only the scene you open
// on is loaded at startup (see boot.js); the rest arrive in the background a moment later, or
// the instant you pick one. To add a scene: write its file, then add one line here. Its name
// and blurb come from this list, so set them here.

const scene = (id, name, mode, blurb, load) => ({ id, name, mode, blurb, load });

export const environments = [
  // Fade
  scene('shower-door', 'Shower door', 'fade', 'Steam fogs over your lines', () => import('./shower-door.js').then((m) => m.showerDoor)),
  scene('waves', 'Waves', 'fade', 'Wet sand, smoothed by the tide', () => import('./waves.js').then((m) => m.waves)),
  scene('snow', 'Snow', 'fade', 'Fresh snow fills in the grooves', () => import('./snow.js').then((m) => m.snow)),
  scene('windshield', 'Windshield', 'fade', 'Rain beads up, wipers clear it', () => import('./windshield.js').then((m) => m.windshield)),
  scene('frost', 'Frosted window', 'fade', 'Frost creeps back over your lines', () => import('./frost.js').then((m) => m.frost)),
  scene('chalk', 'Chalk sidewalk', 'fade', 'Rain washes the chalk away', () => import('./chalk.js').then((m) => m.chalk)),
  scene('stone', 'Water on hot stone', 'fade', 'Paint with water; the sun dries it', () => import('./stone.js').then((m) => m.stone)),
  scene('light', 'Light painting', 'fade', 'Glowing trails fade like a long exposure', () => import('./light.js').then((m) => m.light)),
  scene('breath', 'Breath on glass', 'fade', 'Breathe on a cold window and draw in the fog', () => import('./breath.js').then((m) => m.breath)),
  scene('tidepool', 'Tide pool', 'fade', 'Water seeps into lines in the wet sand', () => import('./tidepool.js').then((m) => m.tidepool)),
  scene('ink', 'Ink in water', 'fade', 'Lines bloom like ink drops, then clear', () => import('./ink.js').then((m) => m.ink)),
  scene('sparkler', 'Sparkler', 'fade', 'Sizzling trails cool to embers and smoke', () => import('./sparkler.js').then((m) => m.sparkler)),
  scene('starfield', 'Starfield', 'fade', 'Join the stars; they fade as dawn comes up', () => import('./starfield.js').then((m) => m.starfield)),
  // Release
  scene('stream', 'Stream', 'release', 'Float it off downstream', () => import('./stream.js').then((m) => m.stream)),
  scene('bottle', 'Message in a bottle', 'release', 'Cast it out to sea', () => import('./bottle.js').then((m) => m.bottle)),
  scene('lantern-flock', 'Lantern festival', 'release', 'Yours rises with hundreds of others', () => import('./lantern-flock.js').then((m) => m.lanternFlock)),
  scene('mailbox', 'Mailbox', 'release', 'Seal it up and send it off', () => import('./mailbox.js').then((m) => m.mailbox)),
  scene('burning-page', 'Burning page', 'release', 'It curls and burns into embers', () => import('./burning.js').then((m) => m.burning)),
  scene('dandelion', 'Dandelion', 'release', 'Make a wish and blow the seeds away', () => import('./dandelion.js').then((m) => m.dandelion)),
  scene('shredder', 'Shredder', 'release', 'Feed it through and hear it go', () => import('./shredder.js').then((m) => m.shredder)),
  scene('kite', 'Kite', 'release', 'Cut the string and let it fly', () => import('./kite.js').then((m) => m.kite)),
  scene('rice-paper', 'Rice paper', 'release', 'It melts into the koi pond', () => import('./rice-paper.js').then((m) => m.ricePaper)),
  scene('zen', 'Zen garden', 'release', 'Rake the gravel smooth again', () => import('./zen.js').then((m) => m.zen)),
  scene('whiteboard', 'Whiteboard', 'release', 'Marker stays until you wipe it', () => import('./whiteboard.js').then((m) => m.whiteboard)),
  scene('etch', 'Shake sketch', 'release', 'Shake it to wipe the screen clean', () => import('./etch.js').then((m) => m.etch)),
  scene('rocket', 'Rocket', 'release', 'Blast it off into space', () => import('./rocket.js').then((m) => m.rocket)),
  scene('paper-boat', 'Paper boat', 'release', 'Fold a boat and sail it away', () => import('./paper-boat.js').then((m) => m.paperBoat)),
  scene('leaf', 'Autumn leaf', 'release', 'Let the autumn wind take it', () => import('./leaf.js').then((m) => m.leaf)),
  scene('balloon', 'Balloon', 'release', 'Untie it and watch it float away', () => import('./balloon.js').then((m) => m.balloon)),
  scene('paper-airplane', 'Paper airplane', 'release', 'Fold it up and throw it', () => import('./paper-airplane.js').then((m) => m.paperAirplane)),
  scene('campfire', 'Campfire', 'release', 'Toss it into the fire', () => import('./campfire.js').then((m) => m.campfire)),
  // Become
  scene('fireflies', 'Fireflies', 'become', 'Pause, and your lines lift off as fireflies', () => import('./fireflies.js').then((m) => m.fireflies)),
  scene('constellation', 'Constellation', 'become', 'Pause, and your lines snap into stars', () => import('./constellation.js').then((m) => m.constellation)),
  scene('bloom', 'Bloom', 'become', 'Pause, and your stems sprout leaves and flowers', () => import('./bloom.js').then((m) => m.bloom)),
  scene('thaw', 'Thaw', 'become', 'Pause, and your frost lines melt and run', () => import('./thaw.js').then((m) => m.thaw)),
  // Reveal
  scene('scratch-card', 'Scratch card', 'reveal', 'Scratch off the foil to find a prompt', () => import('./scratch-card.js').then((m) => m.scratchCard)),
  scene('scratch-art', 'Scratch art', 'reveal', 'Scrape through black to the colours below', () => import('./scratch-art.js').then((m) => m.scratchArt)),
  scene('misty-window', 'Misty window', 'reveal', 'Wipe the mist away to see the view', () => import('./misty-window.js').then((m) => m.mistyWindow)),
  // Stir
  scene('latte', 'Latte art', 'stir', 'Pour milk lines; the cup swirls them away', () => import('./latte.js').then((m) => m.latte)),
  scene('rinse', 'Rinse water', 'stir', 'Paint swirls and mingles in the rinse jar', () => import('./rinse.js').then((m) => m.rinse)),
  scene('kaleidoscope', 'Kaleidoscope', 'stir', 'Your lines mirror, turn and melt together', () => import('./kaleidoscope.js').then((m) => m.kaleidoscope)),
  // Echo
  scene('canyon', 'Canyon echo', 'echo', 'Pause, and the canyon plays your lines back', () => import('./canyon.js').then((m) => m.canyon)),
  scene('neon', 'Neon sign', 'echo', 'Pause, and your drawing lights up in neon', () => import('./neon.js').then((m) => m.neon)),
  scene('skywriting', 'Skywriting', 'echo', 'Pause, and a plane writes it across the sky', () => import('./skywriting.js').then((m) => m.skywriting)),
];

// Noodlit Plus: the free scenes, by id. Every other scene (including new ones) is Plus and
// shows a "Plus" badge in the scene menu. Nothing is locked yet: every scene stays free
// while Noodlit is in preview.
export const FREE_SCENES = new Set([
  'shower-door', 'waves', 'snow', // Fade
  'stream', 'bottle', 'mailbox', 'whiteboard', // Release
  'fireflies', // Become
  'scratch-card', // Reveal
  'latte', // Stir
  'canyon', // Echo
]);
export const isPlus = (env) => !FREE_SCENES.has(env.id);

export const modeOf = (env) => env.mode || (env.fades === false ? 'release' : 'fade');

// Scene menu: grouped by tier (Free, then Plus), then by family, each alphabetized by name,
// so a new scene lands in the right place on its own. (The default scene is still
// environments[0], Shower door, whatever the menu order.)
const byName = (a, b) => a.name.localeCompare(b.name);
export function environmentsFor(mode, { plus } = {}) {
  return environments
    .filter((e) => modeOf(e) === mode && (plus === undefined || isPlus(e) === plus))
    .sort(byName);
}
// Every family in the registry, in first-seen order (fade, release, become, …).
export const modes = () => [...new Set(environments.map(modeOf))];

// ------------------------------------------------------------------ loading
// A loaded scene is its own definition (create, palette, clear label…) plus its catalogue line.
const loaded = new Map();   // id -> definition
const loading = new Map();  // id -> Promise<definition>
const entryFor = (id) => environments.find((e) => e.id === id) || environments[0];

// Fetch a scene's code (once) and return its definition. An unknown id gives the default scene.
// If the fetch fails (offline before the scene was ever cached) the promise rejects.
export function loadEnvironment(id) {
  const entry = entryFor(id);
  if (loaded.has(entry.id)) return Promise.resolve(loaded.get(entry.id));
  if (!loading.has(entry.id)) {
    loading.set(entry.id, entry.load().then((def) => {
      const full = { ...def, id: entry.id, name: entry.name, mode: entry.mode, blurb: entry.blurb };
      loaded.set(entry.id, full);
      return full;
    }).finally(() => loading.delete(entry.id)));
  }
  return loading.get(entry.id);
}

// A scene that has already loaded, or null. (Use loadEnvironment when it might not have.)
export const loadedEnvironment = (id) => loaded.get(entryFor(id).id) || null;

// The loaded scene for an id, falling back to whichever scene is loaded (boot.js makes sure
// the starting one is). For code that can't wait.
export function getEnvironment(id) {
  return loadedEnvironment(id) || loaded.values().next().value;
}

// Fetch every scene in the background, one after another, so the menu's previews and the next
// scene you pick are ready.
export async function preloadAll() {
  for (const e of environments) {
    try { await loadEnvironment(e.id); } catch { /* offline: it loads when it's picked */ }
  }
}
