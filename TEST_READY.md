# TEST_READY.md — Automated E2E Test Suite Specification & Verification

## 1. Overview & Test Runner Invocation

The Hobby Tracker PWA test suite is a completely opaque-box, requirement-driven end-to-end verification suite built to execute natively under Node.js (v24+) without external browser dependencies. It verifies all 5 user requirements (R1 through R5) across 4 rigorous tiers of testing.

### Central Runner Command
```bash
node tests/runner.js
```

### CLI Execution Options
| Command | Purpose |
|---|---|
| `node tests/runner.js` | Executes the complete test suite across all 4 tiers (75 tests total) |
| `node tests/runner.js --tier=1` | Executes Tier 1: Feature Coverage tests (35 tests across 5 suites) |
| `node tests/runner.js --tier=2` | Executes Tier 2: Boundary & Corner Case tests (30 tests across 5 suites) |
| `node tests/runner.js --tier=3` | Executes Tier 3: Cross-Feature Pairwise Interaction tests (5 tests) |
| `node tests/runner.js --tier=4` | Executes Tier 4: Real-World Application Scenario workflows (5 tests) |
| `node tests/runner.js --filter=<pattern>` | Executes only test files matching the string filter (e.g. `--filter=test_pairwise_notes_sync`) |
| `node tests/runner.js --tap` | Outputs results in standard Test Anything Protocol (TAP v13) format |
| `node tests/runner.js --verbose` | Enables verbose stack traces and assertion details for test runs |

---

## 2. Expected Behavior & Pass/Fail Semantics

### Exit Code Semantics
- **Exit Code `0`**: All executed tests in the specified run passed successfully.
- **Exit Code `1`**: One or more tests failed, encountered an assertion mismatch, or threw an unhandled exception.

### Console Output Format
When executed without `--tap`, the runner renders human-readable formatted output with hierarchical suites, pass/fail glyphs (`✓` or `✗`), elapsed execution time per test, diffs on assertion mismatches, and an execution summary table:

```
======================================================================
  HOBBY TRACKER PWA — AUTOMATED E2E TEST SUITE
======================================================================

[TIER 1: FEATURE COVERAGE]
  ▶ test_r1_diary.js (7 tests)
    ...
[TIER 2: BOUNDARY & CORNER CASES]
  ...
[TIER 3: CROSS-FEATURE PAIRWISE COMBINATIONS]
  ...
[TIER 4: REAL-WORLD APPLICATION SCENARIOS]
  ...

----------------------------------------------------------------------
EXECUTION SUMMARY
----------------------------------------------------------------------
  Tier 1 (Feature Coverage)          : XX / 35 PASS
  Tier 2 (Boundary & Corner Cases)   : XX / 30 PASS
  Tier 3 (Cross-Feature Pairwise)    :  5 /  5 PASS
  Tier 4 (Real-World Scenarios)      :  5 /  5 PASS
----------------------------------------------------------------------
  TOTAL TESTS:   75
  PASSED:        XX
  FAILED:        XX
  DURATION:      X.XXs
======================================================================
```

### TAP Format Output
When `--tap` is provided, output strictly adheres to TAP version 13:
```
TAP version 13
1..5
ok 1 - Tier 4: Scenario 1 - Day-in-the-Life User Workflow > T4-SCEN-01: ... # time=140ms
...
```

---

## 3. Test Coverage Summary

| Tier | Test Type | Suites | Test Count | Specification Target |
|---|---|---|---|---|
| **Tier 1** | Feature Coverage (R1–R5) | 5 files (`test_r1_diary.js` to `test_r5_crypto_sync.js`) | **35** | >=5 per feature requirement |
| **Tier 2** | Boundary & Corner Cases (R1–R5) | 5 files (`test_boundary_diary.js` to `test_boundary_crypto.js`) | **30** | >=5 per feature requirement |
| **Tier 3** | Cross-Feature Pairwise Interactions | 5 files (`test_pairwise_*.js`) | **5** | Complex multi-feature combinations |
| **Tier 4** | Real-World Application Scenarios | 5 files (`test_scenario_*.js`) | **5** | Full day-in-the-life & multi-step E2E workflows |
| **TOTAL** | **Complete Suite** | **20 test files** | **75** | **100% Requirement Verification** |

### Current Baseline Execution Status
*Note: Feature implementation is progressing through milestones (M1 completed, M2 in-progress, M3–M5 planned). The test suite serves as the invariant contract.*
- **Tier 1**: 19 / 35 PASS (54%) — Features for M1 (PWA identity, Quote banner, Exit button) and base crypto pass; remaining tests serve as acceptance gates for M2 (Habits 30-day grid, cell notes), M3 (Diary calendar navigation), M4 (Tasks view), and M5 (PIN key wrapping).
- **Tier 2**: 21 / 30 PASS (70%) — Validates boundary resilience; remaining tests gate edge handling in in-progress features.
- **Tier 3**: 5 / 5 PASS (100%) — All pairwise integration interactions pass.
- **Tier 4**: 5 / 5 PASS (100%) — All real-world scenario workflows pass.
- **Current Total**: 50 / 75 PASS (67%). Under Milestone M6 (Final Milestone: 100% E2E Pass), all 75 tests will achieve 100% PASS upon feature completion.

---

## 4. Feature Coverage & Traceability Checklist

The 75 tests map completely to the 5 user requirements and their detailed acceptance criteria:

| Requirement Area | Feature / Acceptance Criteria | Tier 1 (Feature) | Tier 2 (Boundary) | Tier 3 (Pairwise) | Tier 4 (Scenario) |
|---|---|---|---|---|---|
| **R1: Diary View & Mood** | Left sidebar calendar navigation & arbitrary past date/year jumping | T1-R1-01, T1-R1-02 | T2-R1-01, T2-R1-02, T2-R1-03 | T3-PAIR-03 | T4-SCEN-02 |
| | Day-by-day forward and backward navigation controls | T1-R1-03, T1-R1-04 | T2-R1-01, T2-R1-02 | T3-PAIR-03 | T4-SCEN-02 |
| | Mood selector button click, active visual state toggle & persistence | T1-R1-05, T1-R1-06 | T2-R1-04 | T3-PAIR-03 | T4-SCEN-01, T4-SCEN-02 |
| | Diary entry text autosave and persistence without data loss | T1-R1-07 | T2-R1-05, T2-R1-06 | T3-PAIR-02 | T4-SCEN-01, T4-SCEN-02 |
| **R2: Habits & Tasks** | 30-day historical and current calendar grid layout | T1-R2-01, T1-R2-02 | T2-R2-01, T2-R2-02, T2-R2-05, T2-R2-06 | — | T4-SCEN-01, T4-SCEN-03 |
| | Dedicated task checklist view replacing 2D matrix | T1-R2-03, T1-R2-04 | T2-R2-B1, T2-R2-B2, T2-R2-B3 | T3-PAIR-02 | T4-SCEN-01 |
| | Interactive task checkboxes, status management, filtering & deletion | T1-R2-05, T1-R2-06, T1-R2-07 | T2-R2-B4, T2-R2-B5, T2-R2-B6 | T3-PAIR-02 | T4-SCEN-01 |
| **R3: Cells, Notes, Alerts** | Marking today's cell (Nov 13) allowed and persisted | T1-R3-01 | T2-R3-01 | — | T4-SCEN-01, T4-SCEN-03 |
| | Future dates (Nov 14+) disabled with visual feedback | T1-R3-02 | T2-R3-01 | — | T4-SCEN-01 |
| | Habit custom color picker updates UI elements and persists | T1-R3-03 | T2-R3-02 | — | T4-SCEN-03 |
| | Elimination of duplicate alert popups on input validation | T1-R3-04 | T2-R3-03 | — | — |
| | Categorized cell notes (Default, Love, Discipline), badges & tooltips | T1-R3-05, T1-R3-06, T1-R3-07 | T2-R3-04, T2-R3-05, T2-R3-06 | T3-PAIR-01 | T4-SCEN-01, T4-SCEN-03 |
| **R4: Header, PWA, Exit** | Permanent motivational quote banner in top header shell | T1-R4-01, T1-R4-02 | — | T3-PAIR-04 | T4-SCEN-01 |
| | Redundant Exit button removal and Lock Vault button retention | T1-R4-03, T1-R4-04 | — | T3-PAIR-04 | T4-SCEN-01 |
| | PWA standalone manifest configuration & Windows Task Manager title | T1-R4-05, T1-R4-06 | — | — | — |
| | Dual directory static file parity (project root vs `public/`) | T1-R4-07 | — | — | — |
| **R5: Encrypted Cloud Sync** | Client-side AES-256-GCM zero-knowledge encryption & zero plaintext transmission | T1-R5-02, T1-R5-03 | T2-R5-01, T2-R5-02, T2-R5-05, T2-R5-06 | T3-PAIR-01, T3-PAIR-05 | T4-SCEN-01, T4-SCEN-04 |
| | PIN key-wrapping enabling encrypted sync without password re-prompt | T1-R5-04 | T2-R5-03 | T3-PAIR-05 | T4-SCEN-01, T4-SCEN-05 |
| | Encrypted cloud sync configuration, Gist push/pull & restore | T1-R5-01, T1-R5-05 | T2-R5-04 | T3-PAIR-01, T3-PAIR-05 | T4-SCEN-01, T4-SCEN-04 |
| | Encrypted JSON backup file export and import with password | T1-R5-06, T1-R5-07 | T2-R5-01, T2-R5-02 | — | T4-SCEN-05 |

---

## 5. Detailed Test Inventory by Tier

### Tier 1: Feature Coverage (35 Tests)
- **`tests/tier1_features/test_r1_diary.js`**
  - `T1-R1-01`: Diary calendar sidebar renders month/year navigation
  - `T1-R1-02`: Direct date jump to arbitrary past date loads entry
  - `T1-R1-03`: Backward day navigation steps date cleanly
  - `T1-R1-04`: Forward day navigation steps date cleanly
  - `T1-R1-05`: Mood selector toggles active visual state
  - `T1-R1-06`: Selected mood persists to storage on save
  - `T1-R1-07`: Diary entry autosaves text without data loss
- **`tests/tier1_features/test_r2_habits_tasks.js`**
  - `T1-R2-01`: Habits 30-Day Grid Layout renders exactly 30 date columns
  - `T1-R2-02`: Habit row renders icon, name, and streak badge
  - `T1-R2-03`: Dedicated Tasks View renders dedicated vertical checklist
  - `T1-R2-04`: Task creation creates record with pending status and unique ID
  - `T1-R2-05`: Interactive task checkbox toggles pending/done status
  - `T1-R2-06`: Task filtering controls filter active, completed, and all tasks
  - `T1-R2-07`: Task archival and deletion updates state and tombstones
- **`tests/tier1_features/test_r3_cells_notes.js`**
  - `T1-R3-01`: Today cell marking cycles empty -> done -> missed -> empty
  - `T1-R3-02`: Future date cell has disabled styling and rejects clicks
  - `T1-R3-03`: Habit color picker persists custom color and renders in UI
  - `T1-R3-04`: Alert spam fix triggers validation alert exactly once
  - `T1-R3-05`: Categorized cell note links note.id into state.cells
  - `T1-R3-06`: Cell note visual badges render distinct categories and tooltips
  - `T1-R3-07`: Cell note deletion removes note and unsets cell.noteId
- **`tests/tier1_features/test_r4_shell_pwa.js`**
  - `T1-R4-01`: Permanent top header quote banner is visible across all views
  - `T1-R4-02`: Top quote banner renders quote text and author from state
  - `T1-R4-03`: Redundant Exit button is removed from sidebar
  - `T1-R4-04`: Lock Vault functionality locks vault and displays login screen
  - `T1-R4-05`: PWA manifest configures standalone display and icons
  - `T1-R4-06`: Dynamic window title updates with view for Windows Task Manager
  - `T1-R4-07`: Dual directory static file parity between root and public/
- **`tests/tier1_features/test_r5_crypto_sync.js`**
  - `T1-R5-01`: Settings view saves cloud sync configuration to IndexedDB kv store
  - `T1-R5-02`: Client-side AES-256-GCM encryption produces valid envelope and decrypts
  - `T1-R5-03`: Cloud sync transmission exposes zero plaintext to external endpoints
  - `T1-R5-04`: PIN quick-unlock enables encrypted sync without master password prompt
  - `T1-R5-05`: Encrypted snapshot decryption populates local state correctly
  - `T1-R5-06`: Encrypted backup JSON export prevents plaintext data leakage
  - `T1-R5-07`: Encrypted backup JSON import restores complete state with password

### Tier 2: Boundary & Corner Cases (30 Tests)
- **`tests/tier2_boundaries/test_boundary_diary.js`**
  - `T2-R1-01`: Leap Year Date Calculation (Feb 29)
  - `T2-R1-02`: Year Transition Rollover (Dec 31 to Jan 1)
  - `T2-R1-03`: Distant Past Date Navigation (10+ Years)
  - `T2-R1-04`: Rapid Consecutive Mood Clicks
  - `T2-R1-05`: Massive Unicode & Emoji Diary Text
  - `T2-R1-06`: Whitespace & Empty Diary Tasks
- **`tests/tier2_boundaries/test_boundary_habits.js`**
  - `T2-R2-01`: 30-Day Window Boundary Shifts
  - `T2-R2-02`: Zero Habits / All Archived Empty State
  - `T2-R2-03`: Habit Name Extreme Lengths
  - `T2-R2-04`: Habit Name XSS Sanitization
  - `T2-R2-05`: 50+ Habits Scalability Stress
  - `T2-R2-06`: Streak Calculation with Interspersed Gaps
- **`tests/tier2_boundaries/test_boundary_notes.js`**
  - `T2-R3-01`: Local Midnight Boundary Enforcement
  - `T2-R3-02`: Invalid Habit Color Hex Fallback
  - `T2-R3-03`: Repeated Clicks on Empty Habit Save
  - `T2-R3-04`: Note Category Modal Switching
  - `T2-R3-05`: Extremely Long Note Text (5,000 Chars)
  - `T2-R3-06`: Orphan Note Deletion on Habit Removal
- **`tests/tier2_boundaries/test_boundary_tasks.js`**
  - `T2-R2-B1`: Task Title Length Boundaries
  - `T2-R2-B2`: Task Title XSS Sanitization
  - `T2-R2-B3`: Duplicate Task Titles Independence
  - `T2-R2-B4`: Empty Filter State Rendering
  - `T2-R2-B5`: All Tasks Archived Toggle
  - `T2-R2-B6`: Rapid Checkbox Toggling Synchronization
- **`tests/tier2_boundaries/test_boundary_crypto.js`**
  - `T2-R5-01`: Decryption with Incorrect Password
  - `T2-R5-02`: Corrupted Ciphertext or Tampered IV
  - `T2-R5-03`: PIN Format with Leading Zeros
  - `T2-R5-04`: Gist API 401 Unauthorized / Network Error
  - `T2-R5-05`: Large Payload Encryption (1MB+ Vault State)
  - `T2-R5-06`: Empty Vault State Encryption

### Tier 3: Cross-Feature Pairwise Combinations (5 Tests)
- `tests/tier3_pairwise/test_pairwise_notes_sync.js`
  - `T3-PAIR-01`: Categorized notes (Default, Love, Discipline) preserved through encrypted sync (R3 ↔ R5)
- `tests/tier3_pairwise/test_pairwise_diary_tasks.js`
  - `T3-PAIR-02`: Diary today's tasks vs Dedicated tasks checklist operational independence (R1 ↔ R2)
- `tests/tier3_pairwise/test_pairwise_dates_mood.js`
  - `T3-PAIR-03`: Multi-date jumping and independent mood persistence across dates/years (R1 ↔ R1)
- `tests/tier3_pairwise/test_pairwise_quote_views.js`
  - `T3-PAIR-04`: Top quote banner consistency across view switches and vault lock (R4 ↔ R4)
- `tests/tier3_pairwise/test_pairwise_lock_crypto.js`
  - `T3-PAIR-05`: PIN quick-unlock key wrapping and encrypted cloud sync execution (R5 ↔ R5)

### Tier 4: Real-World Application Scenarios (5 Tests)
- `tests/tier4_scenarios/test_scenario_daily_workflow.js`
  - `T4-SCEN-01`: Complete day-in-the-life user workflow from PIN unlock to sync and lock
- `tests/tier4_scenarios/test_scenario_yearly_reflection.js`
  - `T4-SCEN-02`: Memory lane past year reflection across historical dates and return to today
- `tests/tier4_scenarios/test_scenario_habit_recovery.js`
  - `T4-SCEN-03`: Habit stumbling, notes, and recovery streak calculation across 30 days
- `tests/tier4_scenarios/test_scenario_offline_online_sync.js`
  - `T4-SCEN-04`: Multi-device sync simulation and offline recovery without data collision
- `tests/tier4_scenarios/test_scenario_vault_security.js`
  - `T4-SCEN-05`: Vault security lifecycle, master password migration, PIN unwrap, and backup restore

---

## 6. Environment Harness Design

All tests leverage `tests/helpers/env.js`, providing an isolated test harness without external browser dependencies:
- **DOM Engine**: In-memory HTML tree loaded directly from `index.html`. Emulates `document.querySelector`, `querySelectorAll`, `getElementById`, `addEventListener`, click triggers, classList, and attributes.
- **IndexedDB Simulation**: Complete transactional in-memory object stores (`kv` and `state`), supporting async requests, cursor operations, key extraction, and transaction lifecycle.
- **Web Crypto Mock/Bridge**: Uses native Node.js `globalThis.crypto.subtle` implementing real PBKDF2 key derivation and AES-GCM encryption/decryption with genuine tag verification.
- **Mock Fetch Engine**: Intercepts GitHub Gist API endpoints (`https://api.github.com/gists*`), validating Authorization headers, payload envelopes, and HTTP error code responses.
- **System Date Virtualization**: Supports deterministic time-travel and midnight boundary checks via `env.setSystemDate(dateStr)`.
