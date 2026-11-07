(() => {
  'use strict';

  // Encoding never mutates the source image or editor state. Temporary canvas
  // bitmaps are released immediately after their encoded string is returned.
  function canvasFromSource(source, willReadFrequently = false) {
    const width = source?.naturalWidth || source?.width;
    const height = source?.naturalHeight || source?.height;
    if (!Number.isFinite(width) || !Number.isFinite(height) || width <= 0 || height <= 0) {
      throw new Error('Invalid image source');
    }
    const canvas = document.createElement('canvas');
    canvas.width = width;
    canvas.height = height;
    canvas.getContext('2d', { willReadFrequently }).drawImage(source, 0, 0);
    return canvas;
  }

  function release(canvas) {
    canvas.width = 0;
    canvas.height = 0;
  }

  function sourceToDataUrl(source, type = 'image/png', quality) {
    const canvas = canvasFromSource(source);
    try {
      return quality != null ? canvas.toDataURL(type, quality) : canvas.toDataURL(type);
    } finally { release(canvas); }
  }

  function backgroundToDataUrl(source) {
    const canvas = canvasFromSource(source, true);
    try {
      const context = canvas.getContext('2d');
      // Strip reads retain the existing exact-alpha decision without allocating
      // a second full-size pixel buffer for large backgrounds.
      for (let y = 0; y < canvas.height; y += 64) {
        const pixels = context.getImageData(0, y, canvas.width, Math.min(64, canvas.height - y)).data;
        for (let alpha = 3; alpha < pixels.length; alpha += 4) {
          if (pixels[alpha] !== 255) return canvas.toDataURL('image/png');
        }
      }
      return canvas.toDataURL('image/jpeg', 0.88);
    } finally { release(canvas); }
  }

  function makeThumbnail(source, maxEdge = 320) {
    if (!Number.isFinite(maxEdge) || maxEdge <= 0) throw new Error('Invalid thumbnail size');
    const width = source?.naturalWidth || source?.width;
    const height = source?.naturalHeight || source?.height;
    if (!Number.isFinite(width) || !Number.isFinite(height) || width <= 0 || height <= 0) {
      throw new Error('Invalid image source');
    }
    const scale = Math.min(1, maxEdge / Math.max(width, height));
    const canvas = document.createElement('canvas');
    canvas.width = Math.max(1, Math.round(width * scale));
    canvas.height = Math.max(1, Math.round(height * scale));
    try {
      canvas.getContext('2d').drawImage(source, 0, 0, canvas.width, canvas.height);
      return canvas.toDataURL('image/jpeg', 0.82);
    } finally { release(canvas); }
  }

  function previewDataUrl(source, maxEdge = 192) {
    if (!Number.isFinite(maxEdge) || maxEdge <= 0) throw new Error('Invalid preview size');
    const width = source?.naturalWidth || source?.width;
    const height = source?.naturalHeight || source?.height;
    if (!Number.isFinite(width) || !Number.isFinite(height) || width <= 0 || height <= 0) {
      throw new Error('Invalid image source');
    }
    const scale = Math.min(1, maxEdge / Math.max(width, height));
    const canvas = document.createElement('canvas');
    canvas.width = Math.max(1, Math.round(width * scale));
    canvas.height = Math.max(1, Math.round(height * scale));
    try {
      canvas.getContext('2d').drawImage(source, 0, 0, canvas.width, canvas.height);
      return canvas.toDataURL('image/webp', 0.9);
    } finally { release(canvas); }
  }

  window.ComposerCanvasIO = { canvasFromSource, sourceToDataUrl, backgroundToDataUrl, makeThumbnail, previewDataUrl };
})();
