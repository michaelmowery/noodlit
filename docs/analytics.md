# Analytics (GoatCounter)

Noodlit counts anonymous usage with [GoatCounter](https://www.goatcounter.com). The code is in
`www/src/analytics.js`. It sets no cookies, never sends drawings or typed words, sends nothing
offline, skips local and preview copies (it logs to the console there instead), and turns off
when the user switches off **Preferences → Anonymous usage counts**.

## Setup (one time)

1. Go to <https://www.goatcounter.com/signup>.
2. Pick the site code **noodlit**, so the dashboard is at `https://noodlit.goatcounter.com`.
   If that code is taken, pick another and change `GOATCOUNTER_CODE` at the top of
   `www/src/analytics.js` to match.
3. Enter an email and password and finish signing up. The free plan covers non-commercial and
   small sites; GoatCounter asks commercial users to donate or take a paid plan.

Counting starts as soon as the code is live on noodlit.app. To turn analytics off everywhere,
set `GOATCOUNTER_CODE = ''`.

Only `noodlit.app` sends counts. The Capacitor app runs from a different origin, so the `LIVE`
check in `analytics.js` will need to allow it when the store build is set up.

## What is counted

| Event | When |
| --- | --- |
| page view `/` | each launch |
| `launch/installed-app`, `launch/browser` | each launch, by how Noodlit was opened |
| `install` | installed to the home screen (Chrome, Edge, Android; iOS shows up as installed-app launches) |
| `menu/open` | scene menu opened |
| `scene/<id>` | a scene picked from the menu |
| `mode/<fade\|release\|become>` | the family of that scene |
| `plus/<id>` | the picked scene is a Plus scene (all free during the preview) |
| `showme/<id>` | Show me tapped |
| `showme-auto/<id>` | Show me ran on its own on a scene's first open |
| `showme-everything` | Show me everything started (About or welcome note) |
| `showme-everything/first-visit` | the tour that runs on the very first visit |
| `prompt/open`, `prompt/next`, `prompt/previous`, `prompt/close` | the prompt bubble |

Each count also carries what GoatCounter collects for every hit: referrer, screen size, browser
and OS (from the User-Agent), and country or region from the IP (the IP itself isn't stored).

## App store privacy labels (draft)

These apply once the Capacitor build ships with the same analytics. Re-check them if anything
new is sent (for example RevenueCat purchases or a sign-in).

**Apple App Store, App Privacy**

- Data collected: **Yes**.
- *Usage Data → Product Interaction*: used for **Analytics**. Not linked to the user. Not used for tracking.
- *Location → Coarse Location* (country or region derived from IP by GoatCounter): used for
  **Analytics**. Not linked to the user. Not used for tracking.
- Everything else (contact info, identifiers, user content, diagnostics, purchases): **Not collected**.
  Drawings and typed text never leave the device.
- Privacy policy URL: `https://noodlit.app/privacy.html`.
- When RevenueCat is added, add *Purchases → Purchase History* (App Functionality) and
  *Identifiers → User ID / Device ID* as RevenueCat requires.

**Google Play, Data safety**

- Does the app collect or share user data? **Yes, collects**. Shared: **No** (GoatCounter is a
  service provider processing on our behalf, which Play doesn't count as sharing).
- *App activity → App interactions*: collected, for **Analytics**; collection is **optional**
  (users can turn it off in Preferences).
- *Location → Approximate location*: collected, for **Analytics**, optional.
- Data encrypted in transit: **Yes** (HTTPS).
- Users can request deletion: no account and nothing linked to a person, so answer that data
  isn't linked to an identity; the opt-out stops collection.
- Privacy policy URL: `https://noodlit.app/privacy.html`.
