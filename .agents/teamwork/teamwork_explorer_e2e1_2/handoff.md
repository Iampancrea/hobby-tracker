# Milestone E2E-1 Handoff Report: Test Infrastructure & Test Tier Specification

## 1. Observation

### Direct Codebase & Specification Observations
1. **Authoritative Request (`ORIGINAL_REQUEST.md`)**:
   - R1 (Diary View Redesign, Date Navigation & Mood Selector): Left calendar sidebar navigation supporting arbitrary past date jumping (e.g. August 25th of previous year) and forward/backward day stepping; mood selector active visual state toggling and persistence; diary autosave without data loss (`lines 12-14, 29-34`).
   - R2 (Habits 30-Day Grid & Revamped Dedicated Tasks View): 30-day historical and current calendar grid; dedicated task list view modeled after diary today's tasks with interactive checkboxes, task creation, and task management (`lines 15-17, 35-38`).
   - R3 (Cell Marking, Color Picker, Alert Spam & Categorized Cell Notes): Cell marking for today's date (Nov 13) without restriction; future dates disabled with visual feedback; custom habit color picker persistence and application; alert spam prevention (single alert on invalid habit name); categorized habit cell notes (Default, Love, Discipline) with distinct badges/indicators and cell linkage (`lines 18-20, 39-46`).
   - R4 (Header Quote Banner, Button Cleanup & PWA Desktop Identity): Permanent top header quote banner across all views; removal of redundant Exit button; PWA standalone identity and dynamic document.title for Windows Task Manager (`lines 21-23, 47-51`).
   - R5 (Encrypted Cloud Sync): Zero-knowledge client-side encryption of habits, tasks, notes, and diary entries using AES-256-GCM + PBKDF2 before sync to private GitHub Gists; PIN key-wrapping for sync access under PIN unlock; encrypted backup export/import (`lines 24-26, 52-55`).

2. **Existing Implementation Analysis**:
   - `index.html:131`: `#logout-btn` ("Exit") currently exists in `.sidebar-footer` alongside `#lock-btn`. Needs removal per R4.
   - `index.html:201-204`: `#quote-section` currently lives inside `#view-diary`. Must be relocated to `#top-quote-banner` in header shell across all views per R4.
   - `js/views.js:13`: `getDatesAround(offset = 0, pastDays = 7, futureDays = 3)` currently renders an 11-day window (-7 to +3 days). Must be expanded to a 30-day calendar grid per R2.
   - `js/views.js:94-100`: Habit cells currently do not disable future dates (`date > today`). They allow clicking future cells. Must disable future dates per R3.
   - `js/views.js:305-386`: `renderTasks()` currently renders a calendar matrix with dates, instead of a dedicated task checklist view per R2.
   - `js/views.js:546-548`: Mood selector updates `.active` class only during render, but `js/app.js` has zero click listeners wired to `.mood-btn`, so clicking a mood does nothing and fails to persist per R1.
   - `js/app.js:5`: `App.init()` lacks an idempotency guard. In `js/auth.js:228`, `App.init()` is invoked every time `unlockApp()` runs. Each lock/unlock cycle re-binds `#save-habit-btn`, causing duplicate alert dialogs ("Please enter a habit name") per R3.
   - `js/storage.js:339-353`: `createNote(noteData)` creates a note object in `state.notes`, but does NOT store `note.id` in `state.cells[`${habitId}|${date}`].noteId`. Similarly, `deleteNote` does NOT clean up `cell.noteId` per R3.
   - `js/crypto.js:1-126`: Uses standard Web Crypto API (`crypto.subtle`, `deriveKey`, `encrypt`, `decrypt`). Available natively in Node.js v24 (`globalThis.crypto`).
   - Environment verification: Node.js version is `v24.14.1` with native Web Crypto, `fetch`, and `vm`. No `node_modules` are installed in the workspace.

---

## 2. Logic Chain

1. **Test Strategy**: Opaque-box requirement-driven testing. The test suite must test the public contracts, DOM representations, and storage behaviors of the Hobby Tracker application as specified in `ORIGINAL_REQUEST.md` and `PROJECT.md`.
2. **Environment & Harness Strategy**:
   - Because no external packages (such as `jsdom` or `fake-indexeddb`) are pre-installed in `node_modules`, the test suite should execute natively in Node.js v24.14.1.
   - `tests/helpers/env.js` will provide a zero-dependency lightweight DOM harness (simulating `window`, `document`, `Element`, `HTMLElement`, `CustomEvent`, `Event`, `MouseEvent`, `KeyboardEvent`, `localStorage`, `sessionStorage`, in-memory `indexedDB`, and mock `fetch` for Gist API) running via `node:vm` or Node globals.
   - This guarantees 100% offline, deterministic, sub-second execution speed on standard Node.js without requiring `npm install`.
3. **Four-Tier Inventory Structure**:
   - **Tier 1 (Feature Coverage)**: Validates each of R1, R2, R3, R4, R5 in strict isolation. Threshold requirement: >=5 tests per feature (>=25 total). Specified: 7 tests per feature (35 total).
   - **Tier 2 (Boundary & Corner Cases)**: Validates edge cases, leap years, rollover dates, text size limits, XSS escaping, invalid inputs, and crypto failures. Threshold requirement: >=5 tests per feature (>=25 total). Specified: 6 tests per feature (30 total).
   - **Tier 3 (Cross-Feature Combinations)**: Validates pairwise interactions (Notes ↔ Sync, Diary Tasks ↔ Dedicated Tasks, Date Navigation ↔ Mood Persistence, Quote Banner ↔ View Nav & Lock, PIN Unlock ↔ Crypto Sync). Threshold requirement: >=5 tests. Specified: 5 tests.
   - **Tier 4 (Real-World Application Scenarios)**: Validates end-to-end user workflows (Day in the Life, Memory Lane Year Jump, Habit Recovery Journey, Multi-Device Sync Simulation, Vault Security Lifecycle). Threshold requirement: >=5 tests. Specified: 5 tests.
   - **Grand Total**: 75 fully specified test cases (exceeding the required >=60 tests).
4. **Runner Architecture**:
   - CLI invocation: `node tests/runner.js`.
   - Command flags: `--tier=<1|2|3|4|all>`, `--filter=<string>`, `--verbose`.
   - Output: Colorized console output grouping by Tier and Suite, elapsed time, individual test status (`✓ PASS` / `✗ FAIL`), and summary table.
   - Exit code: `0` on all passing, `1` on any failure.

---

## 3. Caveats

1. **DOM Fidelity**: The lightweight DOM harness in `tests/helpers/env.js` must faithfully support basic DOM manipulation (`querySelector`, `querySelectorAll`, `addEventListener`, `dispatchEvent`, `classList.toggle/add/remove`, `dataset`, `innerHTML`, `value`, `textContent`, `getBoundingClientRect`, `remove`, `appendChild`). Explorer 3 has verified this is fully achievable with lightweight mock classes.
2. **Date Context**: Date-sensitive tests (e.g. today Nov 13, future dates Nov 14 onwards) must ensure the mock environment allows fixing or freezing the current date or using local date strings consistently to avoid timezone divergence between UTC and local time.
3. **Network Isolation**: All cloud sync tests against the GitHub Gist API must intercept `fetch` calls and return mock Gist responses to ensure 100% offline execution without requiring live GitHub tokens.
4. **Dual Directory Parity**: Tests must verify that `public/` files remain byte-identical or functionally identical to root files, as mandated by `PROJECT.md`.

---

## 4. Conclusion: Complete Test Inventory & TEST_INFRA.md Specification

Below is the complete, exact draft for `TEST_INFRA.md`, including directory layout, CLI specification, test execution lifecycle, complete 75-test inventory, and coverage matrix.

```markdown
# TEST_INFRA.md — Hobby Tracker E2E Test Suite Specification

## 1. Architecture & Directory Layout

The Hobby Tracker E2E test suite is an opaque-box, requirement-driven verification suite designed to run natively under Node.js (v24+) without external heavyweight dependencies.

```
tests/
├── runner.js                 # Central CLI test runner with tier filtering & TAP/console reporting
├── helpers/
│   ├── env.js                # Lightweight DOM, IndexedDB, Web Crypto, and Mock Fetch test harness
│   └── assert.js             # Strict assertion helper utilities
├── tier1_features/           # Tier 1: Feature Coverage (>=5 tests per feature; 35 tests total)
│   ├── test_r1_diary.js      # R1: Diary sidebar navigation, date jumping & mood selector
│   ├── test_r2_habits_tasks.js # R2: 30-day habits grid & revamped dedicated tasks view
│   ├── test_r3_cells_notes.js  # R3: Cell marking, color picker, alert spam fix & cell notes
│   ├── test_r4_shell_pwa.js    # R4: Top quote banner, exit button cleanup & PWA desktop identity
│   └── test_r5_crypto_sync.js  # R5: Client-side AES-GCM encryption & cloud sync interface
├── tier2_boundaries/         # Tier 2: Boundary & Corner Cases (>=5 tests per feature; 30 tests total)
│   ├── test_boundary_diary.js  # Leap years, date rollovers, extreme past dates, Unicode stress
│   ├── test_boundary_habits.js # 30-day window limits, empty states, XSS, 50+ habit scale
│   ├── test_boundary_notes.js  # Midnight boundaries, invalid color fallback, alert rapid clicks
│   ├── test_boundary_tasks.js  # Task title lengths, XSS escaping, duplicate names, filter empty
│   └── test_boundary_crypto.js # Wrong password, corrupted ciphertext, leading zero PINs, network fail
├── tier3_pairwise/           # Tier 3: Cross-Feature Interactions (5 tests total)
│   ├── test_pairwise_notes_sync.js   # R3 ↔ R5: Categorized notes preserved through encrypted sync
│   ├── test_pairwise_diary_tasks.js  # R1 ↔ R2: Diary today's tasks vs Dedicated tasks checklist
│   ├── test_pairwise_dates_mood.js   # R1 ↔ R1: Multi-date jumping and independent mood persistence
│   ├── test_pairwise_quote_views.js  # R4 ↔ R4: Top quote banner consistency across view switches & lock
│   └── test_pairwise_lock_crypto.js  # R5 ↔ R5: PIN quick-unlock key wrapping & encrypted cloud sync
└── tier4_scenarios/          # Tier 4: Real-World Application Workflows (5 tests total)
    ├── test_scenario_daily_workflow.js     # Scenario 1: Complete day-in-the-life user workflow
    ├── test_scenario_yearly_reflection.js  # Scenario 2: Historical year jump and reflection
    ├── test_scenario_habit_recovery.js     # Scenario 3: Habit stumbling, notes, and recovery streak
    ├── test_scenario_offline_online_sync.js# Scenario 4: Multi-device sync and offline recovery
    └── test_scenario_vault_security.js     # Scenario 5: Master password change, PIN wrap & backup restore
```

---

## 2. Test Runner CLI Invocation

### Command-Line Usage
```bash
# Run all test tiers (Tiers 1 through 4)
node tests/runner.js

# Run a specific tier
node tests/runner.js --tier=1
node tests/runner.js --tier=2
node tests/runner.js --tier=3
node tests/runner.js --tier=4

# Run a specific test suite file or matching filter
node tests/runner.js --filter=test_r1_diary
node tests/runner.js --filter=test_pairwise_notes_sync

# Verbose output (detailed assertion traces)
node tests/runner.js --verbose
```

### Exit Codes
- **0**: All executed tests passed successfully.
- **1**: One or more tests failed, threw an unhandled exception, or assertion mismatch occurred.

### Console Output Format
```
======================================================================
  HOBBY TRACKER PWA — AUTOMATED E2E TEST SUITE
======================================================================

[TIER 1: FEATURE COVERAGE]
  ▶ test_r1_diary.js (7 tests)
    ✓ T1-R1-01: Diary calendar sidebar renders month/year navigation (14ms)
    ✓ T1-R1-02: Direct date jump to arbitrary past date loads entry (9ms)
    ✓ T1-R1-03: Backward day navigation steps date cleanly (6ms)
    ✓ T1-R1-04: Forward day navigation steps date cleanly (5ms)
    ✓ T1-R1-05: Mood selector toggles active visual state (7ms)
    ✓ T1-R1-06: Selected mood persists to storage on save (8ms)
    ✓ T1-R1-07: Diary entry autosaves text without data loss (11ms)
  ...

----------------------------------------------------------------------
EXECUTION SUMMARY
----------------------------------------------------------------------
  Tier 1 (Feature Coverage):        35 / 35 PASS (100%)
  Tier 2 (Boundary & Corner Cases): 30 / 30 PASS (100%)
  Tier 3 (Cross-Feature Pairwise):   5 /  5 PASS (100%)
  Tier 4 (Real-World Scenarios):     5 /  5 PASS (100%)
----------------------------------------------------------------------
  TOTAL TESTS:   75
  PASSED:        75
  FAILED:        0
  DURATION:      1.42s
======================================================================
```

---

## 3. Environment Harness Contract (`tests/helpers/env.js`)

Each test suite imports the environment helper to obtain a freshly isolated browser context:

```javascript
const { createTestEnvironment } = require('../helpers/env');

describe('Suite Name', () => {
  let env;

  beforeEach(async () => {
    env = await createTestEnvironment();
    // env exposes: window, document, Storage, Views, App, Auth, Sync, CryptoUtils
  });

  afterEach(() => {
    env.cleanup();
  });
});
```

### Mock Capabilities Provided by `env.js`:
1. **DOM**: Full DOM tree parsed from `index.html`, with element queries, click listeners, input events, classList manipulation, modal containers, and backdrop support.
2. **Storage**: In-memory IndexedDB implementation for stores `kv` and `state`, with `open`, `transaction`, `get`, `put`, `delete`, and transaction completion events.
3. **Cryptography**: Native Web Crypto API from Node.js `globalThis.crypto` supporting `crypto.subtle.deriveKey`, `crypto.subtle.encrypt`, `crypto.subtle.decrypt`, `crypto.getRandomValues`.
4. **Mock Fetch**: Intercepts GitHub Gist API endpoints (`https://api.github.com/gists*`), returning configurable status codes and JSON payloads without real network calls.
5. **Local Date Freezing**: Allows tests to set `env.setSystemDate('2026-11-13')` to test today vs future date behaviors deterministically.

---

## 4. Comprehensive Test Case Inventory

### TIER 1: FEATURE COVERAGE (35 Tests)

#### Suite: `tests/tier1_features/test_r1_diary.js` (R1: Diary Navigation & Mood Selector)
- **T1-R1-01**: *Diary Calendar Sidebar Rendering* — Verify diary view renders a left sidebar containing calendar navigation with month/year header and interactive day buttons.
- **T1-R1-02**: *Arbitrary Past Date Jumping* — Verify clicking an arbitrary past date (e.g. `2025-08-25`) updates `Views.currentDiaryDate`, updates `#diary-date`, and queries diary entry for that date.
- **T1-R1-03**: *Step-by-Step Backward Day Navigation* — Verify `#prev-day` decrements `Views.currentDiaryDate` by 1 day and re-renders diary entry.
- **T1-R1-04**: *Step-by-Step Forward Day Navigation* — Verify `#next-day` increments `Views.currentDiaryDate` by 1 day and re-renders diary entry.
- **T1-R1-05**: *Mood Selector Visual State Toggle* — Verify clicking `.mood-btn[data-mood="great"]` adds `.active` class to it and clears `.active` from other mood buttons.
- **T1-R1-06**: *Selected Mood Persistence* — Verify selected mood persists in `state.diary[date].mood` and is restored upon reloading or navigating back to that date.
- **T1-R1-07**: *Diary Entry Autosave & Integrity* — Verify typing text into `#diary-entry` autosaves to `state.diary[date].entry` on blur without data loss across date transitions.

#### Suite: `tests/tier1_features/test_r2_habits_tasks.js` (R2: Habits 30-Day Grid & Dedicated Tasks View)
- **T1-R2-01**: *Habits 30-Day Grid Layout* — Verify `#habit-grid` table renders exactly 30 date column headers spanning historical and current dates.
- **T1-R2-02**: *Habit Metadata & Streak Badge* — Verify habit row renders habit icon, habit name, and calculated streak badge.
- **T1-R2-03**: *Dedicated Tasks View Structure* — Verify switching to `#view-tasks` renders a dedicated vertical checklist view instead of a 2D calendar grid.
- **T1-R2-04**: *Task Creation with Default Pending Status* — Verify adding a task creates a record in `state.tasks` with `status: "pending"`, `archived: false`, and unique ID.
- **T1-R2-05**: *Interactive Task Checkbox Completion* — Verify clicking a task checkbox toggles status between `'pending'` and `'done'`, applying visual strikethrough/done styling.
- **T1-R2-06**: *Task Filtering Controls* — Verify filter buttons (All, Active, Completed) dynamically show only tasks matching the selected filter.
- **T1-R2-07**: *Task Archival and Deletion* — Verify archiving hides task from active list; deleting removes task from `state.tasks` and records a tombstone.

#### Suite: `tests/tier1_features/test_r3_cells_notes.js` (R3: Cell Marking, Color Picker, Alert Spam & Notes)
- **T1-R3-01**: *Today's Cell Marking & Cycling* — Verify clicking today's date cell cycles status `'empty'` -> `'done'` (✓) -> `'missed'` (✗) -> `'empty'`, updating `state.cells`.
- **T1-R3-02**: *Future Date Cell Disabling* — Verify cells for dates strictly > today have `.disabled` class/styling and reject mark/click actions.
- **T1-R3-03**: *Habit Color Picker Persistence & Rendering* — Verify habit modal color picker saves custom hex color, applying it to `.habit-icon` and completed `.cell-status.done` elements.
- **T1-R3-04**: *Alert Spam Prevention* — Verify clicking save on empty habit name triggers validation alert ("Please enter a habit name") exactly once, even after multiple app lock/unlock cycles.
- **T1-R3-05**: *Categorized Cell Note Linkage* — Verify creating a cell note (Default, Love, Discipline) records note in `state.notes` and stores `note.id` in `state.cells[`${habitId}|${date}`].noteId`.
- **T1-R3-06**: *Cell Note Visual Badges & Indicators* — Verify cells with notes render distinct visual badges/indicators corresponding to Default, Love, and Discipline types, along with reason tooltips.
- **T1-R3-07**: *Cell Note Deletion and Link Cleanup* — Verify deleting a cell note removes it from `state.notes`, records a tombstone, and unsets `cell.noteId` on the cell.

#### Suite: `tests/tier1_features/test_r4_shell_pwa.js` (R4: Top Quote Banner, Button Cleanup & PWA Desktop Identity)
- **T1-R4-01**: *Permanent Top Header Quote Banner* — Verify `#top-quote-banner` is situated in top header app shell and visible across Habits, Tasks, Diary, and Settings views.
- **T1-R4-02**: *Top Quote Text & Author Display* — Verify top quote banner renders quote text and author from state and updates when quotes are modified.
- **T1-R4-03**: *Redundant Exit Button Removal* — Verify `#logout-btn` (Exit button) is completely removed from the sidebar DOM, while `#lock-btn` remains.
- **T1-R4-04**: *Lock Vault Functionality* — Verify clicking `#lock-btn` calls `Auth.lockApp()`, displays `#login-screen`, clears in-memory keys, and sets window title to `'Hobby Tracker (Locked)'`.
- **T1-R4-05**: *PWA Manifest Standalone Configuration* — Verify `manifest.webmanifest` contains `display: "standalone"`, `id`, `scope`, `name: "Hobby Tracker"`, and required icon sizes (192, 512, SVG).
- **T1-R4-06**: *Dynamic Window Title for Task Manager* — Verify switching views updates `document.title` to `${ViewTitle} — Hobby Tracker` (e.g. `Habits — Hobby Tracker`).
- **T1-R4-07**: *Dual Directory Static File Parity* — Verify byte-for-byte or functional parity between files in project root and files in `public/`.

#### Suite: `tests/tier1_features/test_r5_crypto_sync.js` (R5: Encrypted Cloud Sync)
- **T1-R5-01**: *Cloud Sync Configuration UI & Storage* — Verify Settings view saves GitHub PAT, Gist ID, and autoSync settings in IndexedDB `kv` store.
- **T1-R5-02**: *Client-Side AES-256-GCM Encryption* — Verify `CryptoUtils.encrypt` produces valid envelope `{ version: 1, salt, iv, ciphertext, encryptedAt }` using PBKDF2 (100k iterations).
- **T1-R5-03**: *Zero Plaintext Transmission* — Verify outgoing Gist payload contains only the encrypted envelope; no habit names, tasks, or diary strings appear in plaintext.
- **T1-R5-04**: *PIN Key-Wrapping Master Key Access* — Verify unlocking vault with 4-digit PIN decrypts `wrappedMasterKey`, enabling `Sync.syncNow()` to encrypt and sync without prompting for password.
- **T1-R5-05**: *Encrypted Snapshot Decryption & Ingestion* — Verify pulling remote encrypted Gist payload successfully decrypts and populates local IndexedDB state.
- **T1-R5-06**: *Encrypted Backup JSON Export* — Verify backup export generates an encrypted JSON file without plaintext leakage.
- **T1-R5-07**: *Encrypted Backup JSON Import* — Verify importing an encrypted backup JSON file with correct password restores all habits, tasks, and diary records.

---

### TIER 2: BOUNDARY & CORNER CASES (30 Tests)

#### Suite: `tests/tier2_boundaries/test_boundary_diary.js`
- **T2-R1-01**: *Leap Year Date Calculation (Feb 29)* — Jumping to `2024-02-29` resolves correctly; jumping to Feb on non-leap year clamps to Feb 28.
- **T2-R1-02**: *Year Transition Rollover (Dec 31 to Jan 1)* — Navigating `#next-day` across `2025-12-31` transitions smoothly to `2026-01-01` in calendar and view.
- **T2-R1-03**: *Distant Past Date Navigation (10+ Years)* — Jumping back 10+ years (`2015-01-01`) renders empty diary state gracefully without DOM crash.
- **T2-R1-04**: *Rapid Consecutive Mood Clicks* — Rapidly clicking between mood buttons in <50ms stabilizes cleanly on the last clicked mood with no race condition.
- **T2-R1-05**: *Massive Unicode & Emoji Diary Text* — 10,000+ characters of mixed Arabic, Chinese, Devanagari, and complex emojis persist and reload with 100% byte fidelity.
- **T2-R1-06**: *Whitespace & Empty Diary Tasks* — Submitting empty string or whitespace-only task in diary checklist is rejected without creating blank items.

#### Suite: `tests/tier2_boundaries/test_boundary_habits.js`
- **T2-R2-01**: *30-Day Window Boundary Shifts* — Offsetting date window by -30, -60, -90 days preserves contiguous 30-day block geometry.
- **T2-R2-02**: *Zero Habits / All Archived Empty State* — When no habits exist, grid renders clean `.empty-state` message without table rendering errors.
- **T2-R2-03**: *Habit Name Extreme Lengths* — 1-character habit name vs 150-character habit name renders cleanly without layout disruption.
- **T2-R2-04**: *Habit Name XSS Sanitization* — Habit name containing `<script>` or HTML injection strings is properly escaped in DOM.
- **T2-R2-05**: *50+ Habits Scalability Stress* — 50 active habits with 30-day grid (1,500 cells) render without memory exhaustion or lost cells.
- **T2-R2-06**: *Streak Calculation with Interspersed Gaps* — Calculates streak accurately when non-contiguous missed or empty days exist.

#### Suite: `tests/tier2_boundaries/test_boundary_notes.js`
- **T2-R3-01**: *Local Midnight Boundary Enforcement* — Validates date string comparison strictly at midnight: today allowed, tomorrow rejected.
- **T2-R3-02**: *Invalid Habit Color Hex Fallback* — Malformed color inputs (`""`, `"invalid"`, `"#123"`) fall back safely to default `#3fa34d`.
- **T2-R3-03**: *Repeated Clicks on Empty Habit Save* — Clicking `#save-habit-btn` with empty name 10 times consecutively triggers alert callback once per click without alert queuing.
- **T2-R3-04**: *Note Category Modal Switching* — Toggling note modal categories between Default, Love, and Discipline updates modal styles and saves final category.
- **T2-R3-05**: *Extremely Long Note Text (5,000 Chars)* — 5,000-character note text preserves formatting and truncates safely in cell tooltip without DOM breakage.
- **T2-R3-06**: *Orphan Note Deletion on Habit Removal* — Deleting a habit cleans up or marks tombstones on all associated cell notes and cell records.

#### Suite: `tests/tier2_boundaries/test_boundary_tasks.js`
- **T2-R2-B1**: *Task Title Length Boundaries* — 1 character vs 255 characters handles text wrapping cleanly.
- **T2-R2-B2**: *Task Title XSS Sanitization* — Task title with HTML tags renders as escaped text without executing scripts.
- **T2-R2-B3**: *Duplicate Task Titles Independence* — Multiple tasks with identical title strings have unique IDs and toggle independently.
- **T2-R2-B4**: *Empty Filter State Rendering* — Filtering by 'Completed' when 0 tasks are completed shows friendly empty filter message.
- **T2-R2-B5**: *All Tasks Archived Toggle* — Archiving all tasks hides them until 'Show archived' is checked.
- **T2-R2-B6**: *Rapid Checkbox Toggling Synchronization* — Toggling checkbox 10 times rapidly keeps visual state and IndexedDB strictly synchronized.

#### Suite: `tests/tier2_boundaries/test_boundary_crypto.js`
- **T2-R5-01**: *Decryption with Incorrect Password* — Decrypting with wrong password throws authentication tag error; local state remains intact.
- **T2-R5-02**: *Corrupted Ciphertext or Tampered IV* — Tampering with 1 bit of ciphertext or IV throws cryptographic verification exception.
- **T2-R5-03**: *PIN Format with Leading Zeros* — PINs like `'0042'` or `'0000'` maintain string representation and unlock successfully.
- **T2-R5-04**: *Gist API 401 Unauthorized / Network Error* — Mock Gist API failure returns error gracefully and updates UI without uncaught rejection.
- **T2-R5-05**: *Large Payload Encryption (1MB+ Vault State)* — Encrypts and decrypts 1MB+ vault payload within acceptable execution time (<2s).
- **T2-R5-06**: *Empty Vault State Encryption* — Encrypting empty vault produces valid encrypted envelope that decrypts to identical state.

---

### TIER 3: CROSS-FEATURE PAIRWISE COMBINATIONS (5 Tests)

- **T3-PAIR-01**: *Categorized Cell Notes ↔ Encrypted Cloud Sync (R3 ↔ R5)*
  - *File*: `tests/tier3_pairwise/test_pairwise_notes_sync.js`
  - *Interaction*: Create habits with Default, Love, and Discipline cell notes; execute encrypted cloud sync; decrypt payload in secondary vault instance; verify note text, types, and `cell.noteId` linkages are 100% intact.
- **T3-PAIR-02**: *Diary Today's Tasks ↔ Dedicated Tasks View Independence (R1 ↔ R2)*
  - *File*: `tests/tier3_pairwise/test_pairwise_diary_tasks.js`
  - *Interaction*: Add tasks in Diary for today and tasks in Dedicated Tasks view; verify IDs, statuses, and completion toggles operate completely independently without cross-view interference.
- **T3-PAIR-03**: *Diary Date Navigation ↔ Multi-Date Mood Persistence (R1 ↔ R1)*
  - *File*: `tests/tier3_pairwise/test_pairwise_dates_mood.js`
  - *Interaction*: Jump between 3 distinct dates across different years, assign different moods to each date; verify each date independently loads its active mood without bleed-over.
- **T3-PAIR-04**: *Top Quote Banner ↔ View Navigation & Vault Security Lock (R4 ↔ R4)*
  - *File*: `tests/tier3_pairwise/test_pairwise_quote_views.js`
  - *Interaction*: Navigate across Habits, Tasks, Diary, and Settings views; verify quote banner remains mounted and unmodified; click Lock button, verifying login screen does not leak private quotes.
- **T3-PAIR-05**: *PIN Quick-Unlock ↔ Cryptographic Sync Execution (R5 ↔ R5)*
  - *File*: `tests/tier3_pairwise/test_pairwise_lock_crypto.js`
  - *Interaction*: Lock vault, unlock using 4-digit PIN (unwrapping master password), trigger cloud sync; verify encrypted sync executes without re-prompting for master password.

---

### TIER 4: REAL-WORLD APPLICATION SCENARIOS (5 Tests)

- **T4-SCEN-01**: *Complete Day-in-the-Life User Workflow*
  - *File*: `tests/tier4_scenarios/test_scenario_daily_workflow.js`
  - *Workflow*: Unlock via PIN -> view morning quote -> mark today's habit done in 30-day grid -> attach a Discipline note to yesterday's missed habit -> create and complete tasks in dedicated Tasks checklist -> open Diary, log mood "Great" and daily reflection -> cloud auto-sync -> lock vault.
- **T4-SCEN-02**: *Year-in-Review Historical Reflection ("Memory Lane Date Jump")*
  - *File*: `tests/tier4_scenarios/test_scenario_yearly_reflection.js`
  - *Workflow*: Open Diary -> jump sidebar calendar to August 25th of previous year -> review past entry and mood -> update historical reflection -> step day-by-day (Aug 24, Aug 25, Aug 26) -> return to today -> verify historical changes persist and today remains unaffected.
- **T4-SCEN-03**: *Habit Stumbling, Recovery & Categorized Notes Journey*
  - *File*: `tests/tier4_scenarios/test_scenario_habit_recovery.js`
  - *Workflow*: Track habit over 30 days -> mark missed days with Love and Discipline notes -> verify visual badges on grid cells -> update habit color via color picker -> mark today's habit done -> verify streak recalculates correctly.
- **T4-SCEN-04**: *Multi-Device Sync Simulation & Offline Recovery*
  - *File*: `tests/tier4_scenarios/test_scenario_offline_online_sync.js`
  - *Workflow*: Device A creates habits/diary/notes and syncs encrypted snapshot to Gist -> Device B sets up using same master password, pulls and decrypts Gist state -> Device A goes offline and adds diary entry -> Device A reconnects and syncs -> Device B syncs and receives update without data collision.
- **T4-SCEN-05**: *Vault Security Lifecycle & Master Password Migration*
  - *File*: `tests/tier4_scenarios/test_scenario_vault_security.js`
  - *Workflow*: Set up vault with password and PIN -> create data -> change master password in settings (re-encrypting data and updating wrapped PIN key) -> lock vault -> verify old password fails -> unlock with new password -> unlock with PIN -> export encrypted backup -> wipe IndexedDB -> import backup with new password -> verify 100% state restored.

---

## 5. Requirement Traceability Matrix

| Requirement | Acceptance Criterion | Tier 1 (Feature) | Tier 2 (Boundary) | Tier 3 (Pairwise) | Tier 4 (Scenario) |
|---|---|---|---|---|---|
| **R1: Diary & Mood** | Calendar sidebar navigation & arbitrary past date jumping | T1-R1-01, T1-R1-02 | T2-R1-01, T2-R1-02, T2-R1-03 | T3-PAIR-03 | T4-SCEN-02 |
| **R1: Diary & Mood** | Day-by-day forward/backward navigation | T1-R1-03, T1-R1-04 | T2-R1-01, T2-R1-02 | T3-PAIR-03 | T4-SCEN-02 |
| **R1: Diary & Mood** | Mood selector visual toggle & storage persistence | T1-R1-05, T1-R1-06 | T2-R1-04 | T3-PAIR-03 | T4-SCEN-01, T4-SCEN-02 |
| **R1: Diary & Mood** | Diary entry autosave & data integrity across dates | T1-R1-07 | T2-R1-05, T2-R1-06 | T3-PAIR-02 | T4-SCEN-01, T4-SCEN-02 |
| **R2: Habits & Tasks** | 30-day historical and current calendar grid | T1-R2-01, T1-R2-02 | T2-R2-01, T2-R2-02, T2-R2-05, T2-R2-06 | — | T4-SCEN-01, T4-SCEN-03 |
| **R2: Habits & Tasks** | Dedicated task checklist view replacing 2D matrix | T1-R2-03, T1-R2-04 | T2-R2-B1, T2-R2-B2, T2-R2-B3 | T3-PAIR-02 | T4-SCEN-01 |
| **R2: Habits & Tasks** | Interactive task checkboxes, status management & filtering | T1-R2-05, T1-R2-06, T1-R2-07 | T2-R2-B4, T2-R2-B5, T2-R2-B6 | T3-PAIR-02 | T4-SCEN-01 |
| **R3: Cells, Notes, Alerts** | Marking today's cell (Nov 13) allowed & persists | T1-R3-01 | T2-R3-01 | — | T4-SCEN-01, T4-SCEN-03 |
| **R3: Cells, Notes, Alerts** | Future dates disabled with visual feedback | T1-R3-02 | T2-R3-01 | — | T4-SCEN-01 |
| **R3: Cells, Notes, Alerts** | Habit color picker persists and updates UI elements | T1-R3-03 | T2-R3-02 | — | T4-SCEN-03 |
| **R3: Cells, Notes, Alerts** | Alert spam eliminated (single alert on invalid habit name) | T1-R3-04 | T2-R3-03 | — | — |
| **R3: Cells, Notes, Alerts** | Categorized cell notes (Default, Love, Discipline) & badges | T1-R3-05, T1-R3-06, T1-R3-07 | T2-R3-04, T2-R3-05, T2-R3-06 | T3-PAIR-01 | T4-SCEN-01, T4-SCEN-03 |
| **R4: Header, PWA, Exit** | Motivational quote in permanent top header banner | T1-R4-01, T1-R4-02 | — | T3-PAIR-04 | T4-SCEN-01 |
| **R4: Header, PWA, Exit** | Redundant Exit button removed; Lock button retained | T1-R4-03, T1-R4-04 | — | T3-PAIR-04 | T4-SCEN-01 |
| **R4: Header, PWA, Exit** | PWA standalone identity & dynamic Task Manager title | T1-R4-05, T1-R4-06 | — | — | — |
| **R4: Header, PWA, Exit** | Dual directory parity (root vs public/) | T1-R4-07 | — | — | — |
| **R5: Encrypted Sync** | Zero-knowledge client-side encryption (AES-256-GCM + PBKDF2)| T1-R5-02, T1-R5-03 | T2-R5-01, T2-R5-02, T2-R5-05, T2-R5-06 | T3-PAIR-01, T3-PAIR-05 | T4-SCEN-01, T4-SCEN-04 |
| **R5: Encrypted Sync** | PIN key-wrapping for encrypted sync under PIN unlock | T1-R5-04 | T2-R5-03 | T3-PAIR-05 | T4-SCEN-01, T4-SCEN-05 |
| **R5: Encrypted Sync** | Encrypted cloud sync interface & Gist snapshot restore | T1-R5-01, T1-R5-05 | T2-R5-04 | T3-PAIR-01, T3-PAIR-05 | T4-SCEN-01, T4-SCEN-04 |
| **R5: Encrypted Sync** | Encrypted backup JSON export and import | T1-R5-06, T1-R5-07 | T2-R5-01, T2-R5-02 | — | T4-SCEN-05 |
```

---

## 5. Verification Method

Once implemented by the builder agent in Milestone E2E-1/E2E-2, this specification can be verified independently via the following commands:

1. **Test Runner Execution Check**:
   ```powershell
   node tests/runner.js
   ```
   *Expected Outcome*: The runner executes suites across all 4 tiers, outputs colorized status per test, displays a summary table, and exits with code 0 on all pass, or code 1 on any failure.

2. **Tier Filtering Check**:
   ```powershell
   node tests/runner.js --tier=1
   node tests/runner.js --tier=2
   node tests/runner.js --tier=3
   node tests/runner.js --tier=4
   ```
   *Expected Outcome*: Each invocation executes only tests belonging to the designated tier.

3. **Suite Filtering Check**:
   ```powershell
   node tests/runner.js --filter=test_r1_diary
   ```
   *Expected Outcome*: Executes only `tests/tier1_features/test_r1_diary.js`.

4. **Zero-Dependency Check**:
   ```powershell
   # Verify tests run directly in standard Node.js without requiring external npm packages
   node tests/runner.js
   ```
   *Expected Outcome*: No `MODULE_NOT_FOUND` error for `jsdom` or `fake-indexeddb`; harness runs smoothly on standard Node.js.

5. **Falsification & Failure Reporting Check**:
   - Temporarily introduce an intentional assertion failure in one test (e.g. `assert.strictEqual(true, false)`).
   - Run `node tests/runner.js`.
   - *Expected Outcome*: Runner prints formatted failure stack trace, marks test as `✗ FAIL`, prints failure count in summary table, and process exits with code 1.
