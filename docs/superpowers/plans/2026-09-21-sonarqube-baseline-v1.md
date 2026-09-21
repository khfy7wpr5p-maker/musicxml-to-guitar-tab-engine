# SonarQube Baseline v1 Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Establish a safe SonarQube Cloud baseline for GuitarTab Engine without changing MusicXML-to-Guitar-TAB runtime behavior or existing protected CI checks.

**Architecture:** Use SonarQube Cloud Automatic Analysis, which is already active for the GitHub repository. Do not run a second SonarScanner workflow concurrently. Keep analysis scope in `.sonarcloud.properties`; defer test coverage integration until a future explicit migration to CI-based analysis.

**Tech Stack:** SonarQube Cloud Automatic Analysis, GitHub integration, JavaScript/Node.js repository.

**Spec:** User-approved SonarQube Baseline v1 integration, 2026-09-21.

## Global Constraints

- Do not modify MusicXML parsing, POLY_V2, REVIEW_REQUIRED, editor, TAB generation, playback, or runtime behavior.
- Do not modify existing required branch-protection checks.
- Keep SonarQube observational during baseline establishment.
- Do not run Automatic Analysis and CI-based SonarScanner concurrently.
- Exclude third-party/evidence noise from first-party production-source analysis.
- Preserve Node.js 18/20/22 compatibility workflows exactly as-is.

## Baseline Evidence

- Project key: `khfy7wpr5p-maker_musicxml-to-guitar-tab-engine`
- PR #351 SonarCloud Code Analysis: Quality Gate passed
- New issues: 0
- Security hotspots on new code: 0
- Duplication on new code: 0.0%
- Coverage on new code: 0.0% (Automatic Analysis does not import JS/TS coverage reports)
- Existing Tests, MusicXML Compatibility, Runtime Staging E2E, Stage 09 Real Corpus Audit and A3 Real Piano Corpus Audit: success

## Closeout evidence — 2026-09-21

Baseline v1 is established with SonarQube Cloud Automatic Analysis as the single active Sonar path. The approved safe-cleanup tranche merged through PRs #352, #355, #356, #357, #358, #359 and #360. It covered explicit corpus/offline string ordering and four behavior-preserving diagnostic-collector cleanup changes with focused regression tests.

Protected `main` at `cd7d5806a1765ef86af208f1ebaa2a02cd657f97` reports SonarCloud Quality Gate passed, 0 Security Hotspots, 89 New issues, 0.0% coverage on new code and 1.1% duplication on new code. Baseline/approved cleanup is closed; the 89 remaining findings are a separate non-blocking backlog. Coverage migration remains an explicit future decision and must disable Automatic Analysis before any CI-based scanner is introduced.

## Tasks

### Task 1: Configure Automatic Analysis scope

**Files:**
- Create: `.sonarcloud.properties`

- [x] Separate first-party production sources: `src,api,scripts,tools,web`.
- [x] Classify `tests,verification,benchmarks` as test code.
- [x] Exclude `third_party/**`, `evidence/**`, dependency and minified noise.
- [x] Verify Automatic Analysis accepts the scoped configuration.

### Task 2: Avoid duplicate scanners

**Files:**
- No Sonar GitHub Actions scanner workflow.

- [x] Remove the provisional CI-based scanner workflow after Automatic Analysis was confirmed active.
- [x] Remove CI-only `sonar-project.properties` from this baseline PR.
- [x] Keep Automatic Analysis as the single analysis method for Baseline v1.

### Task 3: Baseline review

- [x] Confirm GitHub SonarCloud Code Analysis check is connected.
- [x] Confirm Quality Gate passed on PR #351.
- [x] Review whole-project issues after the scoped Automatic Analysis reruns.
- [x] Prioritize reliability/control-flow findings before broader maintainability cleanup.
- [ ] Decide separately whether coverage is valuable enough to migrate the project to CI-based analysis. Such a migration requires disabling Automatic Analysis first.
