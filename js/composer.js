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
  const SNAP_STORAGE_KEY = "glitch-social-composer-snap-grid";
  const GRID_INVERT_STORAGE_KEY = "glitch-social-composer-grid-invert";
  const CREATED_PANE_STORAGE_KEY = "glitch-social-composer-created-pane-open";
  const TINT_STORAGE_KEY = "glitch-social-composer-tint-hex";
  const CUSTOM_COLOR_ID = "expenses-custom-color";
  const TINT_SOURCE_ID = "expenses-mark";
  const DEFAULT_TINT_HEX = "#d9b793";
  const REMOVE_ICON = '<svg viewBox="0 0 24 24" aria-hidden="true" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round"><path d="m6 6 12 12M18 6 6 18"/></svg>';

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
    createdStatus: document.getElementById("created-status"),
    createdUsage: document.getElementById("created-usage"),
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
    snapToggle: document.getElementById("btn-snap"),
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
    auraPostType: null,
    templateBrand: null,
    templateSource: null,
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
    snapToGrid: true,
    gridInvert: false,
    createdPaneOpen: false,
    tintHex: DEFAULT_TINT_HEX,
    tintPanelOpen: false,
    assetLabels: new Map(BRANDS.flatMap(group => group.assets.map(asset => [asset.id, asset.label]))),
  };

  let textTools;
  let viewport;
  let layerTools;
  let workspaceUI;
  let history;
  let historyReady = false;
  let historyApplying = false;
  let savedDocumentKey = null;
  let savedDocumentId = null;
  let lastDocumentKey = null;
  let recoveryReady = false;
  let recoveryCandidate = null;
  let sessionEdited = false;
  let hasFormDraft = false;
  let recoveryTimer;
  let recoveryRevision = 0;
  let sessionFeedbackVersion = 0;
  const imageIds = new WeakMap();
  const rasterCopies = new WeakMap();
  let imageSequence = 0;
  let lumenFormat = "1080x1920";
  const lumenActive = () => document.querySelector('[data-brand="lumen"]').getAttribute("aria-pressed") === "true";
  const auraActive = () => document.querySelector('[data-brand="aura"]').getAttribute("aria-pressed") === "true";
  let idSeq = 1;
  let customSeq = 1;
  let createdSeq = 1;
  let documentRevision = 0;

  function beginDocumentOperation(owner = "editor") {
    const ticket = ++documentRevision;
    document.dispatchEvent(new CustomEvent("composer:document-operation", { detail: { owner } }));
    return ticket;
  }

  function currentDocumentOperation(ticket) {
    return ticket === documentRevision;
  }

  window.ComposerDocument = { begin: beginDocumentOperation, isCurrent: currentDocumentOperation };

  function nextId() {
    return `ov-${idSeq++}`;
  }

  function snap(v) {
    return Math.round(v / GRID_SIZE) * GRID_SIZE;
  }

  function snapCoord(v) {
    return state.snapToGrid ? snap(v) : Math.round(v);
  }

  const copyValue = value => value == null ? null : JSON.parse(JSON.stringify(value));
  function copyOverlay(overlay) {
    return {
      id: overlay.id, type: overlay.type, assetId: overlay.assetId, text: overlay.text,
      x: overlay.x, y: overlay.y, width: overlay.width, height: overlay.height,
      hidden: Boolean(overlay.hidden), locked: Boolean(overlay.locked),
    };
  }

  function imageIdentity(image) {
    if (!image) return 0;
    if (!imageIds.has(image)) imageIds.set(image, ++imageSequence);
    return imageIds.get(image);
  }

  function portableImage(image) {
    if (!rasterCopies.has(image)) rasterCopies.set(image, sourceToDataUrl(image, "image/png"));
    return rasterCopies.get(image);
  }

  function historyRetainedBytes(snapshots) {
    const images = new Set();
    for (const snapshot of snapshots) {
      if (snapshot.bgImage) images.add(snapshot.bgImage);
      for (const image of snapshot.images.values()) images.add(image);
    }
    let bytes = 0;
    for (const image of images) {
      bytes += (image.naturalWidth || image.width) * (image.naturalHeight || image.height) * 4;
      bytes += (rasterCopies.get(image)?.length || 0) * 2;
    }
    return bytes;
  }

  function captureDocument() {
    const overlays = state.overlays.map(copyOverlay);
    const images = new Map();
    const labels = new Map();
    for (const layer of overlays) {
      if (layer.type === "text") continue;
      if (assetImages.has(layer.assetId)) images.set(layer.assetId, assetImages.get(layer.assetId));
      labels.set(layer.assetId, state.assetLabels.get(layer.assetId) || layer.assetId);
    }
    const snapshot = {
      bgImage: state.bgImage, postDate: state.postDate, auraPostType: state.auraPostType,
      templateBrand: state.templateBrand, templateSource: copyValue(state.templateSource),
      presetKey: state.presetKey, textStyles: window.ComposerText.normalize(state.textStyles),
      overlays, images, labels, selectedId: state.selectedId, tintHex: state.tintHex,
    };
    snapshot.key = JSON.stringify({
      background: imageIdentity(snapshot.bgImage), postDate: snapshot.postDate, auraPostType: snapshot.auraPostType,
      templateBrand: snapshot.templateBrand, templateSource: snapshot.templateSource, presetKey: snapshot.presetKey,
      textStyles: snapshot.textStyles,
      overlays: overlays.map(layer => layer.type === "text" ? { ...layer, height: undefined } : layer),
      images: [...images].map(([id, image]) => [id, imageIdentity(image)]),
    });
    return snapshot;
  }

  function updateDocumentStatus() {
    document.getElementById("btn-undo").disabled = !history?.canUndo();
    document.getElementById("btn-redo").disabled = !history?.canRedo();
    document.getElementById("document-status").textContent = !state.bgImage ? "No canvas"
      : lastDocumentKey === savedDocumentKey ? "Saved locally" : "Unsaved changes";
  }

  function documentGroup(explicit) {
    if (explicit) return explicit;
    if (state.interaction) return "pointer";
    const active = document.activeElement;
    return active?.matches("input, textarea, select") ? `field:${active.id}` : null;
  }

  function documentDrawn(group) {
    if (!historyReady || historyApplying) return;
    history.record(documentGroup(group));
    updateDocumentStatus();
  }

  function documentChanged() {
    lastDocumentKey = captureDocument().key;
    sessionEdited = true;
    recoveryCandidate = null;
    document.getElementById("recovery-banner").hidden = true;
    updateDocumentStatus();
    scheduleRecovery();
  }

  function applyHistory(snapshot) {
    beginDocumentOperation();
    historyApplying = true;
    const sourceChanged = JSON.stringify(state.templateSource) !== JSON.stringify(snapshot.templateSource);
    state.bgImage = snapshot.bgImage;
    state.postDate = snapshot.postDate;
    state.auraPostType = snapshot.auraPostType;
    state.templateBrand = snapshot.templateBrand;
    state.templateSource = copyValue(snapshot.templateSource);
    state.presetKey = snapshot.presetKey;
    state.textStyles = window.ComposerText.normalize(snapshot.textStyles);
    state.overlays = snapshot.overlays.map(copyOverlay);
    state.selectedId = state.overlays.some(layer => layer.id === snapshot.selectedId) ? snapshot.selectedId : null;
    state.interaction = null;
    for (const [id, image] of snapshot.images) assetImages.set(id, image);
    for (const [id, label] of snapshot.labels) state.assetLabels.set(id, label);
    syncTintControls(snapshot.tintHex);
    const tintImage = snapshot.images.get(CUSTOM_COLOR_ID);
    if (tintImage) {
      const chip = document.querySelector("#chip-custom-color .asset-thumb img");
      if (chip) chip.src = sourceToDataUrl(tintImage, "image/png");
    } else if (assetImages.has(TINT_SOURCE_ID)) applyTintColor(snapshot.tintHex, { persist: false });
    els.preset.value = state.presetKey;
    if (state.templateBrand === "lumen") lumenFormat = state.presetKey;
    if (sourceChanged && state.templateSource) window.ComposerTemplateState.restoreSource(state.templateSource);
    recomputeCanvasSize();
    viewport?.reset();
    fitCanvasElement();
    draw();
    historyApplying = false;
    lastDocumentKey = snapshot.key;
    textTools?.loadFonts();
  }

  function portableProject(snapshot, forms = window.ComposerTemplateState.captureForms()) {
    let composition = null;
    if (snapshot.bgImage) {
      const assetDataUrls = {}, assetLabels = {};
      for (const [id, image] of snapshot.images) {
        assetDataUrls[id] = portableImage(image);
        assetLabels[id] = snapshot.labels.get(id) || id;
      }
      composition = {
        bgDataUrl: portableImage(snapshot.bgImage),
        postDate: snapshot.postDate, auraPostType: snapshot.auraPostType,
        templateBrand: snapshot.templateBrand, templateSource: copyValue(snapshot.templateSource),
        presetKey: snapshot.presetKey, textStyles: snapshot.textStyles,
        tintHex: snapshot.tintHex, overlays: snapshot.overlays.map(copyOverlay), assetDataUrls, assetLabels,
        showGrid: state.showGrid, snapToGrid: state.snapToGrid, gridInvert: state.gridInvert,
      };
    }
    return window.ComposerSession.validateProject({ format: "social-composer-project", version: 1, composition, forms });
  }

  function scheduleRecovery() {
    if (!recoveryReady || recoveryCandidate) return;
    const version = ++recoveryRevision;
    const feedbackVersion = sessionFeedbackVersion;
    clearTimeout(recoveryTimer);
    document.getElementById("session-status").textContent = "Saving recovery draft…";
    const snapshot = captureDocument(), forms = window.ComposerTemplateState.captureForms();
    recoveryTimer = setTimeout(async () => {
      try {
        const project = portableProject(snapshot, forms);
        if (version !== recoveryRevision) return;
        await window.ComposerSession.writeRecovery(project);
        if (version === recoveryRevision && feedbackVersion === sessionFeedbackVersion) document.getElementById("session-status").textContent = "Recovery draft saved in this browser.";
      } catch {
        if (version === recoveryRevision && feedbackVersion === sessionFeedbackVersion) document.getElementById("session-status").textContent = "Recovery is unavailable. Export a project file to keep an editable backup.";
      }
    }, 350);
  }

  async function restoreProject(project, label, ticket = beginDocumentOperation()) {
    let restored;
    if (project.composition) restored = await restoreComposition({ composition: project.composition, label }, { portable: true, markSaved: false, ticket });
    else { restored = resetSession(ticket); }
    if (restored && currentDocumentOperation(ticket)) {
      window.ComposerTemplateState.restoreForms(project.forms || {});
      scheduleRecovery();
    }
    return restored;
  }

  async function exportProject() {
    ++sessionFeedbackVersion;
    const status = document.getElementById("session-status");
    status.textContent = "Preparing project file…";
    try {
      window.ComposerTemplateState.flushForms();
      const project = portableProject(captureDocument());
      const blob = new Blob([JSON.stringify(project)], { type: "application/json" });
      if (blob.size > 50 * 1024 * 1024) throw new Error("The project exceeds the 50 MB file limit.");
      const link = document.createElement("a");
      link.href = URL.createObjectURL(blob);
      link.download = "social-composer-project.json";
      link.click();
      URL.revokeObjectURL(link.href);
      status.textContent = "Project exported with editable layers, template inputs, and embedded images.";
    } catch (error) { status.textContent = error.message || "The project could not be exported."; }
  }

  async function importProject(file) {
    ++sessionFeedbackVersion;
    const ticket = beginDocumentOperation();
    const status = document.getElementById("session-status");
    status.textContent = "Opening project…";
    try {
      if (file.size > 50 * 1024 * 1024) throw new Error("Choose a project file no larger than 50 MB.");
      const project = window.ComposerSession.validateProject(JSON.parse(await file.text()));
      if (!currentDocumentOperation(ticket)) return;
      const restored = await restoreProject(project, file.name, ticket);
      if (currentDocumentOperation(ticket)) {
        ++sessionFeedbackVersion;
        status.textContent = restored
          ? "Project opened. Its layers and template inputs are editable."
          : "The project could not be opened. Your current canvas was kept.";
      }
    } catch (error) {
      if (currentDocumentOperation(ticket)) {
        ++sessionFeedbackVersion;
        status.textContent = `Project not opened: ${error.message || "invalid file"}`;
      }
    }
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
    els.snapToggle?.setAttribute("aria-pressed", state.snapToGrid ? "true" : "false");
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

  function draw(group) {
    if (!state.bgImage || !state.width) {
      ctx.clearRect(0, 0, els.canvas.width, els.canvas.height);
      syncSelectionBox();
      updateChrome();
      documentDrawn(group);
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
      if (ov.hidden) continue;
      if (ov.type === "text") { window.ComposerText.draw(ctx, ov, state.textStyles); continue; }
      const img = assetImages.get(ov.assetId);
      if (!img) continue;
      ctx.drawImage(img, ov.x, ov.y, ov.width, ov.height);
    }

    syncSelectionBox();
    updateChrome();
    documentDrawn(group);
  }

  function selectedOverlay() {
    return state.overlays.find((o) => o.id === state.selectedId) || null;
  }

  function syncSelectionBox() {
    const ov = selectedOverlay();
    if (!ov || ov.hidden || !state.bgImage) {
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
    els.selection.classList.toggle("is-locked", Boolean(ov.locked));
    els.selection.style.left = `${left}px`;
    els.selection.style.top = `${top}px`;
    els.selection.style.width = `${w}px`;
    els.selection.style.height = `${h}px`;
  }

  function updateChrome() {
    const hasBg = Boolean(state.bgImage);
    const details = document.getElementById("document-details");
    const dimensions = hasBg ? `${state.width} × ${state.height}` : "Choose a template";
    if (details.textContent !== dimensions) details.textContent = dimensions;
    els.empty.hidden = hasBg;
    const lumenPost = hasBg && state.templateBrand === "lumen";
    const auraLayout = hasBg && Boolean(state.postDate) && !lumenActive();
    els.preset.disabled = auraLayout;
    const lumenLayout = lumenPost || (lumenActive() && (!hasBg || Boolean(state.postDate)));
    els.preset.querySelector('option[value="native"]').disabled = lumenLayout || auraLayout;
    const formatGuidance = document.getElementById("lumen-format-guidance");
    const auraDraft = auraActive() && !state.postDate;
    formatGuidance.hidden = !(lumenLayout || auraLayout || auraDraft);
    formatGuidance.textContent = auraLayout
      ? "AURA covers and readings use Story / Reel · 9:16 · 1080×1920. Start a blank canvas or upload a background to use other sizes."
      : auraDraft ? `AURA covers and readings start at Story / Reel · 9:16 · 1080×1920.${hasBg ? " Create one to apply that size; the current canvas is kept until then." : ""}`
      : "Choose Canvas size above, then select Create Lumen post to apply the layout.";
    textTools?.sync();
    layerTools?.sync();
    const selected = selectedOverlay();
    workspaceUI?.sync({
      hasCanvas: hasBg,
      inspect: !historyApplying,
      selected: selected ? { ...selected, assetLabel: state.assetLabels.get(selected.assetId) } : null,
      title: documentTitle(),
    });
    document.getElementById("btn-restore-template").disabled = !state.templateSource;
    const textOverflow = state.overlays.filter(o => o.type === "text" && !o.hidden).map(o => window.ComposerText.overflow(o, state.width, state.height)).find(Boolean);
    const textOutside = Boolean(textOverflow);
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
    els.meta.textContent = textOverflow === "width"
      ? "A text box is too narrow for its text. Widen it or reduce the shared font size to enable PNG export."
      : textOutside ? "Text extends outside the canvas. Adjust the boxes in Text to enable PNG export." : `${mode} · export ${state.width}×${state.height} · ${marks}`;
  }

  function resetSession(ticket) {
    const operation = typeof ticket === "number" ? ticket : beginDocumentOperation();
    if (!currentDocumentOperation(operation)) return false;
    state.bgImage = null;
    state.postDate = null;
    state.auraPostType = null;
    state.templateBrand = null;
    state.templateSource = null;
    state.overlays = [];
    state.selectedId = null;
    state.width = 0;
    state.height = 0;
    if (auraActive()) { state.presetKey = "1080x1920"; els.preset.value = state.presetKey; }
    if (els.bgInput) els.bgInput.value = "";
    fitCanvasElement();
    draw();
    return true;
  }

  function documentTitle() {
    if (!state.bgImage) return "Untitled canvas";
    if (state.postDate) return `AURA · ${state.auraPostType === "cover" ? "Daily cover" : "Daily readings"} · ${state.postDate}`;
    if (state.templateBrand === "lumen") return "Lumen · Fact post";
    return `Canvas · ${state.width} × ${state.height}`;
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

  async function setBackground(file, beforeApply = null, ticket = beginDocumentOperation(), metadata = {}) {
    let img;
    try {
      img = await loadImageFromFile(file);
    } catch (error) {
      if (!currentDocumentOperation(ticket)) return false;
      throw error;
    }
    if (!currentDocumentOperation(ticket)) return false;
    if (beforeApply && !beforeApply()) return false;
    if (!beforeApply) state.presetKey = els.preset.value;
    state.bgImage = img;
    state.postDate = metadata.postDate || null;
    state.auraPostType = metadata.auraPostType || null;
    state.templateBrand = metadata.templateBrand || null;
    state.templateSource = copyValue(metadata.templateSource);
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
      if (o.hidden) continue;
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

  function deleteSelected() {
    if (!state.selectedId) return;
    if (selectedOverlay()?.locked) return;
    state.overlays = state.overlays.filter((o) => o.id !== state.selectedId);
    state.selectedId = null;
    draw();
  }

  function startMove(ov, cx, cy) {
    if (ov.locked) { state.selectedId = ov.id; draw(); return; }
    if (ov.type === "text") selectEditorTab(document.getElementById("tab-text"));
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
    if (ov.locked) return;
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
    if (!ov || ov.locked || ov.hidden) return;

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
    history?.endGroup();
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
      if (ov.hidden) continue;
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
      ? `aura-daily-${state.auraPostType === "cover" ? "cover" : "horoscope"}-${state.postDate}-${state.width}x${state.height}.png`
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

  function canvasFromSource(source, willReadFrequently = false) {
    const w = source.naturalWidth || source.width;
    const h = source.naturalHeight || source.height;
    if (!w || !h) throw new Error("Invalid image source");
    const c = document.createElement("canvas");
    c.width = w;
    c.height = h;
    c.getContext("2d", { willReadFrequently }).drawImage(source, 0, 0);
    return c;
  }

  function sourceToDataUrl(source, type = "image/png", quality) {
    const c = canvasFromSource(source);
    return quality != null ? c.toDataURL(type, quality) : c.toDataURL(type);
  }

  function backgroundToDataUrl(source) {
    const canvas = canvasFromSource(source, true);
    const context = canvas.getContext("2d");
    // Scan in strips so checking a large image does not allocate another full bitmap.
    for (let y = 0; y < canvas.height; y += 64) {
      const pixels = context.getImageData(0, y, canvas.width, Math.min(64, canvas.height - y)).data;
      for (let alpha = 3; alpha < pixels.length; alpha += 4) {
        if (pixels[alpha] !== 255) return canvas.toDataURL("image/png");
      }
    }
    return canvas.toDataURL("image/jpeg", 0.88);
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
    n += c.auraPostType?.length || 0;
    n += c.tintHex?.length || 0;
    n += JSON.stringify(c.textStyles || {}).length;
    n += JSON.stringify(c.templateSource || {}).length;
    n += JSON.stringify(c.assetLabels || {}).length;
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

  function saveCreatedPics(pics = state.createdPics) {
    try {
      localStorage.setItem(CREATED_STORAGE_KEY, JSON.stringify(pics));
      return true;
    } catch {
      return false;
    }
  }

  function reportCreatedStatus(message, status = "error") {
    if (els.createdStatus) {
      els.createdStatus.textContent = message;
      els.createdStatus.dataset.state = status;
      els.createdStatus.hidden = false;
    }
    els.meta.textContent = message;
    state.createdPaneOpen = true;
    saveCreatedPaneOpen();
    syncCreatedPane();
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
            auraPostType: a.composition.auraPostType === "cover" ? "cover" : null,
            templateSource: copyValue(a.composition.templateSource),
            assetLabels: a.composition.assetLabels || {},
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
                hidden: o.hidden === true,
                locked: o.locked === true,
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
      bgDataUrl = backgroundToDataUrl(state.bgImage);
      thumbDataUrl = makeThumbDataUrl();
    } catch (err) {
      reportCreatedStatus("Save failed: this design could not be prepared for browser storage. Try Download PNG to keep an image file.");
      return;
    }

    const preset = currentPreset();
    const slug = preset ? preset.slug : "native";
    const entry = {
      id: `created-${Date.now()}-${createdSeq++}`,
      label: `${documentTitle()} · ${slug}`,
      thumbDataUrl,
      width: state.width,
      height: state.height,
      createdAt: Date.now(),
      composition: {
        bgDataUrl,
        postDate: state.postDate,
        auraPostType: state.auraPostType,
        templateBrand: state.templateBrand,
        templateSource: copyValue(state.templateSource),
        assetLabels: Object.fromEntries(state.overlays.filter(layer => layer.type !== "text").map(layer => [layer.assetId, state.assetLabels.get(layer.assetId) || layer.assetId])),
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
          hidden: Boolean(o.hidden),
          locked: Boolean(o.locked),
        })),
        assetDataUrls: collectAssetDataUrls(),
      },
    };

    let entryBytes = entryEncodedBytes(entry);
    if (entryBytes > CREATED_MAX_BYTES && bgDataUrl.startsWith("data:image/png")) {
      // Keep PNG lossless when it fits. Large transparent backgrounds can use
      // high-quality WebP color compression while retaining their alpha channel.
      try {
        const compact = sourceToDataUrl(state.bgImage, "image/webp", 0.98);
        if (compact.startsWith("data:image/webp") && compact.length < bgDataUrl.length) {
          entry.composition.bgDataUrl = compact;
          entryBytes = entryEncodedBytes(entry);
        }
      } catch {
        // Retain the PNG and report the normal storage limit below.
      }
    }
    if (entryBytes > CREATED_MAX_BYTES) {
      reportCreatedStatus("This design is too large for the saved-design library. Use Download PNG to keep an image file.");
      return;
    }

    if (state.createdPics.length >= CREATED_MAX_COUNT) {
      reportCreatedStatus(`The saved-design library is full (${CREATED_MAX_COUNT} designs maximum). Remove a saved design and retry, or use Download PNG. Your existing saves were kept.`);
      return;
    }
    if (createdEncodedBytes() + entryBytes > CREATED_MAX_BYTES) {
      reportCreatedStatus("The saved-design library has reached its storage limit. Remove a saved design and retry, or use Download PNG. Your existing saves were kept.");
      return;
    }

    const nextPics = [...state.createdPics, entry];
    if (!saveCreatedPics(nextPics)) {
      reportCreatedStatus("Save failed: browser storage is full or unavailable. Your existing saves were kept. Use Download PNG to keep an image file, or free some storage and retry.");
      return;
    }
    state.createdPics = nextPics;
    renderCreatedPane();
    savedDocumentKey = captureDocument().key;
    savedDocumentId = entry.id;
    lastDocumentKey = savedDocumentKey;
    updateDocumentStatus();
    reportCreatedStatus(`Saved “${entry.label}” in this browser.`, "success");
  }

  function removeCreatedPic(id) {
    const pic = state.createdPics.find(p => p.id === id);
    if (!pic) return;
    const nextPics = state.createdPics.filter(p => p.id !== id);
    const restoreFocus = els.createdGrid.contains(document.activeElement);
    if (!saveCreatedPics(nextPics)) {
      reportCreatedStatus("Remove failed: browser storage is unavailable. The saved design was kept. Retry when storage is available.");
      return;
    }
    state.createdPics = nextPics;
    if (savedDocumentId === id) {
      savedDocumentId = null;
      savedDocumentKey = null;
      updateDocumentStatus();
    }
    renderCreatedPane();
    if (restoreFocus) (els.createdGrid.querySelector(".asset-chip") || document.getElementById("btn-close-saved")).focus();
    reportCreatedStatus(`Removed “${pic.label}” from this browser.`, "success");
  }

  async function restoreComposition(pic, options = {}) {
    const ticket = options.ticket ?? beginDocumentOperation();
    if (!currentDocumentOperation(ticket)) return false;
    const comp = pic?.composition;
    if (!isValidComposition(comp)) {
      els.meta.textContent = "Saved composition is incomplete";
      return;
    }

    try {
      const bg = await loadImageUrl(comp.bgDataUrl);
      if (!currentDocumentOperation(ticket)) return false;
      let decodedPixels = bg.naturalWidth * bg.naturalHeight;
      const checkProjectPixels = image => {
        if (!options.portable) return;
        if (image.naturalWidth > 16384 || image.naturalHeight > 16384 || decodedPixels > 64000000) throw new Error("The project images are too large to open safely.");
      };
      checkProjectPixels(bg);
      const restoredImages = new Map();

      for (const [assetId, dataUrl] of Object.entries(comp.assetDataUrls || {})) {
        if (typeof dataUrl !== "string" || !dataUrl.startsWith("data:image/")) {
          continue;
        }
        const img = await loadImageUrl(dataUrl);
        if (!currentDocumentOperation(ticket)) return false;
        decodedPixels += img.naturalWidth * img.naturalHeight;
        checkProjectPixels(img);
        restoredImages.set(assetId, img);
      }

      const textStyles = window.ComposerText.normalize(comp.textStyles);
      let fontWarning = false;
      try {
        await window.ComposerText.loadStyles(textStyles);
      } catch {
        fontWarning = true;
      }
      if (!currentDocumentOperation(ticket)) return false;

      const tint = typeof comp.tintHex === "string" ? parseHex(comp.tintHex) : null;
      let tintPreview = comp.assetDataUrls?.[CUSTOM_COLOR_ID] || null;
      if (tint && !restoredImages.has(CUSTOM_COLOR_ID)) {
        let source = assetImages.get(TINT_SOURCE_ID);
        if (!source) {
          source = await loadImageUrl("brands/current/expenses-mark.png");
          if (!currentDocumentOperation(ticket)) return false;
          restoredImages.set(TINT_SOURCE_ID, source);
        }
        const tinted = tintSourceImage(source, tint.r, tint.g, tint.b);
        tintPreview = tinted.toDataURL("image/png");
        restoredImages.set(CUSTOM_COLOR_ID, tinted);
      }

      if (!currentDocumentOperation(ticket)) return false;
      // Decode and load fonts off-state, then commit the complete document together.
      const aliases = new Map();
      if (options.portable) {
        let sequence = 0;
        for (const assetId of restoredImages.keys()) aliases.set(assetId, `project-${ticket}-${++sequence}`);
      }
      for (const [assetId, image] of restoredImages) {
        const mappedId = aliases.get(assetId) || assetId;
        assetImages.set(mappedId, image);
        state.assetLabels.set(mappedId, comp.assetLabels?.[assetId] || state.assetLabels.get(assetId) || assetId);
        if (options.portable) continue;
        if (!assetId.startsWith("custom-")) continue;
        const dataUrl = comp.assetDataUrls[assetId];
        const existing = state.customAssets.find(asset => asset.id === assetId);
        if (existing) existing.dataUrl = dataUrl;
        else state.customAssets.push({ id: assetId, label: "Restored asset", dataUrl });
      }
      if (options.portable && restoredImages.has(CUSTOM_COLOR_ID)) assetImages.set(CUSTOM_COLOR_ID, restoredImages.get(CUSTOM_COLOR_ID));
      if (tint) {
        syncTintControls(tint.hex);
        const chipImg = document.querySelector("#chip-custom-color .asset-thumb img");
        if (chipImg && tintPreview) chipImg.src = tintPreview;
      }
      state.bgImage = bg;
      state.postDate = comp.postDate || null;
      state.auraPostType = comp.auraPostType === "cover" ? "cover" : null;
      state.templateBrand = !state.postDate && comp.templateBrand === "lumen" ? "lumen" : null;
      state.templateSource = copyValue(comp.templateSource);
      state.presetKey = state.postDate ? "1080x1920"
        : Object.prototype.hasOwnProperty.call(PRESETS, comp.presetKey) ? comp.presetKey : "native";
      if (els.preset) els.preset.value = state.presetKey;
      if (state.templateBrand === "lumen" && Object.hasOwn(window.LumenFactTemplate.formats, state.presetKey)) lumenFormat = state.presetKey;

      state.textStyles = textStyles;
      state.textReady = true;
      state.overlays = (comp.overlays || []).map((o) => ({
        type: o.type,
        text: o.text,
        id: nextId(),
        assetId: aliases.get(o.assetId) || o.assetId,
        x: o.x,
        y: o.y,
        width: o.width,
        height: o.height,
        hidden: o.hidden === true,
        locked: o.locked === true,
      }));
      state.selectedId = null;
      if (state.templateSource) window.ComposerTemplateState.restoreSource(state.templateSource);
      for (const preference of ["showGrid", "snapToGrid", "gridInvert"]) {
        if (typeof comp[preference] === "boolean") state[preference] = comp[preference];
      }
      syncGridToggle();
      syncGridInvert();

      recomputeCanvasSize();
      viewport?.reset();
      fitCanvasElement();
      saveCustomAssets();
      renderCustomPane();
      draw();
      if (options.markSaved !== false) {
        savedDocumentKey = captureDocument().key;
        savedDocumentId = pic.id || null;
        updateDocumentStatus();
      }
      els.meta.textContent = fontWarning
        ? `Restored “${pic.label}” with fallback fonts because a font could not load.`
        : `Restored “${pic.label}”`;
      els.meta.textContent += ` · ${state.overlays.filter(layer => layer.type !== "text").length} marks · ${state.overlays.filter(layer => layer.type === "text").length} text boxes`;
      return true;
    } catch (err) {
      if (currentDocumentOperation(ticket)) els.meta.textContent = err.message || "Could not restore composition";
      return false;
    }
  }

  function renderCreatedPane() {
    if (!els.createdGrid) return;
    els.createdGrid.replaceChildren();
    for (const pic of [...state.createdPics].reverse()) {
      const row = document.createElement("div");
      row.className = "saved-asset-row";
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
      remove.innerHTML = REMOVE_ICON;
      remove.addEventListener("click", (e) => {
        e.preventDefault();
        e.stopPropagation();
        removeCreatedPic(pic.id);
      });
      row.append(btn, remove);

      btn.addEventListener("click", () => {
        restoreComposition(pic);
      });
      els.createdGrid.appendChild(row);
    }
    if (els.createdEmpty) {
      els.createdEmpty.hidden = state.createdPics.length > 0;
    }
    if (els.createdUsage) {
      els.createdUsage.textContent = `${state.createdPics.length} of ${CREATED_MAX_COUNT} saved designs`;
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

    let container = btn;
    if (removable) {
      container = document.createElement("div");
      container.className = "asset-item";
      const remove = document.createElement("button");
      remove.type = "button";
      remove.className = "asset-chip-remove";
      remove.title = `Remove ${asset.label}`;
      remove.setAttribute("aria-label", `Remove ${asset.label}`);
      remove.innerHTML = REMOVE_ICON;
      remove.addEventListener("click", (e) => {
        e.preventDefault();
        e.stopPropagation();
        removeCustomAsset(asset.id);
        (els.customGrid.querySelector(".asset-chip") || document.getElementById("btn-upload-asset")).focus();
      });
      container.append(btn, remove);
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

    return container;
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
    if (!historyApplying && hex !== state.tintHex && state.overlays.some(layer => layer.assetId === CUSTOM_COLOR_ID && layer.locked)) {
      els.meta.textContent = "Unlock tinted layers before changing their shared color.";
      return false;
    }
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
      state.assetLabels.set(asset.id, asset.label);
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
    if (!state.overlays.some(layer => layer.assetId === assetId && layer.locked)) assetImages.delete(assetId);
    state.overlays = state.overlays.filter((o) => o.assetId !== assetId || o.locked);
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
    const ticket = beginDocumentOperation();
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
    if (!currentDocumentOperation(ticket)) return false;
    if (!blob) throw new Error("Could not create a blank background");
    return setBackground(blob, null, ticket);
  }

  // Shared canvas pipeline: template posts retain normal placement, saving and export.
  window.auraComposer = {
    async setHoroscope(blob, date, isCurrent = () => true, postType = "horoscope", ticket, templateSource = null) {
      if (!isCurrent() || (ticket !== undefined && !currentDocumentOperation(ticket))) return false;
      const operation = ticket ?? beginDocumentOperation("aura");
      return setBackground(blob, () => {
        if (!isCurrent()) return false;
        state.presetKey = "1080x1920";
        els.preset.value = state.presetKey;
        state.showGrid = false;
        syncGridToggle();
        return true;
      }, operation, { postDate: date, auraPostType: postType === "cover" ? "cover" : "horoscope", templateSource });
    }
  };

  window.lumenComposer = {
    getFormat: () => Object.hasOwn(window.LumenFactTemplate.formats, els.preset.value) ? els.preset.value : lumenFormat,
    setDraftFormat(format) {
      if (!Object.hasOwn(window.LumenFactTemplate.formats, format)) return false;
      lumenFormat = format;
      if (lumenActive()) els.preset.value = format;
      updateChrome();
      return true;
    },
    async setFact(blob, format = "1080x1920", isCurrent = () => true, ticket, templateSource = null) {
      if (!Object.hasOwn(window.LumenFactTemplate.formats, format)) throw new Error("Choose a valid Lumen format.");
      if (!isCurrent() || (ticket !== undefined && !currentDocumentOperation(ticket))) return false;
      const operation = ticket ?? beginDocumentOperation("lumen");
      return setBackground(blob,()=>{
        if(!isCurrent())return false;
        lumenFormat=format;state.presetKey=format;els.preset.value=state.presetKey;
        state.showGrid=false;syncGridToggle();return true;
      }, operation, { templateBrand: "lumen", templateSource });
    }
  };

  function revealTool(element) {
    for (let parent = element.parentElement; parent; parent = parent.parentElement) {
      if (parent.tagName === "DETAILS") parent.open = true;
    }
  }
  document.querySelectorAll(".editor-pane input, .editor-pane textarea, .inspector-pane input, .inspector-pane textarea").forEach(input => {
    input.addEventListener("invalid", () => revealTool(input));
  });
  // —— Events ——
  document.getElementById("horoscope-font-size").addEventListener("invalid", () => {
    document.getElementById("horoscope-typography").open = true;
  });
  function selectEditorTab(tab) {
    [...tab.closest('[role="tablist"]').querySelectorAll('[role="tab"]')].forEach(item => {
      const selected = item === tab;
      item.setAttribute("aria-selected", String(selected));
      item.tabIndex = selected ? 0 : -1;
      document.getElementById(item.getAttribute("aria-controls")).hidden = !selected;
    });
  }
  document.querySelectorAll('[role="tablist"]').forEach(tablist => {
    const editorTabs = [...tablist.querySelectorAll('[role="tab"]')];
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
  });
  document.querySelectorAll("[data-upload-background]").forEach(button => {
    button.addEventListener("click", () => els.bgInput.click());
  });
  document.getElementById("btn-empty-blank").addEventListener("click", () => {
    document.getElementById("btn-blank").click();
    els.stage.focus();
  });
  document.getElementById("btn-upload-asset").addEventListener("click", () => els.customInput.click());
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
  function selectBrand(button) {
      closeTintPanel();
      document.querySelectorAll("[data-brand]").forEach(other => {
        other.setAttribute("aria-pressed", String(other === button));
      });
      document.querySelectorAll("[data-brand-panel]").forEach(panel => {
        panel.hidden = panel.dataset.brandPanel !== button.dataset.brand;

      });
      if (button.dataset.brand === "aura" && !state.bgImage) state.presetKey = "1080x1920";
      els.preset.value = button.dataset.brand === "aura" ? state.presetKey
        : lumenActive() || state.templateBrand === "lumen" ? lumenFormat : state.presetKey;
      workspaceUI?.setBrand(button.dataset.brand);
      updateChrome();
  }
  document.querySelectorAll("[data-brand]").forEach(button => {
    button.addEventListener("click", () => selectBrand(button));
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
    if (state.postDate) {
      if (!lumenActive()) els.preset.value = "1080x1920";
      else if (!Object.hasOwn(window.LumenFactTemplate.formats, els.preset.value)) els.preset.value = lumenFormat;
      updateChrome();
      return;
    }
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
        if (ov.locked) continue;
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
    state.overlays = state.overlays.filter(layer => layer.locked);
    if (!state.overlays.some(layer => layer.id === state.selectedId)) state.selectedId = null;
    draw();
  });
  els.reset.addEventListener("click", resetSession);

  if (els.gridToggle) {
    els.gridToggle.addEventListener("click", () => {
      state.showGrid = !state.showGrid;
      saveShowGrid();
      syncGridToggle();
      draw();
      scheduleRecovery();
    });
  }

  els.snapToggle?.addEventListener("click", () => {
    state.snapToGrid = !state.snapToGrid;
    try { localStorage.setItem(SNAP_STORAGE_KEY, state.snapToGrid ? "1" : "0"); } catch { /* Preference only. */ }
    syncGridToggle();
    scheduleRecovery();
  });

  if (els.gridInvert) {
    els.gridInvert.addEventListener("click", () => {
      state.gridInvert = !state.gridInvert;
      saveGridInvert();
      syncGridInvert();
      draw();
      scheduleRecovery();
    });
  }

  if (els.createdToggle) {
    els.createdToggle.addEventListener("click", () => {
      state.createdPaneOpen = !state.createdPaneOpen;
      saveCreatedPaneOpen();
      syncCreatedPane();
      if (state.createdPaneOpen) document.getElementById("btn-close-saved").focus();
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
    if (e.key === "Escape" && state.createdPaneOpen) {
      e.preventDefault();
      document.getElementById("btn-close-saved").click();
      return;
    }
    const moreActions = document.querySelector(".more-actions");
    if (e.key === "Escape" && moreActions.open) {
      e.preventDefault();
      moreActions.open = false;
      moreActions.querySelector("summary").focus();
      return;
    }
    const typing = e.target?.closest("input,textarea,select,[contenteditable='true']");
    if (!typing && (e.ctrlKey || e.metaKey) && !e.altKey) {
      const key = e.key.toLowerCase();
      if (key === "z" || key === "y") {
        e.preventDefault();
        if (key === "y" || e.shiftKey) history?.redo(); else history?.undo();
        return;
      }
    }
    const editingFocus = els.stage.contains(document.activeElement) || document.getElementById("panel-layers").contains(document.activeElement);
    if (!typing && editingFocus && ["ArrowLeft", "ArrowRight", "ArrowUp", "ArrowDown"].includes(e.key)) {
      const layer = selectedOverlay();
      if (layer && !layer.locked) {
        e.preventDefault();
        const amount = e.shiftKey ? 10 : 1;
        if (e.key === "ArrowLeft") layer.x -= amount;
        if (e.key === "ArrowRight") layer.x += amount;
        if (e.key === "ArrowUp") layer.y -= amount;
        if (e.key === "ArrowDown") layer.y += amount;
        draw("nudge");
      }
      return;
    }
    if (e.key === "Delete" || e.key === "Backspace") {
      const tag = (e.target && e.target.tagName) || "";
      if (tag === "INPUT" || tag === "TEXTAREA" || tag === "SELECT") return;
      if (state.selectedId && editingFocus) {
        e.preventDefault();
        deleteSelected();
      }
    }
    if (e.key === "Escape") {
      state.selectedId = null;
      draw();
    }
  });

  window.addEventListener("keyup", event => {
    if (event.key.startsWith("Arrow")) history?.endGroup();
  });
  document.addEventListener("focusout", () => history?.endGroup());
  document.getElementById("btn-undo").addEventListener("click", () => history?.undo());
  document.getElementById("btn-redo").addEventListener("click", () => history?.redo());
  document.getElementById("btn-export-project").addEventListener("click", exportProject);
  document.getElementById("btn-restore-template").addEventListener("click", () => {
    if (!state.templateSource) return;
    beginDocumentOperation();
    const brand = state.templateSource.kind === "lumen-fact" ? "lumen" : "aura";
    window.ComposerTemplateState.restoreSource(state.templateSource);
    workspaceUI?.setView('edit', { focus: false });
    selectBrand(document.querySelector(`[data-brand="${brand}"]`));
    selectEditorTab(document.getElementById("tab-create"));
    const tool = document.querySelector(`#panel-create [data-brand-panel="${brand}"]`);
    tool.open = true;
    document.querySelector(".more-actions").open = false;
    tool.querySelector("summary").focus();
    document.getElementById("session-status").textContent = "Original template inputs loaded for editing. Select Create to regenerate the canvas.";
    scheduleRecovery();
  });
  document.getElementById("btn-import-project").addEventListener("click", () => document.getElementById("project-input").click());
  document.getElementById("project-input").addEventListener("change", async event => {
    const file = event.target.files?.[0];
    if (file) await importProject(file);
    event.target.value = "";
  });
  document.addEventListener("composer:forms-ready", event => { hasFormDraft = Boolean(event.detail.restored); });
  document.addEventListener("composer:form-state", event => {
    if (event.detail.restored) return;
    hasFormDraft = true;
    scheduleRecovery();
  });
  document.addEventListener("composer:form-storage-error", event => {
    document.getElementById("session-status").textContent = event.detail.message;
  });

  document.getElementById("btn-recover-draft").addEventListener("click", async () => {
    if (!recoveryCandidate) return;
    const candidate = recoveryCandidate;
    const forms = hasFormDraft ? window.ComposerTemplateState.captureForms() : candidate.forms;
    recoveryCandidate = null;
    document.getElementById("recovery-banner").hidden = true;
    const ticket = beginDocumentOperation();
    const restored = await restoreProject({ ...candidate, forms }, "Recovered draft", ticket);
    if (!restored && currentDocumentOperation(ticket)) {
      recoveryCandidate = candidate;
      document.getElementById("recovery-banner").hidden = false;
      document.getElementById("session-status").textContent = "The recovery draft could not be opened. Your current canvas was kept.";
    }
  });
  document.getElementById("btn-discard-draft").addEventListener("click", async () => {
    ++recoveryRevision;
    clearTimeout(recoveryTimer);
    recoveryCandidate = null;
    document.getElementById("recovery-banner").hidden = true;
    try {
      await window.ComposerSession.clearRecovery();
      document.getElementById("session-status").textContent = "Previous canvas recovery draft discarded.";
    } catch { document.getElementById("session-status").textContent = "The recovery draft could not be removed from this browser."; }
  });

  document.addEventListener("DOMContentLoaded", async () => {
    try {
      const project = await window.ComposerSession.readRecovery();
      recoveryReady = true;
      if (sessionEdited) { scheduleRecovery(); return; }
      if (project?.composition) {
        recoveryCandidate = project;
        document.getElementById("recovery-banner").hidden = false;
        document.getElementById("session-status").textContent = "Previous canvas draft available for recovery.";
      } else if (!hasFormDraft && project?.forms) window.ComposerTemplateState.restoreForms(project.forms);
    } catch {
      recoveryReady = true;
      document.getElementById("session-status").textContent = "Recovery is unavailable. Export a project file to keep an editable backup.";
    }
  }, { once: true });

  window.addEventListener("resize", () => {
    fitCanvasElement();
    draw();
  });

  async function bootCustomAssets() {
    const stored = loadCustomAssetsFromStorage();
    const loaded = [];
    const loadedImages = new Map();
    for (const asset of stored) {
      try {
        const image = await loadImageUrl(asset.dataUrl);
        loadedImages.set(asset.id, image);
        loaded.push(asset);
      } catch {
        // drop broken entries
      }
    }
    const currentAssets = new Map(state.customAssets.map(asset => [asset.id, asset]));
    for (const asset of loaded) {
      if (!currentAssets.has(asset.id)) assetImages.set(asset.id, loadedImages.get(asset.id));
    }
    state.customAssets = [
      ...loaded.filter(asset => !currentAssets.has(asset.id)),
      ...currentAssets.values(),
    ];
    if (loaded.length !== stored.length || currentAssets.size) {
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
  layerTools = window.ComposerLayers.init(state, { changed: draw, nextId, selectTab: () => selectEditorTab(document.getElementById("tab-layers")) });
  workspaceUI = window.ComposerWorkspace.init({ selectTab: selectEditorTab, selectBrand: brand => {
    beginDocumentOperation();
    selectBrand(document.querySelector(`[data-brand="${brand}"]`));
  } });
  textTools.loadFonts();

  // —— Boot ——
  state.showGrid = loadShowGrid();
  try {
    const storedSnap = localStorage.getItem(SNAP_STORAGE_KEY);
    state.snapToGrid = storedSnap === null ? state.showGrid : storedSnap === "1";
  } catch { state.snapToGrid = state.showGrid; }
  state.gridInvert = loadGridInvert();
  state.createdPaneOpen = loadCreatedPaneOpen();
  state.tintHex = loadStoredTintHex();
  syncTintControls(state.tintHex);
  syncGridToggle();
  syncGridInvert();
  syncCreatedPane();
  bootCreatedPics();
  wireTintControls();
  history = window.ComposerSession.createHistory({ capture: captureDocument, apply: applyHistory, onChange: documentChanged, limit: 40, measure: historyRetainedBytes, maxBytes: 128 * 1024 * 1024 });
  lastDocumentKey = captureDocument().key;
  savedDocumentKey = lastDocumentKey;
  historyReady = true;
  updateDocumentStatus();
  Promise.all([preloadAssets(), bootCustomAssets()])
    .then(([failedAssets]) => {
      buildAssetPane();
      if (!assetImages.has(CUSTOM_COLOR_ID)) applyTintColor(state.tintHex, { persist: false });
      updateChrome();
      if (failedAssets) els.meta.textContent = `${failedAssets} brand assets could not load. Available assets are ready; reload to retry.`;
    })
    .catch((err) => {
      els.meta.textContent = err.message || "Failed to load brand assets";
    });
})();
