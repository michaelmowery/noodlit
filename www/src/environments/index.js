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
//     clearLabel: 'Big wave',      // label for the clear button
//     clearIcon: 'M3 15c…',        // optional: SVG path d (24x24) for the clear button
//     surface: 'Wet sand …',       // optional: aria-label for the canvas
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
//   instance.intro?(text)                     // optional: pre-draw a hint on first launch
//   instance.dispose?()
//
// The toolbar's environment button cycles through `environments` in order.
// Planned: sand (wind drift), snow (fresh snowfall fills the marks), whiteboard.

import { showerDoor } from './shower-door.js';
import { sand } from './sand.js';

export const environments = [showerDoor, sand];
import { waves } from './waves.js';

export const environments = [showerDoor, waves];

export function getEnvironment(id) {
  return environments.find((e) => e.id === id) || environments[0];
}
