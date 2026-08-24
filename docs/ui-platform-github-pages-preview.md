# UI Platform 01–05 — Product Shell and GitHub Pages Preview

Status: implementation line for the Guitar TAB Workbench product UI.

Baseline: merged UI Stage 1 including the guarded monophonic structured-edit runtime. This UI platform work does not reopen or replace that edit authority.

## Scope

### UI-01 — Design system foundation

The browser workbench now has a small explicit design-token layer for typography, spacing, surfaces, borders, status colors, focus rings, responsive dimensions and reduced-motion behavior. Product styles consume those tokens rather than creating a second rendering or musical model.

### UI-02 — Product shell

The verified Workbench controls are hosted inside a product shell with:

- application header and mode/document status;
- document and transport toolbar;
- score workspace;
- review/issue inspector;
- lightweight desktop navigation rail;
- bottom status bar;
- responsive single-column behavior on narrow screens.

The existing `data-role` controls remain the behavioral contract for upload, transport, score rendering, issue focus and structured note editing.

### UI-03 — Host adapters and controller facades

The browser core remains `web/guitar-tab-workbench/workbench.js`. The product layer wraps its reviewed public seam instead of importing engine internals or duplicating its authoritative structured-edit state machine.

Host boundary:

```text
Product shell
  ↓
Document / Playback / Selection / Issues controller facades
  ↓
verified GuitarTabWorkbench browser core
  ↓
RuntimeApiAdapter OR StaticPreviewAdapter
```

Runtime mode uses the existing same-origin `/api/upload` and `/api/edit` host seams. Static preview mode exposes no working upload or edit route.

### UI-04 — Static preview mode

The source tree defaults to runtime mode. A generated Pages build replaces only the host configuration copy with `mode=preview`.

Preview invariants:

- no user MusicXML is uploaded;
- no engine module is imported into browser JavaScript;
- no raw MusicXML is parsed or edited in the browser;
- upload/edit adapters fail closed as read-only;
- the page visibly identifies itself as `PREVIEW`;
- the runtime upload control is hidden;
- structured note editing remains disabled because no private immutable source-byte session exists;
- the displayed renderer result is produced by CI, not by browser conversion.

### UI-05 — GitHub Pages build and deployment

`scripts/build-github-pages-preview.js` creates `_site/` from a fixed repository fixture. During CI it calls `processMusicXmlUpload` once, requires an exact `PASS` on `MONO_V1`, writes the bounded result to `preview/demo.json`, then copies the workbench and pinned alphaTab browser assets into the static site.

The build emits a manifest containing the input SHA-256, route, alphaTab version and CI commit when available. It also checks the static browser boundary for remote dependencies, browser persistence, HTML injection primitives and engine-internal imports.

The Pages artifact includes the alphaTab upstream license text and package metadata under `third-party/alphatab/`.

Browser compatibility CI independently serves the generated `_site/` and proves:

- `PREVIEW` mode is visible;
- the CI result reaches `PASS / MONO_V1`;
- one rendered track has standard notation plus rhythmic TAB as two staves;
- SVG output is present;
- edit remains disabled;
- runtime upload is hidden;
- zero `/api/` requests occur.

## Pages enablement boundary

The repository Pages setting is an external deployment setting, not a browser-code authority. The deployment workflow is intentionally fail-closed: it does not silently convert a failed or disabled Pages deployment into success.

The repository must have GitHub Pages enabled with GitHub Actions as its deployment source before the first Pages deployment can complete. The Workbench implementation and browser compatibility evidence remain independently testable even when that repository setting is not yet enabled.

## Non-negotiable authority boundaries

1. Original MusicXML remains immutable source truth.
2. Browser/UI code does not import `src/app`, `src/core`, `src/learning` or canonical-result internals.
3. GitHub Pages preview never becomes a production conversion service.
4. Static preview JSON is generated from a fixed repository fixture during CI only.
5. Runtime structured edits still use the merged exact-SHA, cumulative-command, full-reconversion path.
6. TAB is never patched independently in the browser.
7. Preview mode cannot activate polyphonic public authority or learned/shadow decision authority.
8. Deployment and rendering success do not change the engine's public API or musical authority model.
