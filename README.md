# Noodlit

A fading scratchpad for getting ideas out of your head. Scribble, sketch or type whatever is
rattling around, then let it go, so the next idea always has room. It started on a foggy shower
door: you write in the steam, and the fog quietly takes it back.

**Live at [noodlit.app](https://noodlit.app)** as an installable web app (PWA) that works
offline, with an iOS app on the way to the App Store and Android to follow. New scenes land
often.

## What's in the app

### Six modes, 53 scenes
Every scene is defined by how strokes look, how they decay, and how they clear.

- **Fade** scenes disappear on their own at the pace you pick (12): Shower door, Waves, Snow,
  Breath on glass, Chalk sidewalk, Frosted window, Ink in water, Light painting, Fireworks,
  Starfield, Water on hot stone, Windshield.
- **Release** scenes keep the drawing until you let it go, and then carry it off (18): Message in
  a bottle, Mailbox, Stream, Whiteboard, Autumn leaf, Balloon, Burning page, Campfire, Dandelion,
  Kite, Lantern festival, Paper airplane, Paper boat, Rice paper, Rocket, Shake sketch, Shredder,
  Zen garden.
- **Become** scenes turn the drawing into something when you pause, and then it leaves (4):
  Fireflies, Bloom, Constellation, Thaw.

Three newer modes:

- **Reveal** (7): scratch or wipe to uncover something. Scratch card hides a prompt under foil;
  Scratch art scrapes through black wax to a random hidden picture; Misty window wipes mist off a view
  (the colour picker chooses the colours or the view); Bubble wrap pops, bubble by bubble, down
  to a prompt on the parcel underneath; Invisible ink warms a hidden note out of the page;
  Pencil rubbing shades up what is carved below; Beach dig brushes sand off a message.
- **Stir** (6): the surface swirls the drawing together until it mixes away. Latte art winds
  your lines of milk into spirals; Rinse water mingles paint in a rinse jar; Kaleidoscope
  mirrors your lines six ways as they turn; Flush is a toilet bowl that swirls them down and
  away (tap its handle); Paper marbling floats inks to comb and print; Galaxy winds stardust
  into spiral arms. One brush in each drags instead of drawing.
- **Echo** (6): pause, and the drawing plays back stroke by stroke, then fades. Canyon echo
  answers three times, each echo fainter and further off; Neon sign lights the drawing up in place; Skywriting has a plane
  write it across the sky; Music box punches and plays it as a tune; Pond ripples plays it back
  as ripples; Seismograph traces it onto a chart.

The scene chip at the top right opens **Choose a scene**, with live previews: Featured scenes on
top, then every scene A to Z or grouped by mode. Each tile is tagged **Free** or **Plus**.
Plus scenes will be part of Noodlit Plus, coming soon; for now every scene is free and
nothing is locked.

### Drawing and controls
- **Brushes**: three per scene (listed small to large) with a Round or Flat tip; some scenes also
  offer an ink palette.
- **Fade speed** (Fade scenes): a slider from Drift (about 45s) through Flow (20s) to Rush (8s),
  plus **Hold** to freeze a thought while you look at it.
- **Clear / let go**: each scene has its own clear button and animation (steam up, big wave,
  send, cast off, and so on).
- **Typing**: the keyboard button (or just start typing on a hardware keyboard) writes on the
  surface in a hand-drawn style. Tap to place your words, or drag to move them.
- **Prompts**: the lightbulb pops a suggestion bubble above the toolbar.
- **Pause** (Become and Echo scenes): the same slider sets how long a pause it takes before the drawing
  changes (about 1.5 to 12 seconds). Hold stops the clock, and the tray button changes it now.
- **Undo** (Release scenes, and Become and Echo scenes until the drawing changes): the undo button, a two-finger tap, or Ctrl/Cmd+Z takes back the last
  stroke or typed block.
- **Sound**: soft generated ambience and effects for each scene, with an on/off toggle. The
  ambience settles to a hush after a few seconds of nothing happening and comes back when you touch the screen.

### Help, About and Preferences
- **Show me** runs a short hands-off demo of the current scene, and each scene demos itself the
  first time you open it. **Show me everything** (in About, and on the very first visit) is a
  longer tour of the whole app.
- **About** (tap the wordmark or the ⓘ button) explains the modes and has Send feedback,
  **Check for updates**, and the current version.
- **Preferences** (from About, saved on the device): first-visit demos, sound, the prompt button,
  the note after updates, and which scene, fade speed and brush to start with.
- **Updates**: when a new version has been deployed, a "New version ready" pill appears. The page
  never reloads on its own, so nothing on the canvas is lost.

## Run locally
No build step: it's plain HTML, CSS and JavaScript modules.

    cd www && python3 -m http.server 8000   # then open http://localhost:8000

About shows the version as "dev" locally.

## Deploy
Every push to `main` deploys `www/` to GitHub Pages (`.github/workflows/pages.yml`), served at
noodlit.app (`www/CNAME`). Open a PR, merge it, and it's live a minute or two later.

### Versions (don't edit them in PRs)
The deploy workflow stamps the version: About shows `0.<deploy run number>` and the service-worker
cache becomes `noodlit-v<run>-<short sha>`, so every deploy gets a fresh cache and the "New
version ready" pill. In the repo, `const VERSION` in `www/sw.js` and `const STAMP` in
`www/src/about.js` keep the placeholders `__BUILD__` and `__APP_VERSION__`. **PRs must not edit
these lines**; parallel PRs bumping them used to cause merge conflicts. The same step fills in
`const SHELL` in `www/sw.js` (the files cached for offline use) with every file under `www/`, so
new files need no listing anywhere.

## Code layout
- `www/index.html`, `styles.css`, `about.css`, `prefs.css`: the shell, toolbar and panels
- `www/src/boot.js`: loads the scene you open on, then the shell
- `www/src/main.js`: canvas, multi-touch input, render loop, toolbar, scene menu, typing, undo
  gestures. Knows nothing about any particular scene.
- `www/src/environments/index.js`: the scene catalogue (scenes load on demand), the contract
  every scene implements, the free/Plus list and menu ordering
- `www/src/environments/*.js`: one file per scene
- `www/src/lib/fade.js`: shared base for most Fade scenes (and Zen garden and Shake sketch): a
  strength map that strokes raise and time lowers
- `www/src/lib/release.js`: shared base for Release scenes (the sheet, ink, typing and hand-off)
- `www/src/lib/become.js`: shared base for Become scenes (ink, the pause clock, turning lines
  into particles, typing, undo)
- `www/src/lib/reveal.js`, `stir.js`, `echo.js`: shared bases for Reveal, Stir and Echo scenes
- `www/src/lib/brushes.js`, `undo.js`, `sound.js`, `util.js`: brushes, Release undo, generated
  sound, helpers
- `www/src/lib/prompts.js`, `textdots.js`: the lightbulb prompts (also printed on the Scratch
  card), and typed text as points for scenes made of particles
- `www/src/demo.js`: Show me and Show me everything
- `www/src/about.js`, `prefs.js`, `welcome.js`, `update.js`: About, Preferences, the welcome
  and new version note, and update checks
- `www/sw.js`: offline cache
- `docs/`: screenshots from past changes

## Adding a scene
1. Create `www/src/environments/<name>.js` exporting `{ id, name, blurb, clearLabel, create }`
   (see the contract at the top of `environments/index.js`). Set `fades: false` for a Release
   scene, or `mode: 'become'` for a Become scene. The catalogue line's mode can also be `reveal`,
   `stir` or `echo` (base classes in `lib/reveal.js`, `lib/stir.js`, `lib/echo.js`); `MODES` in `main.js` says how the toolbar treats each.
2. Build on `lib/fade.js`, `lib/release.js` or `lib/become.js` where you can; their header comments say what a
   scene supplies.
3. Add one line for it to the `environments` catalogue in `environments/index.js` (id, name,
   mode, blurb and how to import it). New scenes are Plus unless added to `FREE_SCENES`.
4. Add its brushes to `lib/brushes.js`.

## App stores
`www/` is already the default Capacitor `webDir`, so the native apps will wrap this same code:
`npm i @capacitor/core @capacitor/cli @capacitor/ios @capacitor/android`, `npx cap init`, then
`npx cap add ios` / `android`.

## iOS app (Capacitor)

The App Store build wraps `www/` unchanged with [Capacitor](https://capacitorjs.com). Native files live in `ios/`; `www/` stays the single source for the web and the app.

```bash
npm install          # once
npx cap sync ios     # copy www/ into the iOS project after any web change
npx cap open ios     # open in Xcode, pick a simulator, press Run
```

App icon and splash come from `www/icons/icon.svg`: run `npm run assets` after changing it.
Service workers don't run inside the iOS app, so updates there ship through the App Store.

## Android app (Capacitor)

The Google Play build wraps the same `www/` with Capacitor. Native files live in `android/`.
Nothing about the website changes.

- **Build in the cloud (easiest):** GitHub → Actions → **Android build** → *Run workflow*. It
  makes a signed `.aab` (artifact `noodlit-release`) ready to upload to Google Play. It needs the
  four `ANDROID_KEY*` secrets listed at the top of `.github/workflows/android.yml`. Every pull
  request that touches the app also runs a debug build to prove it still compiles.
- **Version:** the name people see is `version` in `package.json`; the version code is the
  workflow's run number, so it always goes up.
- **On a computer with Android Studio:** `npm install`, `npx cap sync android`, `npx cap open android`,
  then Run on an emulator or a phone.
- **Icon and splash:** `npm run assets` makes both platforms' icons from `www/icons/icon.svg`
  (Android gets an adaptive icon: `assets/icon-background.png` + `assets/icon-foreground.png`).

How the Android app differs from the website: no service worker or update check (updates come
from Google Play), Save puts the picture in a *Noodlit* album in the Gallery, and voice uses the
phone's speech recognition. Noodlit Plus stays hidden, as on iOS, until purchases are set up.
