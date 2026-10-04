(function (root, factory) {
  const api = factory();
  if (typeof module === 'object' && module.exports) module.exports = api;
  else root.FrontierTouch = api;
})(typeof globalThis !== 'undefined' ? globalThis : this, function () {
  'use strict';

  function bindTouchAction(element, callback, allowPan = false) {
    let lastTouchTime = -Infinity;
    const disabled = () => element.disabled || element.getAttribute('aria-disabled') === 'true';
    const rememberTouch = event => {
      if (event.pointerType === 'touch') lastTouchTime = Date.now();
    };
    const down = event => {
      if (event.pointerType !== 'touch') {
        // A real mouse/pen press must not be mistaken for a legacy touch click.
        lastTouchTime = -Infinity;
        return;
      }
      rememberTouch(event);
      if (!allowPan) event.preventDefault();
      // Secondary fingers may never generate click. Act on their down event,
      // without capturing/releasing another control's pointer or held state.
      if (!disabled()) callback(event);
    };
    const click = event => {
      const touchClick = event.pointerType === 'touch' || event.sourceCapabilities?.firesTouchEvents === true;
      const legacyTouchClick = !event.pointerType && event.sourceCapabilities?.firesTouchEvents !== false
        && Date.now() - lastTouchTime < 800;
      // Keyboard and assistive activation use detail 0. Touch clicks are not
      // reliably suppressed by cancelling pointerdown, so deduplicate them here.
      if (event.detail !== 0 && (touchClick || legacyTouchClick)) {
        event.preventDefault();
        return;
      }
      if (!disabled()) callback(event);
    };
    element.addEventListener('pointerdown', down, { passive: false });
    // Refresh the legacy-click window after long presses and cancellation. No
    // pointer remains armed, so release/cancel cannot accidentally repeat an action.
    element.addEventListener('pointerup', rememberTouch);
    element.addEventListener('pointercancel', rememberTouch);
    element.addEventListener('click', click);
    return () => {
      element.removeEventListener('pointerdown', down);
      element.removeEventListener('pointerup', rememberTouch);
      element.removeEventListener('pointercancel', rememberTouch);
      element.removeEventListener('click', click);
    };
  }

  return { bindTouchAction };
});
