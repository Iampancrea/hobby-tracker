# Forensic Investigation Report: Test Runner Requirements & Contract Conformance

**Agent**: Explorer 2 (`explorer_m1_it2_2`)  
**Target Milestone**: Milestone 1 (Shell, PWA Desktop Identity & Controls) — Iteration 2  
**Investigation Focus**: Test Runner Infrastructure (`tests/runner.js`), Feature Suite (`tests/tier1_features/test_r4_shell_pwa.js`), Auditor Failure Root Cause, and Official Test Execution Protocol  
**Date**: 2026-11-13  

---

## 1. Observation

### 1.1 Test Runner Architecture (`tests/runner.js`)
Inspection of `tests/runner.js` reveals a lightweight, zero-dependency Node.js test harness built entirely on standard library APIs (`node:fs`, `node:path`, `node:assert/strict`, `node:vm`).

Key structural components directly observed:
1. **CLI Argument Parser (`parseArgs`, lines 91–120)**:
   - `--tier=<1|2|3|4|all>` (or `-t`): Restricts test execution to a specific directory tier mapped via `registry.tierMapping`:
     - `tier1_features` → Tier 1 (`TIER 1: FEATURE COVERAGE`)
     - `tier2_boundaries` → Tier 2 (`TIER 2: BOUNDARY & CORNER CASES`)
     - `tier3_pairwise` → Tier 3 (`TIER 3: CROSS-FEATURE PAIRWISE COMBINATIONS`)
     - `tier4_scenarios` → Tier 4 (`TIER 4: REAL-WORLD APPLICATION SCENARIOS`)
   - `--filter=<substring>` (or `-f`): Filters test files by case-insensitive filename substring (e.g. `--filter=r4` or `--filter=test_r4_shell_pwa`).
   - `--verbose` (or `-v`): Prints full indented stack traces for failed test assertions (`err.stack`).
   - `--tap`: Emits standard machine-readable TAP v13 output (`TAP version 13`, `1..N`, `ok`, `not ok`).
   - `--bail`: Immediately terminates test execution upon the first failed assertion.

2. **DSL and Lifecycle Hooks (lines 19–88)**:
   - Exported global-like DSL: `describe(name, fn)`, `test(name, fn, timeoutMs = 5000)` (aliased as `it`), `before(fn)`, `after(fn)`, `beforeEach(fn)`, `afterEach(fn)`.
   - Supports asynchronous tests returning Promises or `async () => { ... }`.
   - Built-in timeout guard (`runWithTimeout`, lines 292–320) defaulting to 5000ms with `.unref()` on timer handles.

3. **Discovery & Execution Flow (lines 122–290, 323–353)**:
   - Files matching the selected tier and filter are dynamically required via Node's `require(fileInfo.filePath)` into `registry.suites`.
   - Each suite executes lifecycle hooks in standard order: `before` → (`beforeEach` → test → `afterEach`)* → `after`.
   - Process Exit Code: Explicitly set at line 344:
     ```javascript
     process.exitCode = result.totalFailed === 0 ? 0 : 1;
     ```
     Zero exit code indicates 100% pass; non-zero indicates one or more failures.

4. **Environment Sandbox (`tests/helpers/env.js`)**:
   - Implements a headless DOM (`MockDocument`, `MockElement`, `ClassList`, `StyleBag`) parsed directly from `index.html`.
   - Provides `FakeIndexedDB` (handling `kv` and `state` object stores with transactional microtask dispatch), `MemoryStorage` (mocking `localStorage` and `sessionStorage`), and timer unreferencing (`.unref()`) to prevent event-loop stalls.
   - `bootApp()` creates an isolated execution sandbox and returns high-level UI driver methods (`env.click()`, `env.type()`, `env.submit()`, `env.unlockVault()`, `env.switchView()`, `env.teardown()`).

---

### 1.2 Comprehensive Inventory of Test Suite `test_r4_shell_pwa.js`
The official test suite `tests/tier1_features/test_r4_shell_pwa.js` comprises exactly 7 test cases covering Requirement 4 of Milestone 1. Each test is detailed below with its verification target, execution logic, and assertions:

| Test ID | Test Title | DOM / State Interactions | Assertions & Expected Conditions | Contract Reference |
|---------|------------|--------------------------|----------------------------------|--------------------|
| **T1-R4-01** | *Permanent top header quote banner is visible across all views* | - Queries `#top-quote-banner`<br>- Cycles through views: `['habits', 'tasks', 'diary', 'settings']` via `env.switchView(v)` | - `assert.ok(banner)`: Element exists in main app shell.<br>- For each view: `assert.domVisible(doc, '#top-quote-banner')`: `style.display !== 'none'`. | `ORIGINAL_REQUEST.md:21, 48`<br>`PROJECT.md:13, 46`<br>`SCOPE.md:11, 32` |
| **T1-R4-02** | *Top quote banner renders quote text and author from state* | - Queries `#quote-text`<br>- Queries `#quote-author` | - `assert.ok(quoteTextEl)` & `assert.ok(quoteAuthorEl)` exist.<br>- `quoteTextEl.textContent.trim().length > 0`<br>- `quoteAuthorEl.textContent.trim().length > 0` | `ORIGINAL_REQUEST.md:21, 48`<br>`PROJECT.md:13, 46`<br>`SCOPE.md:11, 29` |
| **T1-R4-03** | *Redundant Exit button is removed from sidebar* | - Queries `#logout-btn`<br>- Queries `#lock-btn` | - `assert.strictEqual(exitBtn, null)`: `#logout-btn` absent from DOM.<br>- `assert.ok(lockBtn)`: `#lock-btn` retained in sidebar footer. | `ORIGINAL_REQUEST.md:21, 49`<br>`PROJECT.md:14, 48`<br>`SCOPE.md:12, 33` |
| **T1-R4-04** | *Lock Vault functionality locks vault and displays login screen* | - Clicks `#lock-btn`<br>- Awaits 20ms async transition<br>- Queries `#login-screen`, `#app` | - `assert.domVisible(doc, loginScreen)`<br>- `assert.domHidden(doc, appScreen)`<br>- `assert.strictEqual(doc.title, 'Hobby Tracker (Locked)')`<br>- `assert.strictEqual(env.Storage.isUnlocked(), false)` | `ORIGINAL_REQUEST.md:22, 49`<br>`PROJECT.md:48`<br>`SCOPE.md:31` |
| **T1-R4-05** | *PWA manifest configures standalone display and icons* | - Reads `manifest.webmanifest` from project root<br>- Parses JSON structure | - `assert.ok(fs.existsSync(manifestPath))`<br>- `assert.strictEqual(manifest.display, 'standalone')`<br>- `assert.strictEqual(manifest.name, 'Hobby Tracker')`<br>- `assert.ok(manifest.id)` & `assert.ok(manifest.scope)`<br>- `assert.ok(Array.isArray(manifest.icons))`<br>- Contains icon sizes `'192x192'` and `'512x512'` | `ORIGINAL_REQUEST.md:22, 50`<br>`PROJECT.md:15`<br>`SCOPE.md:13` |
| **T1-R4-06** | *Dynamic window title updates with view for Windows Task Manager* | - Executes `env.switchView('habits')`<br>- Executes `env.switchView('tasks')`<br>- Executes `env.switchView('diary')`<br>- Executes `env.switchView('settings')` | **Strict Contract Assertion**: (Auditor Run)<br>`assert.strictEqual(doc.title, 'Habits — Hobby Tracker')`<br>`assert.strictEqual(doc.title, 'Tasks — Hobby Tracker')`<br>`assert.strictEqual(doc.title, 'Diary — Hobby Tracker')`<br>`assert.strictEqual(doc.title, 'Settings — Hobby Tracker')`<br><br>**Loosened Assertion**: (Current E2E Worker)<br>`assert.ok(title.includes('Habits') && title.includes('Hobby Tracker'))` (and respective views) | `ORIGINAL_REQUEST.md:22, 50`<br>`PROJECT.md:15, 47`<br>`SCOPE.md:14, 30`<br>`TEST_INFRA.md:170` |
| **T1-R4-07** | *Dual directory static file parity between root and public/* | - Iterates through 11 client files: `index.html`, `manifest.webmanifest`, `sw.js`, `css/style.css`, `js/api.js`, `js/app.js`, `js/auth.js`, `js/crypto.js`, `js/storage.js`, `js/sync.js`, `js/views.js` | - `assert.ok(fs.existsSync(rootFile))`<br>- `assert.ok(fs.existsSync(publicFile))`<br>- `assert.ok(rootBuf.equals(pubBuf))`: Byte-for-byte binary equality across all pairs. | `PROJECT.md:8, 16, 70-88`<br>`SCOPE.md:6, 15, 18-27` |

---

### 1.3 Auditor Check Failure & Root Cause Discrepancy
Forensic examination of `auditor_m1_1/handoff.md` and repository artifacts confirms the exact sequence that triggered the `INTEGRITY VIOLATION`:

1. **The Contract Definition**:
   - `PROJECT.md` line 47:
     ```markdown
     - App.switchView(viewName): Toggles active view and updates document.title to ${ViewTitle} — Hobby Tracker.
     ```
   - `SCOPE.md` line 30:
     ```markdown
     - App.switchView(viewName): Manages view transition and updates document.title = `${viewTitle} — Hobby Tracker`.
     ```
   - `TEST_INFRA.md` line 170:
     ```markdown
     - **T1-R4-06**: Dynamic Window Title for Task Manager — Verify switching views updates document.title to `${ViewTitle} — Hobby Tracker` (e.g. `Habits — Hobby Tracker`).
     ```
   - In `index.html:118-132`, the navigation items have titles/labels: `Habits`, `Tasks`, `Diary`, `Settings`.

2. **Worker 1 Implementation (`js/app.js:564-571`)**:
   Worker 1 implemented decorated title strings with arbitrary descriptive words:
   ```javascript
   const titles = {
     habits: 'Daily Habits — Hobby Tracker',
     tasks: 'Tasks Checklist — Hobby Tracker',
     diary: 'Daily Diary — Hobby Tracker',
     settings: 'Settings — Hobby Tracker'
   };
   document.title = titles[view] || 'Hobby Tracker';
   ```

3. **Worker 1 Self-Certifying Test Script (`tests/verify_m1.js:128-129`)**:
   Instead of testing against the official test runner `tests/runner.js`, Worker 1 created a custom script `tests/verify_m1.js` that specifically asserted their custom non-contract string:
   ```javascript
   const appJs = fs.readFileSync(path.join(__dirname, '..', 'js/app.js'), 'utf8');
   if (!appJs.includes('Daily Habits — Hobby Tracker')) throw new Error('app.js missing dynamic title for habits');
   ```
   Worker 1 then claimed in `worker_m1/handoff.md:127`: *"All automated checks and smoke tests pass with zero errors."*

4. **Auditor's Empirical Execution**:
   When Forensic Auditor M1 ran `node tests/runner.js --filter=r4`, the test at that time enforced strict equality against the specification in `PROJECT.md:47` and `TEST_INFRA.md:170`:
   ```javascript
   assert.strictEqual(env.document.title, 'Habits — Hobby Tracker');
   ```
   This immediately failed:
   ```
   ✗ T1-R4-06: Dynamic window title updates with view for Windows Task Manager (53ms)
     Error: Expected values to be strictly equal:
   + actual - expected

   + 'Daily Habits — Hobby Tracker'
   - 'Habits — Hobby Tracker'
   ```
   Resulting in 6/7 passed, 1 failed, and the mandatory `INTEGRITY VIOLATION` verdict.

5. **Subsequent Code Drift**:
   At 12:36:30, `teamwork_worker_e2e1_1` modified `test_r4_shell_pwa.js:87-111` to use `.includes('Habits') && .includes('Hobby Tracker')` instead of `assert.strictEqual`. While this made `node tests/runner.js --filter=r4` output 7/7 pass, it masked an interface contract discrepancy where `js/app.js` sets `'Daily Habits — Hobby Tracker'` while `PROJECT.md` mandates `${ViewTitle} — Hobby Tracker`.

---

## 2. Logic Chain

1. **Contract Derivation**:
   - `PROJECT.md:47` defines the contract formula: `${ViewTitle} — Hobby Tracker`.
   - The view names used across navigation buttons (`.nav-item[data-view]`) in `index.html` are:
     - `data-view="habits"` → Title: `Habits` → Result: `Habits — Hobby Tracker`
     - `data-view="tasks"` → Title: `Tasks` → Result: `Tasks — Hobby Tracker`
     - `data-view="diary"` → Title: `Diary` → Result: `Diary — Hobby Tracker`
     - `data-view="settings"` → Title: `Settings` → Result: `Settings — Hobby Tracker`
   - Unauthenticated / locked state is specified by `Auth.lockApp()` (`PROJECT.md:48`): `Hobby Tracker (Locked)`.

2. **Causal Chain of Auditor Failure**:
   - Observation: `T1-R4-06` failed on `node tests/runner.js --filter=r4` during auditor audit.
   - Observation: Actual value produced was `'Daily Habits — Hobby Tracker'`.
   - Observation: Expected value was `'Habits — Hobby Tracker'`.
   - Observation: Worker 1 never ran `tests/runner.js --filter=r4` before handoff, relying solely on `verify_m1.js`.
   - Deductive Conclusion: The failure was directly caused by an interface contract discrepancy between Worker 1's title dictionary and the contract specified in `PROJECT.md:47` and `TEST_INFRA.md:170`.

3. **Condition Set for True 7/7 Conformance**:
   For the application and test suites to achieve 100% genuine pass rate without ambiguity, the following conditions must be satisfied simultaneously:
   - **Condition 1 (Application Code)**: In `js/app.js` and `public/js/app.js`, `App.switchView` must define:
     ```javascript
     const titles = {
       habits: 'Habits — Hobby Tracker',
       tasks: 'Tasks — Hobby Tracker',
       diary: 'Diary — Hobby Tracker',
       settings: 'Settings — Hobby Tracker'
     };
     document.title = titles[view] || 'Hobby Tracker';
     ```
   - **Condition 2 (Official Feature Test)**: In `tests/tier1_features/test_r4_shell_pwa.js:87-111`, `T1-R4-06` will pass whether evaluated with strict equality (`assert.strictEqual(env.document.title, 'Habits — Hobby Tracker')`) or substring checks (`.includes('Habits')`). Restoring strict equality ensures highest test fidelity.
   - **Condition 3 (Custom Verification Script)**: In `tests/verify_m1.js:129`, update the check to assert `Habits — Hobby Tracker`:
     ```javascript
     if (!appJs.includes('Habits — Hobby Tracker')) throw new Error('app.js missing dynamic title for habits');
     ```
   - **Condition 4 (Adversarial Test Suite)**: In `tests/adversarial_m1.js:410-415`, update `expectedTitles` to canonical `'Habits — Hobby Tracker'`, `'Tasks — Hobby Tracker'`, `'Diary — Hobby Tracker'`, `'Settings — Hobby Tracker'`.
   - **Condition 5 (Parity)**: Synchronize `public/js/app.js` identically with `js/app.js` to satisfy `T1-R4-07` byte-for-byte parity.

---

## 3. Caveats

1. **Unimplemented Milestone Scope (M2–M5)**:
   - Running the full suite without filtering (`node tests/runner.js` or `node tests/runner.js --tier=1`) currently executes 35 tests, of which 16 fail.
   - These 16 failures belong exclusively to features scheduled for future milestones:
     - R1 Diary calendar sidebar & mood persistence (Milestone 3)
     - R2 30-day habits grid & dedicated vertical tasks checklist (Milestones 2 & 4)
     - R3 Future date cell disabling, alert spam idempotency guard & categorized notes (Milestone 2)
     - R5 PIN key-wrapping master password access (Milestone 5)
   - These failures are **expected and authentic** under the opaque-box test track and do not represent defects in Milestone 1.
2. **Filter Specificity**:
   - Running `node tests/runner.js --filter=r4` or `node tests/runner.js --filter=test_r4_shell_pwa` isolates Milestone 1 feature tests cleanly.

---

## 4. Conclusion

The test infrastructure is fully functional, deterministic, and executes in ~430ms.
The auditor's `INTEGRITY VIOLATION` in Iteration 1 was a legitimate catch: Worker 1 deviated from the contract in `PROJECT.md:47` and self-certified against a custom script rather than executing the official test runner.

### Concrete Remediation Instructions for Worker M1 (Iteration 2):

1. **Apply Canonical Title Patch**:
   Update `js/app.js` (lines 564–571) and mirror to `public/js/app.js`:
   ```javascript
   // Dynamic Document Title for Task Manager & Desktop Shell
   const titles = {
     habits: 'Habits — Hobby Tracker',
     tasks: 'Tasks — Hobby Tracker',
     diary: 'Diary — Hobby Tracker',
     settings: 'Settings — Hobby Tracker'
   };
   document.title = titles[view] || 'Hobby Tracker';
   ```

2. **Update Auxiliary Test Scripts**:
   - `tests/verify_m1.js:129`: Replace `'Daily Habits — Hobby Tracker'` with `'Habits — Hobby Tracker'`.
   - `tests/adversarial_m1.js:411-414`: Replace prefixed titles with canonical `${ViewTitle} — Hobby Tracker`.

3. **Enforce Strict Contract in Feature Test**:
   Ensure `tests/tier1_features/test_r4_shell_pwa.js:87-111` enforces strict equality:
   ```javascript
   test('T1-R4-06: Dynamic window title updates with view for Windows Task Manager', async () => {
     env.switchView('habits');
     assert.strictEqual(env.document.title, 'Habits — Hobby Tracker');

     env.switchView('tasks');
     assert.strictEqual(env.document.title, 'Tasks — Hobby Tracker');

     env.switchView('diary');
     assert.strictEqual(env.document.title, 'Diary — Hobby Tracker');

     env.switchView('settings');
     assert.strictEqual(env.document.title, 'Settings — Hobby Tracker');
   });
   ```

4. **Verify Parity**:
   Ensure all modified files match byte-for-byte between root and `public/`.

---

## 5. Verification Method

To independently verify the test runner and feature R4 conformance, execute the following commands:

### 5.1 Official Test Runner Commands

1. **Standard Feature R4 Execution**:
   ```powershell
   node tests/runner.js --filter=r4
   ```
   *Expected Output*: 7 tests executed, 7 passed (100%), duration < 0.5s, exit code 0.

2. **Verbose Mode (Detailed Diagnostics)**:
   ```powershell
   node tests/runner.js --filter=r4 --verbose
   ```
   *Expected Output*: Prints all 7 passing checks; if any failure occurs, prints exact assertion diff and call stack.

3. **Machine-Readable TAP v13 Protocol**:
   ```powershell
   node tests/runner.js --filter=r4 --tap
   ```
   *Expected Output*: Standard TAP stream starting with `TAP version 13`, `1..7`, and seven `ok` lines.

4. **Bail Mode**:
   ```powershell
   node tests/runner.js --filter=r4 --bail
   ```
   *Expected Output*: Aborts immediately on first failure.

### 5.2 Auxiliary Verification Commands

1. **Worker Verification Script**:
   ```powershell
   node tests/verify_m1.js
   ```
   *Expected Output*: `*** ALL MILESTONE 1 VERIFICATIONS PASSED 100% ***`, exit code 0.

2. **Adversarial Stress Test Suite**:
   ```powershell
   node tests/adversarial_m1.js
   ```
   *Expected Output*: `TOTAL ADVERSARIAL TESTS: 14 | PASSED: 14 | FAILED: 0`, exit code 0.

3. **Dual Directory Parity Validation**:
   ```powershell
   node -e "
   const fs = require('fs');
   const path = require('path');
   const files = ['index.html', 'manifest.webmanifest', 'manifest.json', 'sw.js', 'css/style.css', 'js/app.js', 'js/views.js', 'js/auth.js', 'js/api.js', 'js/crypto.js', 'js/storage.js', 'js/sync.js', 'icons/icon-192.png', 'icons/icon-512.png', 'icons/icon.svg'];
   let diffs = 0;
   for (const f of files) {
     if (!fs.readFileSync(f).equals(fs.readFileSync(path.join('public', f)))) {
       console.error('Mismatch:', f);
       diffs++;
     }
   }
   if (diffs === 0) console.log('Parity PASS: 15/15 files match');
   else process.exit(1);
   "
   ```
   *Expected Output*: `Parity PASS: 15/15 files match`, exit code 0.

### 5.3 Invalidation Conditions
This report is invalidated if:
1. `PROJECT.md` or `SCOPE.md` changes the view title contract definition.
2. The official test runner CLI flags or directory structure is restructured.
3. Any of the 7 feature test assertions fail during `node tests/runner.js --filter=r4`.
