// Anonymous usage counts, sent to GoatCounter (goatcounter.com).
//
// What gets sent: which page loaded, and the name of a few actions (a scene picked from the
// menu or shown at launch, the clear button, Show me started, a prompt opened, the app
// installed). Never the drawing, never typed
// words, never anything about what's on the surface. GoatCounter sets no cookies and keeps
// no profile: it tells visits apart with a short-lived hash, so nobody is followed around.
//
// It stays out of the way: nothing is sent while offline, on a preview or local copy, when a
// browser is being driven by a robot, or when "Anonymous usage counts" is off in Preferences.
//
// The store app (Capacitor) runs from capacitor://localhost, not noodlit.app, so it is let
// through separately, and every path it sends starts with its platform ("ios/scene/snow").
// In the GoatCounter dashboard, filter on "ios/" to see only the app, or on "scene/" to see
// web and app together.
// Every send is fire-and-forget, so a failure is silent and never touches the app.
//
// Setup: GOATCOUNTER_CODE is the name of the GoatCounter site (the "noodlit" in
// noodlit.goatcounter.com). Set it to '' to turn analytics off everywhere.

import { prefs } from './prefs.js';

export const GOATCOUNTER_CODE = 'noodlit';

// Inside the store app? Capacitor puts its bridge on window before any page script runs.
const cap = window.Capacitor;
export const NATIVE = !!(cap && typeof cap.isNativePlatform === 'function' && cap.isNativePlatform());
export const PLATFORM = NATIVE ? (cap.getPlatform?.() || 'app') : 'web';
const PREFIX = NATIVE ? PLATFORM + '/' : '';

// Only the live site and the store app count; local copies and preview hosts just log to the console.
const LIVE = NATIVE || /(^|\.)noodlit\.app$/.test(location.hostname);

function allowed() {
  if (!GOATCOUNTER_CODE) return false;
  if (prefs.get('analytics') === false) return false;
  if (navigator.webdriver) return false;
  if (navigator.onLine === false) return false;
  return true;
}

function send(params) {
  if (!allowed()) return;
  if (!LIVE) { console.debug('[analytics]', params.e ? 'event' : 'view', params.p); return; }
  try {
    const q = new URLSearchParams({
      ...params,
      s: [screen.width, screen.height, window.devicePixelRatio || 1].join(','),
      rnd: Math.random().toString(36).slice(2, 8),
    });
    const url = `https://${GOATCOUNTER_CODE}.goatcounter.com/count?${q}`;
    if (navigator.sendBeacon && navigator.sendBeacon(url)) return;
    const img = new Image();
    img.onerror = () => {}; // offline or blocked: drop it quietly
    img.src = url;
  } catch { /* never let counting break the app */ }
}

// An action: `name` is a short path-like id ("scene/snow"), `title` a readable label.
// In the store app both get the platform in front: "ios/scene/snow", "iOS app · Scene: Snow".
export function track(name, title = name) {
  send({ p: PREFIX + name, t: (NATIVE ? `${appLabel()} · ` : '') + title, e: 'true' });
}

function appLabel() { return PLATFORM === 'ios' ? 'iOS app' : PLATFORM === 'android' ? 'Android app' : 'App'; }

// One page view per launch, tagged with how Noodlit was opened: the store app, the installed
// web app, or a browser tab. The store app's page view is "/ios" so it has its own row.
const standalone = window.matchMedia?.('(display-mode: standalone)').matches || navigator.standalone === true;
if (NATIVE) {
  send({ p: '/' + PLATFORM, t: `Noodlit (${appLabel()})` });
  track('launch/store-app', 'Opened the store app');
} else {
  send({
    p: location.pathname || '/',
    t: document.title,
    r: document.referrer,
    q: location.search,
  });
  track(standalone ? 'launch/installed-app' : 'launch/browser', standalone ? 'Opened as installed app' : 'Opened in a browser');
}

// Installed to the home screen (Chrome, Edge and Android; iOS doesn't say, so the launch
// event above is how iOS installs show up).
window.addEventListener('appinstalled', () => track('install', 'Installed the app'));
