# Third-party notices

The production npm dependency graph currently contains:

- `saxes` 6.0.0 — ISC License.
- `xmlchars` 2.2.0 — MIT License.

Compatibility CI additionally installs or invokes:

- `@coderline/alphatab` 1.8.4 — Mozilla Public License 2.0. It is also copied into the generated GitHub Pages preview artifact as same-origin browser/font/soundfont assets. The preview artifact includes the upstream alphaTab license text and package metadata under `third-party/alphatab/`.
- `puppeteer-core` 25.3.0 — Apache License 2.0; CI/browser verification only and not bundled in the Pages artifact.
- MuseScore CLI, when runner-provided — GNU GPL-family upstream terms; it is not bundled or downloaded by this repository.

Copyright notices and complete license texts supplied with installed packages
must be preserved when those packages are redistributed. This summary is not
a substitute for the upstream terms. The machine-readable inventory is
`third_party/dependency-licenses.json`.
