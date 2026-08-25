# UI-06 — Guitar TAB Workbench UX Refinement

Status: COMPLETE — merged through PR #164 with protected Tests and MusicXML Compatibility gates green.

## Scope

UI-06 refines the existing Guitar TAB Workbench without changing conversion, canonical TAB, fingering-selection, source-event mapping, or structured-edit authority.

The browser remains a presentation and bounded-command surface. It does not patch MusicXML, mutate rendered string/fret values, or gain independent arrangement authority.

## Inspector

The right inspector is now a true four-tab surface:

- **Note** — existing guarded structured pitch editor.
- **Fingering** — read-only view of the currently selected deterministic TAB placement when that placement is exposed by the accepted result.
- **Issues** — existing validation/processing issue surface; issue actions still focus the affected measure through the Workbench controller.
- **Document** — source identity, route, revision count, status, and deterministic-authority context.

Tab behavior uses `role=tablist`, `role=tab`, `role=tabpanel`, `aria-selected`, roving `tabindex`, and ArrowLeft/ArrowRight/Home/End keyboard navigation.

## Toolbar and score view

UI-06 adds a view-control seam over the already pinned alphaTab renderer:

- Zoom out / in: 60%–160% in 10% steps.
- **Fit width**: 100% notation scale with automatic bars-per-row (`-1`).
- **Fit page**: compact 80% notation scale with the Workbench three-bars-per-row page study layout.

The implementation changes alphaTab display settings only, then calls `updateSettings()` and `render()`. It does not alter score content.

## Playback UX

The existing Play/Stop authority remains unchanged. UI-06 adds:

- playback-speed selector: 50%, 75%, 100%, 125%, 150%;
- current/total time position readout;
- current measure context;
- original playback tempo context when alphaTab reports it.

The speed selector sets alphaTab `playbackSpeed`; it does not rewrite tempo events in MusicXML.

## Score interaction context

The Workbench core remains responsible for renderer-note mapping and guarded selection. UI-06 only reflects the accepted selection in the shell:

- selected pitch chip;
- selected/current measure readout;
- read-only fingering facts;
- selected-score visual state;
- issue count mirrored into the Issues tab.

MONO_V1 tied-note handling and guarded POLY_V2 source-event/group mapping stay in the existing Workbench core and are not reimplemented by the UX layer.

## Responsive layout

- Desktop keeps score + inspector side by side.
- At 900 px and below, the score and inspector become a single-column workspace and the left rail is removed from layout.
- Inspector tabs remain visible and keyboard accessible.
- At 620 px and below, toolbar groups wrap, fit controls share width, inspector facts collapse to one column, and the score remains horizontally scrollable when notation requires it.

## Safety boundary

`web/guitar-tab-workbench/ux-controller.js` is intentionally isolated from engine internals. It may:

- read Workbench snapshots;
- switch inspector panels;
- change alphaTab display scale/layout settings;
- change alphaTab playback speed;
- reflect accepted document/selection/position state.

It may not:

- perform network requests;
- persist browser state;
- edit raw XML;
- construct authoritative TAB placements;
- bypass MONO_V1/POLY_V2 edit guards;
- import runtime engine modules.

GitHub Pages remains a read-only static preview with no `/api/` calls.

## Verification gates

UI-06 completion evidence:

1. four inspector tabs render and switch correctly;
2. preview remains read-only;
3. zoom, fit-width, fit-page, speed and position surfaces operate in a real Chromium run;
4. 900 px responsive behavior is exercised;
5. no page/console errors appear;
6. no Pages preview API request is made;
7. existing MONO_V1 tie-chain and POLY_V2 browser mapping/edit smoke tests remain green.
