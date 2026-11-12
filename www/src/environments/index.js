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
// Environments come in three families: Fade surfaces decay on their own; Release surfaces
// (fades: false) keep the drawing until you let it go; Become surfaces (mode: 'become') turn
// the drawing into something that leaves. The scene menu (top right) lists every family,
// sorted by environmentsFor() below.

import { showerDoor } from './shower-door.js';
import { waves } from './waves.js';
import { snow } from './snow.js';
import { whiteboard } from './whiteboard.js';
import { windshield } from './windshield.js';
import { stream } from './stream.js';
import { bottle } from './bottle.js';
import { mailbox } from './mailbox.js';
import { frost } from './frost.js';
import { chalk } from './chalk.js';
import { stone } from './stone.js';
import { zen } from './zen.js';
import { etch } from './etch.js';
import { light } from './light.js';
import { breath } from './breath.js';
import { tidepool } from './tidepool.js';
import { ink } from './ink.js';
import { sparkler } from './sparkler.js';
import { starfield } from './starfield.js';
import { burning } from './burning.js';
import { dandelion } from './dandelion.js';
import { shredder } from './shredder.js';
import { kite } from './kite.js';
import { lanternFlock } from './lantern-flock.js';
import { ricePaper } from './rice-paper.js';
import { rocket } from './rocket.js';
import { paperBoat } from './paper-boat.js';
import { leaf } from './leaf.js';
import { balloon } from './balloon.js';
import { paperAirplane } from './paper-airplane.js';
import { campfire } from './campfire.js';
import { fireflies } from './fireflies.js';
import { constellation } from './constellation.js';
import { bloom } from './bloom.js';
import { thaw } from './thaw.js';

export const environments = [
  // Fade
  showerDoor, waves, snow, windshield, frost, chalk, stone, light,
  breath, tidepool, ink, sparkler, starfield,
  // Release
  stream, bottle, lanternFlock, mailbox, burning, dandelion, shredder, kite, ricePaper, zen, whiteboard, etch, rocket,
  paperBoat, leaf, balloon, paperAirplane, campfire,
  // Become
  fireflies, constellation, bloom, thaw,
];

// Noodlit Plus: the free scenes, by id. Every other scene (including new ones) is Plus and
// shows a "Plus" badge in the scene menu. Nothing is locked yet: every scene stays free
// while Noodlit is in preview.
export const FREE_SCENES = new Set([
  'shower-door', 'waves', 'snow', // Fade
  'stream', 'bottle', 'mailbox', 'whiteboard', // Release
  'fireflies', // Become
]);
export const isPlus = (env) => !FREE_SCENES.has(env.id);

export const modeOf = (env) => env.mode || (env.fades === false ? 'release' : 'fade');

// Menu order within a family: free scenes first, then Plus, each alphabetized by name, so a
// new scene lands in the right place on its own. (The default scene is still environments[0],
// Shower door, whatever the menu order.)
const byName = (a, b) => a.name.localeCompare(b.name);
export function environmentsFor(mode) {
  const group = environments.filter((e) => modeOf(e) === mode);
  return [
    ...group.filter((e) => !isPlus(e)).sort(byName),
    ...group.filter(isPlus).sort(byName),
  ];
}

export function getEnvironment(id) {
  return environments.find((e) => e.id === id) || environments[0];
}
