# UI-RUNTIME-HOST-01 — Same-Origin Staging Host and Real Browser E2E

Status: staging implementation line. This does not authorize production deployment.

## Goal

Replace the Pages-only demo boundary with a real application host that can exercise the existing reviewed Workbench/runtime seams without moving engine authority into browser JavaScript.

```text
Browser Workbench
  ↓ same origin
Runtime HTTP host
  ├─ POST /api/upload
  ├─ POST /api/edit
  └─ POST /api/edit/poly-v2
  ↓
existing MusicXML application runtimes
  ↓
MONO_V1 / POLY_V2 authoritative result
  ↓
alphaTab notation + rhythmic TAB renderer
```

GitHub Pages remains a static preview and is not changed into a conversion service.

## Runtime host

`src/app/runtimeHttpHost.js` is an internal staging host. It is not exported from `src/index.js`.

The host:

- serves the existing Workbench and pinned alphaTab assets from the same origin;
- exposes only the existing upload, monophonic edit and separated POLY_V2 edit application seams;
- accepts MusicXML uploads as raw `application/octet-stream` bytes;
- keeps the existing 5 MiB MusicXML source ceiling before engine processing;
- carries edit metadata in a bounded UTF-8 request-body frame rather than HTTP headers;
- allows up to 8 MiB of framed command metadata, covering the runtime's maximum valid 128-command POLY_V2 shape with maximum bounded Unicode source/group identities;
- requires edit source SHA-256 and bounded revision metadata;
- keeps engine `PASS` / `BLOCKED` results as application results rather than converting capability/content blocks into transport failures;
- rejects malformed query multiplicity, unsupported media types, legacy edit-command headers, malformed frames, invalid UTF-8 and malformed edit JSON before engine execution;
- sends no CORS opt-in and adds basic same-origin/nosniff/referrer response headers;
- uses bounded header count, header bytes, body bytes and request/header timeouts;
- does not persist uploaded source bytes server-side.

The staging CLI is `npm run start:runtime`. For local/staging execution the pinned alphaTab package must be installed without changing the repository lockfile:

```text
npm ci --ignore-scripts
npm install --no-save --package-lock=false --ignore-scripts @coderline/alphatab@1.8.4
npm run start:runtime
```

The CLI defaults to `127.0.0.1:4173`. A staging platform may explicitly set `HOST=0.0.0.0` and `PORT` as required. No public deployment is authorized by this stage.

## Browser wire contract

Upload:

- `POST /api/upload?fileName=<name>`
- `Content-Type: application/octet-stream`
- body: immutable owned MusicXML bytes

Edit:

- `POST /api/edit?fileName=<name>&sha=<lowercase-sha256>`
- `POST /api/edit/poly-v2?fileName=<name>&sha=<lowercase-sha256>`
- `Content-Type: application/vnd.st-guitar-tab-edit+octet-stream`
- body layout:
  1. 4-byte unsigned big-endian UTF-8 command-metadata byte length;
  2. UTF-8 JSON command metadata;
  3. the original immutable MusicXML source bytes.

The framing keeps arbitrary valid Unicode source identities out of ByteString-constrained HTTP headers and avoids the former 48 KiB header ceiling while still bounding metadata and source bytes independently. It also avoids introducing a multipart parser into the staging host.

For POLY_V2, browser-only renderer/tie identity metadata is projected out by `polyV2RuntimeCommands()` before framing. The authoritative POLY_V2 runtime independently rejects unknown fields if a direct client attempts to bypass that projection.

## E2E evidence

`tests/compatibility/alphaTabRuntimeHostE2e.mjs` launches the real host and the actual product shell, then uses the browser file chooser with a generated 16-measure MusicXML document. It requires:

1. `RUNTIME` mode and visible upload control;
2. an actual `POST /api/upload` request;
3. `PASS / MONO_V1`;
4. 16 rendered measures with standard notation and rhythmic TAB;
5. structured note selection;
6. an actual `POST /api/edit` request using the framed edit body;
7. revision 1 with regenerated score/TAB;
8. visible SVG output after regeneration.

Focused host tests additionally verify Unicode POLY_V2 source identities, maximum valid command-shape metadata capacity, malformed-frame rejection and the retained UI-07 runtime-authority boundary.

The dedicated `Runtime Staging E2E` workflow uploads a full-page screenshot as CI evidence.

## Non-authorities

This stage does not:

- deploy a public production service;
- alter the GitHub Pages preview contract;
- export PA/v2 or application runtimes from the package root;
- enable learned/shadow authority;
- persist user documents;
- add authentication, multi-user storage or account state;
- claim production synthesizer/playback authority;
- claim broad real-world MusicXML compatibility from the synthetic E2E fixture.

A later gate must use a curated set of real MusicXML documents and a deployed staging origin before production-readiness claims are allowed.
