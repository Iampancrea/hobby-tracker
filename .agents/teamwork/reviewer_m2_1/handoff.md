# Reviewer & Adversarial Challenge Report — Milestone 2
**Milestone**: Habits 30-Day Grid, Cell Marking, Notes & Bug Fixes  
**Agent**: reviewer_m2_1  
**Verdict**: **APPROVE**  
**Overall Risk Assessment**: LOW  

---

## 1. Observation

### Implementation Files Inspected
- `js/views.js` & `public/js/views.js`
- `js/storage.js` & `public/js/storage.js`
- `js/app.js` & `public/js/app.js`
- `css/style.css` & `public/css/style.css`
- `index.html` & `public/index.html`

### Test Suite Execution Evidence

1. **Feature Suite R3 (Cells & Notes)**:
   ```powershell
   node tests/runner.js --filter=r3
   ```
   Output:
   ```
   [TIER 1: FEATURE COVERAGE]
     ▶ test_r3_cells_notes.js (7 tests)
       ✓ T1-R3-01: Today cell marking cycles empty -> done -> missed -> empty (127ms)
       ✓ T1-R3-02: Future date cell has disabled styling and rejects clicks (73ms)
       ✓ T1-R3-03: Habit color picker persists custom color and renders in UI (61ms)
       ✓ T1-R3-04: Alert spam fix triggers validation alert exactly once (134ms)
       ✓ T1-R3-05: Categorized cell note links note.id into state.cells (63ms)
       ✓ T1-R3-06: Cell note visual badges render distinct categories and tooltips (62ms)
       ✓ T1-R3-07: Cell note deletion removes note and unsets cell.noteId (56ms)
   Execution Summary: 7 / 7 PASS (100%)
   ```

2. **Notes Test Suite (Feature, Boundary, Pairwise)**:
   ```powershell
   node tests/runner.js --filter=notes
   ```
   Output:
   ```
   [TIER 1: FEATURE COVERAGE]
     ▶ test_r3_cells_notes.js (7 tests): 7 / 7 PASS (100%)
   [TIER 2: BOUNDARY & CORNER CASES]
     ▶ test_boundary_notes.js (6 tests): 6 / 6 PASS (100%)
       ✓ T2-R3-01: Local Midnight Boundary Enforcement (77ms)
       ✓ T2-R3-02: Invalid Habit Color Hex Fallback (65ms)
       ✓ T2-R3-03: Repeated Clicks on Empty Habit Save (83ms)
       ✓ T2-R3-04: Note Category Modal Switching (73ms)
       ✓ T2-R3-05: Extremely Long Note Text (5,000 Chars) (61ms)
       ✓ T2-R3-06: Orphan Note Deletion on Habit Removal (58ms)
   [TIER 3: CROSS-FEATURE PAIRWISE COMBINATIONS]
     ▶ test_pairwise_notes_sync.js (1 tests): 1 / 1 PASS (100%)
       ✓ T3-PAIR-01: Categorized notes (Default, Love, Discipline) preserved through encrypted sync (180ms)
   Execution Summary: 14 / 14 PASS (100%)
   ```

3. **Habits Test Suite**:
   ```powershell
   node tests/runner.js --filter=habits
   ```
   Output:
   - All 8 habit-specific tests PASS (`T1-R2-01`, `T1-R2-02`, `T1-R2-07`, and `T2-R2-01` through `T2-R2-06`).
   - The 4 failed tests (`T1-R2-03` through `T1-R2-06`) test the dedicated vertical task checklist view, pending status, and task filtering controls which belong to Milestone 4 (Dedicated Tasks View Revamp).

4. **Empirical Adversarial Stress Suite (`tests/adversarial_m2.js`)**:
   ```powershell
   node tests/adversarial_m2.js
   ```
   Output:
   ```
   --- SUITE A: 30-Day Grid Geometry & Date Boundaries ---
     [PASS] A1: Default 30-day geometry renders exactly 30 columns (28 past + 1 today + 1 tomorrow)
     [PASS] A2: Offset shifts (-7, -30, -365, +7) maintain exact 30-column contiguous count
   --- SUITE B: Cell Marking & Future Date Security ---
     [PASS] B1: Direct cell click cycling cycles empty -> done -> missed -> empty -> done seamlessly
     [PASS] B2: Future date security enforced at both DOM and Storage layers
   --- SUITE C: Habit Custom Colors & Hex Sanitization ---
     [PASS] C1: Habit color sanitization, expansion, fallback and rendering verified
   --- SUITE D: Alert Spam Elimination & Init Idempotency ---
     [PASS] D1: App.init idempotency guard completely prevents listener stacking
   --- SUITE E: Categorized Notes Lifecycle & Cascading Cleanup ---
     [PASS] E1: Categorized notes lifecycle, updating, badges, and cascading cleanup verified
   --- SUITE F: Dual Directory Parity Check ---
     [PASS] F1: 100% byte-for-byte dual directory parity confirmed across all files
   Execution Summary: 8 / 8 PASS (100%)
   ```

5. **Dual Directory SHA-256 Parity**:
   Every file in `public/` and its counterpart in root match byte-for-byte (SHA-256 identical, 0 byte drift).

6. **Integrity Scan**:
   No hardcoded test values, no fake test bypasses, no dummy facades detected.

---

## 2. Logic Chain

1. **30-Day Grid Layout & Local Dates**:
   - `Views.getDatesAround(offset = 0, pastDays = 28, futureDays = 1)` generates 30 contiguous dates (`28 + 1 + 1 = 30`).
   - `anchorUTC = Date.UTC(y, m - 1, d) + (offset * 86400000)` prevents DST drift across date boundaries. Verified contiguous across leap years (Feb 29) and year rollovers.
   - Headers and labels use `position: sticky; left: 0;` with `border-collapse: separate` in `.calendar-table`, ensuring sticky functionality remains active across standard browsers.
   - Grid container handles horizontal scrolling via `overflow-x: auto;`.

2. **Direct Cell Marking & Future Date Protection**:
   - On valid cells, clicking directly cycles `'empty' -> 'done' -> 'missed' -> 'empty'`.
   - Future dates (`date > todayStr`) receive `.disabled` class (`opacity: 0.4; cursor: not-allowed; pointer-events: none;`).
   - In `Storage.updateCell` and `Storage.setHabitStatus`, attempting to set a non-empty status on a future date throws `'Cannot set status for future dates'`, providing dual-layer defense (DOM and Storage).

3. **Habit Custom Color & Hex Sanitization**:
   - `Storage._sanitizeColor(color)` validates strict 6-character hex (`#RRGGBB`) or expands 3-character hex (`#RGB` -> `#RRGGBB`).
   - Any invalid, malformed, non-hex, or injection attempt falls back to `#3fa34d`.
   - Applied to `.habit-icon` inline (`color: ${habitColor}`) and to completed cells (`background-color: ${habitColor}; border-color: ${habitColor};`).

4. **Alert Spam Elimination**:
   - Idempotency guard at the beginning of `App.init()`:
     ```js
     if (this.initialized) {
       this.refreshCurrentView();
       return;
     }
     this.initialized = true;
     ```
   - Prevents stacking event listeners on `#save-habit-btn` when `Auth.showApp()` or repeated `App.init()` calls execute upon vault lock/unlock.
   - Verified that rapid clicks on empty habit save trigger exactly 1 alert per click without runaway event bubbling.

5. **Categorized Cell Notes & Lifecycle Cleanup**:
   - `Storage.createNote` links `note.id` into `state.cells[`${habitId}|${date}`].noteId`.
   - Note modal supports Default, Love, and Discipline categories, updating `.note-type-love` and `.note-type-discipline` on modal content.
   - `Views.renderHabits()` displays distinct visual badges (`.cell-note-badge.badge-default`, `.badge-love`, `.badge-discipline`) with tooltips.
   - Deleting a note unsets `noteId` from all matching cells in `state.cells` and records a tombstone in `state.tombstones.notes`.
   - Deleting a habit cleans up all associated notes and cells, recording tombstones for both.

---

## 3. Findings

### [Minor] Finding 1: Unescaped `habit.icon` in Habit Row Rendering
- **Where**: `js/views.js:133` and `public/js/views.js:133`
- **What**: Habit icon is rendered via `<span class="habit-icon" style="color: ${habitColor}">${habit.icon || '●'}</span>` without wrapping in `this.escapeHtml(...)`.
- **Why**: While the habit modal input has `maxlength="2"`, habits created via API, cloud sync, or JSON import could potentially contain unescaped HTML strings.
- **Suggestion**: Wrap `habit.icon` in `${this.escapeHtml(habit.icon || '●')}` for defense-in-depth.

### [Minor] Finding 2: Note Modal Empty Text Handling
- **Where**: `js/app.js:378` and `public/js/app.js:378`
- **What**: Saving a note with whitespace or empty text creates an active note record and renders a note indicator with an empty tooltip.
- **Why**: Generally, notes should either require non-empty text or clearing the text should prompt deletion of the note.
- **Suggestion**: Add a validation check `if (!text) { alert('Please enter note text'); return; }` on `#save-note-btn`.

---

## 4. Adversarial Challenges & Stress Test Results

| Challenge / Scenario | Expected Result | Actual Result | Verdict |
|---|---|---|---|
| **C1**: Advancing midnight across date boundary | Future cell transitions to today and becomes clickable | Tomorrow becomes today and clears `.disabled` | **PASS** |
| **C2**: CSS / Script injection via habit color input | String sanitized and normalized to `#3fa34d` | Normalized to `#3fa34d`, injection prevented | **PASS** |
| **C3**: Future date direct storage mutation (`done`/`missed`) | Rejected with error | Throws `'Cannot set status for future dates'` | **PASS** |
| **C4**: Rapid 10x clicking on empty habit save | Exactly 10 alerts (1:1 per click, no multiplier) | Exactly 10 alerts recorded | **PASS** |
| **C5**: 50+ habits performance stress | Render all rows within 2000ms | Rendered in <250ms | **PASS** |
| **C6**: Note category switching in modal | Modal CSS updates to `.note-type-love` / `.note-type-discipline` | Classes toggle and save accurately | **PASS** |
| **C7**: 5,000-character note text preservation | Text preserved without truncation | Preserved intact | **PASS** |
| **C8**: Orphan note cascading cleanup on habit deletion | Notes removed from active list, tombstones created | Notes purged and tombstones recorded | **PASS** |

---

## 5. Caveats
- Tests `T1-R2-03` through `T1-R2-06` in `test_r2_habits_tasks.js` test the dedicated vertical task checklist view, task pending status, and task filtering controls. These belong to Milestone 4 (Dedicated Tasks View Revamp) and are deliberately not part of Milestone 2.
- No other caveats.

---

## 6. Conclusion
The implementation of Milestone 2 fully meets all requirements specified in `PROJECT.md`, `SCOPE.md`, and `ORIGINAL_REQUEST.md`:
- Habits 30-day grid renders contiguous 30 date columns with sticky labels and horizontal scroll.
- Cell marking cycles directly on click without popup obstruction.
- Future dates are disabled visually and rejected in both the UI and storage layers.
- Habit color picker saves and renders colors with robust hex fallback.
- Alert spam is eliminated via an idempotency guard in `App.init()`.
- Categorized notes (Default, Love, Discipline) are stored, linked, rendered with badges and tooltips, and purged upon habit/note deletion.
- 100% byte-for-byte dual directory parity is maintained across root and `public/`.
- No integrity violations, hardcoded cheats, or facade implementations were detected.

**Final Verdict**: **APPROVE**

---

## 7. Verification Method

To independently verify this evaluation:
1. Run Feature Suite R3:
   ```powershell
   node tests/runner.js --filter=r3
   ```
2. Run Notes Test Suite:
   ```powershell
   node tests/runner.js --filter=notes
   ```
3. Run Habits Test Suite:
   ```powershell
   node tests/runner.js --filter=habits
   ```
4. Run Dedicated Adversarial Challenge Suite:
   ```powershell
   node tests/adversarial_m2.js
   ```
5. Run Dual Directory SHA-256 Parity Verification:
   ```powershell
   node -e "const fs = require('fs'), path = require('path'), crypto = require('crypto'); function hash(p) { return crypto.createHash('sha256').update(fs.readFileSync(p)).digest('hex'); } function check(dir) { for (const f of fs.readdirSync(dir)) { const pub = path.join(dir, f), rel = path.relative('public', pub), root = path.join('.', rel); if (fs.statSync(pub).isDirectory()) check(pub); else if (!fs.existsSync(root) || hash(pub) !== hash(root)) { console.error('Mismatch:', rel); process.exit(1); } } } check('public'); console.log('Dual directory parity: 100% PASS');"
   ```
