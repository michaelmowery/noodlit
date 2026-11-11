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
//     fades: false,                // optional: a Release surface (nothing decays; clear() is the
//                                  //   release), so the shell hides fade speed and Hold
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
//   instance.dispose?()
//
// Environments come in two families, picked with the Fade / Release toggle: Fade surfaces
// decay on their own; Release surfaces (fades: false) keep the drawing until you let it go.
// The toolbar's environment button cycles through the active family in order.

import { showerDoor } from './shower-door.js';
import { waves } from './waves.js';
import { snow } from './snow.js';
import { whiteboard } from './whiteboard.js';
import { stream } from './stream.js';
import { lantern } from './lantern.js';
import { bottle } from './bottle.js';

export const environments = [showerDoor, waves, snow, whiteboard, stream, bottle, lantern];

export const modeOf = (env) => (env.fades === false ? 'release' : 'fade');

export function environmentsFor(mode) {
  return environments.filter((e) => modeOf(e) === mode);
}

export function getEnvironment(id) {
  return environments.find((e) => e.id === id) || environments[0];
}
