(function (root) {
  'use strict';
  root.FrontierDisplay = class {
    constructor({ stage, onChange = () => {}, onBeforeChange = () => {} }) {
      this.stage = stage;
      this.onChange = onChange;
      this.onBeforeChange = onBeforeChange;
      this._epoch = 0;
      this._entering = false;
      this._exiting = false;
      this._hadNative = this.native;
      this._orientation = root.matchMedia('(orientation: portrait)');
      this._orientation.addEventListener('change', () => {
        this.onBeforeChange();
        this.onChange();
      });
      document.addEventListener('fullscreenchange', () => {
        const native = this.native;
        if (this._hadNative && !native) {
          this._epoch++;
          this.onBeforeChange();
          this._clearFallback();
          this._unlock();
        }
        this._hadNative = native;
        this.onChange();
      });
    }
    get native() { return document.fullscreenElement === this.stage; }
    get fallback() { return this.stage.classList.contains('immersive'); }
    get active() { return this.native || this.fallback; }
    get busy() { return this._entering || this._exiting; }
    get portrait() { return this._orientation.matches; }
    _clearFallback() {
      this.stage.classList.remove('immersive');
      document.body.classList.remove('immersive-page');
    }
    _unlock() {
      try { root.screen.orientation?.unlock?.(); } catch (_) { /* Browser restrictions do not block exit. */ }
    }
    async _leaveNative() {
      if (this.native && typeof document.exitFullscreen === 'function') {
        try { await document.exitFullscreen(); } catch (_) { /* Keep reporting the actual fullscreen state. */ }
      }
    }
    enter({ landscape = true } = {}) {
      if (this.busy || this.active) return this._entry || Promise.resolve();
      this._entry = this._enter(landscape);
      return this._entry;
    }
    async _enter(landscape) {
      this._entering = true;
      const epoch = ++this._epoch;
      this.onBeforeChange();
      try {
        // This invocation stays in the click's activation before the first await.
        if (typeof this.stage.requestFullscreen === 'function') {
          try { await this.stage.requestFullscreen(); } catch (_) { /* Fall back to the page's available viewport. */ }
        }
        if (epoch !== this._epoch) {
          await this._leaveNative();
          return;
        }
        this._hadNative = this.native;
        if (!this.native) {
          this.stage.classList.add('immersive');
          document.body.classList.add('immersive-page');
        }
        this.onChange();
        if (landscape && typeof root.screen.orientation?.lock === 'function') {
          try { await root.screen.orientation.lock('landscape'); } catch (_) { /* Physical rotation remains available. */ }
          if (epoch !== this._epoch) this._unlock();
        }
      } finally {
        this._entering = false;
        this.onChange();
      }
    }
    exit() {
      if (this._exiting) return this._exit;
      this._exit = this._performExit();
      return this._exit;
    }
    async _performExit() {
      this._exiting = true;
      this._epoch++;
      this.onBeforeChange();
      this._clearFallback();
      this._unlock();
      this.onChange();
      try { await this._leaveNative(); }
      finally { this._exiting = false; this.onChange(); }
    }
    toggle(options) { return this.active || this._entering ? this.exit() : this.enter(options); }
  };
})(window);
