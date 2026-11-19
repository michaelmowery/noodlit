// Noodlit Plus purchases: who has Plus, and how to buy or restore it.
//
// In the store app, Apple runs the checkout and RevenueCat (revenuecat.com) keeps track of
// who owns what. The app talks to RevenueCat's Capacitor plugin (@revenuecat/purchases-capacitor,
// added by `npx cap sync ios`) straight through Capacitor's native bridge, because the web code
// has no bundler to import the plugin's JS wrapper.
//
// On the website there is nothing to buy yet (web Plus waits for sign-in), so the web never
// has Plus and the paywall points people to the app instead.
//
// What is set up in RevenueCat and App Store Connect (see the PR for the steps):
//   entitlement  plus
//   offering     default (the "current" one), packages Monthly, Annual and Lifetime
//   products     noodlit_plus_monthly, noodlit_plus_yearly (auto-renewing, one group),
//                noodlit_plus_lifetime (non-consumable)
//
// The last answer is kept on the device, so Plus stays unlocked offline and there's no
// flash of locked scenes while the app starts. RevenueCat keeps its own cache as well.

import { NATIVE, PLATFORM } from './analytics.js';

// RevenueCat → Project settings → API keys → the App Store app's public key (starts appl_).
// It's a public key, safe in the app. While it's empty the app can't sell Plus, so nothing
// locks in the app (see LOCKED below).
export const RC_API_KEY_IOS = '';

export const ENTITLEMENT = 'plus';

// Apple's standard licence (EULA) for auto-renewing subscriptions, and our privacy policy.
// Apple wants both on the paywall and in the App Store description.
export const TERMS_URL = 'https://www.apple.com/legal/internet-services/itunes/dev/stdeula/';
export const PRIVACY_URL = 'https://noodlit.app/privacy.html';
// The app's App Store page. Fill in once the listing is live (App Store Connect → App
// Information → Apple ID gives the number). While empty the web paywall just names the app.
export const APP_STORE_URL = '';

const cap = window.Capacitor;
const hasNativePlugin = () =>
  !!(cap?.nativePromise && (cap.PluginHeaders || []).some((h) => h.name === 'Purchases'));

// Can this copy of Noodlit sell Plus? Only the iOS app, with the plugin built in and a key set.
export const canSell = NATIVE && PLATFORM === 'ios' && !!RC_API_KEY_IOS && hasNativePlugin();

// Are Plus scenes and features locked for people without Plus? On the web, always. In the app,
// only once it can actually sell Plus, so a build without the key never strands anyone.
export const LOCKED = NATIVE ? canSell : true;

const KEY = 'noodlit.plus';
let active = (() => {
  if (!canSell) return false;
  try { return JSON.parse(localStorage.getItem(KEY)) === true; } catch { return false; }
})();

export const hasPlus = () => active;

function setActive(on) {
  on = !!on;
  if (on === active) return;
  active = on;
  try { localStorage.setItem(KEY, JSON.stringify(on)); } catch { /* storage blocked */ }
  window.dispatchEvent(new CustomEvent('noodlit:plus-changed', { detail: { active: on } }));
}

const fromInfo = (info) => !!info?.entitlements?.active?.[ENTITLEMENT];
const call = (method, options = {}) => cap.nativePromise('Purchases', method, options);

// Set RevenueCat up once and learn whether this person has Plus. Safe to call any number of
// times; a failure (offline on first launch, say) is retried on the next call.
let ready = null;
export function startPurchases() {
  if (!canSell) return Promise.resolve(false);
  if (!ready) {
    ready = (async () => {
      await call('configure', { apiKey: RC_API_KEY_IOS });
      // Renewals, refunds, a purchase finished on another device: RevenueCat tells us here.
      cap.nativeCallback('Purchases', 'addCustomerInfoUpdateListener', {}, (info, err) => {
        if (!err && info) setActive(fromInfo(info));
      });
      const { customerInfo } = await call('getCustomerInfo');
      setActive(fromInfo(customerInfo));
      return true;
    })().catch((e) => {
      console.warn('[plus] RevenueCat setup failed', e);
      ready = null;
      return false;
    });
  }
  return ready;
}

// The three ways to buy, with the App Store's own prices in the person's currency.
// Resolves to [{ id: 'monthly'|'yearly'|'lifetime', price, pkg }], in that order, or [] if
// the App Store can't be reached.
const PLAN_OF = { MONTHLY: 'monthly', ANNUAL: 'yearly', LIFETIME: 'lifetime' };
export async function getPlans() {
  if (!(await startPurchases())) return [];
  try {
    const offerings = await call('getOfferings');
    const pkgs = offerings?.current?.availablePackages || [];
    const plans = [];
    for (const id of ['monthly', 'yearly', 'lifetime']) {
      const pkg = pkgs.find((p) => PLAN_OF[p.packageType] === id);
      if (pkg) plans.push({ id, price: pkg.product?.priceString || '', pkg });
    }
    return plans;
  } catch (e) {
    console.warn('[plus] offerings failed', e);
    return [];
  }
}

// Buy a plan. Resolves to 'done', 'cancelled', 'pending' (Ask to Buy, waiting on a parent)
// or 'failed' (with the App Store's message in `message`).
export async function buy(plan) {
  try {
    const { customerInfo } = await call('purchasePackage', { aPackage: plan.pkg });
    setActive(fromInfo(customerInfo));
    return { result: fromInfo(customerInfo) ? 'done' : 'failed' };
  } catch (e) {
    const code = String(e?.code ?? '');
    if (code === '1' || e?.userCancelled || e?.data?.userCancelled) return { result: 'cancelled' };
    if (code === '20') return { result: 'pending' };
    return { result: 'failed', message: e?.message || '' };
  }
}

// Restore Purchases (Apple requires the button). Resolves to true if Plus came back.
export async function restore() {
  if (!(await startPurchases())) return { ok: false, message: "Couldn't reach the App Store." };
  try {
    const { customerInfo } = await call('restorePurchases');
    setActive(fromInfo(customerInfo));
    return { ok: true, plus: fromInfo(customerInfo) };
  } catch (e) {
    return { ok: false, message: e?.message || "Couldn't reach the App Store." };
  }
}
