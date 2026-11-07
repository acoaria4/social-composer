(() => {
  'use strict';

  function create(render, {
    request: requestFrame = callback => window.requestAnimationFrame(callback),
    cancel: cancelFrame = id => window.cancelAnimationFrame(id),
  } = {}) {
    if (typeof render !== 'function' || typeof requestFrame !== 'function' || typeof cancelFrame !== 'function') {
      throw new TypeError('A render scheduler requires render, request, and cancel functions.');
    }
    let frame = null;
    let pending = false;
    let version = 0;

    function request() {
      if (pending) return;
      pending = true;
      const ticket = ++version;
      frame = requestFrame(() => {
        if (ticket !== version) return;
        frame = null;
        pending = false;
        render();
      });
    }

    function cancel() {
      const hadPending = pending;
      ++version;
      if (frame !== null) cancelFrame(frame);
      frame = null;
      pending = false;
      return hadPending;
    }

    function flush() {
      if (!pending) return false;
      cancel();
      render();
      return true;
    }

    return { request, flush, cancel };
  }

  window.ComposerRenderScheduler = { create };
})();
