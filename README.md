# Social Composer

Standalone social-media artwork Composer for gLitCh Labs, AURA, Lumen, and Expenses. All runtime code, fonts, and brand assets are local to this repository.

Run `python3 -m http.server 8089` and open `http://localhost:8089/`. No build step or runtime dependencies are required.

## Using the editor

Choose a brand, then use **Create** for a blank canvas, background upload, or the AURA and Lumen templates. **Assets** contains brand artwork, custom uploads, and Expenses tint controls. Switching tabs or brands keeps the current session's drafts.

Tool sections start collapsed. Each brand's artwork lives under **Assets → Icons**; expand only the sections you need.

### Text over a background

After uploading a background or creating a canvas, open **Text → Add text box**. Type or paste into **Box text**: its first line is the header and the remaining lines are the body. **Headers · first line** and **Body text** control font, size, color, and weight across all boxes independently. The first formatted paste with a supported inline font supplies the shared fonts; plain-text or unsupported-font pastes keep the selected fonts. The dropdowns list supported local and standard fonts. Pasted markup is never added to the page.

Select a box on the canvas or from the text-box list. Drag it to move, drag a corner to change its width, or expand **Position and width** for numeric controls. Text wraps without shrinking, and box height grows with its content. PNG download is disabled when a box or its visible text extends beyond the canvas, or when the box is too narrow for an indivisible character. Adjust its position, width, or shared text size to fit. Saved designs retain editable text and shared styles, including after reloading. Existing saved image-only designs remain compatible.

Run `node scripts/test-text-boxes.cjs` with the same Playwright setup to check collapsed sections, paste handling, shared styles, wrapping, overflow, editable save/restore, PNG export, and responsive controls. Outputs go to `exports/text-boxes/`.

Canvas size and grid controls sit above the preview. **More actions** contains **Remove assets and text** and **Clear canvas**. On smaller screens, **View preview** jumps from the controls to the canvas.

The preview has independent **− / +**, percentage, **Fit**, and **Hand** controls. Pinch your trackpad or use **Ctrl + scroll** over the preview to zoom around the pointer; ordinary scrolling pans. Use **Hand** to drag the view, or hold **Space** while the preview is focused or hovered (typing in fields is unaffected). Two-finger touch gestures zoom and pan on mobile. Manual zoom ranges from 10–400%; 100% maps one artwork pixel to one CSS pixel. Fit shows the full composition and recalculates when the preview changes size. New and restored compositions start in Fit mode.

Zoom affects only the preview, with no changes to artwork coordinates, saved designs, or exported PNGs. Browser zoom outside the preview works normally. Run `node scripts/test-viewport.cjs` with the Playwright setup below to verify gestures, editing coordinates, unchanged exports, and responsive behavior.

Use **Save design** to keep an editable composition in this browser and **Saved designs** to restore it. These saves are local to the browser and site origin; **Download PNG** creates a separate image file.

The saved-design library holds up to twelve designs within its storage budget. A new save never removes an older design. If the library or browser storage is full, the Saved designs panel explains the problem and offers recovery steps; Download PNG remains available. Save and Remove update the visible library only after browser storage confirms the change. A failed write keeps the existing library intact.

Saved backgrounds with transparent or partially transparent pixels use lossless PNG so their transparency survives restore and export. If that design exceeds the library budget, the editor tries high-quality WebP color compression while preserving transparency. Fully opaque backgrounds retain compressed JPEG storage. The existing library limit still applies; Download PNG keeps the image when a design remains too large to save locally. Older JPEG-based saves remain compatible.

Uploads, saved-design restores, blank canvases, and generated templates share one operation check. Opening or clearing a canvas cancels earlier work, including pending API requests. A delayed image or template cannot replace a newer choice. Restores prepare their images and fonts before replacing the current design. Selecting, moving, or resizing an existing object preserves its stacking order.

Run `node scripts/test-storage.cjs` with Playwright available through `NODE_PATH` and Chrome installed to check failed writes, full-library retention, storage-budget limits, removal retry, and save/reload. It starts a local static server unless `COMPOSER_URL` is set. Review artifacts go to `exports/storage/`.

Run `node scripts/test-document-safety.cjs` with the same setup to check delayed document operations, transparent saves and PNG downloads, AURA format protection, stable stacking, and actual text overflow. It also starts its own local server unless `COMPOSER_URL` is set. Outputs go to `exports/document-safety/`.

With Playwright available through `NODE_PATH` and local Chrome installed, run `node scripts/test-editor.cjs` to check keyboard navigation, drafts, asset editing, uploads, saving/restoring, export, validation, and layouts at 390, 860, and 1440 px. Set `COMPOSER_URL` when using a different local port. Screenshots are written to `exports/editor/`.

## Publishing

This public repository deploys independently through GitHub Pages from `main` at the repository root. `.nojekyll` enables plain static serving. Push changes here to update only the Composer. The original marketing website repository remains separate. The homepage link intentionally points to `https://theglitchlabs.com/`.

The legacy Composer at the marketing website is retained as a frozen copy during migration; it does not receive new features. Browser-saved work is origin-specific: it is shared only when both URLs have the same origin. Keep the legacy page available to download old work if hosting changes origin. AURA API CORS must allow the deployed origin. Manual mode works without the API.

## Lumen fact posts

Select **Lumen**, enter an English fact or explanation, choose a subject and Canvas size, and select **Create Lumen post**. Each format has its own layout and uses the Lumen logo, Outfit typography, a subject-colored background, automatically contrasting text, a matching edge/beam, and a spark footer. The Lumen website appears in the footer rather than an assumed social handle.

Subjects are **None · Graphite** (default), **Maths · Pink**, **Physics · Blue**, **Chemistry · Purple**, **Biology · Green**, and **Social · Yellow**. Named subjects appear in the former source-line position. None omits the entire subject line and uses a light logo on graphite; the five pastel palettes use the dark logo. Subject changes apply when you select **Create Lumen post**, and the selection survives brand switches during the session. Existing saved designs are unchanged.

Formats are **Story / Reel · 9:16** (1080 × 1920, default), **Square · 1:1** (1080 × 1080), **Portrait · 4:5** (1080 × 1350), **Landscape · 1.91:1** (1200 × 630), and **Landscape · 16:9** (1600 × 900). Choose **Canvas size** in the shared toolbar and select **Create Lumen post** to apply. There is one size control for the editor. For Lumen templates, choosing a size stages a new layout and leaves the current image intact until Create succeeds. Native size applies to uploaded backgrounds rather than generated Lumen templates. Existing saved designs remain flattened images and retain their original dimensions; regenerate from the current form to use a new format.

The Story / Reel layout follows AURA’s 180 px side margins, leaving a 720 px content column. Its reading section stays within y=400–1450, and the subject, divider, website, and spark sit above y=1636. Background artwork reaches the edges. These margins were checked with the same approximate Reels crop and overlays as AURA; actual platform overlays may vary.

Lumen posts use a prominent app icon beside a separately scaled wordmark, with larger slogans, subject labels, website text, and footer sparks across all five formats. Body text is left aligned and vertically centered within each format’s reading area, using the actual text bounds and retaining paragraph gaps.

**Text size** is adjustable from 36 to 84 px (default 72). Text is wrapped without silently shrinking or truncating. Overlong content shows a format-specific error and keeps the current canvas. Draft fields survive brand changes during the page session. Save and Download PNG use the normal Composer workflow. Text is not automatically fact-checked.

Run `node scripts/test-lumen-formats.cjs` to verify all 30 format/subject combinations, layout bounds, pending/stale format changes, format-specific overflow, saving/restoring, and protection against cropping. It exports all templates plus phone-sized and simulated Reels previews for 9:16 under `exports/lumen-formats/`. Samples use the same illustrative lightning text.

Run `node scripts/test-lumen.cjs` with Playwright available through `NODE_PATH` and local Chrome installed. `COMPOSER_URL` overrides the test URL. The test exports a layout sample under `exports/lumen/`; its lightning fact is supported by the Met Office: https://weather.metoffice.gov.uk/learn-about/weather/types-of-weather/thunder-and-lightning

## Shared assets

- `brands/current/*-icon.png` are unmodified copies of the root site's four current icons.
- `*-mark.png` extracts the metallic foreground: Expenses monogram, AURA symbol, Lumen's central spark, and the studio dot cluster.
- Light/dark wordmarks and icon/name lockups use the site's Manrope, Cormorant Garamond, and Outfit fonts with accented dots.
- `assets/fonts/` contains copied self-hosted fonts and their OFL licenses. The interface uses Manrope and DM Sans.
- Existing saved asset identifiers resolve to the current artwork. Browser saves, uploads, placement, tinting, and PNG export remain local.

To regenerate derived artwork after updating the local icon copies, run `node scripts/build-assets.cjs` with Playwright available through `NODE_PATH` and Chrome installed. Start the local site at port 8089, or set `COMPOSER_URL` to the composer URL. Outputs stay in `brands/current/`. No original site images are changed.

The older files under `brands/` are no longer referenced by the composer.

## Daily horoscope posts

Select **AURA** and choose **Manual entry** (default) or **Fetch from AURA API**. Manual entry provides twelve labelled reading fields; paste one reading per sign, then select **Create horoscope**. All fields are required. Manual mode makes no API requests, and drafts survive source, brand, date, language, and color changes during the current page session (not a reload). API results never overwrite these drafts.

Choose **தமிழ் · Tamil** (default) or **English**, a reading date, and a background. API mode fetches the selected language directly from AURA. Both modes produce one 1080 × 1920 (9:16) canvas. Save and Download PNG use the normal composer controls.

Generated AURA readings and covers keep their supported Story / Reel size; the canvas-size control is locked while editing them. Restoring an older AURA save also restores its full 9:16 background rather than a cropped preset. Selecting Lumen lets you stage another format for a new Lumen post without resizing the current AURA artwork. Blank canvases and uploaded backgrounds retain the normal size controls.

All eight backgrounds are always available in either language: No tint (ivory), Sunday warm gold, Monday moon pearl, Tuesday terracotta, Wednesday sage, Thursday saffron, Friday rose, and Saturday lavender. Automatic follows the selected date in Asia/Kolkata. These are editorial tints, independent of the readings.

API: `https://aura-glitchlabs.fly.dev/api/horoscopes/daily?date=YYYY-MM-DD&lang=ta` (or `lang=en`). Summaries are used unchanged. The requested language, date, timezone, all twelve unique signs, and reading context are validated before replacing the canvas. Failed requests never fall back to invented or translated readings. Changing source, language, date, or color cancels stale requests and prevents late results from replacing the canvas. The API disclaimer appears below the controls; the artwork has no footer text.

The shared renderer (`js/horoscope-template.js`) uses the approved centered layout: equal 180 px side margins, two columns of 350 × 196 px cards, and six rows from y=400 to y=1636. Clean local celestial backgrounds match each day; gold emblems, ivory cards, Tamil Rasi names or English transliterations, and localized dates are rendered separately. Name accents are muted bronze, slate blue, clay, forest sage, ochre, dusty rose, or plum, with at least 4.5:1 contrast against the cards. These margins were checked against a simulated Reel view based on the supplied screenshot; Instagram displays and overlays can vary.

**Reading text size** (18–36 px, default 30) and **Reading text weight** (Regular 400, Semibold 600, Bold 700; default Semibold) affect all twelve reading paragraphs together. Select **Create horoscope** to apply. Sign names, title, and date retain their own styling. Controls and manual drafts survive source, date, language, brand, and color changes during the current page session. Existing saved flattened images are unchanged.

Text uses self-hosted Noto Sans Tamil or DM Sans; fonts are loaded at the requested weight before measurement. Tamil wrapping respects grapheme boundaries. There is no per-sign shrinking or automatic rewriting. A reading that exceeds its card produces an error naming the Rasi and suggesting a smaller shared size or shorter reading; the existing canvas is preserved. Blank horoscope templates need no API connection.

The API must allow the site's origin through its CORS configuration. In API mode, the status indicator checks the chosen language, reports a possible cold start after three seconds, and times out after sixty seconds.

With a local server on port 8089 and Playwright available through `NODE_PATH`:

- `node scripts/test-horoscope.cjs` checks shared size and weight across all signs, input validation, accessible name contrast, long Tamil readings at 18 px, manual defaults, draft retention, API failures/cancellation, both languages, all backgrounds, blanks, dimensions, PNG export, overflow handling, and mobile width using mocked API responses.
- `node scripts/render-horoscope.cjs` exports Tamil editorial samples and blanks for all eight backgrounds, with a comparison sheet and phone-sized/simulated Reels previews. Set `HOROSCOPE_LANGUAGE=en` for English. These samples are illustrative layout previews, not live forecasts. Pass `HOROSCOPE_DATA=/path/to/api-response.json` to render a saved actual Tamil or English API edition instead; optional `readingFontSize` and `readingFontWeight` fields set the shared typography for that export.

Exports are local review artifacts under `exports/daily-horoscope/` and are not committed.

### Daily covers

Choose the date, language, and Post color, then select **Create cover** for a 1080 × 1920 cover in the same colors as the reading post. It works with empty reading fields and does not fetch readings. The sculpted gold zodiac wheel sits below the title; the day number, localized month/year, and weekday are centered together inside it. The title and wheel start higher on the artwork to fill the upper area.

The cover uses local background plates, a reusable zodiac ornament, and separately rendered text. Reading text size and weight do not affect it. Changing settings or switching brands cancels pending creation; creating a cover also cancels any earlier reading request. Save design retains its cover identity, including after reloading. Downloaded covers use `aura-daily-cover-YYYY-MM-DD-1080x1920.png`; older reading saves keep their original filename behavior.

Run `node scripts/test-horoscope-cover.cjs` with Playwright available through `NODE_PATH` and Chrome installed. It starts its own local static server unless `COMPOSER_URL` is set, checks cover generation, date alignment, all day palettes and both languages, cancellation, save/restore, export, and mobile layout, and writes previews to `exports/aura-cover-final/`.
