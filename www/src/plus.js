// Paid features that aren't scenes. Scenes carry their tier in environments/index.js
// (FREE_SCENES, tierOf); anything else that belongs to a tier is listed
// here by id, with the same tier ids and labels (TIERS), so the app has one idea of what
// Free and Plus mean.
//
// To make something a paid feature: add its id here, show tierTag(id) next to it, and ask
// canUse(id) before turning it on. Whether someone has Plus comes from purchases.js
// (RevenueCat in the app; on the web nobody has it until web sign-in exists), and owns() is
// the one place that asks.

import { TIERS, tierOf } from './environments/index.js';
import { LOCKED, hasPlus } from './purchases.js';

export const FEATURES = {
  'rainbow-ink': { tier: 'plus', name: 'Rainbow ink' },
};

export const featureTier = (id) => FEATURES[id]?.tier || 'free';

// Does this person have a tier? Free: always. Plus: if they bought it, or if nothing is
// locked (an app build that can't sell Plus yet, see purchases.js LOCKED).
const RANK = { free: 0, plus: 1 };
export function owns(tier) {
  if (RANK[tier] == null) return false;
  if (!LOCKED) return true;
  return RANK[tier] <= (hasPlus() ? RANK.plus : RANK.free);
}
export const canUse = (id) => owns(featureTier(id));

// Scenes. Anyone can open any scene and watch its Show me demo (and the Show me everything
// tour), whatever their plan: the demo is how a Free user sees what Plus offers. Only drawing
// in a Plus scene needs Plus: main.js asks canDraw() before a stroke or typed words, and
// opens the Plus panel (paywall.js) instead. Never gate canDemo().
export const canDraw = (env) => owns(tierOf(env));
export const canDemo = () => true;

// The same little Free / Plus pill the scene menu puts on each tile.
export function tierTag(id) {
  const tier = TIERS.find((t) => t.id === featureTier(id));
  const tag = document.createElement('span');
  tag.className = `scene-tier-tag tier-${tier.id}`;
  tag.textContent = tier.label;
  return tag;
}
