# Noodlit (MVP: shower door)

A fading-canvas scratchpad. Wipe ideas through fogged glass; the fog slowly returns and erases them.

## Run locally
    cd www && python3 -m http.server 8000   # then open http://localhost:8000
Live at https://noodlit.app (GitHub Pages, deployed by `.github/workflows/pages.yml` on every push to `main`). Installable as a PWA (manifest + offline service worker).

## Layout
- `www/index.html`, `styles.css`: shell and toolbar (Fade speed, Hold, Clear)
- `www/src/main.js`: canvas, multi-touch input, render loop. Knows nothing about fog.
- `www/src/environments/index.js`: environment registry and the contract every environment implements
  (how strokes look, how they decay, how they clear)
- `www/src/environments/shower-door.js`: the MVP environment
- `www/sw.js`: offline cache. Bump `VERSION` on every release.


## Adding an environment (waves, sand, snow...)
Create `src/environments/<name>.js` exporting `{ id, name, clearLabel, create }`, add it to the
`environments` array, and add the file to `sw.js`.

Most Fade scenes (frosted window, steamy mirror, chalk sidewalk, water on hot stone, zen garden,
shake sketch, light painting) build on `www/src/lib/fade.js`: a strength map that strokes raise and
time lowers. A scene supplies its background, its stroke or covering layer, how decay varies across
the surface, and its clear animation (see the header comment in fade.js).

## App stores later
`www/` is already the default Capacitor `webDir`: `npm i @capacitor/core @capacitor/cli @capacitor/ios @capacitor/android`,
`npx cap init Noodlit com.example.noodlit --web-dir www`, then `npx cap add ios` / `android`.

## Release scenes
Release surfaces (`fades: false`) don't decay; you let the drawing go. Stream is self-contained;
Message in a bottle and Paper lantern build on `www/src/lib/release.js`, which handles the sheet,
ink, typing and the hand-off (released with the clear button). A new scene supplies its layout, background,
sheet texture and how it carries the sheet away (see the header comment in release.js).
