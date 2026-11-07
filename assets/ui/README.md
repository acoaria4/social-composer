# Interface renditions

These small derivatives are for the brand picker, app header, favicon, and asset-library thumbnails. Canvas placement and exported artwork use the original files under `brands/current/`.

After `npm ci` and installing a Playwright browser, run `node scripts/build-ui-assets.cjs`. The shared launcher starts a loopback server automatically. Set `COMPOSER_URL` to use an existing served copy. The generator renders sequentially and writes:

- `<brand>-<variant>.webp`: a thumbnail with a maximum edge of 192 px.
- `<brand>-brand.webp`: a 64 px icon for selector and header use.
- `favicon.png`: the studio icon at 32 px.
- `manifest.json`: source paths, sizes, dimensions, transparency, and byte totals.

Regenerate after changing the source artwork; do not replace full-resolution originals with these files.
