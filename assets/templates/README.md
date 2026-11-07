# Template previews

These WebP thumbnails come from the app's existing local renderers. They show layout samples, not live horoscopes or API results. The AURA samples use 7 November 2026 and placeholder readings; the Lumen sample uses placeholder copy.

To regenerate them, serve the app, make Playwright available through `NODE_PATH`, and run `node scripts/build-template-previews.cjs`. `COMPOSER_URL` can override the default local URL. Chrome runs once and renders the three previews sequentially.
