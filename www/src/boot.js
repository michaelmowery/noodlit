// Startup: load the scene you'll open on, then the app shell. Every other scene loads later,
// on demand (see environments/index.js), so opening Noodlit doesn't wait for all of them.

import { prefs } from './prefs.js';
import { loadEnvironment } from './environments/index.js';

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
