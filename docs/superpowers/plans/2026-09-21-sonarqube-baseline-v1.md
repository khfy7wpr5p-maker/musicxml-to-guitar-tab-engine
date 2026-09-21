# SonarQube Baseline v1 Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Add a safe, non-blocking SonarQube Cloud baseline analysis path without changing MusicXML-to-Guitar-TAB runtime behavior or existing required CI checks.

**Architecture:** Keep SonarQube isolated in its own GitHub Actions workflow. Production and test workflows remain unchanged. Sonar project identity is supplied through GitHub repository variables and authentication through `SONAR_TOKEN`, so no organization or project key is guessed or committed.

**Tech Stack:** GitHub Actions, SonarQube Cloud, Node.js repository, official `SonarSource/sonarqube-scan-action`.

**Spec:** User-approved SonarQube Baseline v1 integration, 2026-09-21.

## Global Constraints

- Do not modify MusicXML parsing, POLY_V2, REVIEW_REQUIRED, editor, TAB generation, playback, or runtime behavior.
- Do not modify existing required branch-protection checks.
- SonarQube must start as non-blocking observation only.
- Do not guess or hard-code SonarQube organization or project keys.
- Do not commit tokens or credentials.
- Exclude third-party/generated evidence noise from production-source analysis.
- Preserve Node.js 18/20/22 compatibility workflows exactly as-is.

## Review Focus

- Missing Sonar credentials/variables must skip analysis cleanly rather than fail unrelated PRs.
- Pull requests from contexts without secrets must remain usable.
- Sonar scope must classify first-party production code separately from tests/benchmarks/verification.
- Existing protected CI checks must be untouched.
- The Sonar scan action must be pinned to an immutable commit SHA.

---

### Task 1: Define Sonar analysis scope

**Files:**
- Create: `sonar-project.properties`

**Interfaces:**
- Consumes: repository layout.
- Produces: stable source/test/exclusion configuration consumed by the Sonar scanner.

- [x] **Step 1: Define first-party production sources**
  - `src`
  - `api`
  - `scripts`
  - `tools`
  - `web`

- [x] **Step 2: Define test/evidence execution code**
  - `tests`
  - `verification`
  - `benchmarks`

- [x] **Step 3: Exclude third-party and dependency noise**
  - `third_party/**`
  - `**/node_modules/**`
  - `**/*.min.js`

- [ ] **Step 4: Verify first Sonar scanner context**
  Expected: production source and test code are not double-classified.

### Task 2: Add non-blocking GitHub Actions scan

**Files:**
- Create: `.github/workflows/sonarqube-baseline.yml`

**Interfaces:**
- Consumes:
  - secret `SONAR_TOKEN`
  - variable `SONAR_PROJECT_KEY`
  - variable `SONAR_ORGANIZATION`
- Produces: SonarQube Cloud baseline analysis on main/pull requests when configured.

- [x] **Step 1: Checkout with full history**
  Use `actions/checkout` with `fetch-depth: 0`.

- [x] **Step 2: Keep job non-blocking**
  Use job-level `continue-on-error: true`.

- [x] **Step 3: Skip safely when Sonar identity/auth is absent**
  Emit a configuration message; do not run the scanner.

- [x] **Step 4: Run official pinned scanner when configured**
  Use `SonarSource/sonarqube-scan-action@22918119ff8e1ca75a623e15c8296b6ea4fbe28f` (v8.2.1).

- [ ] **Step 5: Verify GitHub Actions run**
  Expected before credentials: workflow succeeds/skips scanner.
  Expected after credentials: scanner submits analysis to the configured SonarQube Cloud project.

### Task 3: Establish Baseline v1

**Files:**
- No production-code changes.

**Interfaces:**
- Consumes: first successful Sonar analysis.
- Produces: baseline counts for bugs, vulnerabilities/security hotspots, code smells, duplication, maintainability and available coverage data.

- [ ] **Step 1: Create/import the repository in SonarQube Cloud**
  Required human/account action if not already connected.

- [ ] **Step 2: Configure GitHub repository values**
  - Secret: `SONAR_TOKEN`
  - Variable: `SONAR_PROJECT_KEY`
  - Variable: `SONAR_ORGANIZATION`

- [ ] **Step 3: Run the workflow manually or through PR/main push**

- [ ] **Step 4: Record Baseline v1 findings without changing runtime behavior**

- [ ] **Step 5: Only after baseline review, decide whether to enforce a New Code Quality Gate**
