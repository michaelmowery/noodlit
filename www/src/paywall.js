// The Noodlit Plus panel: what Plus adds, the three plans with the App Store's prices,
// Restore Purchases, and the Terms and Privacy links Apple asks for.
//
// It opens from About ("Noodlit Plus") and from the shell (main.js) when a Free user starts
// drawing or typing in a Plus scene, via the 'noodlit:open-plus' event (detail.scene names it).
// On the website, where Plus can't be bought yet, it points to the app instead.

import { environments, isPlus } from './environments/index.js';
import { SHOW_PLUS, canSell, hasPlus, startPurchases, getPlans, buy, restore, TERMS_URL, PRIVACY_URL, APP_STORE_URL } from './purchases.js';
import { track } from './analytics.js';

const ui = document.getElementById('ui');
const panel = document.getElementById('plus');
const reasonEl = document.getElementById('plus-reason');
const haveEl = document.getElementById('plus-have');
const buyEl = document.getElementById('plus-buy');
const webEl = document.getElementById('plus-web');
const plansEl = document.getElementById('plus-plans');
const statusEl = document.getElementById('plus-status');
const restoreBtn = document.getElementById('plus-restore');

document.getElementById('plus-count').textContent = String(environments.filter(isPlus).length) + ' more';
document.getElementById('plus-terms').href = TERMS_URL;
if (canSell) document.getElementById('plus-privacy').href = PRIVACY_URL; // the app has no noodlit.app to be relative to
document.getElementById('plus-native-links').hidden = !canSell;
document.getElementById('plus-terms-wrap').hidden = !canSell; // Apple's licence covers App Store purchases only
const storeLink = document.getElementById('plus-store');
if (APP_STORE_URL) { storeLink.href = APP_STORE_URL; storeLink.hidden = false; }

// Learn whether this person already has Plus as soon as the app starts, not on first tap.
startPurchases();

const PLAN_TEXT = {
  monthly: { name: 'Monthly', per: '/ month' },
  yearly: { name: 'Yearly', per: '/ year', note: 'Best value for a habit' },
  lifetime: { name: 'Lifetime', per: 'once', note: 'Pay once, keep it' },
};

let busy = false;
let lastFocus = null;

const status = (text) => { statusEl.textContent = text || ''; };

function setBusy(on) {
  busy = on;
  panel.querySelectorAll('.plus-plan, #plus-restore').forEach((b) => { b.disabled = on; });
  panel.setAttribute('aria-busy', String(on));
}

function plansButtons(plans) {
  plansEl.textContent = '';
  for (const plan of plans) {
    const t = PLAN_TEXT[plan.id];
    const b = document.createElement('button');
    b.type = 'button';
    b.className = `plus-plan plan-${plan.id}`;
    b.innerHTML = `<span class="plus-plan-name"></span><span class="plus-plan-price"></span>${t.note ? '<span class="plus-plan-note"></span>' : ''}`;
    b.querySelector('.plus-plan-name').textContent = t.name;
    b.querySelector('.plus-plan-price').textContent = `${plan.price} ${t.per}`;
    if (t.note) b.querySelector('.plus-plan-note').textContent = t.note;
    b.addEventListener('click', () => purchase(plan));
    plansEl.append(b);
  }
}

async function showPlans() {
  plansEl.textContent = '';
  status('Loading prices…');
  const plans = await getPlans();
  if (panel.hidden || hasPlus()) return;
  if (!plans.length) { status("Couldn't reach the App Store. Check your connection and try again."); return; }
  status('');
  plansButtons(plans);
}

async function purchase(plan) {
  if (busy) return;
  setBusy(true);
  status('Opening the App Store…');
  track('plus/buy/' + plan.id, `Plus: buy tapped (${PLAN_TEXT[plan.id].name})`);
  const { result, message } = await buy(plan);
  setBusy(false);
  if (result === 'done') { track('plus/bought/' + plan.id, `Plus: bought (${PLAN_TEXT[plan.id].name})`); render(); status('Welcome to Noodlit Plus. Every scene is open.'); }
  else if (result === 'cancelled') status('');
  else if (result === 'pending') status("Waiting for approval. Plus will turn on once it's approved.");
  else status(message ? `The purchase didn't go through: ${message}` : "The purchase didn't go through. Please try again.");
}

restoreBtn.addEventListener('click', async () => {
  if (busy) return;
  setBusy(true);
  status('Restoring…');
  const r = await restore();
  setBusy(false);
  if (!r.ok) status(r.message);
  else if (r.plus) { render(); status('Noodlit Plus restored.'); }
  else status('No Noodlit Plus purchase was found for this Apple Account.');
});

// Which part of the panel shows: thank-you, plans, or (on the web) where to get it.
function render() {
  const have = hasPlus();
  haveEl.hidden = !have;
  buyEl.hidden = have || !canSell;
  webEl.hidden = have || canSell;
  if (!have && canSell) showPlans();
}

function open(e) {
  if (!panel.hidden || !SHOW_PLUS) return;
  // Don't stack over another panel or the type box; About hands over by closing itself first.
  if (['choosing', 'typing', 'welcome-open', 'prefs-open', 'notes-open', 'about-open'].some((c) => ui.classList.contains(c))) return;
  const scene = e?.detail?.scene;
  reasonEl.hidden = !scene;
  if (scene) reasonEl.textContent = `${scene} is part of Noodlit Plus.`;
  track(scene ? 'plus/paywall/scene' : 'plus/paywall/about', scene ? `Plus panel: from a Plus scene (${scene})` : 'Plus panel: from About');
  lastFocus = document.activeElement;
  status('');
  panel.hidden = false;
  ui.classList.add('plus-open');
  render();
  panel.querySelector('.about-close').focus({ preventScroll: true });
}

function close() {
  if (panel.hidden) return;
  panel.hidden = true;
  ui.classList.remove('plus-open');
  if (lastFocus && lastFocus !== document.body) lastFocus.focus?.({ preventScroll: true });
}

window.addEventListener('noodlit:open-plus', open);
window.addEventListener('noodlit:plus-changed', () => { if (!panel.hidden) render(); });
document.getElementById('about-plus-btn').addEventListener('click', () => {
  // About closes itself (Escape-style) and the Plus panel takes over.
  document.querySelector('#about .about-close').click();
  open();
});
panel.addEventListener('click', (e) => { if (e.target.closest('[data-close]')) close(); });

// While open, keys belong to the panel, as in About.
window.addEventListener('keydown', (e) => {
  if (panel.hidden) return;
  if (e.key === 'Escape') { e.preventDefault(); close(); }
  else if (e.key === 'Tab') {
    const items = [...panel.querySelectorAll('button:not([disabled]), a[href]')].filter((el) => el.offsetParent !== null);
    const first = items[0], last = items[items.length - 1];
    if (e.shiftKey && document.activeElement === first) { e.preventDefault(); last.focus(); }
    else if (!e.shiftKey && document.activeElement === last) { e.preventDefault(); first.focus(); }
  }
  e.stopImmediatePropagation();
}, true);
