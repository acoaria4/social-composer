# Performance and maintenance — Sprint 5

Measured locally on 7 November 2026, against `main` at `a7d8b5e`. The editor still ships as static files with no runtime dependencies or build step.

| Check | Before | After |
| --- | ---: | ---: |
| Cold-start resource bodies, local Chromium | 13,211,731 B | 967,578 B |
| Full-resolution brand requests at startup | 25 | 0 |
| UI rendition set | Full-resolution originals | 166,139 B for 29 small images |
| Changed document snapshots for 100 pointer moves in one frame | Per-event work | 1 |

Startup resource bodies fell by about **93%**. This is an uncompressed local resource measurement, including scripts, fonts, and images, rather than a production page-speed score or real-device timing claim. `test-performance.cjs` enforces a 1.5 MB startup budget and no original brand requests before insertion. It also proves that project images retain the source dimensions.

## Changes

- Brand buttons, the header, favicon, and asset thumbnails use small local renditions. Selecting an asset loads its full-resolution original with a loading state and retry feedback.
- Pointer updates share one animation frame. History passes its captured snapshot to recovery instead of capturing the same changed document again.
- Resize observation schedules layout writes in the next animation frame, preventing recursive resize-delivery warnings in WebKit.
- Replacing or clearing a document invalidates older image inserts. Removing a custom asset also invalidates its queued insert.
- Unused active image references are pruned after document changes. Undo owns its retained images separately and restores exact pixels; this does not claim immediate garbage collection or measure process memory.
- Undo and redo prune the active registry too. Restoring a snapshot without a placed tint layer rebuilds its palette preview, so the next insertion uses the restored color.
- Custom-library additions and removals commit to browser storage before updating visible data. Count, encoded-size, and write failures preserve the previous library and show persistent feedback.
- Image encoding, document snapshots, image loading, and rendering schedules have separate modules. Private encoding canvases are released after use without disposing shared artwork.
- CI selects Node 24 and uses the Playwright version pinned in the lockfile. The automatic job runs the complete serial suite in the runner's installed Chrome. Firefox and WebKit are available as manual checks using a Playwright image with the browsers and system dependencies installed.

## Verification and evidence

All 17 suites passed locally in each of Chromium, Firefox, and WebKit, run sequentially on Windows. This includes 15 browser suites and two Node suites per engine run. JavaScript syntax checks and `git diff --check` also passed. Desktop and phone workspace screenshots were inspected.

Run `npm ci`, install the desired Playwright engine, and run `npm test`. Use `COMPOSER_BROWSER` for Firefox or WebKit; use `npm test -- --suite test-performance.cjs` for the focused performance check. See [architecture.md](architecture.md) for resource and persistence contracts.

Local evidence is generated under the ignored `exports/` directory:

- `sprint5/baseline.json`: original cold-start requests and resource bodies.
- `performance/<engine>/results.json`: startup budget, original-resolution images, one-frame pointer burst, canceled inserts, retries, tint previews, and repeated project imports.
- `checks/<engine>/results.json`: suite results and individual logs.
- `sprint5/core-models-results.json`: snapshot isolation, image lifetime, deduplicated loads, and scheduler behavior.

Portable projects embed full-resolution lossless PNGs. Firefox's Canvas PNG round trip produces a one-level composited RGB difference in some translucent icon pixels; the portable-project check bounds that difference to visible image layers and requires exact alpha, background, text, and geometry. In-page undo checks remain exact.

Hosted CI will run after these changes are pushed. Local browser results do not claim validation on physical phones or production Core Web Vitals.
