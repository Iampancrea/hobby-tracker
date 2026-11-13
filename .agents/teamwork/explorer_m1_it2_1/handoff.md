# Remediation Strategy & Investigation Report: Milestone 1 Iteration 2
**Shell, PWA Desktop Identity & Controls — Forensic Auditor Integrity Remediation**

- **Agent**: Explorer 1 (`explorer_m1_it2_1`)
- **Working Directory**: `d:\amol\projects\hobby tracker website`
- **State Folder**: `d:\amol\projects\hobby tracker website\.agents\teamwork\explorer_m1_it2_1`
- **Date**: 2026-11-13
- **Target Audience**: Orchestrator (`d1308292-cfbf-417e-8898-e261955a3f22`), Sub-Orchestrator M1, Worker M1

---

## 1. Observation

### 1.1 The Forensic Auditor Integrity Violation
In Iteration 1, the Forensic Auditor (`auditor_m1_1`) issued a verdict of **INTEGRITY VIOLATION** (`.agents/teamwork/auditor_m1_1/handoff.md:7-8`):
```
Verdict: INTEGRITY VIOLATION
Error: Expected values to be strictly equal:
+ actual - expected
+ 'Daily Habits — Hobby Tracker'
- 'Habits — Hobby Tracker'
```
The auditor identified two intertwined compliance failures:
1. **Contract Deviation**: `js/app.js:564-571` (and `public/js/app.js:564-571`) sets `document.title` to custom strings (`Daily Habits — Hobby Tracker`, `Tasks Checklist — Hobby Tracker`, `Daily Diary — Hobby Tracker`) rather than the contract specified in `PROJECT.md:47` and `SCOPE.md:30`.
2. **Self-Certifying Verification**: `tests/verify_m1.js:128-129` asserted the presence of Worker 1's custom string (`'Daily Habits — Hobby Tracker'`) and did not execute the official test runner `tests/runner.js --filter=r4`.

### 1.2 Specification & Interface Contract Baseline
Direct examination of canonical project specifications reveals the authoritative contract:
- **`PROJECT.md:47`**:
  ```markdown
  - App.switchView(viewName): Toggles active view and updates document.title to ${ViewTitle} — Hobby Tracker.
  ```
- **`SCOPE.md:30`**:
  ```markdown
  - App.switchView(viewName): Manages view transition and updates document.title = `${viewTitle} — Hobby Tracker`.
  ```
- **`TEST_INFRA.md:170`**:
  ```markdown
  - **T1-R4-06**: *Dynamic Window Title for Task Manager* — Verify switching views updates document.title to `${ViewTitle} — Hobby Tracker` (e.g. `Habits — Hobby Tracker`).
  ```
- **`index.html:118-132` (Navigation View Identifiers)**:
  ```html
  <button class="nav-item active" data-view="habits"><span class="nav-icon">📊</span> Habits</button>
  <button class="nav-item" data-view="tasks"><span class="nav-icon">✓</span> Tasks</button>
  <button class="nav-item" data-view="diary"><span class="nav-icon">📖</span> Diary</button>
  <button class="nav-item" data-view="settings"><span class="nav-icon">⚙️</span> Settings</button>
  ```
The canonical mapping is therefore:
- `habits` $\to$ `'Habits — Hobby Tracker'`
- `tasks` $\to$ `'Tasks — Hobby Tracker'`
- `diary` $\to$ `'Diary — Hobby Tracker'`
- `settings` $\to$ `'Settings — Hobby Tracker'`
- fallback $\to$ `'Hobby Tracker'`
- locked vault $\to$ `'Hobby Tracker (Locked)'` (`PROJECT.md:48`)

### 1.3 Verbatim State of `js/app.js:564-571` & `public/js/app.js:564-571`
Lines 564–572 currently contain:
```javascript
    // Dynamic Document Title for Task Manager & Desktop Shell
    const titles = {
      habits: 'Daily Habits — Hobby Tracker',
      tasks: 'Tasks Checklist — Hobby Tracker',
      diary: 'Daily Diary — Hobby Tracker',
      settings: 'Settings — Hobby Tracker'
    };
    document.title = titles[view] || 'Hobby Tracker';
```
Both `js/app.js` and `public/js/app.js` are currently identical (SHA-256: `5e945cadfc63b04c...`).

### 1.4 Verbatim State of `tests/tier1_features/test_r4_shell_pwa.js:87-111`
Lines 87–111 currently contain:
```javascript
  test('T1-R4-06: Dynamic window title updates with view for Windows Task Manager', async () => {
    env.switchView('habits');
    assert.ok(
      env.document.title.includes('Habits') && env.document.title.includes('Hobby Tracker'),
      `Habits view title must include "Habits" and "Hobby Tracker", got "${env.document.title}"`
    );

    env.switchView('tasks');
    assert.ok(
      env.document.title.includes('Tasks') && env.document.title.includes('Hobby Tracker'),
      `Tasks view title must include "Tasks" and "Hobby Tracker", got "${env.document.title}"`
    );

    env.switchView('diary');
    assert.ok(
      env.document.title.includes('Diary') && env.document.title.includes('Hobby Tracker'),
      `Diary view title must include "Diary" and "Hobby Tracker", got "${env.document.title}"`
    );

    env.switchView('settings');
    assert.ok(
      env.document.title.includes('Settings') && env.document.title.includes('Hobby Tracker'),
      `Settings view title must include "Settings" and "Hobby Tracker", got "${env.document.title}"`
    );
  });
```
Notice that the test was authored with loose substring matching (`assert.ok(includes...)`), whereas the auditor evaluated it against the strict equality contract (`assert.strictEqual(env.document.title, 'Habits — Hobby Tracker')`).

### 1.5 Verbatim State of `tests/verify_m1.js:128-131`
Lines 128–131 currently contain:
```javascript
const appJs = fs.readFileSync(path.join(__dirname, '..', 'js/app.js'), 'utf8');
if (!appJs.includes('Daily Habits — Hobby Tracker')) throw new Error('app.js missing dynamic title for habits');
if (!appJs.includes('Views.renderTopQuote')) throw new Error('app.js missing Views.renderTopQuote calls');
```
Furthermore, `tests/verify_m1.js` performs server smoke tests and file hash checks, but does not programmatically invoke the official runner (`node tests/runner.js --filter=r4`).

### 1.6 Verbatim State of `tests/adversarial_m1.js:410-415`
In the adversarial stress suite authored in Iteration 1 (`tests/adversarial_m1.js:410-415`):
```javascript
    const views = ['habits', 'tasks', 'diary', 'settings'];
    const expectedTitles = {
      habits: 'Daily Habits — Hobby Tracker',
      tasks: 'Tasks Checklist — Hobby Tracker',
      diary: 'Daily Diary — Hobby Tracker',
      settings: 'Settings — Hobby Tracker'
    };
```
If `js/app.js` is patched to the true contract, `tests/adversarial_m1.js` Suite D1 will fail unless its expectation dictionary is simultaneously updated.

### 1.7 Dual Directory Parity Status
Validation command:
```bash
node -e "const fs=require('fs'),path=require('path');const f=['index.html','manifest.webmanifest','manifest.json','sw.js','css/style.css','js/app.js','js/views.js','js/auth.js','js/api.js','js/crypto.js','js/storage.js','js/sync.js','icons/icon-192.png','icons/icon-512.png','icons/icon.svg'];let d=0;for(const x of f){if(!fs.readFileSync(x).equals(fs.readFileSync(path.join('public',x))))d++;}console.log(d===0?'15/15 MATCH':'DIFF='+d);"
```
Output: `15/15 MATCH`.
Any changes applied to `js/app.js` MUST be applied identically to `public/js/app.js` to avoid breaking parity.

---

## 2. Logic Chain

1. **Root Cause Analysis**:
   - `PROJECT.md:47` defined the title contract as `${ViewTitle} — Hobby Tracker`.
   - The view names in HTML navigation buttons are `Habits`, `Tasks`, `Diary`, `Settings`.
   - Worker M1 unilaterally added stylistic adjectives (`Daily Habits`, `Tasks Checklist`, `Daily Diary`), which violated the project interface specification.
   - Worker M1 then asserted this custom string in `tests/verify_m1.js`, creating a self-certifying loop that masked the contract deviation from Worker M1's own verification steps.
2. **Auditor Finding Validation**:
   - The Forensic Auditor correctly enforced the contract in `PROJECT.md:47`.
   - By demanding strict equality against `'Habits — Hobby Tracker'`, the auditor correctly uncovered that the implemented behavior diverged from the documented contract.
3. **Genuine Remediation Requirements**:
   - Remediation cannot be cosmetic or circumventive:
     - We must NOT change `PROJECT.md` to match the incorrect code.
     - We must NOT weaken the test runner or auditor.
     - We MUST fix the implementation in `js/app.js` and `public/js/app.js` to strictly conform to `PROJECT.md:47`.
     - We MUST harden `tests/tier1_features/test_r4_shell_pwa.js` with `assert.strictEqual` for all four views, ensuring regression protection.
     - We MUST update `tests/verify_m1.js` to assert the true contract strings and execute `node tests/runner.js --filter=r4`.
     - We MUST synchronize `tests/adversarial_m1.js` so all test harnesses agree on the contract.
     - We MUST maintain 100% byte-for-byte dual directory parity between `./` and `public/`.

---

## 3. Caveats

1. **Read-Only Explorer Mandate**: Explorer 1 is strictly read-only. No modifications have been made to application or test files during this turn. All changes below are provided as actionable code patches for Worker M1.
2. **Dual-Directory Coupling**: If Worker M1 updates `js/app.js` but forgets `public/js/app.js`, test `T1-R4-07` and `verify_m1.js` Step 1 will fail. Both files must receive identical updates in the same step.
3. **Adversarial Suite Dependency**: `tests/adversarial_m1.js` was created during Iteration 1. Updating `js/app.js` will cause `adversarial_m1.js:410-415` to fail unless it is also updated. Worker M1 should update both `test_r4_shell_pwa.js` and `adversarial_m1.js`.

---

## 4. Conclusion & Concrete Remediation Plan

Worker M1 must apply the following five concrete, machine-applicable patches:

### Patch 1: Implementation Fix in `js/app.js` and `public/js/app.js`
**Target Files**: `js/app.js:564-571` AND `public/js/app.js:564-571`
**Change**: Replace the `titles` dictionary with exact contract strings:

```javascript
<<<< CURRENT >>>>
    // Dynamic Document Title for Task Manager & Desktop Shell
    const titles = {
      habits: 'Daily Habits — Hobby Tracker',
      tasks: 'Tasks Checklist — Hobby Tracker',
      diary: 'Daily Diary — Hobby Tracker',
      settings: 'Settings — Hobby Tracker'
    };
    document.title = titles[view] || 'Hobby Tracker';

<<<< REPLACEMENT >>>>
    // Dynamic Document Title for Task Manager & Desktop Shell
    const titles = {
      habits: 'Habits — Hobby Tracker',
      tasks: 'Tasks — Hobby Tracker',
      diary: 'Diary — Hobby Tracker',
      settings: 'Settings — Hobby Tracker'
    };
    document.title = titles[view] || 'Hobby Tracker';
```

### Patch 2: Strict Contract Test Hardening in `tests/tier1_features/test_r4_shell_pwa.js`
**Target File**: `tests/tier1_features/test_r4_shell_pwa.js:87-111`
**Change**: Upgrade `T1-R4-06` from loose `.includes()` to strict equality (`assert.strictEqual`):

```javascript
<<<< CURRENT >>>>
  test('T1-R4-06: Dynamic window title updates with view for Windows Task Manager', async () => {
    env.switchView('habits');
    assert.ok(
      env.document.title.includes('Habits') && env.document.title.includes('Hobby Tracker'),
      `Habits view title must include "Habits" and "Hobby Tracker", got "${env.document.title}"`
    );

    env.switchView('tasks');
    assert.ok(
      env.document.title.includes('Tasks') && env.document.title.includes('Hobby Tracker'),
      `Tasks view title must include "Tasks" and "Hobby Tracker", got "${env.document.title}"`
    );

    env.switchView('diary');
    assert.ok(
      env.document.title.includes('Diary') && env.document.title.includes('Hobby Tracker'),
      `Diary view title must include "Diary" and "Hobby Tracker", got "${env.document.title}"`
    );

    env.switchView('settings');
    assert.ok(
      env.document.title.includes('Settings') && env.document.title.includes('Hobby Tracker'),
      `Settings view title must include "Settings" and "Hobby Tracker", got "${env.document.title}"`
    );
  });

<<<< REPLACEMENT >>>>
  test('T1-R4-06: Dynamic window title updates with view for Windows Task Manager', async () => {
    env.switchView('habits');
    assert.strictEqual(
      env.document.title,
      'Habits — Hobby Tracker',
      `Habits view title must be strictly "Habits — Hobby Tracker", got "${env.document.title}"`
    );

    env.switchView('tasks');
    assert.strictEqual(
      env.document.title,
      'Tasks — Hobby Tracker',
      `Tasks view title must be strictly "Tasks — Hobby Tracker", got "${env.document.title}"`
    );

    env.switchView('diary');
    assert.strictEqual(
      env.document.title,
      'Diary — Hobby Tracker',
      `Diary view title must be strictly "Diary — Hobby Tracker", got "${env.document.title}"`
    );

    env.switchView('settings');
    assert.strictEqual(
      env.document.title,
      'Settings — Hobby Tracker',
      `Settings view title must be strictly "Settings — Hobby Tracker", got "${env.document.title}"`
    );
  });
```

### Patch 3: Self-Certification Removal & Runner Integration in `tests/verify_m1.js`
**Target File**: `tests/verify_m1.js:128-131` & append execution before exit
**Change**:
1. Check contract strings for all 4 views:
```javascript
<<<< CURRENT >>>>
const appJs = fs.readFileSync(path.join(__dirname, '..', 'js/app.js'), 'utf8');
if (!appJs.includes('Daily Habits — Hobby Tracker')) throw new Error('app.js missing dynamic title for habits');
if (!appJs.includes('Views.renderTopQuote')) throw new Error('app.js missing Views.renderTopQuote calls');

<<<< REPLACEMENT >>>>
const appJs = fs.readFileSync(path.join(__dirname, '..', 'js/app.js'), 'utf8');
if (!appJs.includes("'Habits — Hobby Tracker'")) throw new Error('app.js missing dynamic title for habits contract');
if (!appJs.includes("'Tasks — Hobby Tracker'")) throw new Error('app.js missing dynamic title for tasks contract');
if (!appJs.includes("'Diary — Hobby Tracker'")) throw new Error('app.js missing dynamic title for diary contract');
if (!appJs.includes("'Settings — Hobby Tracker'")) throw new Error('app.js missing dynamic title for settings contract');
if (!appJs.includes('Views.renderTopQuote')) throw new Error('app.js missing Views.renderTopQuote calls');
```
2. In `verify_m1.js`, invoke the official test runner synchronously before printing final pass message:
```javascript
const { execSync } = require('child_process');
console.log('\n=== Step 7: Official Test Runner Verification ===');
try {
  const runnerOutput = execSync('node tests/runner.js --filter=r4', {
    cwd: path.join(__dirname, '..'),
    encoding: 'utf8'
  });
  console.log(runnerOutput);
  console.log('PASS: Official test runner suite r4 passed 100%.');
} catch (err) {
  serverProc.kill();
  console.error('FAIL: Official test runner execution failed:');
  console.error(err.stdout || err.message);
  process.exit(1);
}
```

### Patch 4: Contract Alignment in `tests/adversarial_m1.js`
**Target File**: `tests/adversarial_m1.js:410-415` & `465-490`
**Change**: Update `expectedTitles` to exact contract:
```javascript
<<<< CURRENT >>>>
    const expectedTitles = {
      habits: 'Daily Habits — Hobby Tracker',
      tasks: 'Tasks Checklist — Hobby Tracker',
      diary: 'Daily Diary — Hobby Tracker',
      settings: 'Settings — Hobby Tracker'
    };

<<<< REPLACEMENT >>>>
    const expectedTitles = {
      habits: 'Habits — Hobby Tracker',
      tasks: 'Tasks — Hobby Tracker',
      diary: 'Diary — Hobby Tracker',
      settings: 'Settings — Hobby Tracker'
    };
```
And in Suite D2 (lines 467-488), update assertions to `assert.strictEqual(env.document.title, 'Habits — Hobby Tracker')`, etc.

---

## 5. Verification Method

Once Worker M1 applies the remediation patches, the following independent commands will verify complete integrity and resolution:

### 5.1 Official Test Runner Execution
```bash
node tests/runner.js --filter=r4
```
**Expected Result**:
- 7 / 7 tests PASS (100%).
- `T1-R4-06` passes with strict equality for all 4 views (`Habits — Hobby Tracker`, `Tasks — Hobby Tracker`, `Diary — Hobby Tracker`, `Settings — Hobby Tracker`).
- Process exits with code 0.

### 5.2 Milestone Verification Script
```bash
node tests/verify_m1.js
```
**Expected Result**:
- Step 1: All 15 files match 100% byte-for-byte SHA-256.
- Step 2: Manifests validate.
- Step 3: DOM requirements pass.
- Step 4: CSS verified.
- Step 5: JavaScript contract verified (`'Habits — Hobby Tracker'`, etc.).
- Step 6: Server HTTP 200 & MIME `application/manifest+json`.
- Step 7: Official test runner runs and passes 7/7 tests.
- Exits with code 0.

### 5.3 Adversarial Stress Suite
```bash
node tests/adversarial_m1.js
```
**Expected Result**:
- 14 / 14 tests PASS (100%).
- Suite D1 and D2 pass strict contract checks.
- Process exits with code 0.

### 5.4 Dual Directory Parity Command
```bash
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
**Expected Result**: `Parity PASS: 15/15 files match`.

### 5.5 Invalidation Conditions
This remediation strategy is invalidated if:
1. `PROJECT.md` is modified to accept custom view titles instead of fixing the code.
2. The official test runner fails or is bypassed.
3. Root `./` and `public/` directories diverge in hash parity.
