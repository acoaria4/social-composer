(() => {
  'use strict';

  function create({ images, aliases = {}, sourceFor }) {
    if (!(images instanceof Map) || typeof sourceFor !== 'function') {
      throw new TypeError('An asset store requires an image Map and source lookup.');
    }
    const pending = new Map();
    const hasAlias = id => aliases instanceof Map ? aliases.has(id) : Object.hasOwn(aliases, id);
    const aliasFor = id => aliases instanceof Map ? aliases.get(id) : aliases[id];

    function canonicalId(id) {
      if (typeof id !== 'string' || !id) throw new TypeError('An image asset requires an ID.');
      const visited = new Set();
      let current = id;
      while (hasAlias(current)) {
        if (visited.has(current)) throw new Error('Image asset aliases contain a cycle.');
        visited.add(current);
        current = aliasFor(current);
        if (typeof current !== 'string' || !current) throw new TypeError('An image asset alias requires an ID.');
      }
      return current;
    }

    function load(id) {
      let canonical;
      try { canonical = canonicalId(id); }
      catch (error) { return Promise.reject(error); }
      if (images.has(id)) return Promise.resolve(images.get(id));
      if (images.has(canonical)) {
        const image = images.get(canonical);
        if (id !== canonical) images.set(id, image);
        return Promise.resolve(image);
      }

      if (!pending.has(canonical)) {
        let source;
        try { source = sourceFor(canonical); }
        catch (error) { return Promise.reject(error); }
        if (typeof source !== 'string' || !source) {
          return Promise.reject(new Error(`Image asset “${canonical}” is unavailable.`));
        }
        const request = new Promise((resolve, reject) => {
          const image = new Image();
          image.decoding = 'async';
          image.onload = () => {
            image.onload = image.onerror = null;
            // An explicit restore may have installed its embedded image while
            // this source was loading. Keep that document-owned value intact.
            if (!images.has(canonical)) images.set(canonical, image);
            resolve(images.get(canonical));
          };
          image.onerror = () => {
            image.onload = image.onerror = null;
            reject(new Error(`Could not load image asset “${canonical}”. Retry to try again.`));
          };
          image.src = source;
        });
        const settled = request.finally(() => { pending.delete(canonical); });
        pending.set(canonical, settled);
      }
      return pending.get(canonical).then(image => {
        if (id !== canonical && !images.has(id)) images.set(id, image);
        return images.get(id) || image;
      });
    }

    function prune(keepIds = []) {
      const ids = typeof keepIds === 'string' ? [keepIds] : keepIds;
      const keep = new Set([...ids].map(canonicalId));
      let removed = 0;
      for (const id of images.keys()) {
        if (!keep.has(canonicalId(id))) {
          images.delete(id);
          removed++;
        }
      }
      // Deleting Map keys deliberately does not close or mutate image objects.
      // Undo snapshots retain their own references to resources they still use.
      return removed;
    }

    return {
      load, prune,
      stats: () => ({ loaded: images.size, pending: pending.size }),
      get loadedCount() { return images.size; },
      get pendingCount() { return pending.size; },
    };
  }

  window.ComposerAssetStore = { create };
})();
