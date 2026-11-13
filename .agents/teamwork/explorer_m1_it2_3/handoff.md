# Handoff Report: Explorer 3 — Dual Directory Parity & Regression Avoidance during Remediation (Milestone 1, Iteration 2)

**Agent**: Explorer 3 (`explorer_m1_it2_3`)  
**Context**: Milestone 1 Iteration 2 Remediation Planning  
**Mandate**: Investigate and report on Dual Directory Parity & Regression Avoidance for the `document.title` contract fix  

---

## 1. Observation

### 1.1 Integrity Violation Context & Failing Title Contract
- In `auditor_m1_1/handoff.md:28-34`, Forensic Auditor M1 rejected Worker 1's deliverable with verdict **INTEGRITY VIOLATION**:
  ```
  ✗ T1-R4-06: Dynamic window title updates with view for Windows Task Manager (53ms)
    Error: Expected values to be strictly equal:
  + actual - expected

  + 'Daily Habits — Hobby Tracker'
  - 'Habits — Hobby Tracker'
  ```
- In `PROJECT.md:47`, the interface contract is explicitly defined:
  > `- App.switchView(viewName): Toggles active view and updates document.title to ${ViewTitle} — Hobby Tracker.`
- In `SCOPE.md:30`, the contract specifies:
  > `- App.switchView(viewName): Manages view transition and updates document.title = \`${viewTitle} — Hobby Tracker\`.`
- In `TEST_INFRA.md:170`, the test specification states:
  > `- **T1-R4-06**: *Dynamic Window Title for Task Manager* — Verify switching views updates document.title to \`${ViewTitle} — Hobby Tracker\` (e.g. \`Habits — Hobby Tracker\`).`

### 1.2 Exact Code Locations Touched by Title Contract Fix

#### File A: `js/app.js` (Lines 564–572)
```javascript
564:    // Dynamic Document Title for Task Manager & Desktop Shell
565:    const titles = {
566:      habits: 'Daily Habits — Hobby Tracker',
567:      tasks: 'Tasks Checklist — Hobby Tracker',
568:      diary: 'Daily Diary — Hobby Tracker',
569:      settings: 'Settings — Hobby Tracker'
570:    };
571:    document.title = titles[view] || 'Hobby Tracker';
```

#### File B: `public/js/app.js` (Lines 564–572)
Contains lines verbatim identical to `js/app.js:564-572`. Currently matches `js/app.js` byte-for-byte (SHA256: `5e945cadfc63b04c86129fcb03b5f4be8d844512e2f3a670bcbb8e5473e3bf9b`, 19,865 bytes).

#### File C: `tests/verify_m1.js` (Lines 128–130)
```javascript
128: const appJs = fs.readFileSync(path.join(__dirname, '..', 'js/app.js'), 'utf8');
129: if (!appJs.includes('Daily Habits — Hobby Tracker')) throw new Error('app.js missing dynamic title for habits');
130: if (!appJs.includes('Views.renderTopQuote')) throw new Error('app.js missing Views.renderTopQuote calls');
```
Line 129 hardcodes an assertion on `'Daily Habits — Hobby Tracker'`, which caused Worker 1's verification script to self-certify divergent code and will throw an error immediately if `js/app.js` is patched without updating `verify_m1.js`.

#### File D: `tests/adversarial_m1.js` (Lines 409–423)
```javascript
409:    const views = ['habits', 'tasks', 'diary', 'settings'];
410:    const expectedTitles = {
411:      habits: 'Daily Habits — Hobby Tracker',
412:      tasks: 'Tasks Checklist — Hobby Tracker',
413:      diary: 'Daily Diary — Hobby Tracker',
414:      settings: 'Settings — Hobby Tracker'
415:    };
416: 
417:    for (const v of views) {
418:      env.switchView(v);
419:      assert.strictEqual(
420:        env.document.title,
421:        expectedTitles[v],
422:        `Title for view "${v}" must be "${expectedTitles[v]}", got "${env.document.title}"`
423:      );
```
`tests/adversarial_m1.js` was created during Challenger M1's audit. In Suite D (Test D1), it strictly asserts `env.document.title === expectedTitles[v]`. If `js/app.js` is updated to `'Habits — Hobby Tracker'`, running `tests/adversarial_m1.js` will fail on test D1 unless lines 410–415 are also updated to the canonical title contract.

### 1.3 Empirical Audit of Dual Directory Parity
Executing an automated SHA-256 and byte-buffer comparison across all 15 tracked client files (`index.html`, `manifest.webmanifest`, `manifest.json`, `sw.js`, `css/style.css`, `js/api.js`, `js/app.js`, `js/auth.js`, `js/crypto.js`, `js/storage.js`, `js/sync.js`, `js/views.js`, `icons/icon-192.png`, `icons/icon-512.png`, `icons/icon.svg`) confirmed:
- Root and `public/` files are currently **100% byte-for-byte identical** (15/15 files match).
- `Buffer.equals()` evaluates to `true` for all 15 pairs.
- Note: `js/util.js` exists in root (136 bytes from initial repository setup) but does not exist in `public/`. However, `index.html` does NOT import `js/util.js` (it loads `crypto.js`, `storage.js`, `sync.js`, `api.js`, `auth.js`, `views.js`, `app.js`), and neither `tests/tier1_features/test_r4_shell_pwa.js` (T1-R4-07) nor `tests/verify_m1.js` tracks `js/util.js`. All 15 active client files match perfectly.

### 1.4 Module Dependency & Cross-File Audit
An exhaustive grep and syntactic scan of all JS source files confirmed:
1. **`js/views.js`**: Total 680 lines. Zero references to `document.title` or `titles`. View rendering strictly uses DOM element references (`#top-quote-banner`, `#habit-modal-title`, etc.) and task model properties (`task.title`). Never reads or writes `document.title`.
2. **`js/auth.js`**: Total 240 lines. Lines 74, 90, and 217 assign `document.title = 'Hobby Tracker (Locked)'`. It never reads `document.title` and never checks view titles. Upon unlock, it calls `App.init()`, which triggers `App.switchView('habits')`.
3. **`js/storage.js`**: Total 490 lines. Zero DOM or `document.title` references. Only uses `taskData.title`.
4. **`js/sync.js`**: Total 380 lines. Zero `document.title` references. `Sync.updateUI()` calls `App.updateSyncUI()`, which only updates `.sync-label` and `.sync-dot` text and CSS classes.
5. **`sw.js`**: Total 70 lines. Lists `./js/app.js` in `APP_SHELL` array. Caches by URL path, completely content-agnostic.
6. **`server.js`**: Built-in static server serving from `public/`. Content-agnostic.

---

## 2. Logic Chain

1. **Root Cause Analysis of Iteration 1 Failure**:
   - The discrepancy was caused by Worker 1 implementing non-contract title strings (`'Daily Habits — Hobby Tracker'`, `'Tasks Checklist — Hobby Tracker'`, `'Daily Diary — Hobby Tracker'`) instead of `${ViewTitle} — Hobby Tracker` (`'Habits — Hobby Tracker'`, `'Tasks — Hobby Tracker'`, `'Diary — Hobby Tracker'`, `'Settings — Hobby Tracker'`).
   - Worker 1's verification script `tests/verify_m1.js` did not run the official test suite and instead asserted on Worker 1's custom string at line 129, masking the regression.
2. **Zero-Regression Guarantee Across Application Modules**:
   - Observations in Section 1.4 prove that `document.title` is a write-only sink in `js/app.js` (during `switchView`) and `js/auth.js` (during `lockApp` / `init`).
   - No module in the application reads, parses, validates, or relies on `document.title` for state transitions, navigation, data persistence, cryptography, or DOM rendering.
   - Therefore, updating the string values in the `titles` lookup dictionary inside `App.switchView` carries **zero regression risk** for `views.js`, `auth.js`, `storage.js`, and `sync.js`.
3. **Dual Directory Parity Preservation**:
   - `server.js` serves files exclusively from `public/`.
   - GitHub Pages serves files from the root `./`.
   - Test `T1-R4-07` in `tests/tier1_features/test_r4_shell_pwa.js` uses `rootBuf.equals(pubBuf)` across all client files.
   - If Worker 2 manually edits `js/app.js` and `public/js/app.js` separately, editor settings can introduce whitespace, indentation, or line-ending differences (CRLF `\r\n` vs LF `\n`), immediately failing `rootBuf.equals(pubBuf)`.
   - The only deterministic, zero-defect mechanism to ensure 100% byte-for-byte SHA256 parity is programmatic file replication: editing root `js/app.js`, and then copying it directly to `public/js/app.js` using `fs.copyFileSync('js/app.js', 'public/js/app.js')`.
4. **Comprehensive Test Suite Alignment**:
   - In addition to updating `js/app.js` and `public/js/app.js`, `tests/verify_m1.js:129` must be updated to assert `'Habits — Hobby Tracker'`.
   - In addition, `tests/adversarial_m1.js:410-415` must be updated to expect the canonical titles (`'Habits — Hobby Tracker'`, `'Tasks — Hobby Tracker'`, `'Diary — Hobby Tracker'`, `'Settings — Hobby Tracker'`).
   - Once these files are synchronized, both the official test suite (`node tests/runner.js --filter=r4`), the verification script (`node tests/verify_m1.js`), and the adversarial test suite (`node tests/adversarial_m1.js`) will pass 100% with zero errors.

---

## 3. Caveats

1. **`js/util.js` legacy file**:
   `js/util.js` exists in the root folder but not in `public/`. This file is legacy code from the project's initial commit that is neither referenced in `index.html` nor checked by `test_r4_shell_pwa.js` / `verify_m1.js`. Worker 2 should NOT modify or touch `js/util.js` during Milestone 1 remediation to prevent scope creep.
2. **Tier 1 Baseline Test Status**:
   Running `node tests/runner.js --tier=1` produces 19 passing tests out of 35 (54%). The 16 failing tests belong strictly to Milestones 2 through 5 (e.g. 30-day habits grid, cell notes, diary calendar sidebar, dedicated tasks checklist, encrypted cloud sync) and are intentional test fixtures. They are NOT regressions. For Milestone 1, the definitive pass metric is 7/7 (100%) on `node tests/runner.js --filter=r4`.

---

## 4. Conclusion

1. **Files to Modify**:
   - `js/app.js`: Update `titles` object (lines 565–570).
   - `public/js/app.js`: Overwrite with exact byte duplicate of `js/app.js` via `fs.copyFileSync`.
   - `tests/verify_m1.js`: Update line 129 assertion from `'Daily Habits — Hobby Tracker'` to `'Habits — Hobby Tracker'`.
   - `tests/adversarial_m1.js`: Update `expectedTitles` object (lines 410–415) to canonical titles.
2. **Exact Title Mapping**:
   ```javascript
   const titles = {
     habits: 'Habits — Hobby Tracker',
     tasks: 'Tasks — Hobby Tracker',
     diary: 'Diary — Hobby Tracker',
     settings: 'Settings — Hobby Tracker'
   };
   document.title = titles[view] || 'Hobby Tracker';
   ```
3. **Parity Strategy**:
   - Edit root `js/app.js`.
   - Copy root `js/app.js` to `public/js/app.js` using `fs.copyFileSync`.
   - Verify SHA-256 and byte buffer equality before running tests.
4. **Side Effects**:
   - Confirmed zero side effects and zero regressions across all other modules.

---

## 5. Verification Method

### Step-by-Step Verification Checklist for Worker 2

Worker 2 must execute every check in this checklist in sequence and verify all exit codes are 0 before submitting their handoff:

#### Step 1: Execute Title Patch & Binary Copy
1. Apply the 4-line dictionary edit to `js/app.js`:
   ```javascript
   const titles = {
     habits: 'Habits — Hobby Tracker',
     tasks: 'Tasks — Hobby Tracker',
     diary: 'Diary — Hobby Tracker',
     settings: 'Settings — Hobby Tracker'
   };
   ```
2. Replicate `js/app.js` to `public/js/app.js`:
   ```bash
   node -e "const fs = require('fs'); fs.copyFileSync('js/app.js', 'public/js/app.js'); console.log('PARITY SYNC: js/app.js successfully copied to public/js/app.js');"
   ```
3. Update `tests/verify_m1.js:129`:
   ```javascript
   if (!appJs.includes('Habits — Hobby Tracker')) throw new Error('app.js missing dynamic title for habits');
   ```
4. Update `tests/adversarial_m1.js:410-415`:
   ```javascript
   const expectedTitles = {
     habits: 'Habits — Hobby Tracker',
     tasks: 'Tasks — Hobby Tracker',
     diary: 'Diary — Hobby Tracker',
     settings: 'Settings — Hobby Tracker'
   };
   ```

#### Step 2: Verify 100% Byte-for-Byte SHA-256 Parity
Execute the 15-file parity audit:
```bash
node -e "
const fs = require('fs');
const crypto = require('crypto');
const path = require('path');
const files = [
  'index.html', 'manifest.webmanifest', 'manifest.json', 'sw.js',
  'css/style.css', 'js/api.js', 'js/app.js', 'js/auth.js',
  'js/crypto.js', 'js/storage.js', 'js/sync.js', 'js/views.js',
  'icons/icon-192.png', 'icons/icon-512.png', 'icons/icon.svg'
];
let mismatches = 0;
for (const f of files) {
  const rBuf = fs.readFileSync(f);
  const pBuf = fs.readFileSync(path.join('public', f));
  if (!rBuf.equals(pBuf)) {
    console.error('FAIL: Mismatch in ' + f);
    mismatches++;
  } else {
    const h = crypto.createHash('sha256').update(rBuf).digest('hex').substring(0, 16);
    console.log('PASS: ' + f + ' [' + h + '...] (' + rBuf.length + ' bytes)');
  }
}
if (mismatches === 0) {
  console.log('\nDUAL DIRECTORY PARITY AUDIT: 100% PASS (15/15 files match byte-for-byte)');
} else {
  console.error('\nDUAL DIRECTORY PARITY AUDIT: FAILED (' + mismatches + ' mismatches)');
  process.exit(1);
}
"
```
**Acceptance Criterion**: Exit code `0` and `DUAL DIRECTORY PARITY AUDIT: 100% PASS`.

#### Step 3: Run the Official E2E Test Suite (Milestone 1 Scope)
```bash
node tests/runner.js --filter=r4
```
**Acceptance Criterion**:
- 7 / 7 tests pass (100%).
- `T1-R4-06: Dynamic window title updates with view for Windows Task Manager` passes cleanly.
- `T1-R4-07: Dual directory static file parity between root and public/` passes cleanly.
- Exit code: `0`.

#### Step 4: Run Milestone 1 Verification Script
```bash
node tests/verify_m1.js
```
**Acceptance Criterion**:
- Steps 1 through 6 pass.
- Server returns HTTP 200 for `/index.html` and `application/manifest+json` for `/manifest.webmanifest`.
- `*** ALL MILESTONE 1 VERIFICATIONS PASSED 100% ***`.
- Exit code: `0`.

#### Step 5: Run Milestone 1 Adversarial Suite
```bash
node tests/adversarial_m1.js
```
**Acceptance Criterion**:
- Suite D (D1 and D2) passes.
- `TOTAL ADVERSARIAL TESTS: 14, PASSED: 14, FAILED: 0`.
- Exit code: `0`.

#### Step 6: Verify Regression Safety Across Entire Tier 1 Suite
```bash
node tests/runner.js --tier=1
```
**Acceptance Criterion**:
- Tier 1 executes cleanly and produces 19 PASS / 16 FAIL (54% pass rate matching the known pre-implementation baseline).
- All 7 R4 tests continue to pass.
- Exit code: `1` (normal for partial milestones; does not hang, no unhandled exceptions).

### Invalidation Conditions
This investigation report is invalidated if:
1. `document.title` values are changed to anything other than the exact contract `${ViewTitle} — Hobby Tracker` (`Habits — Hobby Tracker`, `Tasks — Hobby Tracker`, `Diary — Hobby Tracker`, `Settings — Hobby Tracker`).
2. `public/js/app.js` diverges from `js/app.js` in length, whitespace, or SHA-256 hash.
3. Any of the 4 verification test commands fails with a non-zero exit code or uncaught error.
