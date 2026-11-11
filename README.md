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

## App stores later
`www/` is already the default Capacitor `webDir`: `npm i @capacitor/core @capacitor/cli @capacitor/ios @capacitor/android`,
`npx cap init Noodlit com.example.noodlit --web-dir www`, then `npx cap add ios` / `android`.
