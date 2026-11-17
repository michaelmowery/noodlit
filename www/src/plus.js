// Paid features that aren't scenes. Scenes carry their tier in environments/index.js
// (FREE_SCENES, tierOf); anything else that belongs to a tier is listed
// here by id, with the same tier ids and labels (TIERS), so the app has one idea of what
// Free and Plus mean.
//
// To make something a paid feature: add its id here, show tierTag(id) next to it, and ask
// canUse(id) before turning it on. Nothing is locked yet: until purchases arrive every
// tier is open, so canUse() is always true. When purchases arrive (RevenueCat in the app,
// sign-in on the web), owns() is the one place that changes.

import { TIERS, tierOf } from './environments/index.js';

export const FEATURES = {
  'rainbow-ink': { tier: 'plus', name: 'Rainbow ink' },
};

export const featureTier = (id) => FEATURES[id]?.tier || 'free';

// Does this person have a tier? For now: yes, all of them.
const RANK = { free: 0, plus: 1 };
export function owns(tier) {
  return RANK[tier] != null; // later: RANK[tier] <= RANK[entitlement]
}
export const canUse = (id) => owns(featureTier(id));

// Scenes. Anyone can open any scene and watch its Show me demo (and the Show me everything
// tour), whatever their plan: the demo is how a Free user sees what Plus offers. Only drawing
// in a Plus scene needs Plus. So when locking arrives, gate canDraw() and leave canDemo() alone.
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
