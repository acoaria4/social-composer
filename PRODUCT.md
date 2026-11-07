# Social Composer

<!-- impeccable:product-schema 1 -->

## Platform

web

## Product Purpose

Create and export social artwork for gLitCh Labs, Expenses, AURA, and Lumen. The user requested daily AURA covers that match each reading post's color, reliable editing, and a workspace organized around templates, canvas, and an inspector.

## Operating Context

This is a standalone static HTML, CSS, and Canvas 2D app. It runs locally without a build step and deploys through GitHub Pages. Text, fonts, brand artwork, and template renderers are local. AURA can optionally fetch daily readings; manual input and cover creation need no API connection.

## Capabilities and Constraints

- AURA covers and readings use 1080 × 1920, with date, language, color, and reading typography controls.
- Lumen facts support five formats and subject palettes.
- Images and text are editable layers with geometry, stacking, visibility, and locks. Shared text styles apply to every text layer.
- PNG export is separate from browser saves. Browser saves have a twelve-design storage budget and never silently evict existing designs.
- Recovery is opt-in after reload. Project files carry embedded images, layers, and template inputs across browsers.
- Current local Chrome tests cover the editor, templates, exports, storage failures, document races, history, recovery, and project files.
- Delivery proceeds one verified sprint at a time. Sprint 4 is the workspace redesign; broader performance and tooling changes follow separately.

## Brand Commitments

Keep the supplied brand artwork and generated post layouts. The user explicitly selected a matte black application theme and a templates / canvas / inspector arrangement. The app's visual chrome should let the exported artwork remain the focus.

## Evidence on Hand

README.md documents the working features. The stage plan is `.impeccable/implementation-plan.json`. Existing local artwork is in `brands/` and `assets/`. Browser review evidence is generated under the ignored `exports/` directory.

## Product Principles

- Preserve authored text and existing work when an operation fails.
- Keep preview controls separate from exported artwork.
- Make storage limits, save state, and failures clear.
- Use native keyboard controls and reachable touch targets.
- Avoid adding runtime dependencies for the workspace redesign.
