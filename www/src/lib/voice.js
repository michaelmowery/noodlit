// Voice: speak and your words are written onto the surface.
//
// Two engines behind one small interface:
// - In the store app, Apple's own speech recognition through the Capgo speech plugin
//   (@capgo/capacitor-speech-recognition, added by `npx cap sync ios`), called straight through
//   Capacitor's native bridge because the web code has no bundler for the plugin's JS wrapper.
//   It runs on the device when the language allows it, so no audio leaves the iPhone or iPad.
// - On the website, the browser's Web Speech API (Chrome, Edge and Safari have it; Firefox
//   doesn't, so the mic button stays hidden there).
//
// createListener({ onText, onRestart, onEnd }) returns { start(), stop() }.
//   onText(text)   everything heard in the current session so far (it gets revised as you speak)
//   onRestart()    the recogniser started a fresh session (sessions end on long pauses or after
//                  about a minute), so the next onText starts from nothing again
//   onEnd(reason)  listening stopped for good: 'stopped' (you), 'denied', 'unavailable', 'error'
// start() resolves once listening has begun, or rejects with an Error whose .reason is one of
// the onEnd reasons.

const cap = window.Capacitor;
const NATIVE = !!cap?.isNativePlatform?.();
const PLUGIN = 'SpeechRecognition';
const hasPlugin = () => !!(cap?.nativePromise && (cap.PluginHeaders || []).some((h) => h.name === PLUGIN));
const WebSpeech = window.SpeechRecognition || window.webkitSpeechRecognition;

// The app never falls back to Web Speech: inside the app's web view it isn't reliable.
export const voiceSupported = NATIVE ? hasPlugin() : !!WebSpeech;

const fail = (reason) => Object.assign(new Error(reason), { reason });
const lang = () => navigator.language || 'en-US';

// A recogniser that keeps ending straight away (no network, mic busy) would restart forever.
function restartGuard() {
  let times = [];
  return () => {
    const now = Date.now();
    times = times.filter((t) => now - t < 10000);
    times.push(now);
    return times.length <= 6;
  };
}

export function createListener(handlers) {
  return NATIVE ? nativeListener(handlers) : webListener(handlers);
}

// ------------------------------------------------------------------ store app (iOS)
function nativeListener({ onText, onRestart, onEnd }) {
  const call = (method, options = {}) => cap.nativePromise(PLUGIN, method, options);
  let want = false;
  let hooked = false;
  let onDevice = false;
  let canRestart = restartGuard();

  const begin = () => call('start', {
    language: lang(),
    partialResults: true,
    addPunctuation: true,
    maxResults: 1,
    // On the device when this language supports it; otherwise Apple's speech service.
    useOnDeviceRecognition: onDevice,
    preferLegacyRecognizer: true,
  });

  function hook() {
    if (hooked) return;
    hooked = true;
    cap.nativeCallback(PLUGIN, 'addListener', { eventName: 'partialResults' }, (ev) => {
      if (!want || !ev) return;
      const text = ev.accumulatedText ?? ev.matches?.[0];
      if (typeof text === 'string') onText(text);
    });
    cap.nativeCallback(PLUGIN, 'addListener', { eventName: 'listeningState' }, (ev) => {
      if ((ev?.status || ev?.state) !== 'stopped' || !want) return;
      // A session ended by itself (a long pause, or Apple's time limit): keep listening.
      if (!canRestart()) { want = false; onEnd('error'); return; }
      onRestart();
      setTimeout(() => { if (want) begin().catch(() => { want = false; onEnd('error'); }); }, 120);
    });
  }

  return {
    async start() {
      want = true;
      canRestart = restartGuard();
      let p = await call('checkPermissions').catch(() => ({}));
      if (p.speechRecognition !== 'granted') p = await call('requestPermissions').catch(() => ({}));
      if (p.speechRecognition !== 'granted') { want = false; throw fail('denied'); }
      const ok = await call('available', { language: lang() }).catch(() => ({}));
      if (!ok.available) { want = false; throw fail('unavailable'); }
      onDevice = !!(await call('isOnDeviceRecognitionAvailable', { language: lang(), preferLegacyRecognizer: true }).catch(() => ({}))).available;
      hook();
      try { await begin(); } catch (e) {
        want = false;
        throw fail(/microphone/i.test(String(e?.message)) ? 'denied' : 'error');
      }
    },
    stop() {
      if (!want) return;
      want = false;
      call('stop').catch(() => {});
      onEnd('stopped');
    },
  };
}

// ------------------------------------------------------------------ website (Web Speech)
function webListener({ onText, onRestart, onEnd }) {
  let rec = null;
  let want = false;
  let canRestart = restartGuard();
  let started = null; // { resolve, reject } until the first onstart

  function make() {
    const r = new WebSpeech();
    r.lang = lang();
    r.continuous = true;
    r.interimResults = true;
    r.maxAlternatives = 1;
    r.onstart = () => { started?.resolve(); started = null; };
    r.onresult = (e) => {
      if (!want) return;
      const parts = [];
      for (let i = 0; i < e.results.length; i++) parts.push(e.results[i][0].transcript.trim());
      onText(parts.filter(Boolean).join(' '));
    };
    r.onerror = (e) => {
      if (e.error === 'no-speech' || e.error === 'aborted') return; // onend restarts
      const reason = e.error === 'not-allowed' || e.error === 'service-not-allowed' ? 'denied'
        : e.error === 'language-not-supported' ? 'unavailable' : 'error';
      if (e.error === 'network' && want) return; // a blip: onend tries again, the guard gives up
      const was = want;
      want = false;
      if (started) { started.reject(fail(reason)); started = null; } else if (was) onEnd(reason);
    };
    r.onend = () => {
      if (!want) return;
      if (!canRestart()) {
        want = false;
        if (started) { started.reject(fail('error')); started = null; } else onEnd('error');
        return;
      }
      onRestart();
      try { r.start(); } catch { /* already starting */ }
    };
    return r;
  }

  return {
    start() {
      want = true;
      canRestart = restartGuard();
      rec ||= make();
      return new Promise((resolve, reject) => {
        started = { resolve, reject };
        try { rec.start(); } catch { /* already running */ resolve(); started = null; }
      });
    },
    stop() {
      if (!want) return;
      want = false;
      try { rec?.stop(); } catch { /* not running */ }
      onEnd('stopped');
    },
  };
}
