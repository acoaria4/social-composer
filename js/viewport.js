(() => {
  'use strict';
  window.ComposerViewport = function ({ stage, canvas, dimensions, changed, cancelInteraction }) {
    const controls = Object.fromEntries(['out', 'in', 'fit', 'hand', 'level'].map(key => [key, document.getElementById(`zoom-${key}`)]));
    let scale = 1, x = 0, y = 0, fit = true, hand = false, space = false;
    let lastWidth = 0, lastHeight = 0, drag = null, pinch = null;
    const touches = new Map();
    const point = event => { const rect = stage.getBoundingClientRect(); return { x: event.clientX - rect.left - stage.clientLeft, y: event.clientY - rect.top - stage.clientTop }; };
    const hasImage = () => dimensions().width > 0 && dimensions().height > 0;
    function paint() {
      const { width, height } = dimensions(), w = stage.clientWidth, h = stage.clientHeight;
      x = width * scale <= w ? (w - width * scale) / 2 : Math.max(w - width * scale, Math.min(0, x));
      y = height * scale <= h ? (h - height * scale) / 2 : Math.max(h - height * scale, Math.min(0, y));
      Object.assign(canvas.style, { width: `${width * scale}px`, height: `${height * scale}px`, left: `${x}px`, top: `${y}px` });
      controls.level.textContent = hasImage() ? `${Math.round(scale * 100)}%` : '—';
      controls.level.setAttribute('aria-label', `Preview zoom: ${hasImage() ? Math.round(scale * 100) + ' percent' : 'no canvas'}`);
      for (const key of ['out', 'in', 'fit', 'hand']) controls[key].disabled = !hasImage();
      controls.out.disabled ||= scale <= .1;
      controls.in.disabled ||= scale >= 4;
      controls.fit.setAttribute('aria-pressed', String(fit));
      controls.hand.setAttribute('aria-pressed', String(hand));
      stage.classList.toggle('is-hand', hand || space);
      stage.classList.toggle('is-panning', Boolean(drag || pinch));
      changed();
    }
    function refresh() {
      const { width, height } = dimensions(), w = stage.clientWidth, h = stage.clientHeight;
      if (fit && width && height) {
        scale = Math.min(Math.max(1, w - 32) / width, Math.max(1, h - 32) / height, 1);
        x = (w - width * scale) / 2; y = (h - height * scale) / 2;
      } else {
        x += (w - lastWidth) / 2; y += (h - lastHeight) / 2;
      }
      lastWidth = w; lastHeight = h;
      paint();
    }
    function zoom(value, anchor = { x: stage.clientWidth / 2, y: stage.clientHeight / 2 }) {
      if (!hasImage()) return;
      const next = Math.max(.1, Math.min(4, value));
      x = anchor.x - (anchor.x - x) * next / scale;
      y = anchor.y - (anchor.y - y) * next / scale;
      scale = next; fit = false; paint();
    }
    function stop() { drag = null; pinch = null; touches.clear(); space = false; paint(); }
    function reset() { fit = true; hand = false; stop(); refresh(); }
    controls.in.addEventListener('click', () => zoom(scale * 1.25));
    controls.out.addEventListener('click', () => zoom(scale / 1.25));
    controls.fit.addEventListener('click', () => { fit = true; refresh(); });
    controls.hand.addEventListener('click', () => { hand = !hand; cancelInteraction(); paint(); });
    stage.addEventListener('wheel', event => {
      if (!hasImage()) return;
      event.preventDefault(); cancelInteraction();
      const unit = event.deltaMode === 1 ? 16 : event.deltaMode === 2 ? stage.clientHeight : 1;
      if (event.ctrlKey) zoom(scale * Math.exp(-event.deltaY * unit * .01), point(event));
      else {
        x -= (event.shiftKey && !event.deltaX ? event.deltaY : event.deltaX) * unit;
        y -= (event.shiftKey && !event.deltaX ? 0 : event.deltaY) * unit;
        paint();
      }
    }, { passive: false });
    const gesture = () => {
      const [a, b] = [...touches.values()];
      return { center: { x: (a.x + b.x) / 2, y: (a.y + b.y) / 2 }, distance: Math.max(1, Math.hypot(a.x - b.x, a.y - b.y)) };
    };
    const consume = event => { event.preventDefault(); event.stopImmediatePropagation(); };
    stage.addEventListener('pointerdown', event => {
      if (!hasImage() || event.button > 0) return;
      const p = point(event);
      if (event.pointerType === 'touch') touches.set(event.pointerId, p);
      if (touches.size >= 2) {
        cancelInteraction(); drag = null; pinch = gesture();
        for (const id of touches.keys()) stage.setPointerCapture(id);
        consume(event); paint();
      } else if (hand || space) {
        cancelInteraction(); drag = { id: event.pointerId, point: p };
        stage.setPointerCapture(event.pointerId); stage.focus({ preventScroll: true });
        consume(event); paint();
      }
    }, true);
    stage.addEventListener('pointermove', event => {
      const p = point(event);
      if (touches.has(event.pointerId)) touches.set(event.pointerId, p);
      if (pinch && touches.size >= 2) {
        const next = gesture();
        zoom(scale * next.distance / pinch.distance, pinch.center);
        x += next.center.x - pinch.center.x; y += next.center.y - pinch.center.y;
        pinch = next; consume(event); paint();
      } else if (drag?.id === event.pointerId) {
        x += p.x - drag.point.x; y += p.y - drag.point.y;
        drag.point = p; consume(event); paint();
      }
    }, true);
    function release(event) {
      touches.delete(event.pointerId);
      if (pinch || drag?.id === event.pointerId) {
        consume(event); cancelInteraction(); pinch = null; drag = null;
        // Continue a two-finger gesture as a one-finger pan, never an object edit.
        if (event.type !== 'pointercancel' && touches.size === 1) {
          const [id, p] = touches.entries().next().value;
          drag = { id, point: p };
        }
        paint();
      }
    }
    stage.addEventListener('pointerup', release, true);
    stage.addEventListener('pointercancel', release, true);
    stage.addEventListener('lostpointercapture', event => {
      if (drag?.id === event.pointerId || touches.has(event.pointerId)) {
        touches.delete(event.pointerId); drag = null; pinch = null; cancelInteraction(); paint();
      }
    });
    const typing = target => target?.closest('input, textarea, select, button, summary, [contenteditable="true"]');
    window.addEventListener('keydown', event => {
      if (event.code === 'Space' && !typing(event.target) && (stage.contains(document.activeElement) || stage.matches(':hover')) && hasImage()) {
        event.preventDefault(); space = true; paint();
      }
    });
    window.addEventListener('keyup', event => { if (event.code === 'Space') { space = false; paint(); } });
    window.addEventListener('blur', () => { cancelInteraction(); stop(); });
    return { refresh, reset };
  };
})();
