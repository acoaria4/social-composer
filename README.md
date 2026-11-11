# Social Composer

Standalone social-media artwork Composer for gLitCh Labs, AURA, Lumen, and Expenses. All runtime code, fonts, and brand assets are local to this repository.

Serve this folder with any static HTTP server, for example `python3 -m http.server 8089 --bind 127.0.0.1`, and open `http://127.0.0.1:8089/`. No build step or runtime dependencies are required.

For development, use Node 24+, run `npm ci`, then `npm start`. This starts a loopback-only server at `http://127.0.0.1:8089/` and keeps repository internals private.

Run `npm test` for syntax checks and the complete serial test suite. The launcher uses local Chrome when available, or Playwright's pinned Chromium after `npx playwright install chromium`. For another engine, run `npx playwright install firefox webkit`, set `COMPOSER_BROWSER` to `firefox` or `webkit`, and run `npm test`. Focus a check with `npm test -- --suite test-performance.cjs`. CI runs the Chromium, Firefox, and WebKit matrix sequentially.

After `npm ci` and browser setup, individual `node scripts/test-*.cjs` and artwork-generation commands below also work directly: their shared launcher starts and stops a loopback server automatically. A pre-running server, globally installed Playwright, and `NODE_PATH` are unnecessary. Set `COMPOSER_URL` only when you want to target an already-served copy.

UI images now use small renditions; original brand artwork loads when inserted on the canvas. Original-resolution saves, projects, and exports retain their quality. Regenerate the UI images after changing brand sources with `node scripts/build-ui-assets.cjs`. See [the maintenance guide](docs/architecture.md) for module contracts and [the performance report](docs/performance.md) for measurements and verification.

## Using the editor

The matte black workspace has three areas: **Your library** on the left, the canvas in the center, and an **Inspector** on the right. AURA appears first and opens by default. Choose a brand using its name and mini icon, then open **Templates**. AURA shows daily covers and readings; Lumen shows fact posts. Each card opens its settings without generating artwork or fetching readings. Template cards show actual local renderer samples. Brands without templates offer a blank canvas and background upload instead.

Choose a brand and open **Assets** for brand artwork, custom uploads, and Expenses tint controls. Text and layer tools live in the inspector, with navigation independent of the library. Selecting text on the canvas opens its text controls; selecting an image opens layer geometry. The header identifies the current canvas or generated post and shows its save state. Template text and settings survive tab changes, brand changes, and reloads in the same browser.

Original image inserts show a loading state and can be retried after a failed request. Opening or clearing another canvas cancels older inserts. Custom uploads and removals update the library only after browser storage succeeds; errors stay visible in Custom, and the twelve-item / 2 MB budget never removes existing assets.

Tool sections start collapsed. Each brand's artwork lives under **Assets → Icons**; expand only the sections you need.

### Text over a background

After uploading a background or creating a canvas, open **Inspector → Text → Add text box**. Type or paste into **Box text**: its first line is the header and the remaining lines are the body. **Headers · first line** and **Body text** control font, size, color, and weight across all boxes independently. The first formatted paste with a supported inline font supplies the shared fonts; plain-text or unsupported-font pastes keep the selected fonts. The dropdowns list supported local and standard fonts. Pasted markup is never added to the page.

Select a box on the canvas or from the text-box list. Drag it to move, drag a corner to change its width, or expand **Position and width** for numeric controls. Text wraps without shrinking, and box height grows with its content. PNG download is disabled when a box or its visible text extends beyond the canvas, or when the box is too narrow for an indivisible character. Adjust its position, width, or shared text size to fit. Saved designs retain editable text and shared styles, including after reloading. Existing saved image-only designs remain compatible.

Run `npm test -- --suite test-text-boxes.cjs` to check collapsed sections, paste handling, shared styles, wrapping, overflow, editable save/restore, PNG export, and responsive controls. Outputs go to `exports/text-boxes/`.

Canvas size and grid controls sit above the preview. **Grid** shows placement guides; **Snap** independently rounds dragged positions to the 72 px grid. Neither appears in exported artwork. **More actions** contains project backup controls, **Remove assets and text**, and **Clear canvas**. On phones and smaller tablets, the fixed **Edit / Preview** switch shows either the authoring tools or the artwork. Canvas size and project actions stay available in Edit; save and PNG export remain in the app bar. **View preview** also switches to Preview and focuses the canvas.

**Layers** lists images and text from front to back, with separate select, visibility, and lock buttons. Select a layer to edit its position and size, duplicate it, delete it, or change its stacking order. Image proportions stay fixed; text height follows its content. With the canvas or layer controls focused, arrow keys move the selected layer by 1 px, or 10 px with Shift. Delete removes an unlocked selected layer. Hidden layers stay editable and saved but do not appear in the preview or PNG. Locked layers cannot be moved, resized, deleted, or reordered; unlock text layers before changing shared text styles, and tinted layers before changing their shared color. **Remove assets and text** keeps locked layers; **Clear canvas** clears the whole document.

**Undo** and **Redo** cover canvas edits, including text, geometry, layering, background replacement, and clearing. A drag or one uninterrupted field edit is one action. Use Ctrl/Command + Z, Ctrl/Command + Shift + Z, or Ctrl + Y outside form fields; typing fields keep their browser editing shortcuts. History keeps up to 40 actions for the current page session; large images shorten older history against an estimated 128 MB image budget while preserving the most recent undo. Shared images count once. The header reports **Unsaved changes** or **Saved locally**; automatic recovery is separate from a saved design.

The editor saves a recovery draft in IndexedDB shortly after edits. Reloading offers **Recover draft** or **Discard draft** before opening a previous canvas. The latest template form drafts are restored without API requests. Recovery is local to the browser and origin, and may be unavailable in private or restricted storage. A persistent message explains failures.

Use **More actions → Export project** for a portable `.json` backup with embedded lossless PNG images, editable layers, text styles, template inputs, and view preferences. **Import project** validates and prepares the entire file before replacing the current canvas; failed imports leave the canvas intact. Files are limited to 50 MB and 64 million decoded image pixels. Project backups are independent of the twelve-design browser library and can be opened in another browser. Imported images stay with their document rather than replacing built-in brand artwork. Import restores the latest form drafts; **Load template inputs** explicitly fills the form from the original rendered post when you want to edit that version instead.

The preview has independent **− / +**, percentage, **Fit**, and **Hand** controls. Pinch your trackpad or use **Ctrl + scroll** over the preview to zoom around the pointer; ordinary scrolling pans. Use **Hand** to drag the view, or hold **Space** while the preview is focused or hovered (typing in fields is unaffected). Two-finger touch gestures zoom and pan on mobile. Manual zoom ranges from 10–400%; 100% maps one artwork pixel to one CSS pixel. Fit shows the full composition and recalculates when the preview changes size. New and restored compositions start in Fit mode.

Zoom affects only the preview, with no changes to artwork coordinates, saved designs, or exported PNGs. Browser zoom outside the preview works normally. Run `npm test -- --suite test-viewport.cjs` to verify gestures, editing coordinates, unchanged exports, and responsive behavior.

Use **Save design** to keep an editable composition in this browser and **Saved designs** to restore it. These saves are local to the browser and site origin; **Download PNG** creates a separate image file.

The saved-design library holds up to twelve designs within its storage budget. A new save never removes an older design. If the library or browser storage is full, the Saved designs panel explains the problem and offers recovery steps; Download PNG remains available. Save and Remove update the visible library only after browser storage confirms the change. A failed write keeps the existing library intact.

Saved backgrounds with transparent or partially transparent pixels use lossless PNG so their transparency survives restore and export. If that design exceeds the library budget, the editor tries high-quality WebP color compression while preserving transparency. Fully opaque backgrounds retain compressed JPEG storage. The existing library limit still applies; Download PNG keeps the image when a design remains too large to save locally. Older JPEG-based saves remain compatible.

Uploads, saved-design restores, blank canvases, and generated templates share one operation check. Opening or clearing a canvas cancels earlier work, including pending API requests. A delayed image or template cannot replace a newer choice. Restores prepare their images and fonts before replacing the current design. Selecting, moving, or resizing an existing object preserves its stacking order.

Run `npm test -- --suite test-storage.cjs` to check failed writes, full-library retention, storage-budget limits, removal retry, and save/reload. Review artifacts go to `exports/storage/`.

Run `npm test -- --suite test-document-safety.cjs` to check delayed document operations, transparent saves and PNG downloads, AURA format protection, stable stacking, and actual text overflow. Outputs go to `exports/document-safety/`.

Additional suites cover editing history and recovery (`npm test -- --suite test-editing-session.cjs`), layer controls (`npm test -- --suite test-layers.cjs`), and portable backups (`npm test -- --suite test-projects.cjs`). Their evidence goes to `exports/sprint3/`. The test runner keeps browser suites serial to limit resource use.

Run `npm test -- --suite test-workspace.cjs` for three-pane layout, independent navigation, template cards, contextual inspection, accessible library actions, and mobile Edit/Preview behavior. It writes evidence to `exports/sprint4/workspace/`. Windows Chromium and Firefox checks use software graphics. Regenerate template thumbnails with `node scripts/build-template-previews.cjs`.

Run `npm test -- --suite test-editor.cjs` to check keyboard navigation, drafts, asset editing, uploads, saving/restoring, export, validation, and layouts at 390, 860, and 1440 px. Screenshots are written to `exports/editor/`.

## Publishing

This public repository deploys independently through GitHub Pages from `main` at the repository root. `.nojekyll` enables plain static serving. Push changes here to update only the Composer. The original marketing website repository remains separate. The homepage link intentionally points to `https://theglitchlabs.com/`.

The legacy Composer at the marketing website is retained as a frozen copy during migration; it does not receive new features. Browser-saved work is origin-specific: it is shared only when both URLs have the same origin. Keep the legacy page available to download old work if hosting changes origin. AURA API CORS must allow the deployed origin. Manual mode works without the API.

## Lumen fact posts

Select **Lumen**, enter an English fact or explanation, choose a subject and Canvas size, and select **Create Lumen post**. Each format has its own layout and uses the Lumen logo, Outfit typography, a subject-colored background, automatically contrasting text, a matching edge/beam, and a spark footer. The Lumen website appears in the footer rather than an assumed social handle.

Subjects are **None · Graphite** (default), **Maths · Pink**, **Physics · Blue**, **Chemistry · Purple**, **Biology · Green**, and **Social · Yellow**. Named subjects appear in the former source-line position. None omits the entire subject line and uses a light logo on graphite; the five pastel palettes use the dark logo. Subject changes apply when you select **Create Lumen post**, and the selection survives brand switches during the session. Existing saved designs are unchanged.

Formats are **Story / Reel · 9:16** (1080 × 1920, default), **Square · 1:1** (1080 × 1080), **Portrait · 4:5** (1080 × 1350), **Landscape · 1.91:1** (1200 × 630), and **Landscape · 16:9** (1600 × 900). Choose **Canvas size** in the shared toolbar and select **Create Lumen post** to apply. There is one size control for the editor. For Lumen templates, choosing a size stages a new layout and leaves the current image intact until Create succeeds. Native size applies to uploaded backgrounds rather than generated Lumen templates. Newly saved designs retain their source inputs, so restoring one fills the form for regeneration. Older saves retain their original flattened backgrounds.

The Story / Reel layout follows AURA’s 180 px side margins, leaving a 720 px content column. Its reading section stays within y=400–1450, and the subject, divider, website, and spark sit above y=1636. Background artwork reaches the edges. These margins were checked with the same approximate Reels crop and overlays as AURA; actual platform overlays may vary.

Lumen posts use a prominent app icon beside a separately scaled wordmark, with larger slogans, subject labels, website text, and footer sparks across all five formats. Body text is left aligned and vertically centered within each format’s reading area, using the actual text bounds and retaining paragraph gaps.

**Text size** is adjustable from 36 to 84 px (default 72). Text is wrapped without silently shrinking or truncating. Overlong content shows a format-specific error and keeps the current canvas. Draft fields and settings survive reloads. Save and Download PNG use the normal Composer workflow. Text is not automatically fact-checked.

Run `npm test -- --suite test-lumen-formats.cjs` to verify all 30 format/subject combinations, layout bounds, pending/stale format changes, format-specific overflow, saving/restoring, and protection against cropping. It exports all templates plus phone-sized and simulated Reels previews for 9:16 under `exports/lumen-formats/`. Samples use the same illustrative lightning text.

Run `npm test -- --suite test-lumen.cjs` for the Lumen creation flow. The test exports a layout sample under `exports/lumen/`; its lightning fact is supported by the Met Office: https://weather.metoffice.gov.uk/learn-about/weather/types-of-weather/thunder-and-lightning

## Shared assets

- `brands/current/*-icon.png` are unmodified copies of the root site's four current icons.
- `*-mark.png` extracts the metallic foreground: Expenses monogram, AURA symbol, Lumen's central spark, and the studio dot cluster.
- Light/dark wordmarks and icon/name lockups use the site's Manrope, Cormorant Garamond, and Outfit fonts with accented dots.
- `assets/fonts/` contains copied self-hosted fonts and their OFL licenses. The interface uses Manrope and DM Sans.
- Existing saved asset identifiers resolve to the current artwork. Browser saves, uploads, placement, tinting, and PNG export remain local.

To regenerate derived artwork after updating the local icon copies, run `node scripts/build-assets.cjs`. Outputs stay in `brands/current/`. Then run `node scripts/build-ui-assets.cjs` to refresh the smaller UI renditions. No original site images are changed.

The older files under `brands/` are no longer referenced by the composer.

## Daily horoscope posts

Select **AURA** and choose **Manual entry** (default) or **Fetch from AURA API**. Manual entry provides twelve labelled reading fields; paste one reading per sign, then select **Create horoscope**. All fields are required. Manual mode makes no API requests, and drafts survive source, brand, date, language, and color changes as well as reloads. Generating API results never overwrites manual drafts. Explicitly restoring a newly saved API reading opens its original summaries in Manual entry for editing, without refetching them.

Use **Readings → Clear all readings** to empty all twelve input boxes for a new edition. This also clears the saved reading draft while retaining the date, language, styling, and current canvas.

Choose **தமிழ் · Tamil** (default) or **English**, a reading date, and a background. API mode fetches the selected language directly from AURA. Both modes produce one 1080 × 1920 (9:16) canvas. Save and Download PNG use the normal composer controls.

Generated AURA readings and covers keep their supported Story / Reel size; the canvas-size control is locked while editing them. Restoring an older AURA save also restores its full 9:16 background rather than a cropped preset. Selecting Lumen lets you stage another format for a new Lumen post without resizing the current AURA artwork. Blank canvases and uploaded backgrounds retain the normal size controls.

Selecting AURA with an empty canvas defaults Canvas size to **Story / Reel · 9:16 · 1080×1920**, including new blank canvases. Switching to AURA while artwork is already open preserves that artwork and its displayed size; creating an AURA cover or reading then applies 9:16. Lumen keeps its own staged format.

Both languages offer eight backgrounds. Choose No tint (ivory), Sunday peach ivory, Monday moon pearl, Tuesday brick red, Wednesday celadon, Thursday buttercream, Friday rose, or Saturday lavender. Automatic follows the selected date in Asia/Kolkata.

API: `https://aura-glitchlabs.fly.dev/api/horoscopes/daily?date=YYYY-MM-DD&lang=ta` (or `lang=en`). Summaries are used unchanged. The requested language, date, timezone, all twelve unique signs, and reading context are validated before replacing the canvas. Failed requests never fall back to invented or translated readings. Changing source, language, date, or color cancels stale requests and prevents late results from replacing the canvas. The API disclaimer appears below the controls; the artwork has no footer text.

The shared renderer (`js/horoscope-template.js`) uses the approved centered layout: equal 180 px side margins, two columns of 350 × 196 px cards, and six rows from y=400 to y=1636. Clean local celestial backgrounds match each day; gold emblems, ivory cards, Tamil Rasi names or English transliterations, and localized dates are rendered separately. Name accents are muted bronze, slate blue, clay, forest sage, ochre, dusty rose, or plum, with at least 4.5:1 contrast against the cards. These margins were checked against a simulated Reel view based on the supplied screenshot; Instagram displays and overlays can vary.

**Typography** controls all twelve readings. Set text size (18–36 px, default 30), weight (Regular, Semibold, or Bold), and alignment (Justified by default or Left aligned). Justification keeps final lines and lines that would need oversized gaps left aligned. Select **Create horoscope** to apply. Controls and manual drafts survive reloads. Saved covers and reading posts retain their source inputs.

Text uses self-hosted Noto Sans Tamil or DM Sans; fonts are loaded at the requested weight before measurement. Tamil wrapping respects grapheme boundaries. There is no per-sign shrinking or automatic rewriting. A reading that exceeds its card produces an error naming the Rasi and suggesting a smaller shared size or shorter reading; the existing canvas is preserved. Blank horoscope templates need no API connection.

The API must allow the site's origin through its CORS configuration. In API mode, the status indicator checks the chosen language, reports a possible cold start after three seconds, and times out after sixty seconds.

After the development setup above:

- `npm test -- --suite test-horoscope.cjs` checks shared size and weight across all signs, input validation, accessible name contrast, long Tamil readings at 18 px, manual defaults, draft retention, API failures/cancellation, both languages, all backgrounds, blanks, dimensions, PNG export, overflow handling, and mobile width using mocked API responses.
- `node scripts/render-horoscope.cjs` exports Tamil editorial samples and blanks for all eight backgrounds, with a comparison sheet and phone-sized/simulated Reels previews. Set `HOROSCOPE_LANGUAGE=en` for English. These samples use illustrative readings. Pass `HOROSCOPE_DATA=/path/to/api-response.json` to render a saved Tamil or English API edition. Optional `readingFontSize`, `readingFontWeight`, and `readingAlignment` fields set the shared typography.

Exports are local review artifacts under `exports/daily-horoscope/` and are not committed.

### Daily covers

Choose the date, language, and Post color, then select **Create cover** for a 1080 × 1920 cover in the same colors as the reading post. It works with empty reading fields and does not fetch readings. The sculpted gold zodiac wheel sits below the title; the day number, localized month/year, and weekday are centered together inside it. The title and wheel start higher on the artwork to fill the upper area.

The cover uses local background plates, a reusable zodiac ornament, and separately rendered text. Reading text size and weight do not affect it. Changing settings or switching brands cancels pending creation; creating a cover also cancels any earlier reading request. Save design retains its cover identity, including after reloading. Downloaded covers use `aura-daily-cover-YYYY-MM-DD-1080x1920.png`; older reading saves keep their original filename behavior.

Run `npm test -- --suite test-horoscope-cover.cjs` to check cover generation, date alignment, all day palettes and both languages, cancellation, save/restore, export, and mobile layout. It writes previews to `exports/aura-cover-final/`.
