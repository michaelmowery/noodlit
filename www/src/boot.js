// Startup: load the scene you'll open on, then the app shell. Every other scene loads later,
// on demand (see environments/index.js), so opening Noodlit doesn't wait for all of them.

import { prefs } from './prefs.js';
import { environments, loadEnvironment } from './environments/index.js';

// Tidy up after scenes that have been retired, so nothing of theirs is left on the device.
// (Moss wall, the one Grow scene, kept its wall in localStorage.)
const RETIRED = ['moss-wall', 'whirlpool', 'tea-leaves'];
try {
  // Whirlpool became Flush: anyone who left off there opens on Flush.
  if (localStorage.getItem('noodlit.env') === JSON.stringify('whirlpool')) localStorage.setItem('noodlit.env', JSON.stringify('flush'));
  if (prefs.get('startScene') === 'whirlpool') prefs.set('startScene', 'flush');
  localStorage.removeItem('noodlit.grow.moss-wall');
  for (const id of RETIRED) {
    for (const k of ['brush', 'ink', 'tip', 'demoSeen']) localStorage.removeItem(`noodlit.${k}.${id}`);
    if (localStorage.getItem('noodlit.env') === JSON.stringify(id)) localStorage.removeItem('noodlit.env');
    if (prefs.get('startScene') === id) prefs.set('startScene', 'last');
  }
  // Any other saved scene that isn't in the catalogue any more (Tide pool, say): forget it, so
  // "Start on" goes back to "Last scene used" instead of quietly pinning the default scene.
  const known = (id) => environments.some((e) => e.id === id);
  const pinned = prefs.get('startScene');
  if (pinned && pinned !== 'last' && !known(pinned)) prefs.set('startScene', 'last');
  const left = localStorage.getItem('noodlit.env');
  if (left !== null) {
    let id = null;
    try { id = JSON.parse(left); } catch { /* not ours */ }
    if (!known(id)) localStorage.removeItem('noodlit.env');
  }
} catch { /* storage blocked: nothing was saved either */ }

// The same choice main.js makes: the scene pinned in Preferences, or wherever you left off.
function startId() {
  const pinned = prefs.get('startScene');
  if (pinned && pinned !== 'last') return pinned;
  try { return JSON.parse(localStorage.getItem('noodlit.env')) || 'shower-door'; } catch { return 'shower-door'; }
}

// If that scene can't be fetched (offline and never cached), fall back to the default one.
loadEnvironment(startId())
  .catch(() => loadEnvironment('shower-door'))
  .finally(() => import('./main.js'));
