(() => {
  'use strict';

  function init(state, { changed, nextId }) {
    const panel = document.getElementById('panel-layers');
    if (!panel) throw new Error('The Layers panel is missing.');
    const element = (tag, className, text) => {
      const node = document.createElement(tag);
      if (className) node.className = className;
      if (text) node.textContent = text;
      return node;
    };
    const setText = (node, value) => { if (node.textContent !== value) node.textContent = value; };
    const button = (id, text, handler) => {
      const node = element('button', 'btn', text);
      node.type = 'button';
      if (id) node.id = id;
      node.addEventListener('click', handler);
      return node;
    };

    const hint = element('p', 'pane-hint', 'Layers are shown from front to back. Select a layer to change its position or size.');
    const status = element('p', 'pane-hint');
    status.id = 'layers-status';
    status.setAttribute('role', 'status');
    status.setAttribute('aria-live', 'polite');
    status.tabIndex = -1;
    const list = element('ol', 'layer-list');
    list.id = 'layers-list';
    list.setAttribute('aria-label', 'Composition layers, front to back');
    const editor = element('div', 'layer-editor');
    editor.id = 'layer-editor';
    editor.hidden = true;
    const heading = element('h2', '', 'Selected layer');
    heading.id = 'layer-heading';
    editor.setAttribute('role', 'group');
    editor.setAttribute('aria-labelledby', heading.id);
    const geometry = element('div', 'layer-geometry');
    const inputs = {};
    let aspect = null;

    const current = () => state.overlays.find(layer => layer.id === state.selectedId) || null;
    const nameOf = layer => {
      if (layer.type === 'text') {
        const first = String(layer.text || '').split(/\r?\n/, 1)[0].trim();
        return first ? Array.from(first).slice(0, 55).join('') : 'Empty text box';
      }
      const labels = state.assetLabels;
      return String(labels?.get?.(layer.assetId) || labels?.[layer.assetId] || state.customAssets?.find(asset => asset.id === layer.assetId)?.label || layer.assetId || 'Image asset');
    };

    for (const [property, label] of [['x', 'Left · px'], ['y', 'Top · px'], ['width', 'Width · px'], ['height', 'Height · px']]) {
      const field = element('label', 'horoscope-field');
      field.append(element('span', '', label));
      const input = element('input');
      input.id = `layer-${property}`;
      input.type = 'number';
      input.step = '1';
      if (property === 'width' || property === 'height') input.min = '1';
      input.setAttribute('aria-describedby', 'layer-size-hint');
      input.addEventListener('focus', () => {
        const layer = current();
        aspect = layer && layer.type !== 'text' ? { id: layer.id, ratio: layer.width / layer.height } : null;
      });
      input.addEventListener('blur', () => { aspect = null; });
      input.addEventListener('input', () => {
        const layer = current();
        if (!layer || layer.locked || input.value === '' || !input.checkValidity() || !Number.isFinite(input.valueAsNumber)) return;
        if (layer.type === 'text' && property === 'height') return;
        const value = input.valueAsNumber;
        if ((property === 'width' || property === 'height') && value < (layer.type === 'text' ? 48 : 1)) return;
        if (layer.type !== 'text' && (property === 'width' || property === 'height')) {
          const ratio = aspect?.id === layer.id ? aspect.ratio : layer.width / layer.height;
          if (!Number.isFinite(ratio) || ratio <= 0) return;
          layer[property] = value;
          if (property === 'width') layer.height = Math.max(1, Math.round(value / ratio));
          else layer.width = Math.max(1, Math.round(value * ratio));
        } else layer[property] = value;
        changed(`layer:${layer.id}:${property}`);
      });
      inputs[property] = input;
      field.append(input);
      geometry.append(field);
    }
    const sizeHint = element('p', 'pane-hint', 'Image proportions stay fixed. Text height follows the content. Locked layers can be inspected but not edited.');
    sizeHint.id = 'layer-size-hint';
    const actions = element('div', 'layer-actions');
    const duplicate = button('layer-duplicate', 'Duplicate', () => {
      const layer = current();
      if (!layer || layer.locked) return;
      const copy = { ...layer, id: nextId(), x: layer.x + 24, y: layer.y + 24, locked: false, hidden: false };
      delete copy.textLayout;
      const index = state.overlays.indexOf(layer);
      state.overlays.splice(index + 1, 0, copy);
      state.selectedId = copy.id;
      changed();
    });
    const remove = button('layer-delete', 'Delete layer', () => {
      const layer = current();
      if (!layer || layer.locked) return;
      const index = state.overlays.indexOf(layer);
      state.overlays.splice(index, 1);
      state.selectedId = state.overlays[Math.min(index, state.overlays.length - 1)]?.id || null;
      changed();
    });
    const reorder = direction => {
      const layer = current();
      if (!layer || layer.locked) return;
      const index = state.overlays.indexOf(layer), target = index + direction;
      if (target < 0 || target >= state.overlays.length) return;
      [state.overlays[index], state.overlays[target]] = [state.overlays[target], state.overlays[index]];
      changed();
    };
    const forward = button('layer-forward', 'Bring forward', () => reorder(1));
    const backward = button('layer-backward', 'Send backward', () => reorder(-1));
    actions.append(duplicate, remove, forward, backward);
    editor.append(heading, geometry, sizeHint, actions);
    panel.replaceChildren(hint, status, list, editor);

    const rows = new Map();
    function createRow(id) {
      const row = element('li', 'layer-row');
      row.dataset.layerId = id;
      const select = button(null, '', () => {
        if (!state.overlays.some(layer => layer.id === id)) return;
        state.selectedId = id;
        changed();
      });
      select.classList.add('layer-select');
      const label = element('span', 'layer-name');
      const description = element('span', 'layer-description');
      select.append(label, description);
      const visibility = button(null, '', () => {
        const layer = state.overlays.find(item => item.id === id);
        if (!layer) return;
        layer.hidden = !layer.hidden;
        changed();
      });
      visibility.classList.add('layer-visibility');
      const lock = button(null, '', () => {
        const layer = state.overlays.find(item => item.id === id);
        if (!layer) return;
        layer.locked = !layer.locked;
        changed();
      });
      lock.classList.add('layer-lock');
      row.append(select, visibility, lock);
      const record = { row, select, label, description, visibility, lock };
      rows.set(id, record);
      return record;
    }

    function sync() {
      const focused = document.activeElement;
      const keepFocus = panel.contains(focused);
      const layers = state.overlays.slice().reverse();
      const ids = new Set(layers.map(layer => layer.id));
      for (const [id, record] of rows) {
        if (!ids.has(id)) { record.row.remove(); rows.delete(id); }
      }
      layers.forEach((layer, index) => {
        const record = rows.get(layer.id) || createRow(layer.id);
        if (list.children[index] !== record.row) list.insertBefore(record.row, list.children[index] || null);
        const name = nameOf(layer);
        setText(record.label, name);
        setText(record.description, `${layer.type === 'text' ? 'Text' : 'Image'} · ${layer.hidden ? 'Hidden' : 'Visible'} · ${layer.locked ? 'Locked' : 'Unlocked'}`);
        record.row.classList.toggle('is-selected', state.selectedId === layer.id);
        record.select.setAttribute('aria-pressed', String(state.selectedId === layer.id));
        record.select.setAttribute('aria-label', `Select ${name}, layer ${index + 1} of ${layers.length}`);
        setText(record.visibility, layer.hidden ? 'Hidden' : 'Visible');
        record.visibility.setAttribute('aria-label', `Visibility for ${name}`);
        record.visibility.setAttribute('aria-pressed', String(!layer.hidden));
        record.visibility.title = `${layer.hidden ? 'Show' : 'Hide'} ${name}`;
        setText(record.lock, layer.locked ? 'Locked' : 'Unlocked');
        record.lock.setAttribute('aria-label', `Lock ${name}`);
        record.lock.setAttribute('aria-pressed', String(Boolean(layer.locked)));
        record.lock.title = `${layer.locked ? 'Unlock' : 'Lock'} ${name}`;
      });

      const layer = current();
      editor.hidden = !layer;
      setText(status, layers.length
        ? `${layers.length} layer${layers.length === 1 ? '' : 's'}${layer ? ` · Selected: ${nameOf(layer)}${layer.locked ? ' (locked)' : ''}` : ' · Select a layer to edit it.'}`
        : state.bgImage ? 'No layers yet. Add text or an image asset to begin.' : 'Start a canvas to add text or image layers.');
      for (const [property, input] of Object.entries(inputs)) {
        input.disabled = !layer || Boolean(layer.locked);
        input.readOnly = property === 'height' && layer?.type === 'text';
        input.min = property === 'width' && layer?.type === 'text' ? '48' : property === 'width' || property === 'height' ? '1' : '';
        if (document.activeElement !== input) input.value = layer ? Math.round(layer[property]) : '';
      }
      const index = layer ? state.overlays.indexOf(layer) : -1;
      duplicate.disabled = remove.disabled = !layer || Boolean(layer.locked);
      forward.disabled = !layer || Boolean(layer.locked) || index === state.overlays.length - 1;
      backward.disabled = !layer || Boolean(layer.locked) || index <= 0;
      if (keepFocus && focused?.isConnected && !focused.disabled && !focused.closest('[hidden]') && document.activeElement !== focused) focused.focus({ preventScroll: true });
      else if (keepFocus && (!focused?.isConnected || focused.closest('[hidden]'))) {
        const replacement = rows.get(state.selectedId)?.select || status;
        replacement.focus({ preventScroll: true });
      }
    }
    sync();
    return { sync };
  }

  window.ComposerLayers = { init };
})();
