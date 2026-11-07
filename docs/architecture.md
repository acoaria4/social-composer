# Editor maintenance

The app is static HTML, CSS, and browser JavaScript. The npm dependencies are development tools; publishing still serves the repository directly without a build.

## Runtime boundaries

| Module | Owns | Contract |
| --- | --- | --- |
| `composer.js` | Document operations and integration | Stage asynchronous work before committing it. A newer document ticket invalidates older work. |
| `document-model.js` | Immutable document snapshots and image identities | Copy authored properties; retain artwork by reference. Derived text height and selection do not change document identity. |
| `document-session.js` | History, project validation, IndexedDB recovery | Notify with the already-captured snapshot. History retains its own artwork references. Recovery writes are ordered. |
| `canvas-io.js` | Image encoding and small previews | Original artwork stays full resolution. Private encoding canvases are released after use; inputs are never disposed. |
| `asset-store.js` | Original-image loading and cache lifetime | Deduplicate concurrent loads, allow retry, preserve restored images, and remove unused registry references. |
| `render-scheduler.js` | Frame scheduling | Coalesce pointer updates and resize work. Flush gestures before ending an interaction, changing documents, or stepping history. Resize layout writes run outside observer delivery. |
| `viewport.js` | Preview zoom and pan | Preview coordinates never alter export pixels. |
| `text-boxes.js` / `layers.js` | Editable objects and their controls | Keep locks, visibility, stacking, focus, and text overflow checks consistent. |
| `workspace.js` | Template navigation and mobile views | Brand-filtered library and inspector navigation stay independent. |

The scripts in `index.html` load these globals in dependency order. Keep that order when adding a module; there is no bundler.

## Artwork lifetime

The interface uses the small files in `assets/ui/`. Browsing a brand's thumbnails does not request the original PNGs. An insert loads its original from `brands/current/`, checks that its document ticket and custom-library entry remain current, and then commits the layer. Clicking another document action cancels earlier inserts. Removed custom entries cannot reappear through an older queued insert.

Current layers own references in the active image registry. History snapshots retain separate image Maps, so pruning the active registry cannot damage undo. Do not zero, close, or mutate those shared source images. Temporary encoding canvases belong to their encoding helper and may be released immediately after the encoded string or Blob is created.

Template renderers keep their bounded artwork caches and retain the approved full-resolution post layouts. Portable projects embed original-resolution PNGs. UI thumbnails are never used as export sources.

## Persistence and errors

Browser library writes complete before the visible library changes. A rejected upload or removal leaves existing data intact and shows persistent feedback beside that library. Limits never silently evict an older entry. Restoring a canvas can still use its embedded images when the separate custom library is full.

Recovery uses the captured history snapshot instead of serializing the mutable document again during every pointer event. Its delayed status cannot overwrite a newer import error. Local recovery and saved designs remain separate from downloaded project backups.

## Reproducible checks

`npm ci` installs the exact Playwright version in `package-lock.json`. `npm test` checks JavaScript syntax and runs every `scripts/test-*.cjs` suite sequentially through the shared loopback server. `npm test -- --suite test-performance.cjs` runs one suite. Results and per-suite logs live in `exports/checks/<browser>/`.

The server exposes the app and public assets only; `.git`, private files, test sources, traversal, and symlink escapes are blocked. Each suite runs in a separate process with a timeout, and the runner cleans up only that process tree on cancellation.

Set `COMPOSER_BROWSER` to `chromium`, `firefox`, or `webkit` after installing that Playwright browser. Local Chromium uses installed Chrome when available; CI uses the pinned browser package. Windows Chromium and Firefox checks select software graphics. Native CDP touch injection runs in Chromium; the remaining viewport checks run on all three engines. The CI matrix runs one engine job at a time and retains evidence for seven days.

If a restricted Windows automation host reports a Firefox graphics or launch permission error, repeat the same command from a normal development terminal and preserve the original log. Record environment launch failures separately from application assertion failures. Test graphics settings do not change the deployed app.

Standalone suites and artwork generators use the same launcher and start their own server when `COMPOSER_URL` is unset. Console failure summaries omit embedded image data; the complete per-suite log remains available in `exports/checks/<browser>/`.

`test-performance.cjs` enforces a 1.5 MB cold-start resource-body budget, zero full-resolution brand requests before insertion, original-resolution project assets, frame coalescing, snapshot reuse, delayed-load cancellation, retry, and cache pruning with exact-pixel undo. Resource-body measurements use a local server without compression or cache; they are not production Core Web Vitals or a claimed network speed.
