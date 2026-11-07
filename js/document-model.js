(() => {
  'use strict';

  function create(state, { images: assetImages, encode }) {
    const imageIds = new WeakMap();
    const rasterCopies = new WeakMap();
    let imageSequence = 0;
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
      if (!rasterCopies.has(image)) rasterCopies.set(image, encode(image, 'image/png'));
      return rasterCopies.get(image);
    }

    function retainedBytes(snapshots) {
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

    function capture() {
      const overlays = state.overlays.map(copyOverlay);
      const images = new Map();
      const labels = new Map();
      for (const layer of overlays) {
        if (layer.type === 'text') continue;
        if (assetImages.has(layer.assetId)) images.set(layer.assetId, assetImages.get(layer.assetId));
        labels.set(layer.assetId, state.assetLabels.get(layer.assetId) || layer.assetId);
      }
      // Properties are copied while the immutable artwork stays by reference.
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
        overlays: overlays.map(layer => layer.type === 'text' ? { ...layer, height: undefined } : layer),
        images: [...images].map(([id, image]) => [id, imageIdentity(image)]),
      });
      return snapshot;
    }

    return { capture, copyValue, copyOverlay, portableImage, retainedBytes };
  }

  window.ComposerDocumentModel = { create };
})();
