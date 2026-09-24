/* Synthesized locally: no audio downloads or third-party samples. */
(() => {
  'use strict';
  class FrontierAudio {
    constructor() { this.enabled = true; this.context = null; this.voices = 0; this.lastPlayed = Object.create(null); }

    setEnabled(enabled) {
      this.enabled = enabled;
      if (this.master) this.master.gain.setTargetAtTime(enabled ? .55 : 0, this.context.currentTime, .025);
    }

    init() {
      if (this.context) return;
      const Context = window.AudioContext || window.webkitAudioContext;
      if (!Context) return;
      this.context = new Context();
      this.master = this.context.createGain(); this.master.gain.value = .55;
      const compressor = this.context.createDynamicsCompressor();
      compressor.threshold.value = -16; compressor.ratio.value = 5;
      this.master.connect(compressor); compressor.connect(this.context.destination);
      this.noise = this.context.createBuffer(1, this.context.sampleRate, this.context.sampleRate);
      const data = this.noise.getChannelData(0);
      for (let i = 0; i < data.length; i++) data[i] = Math.random() * 2 - 1;
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
      try {
        this.init(); if (!this.context) return;
        if (this.context.state === 'suspended') this.context.resume();
        const spacing = kind === 'phase-mark' ? .075 : kind === 'phase-capture' ? .055 : kind === 'phase-burst' || kind === 'grenade-burst' ? .065 : kind === 'hazard-burst' ? .08 : kind === 'sector-warning' ? .7 : kind === 'boss-attack' ? .45 : kind === 'combo' ? .1 : 0;
        if (spacing && this.context.currentTime - (this.lastPlayed[kind] ?? -Infinity) < spacing) return;
        this.lastPlayed[kind] = this.context.currentTime;
        switch (kind) {
          case 'shot':
            if (weapon === 0) { this.noiseBurst(1900, .065, .14); this.note(165, 48, .11, .14, 'triangle'); }
            else if (weapon === 1) { this.noiseBurst(1300, .20, .26); this.note(105, 28, .24, .23, 'triangle'); }
            else if (weapon === 3) { this.note(135, 43, .23, .19, 'triangle'); this.noiseBurst(720, .11, .16); this.note(330, 110, .13, .06); }
            else if (weapon === 4) { this.noiseBurst(3900, .13, .07, true); this.note(1350, 480, .2, .08, 'triangle'); this.note(730, 350, .18, .04, 'sine', .03); }
            else { this.noiseBurst(3600, .06, .11, true); this.note(940, 125, .24, .11, 'sawtooth'); this.note(100, 28, .20, .16); }
            break;
          case 'grenade-burst': this.note(105, 27, .38, .24, 'triangle'); this.noiseBurst(950, .28, .2); this.note(260, 58, .23, .06, 'sawtooth'); break;
          case 'hazard-burst': this.note(125, 42, .25, .13, 'triangle'); this.noiseBurst(1800, .18, .1); break;
          case 'sector-warning': this.note(640, 640, .13, .07, 'triangle'); this.note(480, 480, .21, .065, 'triangle', .18); break;
          case 'boss-attack': this.note(220, 330, .22, .095, 'triangle'); this.note(190, 285, .24, .09, 'triangle', .25); this.note(880, 660, .15, .025, 'sine', .02); break;
          case 'hit': this.noiseBurst(2400, .03, .045, true); break;
          case 'critical': this.note(980, 680, .065, .065, 'triangle'); break;
          case 'kill': this.note(240, 115, .09, .065, 'triangle'); break;
          case 'reload': this.noiseBurst(3600, .055, .08, true); this.note(310, 190, .06, .03, 'square', .07); break;
          case 'reload-complete': this.note(650, 440, .08, .06, 'triangle'); break;
          case 'reload-perfect': this.note(660, 660, .13, .07, 'triangle'); this.note(990, 990, .23, .08, 'triangle', .08); break;
          case 'reload-miss': this.note(160, 100, .13, .05, 'triangle'); break;
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
