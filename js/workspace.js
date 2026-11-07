(() => {
  'use strict';

  function init({ selectTab, selectBrand }) {
    const byId = id => document.getElementById(id);
    const stage = byId('stage-drop');
    const library = document.querySelector('.editor-pane');
    const inspector = document.querySelector('.inspector-pane');
    const title = byId('document-title');
    const context = byId('inspector-context');
    const addText = byId('inspector-add-text');
    const modeEdit = byId('btn-mode-edit');
    const modePreview = byId('btn-mode-preview');
    const mobile = matchMedia('(max-width: 999px)');
    const chooseTab = tab => { if (tab) selectTab(tab); };
    const setText = (element, value) => {
      if (element && element.textContent !== value) element.textContent = value;
    };
    let selection = null;
    let selectedId = null;
    let mode = 'edit';

    function setView(next, { focus = true } = {}) {
      if (!['edit', 'preview'].includes(next)) return;
      mode = next;
      document.body.dataset.workspaceView = mode;
      byId('canvas-settings').open = !mobile.matches || mode === 'edit';
      modeEdit.setAttribute('aria-pressed', String(mode === 'edit'));
      modePreview.setAttribute('aria-pressed', String(mode === 'preview'));
      if (!focus) return;
      if (mode === 'preview') {
        stage.focus({ preventScroll: true });
        if (mobile.matches) stage.scrollIntoView({ block: 'nearest', behavior: 'instant' });
      } else if (mobile.matches) {
        const target = selection ? inspector : library;
        target.scrollIntoView({ block: 'start', behavior: 'instant' });
      }
    }

    modeEdit.addEventListener('click', () => setView('edit'));
    modePreview.addEventListener('click', () => setView('preview'));
    byId('btn-view-preview').addEventListener('click', () => setView('preview'));
    document.querySelector('.skip-link').addEventListener('click', event => {
      if (!mobile.matches) return;
      event.preventDefault();
      setView('preview');
    });
    mobile.addEventListener('change', () => setView('edit', { focus: false }));

    addText.addEventListener('click', () => {
      chooseTab(byId('tab-text'));
      byId('text-add').click();
      if (mobile.matches) setView('edit');
    });

    const cards = [...document.querySelectorAll('#template-gallery [data-template]')];
    const names = {
      'aura-cover': 'AURA · Daily cover',
      'aura-reading': 'AURA · Daily horoscope',
      'lumen-fact': 'Lumen · Fact post',
    };
    function setBrand(brand) {
      const visible = cards.filter(card => card.dataset.templateBrand === brand);
      cards.forEach(card => { card.hidden = card.dataset.templateBrand !== brand; });
      byId('template-gallery').hidden = visible.length === 0;
      const label = document.querySelector(`[data-brand="${brand}"]`).textContent.trim();
      byId('template-gallery').setAttribute('aria-label', `${label} templates`);
      const chosen = visible.find(card => card.getAttribute('aria-pressed') === 'true');
      setText(byId('template-choice-label'), chosen ? names[chosen.dataset.template]
        : visible.length ? `Choose a ${label} template to open its settings.`
        : `No ${label} templates yet. Start with a blank canvas or upload a background.`);
    }
    cards.forEach(card => {
      card.setAttribute('aria-pressed', 'false');
      card.addEventListener('click', () => {
        const kind = card.dataset.template;
        if (!Object.hasOwn(names, kind)) return;
        const brand = kind === 'lumen-fact' ? 'lumen' : 'aura';
        selectBrand(brand);
        chooseTab(byId('tab-create'));
        const panel = document.querySelector(`#panel-create [data-brand-panel="${brand}"]`);
        panel.open = true;
        if (brand === 'aura') byId('settings-heading').closest('details').open = true;
        if (brand === 'aura') {
          const cover = kind === 'aura-cover';
          for (const [id, primary] of [['horoscope-cover', cover], ['horoscope-create', !cover]]) {
            byId(id).classList.toggle('btn-primary', primary);
            byId(id).classList.toggle('btn-ghost', !primary);
          }
        }
        cards.forEach(item => item.setAttribute('aria-pressed', String(item === card)));
        setText(byId('template-choice-label'), names[kind]);
        setView('edit', { focus: false });
        const target = byId(brand === 'lumen' ? 'lumen-text' : 'horoscope-date');
        requestAnimationFrame(() => target.focus());
      });
    });

    function sync({ hasCanvas, selected, title: documentTitle, inspect = true }) {
      selection = selected || null;
      setText(title, documentTitle || 'Untitled canvas');
      const pageTitle = `${documentTitle || 'Untitled canvas'} — Social Composer`;
      if (document.title !== pageTitle) document.title = pageTitle;
      addText.disabled = !hasCanvas || byId('text-add').disabled;
      if (!hasCanvas) setText(context, 'Start with a template or a background.');
      else if (!selection) setText(context, 'Canvas · Select a layer to edit its properties.');
      else {
        const name = selection.type === 'text'
          ? String(selection.text || '').split(/\r?\n/, 1)[0].trim() || 'Empty text box'
          : selection.assetLabel || 'Image asset';
        const shortName = Array.from(name).slice(0, 60).join('');
        const flags = [selection.hidden && 'Hidden', selection.locked && 'Locked'].filter(Boolean);
        setText(context, `${selection.type === 'text' ? 'Text' : 'Image'} · ${shortName}${flags.length ? ` · ${flags.join(' · ')}` : ''}`);
      }
      const empty = byId('inspector-empty');
      if (empty) empty.hidden = Boolean(selection);
      if (selectedId !== (selection?.id || null)) {
        selectedId = selection?.id || null;
        if (!inspect) return;
        if (selection?.type === 'text') {
          // Selecting a text row inside Layers keeps its geometry controls in
          // place. Selecting text on the canvas opens its content inspector.
          if (!inspector.contains(document.activeElement)) chooseTab(byId('tab-text'));
        } else if (selection) chooseTab(byId('tab-layers'));
      }
    }

    setView('edit', { focus: false });
    setBrand(document.querySelector('[data-brand][aria-pressed="true"]').dataset.brand);
    return { sync, setView, setBrand };
  }

  window.ComposerWorkspace = { init };
})();
