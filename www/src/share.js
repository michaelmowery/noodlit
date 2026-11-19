// The Share panel, opened by the round share button beside the sound toggle. Tapping it freezes
// the scene (just the canvas: lib/snapshot.js), then offers:
//   Share   the device's share sheet: Instagram, WhatsApp, Messages, Threads, Mail and so on
//   Save    Photos in the iOS app, a PNG download on the website
//   Copy    the picture to the clipboard
//   Share Noodlit   the app's link, without a picture
// The picture carries a small "noodlit.app" tag by default (switchable, remembered), and shared
// pictures come with a line of text and the link where the receiving app takes text. The point
// of all this is to spread Noodlit, so the defaults lean that way.
// Free in every scene: it only keeps what's already on screen.

import { can, freeze, compose, toBlob, snapshotName, shareImage, saveImage, copyImage, shareLink } from './lib/snapshot.js';
import { APP_STORE_URL } from './purchases.js';
import { track, NATIVE } from './analytics.js';

const SITE = 'https://noodlit.app';
const SHARE_TEXT = `Made with Noodlit, a scratchpad that lets your ideas fade. Try it free: ${SITE}` + (APP_STORE_URL ? ` · iPhone and iPad: ${APP_STORE_URL}` : '');
const APP_TEXT = 'Noodlit: get it out, let it go. A fading scratchpad for getting ideas out of your head.';
const TAG_KEY = 'noodlit.shareTag';

const ui = document.getElementById('ui');
const panel = document.getElementById('share');
const img = document.getElementById('share-img');
const tagSwitch = document.getElementById('share-tag');
const statusEl = document.getElementById('share-status');
const hint = document.getElementById('share-hint');
const flash = document.getElementById('snap-flash');
const button = document.getElementById('btn-share');
const act = (name) => panel.querySelector(`[data-act="${name}"]`);

const logo = new Image();
logo.src = 'icons/icon.svg';

let still = null; // the frozen scene
let scene = '';
let picture = null; // { blob } for the current tag setting
let lastFocus = null;
let busy = false;

try { tagSwitch.checked = localStorage.getItem(TAG_KEY) !== '0'; } catch { /* default on */ }
document.getElementById('share-save-label').textContent = NATIVE ? 'Save to Photos' : 'Save';

const status = (text) => { statusEl.textContent = text || ''; };

// Show the picture straight away on the preview canvas, then make the PNG in the background so
// it's ready before a tap (Safari only opens the share sheet promptly after a tap).
let pending = null;
function render() {
  const mine = still;
  const pic = compose(mine, { tag: tagSwitch.checked, logo: logo.complete ? logo : null });
  img.width = pic.width;
  img.height = pic.height;
  img.getContext('2d').drawImage(pic, 0, 0);
  pending = toBlob(pic).then((blob) => {
    if (mine !== still) return null;
    picture = { blob };
    return picture;
  });
  return pending;
}
const ready = () => picture || pending || render();

export function openShare(canvas, sceneName, sceneId) {
  if (!panel.hidden) return;
  if (['choosing', 'typing', 'welcome-open', 'prefs-open', 'notes-open', 'about-open', 'plus-open'].some((c) => ui.classList.contains(c))) return;
  still = freeze(canvas);
  scene = sceneName;
  picture = null;
  flash.classList.remove('flash');
  void flash.offsetWidth;
  flash.classList.add('flash');
  track('share/open/' + sceneId, `Share opened: ${sceneName}`);
  act('share').hidden = !can.share();
  act('save').hidden = !can.save();
  act('copy').hidden = !can.copy();
  hint.hidden = act('share').hidden;
  status('');
  lastFocus = document.activeElement;
  panel.hidden = false;
  ui.classList.add('share-open');
  button.setAttribute('aria-expanded', 'true');
  render().catch(() => status("Couldn't make the picture. Please try again."));
  (act('share').hidden ? act('save') : act('share')).focus({ preventScroll: true });
}

function close() {
  if (panel.hidden) return;
  panel.hidden = true;
  ui.classList.remove('share-open');
  button.setAttribute('aria-expanded', 'false');
  picture = null;
  pending = null;
  still = null;
  img.width = img.height = 0;
  if (lastFocus && lastFocus !== document.body) lastFocus.focus?.({ preventScroll: true });
}

const MESSAGES = {
  shared: 'Thanks for sharing Noodlit!',
  photos: 'Saved to Photos',
  downloaded: 'Saved to your downloads',
  copied: 'Copied. Paste it anywhere.',
  cancelled: '',
};

async function run(name) {
  if (busy) return;
  busy = true;
  panel.setAttribute('aria-busy', 'true');
  try {
    let how;
    if (name === 'app') {
      how = await shareLink({ title: 'Noodlit', text: APP_TEXT, url: SITE });
      if (how === 'copied') how = 'linkCopied';
    } else {
      const p = await ready();
      const file = snapshotName(scene);
      if (name === 'share') how = await shareImage(p.blob, file, SHARE_TEXT);
      else if (name === 'save') how = await saveImage(p.blob, file);
      else how = await copyImage(p.blob);
    }
    if (how !== 'cancelled') track(`share/${name}`, `Share: ${name}${tagSwitch.checked ? '' : ' (no tag)'}`);
    status(how === 'linkCopied' ? 'Link copied. Paste it to a friend.' : MESSAGES[how]);
  } catch (err) {
    const denied = /denied|permission|not authori[sz]ed/i.test(err?.message || err?.errorMessage || '');
    status(denied && name === 'save'
      ? 'Noodlit needs permission to add to Photos. Turn it on in Settings > Noodlit > Photos.'
      : "That didn't work. Please try again.");
  } finally {
    busy = false;
    panel.removeAttribute('aria-busy');
  }
}

button.addEventListener('click', () => window.dispatchEvent(new CustomEvent('noodlit:share')));
panel.addEventListener('click', (e) => {
  if (e.target.closest('[data-close]')) return close();
  const b = e.target.closest('button[data-act]');
  if (b) run(b.dataset.act);
});
tagSwitch.addEventListener('change', () => {
  try { localStorage.setItem(TAG_KEY, tagSwitch.checked ? '1' : '0'); } catch { /* private mode */ }
  status('');
  picture = null;
  render().catch(() => {});
});

// While open, keys belong to the panel, as in About.
window.addEventListener('keydown', (e) => {
  if (panel.hidden) return;
  if (e.key === 'Escape') { e.preventDefault(); close(); }
  else if (e.key === 'Tab') {
    const items = [...panel.querySelectorAll('button:not([disabled]), input')].filter((el) => el.offsetParent !== null);
    const first = items[0], last = items[items.length - 1];
    if (e.shiftKey && document.activeElement === first) { e.preventDefault(); last.focus(); }
    else if (!e.shiftKey && document.activeElement === last) { e.preventDefault(); first.focus(); }
  }
  e.stopImmediatePropagation();
}, true);
