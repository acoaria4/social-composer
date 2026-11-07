const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const vm = require('node:vm');

const root = path.resolve(__dirname, '..');
const output = path.join(root, 'exports/sprint5');

function runtime(files, extra = {}) {
  const context = vm.createContext({ window: {}, Map, Set, WeakMap, ...extra });
  for (const file of files) vm.runInContext(fs.readFileSync(path.join(root, file), 'utf8'), context, { filename: file });
  return context.window;
}

function testDocumentModel() {
  const api = runtime(['js/text-boxes.js', 'js/document-model.js']);
  const background = { naturalWidth: 100, naturalHeight: 200 };
  const artwork = { naturalWidth: 32, naturalHeight: 16 };
  const replacement = { naturalWidth: 32, naturalHeight: 16 };
  const secondArtwork = { width: 16, height: 8 };
  const images = new Map([['stamp', artwork]]);
  const state = {
    bgImage: background, postDate: null, auraPostType: null, templateBrand: 'lumen',
    templateSource: { kind: 'lumen-fact', form: { text: 'Original source' } },
    presetKey: '1080x1920', textStyles: api.ComposerText.defaults(),
    overlays: [
      { id: 'image', assetId: 'stamp', x: 1, y: 2, width: 32, height: 16 },
      { id: 'text', type: 'text', text: 'Original text', x: 10, y: 20, width: 180, height: 84 },
    ],
    assetLabels: new Map([['stamp', 'Original label']]), selectedId: 'image', tintHex: '#d9b793',
  };
  const encoded = [];
  const model = api.ComposerDocumentModel.create(state, {
    images,
    encode(image, type) { encoded.push({ image, type }); return `data:image/png;base64,${encoded.length}`; },
  });
  const original = model.capture();
  assert.equal(original.bgImage, background, 'Snapshots retain the background by reference');
  assert.equal(original.images.get('stamp'), artwork, 'Snapshots retain artwork by reference');
  state.overlays[1].height = 900;
  assert.equal(model.capture().key, original.key, 'Derived text height does not create document edits');
  state.selectedId = 'text';
  assert.equal(model.capture().key, original.key, 'Selection does not create document edits');
  images.set('stamp', replacement);
  assert.notEqual(model.capture().key, original.key, 'A new image under the same asset ID changes the document');

  state.overlays[0].x = 50; state.overlays[1].text = 'Changed text';
  state.templateSource.form.text = 'Changed source';
  state.textStyles.header.color = '#000000'; state.assetLabels.set('stamp', 'Changed label');
  assert.equal(original.overlays[0].x, 1);
  assert.equal(original.overlays[1].text, 'Original text');
  assert.equal(original.overlays[1].height, 84);
  assert.equal(original.templateSource.form.text, 'Original source');
  assert.equal(original.textStyles.header.color, '#ffffff');
  assert.equal(original.labels.get('stamp'), 'Original label');
  assert.equal(original.images.get('stamp'), artwork, 'Replacement does not mutate a prior snapshot');

  const png = model.portableImage(artwork);
  assert.equal(model.portableImage(artwork), png);
  model.portableImage(replacement); model.portableImage(replacement);
  assert.equal(encoded.length, 2, 'Each immutable image is encoded only once');
  assert.ok(encoded.every(call => call.type === 'image/png'), 'Project resources use PNG encoding');
  const another = { bgImage: background, images: new Map([['same', artwork], ['background-again', background], ['other', secondArtwork]]) };
  assert.equal(model.retainedBytes([original, original, another]), 82560 + png.length * 2, 'Memory accounting counts shared resources once and includes cached raster data');
  return { copiedProperties: true, retainedImageReferences: true, derivedStateExcluded: true, imageReplacementTracked: true, pngCachePerImage: true, sharedMemoryDeduplicated: true };
}

function testHistory() {
  const { ComposerSession } = runtime(['js/document-session.js']);
  let current = { key: 'empty' }, captures = 0;
  const events = [];
  const history = ComposerSession.createHistory({
    capture: () => { captures++; return current; },
    apply: snapshot => { current = snapshot; },
    onChange: event => events.push(event),
  });
  const placed = current = { key: 'placed' }; history.record();
  assert.equal(captures, 2, 'Recording captures once after its initial baseline');
  assert.equal(events.at(-1).snapshot, placed);
  assert.equal(history.current(), placed, 'Notifications and current() expose the already captured snapshot');
  assert.equal(captures, 2, 'Reading current() does not capture again');
  current = { key: 'a' }; history.record('typing');
  current = { key: 'ab' }; history.record('typing');
  history.undo(); assert.equal(current, placed, 'Uninterrupted typing is one undo action');
  history.undo(); assert.equal(current.key, 'empty');
  history.redo(); assert.equal(current, placed);
  assert.equal(events.at(-1).snapshot, placed, 'Undo and redo notify the applied snapshot');
  current = { key: 'new branch' }; history.record();
  assert.equal(history.canRedo(), false, 'Editing after undo discards the prior redo branch');

  let baseline = { key: '0', bytes: 1 };
  const bounded = ComposerSession.createHistory({
    capture: () => baseline, apply: snapshot => { baseline = snapshot; },
    maxBytes: 3, measure: entries => entries.reduce((sum, entry) => sum + entry.bytes, 0),
  });
  for (const key of ['1', '2', '3']) { baseline = { key, bytes: 1 }; bounded.record(); }
  bounded.undo(); assert.equal(baseline.key, '2');
  bounded.undo(); assert.equal(baseline.key, '1');
  assert.equal(bounded.undo(), false, 'Resource pruning removes older history');
  baseline = { key: 'large', bytes: 10 }; bounded.record();
  assert.equal(bounded.undo(), true, 'Resource pruning still preserves the most recent undo');
  assert.equal(baseline.key, '1');
  assert.equal(bounded.undo(), false);

  let grouped = { key: 'empty' };
  const collapsed = ComposerSession.createHistory({ capture: () => grouped, apply: snapshot => { grouped = snapshot; } });
  grouped = { key: 'placed' }; collapsed.record();
  grouped = { key: 'typed' }; collapsed.record('typing');
  grouped = { key: 'placed' }; collapsed.record('typing');
  grouped = { key: 'typed again' }; collapsed.record('typing');
  collapsed.undo(); assert.equal(grouped.key, 'placed');
  collapsed.undo(); assert.equal(grouped.key, 'empty', 'Returning typing to its baseline does not overwrite the preceding action');
  return { oneCapturePerRecord: true, notificationsReuseSnapshot: true, groupedUndo: true, redoBranching: true, resourcePruning: true, collapsedGroupPreservesPreviousAction: true };
}

async function testAssetStore() {
  const requests = [];
  class FakeImage {
    constructor() { this.width = this.naturalWidth = 32; this.height = this.naturalHeight = 16; }
    set src(value) { this.url = value; requests.push(this); }
  }
  const { ComposerAssetStore } = runtime(['js/asset-store.js'], { Image: FakeImage });
  const images = new Map();
  const store = ComposerAssetStore.create({ images, aliases: { legacy: 'stamp' }, sourceFor: id => `/art/${id}.png` });
  const direct = store.load('stamp'), alias = store.load('legacy');
  assert.equal(requests.length, 1, 'Concurrent canonical and alias loads share one image request');
  assert.equal(store.pendingCount, 1);
  const image = requests[0]; image.onload();
  assert.equal(await direct, image); assert.equal(await alias, image);
  assert.equal(images.get('stamp'), image); assert.equal(images.get('legacy'), image);
  assert.equal(store.pendingCount, 0);
  assert.equal(await store.load('stamp'), image);
  assert.equal(requests.length, 1, 'Loaded artwork is reused');

  const failed = store.load('broken'); requests.at(-1).onerror();
  await assert.rejects(failed, /Could not load image asset/);
  assert.equal(store.pendingCount, 0);
  const retry = store.load('broken'), retryImage = requests.at(-1); retryImage.onload();
  assert.equal(await retry, retryImage, 'A failed load can be retried');
  assert.equal(requests.length, 3);

  const pending = store.load('restored');
  const embedded = { naturalWidth: 80, naturalHeight: 40, embedded: true };
  images.set('restored', embedded);
  requests.at(-1).onload();
  assert.equal(await pending, embedded, 'A late source load cannot replace an explicitly restored image');
  assert.equal(images.get('restored'), embedded);

  const oldProject = Object.freeze({ width: 64, height: 64 });
  const historySnapshot = { images: new Map([['project-old', oldProject]]) };
  images.set('project-old', oldProject);
  const removed = store.prune(['legacy', 'restored']);
  assert.ok(removed >= 2);
  assert.equal(images.has('project-old'), false, 'Unused project images leave the active asset registry');
  assert.equal(images.has('broken'), false);
  assert.equal(images.get('stamp'), image, 'Keeping an alias retains its canonical image');
  assert.equal(images.get('restored'), embedded);
  assert.equal(historySnapshot.images.get('project-old'), oldProject, 'Pruning does not dispose resources retained by history');
  assert.equal(oldProject.width, 64); assert.equal(oldProject.height, 64);
  return { concurrentAliasesDeduplicated: true, cachedLoadReused: true, failedLoadRetry: true, restoredImageWinsPendingLoad: true, unusedProjectsPruned: true, historyResourcesPreserved: true };
}

function testRenderScheduler() {
  const { ComposerRenderScheduler } = runtime(['js/render-scheduler.js']);
  const frames = new Map();
  let nextId = 0, draws = 0;
  const scheduler = ComposerRenderScheduler.create(() => { draws++; }, {
    request(callback) { const id = nextId++; frames.set(id, callback); return id; },
    cancel(id) { frames.delete(id); },
  });
  const advance = () => {
    const callbacks = [...frames.values()]; frames.clear();
    for (const callback of callbacks) callback();
  };
  for (let index = 0; index < 100; index++) scheduler.request();
  assert.equal(draws, 0, 'Queued pointer updates do not render synchronously');
  assert.equal(frames.size, 1, 'A burst of pointer updates schedules one frame');
  advance(); assert.equal(draws, 1);
  scheduler.request(); advance(); assert.equal(draws, 2, 'New work can schedule another frame after rendering');
  assert.equal(scheduler.flush(), false, 'An empty flush does not render');
  assert.equal(draws, 2);
  scheduler.request();
  const obsoleteFrame = [...frames.values()][0];
  assert.equal(scheduler.flush(), true);
  assert.equal(draws, 3, 'Flush renders buffered work synchronously');
  assert.equal(frames.size, 0, 'Flush cancels its queued frame');
  obsoleteFrame(); assert.equal(draws, 3, 'A canceled callback cannot render again after a flush');
  scheduler.request();
  assert.equal(scheduler.cancel(), true);
  advance(); assert.equal(draws, 3, 'Cancel drops pending work without rendering');
  assert.equal(scheduler.cancel(), false);
  scheduler.request(); advance(); assert.equal(draws, 4, 'Scheduling still works after cancellation');

  let rescheduled = false, reentrantDraws = 0, reentrant;
  reentrant = ComposerRenderScheduler.create(() => {
    reentrantDraws++;
    if (!rescheduled) { rescheduled = true; reentrant.request(); }
  }, {
    request(callback) { const id = nextId++; frames.set(id, callback); return id; },
    cancel(id) { frames.delete(id); },
  });
  reentrant.request(); advance();
  assert.equal(reentrantDraws, 1); assert.equal(frames.size, 1);
  advance(); assert.equal(reentrantDraws, 2, 'Work queued by a render runs in the next frame');
  return { pointerBurstCoalesced: true, synchronousFlush: true, emptyFlushNoop: true, cancelWithoutRender: true, canceledFrameIgnored: true, nextFrameRescheduling: true };
}

(async () => {
  const evidence = { documentModel: testDocumentModel(), history: testHistory(), assetStore: await testAssetStore(), renderScheduler: testRenderScheduler() };
  fs.mkdirSync(output, { recursive: true });
  fs.writeFileSync(path.join(output, 'core-models-results.json'), JSON.stringify(evidence, null, 2));
  console.log('PASS: document snapshots, history capture reuse, lazy assets, and coalesced rendering.');
})().catch(error => { console.error(error); process.exitCode = 1; });
