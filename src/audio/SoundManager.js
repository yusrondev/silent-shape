/**
 * SoundManager — Web Audio API procedural sounds, no external files needed.
 * All sounds are synthesised in real-time.
 */
export class SoundManager {
  constructor() {
    this._ctx = null;
    this._masterGain = null;
    this._enabled = true;
  }

  _ensure() {
    if (this._ctx) return;
    try {
      this._ctx = new (window.AudioContext || window.webkitAudioContext)();
      this._masterGain = this._ctx.createGain();
      this._masterGain.gain.value = 0.55;
      this._masterGain.connect(this._ctx.destination);
    } catch (e) {
      this._enabled = false;
    }
  }

  /** Resume context after user gesture (required by browsers) */
  resume() {
    this._ensure();
    if (this._ctx && this._ctx.state === 'suspended') {
      this._ctx.resume();
    }
  }

  /**
   * Play a sand footstep — soft, muffled shuffle with grainy hiss.
   * @param {'left'|'right'} foot
   */
  playFootstep(foot = 'left') {
    this._ensure();
    if (!this._enabled || !this._ctx) return;
    const ctx = this._ctx;
    const now = ctx.currentTime;

    const master = ctx.createGain();
    master.gain.setValueAtTime(0.65, now);
    master.connect(this._masterGain);

    // ── Layer 1: Muffled ground thud (sand absorbs impact — very soft) ──────
    const thud = ctx.createOscillator();
    thud.type = 'sine';
    const baseFreq = foot === 'left' ? 68 : 74;
    thud.frequency.setValueAtTime(baseFreq, now);
    thud.frequency.exponentialRampToValueAtTime(22, now + 0.12);
    const thudGain = ctx.createGain();
    thudGain.gain.setValueAtTime(0.45, now);               // soft — sand dampens
    thudGain.gain.exponentialRampToValueAtTime(0.001, now + 0.14);
    thud.connect(thudGain);
    thudGain.connect(master);
    thud.start(now);
    thud.stop(now + 0.15);

    // ── Layer 2: Sandy hiss — the "shhhh" of grains sliding (longest layer) ─
    const hissLen = Math.floor(ctx.sampleRate * 0.20); // 200ms grain slide
    const hissBuf = ctx.createBuffer(1, hissLen, ctx.sampleRate);
    const hissData = hissBuf.getChannelData(0);
    for (let i = 0; i < hissLen; i++) {
      // Slow decay envelope — sand trails off naturally
      const env = Math.pow(1 - i / hissLen, 1.2);
      hissData[i] = (Math.random() * 2 - 1) * env;
    }
    const hiss = ctx.createBufferSource();
    hiss.buffer = hissBuf;

    // Bandpass centred around sand hiss frequency (~700Hz)
    const hissFilter = ctx.createBiquadFilter();
    hissFilter.type = 'bandpass';
    hissFilter.frequency.value = foot === 'left' ? 680 : 740;
    hissFilter.Q.value = 0.9;

    const hissGain = ctx.createGain();
    hissGain.gain.setValueAtTime(1.0, now);
    hissGain.gain.exponentialRampToValueAtTime(0.001, now + 0.20);
    hiss.connect(hissFilter);
    hissFilter.connect(hissGain);
    hissGain.connect(master);
    hiss.start(now);

    // ── Layer 3: Grainy low crunch (compressed sand underfoot) ──────────────
    const crunchLen = Math.floor(ctx.sampleRate * 0.07); // 70ms
    const crunchBuf = ctx.createBuffer(1, crunchLen, ctx.sampleRate);
    const crunchData = crunchBuf.getChannelData(0);
    for (let i = 0; i < crunchLen; i++) {
      const env = Math.pow(1 - i / crunchLen, 3.0); // fast attack, very quick
      crunchData[i] = (Math.random() * 2 - 1) * env;
    }
    const crunch = ctx.createBufferSource();
    crunch.buffer = crunchBuf;

    // Lowpass — only the low grain rumble comes through
    const crunchFilter = ctx.createBiquadFilter();
    crunchFilter.type = 'lowpass';
    crunchFilter.frequency.value = 320;
    crunchFilter.Q.value = 0.5;

    const crunchGain = ctx.createGain();
    crunchGain.gain.setValueAtTime(0.8, now);
    crunchGain.gain.exponentialRampToValueAtTime(0.001, now + 0.07);
    crunch.connect(crunchFilter);
    crunchFilter.connect(crunchGain);
    crunchGain.connect(master);
    crunch.start(now);
  }

  /**
   * Play a futuristic energy weapon sound.
   * @param {'player'|'enemy'} type
   */
  playGunshot(type = 'player') {
    this._ensure();
    if (!this._enabled || !this._ctx) return;
    const ctx = this._ctx;
    const now = ctx.currentTime;

    if (type === 'player') {
      // ════════════════════════════════════════════════════════════════════════
      // PLAYER — Plasma Pulse Pistol  "PEW"
      // Classic sci-fi descending laser sweep + spark + sub-bass thump
      // ════════════════════════════════════════════════════════════════════════
      const master = ctx.createGain();
      master.gain.setValueAtTime(0.9, now);
      master.connect(this._masterGain);

      // 1. Energy spark discharge (very short noise burst at high freq)
      const sparkLen = Math.floor(ctx.sampleRate * 0.012);
      const sparkBuf = ctx.createBuffer(1, sparkLen, ctx.sampleRate);
      const sparkData = sparkBuf.getChannelData(0);
      for (let i = 0; i < sparkLen; i++) {
        sparkData[i] = (Math.random() * 2 - 1) * (1 - i / sparkLen);
      }
      const spark = ctx.createBufferSource();
      spark.buffer = sparkBuf;
      const sparkF = ctx.createBiquadFilter();
      sparkF.type = 'highpass';
      sparkF.frequency.value = 5000;
      const sparkG = ctx.createGain();
      sparkG.gain.setValueAtTime(1.8, now);
      sparkG.gain.exponentialRampToValueAtTime(0.001, now + 0.012);
      spark.connect(sparkF); sparkF.connect(sparkG); sparkG.connect(master);
      spark.start(now);

      // 2. Main "PEW" — descending sine sweep (the signature laser sound)
      const pew = ctx.createOscillator();
      pew.type = 'sine';
      pew.frequency.setValueAtTime(1900, now);
      pew.frequency.exponentialRampToValueAtTime(140, now + 0.18);
      const pewG = ctx.createGain();
      pewG.gain.setValueAtTime(0.9, now);
      pewG.gain.exponentialRampToValueAtTime(0.001, now + 0.18);
      pew.connect(pewG); pewG.connect(master);
      pew.start(now); pew.stop(now + 0.19);

      // 3. FM harmonic layer — sawtooth for electronic "buzz"
      const buzz = ctx.createOscillator();
      buzz.type = 'sawtooth';
      buzz.frequency.setValueAtTime(950, now);
      buzz.frequency.exponentialRampToValueAtTime(70, now + 0.14);
      const buzzF = ctx.createBiquadFilter();
      buzzF.type = 'bandpass';
      buzzF.frequency.value = 800;
      buzzF.Q.value = 2.0;
      const buzzG = ctx.createGain();
      buzzG.gain.setValueAtTime(0.35, now);
      buzzG.gain.exponentialRampToValueAtTime(0.001, now + 0.14);
      buzz.connect(buzzF); buzzF.connect(buzzG); buzzG.connect(master);
      buzz.start(now); buzz.stop(now + 0.15);

      // 4. Sub-bass thump — gives the shot physical weight
      const sub = ctx.createOscillator();
      sub.type = 'sine';
      sub.frequency.setValueAtTime(160, now);
      sub.frequency.exponentialRampToValueAtTime(35, now + 0.08);
      const subG = ctx.createGain();
      subG.gain.setValueAtTime(0.7, now);
      subG.gain.exponentialRampToValueAtTime(0.001, now + 0.10);
      sub.connect(subG); subG.connect(master);
      sub.start(now); sub.stop(now + 0.11);

    } else {
      // ════════════════════════════════════════════════════════════════════════
      // ENEMY — Dark Blaster  "WUUM"
      // Deeper, alien, slightly unstable — feels threatening & different
      // ════════════════════════════════════════════════════════════════════════
      const master = ctx.createGain();
      master.gain.setValueAtTime(0.75, now);
      master.connect(this._masterGain);

      // 1. Main "WUUM" — lower pitch sweep, square wave (harsher tone)
      const wuum = ctx.createOscillator();
      wuum.type = 'square';
      wuum.frequency.setValueAtTime(780, now);
      wuum.frequency.exponentialRampToValueAtTime(80, now + 0.16);
      const wuumF = ctx.createBiquadFilter();
      wuumF.type = 'lowpass';
      wuumF.frequency.setValueAtTime(1200, now);
      wuumF.frequency.exponentialRampToValueAtTime(200, now + 0.16);
      const wuumG = ctx.createGain();
      wuumG.gain.setValueAtTime(0.7, now);
      wuumG.gain.exponentialRampToValueAtTime(0.001, now + 0.17);
      wuum.connect(wuumF); wuumF.connect(wuumG); wuumG.connect(master);
      wuum.start(now); wuum.stop(now + 0.18);

      // 2. Alien pitch wobble — LFO-style modulator for eerie instability
      const mod = ctx.createOscillator();
      mod.type = 'sine';
      mod.frequency.value = 18; // wobble rate
      const modDepth = ctx.createGain();
      modDepth.gain.value = 120; // wobble depth in Hz
      mod.connect(modDepth); modDepth.connect(wuum.frequency);
      mod.start(now); mod.stop(now + 0.18);

      // 3. Energy crackle noise — compressed and lowpassed
      const crackLen = Math.floor(ctx.sampleRate * 0.10);
      const crackBuf = ctx.createBuffer(1, crackLen, ctx.sampleRate);
      const crackData = crackBuf.getChannelData(0);
      for (let i = 0; i < crackLen; i++) {
        crackData[i] = (Math.random() * 2 - 1) * Math.pow(1 - i / crackLen, 1.8);
      }
      const crack = ctx.createBufferSource();
      crack.buffer = crackBuf;
      const crackF = ctx.createBiquadFilter();
      crackF.type = 'bandpass';
      crackF.frequency.value = 1400;
      crackF.Q.value = 1.5;
      const crackG = ctx.createGain();
      crackG.gain.setValueAtTime(0.6, now);
      crackG.gain.exponentialRampToValueAtTime(0.001, now + 0.10);
      crack.connect(crackF); crackF.connect(crackG); crackG.connect(master);
      crack.start(now);

      // 4. Sub impact
      const sub = ctx.createOscillator();
      sub.type = 'sine';
      sub.frequency.setValueAtTime(120, now);
      sub.frequency.exponentialRampToValueAtTime(28, now + 0.12);
      const subG = ctx.createGain();
      subG.gain.setValueAtTime(0.55, now);
      subG.gain.exponentialRampToValueAtTime(0.001, now + 0.13);
      sub.connect(subG); subG.connect(master);
      sub.start(now); sub.stop(now + 0.14);
    }
  }


  /** Pickup sound (healing or energy orb) */
  playPickup(type = 'heal') {
    this._ensure();
    if (!this._enabled || !this._ctx) return;
    const ctx = this._ctx;
    const now = ctx.currentTime;

    const freqs = type === 'heal'
      ? [440, 550, 660]   // major chord — positive
      : [330, 440, 550];  // energy — bright

    freqs.forEach((f, i) => {
      const osc  = ctx.createOscillator();
      const gain = ctx.createGain();
      osc.type = 'sine';
      osc.frequency.value = f;
      gain.gain.setValueAtTime(0.3, now + i * 0.06);
      gain.gain.exponentialRampToValueAtTime(0.001, now + i * 0.06 + 0.25);
      osc.connect(gain);
      gain.connect(this._masterGain);
      osc.start(now + i * 0.06);
      osc.stop(now + i * 0.06 + 0.26);
    });
  }

  /**
   * Start or stop the flight thruster sound loop.
   * @param {boolean} active
   */
  setThrusterActive(active) {
    this._ensure();
    if (!this._enabled || !this._ctx) return;

    if (active) {
      if (this._thrusterOsc) return; // Already running
      const ctx = this._ctx;
      const now = ctx.currentTime;

      this._thrusterGain = ctx.createGain();
      this._thrusterGain.gain.setValueAtTime(0, now);
      this._thrusterGain.gain.linearRampToValueAtTime(0.85, now + 0.15);
      this._thrusterGain.connect(this._masterGain);

      // Deep rumble oscillator
      this._thrusterOsc = ctx.createOscillator();
      this._thrusterOsc.type = 'sawtooth';
      this._thrusterOsc.frequency.value = 85;

      // Bandpass filter — wind hiss / jet intake feel
      this._thrusterFilter = ctx.createBiquadFilter();
      this._thrusterFilter.type = 'bandpass';
      this._thrusterFilter.frequency.value = 550;
      this._thrusterFilter.Q.value = 1.0;

      // White noise loop for hiss texture
      const bufLen = ctx.sampleRate * 2;
      const buf    = ctx.createBuffer(1, bufLen, ctx.sampleRate);
      const data   = buf.getChannelData(0);
      for (let i = 0; i < bufLen; i++) {
        data[i] = Math.random() * 2 - 1;
      }
      this._thrusterNoise = ctx.createBufferSource();
      this._thrusterNoise.buffer = buf;
      this._thrusterNoise.loop = true;

      this._thrusterOsc.connect(this._thrusterFilter);
      this._thrusterNoise.connect(this._thrusterFilter);
      this._thrusterFilter.connect(this._thrusterGain);

      this._thrusterOsc.start(now);
      this._thrusterNoise.start(now);

    } else {
      if (!this._thrusterOsc) return;
      const ctx = this._ctx;
      const now = ctx.currentTime;

      const gain   = this._thrusterGain;
      const osc    = this._thrusterOsc;
      const noise  = this._thrusterNoise;
      const filter = this._thrusterFilter;

      // Clear references immediately so next activate works
      this._thrusterGain   = null;
      this._thrusterOsc    = null;
      this._thrusterNoise  = null;
      this._thrusterFilter = null;

      if (gain) {
        // Smooth exponential spin-down over 1.2s — engine dying naturally
        gain.gain.setValueAtTime(gain.gain.value, now);
        gain.gain.exponentialRampToValueAtTime(0.001, now + 1.2);
      }
      if (filter) {
        // Sweep filter down as engine dies — reinforces spin-down feel
        filter.frequency.setValueAtTime(filter.frequency.value, now);
        filter.frequency.exponentialRampToValueAtTime(60, now + 1.1);
      }

      // Stop nodes after fade completes
      setTimeout(() => {
        try {
          if (osc)   osc.stop();
          if (noise) noise.stop();
        } catch (e) {}
      }, 1350);
    }
  }
}

export const soundManager = new SoundManager();
