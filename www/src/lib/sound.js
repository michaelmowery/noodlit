// Sound: soft, generated (Web Audio) ambience and action sounds for each scene.
// Nothing is downloaded: every sound is shaped from noise and a few oscillators, so it stays
// tiny, works offline, and has no licensing to worry about.
//
//   sfx.unlock()            call from a user gesture (first tap): browsers, iOS in particular,
//                           only let audio start from one
//   sfx.setEnabled(bool)    the sound toggle; ramps everything in or out
//   sfx.setScene(id)        crossfade to that scene's ambience and drawing texture
//   sfx.stroke(speed)       finger moving at `speed` CSS px/s; sfx.strokeEnd() when it lifts
//   sfx.cue(name, opts)     one-off action sounds, fired by the environments themselves
//   sfx.silently(fn)        run fn without any cues (used for the scene menu previews)
//
// Volumes are kept deliberately low: this is a thinking space, so the sound should sit under
// your thoughts, never compete with them.

const MASTER = 2;

class Sound {
  constructor() {
    this.enabled = true;
    this.ctx = null;
    this.scene = null;
    this.ambient = null;
    this.quiet = 0;
    this.lastCue = new Map();
  }

  // ---------------------------------------------------------------- lifecycle
  unlock() {
    if (!this.enabled) return;
    const AC = window.AudioContext || window.webkitAudioContext;
    if (!AC) return;
    if (!this.ctx) {
      // iOS 17+: mix with other audio and respect the silent switch, like a game's sound effects.
      try { if (navigator.audioSession) navigator.audioSession.type = 'ambient'; } catch { /* older iOS */ }
      try { this.ctx = new AC(); } catch { return; }
      this.build();
    }
    if (this.ctx.state !== 'running') {
      this.ctx.resume?.().catch(() => {});
      // Older iOS also wants a buffer started inside the gesture.
      const s = this.ctx.createBufferSource();
      s.buffer = this.ctx.createBuffer(1, 1, 22050);
      s.connect(this.ctx.destination);
      s.start(0);
    }
    if (this.scene && !this.ambient) this.startScene(this.scene);
  }

  build() {
    const ctx = this.ctx;
    this.master = ctx.createGain();
    this.master.gain.value = 0;
    // A gentle limiter so overlapping cues can never get harsh.
    const comp = ctx.createDynamicsCompressor();
    comp.threshold.value = -18;
    comp.knee.value = 12;
    comp.ratio.value = 4;
    comp.attack.value = 0.01;
    comp.release.value = 0.3;
    this.master.connect(comp).connect(ctx.destination);
    this.master.gain.setTargetAtTime(MASTER, ctx.currentTime, 0.4);

    const sr = ctx.sampleRate, len = Math.floor(sr * 4);
    const white = ctx.createBuffer(1, len, sr), pink = ctx.createBuffer(1, len, sr);
    const brown = ctx.createBuffer(1, len, sr), grit = ctx.createBuffer(1, len, sr);
    const W = white.getChannelData(0), P = pink.getChannelData(0), B = brown.getChannelData(0), G = grit.getChannelData(0);
    let b0 = 0, b1 = 0, b2 = 0, br = 0;
    for (let i = 0; i < len; i++) {
      const w = Math.random() * 2 - 1;
      W[i] = w;
      b0 = 0.99765 * b0 + w * 0.099046; b1 = 0.963 * b1 + w * 0.2965164; b2 = 0.57 * b2 + w * 1.0526913;
      P[i] = (b0 + b1 + b2 + w * 0.1848) * 0.18;
      br = (br + 0.02 * w) / 1.02;
      B[i] = br * 3.5;
      // Sparse crackle: little grains, for sand and snow underfoot (under finger).
      G[i] = Math.random() < 0.012 ? w * (0.4 + Math.random() * 0.6) : w * 0.05;
    }
    this.noise = { white, pink, brown, grit };

    // The drawing texture: one looping noise source shaped per scene, its level follows the finger.
    this.tex = { gain: ctx.createGain(), filter: ctx.createBiquadFilter(), src: null, profile: null };
    this.tex.gain.gain.value = 0;
    this.tex.filter.type = 'bandpass';
    this.tex.filter.connect(this.tex.gain).connect(this.master);
  }

  setEnabled(on) {
    this.enabled = on;
    if (!on) {
      if (!this.ctx) return;
      const t = this.ctx.currentTime;
      this.master.gain.cancelScheduledValues(t);
      this.master.gain.setTargetAtTime(0, t, 0.08);
      clearTimeout(this.suspendTimer);
      // Let the fade finish, then stop the audio engine entirely so it costs no battery.
      this.suspendTimer = setTimeout(() => { if (!this.enabled) { this.stopScene(); this.ctx.suspend?.(); } }, 400);
      return;
    }
    clearTimeout(this.suspendTimer);
    this.unlock();
    if (!this.ctx) return;
    const t = this.ctx.currentTime;
    this.master.gain.cancelScheduledValues(t);
    this.master.gain.setTargetAtTime(MASTER, t, 0.3);
  }

  // Pause everything while the app is in the background.
  setHidden(hidden) {
    if (!this.ctx || !this.enabled) return;
    if (hidden) this.ctx.suspend?.();
    else this.ctx.resume?.().catch(() => {});
  }

  get live() { return !!this.ctx && this.enabled && this.ctx.state === 'running' && !this.quiet; }

  silently(fn) {
    this.quiet++;
    try { return fn(); } finally { this.quiet--; }
  }

  // ---------------------------------------------------------------- scenes
  setScene(id) {
    this.scene = id;
    if (this.ctx && this.enabled) this.startScene(id);
  }

  startScene(id) {
    this.stopScene();
    const def = SCENES[id] || SCENES['shower-door'];
    const ctx = this.ctx, t = ctx.currentTime;
    const bus = ctx.createGain();
    bus.gain.setValueAtTime(0, t);
    bus.gain.linearRampToValueAtTime(1, t + 1.6);
    bus.connect(this.master);
    const amb = { bus, nodes: [], timers: new Set() };
    def.ambient?.(this, amb);
    this.ambient = amb;
    this.setTexture(def.texture);
  }

  stopScene() {
    const amb = this.ambient;
    if (!amb || !this.ctx) return;
    this.ambient = null;
    const t = this.ctx.currentTime;
    for (const id of amb.timers) clearTimeout(id);
    amb.bus.gain.cancelScheduledValues(t);
    amb.bus.gain.setValueAtTime(amb.bus.gain.value, t);
    amb.bus.gain.linearRampToValueAtTime(0, t + 0.8);
    setTimeout(() => {
      for (const n of amb.nodes) { try { n.stop(); } catch { /* already stopped */ } }
      amb.bus.disconnect();
    }, 1000);
  }

  setTexture(p) {
    const { ctx, tex } = this;
    tex.profile = p;
    if (tex.src) { try { tex.src.stop(); } catch { /* fine */ } tex.src = null; }
    if (!p) return;
    tex.src = this.loop(p.noise || 'white', tex.filter);
    tex.filter.frequency.setValueAtTime(p.f, ctx.currentTime);
    tex.filter.Q.setValueAtTime(p.q, ctx.currentTime);
  }

  // ---------------------------------------------------------------- drawing
  stroke(speed) {
    if (!this.live || !this.tex.profile) return;
    const p = this.tex.profile, t = this.ctx.currentTime;
    const amt = Math.min(1, Math.max(0, (speed - 30) / 900));
    // A touch of flutter keeps a long stroke from sounding like a steady hiss.
    const level = p.gain * Math.sqrt(amt) * (p.jitter ? 1 - p.jitter + Math.random() * p.jitter * 2 : 1);
    this.tex.gain.gain.setTargetAtTime(level, t, 0.03);
    this.tex.filter.frequency.setTargetAtTime(p.f * (0.85 + amt * 0.3), t, 0.05);
  }

  strokeEnd() {
    if (!this.ctx) return;
    this.tex.gain.gain.setTargetAtTime(0, this.ctx.currentTime, 0.06);
  }

  // ---------------------------------------------------------------- cues
  cue(name, opts = {}) {
    if (!this.live) return;
    const fn = CUES[name];
    if (!fn) return;
    // Some cues can fire in bursts (drips, ripples); keep them from stacking up.
    const gap = fn.gap || 0;
    const now = this.ctx.currentTime;
    if (gap && now - (this.lastCue.get(name) ?? -1) < gap) return;
    this.lastCue.set(name, now);
    fn(this, opts);
  }

  // ---------------------------------------------------------------- building blocks
  loop(kind, dest, rate = 1) {
    const s = this.ctx.createBufferSource();
    s.buffer = this.noise[kind];
    s.loop = true;
    s.playbackRate.value = rate;
    // Start at a random point so two loops of the same buffer never phase together.
    s.connect(dest);
    s.start(0, Math.random() * 3.5);
    return s;
  }

  filter(type, f, q = 0.7) {
    const n = this.ctx.createBiquadFilter();
    n.type = type; n.frequency.value = f; n.Q.value = q;
    return n;
  }

  gain(v = 1) {
    const g = this.ctx.createGain();
    g.gain.value = v;
    return g;
  }

  // A slow wobble on an AudioParam: base ± depth, period in seconds.
  lfo(param, base, depth, period, nodes) {
    const ctx = this.ctx;
    param.value = base;
    const o = ctx.createOscillator();
    o.frequency.value = 1 / period;
    const d = ctx.createGain();
    d.gain.value = depth;
    o.connect(d).connect(param);
    o.start(ctx.currentTime + Math.random() * period);
    nodes?.push(o);
    return o;
  }

  // Looping noise → filter chain → gain, kept alive as part of an ambience.
  bed(amb, kind, chain, level) {
    const g = this.gain(level);
    let head = g;
    for (let i = chain.length - 1; i >= 0; i--) { chain[i].connect(head); head = chain[i]; }
    g.connect(amb.bus);
    amb.nodes.push(this.loop(kind, head));
    return g;
  }

  // A one-shot noise burst through a filter, with an attack/decay envelope.
  burst({ kind = 'white', type = 'bandpass', f = 1000, f2, q = 1, peak = 0.2, attack = 0.01, dur = 0.3, at = 0, dest }) {
    const ctx = this.ctx, t = ctx.currentTime + at;
    const s = ctx.createBufferSource();
    s.buffer = this.noise[kind];
    const fl = this.filter(type, f, q);
    fl.frequency.setValueAtTime(f, t);
    if (f2) fl.frequency.exponentialRampToValueAtTime(f2, t + dur);
    const g = this.gain(0);
    g.gain.setValueAtTime(0.0001, t);
    g.gain.exponentialRampToValueAtTime(peak, t + attack);
    g.gain.exponentialRampToValueAtTime(0.0001, t + dur);
    s.connect(fl).connect(g).connect(dest || this.master);
    s.start(t, Math.random() * 3);
    s.stop(t + dur + 0.05);
  }

  // A soft sine "plink" or "thud" with a pitch glide.
  tone({ f = 800, f2, type = 'sine', peak = 0.1, attack = 0.005, dur = 0.2, at = 0, dest }) {
    const ctx = this.ctx, t = ctx.currentTime + at;
    const o = ctx.createOscillator();
    o.type = type;
    o.frequency.setValueAtTime(f, t);
    if (f2) o.frequency.exponentialRampToValueAtTime(f2, t + dur);
    const g = this.gain(0);
    g.gain.setValueAtTime(0.0001, t);
    g.gain.exponentialRampToValueAtTime(peak, t + attack);
    g.gain.exponentialRampToValueAtTime(0.0001, t + dur);
    o.connect(g).connect(dest || this.master);
    o.start(t);
    o.stop(t + dur + 0.05);
  }

  // Run fn every so often (randomised) while the ambience is playing.
  every(amb, minS, maxS, fn) {
    const schedule = () => {
      const id = setTimeout(() => {
        amb.timers.delete(id);
        if (this.ambient !== amb) return;
        if (this.live) fn();
        schedule();
      }, (minS + Math.random() * (maxS - minS)) * 1000);
      amb.timers.add(id);
    };
    schedule();
  }
}

// ------------------------------------------------------------------ scenes
// ambient(s, amb): build the scene's background bed into amb.bus.
// texture: how a finger sounds on that surface (noise kind, bandpass f/q, peak level).
const surf = (s, amb, level) => {
  // Distant surf: brown noise, slowly breathing in and out.
  const lp = s.filter('lowpass', 420);
  const g = s.bed(amb, 'brown', [lp], level);
  s.lfo(g.gain, level, level * 0.45, 9, amb.nodes);
  s.lfo(lp.frequency, 420, 160, 9, amb.nodes);
  s.bed(amb, 'pink', [s.filter('highpass', 900), s.filter('lowpass', 3000)], level * 0.12);
};

const SCENES = {
  'shower-door': {
    ambient(s, amb) {
      // A shower running in the next room: soft hiss over a low rush.
      s.bed(amb, 'pink', [s.filter('highpass', 500), s.filter('lowpass', 4500)], 0.05);
      s.bed(amb, 'brown', [s.filter('lowpass', 320)], 0.06);
    },
    texture: { noise: 'white', f: 1600, q: 1.1, gain: 0.112, jitter: 0.25 },
  },
  waves: {
    ambient(s, amb) { surf(s, amb, 0.09); },
    texture: { noise: 'grit', f: 2400, q: 0.7, gain: 0.256, jitter: 0.3 },
  },
  snow: {
    ambient(s, amb) {
      // Wind through the trees: band-passed noise whose pitch and level drift.
      const bp = s.filter('bandpass', 500, 0.9);
      const g = s.bed(amb, 'pink', [bp], 0.07);
      s.lfo(bp.frequency, 520, 260, 13, amb.nodes);
      s.lfo(g.gain, 0.07, 0.035, 7, amb.nodes);
      s.bed(amb, 'brown', [s.filter('lowpass', 200)], 0.03);
    },
    texture: { noise: 'grit', f: 1100, q: 0.8, gain: 0.352, jitter: 0.4 },
  },
  whiteboard: {
    ambient(s, amb) {
      // Quiet room tone, barely there.
      s.bed(amb, 'brown', [s.filter('lowpass', 160)], 0.025);
    },
    texture: { noise: 'white', f: 3000, q: 2.2, gain: 0.096, jitter: 0.15 },
  },
  windshield: {
    ambient(s, amb) {
      // Rain on the roof and glass, the car's low hum, and the odd fat drop landing.
      s.bed(amb, 'white', [s.filter('highpass', 2200), s.filter('lowpass', 8000)], 0.022);
      s.bed(amb, 'pink', [s.filter('bandpass', 1100, 0.6)], 0.03);
      s.bed(amb, 'brown', [s.filter('lowpass', 140)], 0.05);
      s.every(amb, 0.08, 0.5, () => s.burst({ f: 2500 + Math.random() * 3000, q: 2, peak: 0.02 + Math.random() * 0.03, dur: 0.04, dest: amb.bus }));
    },
    texture: { noise: 'white', f: 1900, q: 1.1, gain: 0.112, jitter: 0.25 },
  },
  stream: {
    ambient(s, amb) {
      // A brook: a few narrow bands of noise whose pitches wander, which the ear hears as babble.
      s.bed(amb, 'brown', [s.filter('lowpass', 600)], 0.05);
      for (let i = 0; i < 3; i++) {
        const bp = s.filter('bandpass', 700 + i * 400, 5);
        s.bed(amb, 'pink', [bp], 0.05);
        s.every(amb, 0.12, 0.35, () => bp.frequency.setTargetAtTime(500 + Math.random() * 1500, s.ctx.currentTime, 0.06));
      }
    },
    texture: { noise: 'white', f: 4200, q: 1.4, gain: 0.08, jitter: 0.3 },
  },
  bottle: {
    ambient(s, amb) { surf(s, amb, 0.07); },
    texture: { noise: 'white', f: 4200, q: 1.4, gain: 0.08, jitter: 0.3 },
  },
  lantern: {
    ambient(s, amb) {
      // A still night by the water: a breath of wind and two crickets taking turns.
      s.bed(amb, 'brown', [s.filter('lowpass', 260)], 0.035);
      for (const [f, lo, hi] of [[4300, 0.7, 1.6], [3800, 1.1, 2.4]]) {
        s.every(amb, lo, hi, () => {
          const n = 2 + Math.floor(Math.random() * 3);
          for (let k = 0; k < n; k++) s.tone({ f, peak: 0.012, attack: 0.004, dur: 0.035, at: k * 0.055, dest: amb.bus });
        });
      }
    },
    texture: { noise: 'white', f: 4200, q: 1.4, gain: 0.08, jitter: 0.3 },
  },
};

// ------------------------------------------------------------------ cues
function cue(fn, gap = 0) { fn.gap = gap; return fn; }

const CUES = {
  // Shower door: a drip lets go and runs down the glass.
  drip: cue((s) => s.tone({ f: 1300 + Math.random() * 400, f2: 700, peak: 0.035, dur: 0.09 }), 0.25),

  // Shower door clear: steam billows back over the glass.
  steam: cue((s) => {
    s.burst({ kind: 'pink', f: 500, f2: 2200, q: 0.6, peak: 0.12, attack: 0.5, dur: 1.8 });
  }),

  // Waves: water runs up the sand and drains back.
  wave: cue((s, { rise = 1.4, hold = 0.3, fall = 1.8, big = false }) => {
    const ctx = s.ctx, t = ctx.currentTime;
    const peak = big ? 0.32 : 0.16;
    const src = ctx.createBufferSource();
    src.buffer = s.noise.pink;
    const lp = s.filter('lowpass', 300, 0.5);
    lp.frequency.setValueAtTime(300, t);
    lp.frequency.exponentialRampToValueAtTime(big ? 2600 : 1700, t + rise * 0.8);
    lp.frequency.exponentialRampToValueAtTime(500, t + rise + hold + fall);
    const g = s.gain(0);
    g.gain.setValueAtTime(0.0001, t);
    g.gain.exponentialRampToValueAtTime(peak, t + rise * 0.7);
    g.gain.setTargetAtTime(peak * 0.5, t + rise, 0.4);
    g.gain.exponentialRampToValueAtTime(0.0001, t + rise + hold + fall);
    src.connect(lp).connect(g).connect(s.master);
    src.start(t, Math.random() * 3);
    src.stop(t + rise + hold + fall + 0.1);
    // Foam fizz as it drains.
    s.burst({ f: 5000, q: 0.8, peak: big ? 0.05 : 0.03, attack: 0.3, dur: fall + 0.4, at: rise + hold * 0.5 });
  }, 0.5),

  // Snow clear: a gust of wind carries the squall in.
  squall: cue((s) => {
    s.burst({ kind: 'pink', f: 300, f2: 1400, q: 1.2, peak: 0.4, attack: 0.7, dur: 2.6 });
    s.burst({ kind: 'pink', f: 900, f2: 400, q: 0.8, peak: 0.16, attack: 1.2, dur: 2.4, at: 0.5 });
  }),

  // Whiteboard clear: a felt eraser, one soft swish per pass.
  erase: cue((s, { passes = 3, pass = 0.3, turn = 0.04 }) => {
    for (let i = 0; i < passes; i++) {
      s.burst({ kind: 'pink', f: 1400 + Math.random() * 300, q: 1.2, peak: 0.12, attack: pass * 0.35, dur: pass, at: i * (pass + turn) });
    }
  }),

  // Windshield: the wipers make a pass, up and back down, with a rubbery thunk at each end.
  wipers: cue((s, { up = 0.75, rest = 0.12, down = 0.75 }) => {
    const total = up + rest + down;
    s.burst({ kind: 'pink', f: 900, f2: 1300, q: 1.5, peak: 0.1, attack: up * 0.4, dur: up });
    s.burst({ kind: 'pink', f: 1300, f2: 900, q: 1.5, peak: 0.1, attack: down * 0.4, dur: down, at: up + rest });
    s.tone({ f: 130, f2: 70, peak: 0.08, dur: 0.12, at: up - 0.04 });
    s.tone({ f: 120, f2: 60, peak: 0.1, dur: 0.14, at: total - 0.04 });
    // The motor, a low hum under the sweep.
    s.tone({ type: 'triangle', f: 95, f2: 85, peak: 0.02, attack: 0.08, dur: total });
  }, 0.4),

  // Release: the sheet lifts off with a papery whoosh.
  release: cue((s) => {
    s.burst({ kind: 'white', f: 600, f2: 2600, q: 0.9, peak: 0.07, attack: 0.15, dur: 0.6 });
  }, 0.3),

  // Water: a splash and a bloop. `size` ~0.5 for a tap ripple, ~1.4 for something dropped in.
  splash: cue((s, { size = 1 }) => {
    const k = Math.min(1.5, size);
    s.burst({ kind: 'white', type: 'lowpass', f: 3500, f2: 500, q: 0.5, peak: 0.1 * k, attack: 0.006, dur: 0.25 + 0.3 * k });
    s.tone({ f: 520 - 120 * k, f2: 160, peak: 0.06 * k, dur: 0.12 + 0.05 * k, at: 0.02 });
  }, 0.12),

  // Lantern: the flame catches with a soft whump, then a few crackles.
  ignite: cue((s) => {
    s.burst({ kind: 'pink', type: 'lowpass', f: 300, f2: 1400, q: 0.7, peak: 0.12, attack: 0.08, dur: 0.9 });
    s.tone({ f: 90, f2: 60, peak: 0.06, attack: 0.05, dur: 0.6 });
    for (let i = 0; i < 6; i++) s.burst({ f: 2000 + Math.random() * 3000, q: 3, peak: 0.03, dur: 0.03, at: 0.3 + Math.random() * 1.1 });
  }, 0.3),

  // A fresh sheet or board arrives.
  arrive: cue((s) => s.burst({ kind: 'pink', f: 1800, f2: 900, q: 1, peak: 0.04, attack: 0.08, dur: 0.35 }), 0.5),
};

export const sfx = new Sound();
