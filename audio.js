/* Synthesized locally: no audio downloads or third-party samples. */
(() => {
  'use strict';
  const MUSIC = {
    explore: { bpm: 78, melody: [72, 0, 76, 0, 79, 0, 76, 0, 74, 0, 72, 0, 67, 0, 71, 0], roots: [48, 45, 53, 50], thirds: [4, 3, 4, 3], lead: 'sine' },
    combat: { bpm: 104, melody: [69, 72, 76, 72, 79, 76, 72, 67, 69, 72, 76, 81, 79, 76, 72, 71], roots: [45, 41, 48, 43], thirds: [3, 4, 4, 4], lead: 'triangle' },
    boss: { bpm: 122, melody: [71, 74, 77, 74, 83, 77, 74, 71, 72, 76, 79, 76, 84, 79, 76, 74], roots: [47, 43, 48, 42], thirds: [3, 4, 4, 3], lead: 'triangle' },
    evac: { bpm: 112, melody: [67, 0, 74, 71, 0, 74, 76, 0, 69, 0, 76, 72, 0, 79, 76, 74], roots: [43, 45, 48, 47], thirds: [4, 3, 4, 3], lead: 'sine' }
  };
  const ENVIRONMENT_MUSIC = {
    'voyage-cosmos': { shift: 7, offset: 0, lead: 'sine', bassEvery: 2 },
    'voyage-forge': { shift: -5, offset: 4, lead: 'triangle', bassEvery: 2 },
    'voyage-tide': { shift: 2, offset: 8, lead: 'sine', bassEvery: 4 },
    salvage: { shift: -2, offset: 2, lead: 'sine', bassEvery: 4 }
  };
  class FrontierAudio {
    constructor() {
      this.enabled = true; this.context = null; this.voices = 0; this.lastPlayed = Object.create(null);
      this.musicEnabled = true; this.musicScene = 'silent'; this.musicMap = ''; this.musicTimer = null; this.musicVoices = new Set(); this.unlocked = false;
    }

    setEnabled(enabled) {
      this.enabled = !!enabled;
      if (this.master) this.master.gain.setTargetAtTime(this.enabled ? .55 : 0, this.context.currentTime, .025);
      this._syncMusic();
    }

    setMusicEnabled(enabled) { this.musicEnabled = !!enabled; this._syncMusic(); }

    setScene(scene, mapId = '') {
      scene = MUSIC[scene] ? scene : 'silent';
      if (scene !== this.musicScene || mapId !== this.musicMap) { this._stopMusic(); this.musicScene = scene; this.musicMap = mapId; }
      this._syncMusic();
    }

    _syncMusic() {
      if (!this.unlocked || !this.musicGain || !this.enabled || !this.musicEnabled || !MUSIC[this.musicScene] || this.context.state !== 'running' || window.document?.hidden) {
        if (this.musicTimer !== null || this.musicVoices.size) this._stopMusic();
        return;
      }
      if (this.musicTimer !== null) return;
      const at = this.context.currentTime;
      this.musicGain.gain.cancelScheduledValues(at); this.musicGain.gain.setTargetAtTime(1, at, .12);
      this.musicStep = 0; this.musicNext = at + .03; this._scheduleMusic();
    }

    _stopMusic() {
      if (this.musicTimer !== null) { window.clearTimeout(this.musicTimer); this.musicTimer = null; }
      if (!this.musicGain) return;
      const at = this.context.currentTime;
      this.musicGain.gain.cancelScheduledValues(at); this.musicGain.gain.setTargetAtTime(0, at, .025);
      for (const voice of this.musicVoices) if (!voice.musicStopped) { voice.musicStopped = true; voice.stop(at + .06); }
    }

    _scheduleMusic() {
      if (!this.enabled || !this.musicEnabled || this.context.state !== 'running' || window.document?.hidden || !MUSIC[this.musicScene]) { this._stopMusic(); return; }
      const now = this.context.currentTime, score = MUSIC[this.musicScene], interval = 30 / score.bpm;
      if (this.musicNext < now - .15) { this.musicNext = now + .02; this.musicStep = 0; }
      for (let count = 0; this.musicNext < now + .12 && count < 4; count++) {
        this._musicBeat(score, this.musicStep++, this.musicNext); this.musicNext += interval;
      }
      this.musicTimer = window.setTimeout(() => { this.musicTimer = null; this._scheduleMusic(); }, 60);
    }

    _musicBeat(score, step, at) {
      const environment = ENVIRONMENT_MUSIC[this.musicMap], shift = environment?.shift ?? ({ foundry: -2, frost: 5, storm: 2, ruins: 7, voyage: 7 }[this.musicMap] || 0);
      const bar = Math.floor(step / 8) % score.roots.length, root = score.roots[bar] + shift, lead = score.melody[(step + (environment?.offset || 0)) % score.melody.length], interval = 30 / score.bpm;
      if (step % 8 === 0) for (const offset of [0, score.thirds[bar], 7]) this._musicNote(root + 12 + offset, at, interval * 5.5, .021, 'sine');
      if (step % (this.musicScene === 'explore' ? 4 : this.musicScene === 'boss' || this.musicScene === 'evac' ? 2 : environment?.bassEvery || 2) === 0) this._musicNote(root, at, interval * 1.4, .06, 'triangle');
      if (lead) this._musicNote(lead + shift, at, interval * .72, this.musicScene === 'explore' ? .035 : .045, environment?.lead || score.lead);
      if (this.musicScene !== 'explore' && step % 2 === 0) this._musicNote(35, at, .10, .045, 'sine', 23);
      if (this.musicScene === 'boss' && step % 4 === 2) this._musicNote(86, at, .055, .018, 'triangle', 62);
    }

    _musicNote(midi, at, duration, volume, shape, endMidi = midi) {
      if (this.musicVoices.size >= 12 || this.voices >= 48) return;
      const ctx = this.context, oscillator = ctx.createOscillator(), gain = ctx.createGain(), frequency = pitch => 440 * 2 ** ((pitch - 69) / 12);
      oscillator.type = shape; oscillator.frequency.setValueAtTime(frequency(midi), at);
      oscillator.frequency.exponentialRampToValueAtTime(frequency(endMidi), at + duration);
      gain.gain.setValueAtTime(.001, at); gain.gain.exponentialRampToValueAtTime(volume, at + .015);
      gain.gain.exponentialRampToValueAtTime(.001, at + duration);
      oscillator.connect(gain); gain.connect(this.musicGain); oscillator.start(at); oscillator.stop(at + duration + .02);
      this.musicVoices.add(oscillator); this.voices++;
      oscillator.onended = () => {
        if (!this.musicVoices.delete(oscillator)) return;
        oscillator.disconnect(); gain.disconnect(); this.voices--;
      };
    }

    init() {
      if (this.context) return;
      const Context = window.AudioContext || window.webkitAudioContext;
      if (!Context) return;
      this.context = new Context();
      this.master = this.context.createGain(); this.master.gain.value = .55;
      this.musicGain = this.context.createGain(); this.musicGain.gain.value = 0; this.musicGain.connect(this.master);
      const compressor = this.context.createDynamicsCompressor();
      compressor.threshold.value = -16; compressor.ratio.value = 5;
      this.master.connect(compressor); compressor.connect(this.context.destination);
      this.noise = this.context.createBuffer(1, this.context.sampleRate, this.context.sampleRate);
      const data = this.noise.getChannelData(0);
      for (let i = 0; i < data.length; i++) data[i] = Math.random() * 2 - 1;
      this.context.addEventListener?.('statechange', () => this._syncMusic());
      window.document?.addEventListener('visibilitychange', () => this._syncMusic());
    }

    note(from, to, duration, volume, shape = 'sine', delay = 0) {
      if (this.voices >= 48) return;
      const ctx = this.context, at = ctx.currentTime + delay;
      const oscillator = ctx.createOscillator(), gain = ctx.createGain();
      oscillator.type = shape;
      oscillator.frequency.setValueAtTime(from, at);
      oscillator.frequency.exponentialRampToValueAtTime(Math.max(1, to), at + duration);
      gain.gain.setValueAtTime(.001, at);
      gain.gain.exponentialRampToValueAtTime(volume, at + .004);
      gain.gain.exponentialRampToValueAtTime(.001, at + duration);
      oscillator.connect(gain); gain.connect(this.master);
      oscillator.start(at); oscillator.stop(at + duration + .01);
      this.voices++;
      oscillator.onended = () => { oscillator.disconnect(); gain.disconnect(); this.voices--; };
    }

    noiseBurst(frequency, duration, volume, highpass = false) {
      if (this.voices >= 48) return;
      const ctx = this.context, at = ctx.currentTime;
      const source = ctx.createBufferSource(), filter = ctx.createBiquadFilter(), gain = ctx.createGain();
      source.buffer = this.noise;
      filter.type = highpass ? 'highpass' : 'lowpass'; filter.frequency.value = frequency;
      gain.gain.setValueAtTime(volume, at); gain.gain.exponentialRampToValueAtTime(.001, at + duration);
      source.connect(filter); filter.connect(gain); gain.connect(this.master);
      source.start(at, Math.random() * .5); source.stop(at + duration);
      this.voices++;
      source.onended = () => { source.disconnect(); filter.disconnect(); gain.disconnect(); this.voices--; };
    }

    play(kind, weapon = 0) {
      if (!this.enabled) return;
      if ((kind === 'secret-trigger' || kind === 'secret-discovered') && this.context?.state !== 'running') return;
      try {
        this.init(); if (!this.context) return;
        this.unlocked = true;
        if (this.context.state === 'suspended') this.context.resume()?.then(() => this._syncMusic()).catch(() => {});
        this._syncMusic();
        const spacing = kind.startsWith('salvage-') ? kind === 'salvage-alert' ? .65 : .3 : kind.startsWith('field-') ? kind === 'field-burst' ? .08 : .18 : kind === 'cover-break' ? .1 : kind === 'shield-block' ? .075 : kind === 'shield-open' || kind === 'breacher-crash' ? .2 : kind.startsWith('voyage-') ? kind === 'voyage-device' ? .12 : .4 : kind === 'awakening-acquired' || kind.startsWith('campaign-') || kind === 'nexus-shield-break' ? .8 : kind.startsWith('cargo-') ? .3 : kind === 'star-pin' ? .1 : kind.startsWith('starline-') ? .15 : kind === 'awakening-trigger' ? .12 : kind === 'anchor-break' ? .18 : kind === 'evolution-trigger' ? .12 : kind === 'tactic-trigger' || kind === 'rift-node' ? .18 : kind === 'secret-trigger' ? .12 : kind === 'secret-discovered' ? .8 : kind === 'relic-trigger' ? .18 : kind === 'phase-mark' ? .075 : kind === 'phase-capture' ? .055 : kind === 'phase-burst' || kind === 'grenade-burst' ? .065 : kind === 'hazard-burst' ? .08 : kind === 'sector-warning' ? .7 : kind === 'boss-attack' ? .45 : kind === 'combo' ? .1 : 0;
        if (spacing && this.context.currentTime - (this.lastPlayed[kind] ?? -Infinity) < spacing) return;
        this.lastPlayed[kind] = this.context.currentTime;
        switch (kind) {
          case 'salvage-start': this.note(196, 392, .28, .03, 'sine'); this.note(587, 784, .16, .02, 'sine', .11); break;
          case 'salvage-source-start': this.note(130, 195, .22, .035, 'triangle'); this.note(390, 260, .16, .025, 'sine', .09); break;
          case 'salvage-source-open': this.noiseBurst(weapon === 'drone' ? 2600 : 1300, .1, .045); this.note(weapon === 'drone' ? 620 : 260, 130, .15, .03, 'triangle'); break;
          case 'salvage-vault-unlock': this.note(523, 784, .09, .025, 'sine'); this.note(1046, 1046, .17, .022, 'sine', .06); break;
          case 'salvage-collected': [392, 587, 784].forEach((f, i) => this.note(f, f, .20, .028, 'sine', i * .05)); break;
          case 'salvage-alert': {
            const level = Math.max(2, Math.min(4, Number(weapon) || 2)), frequency = 330 + (level - 2) * 110;
            for (let i = 0; i < level - 1; i++) this.note(frequency, frequency * .75, .09, .035, 'triangle', i * .13);
            break;
          }
          case 'salvage-call': this.note(740, 740, .075, .025, 'sine'); this.note(494, 740, .16, .03, 'triangle', .16); break;
          case 'salvage-arrive': [494, 740, 988].forEach((f, i) => this.note(f, f, .24, .03, 'sine', i * .10)); break;
          case 'salvage-complete': [392, 523, 784, 1046].forEach((f, i) => this.note(f, f, .35, .035, 'sine', i * .11)); break;
          case 'salvage-withdraw': this.note(392, 392, .2, .025, 'sine'); this.note(294, 294, .25, .02, 'sine', .11); break;
          case 'salvage-failed': this.note(196, 98, .3, .035, 'triangle'); this.note(147, 73.5, .25, .022, 'sine', .1); break;
          case 'field-arm': {
            const friendly = String(weapon).includes('friendly'), mine = String(weapon).includes('mine');
            this.note(friendly ? 660 : mine ? 330 : 260, friendly ? 880 : 440, .10, .035, friendly ? 'sine' : 'triangle');
            this.note(friendly ? 990 : 550, friendly ? 1320 : 470, .065, .025, 'sine', .085); break;
          }
          case 'field-burst':
            this.note(125, 35, .24, .12, 'triangle'); this.noiseBurst(1000, .16, .09);
            if (String(weapon).includes('friendly')) this.note(880, 660, .17, .025, 'sine', .035); break;
          case 'field-capture': [440, 660, 990].forEach((f, i) => this.note(f, f, .18, .028, 'sine', i * .045)); break;
          case 'cover-break': this.noiseBurst(1700, .12, .085); this.note(150, 43, .18, .065, 'triangle'); break;
          case 'shield-block': this.note(1250, 750, .045, .025, 'triangle'); this.note(1950, 1100, .055, .015, 'sine'); break;
          case 'shield-open': this.note(980, 310, .11, .035, 'triangle'); this.note(660, 990, .18, .03, 'sine', .04); break;
          case 'breacher-crash': this.noiseBurst(950, .13, .075); this.note(95, 32, .21, .075, 'triangle'); this.note(480, 380, .09, .015, 'sine', .045); break;
          case 'shot':
            if (weapon === 0) { this.noiseBurst(1900, .065, .14); this.note(165, 48, .11, .14, 'triangle'); }
            else if (weapon === 1) { this.noiseBurst(1300, .20, .26); this.note(105, 28, .24, .23, 'triangle'); }
            else if (weapon === 3) { this.note(135, 43, .23, .19, 'triangle'); this.noiseBurst(720, .11, .16); this.note(330, 110, .13, .06); }
            else if (weapon === 4) { this.noiseBurst(3900, .13, .07, true); this.note(1350, 480, .2, .08, 'triangle'); this.note(730, 350, .18, .04, 'sine', .03); }
            else if (weapon === 5) { this.noiseBurst(4200, .035, .065, true); this.note(760, 300, .115, .065, 'triangle'); this.note(1520, 760, .085, .025, 'sine', .02); }
            else { this.noiseBurst(3600, .06, .11, true); this.note(940, 125, .24, .11, 'sawtooth'); this.note(100, 28, .20, .16); }
            break;
          case 'grenade-burst': this.note(105, 27, .38, .24, 'triangle'); this.noiseBurst(950, .28, .2); this.note(260, 58, .23, .06, 'sawtooth'); break;
          case 'voyage-room': this.note(220, 440, .3, .035, 'triangle'); this.note(660, 880, .22, .025, 'sine', .12); break;
          case 'voyage-objective': this.note(880, 1320, .15, .025, 'sine'); break;
          case 'voyage-rest': case 'voyage-room-complete': [330, 495, 660].forEach((f, i) => this.note(f, f, .32, .03, 'sine', i * .09)); break;
          case 'voyage-complete': [330, 440, 660, 880, 1320].forEach((f, i) => this.note(f, f, .5, .04, 'triangle', i * .12)); break;
          case 'voyage-boss-phase': this.note(165, 330, .26, .04, 'triangle'); this.note(495, 660, .27, .03, 'sine', .09); break;
          case 'voyage-boss-teleport': this.note(660, 330, .13, .03, 'sine'); this.note(990, 1320, .14, .025, 'triangle', .09); break;
          case 'voyage-device':
            if (weapon === 'afterimage') this.note(740, 370, .17, .025, 'sine');
            else if (weapon === 'needles') { this.note(1100, 880, .065, .025, 'triangle'); this.note(1320, 990, .07, .025, 'triangle', .03); }
            else if (weapon === 'mirror') { this.note(990, 1485, .11, .025, 'sine'); this.note(1485, 1980, .1, .02, 'sine', .04); }
            else if (weapon === 'sentry') this.note(880, 440, .1, .03, 'triangle');
            else if (weapon === 'well') { this.note(110, 330, .25, .035, 'triangle'); this.note(660, 330, .18, .02, 'sine', .07); }
            else if (weapon === 'battery') { this.note(330, 660, .14, .025, 'triangle'); this.note(990, 990, .13, .02, 'sine', .06); }
            break;
          case 'voyage-resonance': {
            const root = { 'tail-collapse': 392, 'cross-mirror': 440, 'tidal-collapse': 330 }[weapon] || 392;
            [1, 1.5, 2].forEach((ratio, i) => this.note(root * ratio, root * ratio, .26, .035, 'triangle', i * .07)); break;
          }
          case 'salvage-cargo-picked': case 'cargo-picked': this.note(330, 660, .2, .04, 'triangle'); this.note(990, 990, .18, .03, 'sine', .08); break;
          case 'salvage-cargo-dropped': case 'cargo-dropped': this.note(660, 330, .14, .035, 'triangle'); this.noiseBurst(1800, .045, .025); break;
          case 'salvage-cargo-pulse': this.note(440, 330, .11, .028, 'triangle'); this.note(660, 495, .11, .028, 'triangle', .14); break;
          case 'cargo-delivered': [392, 587, 784, 1174].forEach((f, i) => this.note(f, f, .35, .035, 'sine', i * .07)); break;
          case 'star-pin': this.note(1450, 850, .065, .022, 'triangle'); break;
          case 'starline-created': this.note(660, 1320, .14, .03, 'sine'); this.note(990, 1485, .13, .025, 'triangle', .03); break;
          case 'starline-trigger': this.note(940, 470, .09, .035, 'triangle'); this.noiseBurst(2900, .035, .025, true); if (weapon === 'capture') this.note(1760, 2200, .07, .02, 'sine'); break;
          case 'starline-capture': this.note(1760, 2200, .09, .02, 'sine'); this.note(880, 1320, .07, .018, 'triangle', .025); break;
          case 'hazard-burst': this.note(125, 42, .25, .13, 'triangle'); this.noiseBurst(1800, .18, .1); break;
          case 'sector-warning': this.note(640, 640, .13, .07, 'triangle'); this.note(480, 480, .21, .065, 'triangle', .18); break;
          case 'boss-attack': this.note(220, 330, .22, .095, 'triangle'); this.note(190, 285, .24, .09, 'triangle', .25); this.note(880, 660, .15, .025, 'sine', .02); break;
          case 'conduction-charge': this.note(440 + weapon * 110, 880 + weapon * 110, .18, .05, 'triangle'); this.note(1320, 1320, .28, .035, 'sine', .12); break;
          case 'boss-backlash': this.noiseBurst(2600, .22, .12); this.note(110, 55, .35, .1, 'triangle'); [660, 990, 1320].forEach((f, i) => this.note(f, f, .3, .035, 'sine', .06 + i * .08)); break;
          case 'campaign-rest': [262, 330, 392].forEach((f, i) => this.note(f, f, .4, .04, 'sine', i * .09)); break;
          case 'campaign-stage': this.note(165, 660, .42, .045, 'triangle'); this.note(495, 990, .32, .025, 'sine', .12); break;
          case 'campaign-complete': [262, 392, 523, 659, 784].forEach((f, i) => this.note(f, f, .6, .045, 'triangle', i * .13)); break;
          case 'anchor-break': this.noiseBurst(3800, .13, .055, true); this.note(1320, 440, .25, .045, 'sine'); break;
          case 'nexus-shield-break': this.note(196, 49, .35, .07, 'triangle'); [523, 784, 1046].forEach((f, i) => this.note(f, f, .35, .04, 'sine', .08 + i * .09)); break;
          case 'awakening-acquired': [330, 440, 660].forEach((f, i) => this.note(f, f, .38, .045, 'triangle', i * .11)); break;
          case 'awakening-trigger':
            if (weapon === 'return') this.note(740, 370, .15, .03, 'triangle');
            else if (weapon === 'slide') { this.noiseBurst(3900, .045, .025, true); this.note(480, 720, .09, .025); }
            else if (weapon === 'relay-ready') { this.note(660, 990, .12, .025); this.note(1320, 1320, .1, .02, 'sine', .06); }
            else if (weapon === 'relay') this.note(330, 660, .13, .035, 'triangle');
            else if (weapon === 'interrupt') { this.note(1100, 550, .075, .025, 'triangle'); this.noiseBurst(3300, .035, .025, true); }
            else if (weapon === 'field') this.note(392, 784, .2, .03, 'sine');
            else if (weapon === 'field-capture') this.note(1175, 1568, .065, .018, 'sine');
            else if (weapon === 'charge') this.note(196, 392, .18, .035, 'triangle');
            else if (weapon === 'release') this.note(880, 440, .15, .03, 'triangle');
            break;
          case 'hit': this.noiseBurst(2400, .03, .045, true); break;
          case 'critical': this.note(980, 680, .065, .065, 'triangle'); break;
          case 'kill': this.note(240, 115, .09, .065, 'triangle'); break;
          case 'reload': this.noiseBurst(3600, .055, .08, true); this.note(310, 190, .06, .03, 'square', .07); break;
          case 'reload-complete': this.note(650, 440, .08, .06, 'triangle'); break;
          case 'reload-perfect': this.note(660, 660, .13, .07, 'triangle'); this.note(990, 990, .23, .08, 'triangle', .08); break;
          case 'reload-miss': this.note(160, 100, .13, .05, 'triangle'); break;
          case 'weapon-evolved': [330, 495, 660, 990].forEach((f, i) => this.note(f, f, .45, .055, 'triangle', i * .1)); break;
          case 'evolution-trigger':
            if (weapon === 'primed') { this.note(440, 880, .16, .045, 'triangle'); }
            else if (weapon === 'breach') { this.note(160, 40, .22, .065, 'triangle'); }
            else if (weapon === 'ricochet') { this.note(1800, 900, .12, .04, 'sine'); }
            else if (weapon === 'echo') { this.note(180, 45, .24, .075, 'triangle'); this.noiseBurst(1600, .13, .04); }
            else if (weapon === 'twin') { this.note(980, 1470, .14, .025, 'sine'); }
            break;
          case 'rift-start': this.note(196, 392, .36, .07, 'triangle'); this.note(588, 784, .24, .04, 'sine', .12); break;
          case 'rift-node': this.note(784, 1176, .13, .05, 'sine'); this.note(1568, 1568, .14, .025, 'sine', .06); break;
          case 'rift-ready': [392, 523, 784, 1046].forEach((f, i) => this.note(f, f, .32, .045, 'triangle', i * .09)); break;
          case 'rift-failed': this.note(392, 196, .34, .055, 'triangle'); this.note(262, 131, .35, .035, 'sine', .12); break;
          case 'tactic-trigger':
            if (weapon === 'decoy-dash') { this.note(440, 880, .16, .035, 'sine'); this.note(660, 990, .18, .025, 'sine', .05); }
            else if (weapon === 'reload-mine') { this.note(148, 58, .18, .055, 'triangle'); this.note(880, 660, .06, .025); }
            else { this.note(110, 440, .26, .045, 'triangle'); this.note(660, 220, .2, .025, 'sine', .05); }
            break;
          case 'relic-trigger': this.note(740, 990, .12, .045, 'triangle'); this.note(1110, 1320, .18, .04, 'sine', .07); break;
          case 'secret-trigger':
            if (weapon === 'rebound') { this.noiseBurst(4500, .05, .045, true); this.note(1550, 780, .12, .045, 'triangle'); }
            else if (weapon === 'blade-relay') { this.note(660, 1320, .15, .05, 'triangle'); this.note(990, 1980, .1, .03, 'sine', .04); }
            else if (weapon === 'bullet-reversal') { this.note(130, 900, .2, .06, 'triangle'); this.noiseBurst(2900, .12, .045, true); }
            else if (weapon === 'fuse-resonance') { this.note(220, 640, .11, .045, 'triangle'); this.note(880, 440, .12, .035, 'sine', .045); }
            else if (weapon === 'rail-resonance') { this.note(2100, 600, .14, .025, 'sawtooth'); this.note(880, 1760, .08, .035); }
            else if (weapon === 'ice-break') { this.noiseBurst(4200, .11, .06, true); this.note(1800, 660, .16, .04, 'triangle'); }
            break;
          case 'secret-discovered': [392, 587.33, 784].forEach((f, i) => this.note(f, f, .85, .045, 'sine', i * .12)); break;
          case 'dash': this.noiseBurst(1900, .16, .09); this.note(350, 80, .16, .07); break;
          case 'phase-mark': this.note(580, 1040, .095, .055, 'triangle'); this.note(1160, 1560, .08, .02, 'sine', .025); break;
          case 'phase-capture': this.note(960, 1550, .11, .045); this.note(220, 330, .09, .035, 'triangle'); break;
          case 'phase-burst':
            this.note(135, 35, .28, .21, 'triangle'); this.noiseBurst(1700, .17, .13);
            this.note(730, 190, .2, .05, 'sine'); break;
          case 'overdrive-start':
            this.note(90, 36, .52, .18, 'triangle'); this.noiseBurst(1200, .3, .08);
            [330, 440, 660, 880].forEach((f, i) => this.note(f, f * 1.012, .26, .065, 'triangle', i * .075)); break;
          case 'overdrive-end': this.note(520, 260, .28, .065, 'triangle'); this.note(260, 130, .24, .05, 'sine', .08); break;
          case 'combo': {
            const scale = [440, 494, 554, 659, 740, 880, 988, 1109];
            const f = scale[Math.min(scale.length - 1, Math.floor(Math.max(0, Number(weapon) || 0) / 5))];
            this.note(f, f, .14, .045, 'triangle'); this.note(f * 1.5, f * 1.5, .11, .025, 'sine', .035); break;
          }
          case 'pulse': this.note(115, 26, .48, .24); this.noiseBurst(800, .40, .18); break;
          case 'damage': this.note(115, 38, .18, .17, 'triangle'); this.noiseBurst(650, .10, .11); break;
          case 'pickup': this.note(830, 1160, .07, .022); break;
          case 'upgrade': [440, 554, 660].forEach((f, i) => this.note(f, f, .24, .055, 'triangle', i * .08)); break;
          case 'win': [392, 494, 587, 784].forEach((f, i) => this.note(f, f, .5, .065, 'triangle', i * .13)); break;
          case 'click': this.note(500, 720, .07, .035, 'triangle'); break;
        }
      } catch (_) { /* A browser can decline audio while still allowing play. */ }
    }
  }
  window.FrontierAudio = FrontierAudio;
})();
