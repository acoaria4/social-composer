(() => {
  "use strict";

  // All built-in artwork is owned by this folder and comes from the current site identity.
  const BRANDS = [
    ["expenses", "expenses"], ["aura", "aura"],
    ["lumen", "lumen"], ["glitchlabs", "glitch"],
  ].map(([id, group]) => ({
    group, container: `assets-${group}`,
    assets: [
      ["icon", "App icon"], ["mark", id === "lumen" ? "Gold spark" : "Transparent mark"],
      ["wordmark-light", "Wordmark · light"], ["wordmark-dark", "Wordmark · dark"],
      ["lockup-light", "Icon + name · light"], ["lockup-dark", "Icon + name · dark"],
    ].map(([variant, label]) => ({id: `${id}-${variant}`, label, src: `brands/current/${id}-${variant}.png`})),
  }));
  // Keep saved layouts usable, but resolve their old identifiers to current artwork.
  const LEGACY_ASSETS = {
    "expenses-champagne-on-obsidian": "expenses-icon",
    "expenses-squircle": "expenses-icon",
    "expenses-icon-darker": "expenses-mark",
    "expenses-wordmark": "expenses-wordmark-light",
    "expenses-icon-wordmark": "expenses-lockup-light",
    "glitchlabs-logo": "glitchlabs-icon",
    "glitchlabs-logo-wordmark": "glitchlabs-lockup-light",
  };

  const PRESETS = {
    native: null,
    "1080x1350": { w: 1080, h: 1350, slug: "1080x1350" },
    "1080x1080": { w: 1080, h: 1080, slug: "1080x1080" },
    "1080x1920": { w: 1080, h: 1920, slug: "1080x1920" },
    "1200x630": { w: 1200, h: 630, slug: "1200x630" },
    "1600x900": { w: 1600, h: 900, slug: "1600x900" },
  };

  const HANDLE_SIZE = 10;
  const MIN_OVERLAY = 24;
  const GRID_SIZE = 72;
  const CUSTOM_STORAGE_KEY = "glitch-social-composer-custom-assets";
  const CUSTOM_MAX_COUNT = 12;
  const CUSTOM_MAX_BYTES = 2 * 1024 * 1024;
  const CREATED_STORAGE_KEY = "glitch-social-composer-created-pics";
  const CREATED_MAX_COUNT = 12;
  const CREATED_MAX_BYTES = 2 * 1024 * 1024;
  const GRID_STORAGE_KEY = "glitch-social-composer-show-grid";
  const GRID_INVERT_STORAGE_KEY = "glitch-social-composer-grid-invert";
  const CREATED_PANE_STORAGE_KEY = "glitch-social-composer-created-pane-open";
  const TINT_STORAGE_KEY = "glitch-social-composer-tint-hex";
  const CUSTOM_COLOR_ID = "expenses-custom-color";
  const TINT_SOURCE_ID = "expenses-mark";
  const DEFAULT_TINT_HEX = "#d9b793";

  const els = {
    canvas: document.getElementById("stage-canvas"),
    stage: document.getElementById("stage-drop"),
    empty: document.getElementById("empty-state"),
    selection: document.getElementById("selection-box"),
    bgInput: document.getElementById("bg-input"),
    customInput: document.getElementById("custom-asset-input"),
    customGrid: document.getElementById("assets-custom"),
    customEmpty: document.getElementById("custom-empty"),
    createdPane: document.getElementById("pane-created"),
    createdToggle: document.getElementById("btn-created-toggle"),
    createdGrid: document.getElementById("assets-created"),
    createdEmpty: document.getElementById("created-empty"),
    tintHex: document.getElementById("tint-hex"),
    tintR: document.getElementById("tint-r"),
    tintG: document.getElementById("tint-g"),
    tintB: document.getElementById("tint-b"),
    tintRVal: document.getElementById("tint-r-val"),
    tintGVal: document.getElementById("tint-g-val"),
    tintBVal: document.getElementById("tint-b-val"),
    tintSwatch: document.getElementById("tint-swatch"),
    tintInsert: document.getElementById("tint-insert"),
    tintReset: document.getElementById("tint-reset"),
    tintPanel: document.getElementById("tint-panel"),
    preset: document.getElementById("preset-select"),
    download: document.getElementById("btn-download"),
    save: document.getElementById("btn-save"),
    clear: document.getElementById("btn-clear"),
    reset: document.getElementById("btn-reset"),
    gridToggle: document.getElementById("btn-grid"),
    gridInvert: document.getElementById("btn-grid-invert"),
    meta: document.getElementById("meta"),
  };

  const BUILTIN_ASSET_IDS = new Set(
    BRANDS.flatMap((g) => g.assets.map((a) => a.id))
  );

  const ctx = els.canvas.getContext("2d");

  /** @type {Map<string, HTMLImageElement>} */
  const assetImages = new Map();

  const state = {
    /** @type {HTMLImageElement | null} */
    bgImage: null,
    postDate: null,
    templateBrand: null,
    /** canvas pixel size (export space) */
    width: 0,
    height: 0,
    /** CSS display scale: screen px / canvas px */
    viewScale: 1,
    /** offset of canvas element within stage (for selection box) */
    canvasOffset: { x: 0, y: 0 },
    /** @type {Array<{id:string, assetId:string, x:number, y:number, width:number, height:number}>} */
    overlays: [],
    textStyles: window.ComposerText.defaults(),
    textReady: true,
    selectedId: null,
    presetKey: "native",
    interaction: null,
    /** @type {Array<{id:string, label:string, dataUrl:string}>} */
    customAssets: [],
    /** @type {Array<{id:string, label:string, thumbDataUrl:string, width:number, height:number, createdAt:number, composition:object}>} */
    createdPics: [],
    showGrid: true,
    gridInvert: false,
    createdPaneOpen: false,
    tintHex: DEFAULT_TINT_HEX,
    tintPanelOpen: false,
  };

  let textTools;
  let viewport;
  let lumenFormat = "1080x1920";
  const lumenActive = () => document.querySelector('[data-brand="lumen"]').getAttribute("aria-pressed") === "true";
  let idSeq = 1;
  let customSeq = 1;
  let createdSeq = 1;

  function nextId() {
    return `ov-${idSeq++}`;
  }

  function snap(v) {
    return Math.round(v / GRID_SIZE) * GRID_SIZE;
  }

  function snapCoord(v) {
    return state.showGrid ? snap(v) : Math.round(v);
  }

  function loadShowGrid() {
    try {
      const raw = localStorage.getItem(GRID_STORAGE_KEY);
      if (raw === null) return true;
      return raw === "1" || raw === "true";
    } catch {
      return true;
    }
  }

  function saveShowGrid() {
    try {
      localStorage.setItem(GRID_STORAGE_KEY, state.showGrid ? "1" : "0");
    } catch {
      /* ignore */
    }
  }

  function loadGridInvert() {
    try {
      const raw = localStorage.getItem(GRID_INVERT_STORAGE_KEY);
      return raw === "1" || raw === "true";
    } catch {
      return false;
    }
  }

  function saveGridInvert() {
    try {
      localStorage.setItem(GRID_INVERT_STORAGE_KEY, state.gridInvert ? "1" : "0");
    } catch {
      /* ignore */
    }
  }

  function loadCreatedPaneOpen() {
    try {
      const raw = localStorage.getItem(CREATED_PANE_STORAGE_KEY);
      return raw === "1" || raw === "true";
    } catch {
      return false;
    }
  }

  function saveCreatedPaneOpen() {
    try {
      localStorage.setItem(
        CREATED_PANE_STORAGE_KEY,
        state.createdPaneOpen ? "1" : "0"
      );
    } catch {
      /* ignore */
    }
  }

  function syncGridToggle() {
    if (!els.gridToggle) return;
    els.gridToggle.setAttribute("aria-pressed", state.showGrid ? "true" : "false");
  }

  function syncGridInvert() {
    if (!els.gridInvert) return;
    els.gridInvert.setAttribute(
      "aria-pressed",
      state.gridInvert ? "true" : "false"
    );
    els.gridInvert.title = state.gridInvert
      ? "Gridlines: black (click for white)"
      : "Gridlines: white (click for black)";
  }

  function syncCreatedPane() {
    if (!els.createdPane || !els.createdToggle) return;
    els.createdPane.classList.toggle("is-collapsed", !state.createdPaneOpen);
    els.createdPane.hidden = !state.createdPaneOpen;
    els.createdToggle.setAttribute(
      "aria-expanded",
      state.createdPaneOpen ? "true" : "false"
    );
    els.createdToggle.title = state.createdPaneOpen
      ? "Close saved designs"
      : "Open saved designs";
  }

  function drawGrid() {
    if (!state.showGrid || !state.width || !state.height) return;
    ctx.save();
    ctx.strokeStyle = state.gridInvert
      ? "rgba(0, 0, 0, 0.55)"
      : "rgba(255, 255, 255, 0.55)";
    ctx.lineWidth = 2;
    ctx.beginPath();
    for (let x = GRID_SIZE; x < state.width; x += GRID_SIZE) {
      ctx.moveTo(x, 0);
      ctx.lineTo(x, state.height);
    }
    for (let y = GRID_SIZE; y < state.height; y += GRID_SIZE) {
      ctx.moveTo(0, y);
      ctx.lineTo(state.width, y);
    }
    ctx.stroke();
    ctx.restore();
  }

  function currentPreset() {
    return PRESETS[state.presetKey] || null;
  }

  function coverRect(srcW, srcH, destW, destH) {
    const scale = Math.max(destW / srcW, destH / srcH);
    const w = srcW * scale;
    const h = srcH * scale;
    return {
      x: (destW - w) / 2,
      y: (destH - h) / 2,
      w,
      h,
    };
  }

  function recomputeCanvasSize() {
    if (!state.bgImage) {
      state.width = 0;
      state.height = 0;
      return;
    }
    const preset = currentPreset();
    if (preset) {
      state.width = preset.w;
      state.height = preset.h;
    } else {
      state.width = state.bgImage.naturalWidth;
      state.height = state.bgImage.naturalHeight;
    }
  }

  function updateViewMetrics() {
    const rect = els.canvas.getBoundingClientRect();
    const stageRect = els.stage.getBoundingClientRect();
    state.viewScale =
      state.width > 0 ? rect.width / state.width : 1;
    state.canvasOffset = {
      x: rect.left - stageRect.left - els.stage.clientLeft,
      y: rect.top - stageRect.top - els.stage.clientTop,
    };
  }

  function fitCanvasElement() {
    if (!state.width || !state.height) {
      els.canvas.width = 0;
      els.canvas.height = 0;
      els.canvas.style.width = "0";
      els.canvas.style.height = "0";
      viewport?.refresh();
      return;
    }
    if (els.canvas.width !== state.width) els.canvas.width = state.width;
    if (els.canvas.height !== state.height) els.canvas.height = state.height;

    viewport?.refresh();
    updateViewMetrics();
  }

  function draw() {
    if (!state.bgImage || !state.width) {
      ctx.clearRect(0, 0, els.canvas.width, els.canvas.height);
      syncSelectionBox();
      updateChrome();
      return;
    }

    ctx.clearRect(0, 0, state.width, state.height);
    const cover = coverRect(
      state.bgImage.naturalWidth,
      state.bgImage.naturalHeight,
      state.width,
      state.height
    );
    ctx.drawImage(state.bgImage, cover.x, cover.y, cover.w, cover.h);

    drawGrid();

    for (const ov of state.overlays) {
      if (ov.type === "text") { window.ComposerText.draw(ctx, ov, state.textStyles); continue; }
      const img = assetImages.get(ov.assetId);
      if (!img) continue;
      ctx.drawImage(img, ov.x, ov.y, ov.width, ov.height);
    }

    syncSelectionBox();
    updateChrome();
  }

  function selectedOverlay() {
    return state.overlays.find((o) => o.id === state.selectedId) || null;
  }

  function syncSelectionBox() {
    const ov = selectedOverlay();
    if (!ov || !state.bgImage) {
      els.selection.hidden = true;
      return;
    }
    updateViewMetrics();
    const s = state.viewScale;
    const left = state.canvasOffset.x + ov.x * s;
    const top = state.canvasOffset.y + ov.y * s;
    const w = ov.width * s;
    const h = ov.height * s;
    els.selection.hidden = false;
    els.selection.style.left = `${left}px`;
    els.selection.style.top = `${top}px`;
    els.selection.style.width = `${w}px`;
    els.selection.style.height = `${h}px`;
  }

  function updateChrome() {
    const hasBg = Boolean(state.bgImage);
    els.empty.hidden = hasBg;
    const lumenPost = hasBg && state.templateBrand === "lumen";
    els.preset.disabled = false;
    const lumenLayout = lumenPost || (lumenActive() && !hasBg);
    els.preset.querySelector('option[value="native"]').disabled = lumenLayout;
    document.getElementById("lumen-format-guidance").hidden = !lumenLayout;
    textTools?.sync();
    const textOutside = state.overlays.some(o => o.type === "text" && (o.x < 0 || o.y < 0 || o.x + o.width > state.width || o.y + o.height > state.height));
    els.download.disabled = !hasBg || !state.textReady || textOutside;
    if (els.save) els.save.disabled = !hasBg || !state.textReady;
    els.clear.disabled = !hasBg || state.overlays.length === 0;
    els.reset.disabled = !hasBg;

    if (!hasBg) {
      els.meta.textContent = "";
      return;
    }
    const preset = currentPreset();
    const mode = preset
      ? `preset ${preset.w}×${preset.h}`
      : `native ${state.bgImage.naturalWidth}×${state.bgImage.naturalHeight}`;
    const marks =
      state.overlays.length === 0
        ? "no marks"
        : `${state.overlays.filter(o => o.type !== "text").length} marks · ${state.overlays.filter(o => o.type === "text").length} text boxes`;
    els.meta.textContent = textOutside ? "Text extends outside the canvas. Adjust the boxes in Text to enable PNG export." : `${mode} · export ${state.width}×${state.height} · ${marks}`;
  }

  function resetSession() {
    state.bgImage = null;
    state.postDate = null;
    state.templateBrand = null;
    state.overlays = [];
    state.selectedId = null;
    state.width = 0;
    state.height = 0;
    if (els.bgInput) els.bgInput.value = "";
    fitCanvasElement();
    draw();
  }

  function loadImageFromFile(file) {
    return new Promise((resolve, reject) => {
      const url = URL.createObjectURL(file);
      const img = new Image();
      img.onload = () => {
        URL.revokeObjectURL(url);
        resolve(img);
      };
      img.onerror = () => {
        URL.revokeObjectURL(url);
        reject(new Error("Failed to load image"));
      };
      img.src = url;
    });
  }

  function loadImageUrl(src) {
    return new Promise((resolve, reject) => {
      const img = new Image();
      img.onload = () => resolve(img);
      img.onerror = () => reject(new Error(`Failed to load ${src}`));
      img.src = src;
    });
  }

  async function setBackground(file, beforeApply = () => true) {
    const img = await loadImageFromFile(file);
    if (!beforeApply()) return false;
    state.bgImage = img;
    state.postDate = null;
    state.templateBrand = null;
    state.overlays = [];
    state.selectedId = null;
    recomputeCanvasSize();
    viewport?.reset();
    fitCanvasElement();
    draw();
    return true;
  }

  function defaultOverlaySize(assetId) {
    const img = assetImages.get(assetId);
    if (!img || !state.width) {
      return { width: 200, height: 200 };
    }
    const nw = img.naturalWidth || img.width;
    const nh = img.naturalHeight || img.height;
    if (!nw || !nh) {
      return { width: 200, height: 200 };
    }
    const maxDim = Math.min(state.width, state.height) * 0.35;
    const scale = Math.min(maxDim / nw, maxDim / nh, 1);
    return {
      width: Math.round(nw * scale),
      height: Math.round(nh * scale),
    };
  }

  function addOverlay(assetId, canvasX, canvasY) {
    if (!state.bgImage) return;
    const size = defaultOverlaySize(assetId);
    const x =
      canvasX == null
        ? snapCoord((state.width - size.width) / 2)
        : snapCoord(canvasX - size.width / 2);
    const y =
      canvasY == null
        ? snapCoord((state.height - size.height) / 2)
        : snapCoord(canvasY - size.height / 2);

    const ov = {
      id: nextId(),
      assetId,
      x,
      y,
      width: size.width,
      height: size.height,
    };
    state.overlays.push(ov);
    state.selectedId = ov.id;
    draw();
  }

  function hitTest(cx, cy) {
    for (let i = state.overlays.length - 1; i >= 0; i--) {
      const o = state.overlays[i];
      if (
        cx >= o.x &&
        cy >= o.y &&
        cx <= o.x + o.width &&
        cy <= o.y + o.height
      ) {
        return o;
      }
    }
    return null;
  }

  function clientToCanvas(clientX, clientY) {
    const rect = els.canvas.getBoundingClientRect();
    return {
      x: (clientX - rect.left) / state.viewScale,
      y: (clientY - rect.top) / state.viewScale,
    };
  }

  function bringToFront(id) {
    const idx = state.overlays.findIndex((o) => o.id === id);
    if (idx < 0) return;
    const [ov] = state.overlays.splice(idx, 1);
    state.overlays.push(ov);
  }

  function deleteSelected() {
    if (!state.selectedId) return;
    state.overlays = state.overlays.filter((o) => o.id !== state.selectedId);
    state.selectedId = null;
    draw();
  }

  function startMove(ov, cx, cy) {
    if (ov.type === "text") selectEditorTab(document.getElementById("tab-text"));
    bringToFront(ov.id);
    state.selectedId = ov.id;
    state.interaction = {
      type: "move",
      id: ov.id,
      startX: cx,
      startY: cy,
      origX: ov.x,
      origY: ov.y,
    };
    draw();
  }

  function startScale(ov, handle, cx, cy) {
    bringToFront(ov.id);
    state.selectedId = ov.id;
    state.interaction = {
      type: "scale",
      id: ov.id,
      handle,
      startX: cx,
      startY: cy,
      origX: ov.x,
      origY: ov.y,
      origW: ov.width,
      origH: ov.height,
      aspect: ov.width / Math.max(ov.height, 1),
    };
    draw();
  }

  function applyInteraction(cx, cy) {
    const it = state.interaction;
    if (!it) return;
    const ov = state.overlays.find((o) => o.id === it.id);
    if (!ov) return;

    if (it.type === "move") {
      ov.x = snapCoord(it.origX + (cx - it.startX));
      ov.y = snapCoord(it.origY + (cy - it.startY));
    } else if (it.type === "scale") {
      const dx = cx - it.startX;
      const dy = cy - it.startY;
      let x = it.origX;
      let y = it.origY;
      let w = it.origW;
      let h = it.origH;
      if (ov.type === "text") {
        const left = it.handle.endsWith("w");
        ov.width = Math.max(48, Math.round(it.origW + (left ? -dx : dx)));
        if (left) ov.x = Math.round(it.origX + it.origW - ov.width);
        draw();
        return;
      }
      const aspect = it.aspect;

      switch (it.handle) {
        case "se": {
          w = it.origW + dx;
          h = w / aspect;
          break;
        }
        case "sw": {
          w = it.origW - dx;
          h = w / aspect;
          x = it.origX + it.origW - w;
          break;
        }
        case "ne": {
          w = it.origW + dx;
          h = w / aspect;
          y = it.origY + it.origH - h;
          break;
        }
        case "nw": {
          w = it.origW - dx;
          h = w / aspect;
          x = it.origX + it.origW - w;
          y = it.origY + it.origH - h;
          break;
        }
      }

      if (w < MIN_OVERLAY) {
        w = MIN_OVERLAY;
        h = w / aspect;
        if (it.handle === "nw" || it.handle === "sw") {
          x = it.origX + it.origW - w;
        }
        if (it.handle === "nw" || it.handle === "ne") {
          y = it.origY + it.origH - h;
        }
      }

      ov.x = Math.round(x);
      ov.y = Math.round(y);
      ov.width = Math.round(w);
      ov.height = Math.round(h);
    }

    draw();
  }

  function endInteraction() {
    state.interaction = null;
  }

  function renderExportCanvas() {
    const out = document.createElement("canvas");
    out.width = state.width;
    out.height = state.height;
    const c = out.getContext("2d");
    const cover = coverRect(
      state.bgImage.naturalWidth,
      state.bgImage.naturalHeight,
      state.width,
      state.height
    );
    c.drawImage(state.bgImage, cover.x, cover.y, cover.w, cover.h);
    for (const ov of state.overlays) {
      if (ov.type === "text") { window.ComposerText.draw(c, ov, state.textStyles); continue; }
      const img = assetImages.get(ov.assetId);
      if (!img) continue;
      c.drawImage(img, ov.x, ov.y, ov.width, ov.height);
    }
    return out;
  }

  function downloadPng() {
    if (!state.bgImage) return;
    const out = renderExportCanvas();
    const preset = currentPreset();
    const slug = preset ? preset.slug : "native";
    const filename = state.postDate
      ? `aura-daily-horoscope-${state.postDate}-${state.width}x${state.height}.png`
      : state.templateBrand === "lumen" ? `lumen-fact-${state.width}x${state.height}.png`
      : `glitch-compose-${slug}-${state.width}x${state.height}.png`;
    out.toBlob((blob) => {
      if (!blob) return;
      const a = document.createElement("a");
      a.href = URL.createObjectURL(blob);
      a.download = filename;
      a.click();
      URL.revokeObjectURL(a.href);
    }, "image/png");
  }

  function sourceToDataUrl(source, type = "image/png", quality) {
    const w = source.naturalWidth || source.width;
    const h = source.naturalHeight || source.height;
    if (!w || !h) throw new Error("Invalid image source");
    const c = document.createElement("canvas");
    c.width = w;
    c.height = h;
    c.getContext("2d").drawImage(source, 0, 0);
    return quality != null ? c.toDataURL(type, quality) : c.toDataURL(type);
  }

  function makeThumbDataUrl() {
    const out = renderExportCanvas();
    const maxEdge = 320;
    const scale = Math.min(1, maxEdge / Math.max(out.width, out.height));
    const tw = Math.max(1, Math.round(out.width * scale));
    const th = Math.max(1, Math.round(out.height * scale));
    const t = document.createElement("canvas");
    t.width = tw;
    t.height = th;
    t.getContext("2d").drawImage(out, 0, 0, tw, th);
    return t.toDataURL("image/jpeg", 0.82);
  }

  function needsAssetSnapshot(assetId) {
    return assetId === CUSTOM_COLOR_ID || !BUILTIN_ASSET_IDS.has(assetId);
  }

  function collectAssetDataUrls() {
    /** @type {Record<string, string>} */
    const assetDataUrls = {};
    const needed = new Set(
      state.overlays.map((o) => o.assetId).filter(needsAssetSnapshot)
    );
    for (const assetId of needed) {
      const custom = state.customAssets.find((a) => a.id === assetId);
      if (custom?.dataUrl) {
        assetDataUrls[assetId] = custom.dataUrl;
        continue;
      }
      const img = assetImages.get(assetId);
      if (!img) continue;
      try {
        assetDataUrls[assetId] = sourceToDataUrl(img, "image/png");
      } catch {
        /* skip broken */
      }
    }
    return assetDataUrls;
  }

  function entryEncodedBytes(entry) {
    let n = (entry.thumbDataUrl?.length || 0) + (entry.label?.length || 0);
    const c = entry.composition;
    if (!c) return n;
    n += c.bgDataUrl?.length || 0;
    n += c.presetKey?.length || 0;
    n += c.tintHex?.length || 0;
    n += JSON.stringify(c.textStyles || {}).length;
    for (const url of Object.values(c.assetDataUrls || {})) {
      n += url?.length || 0;
    }
    for (const ov of c.overlays || []) {
      n += 64 + (ov.text?.length || 0);
    }
    return n;
  }

  function createdEncodedBytes() {
    return state.createdPics.reduce((sum, a) => sum + entryEncodedBytes(a), 0);
  }

  function saveCreatedPics() {
    try {
      localStorage.setItem(CREATED_STORAGE_KEY, JSON.stringify(state.createdPics));
    } catch (err) {
      els.meta.textContent = "Could not save created pics in this browser";
    }
  }

  function isValidComposition(c) {
    return (
      c &&
      typeof c === "object" &&
      typeof c.bgDataUrl === "string" &&
      c.bgDataUrl.startsWith("data:image/") &&
      Array.isArray(c.overlays) &&
      c.assetDataUrls &&
      typeof c.assetDataUrls === "object"
    );
  }

  function loadCreatedPicsFromStorage() {
    try {
      const raw = localStorage.getItem(CREATED_STORAGE_KEY);
      if (!raw) return [];
      const parsed = JSON.parse(raw);
      if (!Array.isArray(parsed)) return [];
      return parsed
        .filter(
          (a) =>
            a &&
            typeof a.id === "string" &&
            typeof a.label === "string" &&
            typeof a.thumbDataUrl === "string" &&
            a.thumbDataUrl.startsWith("data:image/") &&
            isValidComposition(a.composition)
        )
        .slice(0, CREATED_MAX_COUNT)
        .map((a) => ({
          id: a.id,
          label: a.label,
          thumbDataUrl: a.thumbDataUrl,
          width: Number(a.width) || 0,
          height: Number(a.height) || 0,
          createdAt: Number(a.createdAt) || Date.now(),
          composition: {
            bgDataUrl: a.composition.bgDataUrl,
            templateBrand: a.composition.templateBrand === "lumen" ? "lumen" : null,
            postDate: /^\d{4}-\d{2}-\d{2}$/.test(a.composition.postDate || "") ? a.composition.postDate : null,
            presetKey:
              typeof a.composition.presetKey === "string"
                ? a.composition.presetKey
                : "native",
            tintHex:
              typeof a.composition.tintHex === "string"
                ? a.composition.tintHex
                : DEFAULT_TINT_HEX,
            textStyles: window.ComposerText.normalize(a.composition.textStyles),
            overlays: a.composition.overlays
              .filter(
                (o) =>
                  o &&
                  (typeof o.assetId === "string" || (o.type === "text" && typeof o.text === "string")) &&
                  Number.isFinite(o.x) &&
                  Number.isFinite(o.y) &&
                  Number.isFinite(o.width) &&
                  Number.isFinite(o.height)
              )
              .map((o) => ({
                type: o.type === "text" ? "text" : undefined,
                text: o.type === "text" ? o.text.slice(0, 20000) : undefined,
                assetId: o.assetId,
                x: Number(o.x),
                y: Number(o.y),
                width: Number(o.width),
                height: Number(o.height),
              })),
            assetDataUrls: a.composition.assetDataUrls,
          },
        }));
    } catch {
      return [];
    }
  }

  function saveCompositionToLibrary() {
    if (!state.bgImage) return;

    let bgDataUrl;
    let thumbDataUrl;
    try {
      bgDataUrl = sourceToDataUrl(state.bgImage, "image/jpeg", 0.88);
      thumbDataUrl = makeThumbDataUrl();
    } catch (err) {
      els.meta.textContent = err.message || "Could not encode composition";
      return;
    }

    const preset = currentPreset();
    const slug = preset ? preset.slug : "native";
    const entry = {
      id: `created-${Date.now()}-${createdSeq++}`,
      label: `${slug} ${state.width}×${state.height}`,
      thumbDataUrl,
      width: state.width,
      height: state.height,
      createdAt: Date.now(),
      composition: {
        bgDataUrl,
        postDate: state.postDate,
        templateBrand: state.templateBrand,
        presetKey: state.presetKey || "native",
        tintHex: state.tintHex || DEFAULT_TINT_HEX,
        textStyles: window.ComposerText.normalize(state.textStyles),
        overlays: state.overlays.map((o) => ({
          type: o.type,
          text: o.text,
          assetId: o.assetId,
          x: o.x,
          y: o.y,
          width: o.width,
          height: o.height,
        })),
        assetDataUrls: collectAssetDataUrls(),
      },
    };

    const entryBytes = entryEncodedBytes(entry);
    if (entryBytes > CREATED_MAX_BYTES) {
      els.meta.textContent = "Composition too large for browser storage";
      return;
    }

    while (
      state.createdPics.length >= CREATED_MAX_COUNT ||
      createdEncodedBytes() + entryBytes > CREATED_MAX_BYTES
    ) {
      if (!state.createdPics.length) {
        els.meta.textContent = "Composition too large for browser storage";
        return;
      }
      state.createdPics.shift();
    }

    state.createdPics.push(entry);
    saveCreatedPics();
    renderCreatedPane();
    state.createdPaneOpen = true;
    saveCreatedPaneOpen();
    syncCreatedPane();
    els.meta.textContent = `Saved “${entry.label}” in this browser`;
  }

  function removeCreatedPic(id) {
    state.createdPics = state.createdPics.filter((p) => p.id !== id);
    saveCreatedPics();
    renderCreatedPane();
  }

  async function restoreComposition(pic) {
    const comp = pic?.composition;
    if (!isValidComposition(comp)) {
      els.meta.textContent = "Saved composition is incomplete";
      return;
    }

    try {
      const bg = await loadImageUrl(comp.bgDataUrl);

      for (const [assetId, dataUrl] of Object.entries(comp.assetDataUrls || {})) {
        if (typeof dataUrl !== "string" || !dataUrl.startsWith("data:image/")) {
          continue;
        }
        const img = await loadImageUrl(dataUrl);
        assetImages.set(assetId, img);

        if (assetId.startsWith("custom-")) {
          const existing = state.customAssets.find((a) => a.id === assetId);
          if (!existing) {
            state.customAssets.push({
              id: assetId,
              label: "Restored asset",
              dataUrl,
            });
          } else {
            existing.dataUrl = dataUrl;
          }
        }
      }

      if (typeof comp.tintHex === "string" && parseHex(comp.tintHex)) {
        state.tintHex = parseHex(comp.tintHex).hex;
        if (comp.assetDataUrls?.[CUSTOM_COLOR_ID]) {
          syncTintControls(state.tintHex);
          const chipImg = document.querySelector(
            `#chip-custom-color .asset-thumb img`
          );
          if (chipImg) chipImg.src = comp.assetDataUrls[CUSTOM_COLOR_ID];
        } else {
          applyTintColor(state.tintHex, { persist: false });
        }
      }

      state.bgImage = bg;
      state.postDate = comp.postDate || null;
      state.templateBrand = comp.templateBrand === "lumen" ? "lumen" : null;
      state.presetKey =
        Object.prototype.hasOwnProperty.call(PRESETS, comp.presetKey)
          ? comp.presetKey
          : "native";
      if (els.preset) els.preset.value = state.presetKey;
      if (state.templateBrand === "lumen" && Object.hasOwn(window.LumenFactTemplate.formats, state.presetKey)) lumenFormat = state.presetKey;

      state.textStyles = window.ComposerText.normalize(comp.textStyles);
      state.overlays = (comp.overlays || []).map((o) => ({
        type: o.type,
        text: o.text,
        id: nextId(),
        assetId: o.assetId,
        x: o.x,
        y: o.y,
        width: o.width,
        height: o.height,
      }));
      state.selectedId = null;
      await textTools.loadFonts();

      recomputeCanvasSize();
      viewport?.reset();
      fitCanvasElement();
      saveCustomAssets();
      renderCustomPane();
      draw();
      els.meta.textContent = `Restored “${pic.label}”`;
    } catch (err) {
      els.meta.textContent = err.message || "Could not restore composition";
    }
  }

  function renderCreatedPane() {
    if (!els.createdGrid) return;
    els.createdGrid.replaceChildren();
    for (const pic of [...state.createdPics].reverse()) {
      const btn = document.createElement("button");
      btn.type = "button";
      btn.className = "asset-chip";
      btn.title = `Restore ${pic.label}`;
      btn.innerHTML = `
        <span class="asset-thumb"><img alt="" /></span>
        <span class="asset-label"></span>
      `;
      btn.querySelector("img").src = pic.thumbDataUrl;
      btn.querySelector(".asset-label").textContent = pic.label;

      const remove = document.createElement("button");
      remove.type = "button";
      remove.className = "asset-chip-remove";
      remove.title = "Remove from library";
      remove.setAttribute("aria-label", `Remove ${pic.label}`);
      remove.textContent = "×";
      remove.addEventListener("click", (e) => {
        e.preventDefault();
        e.stopPropagation();
        removeCreatedPic(pic.id);
      });
      btn.appendChild(remove);

      btn.addEventListener("click", () => {
        restoreComposition(pic);
      });
      els.createdGrid.appendChild(btn);
    }
    if (els.createdEmpty) {
      els.createdEmpty.hidden = state.createdPics.length > 0;
    }
  }

  function bootCreatedPics() {
    const stored = loadCreatedPicsFromStorage();
    state.createdPics = stored;
    try {
      const raw = localStorage.getItem(CREATED_STORAGE_KEY);
      const previous = raw ? JSON.parse(raw) : [];
      if (Array.isArray(previous) && previous.length !== stored.length) {
        saveCreatedPics();
      }
    } catch {
      saveCreatedPics();
    }
    renderCreatedPane();
  }

  function buildAssetChip(asset, { removable = false } = {}) {
    const btn = document.createElement("button");
    btn.type = "button";
    btn.className = "asset-chip";
    btn.draggable = true;
    btn.dataset.assetId = asset.id;
    btn.title = `Add ${asset.label}`;
    btn.innerHTML = `
      <span class="asset-thumb"><img alt="" src="${asset.src}" /></span>
      <span class="asset-label"></span>
    `;
    btn.querySelector(".asset-label").textContent = asset.label;

    if (removable) {
      const remove = document.createElement("button");
      remove.type = "button";
      remove.className = "asset-chip-remove";
      remove.title = `Remove ${asset.label}`;
      remove.setAttribute("aria-label", `Remove ${asset.label}`);
      remove.textContent = "×";
      remove.addEventListener("click", (e) => {
        e.preventDefault();
        e.stopPropagation();
        removeCustomAsset(asset.id);
      });
      btn.appendChild(remove);
    }

    btn.addEventListener("dragstart", (e) => {
      e.dataTransfer.setData("application/x-brand-asset", asset.id);
      e.dataTransfer.setData("text/plain", asset.id);
      e.dataTransfer.effectAllowed = "copy";
    });

    btn.addEventListener("click", (e) => {
      if (e.target.closest(".asset-chip-remove")) return;

      if (asset.id === CUSTOM_COLOR_ID) {
        if (!state.tintPanelOpen) {
          openTintPanel();
          return;
        }
        if (!state.bgImage) {
          els.meta.textContent = "Upload a background first";
          return;
        }
        addOverlay(asset.id);
        return;
      }

      closeTintPanel();
      if (!state.bgImage) {
        els.meta.textContent = "Upload a background first";
        return;
      }
      addOverlay(asset.id);
    });

    return btn;
  }

  function tintPreviewSrc() {
    const tinted = assetImages.get(CUSTOM_COLOR_ID);
    if (tinted instanceof HTMLCanvasElement) {
      try {
        return tinted.toDataURL("image/png");
      } catch {
        return "brands/expenses-icon-darker.png";
      }
    }
    if (tinted && tinted.src) return tinted.src;
    return "brands/expenses-icon-darker.png";
  }

  function openTintPanel() {
    state.tintPanelOpen = true;
    if (els.tintPanel) els.tintPanel.hidden = false;
    const chip = document.getElementById("chip-custom-color");
    if (chip) chip.classList.add("is-selected");
    applyTintColor(state.tintHex || loadStoredTintHex(), { persist: false });
  }

  function closeTintPanel() {
    state.tintPanelOpen = false;
    if (els.tintPanel) els.tintPanel.hidden = true;
    const chip = document.getElementById("chip-custom-color");
    if (chip) chip.classList.remove("is-selected");
  }

  function buildAssetPane() {
    for (const group of BRANDS) {
      const root = document.getElementById(group.container);
      if (!root) continue;
      root.replaceChildren();
      for (const asset of group.assets) {
        const chip = buildAssetChip(asset);
        chip.disabled = !assetImages.has(asset.id);
        if (chip.disabled) chip.title = `${asset.label} could not load. Reload to retry.`;
        root.appendChild(chip);
      }
      if (group.group === "expenses") {
        const chip = buildAssetChip({
          id: CUSTOM_COLOR_ID,
          label: "Custom Color",
          src: tintPreviewSrc(),
        });
        chip.id = "chip-custom-color";
        if (state.tintPanelOpen) chip.classList.add("is-selected");
        root.appendChild(chip);
      }
    }
  }

  function clampByte(n) {
    return Math.max(0, Math.min(255, Math.round(Number(n) || 0)));
  }

  function rgbToHex(r, g, b) {
    return (
      "#" +
      [r, g, b]
        .map((v) => clampByte(v).toString(16).padStart(2, "0"))
        .join("")
    );
  }

  function parseHex(raw) {
    const s = String(raw || "")
      .trim()
      .replace(/^#/, "");
    if (/^[0-9a-fA-F]{6}$/.test(s)) {
      return {
        hex: `#${s.toLowerCase()}`,
        r: parseInt(s.slice(0, 2), 16),
        g: parseInt(s.slice(2, 4), 16),
        b: parseInt(s.slice(4, 6), 16),
      };
    }
    if (/^[0-9a-fA-F]{3}$/.test(s)) {
      const r = parseInt(s[0] + s[0], 16);
      const g = parseInt(s[1] + s[1], 16);
      const b = parseInt(s[2] + s[2], 16);
      return { hex: rgbToHex(r, g, b), r, g, b };
    }
    return null;
  }

  function loadStoredTintHex() {
    try {
      const raw = localStorage.getItem(TINT_STORAGE_KEY);
      const parsed = parseHex(raw || "");
      return parsed ? parsed.hex : DEFAULT_TINT_HEX;
    } catch {
      return DEFAULT_TINT_HEX;
    }
  }

  function saveTintHex(hex) {
    try {
      localStorage.setItem(TINT_STORAGE_KEY, hex);
    } catch {
      // ignore quota
    }
  }

  function syncTintControls(hex, { fromHexInput = false } = {}) {
    const parsed = parseHex(hex);
    if (!parsed) return null;
    state.tintHex = parsed.hex;
    if (els.tintHex && !fromHexInput) els.tintHex.value = parsed.hex;
    if (els.tintR) els.tintR.value = String(parsed.r);
    if (els.tintG) els.tintG.value = String(parsed.g);
    if (els.tintB) els.tintB.value = String(parsed.b);
    if (els.tintRVal) els.tintRVal.textContent = String(parsed.r);
    if (els.tintGVal) els.tintGVal.textContent = String(parsed.g);
    if (els.tintBVal) els.tintBVal.textContent = String(parsed.b);
    if (els.tintSwatch) els.tintSwatch.style.background = parsed.hex;
    return parsed;
  }

  function tintSourceImageLuminance(sourceImg, r, g, b) {
    const w = sourceImg.naturalWidth || sourceImg.width;
    const h = sourceImg.naturalHeight || sourceImg.height;
    const canvas = document.createElement("canvas");
    canvas.width = w;
    canvas.height = h;
    const c = canvas.getContext("2d", { willReadFrequently: true });
    c.drawImage(sourceImg, 0, 0);
    const imageData = c.getImageData(0, 0, w, h);
    const data = imageData.data;
    for (let i = 0; i < data.length; i += 4) {
      const a = data[i + 3];
      if (a === 0) continue;
      const L =
        0.2126 * data[i] + 0.7152 * data[i + 1] + 0.0722 * data[i + 2];
      const t = L / 255;
      data[i] = Math.round(r * t);
      data[i + 1] = Math.round(g * t);
      data[i + 2] = Math.round(b * t);
    }
    c.putImageData(imageData, 0, 0);
    return canvas;
  }

  function tintSourceImageMultiply(sourceImg, r, g, b) {
    const w = sourceImg.naturalWidth || sourceImg.width;
    const h = sourceImg.naturalHeight || sourceImg.height;
    const canvas = document.createElement("canvas");
    canvas.width = w;
    canvas.height = h;
    const c = canvas.getContext("2d");
    c.drawImage(sourceImg, 0, 0);
    c.globalCompositeOperation = "multiply";
    c.fillStyle = `rgb(${r},${g},${b})`;
    c.fillRect(0, 0, w, h);
    c.globalCompositeOperation = "destination-in";
    c.drawImage(sourceImg, 0, 0);
    c.globalCompositeOperation = "source-over";
    return canvas;
  }

  function tintSourceImage(sourceImg, r, g, b) {
    try {
      return tintSourceImageLuminance(sourceImg, r, g, b);
    } catch {
      return tintSourceImageMultiply(sourceImg, r, g, b);
    }
  }

  function applyTintColor(hex, { persist = true } = {}) {
    const parsed = syncTintControls(hex);
    if (!parsed) return false;
    const source = assetImages.get(TINT_SOURCE_ID);
    if (!source) {
      els.meta.textContent = "Custom Color source icon failed to load";
      return false;
    }

    let canvas;
    try {
      canvas = tintSourceImage(source, parsed.r, parsed.g, parsed.b);
    } catch (err) {
      els.meta.textContent = "Could not tint Custom Color";
      return false;
    }

    let dataUrl = "";
    try {
      dataUrl = canvas.toDataURL("image/png");
    } catch {
      els.meta.textContent = "Could not export tinted icon (try via local server)";
      return false;
    }

    assetImages.set(CUSTOM_COLOR_ID, canvas);
    const chipImg = document.querySelector(
      `#chip-custom-color .asset-thumb img`
    );
    if (chipImg) chipImg.src = dataUrl;
    if (persist) saveTintHex(parsed.hex);
    if (els.meta && /not ready|Could not tint|source icon/i.test(els.meta.textContent || "")) {
      els.meta.textContent = "";
    }
    draw();
    return true;
  }

  function insertTintAsset() {
    if (!assetImages.get(CUSTOM_COLOR_ID)) {
      const ok = applyTintColor(state.tintHex || DEFAULT_TINT_HEX, {
        persist: false,
      });
      if (!ok) {
        els.meta.textContent = "Custom Color is not ready yet";
        return;
      }
    }
    if (!state.bgImage) {
      els.meta.textContent = "Upload a background first";
      return;
    }
    addOverlay(CUSTOM_COLOR_ID);
    els.meta.textContent = `Inserted Custom Color (${state.tintHex.toUpperCase()})`;
  }

  function wireTintControls() {
    if (!els.tintHex || !els.tintR || !els.tintG || !els.tintB) return;

    const onSlider = () => {
      const hex = rgbToHex(els.tintR.value, els.tintG.value, els.tintB.value);
      applyTintColor(hex);
    };

    els.tintR.addEventListener("input", onSlider);
    els.tintG.addEventListener("input", onSlider);
    els.tintB.addEventListener("input", onSlider);

    els.tintHex.addEventListener("input", () => {
      const parsed = parseHex(els.tintHex.value);
      if (!parsed) return;
      syncTintControls(parsed.hex, { fromHexInput: true });
      applyTintColor(parsed.hex);
    });

    els.tintHex.addEventListener("change", () => {
      const parsed = parseHex(els.tintHex.value);
      if (!parsed) {
        els.tintHex.value = state.tintHex;
        return;
      }
      applyTintColor(parsed.hex);
    });

    if (els.tintInsert) {
      els.tintInsert.addEventListener("click", () => {
        insertTintAsset();
      });
    }

    if (els.tintReset) {
      els.tintReset.addEventListener("click", () => {
        applyTintColor(DEFAULT_TINT_HEX);
        els.meta.textContent = "Custom Color reset to default";
      });
    }

    const expensesGroup = els.tintPanel && els.tintPanel.closest("details");
    if (expensesGroup) {
      expensesGroup.addEventListener("toggle", () => {
        if (!expensesGroup.open) closeTintPanel();
      });
    }
  }

  function customEncodedBytes() {
    return state.customAssets.reduce((sum, a) => sum + (a.dataUrl?.length || 0), 0);
  }

  function saveCustomAssets() {
    try {
      localStorage.setItem(CUSTOM_STORAGE_KEY, JSON.stringify(state.customAssets));
    } catch (err) {
      els.meta.textContent = "Could not save custom assets in this browser";
    }
  }

  function loadCustomAssetsFromStorage() {
    try {
      const raw = localStorage.getItem(CUSTOM_STORAGE_KEY);
      if (!raw) return [];
      const parsed = JSON.parse(raw);
      if (!Array.isArray(parsed)) return [];
      return parsed
        .filter(
          (a) =>
            a &&
            typeof a.id === "string" &&
            typeof a.label === "string" &&
            typeof a.dataUrl === "string" &&
            a.dataUrl.startsWith("data:image/")
        )
        .slice(0, CUSTOM_MAX_COUNT);
    } catch {
      return [];
    }
  }

  function labelFromFilename(name) {
    const base = String(name || "Custom")
      .replace(/\.[^.]+$/, "")
      .replace(/[_-]+/g, " ")
      .trim();
    const cleaned = base || "Custom";
    return cleaned.length > 28 ? `${cleaned.slice(0, 27)}…` : cleaned;
  }

  function readFileAsDataUrl(file) {
    return new Promise((resolve, reject) => {
      const reader = new FileReader();
      reader.onload = () => resolve(String(reader.result || ""));
      reader.onerror = () => reject(new Error("Failed to read file"));
      reader.readAsDataURL(file);
    });
  }

  function renderCustomPane() {
    if (!els.customGrid) return;
    els.customGrid.replaceChildren();
    for (const asset of state.customAssets) {
      els.customGrid.appendChild(
        buildAssetChip(
          { id: asset.id, label: asset.label, src: asset.dataUrl },
          { removable: true }
        )
      );
    }
    if (els.customEmpty) {
      els.customEmpty.hidden = state.customAssets.length > 0;
    }
  }

  async function preloadCustomAsset(asset) {
    const img = await loadImageUrl(asset.dataUrl);
    assetImages.set(asset.id, img);
  }

  async function addCustomFiles(fileList) {
    const files = Array.from(fileList || []).filter((f) =>
      f.type.startsWith("image/")
    );
    if (!files.length) return;

    for (const file of files) {
      if (state.customAssets.length >= CUSTOM_MAX_COUNT) {
        els.meta.textContent = `Custom library full (${CUSTOM_MAX_COUNT} max)`;
        break;
      }

      const dataUrl = await readFileAsDataUrl(file);
      if (customEncodedBytes() + dataUrl.length > CUSTOM_MAX_BYTES) {
        els.meta.textContent = "Custom assets exceed 2MB browser limit";
        break;
      }

      const id = `custom-${Date.now()}-${customSeq++}`;
      const asset = {
        id,
        label: labelFromFilename(file.name),
        dataUrl,
      };

      try {
        await preloadCustomAsset(asset);
      } catch {
        els.meta.textContent = `Could not load ${file.name}`;
        continue;
      }

      state.customAssets.push(asset);
      els.meta.textContent = `Added “${asset.label}” to Custom`;
    }

    saveCustomAssets();
    renderCustomPane();
  }

  function removeCustomAsset(assetId) {
    state.customAssets = state.customAssets.filter((a) => a.id !== assetId);
    assetImages.delete(assetId);
    state.overlays = state.overlays.filter((o) => o.assetId !== assetId);
    if (state.selectedId && !state.overlays.some((o) => o.id === state.selectedId)) {
      state.selectedId = null;
    }
    saveCustomAssets();
    renderCustomPane();
    draw();
  }

  async function preloadAssets() {
    const all = BRANDS.flatMap((g) => g.assets);
    const results = await Promise.allSettled(
      all.map(async (asset) => {
        const img = await loadImageUrl(asset.src);
        assetImages.set(asset.id, img);
      })
    );
    for (const [oldId, currentId] of Object.entries(LEGACY_ASSETS)) {
      if (assetImages.has(currentId)) assetImages.set(oldId, assetImages.get(currentId));
    }
    return results.filter(result => result.status === "rejected").length;
  }

  async function setBlankBackground() {
    const presetKey = els.preset.value;
    const preset = PRESETS[presetKey] || PRESETS["1080x1080"];
    const canvas = document.createElement("canvas");
    canvas.width = preset.w;
    canvas.height = preset.h;
    const context = canvas.getContext("2d");
    context.fillStyle = "#000000";
    context.fillRect(0, 0, canvas.width, canvas.height);
    // Use the same image pipeline as uploads so save, restore and export work normally.
    const blob = await new Promise(resolve => canvas.toBlob(resolve, "image/png"));
    if (!blob) throw new Error("Could not create a blank background");
    await setBackground(blob, () => {
      state.presetKey = presetKey;
      return true;
    });
  }

  // Shared canvas pipeline: template posts retain normal placement, saving and export.
  window.auraComposer = {
    async setHoroscope(blob, date, isCurrent = () => true) {
      const applied = await setBackground(blob, () => {
        if (!isCurrent()) return false;
        state.presetKey = "1080x1920";
        els.preset.value = state.presetKey;
        state.showGrid = false;
        syncGridToggle();
        return true;
      });
      if (!applied) return false;
      state.postDate = date;
      return true;
    }
  };

  window.lumenComposer = {
    getFormat: () => Object.hasOwn(window.LumenFactTemplate.formats, els.preset.value) ? els.preset.value : lumenFormat,
    async setFact(blob, format = "1080x1920", isCurrent = () => true) {
      if (!Object.hasOwn(window.LumenFactTemplate.formats, format)) throw new Error("Choose a valid Lumen format.");
      const applied=await setBackground(blob,()=>{
        if(!isCurrent())return false;
        lumenFormat=format;state.presetKey=format;els.preset.value=state.presetKey;
        state.showGrid=false;syncGridToggle();return true;
      });
      if(!applied)return false;
      state.templateBrand="lumen";updateChrome();return true;
    }
  };

  function revealTool(element) {
    for (let parent = element.parentElement; parent; parent = parent.parentElement) {
      if (parent.tagName === "DETAILS") parent.open = true;
    }
  }
  document.querySelectorAll(".editor-pane input, .editor-pane textarea").forEach(input => {
    input.addEventListener("invalid", () => revealTool(input));
  });
  // —— Events ——
  document.getElementById("horoscope-font-size").addEventListener("invalid", () => {
    document.getElementById("horoscope-typography").open = true;
  });
  const editorTabs = [...document.querySelectorAll('[role="tab"]')];
  function selectEditorTab(tab) {
    editorTabs.forEach(item => {
      const selected = item === tab;
      item.setAttribute("aria-selected", String(selected));
      item.tabIndex = selected ? 0 : -1;
      document.getElementById(item.getAttribute("aria-controls")).hidden = !selected;
    });
  }
  editorTabs.forEach((tab, index) => {
    tab.addEventListener("click", () => selectEditorTab(tab));
    tab.addEventListener("keydown", event => {
      let next;
      if (event.key === "ArrowRight") next = (index + 1) % editorTabs.length;
      if (event.key === "ArrowLeft") next = (index + editorTabs.length - 1) % editorTabs.length;
      if (event.key === "Home") next = 0;
      if (event.key === "End") next = editorTabs.length - 1;
      if (next === undefined) return;
      event.preventDefault();
      selectEditorTab(editorTabs[next]);
      editorTabs[next].focus();
    });
  });
  document.querySelectorAll("[data-upload-background]").forEach(button => {
    button.addEventListener("click", () => els.bgInput.click());
  });
  document.getElementById("btn-empty-blank").addEventListener("click", () => {
    document.getElementById("btn-blank").click();
    els.stage.focus();
  });
  document.getElementById("btn-upload-asset").addEventListener("click", () => els.customInput.click());
  document.getElementById("btn-view-preview").addEventListener("click", () => {
    els.stage.scrollIntoView({ behavior: matchMedia("(prefers-reduced-motion: reduce)").matches ? "instant" : "smooth", block: "center" });
    els.stage.focus({ preventScroll: true });
  });
  document.getElementById("btn-close-saved").addEventListener("click", () => {
    state.createdPaneOpen = false;
    saveCreatedPaneOpen();
    syncCreatedPane();
    els.createdToggle.focus();
  });
  document.getElementById("btn-blank").addEventListener("click", async () => {
    try { await setBlankBackground(); }
    catch (error) { els.meta.textContent = error.message; }
  });
  document.querySelectorAll("[data-brand]").forEach(button => {
    button.addEventListener("click", () => {
      closeTintPanel();
      document.querySelectorAll("[data-brand]").forEach(other => {
        other.setAttribute("aria-pressed", String(other === button));
      });
      document.querySelectorAll("[data-brand-panel]").forEach(panel => {
        panel.hidden = panel.dataset.brandPanel !== button.dataset.brand;

      });
      els.preset.value = lumenActive() || state.templateBrand === "lumen" ? lumenFormat : state.presetKey;
      updateChrome();
    });
  });

  els.bgInput.addEventListener("change", async (e) => {
    const file = e.target.files && e.target.files[0];
    if (!file) return;
    try {
      await setBackground(file);
    } catch (err) {
      els.meta.textContent = err.message || "Could not load background";
    }
    e.target.value = "";
  });

  if (els.customInput) {
    els.customInput.addEventListener("change", async (e) => {
      const files = e.target.files;
      if (!files || !files.length) return;
      try {
        await addCustomFiles(files);
      } catch (err) {
        els.meta.textContent = err.message || "Could not add custom assets";
      }
      e.target.value = "";
    });
  }

  els.preset.addEventListener("change", () => {
    if (lumenActive() && Object.hasOwn(window.LumenFactTemplate.formats, els.preset.value)) lumenFormat = els.preset.value;
    if (state.templateBrand === "lumen" || (lumenActive() && !state.bgImage)) {
      if (Object.hasOwn(window.LumenFactTemplate.formats, els.preset.value)) lumenFormat = els.preset.value;
      else els.preset.value = lumenFormat;
      updateChrome();
      return;
    }
    state.presetKey = els.preset.value;
    if (!state.bgImage) {
      updateChrome();
      return;
    }
    // Keep overlays; remapping is approximate — clear if switching dims drastically
    const prevW = state.width;
    const prevH = state.height;
    recomputeCanvasSize();
    if (prevW && prevH && (prevW !== state.width || prevH !== state.height)) {
      const sx = state.width / prevW;
      const sy = state.height / prevH;
      const s = Math.min(sx, sy);
      for (const ov of state.overlays) {
        ov.x = Math.round(ov.x * sx);
        ov.y = Math.round(ov.y * sy);
        ov.width = Math.round(ov.width * s);
        if (ov.type !== "text") ov.height = Math.round(ov.height * s);
      }
    }
    fitCanvasElement();
    draw();
  });

  els.download.addEventListener("click", downloadPng);
  if (els.save) {
    els.save.addEventListener("click", saveCompositionToLibrary);
  }
  els.clear.addEventListener("click", () => {
    state.overlays = [];
    state.selectedId = null;
    draw();
  });
  els.reset.addEventListener("click", resetSession);

  if (els.gridToggle) {
    els.gridToggle.addEventListener("click", () => {
      state.showGrid = !state.showGrid;
      saveShowGrid();
      syncGridToggle();
      draw();
    });
  }

  if (els.gridInvert) {
    els.gridInvert.addEventListener("click", () => {
      state.gridInvert = !state.gridInvert;
      saveGridInvert();
      syncGridInvert();
      draw();
    });
  }

  if (els.createdToggle) {
    els.createdToggle.addEventListener("click", () => {
      state.createdPaneOpen = !state.createdPaneOpen;
      saveCreatedPaneOpen();
      syncCreatedPane();
    });
  }

  ["dragenter", "dragover"].forEach((type) => {
    els.stage.addEventListener(type, (e) => {
      e.preventDefault();
      els.stage.classList.add("drag-over");
    });
  });

  ["dragleave", "drop"].forEach((type) => {
    els.stage.addEventListener(type, (e) => {
      e.preventDefault();
      if (type === "dragleave" && e.target !== els.stage) return;
      els.stage.classList.remove("drag-over");
    });
  });

  els.stage.addEventListener("drop", async (e) => {
    e.preventDefault();
    els.stage.classList.remove("drag-over");

    const assetId =
      e.dataTransfer.getData("application/x-brand-asset") ||
      e.dataTransfer.getData("text/plain");

    if (assetId && assetImages.has(assetId)) {
      if (!state.bgImage) {
        els.meta.textContent = "Upload a background first";
        return;
      }
      const pt = clientToCanvas(e.clientX, e.clientY);
      addOverlay(assetId, pt.x, pt.y);
      return;
    }

    const file = e.dataTransfer.files && e.dataTransfer.files[0];
    if (file && file.type.startsWith("image/")) {
      try {
        await setBackground(file);
      } catch (err) {
        els.meta.textContent = err.message || "Could not load background";
      }
    }
  });

  els.canvas.addEventListener("pointerdown", (e) => {
    if (!state.bgImage) return;
    els.stage.focus();
    const pt = clientToCanvas(e.clientX, e.clientY);
    const hit = hitTest(pt.x, pt.y);
    if (hit) {
      els.canvas.setPointerCapture(e.pointerId);
      startMove(hit, pt.x, pt.y);
    } else {
      state.selectedId = null;
      draw();
    }
  });

  els.canvas.addEventListener("pointermove", (e) => {
    if (!state.interaction || state.interaction.type !== "move") return;
    const pt = clientToCanvas(e.clientX, e.clientY);
    applyInteraction(pt.x, pt.y);
  });

  els.canvas.addEventListener("pointerup", endInteraction);
  els.canvas.addEventListener("pointercancel", endInteraction);

  els.selection.addEventListener("pointerdown", (e) => {
    const handle = e.target.closest(".handle");
    if (!handle) return;
    e.preventDefault();
    e.stopPropagation();
    const ov = selectedOverlay();
    if (!ov) return;
    const pt = clientToCanvas(e.clientX, e.clientY);
    els.stage.setPointerCapture(e.pointerId);
    startScale(ov, handle.dataset.handle, pt.x, pt.y);
  });

  els.stage.addEventListener("pointermove", (e) => {
    if (!state.interaction || state.interaction.type !== "scale") return;
    const pt = clientToCanvas(e.clientX, e.clientY);
    applyInteraction(pt.x, pt.y);
  });

  els.stage.addEventListener("pointerup", endInteraction);
  els.stage.addEventListener("pointercancel", endInteraction);

  window.addEventListener("keydown", (e) => {
    if (e.key === "Delete" || e.key === "Backspace") {
      const tag = (e.target && e.target.tagName) || "";
      if (tag === "INPUT" || tag === "TEXTAREA" || tag === "SELECT") return;
      if (state.selectedId) {
        e.preventDefault();
        deleteSelected();
      }
    }
    if (e.key === "Escape") {
      state.selectedId = null;
      draw();
    }
  });

  window.addEventListener("resize", () => {
    fitCanvasElement();
    draw();
  });

  async function bootCustomAssets() {
    const stored = loadCustomAssetsFromStorage();
    const loaded = [];
    for (const asset of stored) {
      try {
        await preloadCustomAsset(asset);
        loaded.push(asset);
      } catch {
        // drop broken entries
      }
    }
    state.customAssets = loaded;
    if (loaded.length !== stored.length) {
      saveCustomAssets();
    }
    renderCustomPane();
  }

  new ResizeObserver(() => { fitCanvasElement(); draw(); }).observe(els.stage);

  viewport = window.ComposerViewport({
    stage: els.stage, canvas: els.canvas, dimensions: () => ({ width: state.width, height: state.height }),
    changed: () => { updateViewMetrics(); syncSelectionBox(); }, cancelInteraction: endInteraction,
  });

  textTools = window.ComposerText.init(state, { changed: draw, nextId, remove: deleteSelected });
  textTools.loadFonts();

  // —— Boot ——
  state.showGrid = loadShowGrid();
  state.gridInvert = loadGridInvert();
  state.createdPaneOpen = loadCreatedPaneOpen();
  syncGridToggle();
  syncGridInvert();
  syncCreatedPane();
  bootCreatedPics();
  wireTintControls();
  Promise.all([preloadAssets(), bootCustomAssets()])
    .then(([failedAssets]) => {
      state.tintHex = loadStoredTintHex();
      buildAssetPane();
      applyTintColor(state.tintHex, { persist: false });
      updateChrome();
      if (failedAssets) els.meta.textContent = `${failedAssets} brand assets could not load. Available assets are ready; reload to retry.`;
    })
    .catch((err) => {
      els.meta.textContent = err.message || "Failed to load brand assets";
    });
})();
