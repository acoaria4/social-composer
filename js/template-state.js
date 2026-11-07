(() => {
  'use strict';

  const STORAGE_KEY = 'glitch-social-composer-template-drafts';
  const registry = new Map();
  const clone = value => JSON.parse(JSON.stringify(value));
  const object = value => value && typeof value === 'object' && !Array.isArray(value);
  let restoring = false;
  let ready = false;
  let lastSignature = '';
  let bootForms = null;

  function captureForms() {
    const forms = {};
    for (const [name, handler] of registry) {
      try {
        const value = handler.capture();
        if (object(value)) forms[name] = clone(value);
      } catch {
        // A disconnected form must not prevent another form or canvas from saving.
      }
    }
    return forms;
  }

  function persist(forms) {
    try {
      localStorage.setItem(STORAGE_KEY, JSON.stringify(forms));
      return true;
    } catch {
      document.dispatchEvent(new CustomEvent('composer:form-storage-error', {
        detail: { message: 'Template drafts could not be saved in this browser. Download a project backup to keep your text and settings.' },
      }));
      return false;
    }
  }

  function announce(forms, restored) {
    document.dispatchEvent(new CustomEvent('composer:form-state', {
      detail: { forms: clone(forms), restored },
    }));
  }

  function changed() {
    if (restoring || !ready) return;
    const forms = captureForms();
    const signature = JSON.stringify(forms);
    if (signature === lastSignature) return;
    lastSignature = signature;
    persist(forms);
    announce(forms, false);
  }

  function flushForms() {
    const forms = captureForms();
    lastSignature = JSON.stringify(forms);
    persist(forms);
    return forms;
  }

  function restoreForms(forms) {
    if (!object(forms)) return false;
    restoring = true;
    try {
      for (const [name, handler] of registry) {
        if (object(forms[name])) handler.restore(clone(forms[name]));
      }
    } finally {
      restoring = false;
    }
    const restored = captureForms();
    lastSignature = JSON.stringify(restored);
    persist(restored);
    announce(restored, true);
    return true;
  }

  function restoreSource(source) {
    if (!object(source) || !object(source.form)) return false;
    const name = ['aura-cover', 'aura-reading', 'aura-blank'].includes(source.kind) ? 'aura'
      : source.kind === 'lumen-fact' ? 'lumen' : null;
    const handler = registry.get(name);
    if (!handler) return false;
    restoring = true;
    try {
      handler.restore(clone(source.form), clone(source));
    } finally {
      restoring = false;
    }
    const forms = captureForms();
    lastSignature = JSON.stringify(forms);
    persist(forms);
    announce(forms, true);
    return true;
  }

  function register(name, handler) {
    if (!['aura', 'lumen'].includes(name) || typeof handler?.capture !== 'function' || typeof handler?.restore !== 'function') {
      throw new Error('A template form needs capture and restore handlers.');
    }
    registry.set(name, handler);
    if (ready && object(bootForms?.[name])) {
      restoring = true;
      try { handler.restore(clone(bootForms[name])); }
      finally { restoring = false; }
    }
    lastSignature = JSON.stringify(captureForms());
  }

  function boot() {
    if (ready) return;
    try {
      const stored = JSON.parse(localStorage.getItem(STORAGE_KEY) || 'null');
      if (object(stored)) bootForms = stored;
    } catch {
      // Read failure leaves the current form usable and never changes the canvas.
    }
    ready = true;
    if (bootForms) restoreForms(bootForms);
    else lastSignature = JSON.stringify(captureForms());
    document.dispatchEvent(new CustomEvent('composer:forms-ready', { detail: { restored: Boolean(bootForms) } }));
  }

  document.addEventListener('input', event => {
    if (/^(horoscope-|lumen-)/.test(event.target?.id || '') || event.target?.id === 'preset-select') changed();
  });
  document.addEventListener('change', event => {
    if (/^(horoscope-|lumen-)/.test(event.target?.id || '') || event.target?.id === 'preset-select') changed();
  });
  window.addEventListener('pagehide', () => { if (ready) flushForms(); });
  if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', boot, { once: true });
  else queueMicrotask(boot);

  window.ComposerTemplateState = { register, captureForms, restoreForms, restoreSource, flushForms, changed };
})();
