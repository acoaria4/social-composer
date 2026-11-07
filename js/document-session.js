(() => {
  'use strict';

  const FORMAT = 'social-composer-project';
  const VERSION = 1;
  const MAX_PROJECT_SIZE = 50 * 1024 * 1024;
  const PRESETS = new Set(['native', '1080x1080', '1080x1350', '1080x1920', '1200x630', '1600x900']);
  const BAD_KEYS = new Set(['__proto__', 'constructor', 'prototype']);
  const ID = /^[a-zA-Z0-9][a-zA-Z0-9_-]{0,99}$/;

  function createHistory({ capture, apply, onChange = () => {}, limit = 40, measure = () => 0, maxBytes = Infinity }) {
    if (typeof capture !== 'function' || typeof apply !== 'function') {
      throw new TypeError('History requires capture and apply functions.');
    }
    const maximum = Number.isInteger(limit) && limit > 0 ? limit : 40;
    if (typeof measure !== 'function') throw new TypeError('History resource measurement must be a function.');
    const resourceLimit = typeof maxBytes === 'number' && maxBytes >= 0 ? maxBytes : Infinity;
    let entries = [capture()];
    let index = 0;
    let activeGroup = null;
    let applying = false;

    function notify() {
      onChange({ canUndo: index > 0, canRedo: index < entries.length - 1, undoCount: index, redoCount: entries.length - index - 1 });
    }

    function trimResources() {
      if (!Number.isFinite(resourceLimit)) return;
      // Keep the current document and one immediately preceding action even
      // when either image alone exceeds the budget. Shared images can be
      // counted once by the host's measurement rather than once per snapshot.
      while (entries.length > 2 && measure(entries) > resourceLimit) {
        entries.shift();
        index--;
      }
    }

    function record(group = null) {
      if (applying) return false;
      const snapshot = capture();
      if (!snapshot || typeof snapshot.key !== 'string') throw new TypeError('A history snapshot requires a string key.');
      if (snapshot.key === entries[index].key) {
        if (group === null || group !== activeGroup) activeGroup = null;
        return false;
      }
      if (group !== null && group === activeGroup && index > 0 && index === entries.length - 1) {
        if (snapshot.key === entries[index - 1].key) {
          entries.pop();
          index--;
          activeGroup = null;
          notify();
          return true;
        } else entries[index] = snapshot;
      } else {
        entries = entries.slice(0, index + 1);
        entries.push(snapshot);
        if (entries.length > maximum + 1) entries.shift();
        index = entries.length - 1;
      }
      trimResources();
      activeGroup = group;
      notify();
      return true;
    }

    function step(direction) {
      const next = index + direction;
      if (next < 0 || next >= entries.length) return false;
      activeGroup = null;
      applying = true;
      try {
        // Images, canvases and Maps are deliberately retained by reference.
        // The host captures immutable document properties around those resources.
        apply(entries[next]);
        index = next;
      } finally {
        applying = false;
      }
      notify();
      return true;
    }

    return {
      record,
      undo: () => step(-1),
      redo: () => step(1),
      canUndo: () => index > 0,
      canRedo: () => index < entries.length - 1,
      endGroup: () => { activeGroup = null; },
      reset: () => { entries = [capture()]; index = 0; activeGroup = null; notify(); },
    };
  }

  function fail(message) {
    throw new Error(`This project cannot be opened: ${message}`);
  }

  function recordObject(value, label) {
    if (!value || typeof value !== 'object' || Array.isArray(value) ||
      ![Object.prototype, null].includes(Object.getPrototypeOf(value))) fail(`${label} is invalid.`);
    for (const key of Object.keys(value)) {
      if (BAD_KEYS.has(key) || Object.getOwnPropertyDescriptor(value, key)?.get || Object.getOwnPropertyDescriptor(value, key)?.set) {
        fail(`${label} contains an unsupported property.`);
      }
    }
    return value;
  }

  function text(value, label, maximum = 20000) {
    if (typeof value !== 'string' || value.length > maximum) fail(`${label} is invalid or too long.`);
    return value;
  }

  function identifier(value, label) {
    if (typeof value !== 'string' || !ID.test(value) || BAD_KEYS.has(value)) fail(`${label} is invalid.`);
    return value;
  }

  function geometry(value, label, minimum = -1000000) {
    if (!Number.isFinite(value) || value < minimum || value > 1000000) fail(`${label} is invalid.`);
    return value;
  }

  function cloneJSON(value, label, depth = 0, budget = { nodes: 0 }) {
    if (depth > 16 || ++budget.nodes > 20000) fail(`${label} is too complex.`);
    if (value === null || typeof value === 'boolean') return value;
    if (typeof value === 'string') return text(value, label);
    if (typeof value === 'number') {
      if (!Number.isFinite(value)) fail(`${label} contains an invalid number.`);
      return value;
    }
    if (Array.isArray(value)) {
      if (value.length > 1000) fail(`${label} contains too many items.`);
      return value.map((item, index) => cloneJSON(item, `${label}[${index}]`, depth + 1, budget));
    }
    recordObject(value, label);
    const out = {};
    for (const [key, item] of Object.entries(value)) {
      if (key.length > 100) fail(`${label} contains an invalid property name.`);
      out[key] = cloneJSON(item, `${label}.${key}`, depth + 1, budget);
    }
    return out;
  }

  function imageData(value, label) {
    if (typeof value !== 'string' || value.length > MAX_PROJECT_SIZE) fail(`${label} is missing or too large.`);
    const match = /^data:image\/(png|jpeg|webp);base64,([a-zA-Z0-9+/]+={0,2})$/.exec(value);
    if (!match || match[2].length % 4 !== 0) fail(`${label} must be an embedded PNG, JPEG, or WebP image.`);
    let header;
    try { header = atob(match[2].slice(0, 32)); } catch { fail(`${label} has invalid image data.`); }
    const valid = match[1] === 'png' ? header.startsWith('\x89PNG\r\n\x1a\n')
      : match[1] === 'jpeg' ? header.startsWith('\xff\xd8\xff')
      : header.startsWith('RIFF') && header.slice(8, 12) === 'WEBP';
    if (!valid) fail(`${label} does not contain the stated raster image type.`);
    return value;
  }

  function readingDate(value) {
    if (value === undefined || value === null) return null;
    if (typeof value !== 'string' || !/^\d{4}-\d{2}-\d{2}$/.test(value)) fail('the reading date is invalid.');
    const date = new Date(`${value}T12:00:00Z`);
    if (!Number.isFinite(date.getTime()) || date.toISOString().slice(0, 10) !== value) fail('the reading date is invalid.');
    return value;
  }

  function composition(value) {
    if (value === null) return null;
    const source = recordObject(value, 'the composition');
    const assets = recordObject(source.assetDataUrls, 'the asset collection');
    if (Object.keys(assets).length > 100) fail('there are too many embedded images.');
    const assetDataUrls = {};
    for (const [id, image] of Object.entries(assets)) assetDataUrls[identifier(id, 'an asset ID')] = imageData(image, 'an asset image');
    if (!Array.isArray(source.overlays) || source.overlays.length > 200) fail('the layer collection is invalid or too large.');
    const ids = new Set();
    const overlays = source.overlays.map((value, index) => {
      const layer = recordObject(value, `layer ${index + 1}`);
      if (layer.type !== undefined && !['image', 'text'].includes(layer.type)) fail(`layer ${index + 1} has an unsupported type.`);
      const type = layer.type === 'text' ? 'text' : 'image';
      const out = {
        type,
        x: geometry(layer.x, 'a layer position'),
        y: geometry(layer.y, 'a layer position'),
        width: geometry(layer.width, 'a layer width', type === 'text' ? 48 : Number.MIN_VALUE),
        height: geometry(layer.height, 'a layer height', Number.MIN_VALUE),
        hidden: layer.hidden === true,
        locked: layer.locked === true,
      };
      if (layer.id !== undefined) {
        out.id = identifier(layer.id, 'a layer ID');
        if (ids.has(out.id)) fail('two layers have the same ID.');
        ids.add(out.id);
      }
      if (layer.name !== undefined) out.name = text(layer.name, 'a layer name', 200);
      if (layer.label !== undefined) out.label = text(layer.label, 'a layer label', 200);
      if (type === 'text') out.text = text(layer.text, 'layer text');
      else {
        out.assetId = identifier(layer.assetId, 'a layer asset ID');
        if (!Object.hasOwn(assetDataUrls, out.assetId)) fail('a layer is missing its embedded image.');
      }
      return out;
    });
    if (!PRESETS.has(source.presetKey)) fail('the canvas size is unsupported.');
    if (source.templateBrand !== undefined && source.templateBrand !== null && source.templateBrand !== 'lumen') fail('the template brand is unsupported.');
    if (source.auraPostType !== undefined && source.auraPostType !== null && !['cover', 'horoscope'].includes(source.auraPostType)) fail('the AURA post type is unsupported.');
    if (source.tintHex !== undefined && !/^#[a-fA-F0-9]{6}$/.test(source.tintHex)) fail('the tint color is invalid.');
    if (typeof window.ComposerText?.normalize !== 'function') fail('text support is unavailable. Reload the editor and retry.');
    const out = {
      bgDataUrl: imageData(source.bgDataUrl, 'the background'),
      presetKey: source.presetKey,
      postDate: readingDate(source.postDate),
      auraPostType: source.auraPostType || null,
      templateBrand: source.templateBrand || null,
      tintHex: source.tintHex || '#d9b793',
      textStyles: window.ComposerText.normalize(source.textStyles === undefined ? undefined : cloneJSON(source.textStyles, 'text styles')),
      overlays,
      assetDataUrls,
      templateSource: source.templateSource === undefined ? null : cloneJSON(source.templateSource, 'template source'),
    };
    if (source.assetLabels !== undefined) {
      const labels = recordObject(source.assetLabels, 'asset labels');
      if (Object.keys(labels).length > 100) fail('there are too many asset labels.');
      out.assetLabels = {};
      for (const [id, label] of Object.entries(labels)) out.assetLabels[identifier(id, 'an asset label ID')] = text(label, 'an asset label', 120);
    }
    for (const key of ['showGrid', 'snapToGrid', 'gridInvert']) {
      if (source[key] !== undefined) {
        if (typeof source[key] !== 'boolean') fail(`${key} must be true or false.`);
        out[key] = source[key];
      }
    }
    for (const key of ['width', 'height']) if (source[key] !== undefined) out[key] = geometry(source[key], `the canvas ${key}`, Number.MIN_VALUE);
    return out;
  }

  function validateProject(value) {
    const source = recordObject(value, 'the project');
    if (source.format !== FORMAT || source.version !== VERSION) fail('the project format or version is unsupported.');
    const out = {
      format: FORMAT,
      version: VERSION,
      composition: composition(source.composition),
      forms: source.forms === undefined ? {} : cloneJSON(recordObject(source.forms, 'form drafts'), 'form drafts'),
    };
    if (source.name !== undefined) out.name = text(source.name, 'the project name', 200);
    if (source.savedAt !== undefined) {
      if (!Number.isFinite(source.savedAt) || source.savedAt < 0) fail('the saved date is invalid.');
      out.savedAt = source.savedAt;
    }
    if (JSON.stringify(out).length > MAX_PROJECT_SIZE) fail('the project exceeds the 50 MB size limit.');
    return out;
  }

  let databasePromise = null;
  let recoveryQueue = Promise.resolve();

  function openRecoveryDatabase() {
    if (databasePromise) return databasePromise;
    databasePromise = new Promise((resolve, reject) => {
      if (!window.indexedDB) { reject(new Error('Draft recovery is unavailable in this browser. Export a project backup to keep your work.')); return; }
      let settled = false;
      let request;
      const failOpen = message => {
        if (settled) return;
        settled = true;
        reject(new Error(message));
      };
      try { request = window.indexedDB.open('social-composer-recovery', 1); }
      catch { failOpen('Draft recovery storage is unavailable. Export a project backup to keep your work.'); return; }
      request.onupgradeneeded = () => {
        if (!request.result.objectStoreNames.contains('projects')) request.result.createObjectStore('projects');
      };
      request.onerror = () => failOpen('Draft recovery storage could not be opened. Export a project backup to keep your work.');
      request.onblocked = () => failOpen('Draft recovery storage is busy in another tab. Close other editor tabs and retry.');
      request.onsuccess = () => {
        const database = request.result;
        if (settled) { database.close(); return; }
        settled = true;
        database.onversionchange = () => { database.close(); databasePromise = null; };
        resolve(database);
      };
    }).catch(error => { databasePromise = null; throw error; });
    return databasePromise;
  }

  function queueRecovery(action) {
    const operation = recoveryQueue.then(action, action);
    recoveryQueue = operation.catch(() => {});
    return operation;
  }

  async function recoveryTransaction(mode, action) {
    const database = await openRecoveryDatabase();
    return new Promise((resolve, reject) => {
      let result;
      let transaction;
      try {
        transaction = database.transaction('projects', mode);
        const request = action(transaction.objectStore('projects'));
        request.onsuccess = () => { result = request.result; };
      } catch {
        reject(new Error('Draft recovery storage is unavailable. Export a project backup to keep your work.'));
        return;
      }
      transaction.oncomplete = () => resolve(result);
      transaction.onerror = transaction.onabort = () => reject(new Error('The recovery draft could not be stored or read. Export a project backup to keep your work.'));
    });
  }

  function writeRecovery(project) {
    let clean;
    try { clean = validateProject(project); } catch (error) { return Promise.reject(error); }
    return queueRecovery(() => recoveryTransaction('readwrite', store => store.put(clean, 'current'))).then(() => undefined);
  }

  function readRecovery() {
    return queueRecovery(async () => {
      const project = await recoveryTransaction('readonly', store => store.get('current'));
      return project === undefined ? null : validateProject(project);
    });
  }

  function clearRecovery() {
    return queueRecovery(() => recoveryTransaction('readwrite', store => store.delete('current'))).then(() => undefined);
  }

  window.ComposerSession = { createHistory, validateProject, writeRecovery, readRecovery, clearRecovery };
})();
