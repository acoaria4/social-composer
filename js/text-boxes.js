(() => {
  'use strict';
  const fonts = ['DM Sans', 'Manrope', 'Outfit', 'Noto Sans Tamil', 'Cormorant Garamond', 'Arial', 'Georgia', 'Times New Roman', 'Verdana', 'Courier New'];
  const defaults = () => ({ header: { font: 'DM Sans', size: 48, weight: 700, color: '#ffffff' }, body: { font: 'DM Sans', size: 32, weight: 400, color: '#ffffff' }, imported: false });
  function normalize(value) {
    const out = defaults();
    for (const kind of ['header', 'body']) {
      const style = value?.[kind];
      if (!style) continue;
      if (fonts.includes(style.font)) out[kind].font = style.font;
      if (Number.isFinite(style.size) && style.size >= 8 && style.size <= 240) out[kind].size = style.size;
      if ([400, 600, 700].includes(style.weight)) out[kind].weight = style.weight;
      if (/^#[\da-f]{6}$/i.test(style.color)) out[kind].color = style.color;
    }
    out.imported = value?.imported === true;
    return out;
  }
  const fontString = style => `${style.weight} ${style.size}px "${style.font}", "Noto Sans Tamil", sans-serif`;
  const segmenter = new Intl.Segmenter(undefined, { granularity: 'grapheme' });
  function wrap(context, text, width) {
    const lines = []; let line = '';
    for (const word of text.split(/(\s+)/u)) {
      if (context.measureText(line + word).width <= width) { line += word; continue; }
      if (line.trim()) { lines.push(line.trimEnd()); line = ''; }
      if (!word.trim()) continue;
      for (const { segment } of segmenter.segment(word)) {
        if (line && context.measureText(line + segment).width > width) { lines.push(line); line = ''; }
        line += segment;
      }
    }
    lines.push(line.trimEnd());
    return lines;
  }
  function layout(context, box, styles) {
    const paragraphs = box.text.replace(/\r\n?/g, '\n').split('\n');
    let y = 8; const lines = [];
    paragraphs.forEach((paragraph, index) => {
      const style = styles[index === 0 ? 'header' : 'body'];
      context.font = fontString(style);
      for (const line of wrap(context, paragraph, Math.max(1, box.width - 16))) {
        lines.push({ text: line, y, style }); y += style.size * 1.4;
      }
      if (index === 0 && paragraphs.length > 1) y += 8;
    });
    return { lines, height: Math.ceil(y + 8) };
  }
  function draw(context, box, styles) {
    const result = layout(context, box, styles);
    box.height = result.height;
    context.save(); context.textBaseline = 'top';
    for (const line of result.lines) {
      context.font = fontString(line.style); context.fillStyle = line.style.color;
      context.fillText(line.text, box.x + 8, box.y + line.y);
    }
    context.restore();
  }
  function init(state, { changed, nextId, remove }) {
    const el = id => document.getElementById(id);
    const content = el('text-content'), selection = el('text-selection'), status = el('text-status');
    let editingId = null, signature = '', revision = 0;
    const current = () => state.overlays.find(o => o.id === state.selectedId && o.type === 'text');
    async function loadFonts() {
      const version = ++revision;
      state.textReady = false; changed();
      try {
        await Promise.all(['header', 'body'].map(kind => document.fonts.load(fontString(state.textStyles[kind]))));
        await Promise.all(['header', 'body'].map(kind => document.fonts.load(`${state.textStyles[kind].weight} ${state.textStyles[kind].size}px "Noto Sans Tamil"`, 'தமிழ்')));
      } catch { status.textContent = 'A font could not load. Your browser will use a fallback font.'; }
      finally { if (version === revision) { state.textReady = true; changed(); } }
    }
    function sync() {
      const boxes = state.overlays.filter(o => o.type === 'text');
      el('text-add').disabled = !state.bgImage || !state.textReady;
      const key = JSON.stringify(boxes.map(o => [o.id, o.text.split('\n')[0]]));
      if (key !== signature) {
        signature = key;
        selection.replaceChildren(new Option(boxes.length ? 'Select a text box' : 'No text boxes yet', ''));
        boxes.forEach((o, i) => selection.add(new Option(o.text.split('\n')[0].slice(0, 50) || `Text box ${i + 1}`, o.id)));
      }
      const box = current();
      selection.value = box?.id || ''; el('text-editor').hidden = !box;
      if (box && editingId !== box.id) content.value = box.text;
      editingId = box?.id || null;
      for (const prop of ['x', 'y', 'width']) if (box && document.activeElement !== el(`text-${prop}`)) el(`text-${prop}`).value = Math.round(box[prop]);
      for (const kind of ['header', 'body']) for (const prop of ['font', 'size', 'weight', 'color']) {
        const input = el(`text-${kind}-${prop}`);
        if (document.activeElement !== input) input.value = state.textStyles[kind][prop];
      }
      if (!state.bgImage) status.textContent = 'Upload a background or start a blank canvas first.';
      else if (!state.textReady) status.textContent = 'Loading text fonts…';
      else if (boxes.some(o => o.y < 0 || o.x < 0 || o.x + o.width > state.width || o.y + o.height > state.height)) status.textContent = 'A text box extends outside the canvas. Move it, widen it, or reduce the shared font size before exporting.';
      else status.textContent = boxes.length ? `${boxes.length} text box${boxes.length === 1 ? '' : 'es'} · Style changes apply to all boxes.` : 'Your background is ready. Add a text box to begin.';
    }
    el('text-add').addEventListener('click', () => {
      if (!state.bgImage) return;
      const width = Math.max(48, Math.round(state.width * .65));
      const box = { id: nextId(), type: 'text', text: '', x: Math.round((state.width - width) / 2), y: Math.round(state.height * .15), width, height: 84 };
      state.overlays.push(box); state.selectedId = box.id; changed(); content.focus();
    });
    selection.addEventListener('change', () => { state.selectedId = selection.value || null; changed(); });
    content.addEventListener('input', () => { const box = current(); if (box) { box.text = content.value; changed(); } });
    content.maxLength = 20000;
    el('text-delete').addEventListener('click', remove);
    for (const prop of ['x', 'y', 'width']) el(`text-${prop}`).addEventListener('input', event => {
      const input = event.target, box = current();
      if (box && input.value !== '' && input.checkValidity() && Number.isFinite(input.valueAsNumber)) { box[prop] = input.valueAsNumber; changed(); }
    });
    for (const kind of ['header', 'body']) for (const prop of ['font', 'size', 'weight', 'color']) {
      el(`text-${kind}-${prop}`).addEventListener('input', event => {
        const input = event.target; if (!input.checkValidity()) return;
        state.textStyles[kind][prop] = ['size', 'weight'].includes(prop) ? Number(input.value) : input.value;
        if (prop === 'font' || prop === 'weight') loadFonts(); else changed();
      });
    }
    content.addEventListener('paste', event => {
      const html = event.clipboardData.getData('text/html');
      if (!html || state.textStyles.imported) return;
      // Parse clipboard markup inertly. Never insert it into the page or load its resources.
      const template = document.createElement('template');
      template.innerHTML = html;
      const walker = document.createTreeWalker(template.content, NodeFilter.SHOW_TEXT);
      const families = []; let node;
      while ((node = walker.nextNode())) {
        if (!node.textContent.trim() || node.parentElement?.closest('script,style')) continue;
        let parent = node.parentElement, family = '';
        while (parent && !family) { family = parent.style?.fontFamily || parent.getAttribute('face') || ''; parent = parent.parentElement; }
        families.push(family);
      }
      let detected = false;
      for (const [kind, family] of [['header', families[0]], ['body', families.find((f, i) => i > 0 && f) || families[0]]]) {
        const match = (family || '').split(',').map(f => f.trim().replace(/^['"]|['"]$/g, '')).find(f => fonts.includes(f));
        if (match) { state.textStyles[kind].font = match; detected = true; }
      }
      if (detected) { state.textStyles.imported = true; loadFonts(); el('text-paste-hint').textContent = 'Shared fonts imported from your formatted paste. You can change them below.'; }
      else el('text-paste-hint').textContent = 'No supported font was included in this paste. Your selected fonts are unchanged; choose a font below.';
    });
    return { sync, loadFonts };
  }
  window.ComposerText = { defaults, normalize, draw, init };
})();
