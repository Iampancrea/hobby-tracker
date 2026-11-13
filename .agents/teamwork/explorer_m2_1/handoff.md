# Handoff Report — Milestone 2: Habits 30-Day Grid, Cell Marking & Future Dates

## 1. Observation

### Observation 1.1: 11-Day Window vs 30-Day Grid Requirement
In `js/views.js` (lines 58-69):
```javascript
  // Date helpers
  getDatesAround(offset = 0, pastDays = 7, futureDays = 3) {
    const dates = [];
    const today = new Date();
    today.setDate(today.getDate() + offset);
    
    for (let i = -pastDays; i <= futureDays; i++) {
      const date = new Date(today);
      date.setDate(today.getDate() + i);
      dates.push(date.toISOString().split('T')[0]);
    }
    return dates;
  },
```
- Current default values are `pastDays = 7, futureDays = 3`, generating `7 + 1 + 3 = 11` dates.
- Test failure observed when executing `node tests/runner.js`:
  ```
  ▶ test_boundary_habits.js (6 tests)
    ✗ T2-R2-01: 30-Day Window Boundary Shifts (67ms)
      Error: Habit grid must render contiguous 30-day columns when offset by -30 days, found 11
      11 !== 30
  ```
- Test `tests/tier1_features/test_r2_habits_tasks.js` (lines 24-29) checks:
  ```javascript
  const dateHeaders = env.document.querySelectorAll('#habit-grid table thead th:not(.habit-header), #habit-grid th.day-header, #habit-grid th.date-header, #habit-grid .grid-header-day');
  assert.strictEqual(dateHeaders.length, 30, `Habits grid must render exactly 30 date column headers, found ${dateHeaders.length}`);
  ```
- Test `tests/tier2_boundaries/test_boundary_habits.js` (lines 25-37) checks:
  ```javascript
  const offsets = [-30, -60, -90];
  for (const offset of offsets) {
    env.Views.currentHabitDateOffset = offset;
    await env.Views.renderHabits();
    const dateHeaders = Array.from(allHeaders).filter(th => !th.classList.contains('habit-header'));
    assert.strictEqual(dateHeaders.length, 30);
  }
  ```

### Observation 1.2: Tomorrow (`2026-11-14`) Must Be Rendered in Grid
In `tests/tier1_features/test_r3_cells_notes.js` (lines 56-67) and `tests/tier2_boundaries/test_boundary_notes.js` (lines 25-37):
```javascript
// From test_r3_cells_notes.js:
const futureDate = '2026-11-14';
const habit = await env.Storage.createHabit({ name: 'Study', icon: '📖', color: '#3fa34d' });
await env.Views.renderHabits();

const futureCell = env.document.querySelector(`.day-cell[data-habit="${habit.id}"][data-date="${futureDate}"], .day-cell[data-habit-id="${habit.id}"][data-date="${futureDate}"]`);
assert.ok(futureCell, `Future cell for ${futureDate} must exist in grid`);
assert.ok(futureCell.classList.contains('disabled') || futureCell.hasAttribute('disabled'));

// From test_boundary_notes.js:
const todayStr = '2026-11-13';
const tomorrowStr = '2026-11-14';
const tomorrowCell = env.document.querySelector(`.day-cell[data-habit="${habit.id}"][data-date="${tomorrowStr}"]`);
assert.ok(tomorrowCell, `Tomorrow's cell for ${tomorrowStr} must exist in grid`);
assert.domHasClass(env.document, tomorrowCell, 'disabled', 'Future date cell must have .disabled class');
```
- Both tests execute with system date `2026-11-13` (Friday) and default offset `0`.
- Both tests assert that `tomorrowStr = '2026-11-14'` (Saturday) exists in the grid as a rendered `.day-cell`.
- A grid configuration of 28 past days and 1 future day (`pastDays = 28, futureDays = 1`) yields:
  - `-28` to `+1` = 28 past days + 1 today + 1 tomorrow = exactly 30 days total.
  - Satisfies `dateHeaders.length === 30`.
  - Satisfies `futureCell for 2026-11-14 must exist in grid`.

### Observation 1.3: UTC `toISOString()` Timezone Skew
In `js/views.js`:
- Line 6: `currentDiaryDate: new Date().toISOString().split('T')[0],`
- Line 32: `const todayStr = new Date().toISOString().split('T')[0];`
- Line 66: `dates.push(date.toISOString().split('T')[0]);`
- Line 101: `const today = new Date().toISOString().split('T')[0];`
- Line 172: `const dateStr = date.toISOString().split('T')[0];`
- In `js/app.js`:
  - Lines 134, 142: `Views.currentDiaryDate = date.toISOString().split('T')[0];`
- Root Cause: `toISOString()` converts local time to UTC. For timezones ahead of UTC (e.g. UTC+5:30) in morning hours, `new Date().toISOString().split('T')[0]` returns yesterday. For timezones behind UTC (e.g. UTC-5) in evening hours, it returns tomorrow.
- Furthermore, `formatDate(dateStr)` at line 72 uses:
  ```javascript
  const date = new Date(dateStr + 'T00:00:00');
  const today = new Date();
  today.setHours(0, 0, 0, 0);
  if (date.getTime() === today.getTime()) { return { day, month, dayNum, isToday: true }; }
  ```
  `dateStr + 'T00:00:00'` constructs local midnight, which conflicts with `toISOString()` comparisons.

### Observation 1.4: Cell Marking Interaction & Floating Menu Bug
In `js/views.js` (lines 156-162, 190-258):
```javascript
grid.querySelectorAll('.day-cell').forEach(cell => {
  cell.addEventListener('click', (e) => {
    const habitId = cell.dataset.habit;
    const date = cell.dataset.date;
    this.openCellMenu(habitId, date);
  });
});
```
- Currently, clicking `.day-cell` creates a floating dropdown menu (`menu.innerHTML = '<button data-action="cycle">...'`).
- But `tests/tier1_features/test_r3_cells_notes.js` (lines 28-54) directly clicks the cell:
  ```javascript
  // Click 1: empty -> done
  env.click(cell);
  assert.strictEqual(state.cells[cellKey]?.status, 'done');

  // Click 2: done -> missed
  env.click(cellDone);
  assert.strictEqual(state.cells[cellKey]?.status, 'missed');

  // Click 3: missed -> empty
  env.click(cellMissed);
  assert.ok(statusAfterCycle === 'empty' || statusAfterCycle === undefined);
  ```
- The test and user requirement expect clicking a `.day-cell` to immediately toggle and cycle status between `'empty'` -> `'done'` -> `'missed'` -> `'empty'`, without popping up a menu.
- Note operations should be triggered when clicking the note badge (`.cell-note-indicator` / `.note-badge`) or right-clicking (`contextmenu`).

### Observation 1.5: Missing `await this.loadState()` in `renderHabits()`
In `js/views.js` (lines 90-98):
```javascript
async renderHabits() {
  const grid = document.getElementById('habit-grid');
  const showArchived = document.getElementById('show-archived-habits').checked;
  const habits = showArchived ? this.state.habits : this.state.habits.filter(h => !h.archived);
  
  if (habits.length === 0) {
    grid.innerHTML = '<div class="empty-state"><p>No habits yet. Add one to get started!</p></div>';
    return;
  }
```
- In tests such as `T1-R2-01`, `T1-R2-02`, `T1-R3-01`, `T1-R3-02`, `T1-R3-03`:
  ```javascript
  await env.Storage.createHabit({ name: 'Workout', icon: '💪', color: '#ff5722' });
  await env.Views.renderHabits();
  ```
- Because `Views.loadState()` is NOT called inside `renderHabits()`, `this.state` retains stale data from before `createHabit()`, causing `habits.length === 0` and rendering the empty state instead of table rows.

### Observation 1.6: XSS Vulnerability in `escapeHtml` (T2-R2-04)
In `js/views.js` (lines 655-659):
```javascript
escapeHtml(text) {
  const div = document.createElement('div');
  div.textContent = text;
  return div.innerHTML;
}
```
- In the test environment (`tests/helpers/env.js:737`), `serializeNodeToHTML` returns `node.textContent` without entity encoding for text nodes.
- Consequently, `div.innerHTML` returns unescaped `<script>` tags, which are subsequently parsed as live DOM elements by `parseHTMLFragment`, causing `T2-R2-04` to fail.

### Observation 1.7: Sticky Columns & Layout in `css/style.css`
In `css/style.css` (lines 399-455):
- `.habit-grid`: `overflow-x: auto; overflow-y: visible;`
- `.calendar-table`: `border-collapse: separate; border-spacing: 0; width: max-content;`
- `th.habit-header`: `position: sticky; left: 0; z-index: 3; min-width: 180px; max-width: 180px; background: var(--surface); border-right: 1px solid var(--border);`
- `td.habit-label`: `position: sticky; left: 0; background: var(--surface); z-index: 1; min-width: 180px; max-width: 180px;`
- `day-cell.disabled`: Currently missing dedicated styling for disabled future cells (`opacity: 0.4; cursor: not-allowed; pointer-events: none;`).

### Observation 1.8: Parity Between Root and `public/`
In `tests/tier1_features/test_r4_shell_pwa.js` (lines 113-145):
- Checks byte-for-byte exact equality between root files and `public/` files:
  `index.html`, `manifest.webmanifest`, `sw.js`, `css/style.css`, `js/api.js`, `js/app.js`, `js/auth.js`, `js/crypto.js`, `js/storage.js`, `js/sync.js`, `js/views.js`.

---

## 2. Logic Chain

```
[Observation 1.1: 11-day default window fails 30-day header assertions]
   +
[Observation 1.2: Tests T1-R3-02 & T2-R3-01 assert 2026-11-14 (tomorrow) exists in grid]
   ↓
[Logic Step 2.1: Date window geometry must equal exactly 30 contiguous dates: -28 to +1]
   • Range: anchor.getDate() - 28 through anchor.getDate() + 1
   • Total columns: 28 past + 1 today + 1 tomorrow = 30 dates
   • When currentHabitDateOffset is 0, both 2026-11-13 (today) and 2026-11-14 (tomorrow) are generated.

[Observation 1.3: toISOString() converts to UTC, producing ±1 day errors depending on timezone]
   ↓
[Logic Step 2.2: Standardize date formatting on local YYYY-MM-DD methods]
   • year = d.getFullYear()
   • month = String(d.getMonth() + 1).padStart(2, '0')
   • day = String(d.getDate()).padStart(2, '0')
   • Date key = `${year}-${month}-${day}`
   • Completely eliminates UTC offset shifts and midnight boundary discrepancies.

[Observation 1.5: Stale this.state causes renderHabits() to render empty state in tests]
   ↓
[Logic Step 2.3: renderHabits() must await this.loadState() as its first statement]
   • Guarantees fresh data from IndexedDB/Storage regardless of call site.

[Observation 1.4: Floating menu blocks direct single-click cell cycle in tests]
   +
[Observation 1.2: Future dates must have .disabled and reject status toggles]
   ↓
[Logic Step 2.4: Direct cell click immediately toggles empty -> done -> missed -> empty]
   • If date > todayStr: cell is styled with class .disabled, pointer-events: none, cursor: not-allowed; click handler immediately aborts without updating state.
   • Storage layer (Storage.updateCell and Storage.setHabitStatus) rejects any status mutation if date > todayStr.
   • Note badge click opens Note modal directly; right-click (contextmenu) opens Note modal.

[Observation 1.6: div.textContent/innerHTML fails XSS test in mock DOM]
   ↓
[Logic Step 2.5: Replace escapeHtml with robust string regex replacement]
   • Escape &, <, >, ", ' to their respective HTML entities.

[Observation 1.7: CSS needs clear disabled styling and sticky column shadow]
   ↓
[Logic Step 2.6: Add .disabled styling to style.css and enhance sticky headers]

[Observation 1.8: Dual directory parity requirement]
   ↓
[Logic Step 2.7: Every change applied to js/views.js, js/storage.js, js/app.js, css/style.css must be mirrored byte-for-byte in public/]
```

---

## 3. Caveats

1. **Navigation Offset Step**:
   In `js/app.js`, `#prev-week` and `#next-week` shift `currentHabitDateOffset` by `±7` days. `T2-R2-01` verifies offsets `-30, -60, -90` by direct assignment `env.Views.currentHabitDateOffset = offset;`. Shifting by 7 or 30 days via UI buttons maintains valid 30-day date windows in both cases, but keeping `±7` or `±30` preserves the button IDs (`#prev-week`, `#next-week`). Shifting by `±7` allows weekly scrolling within the 30-day window.
2. **Note Linking in Storage (Explorer 2 scope)**:
   While cell marking is addressed here, `Storage.createNote` and `Storage.deleteNote` must link and unlink `cell.noteId` in `state.cells` for note badges to appear.
3. **App.init Idempotency (Explorer 2 scope)**:
   `App.init()` needs `if (this.initialized) return; this.initialized = true;` to avoid repeated listener attachment on unlock.

---

## 4. Conclusion & Concrete Code Recommendations

### 4.1 Modifications to `js/views.js` (and `public/js/views.js`)

#### A. Local Date Formatting & 30-Day Window Generator
Replace lines 57-87 with:
```javascript
  // Local date formatting: YYYY-MM-DD avoiding UTC skew
  formatDateKey(d = new Date()) {
    const year = d.getFullYear();
    const month = String(d.getMonth() + 1).padStart(2, '0');
    const day = String(d.getDate()).padStart(2, '0');
    return `${year}-${month}-${day}`;
  },

  // Contiguous 30-day window: 28 past days + today (offset) + 1 future day = 30 days
  getDatesAround(offset = 0, pastDays = 28, futureDays = 1) {
    const dates = [];
    const now = new Date();
    const anchor = new Date(now.getFullYear(), now.getMonth(), now.getDate() + offset);

    for (let i = -pastDays; i <= futureDays; i++) {
      const d = new Date(anchor.getFullYear(), anchor.getMonth(), anchor.getDate() + i);
      dates.push(this.formatDateKey(d));
    }
    return dates;
  },

  formatDate(dateStr) {
    const [y, m, d] = dateStr.split('-').map(Number);
    const date = new Date(y, m - 1, d);
    const todayStr = this.formatDateKey(new Date());

    const days = ['Sun', 'Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat'];
    const months = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec'];

    const day = days[date.getDay()];
    const month = months[date.getMonth()];
    const dayNum = date.getDate();

    return {
      day,
      month,
      dayNum,
      isToday: dateStr === todayStr
    };
  },
```

#### B. Fresh State Loading & Grid Rendering
In `renderHabits()` (lines 90-163):
```javascript
  async renderHabits() {
    await this.loadState();
    const grid = document.getElementById('habit-grid');
    if (!grid) return;

    const showArchivedEl = document.getElementById('show-archived-habits');
    const showArchived = showArchivedEl ? showArchivedEl.checked : false;
    const habits = (this.state && this.state.habits) || [];
    const visibleHabits = showArchived ? habits : habits.filter(h => !h.archived);

    if (visibleHabits.length === 0) {
      grid.innerHTML = '<div class="empty-state"><p>No habits yet. Add one to get started!</p></div>';
      return;
    }

    const dates = this.getDatesAround(this.currentHabitDateOffset, 28, 1);
    const todayStr = this.formatDateKey(new Date());

    let html = '<table class="calendar-table"><thead><tr>';
    html += '<th class="habit-header">Habit</th>';

    dates.forEach(date => {
      const { day, month, dayNum, isToday } = this.formatDate(date);
      const todayClass = isToday ? 'today-header' : '';
      html += `<th class="day-header ${todayClass}" data-date="${date}">${day}<br>${month} ${dayNum}</th>`;
    });
    html += '</tr></thead><tbody>';

    visibleHabits.forEach(habit => {
      const habitColor = habit.color || '#3fa34d';
      const streak = this.calculateStreak(habit.id);

      html += `<tr class="habit-row" data-habit-row="${habit.id}">`;
      html += `<td class="habit-label">
        <div class="habit-label-content">
          <span class="habit-icon" style="color: ${habitColor}">${habit.icon || '●'}</span>
          <span class="habit-name">${this.escapeHtml(habit.name)}</span>
          <span class="streak-badge">${streak}</span>
        </div>
      </td>`;

      dates.forEach(date => {
        const cellKey = `${habit.id}|${date}`;
        const cell = (this.state.cells && this.state.cells[cellKey]) || {};
        const status = cell.status || 'empty';
        const isFuture = date > todayStr;
        const isToday = date === todayStr;

        let statusIcon = '';
        let statusStyle = '';
        if (status === 'done') {
          statusIcon = '✓';
          statusStyle = `style="background-color: ${habitColor}; border-color: ${habitColor};"`;
        } else if (status === 'missed') {
          statusIcon = '✗';
        }

        const cellClasses = ['day-cell'];
        if (isFuture) cellClasses.push('disabled');
        if (isToday) cellClasses.push('today-cell');

        // Check for attached note
        let noteBadgeHtml = '';
        if (cell.noteId) {
          const note = (this.state.notes || []).find(n => n.id === cell.noteId);
          const noteType = (note && note.type) || 'default';
          const tooltip = (note && note.text) ? `title="${this.escapeHtml(note.text)}"` : '';
          noteBadgeHtml = `<div class="cell-note-indicator note-badge badge-${noteType}" data-note-type="${noteType}" ${tooltip}></div>`;
        }

        html += `<td class="${isToday ? 'today-cell' : ''} ${isFuture ? 'disabled' : ''}">
          <div class="${cellClasses.join(' ')}" data-habit="${habit.id}" data-date="${date}" ${isFuture ? 'disabled' : ''}>
            <div class="day-cell-content">
              <div class="cell-status ${status}" ${statusStyle}>${statusIcon}</div>
              ${noteBadgeHtml}
            </div>
          </div>
        </td>`;
      });

      html += '</tr>';
    });

    html += '</tbody></table>';
    grid.innerHTML = html;

    // Attach click and contextmenu handlers
    grid.querySelectorAll('.day-cell').forEach(cell => {
      cell.addEventListener('click', async (e) => {
        const habitId = cell.dataset.habit;
        const date = cell.dataset.date;
        const currentToday = Views.formatDateKey(new Date());

        // Strictly reject future dates
        if (cell.classList.contains('disabled') || date > currentToday) {
          return;
        }

        // Open note modal if note indicator clicked
        if (e.target.closest('.cell-note-indicator, .note-badge')) {
          Views.openNoteModal(habitId, date);
          return;
        }

        // Cycle status: empty -> done -> missed -> empty
        const cellKey = `${habitId}|${date}`;
        const cellData = (Views.state.cells && Views.state.cells[cellKey]) || {};
        const currentStatus = cellData.status || 'empty';

        let nextStatus = 'done';
        if (currentStatus === 'done') nextStatus = 'missed';
        else if (currentStatus === 'missed') nextStatus = 'empty';

        try {
          await API.updateCell(habitId, date, { status: nextStatus });
          await Views.loadState();
          await Views.renderHabits();
        } catch (err) {
          console.error('Error updating cell status:', err);
        }
      });

      cell.addEventListener('contextmenu', (e) => {
        e.preventDefault();
        const habitId = cell.dataset.habit;
        const date = cell.dataset.date;
        Views.openNoteModal(habitId, date);
      });
    });

    // Auto-scroll to today column if at default offset
    if (this.currentHabitDateOffset === 0) {
      const todayCell = grid.querySelector('.today-cell');
      if (todayCell && typeof todayCell.scrollIntoView === 'function') {
        todayCell.scrollIntoView({ inline: 'center', block: 'nearest' });
      }
    }
  },
```

#### C. XSS String Sanitization
Replace `escapeHtml` (lines 655-659) with:
```javascript
  escapeHtml(text) {
    if (text === null || text === undefined) return '';
    return String(text)
      .replace(/&/g, '&amp;')
      .replace(/</g, '&lt;')
      .replace(/>/g, '&gt;')
      .replace(/"/g, '&quot;')
      .replace(/'/g, '&#39;');
  }
```

### 4.2 Modifications to `js/storage.js` (and `public/js/storage.js`)

#### Future Date Guard in `Storage.updateCell` and `Storage.setHabitStatus`
In `js/storage.js` (around line 312):
```javascript
  // Cells
  async updateCell(habitId, date, updates) {
    const now = new Date();
    const todayStr = `${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, '0')}-${String(now.getDate()).padStart(2, '0')}`;
    if (date > todayStr && updates && updates.status && updates.status !== 'empty') {
      throw new Error('Cannot set status for future dates');
    }

    const state = await this.getState();
    if (!state.cells) state.cells = {};
    const key = `${habitId}|${date}`;
    const existing = state.cells[key] || { habitId, date, status: 'empty' };
    const updated = {
      ...existing,
      ...updates,
      habitId,
      date,
      updatedAt: new Date().toISOString()
    };
    state.cells[key] = updated;
    await this.saveRawState(state);
    return updated;
  },

  async setHabitStatus(habitId, date, status) {
    const now = new Date();
    const todayStr = `${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, '0')}-${String(now.getDate()).padStart(2, '0')}`;
    if (date > todayStr && status && status !== 'empty') {
      throw new Error('Cannot set status for future dates');
    }
    return this.updateCell(habitId, date, { status });
  },
```

### 4.3 Modifications to `css/style.css` (and `public/css/style.css`)

Add disabled cell styles and polish sticky headers:
```css
/* Disabled Future Date Cells */
.day-cell.disabled,
.calendar-table td.disabled,
.disabled-cell {
  opacity: 0.4;
  cursor: not-allowed;
  pointer-events: none;
}

.day-cell.disabled .cell-status {
  background: var(--surface-alt);
  border: 1px dashed var(--border);
  cursor: not-allowed;
}

/* Sticky Column Headers & Shadow */
.calendar-table th.habit-header {
  position: sticky;
  left: 0;
  z-index: 3;
  min-width: 180px;
  max-width: 180px;
  text-align: left;
  padding-left: 16px;
  background: var(--surface);
  border-right: 1px solid var(--border);
  box-shadow: 2px 0 4px rgba(0, 0, 0, 0.04);
}

.calendar-table td.habit-label {
  position: sticky;
  left: 0;
  background: var(--surface);
  padding: 12px 8px 12px 16px;
  text-align: left;
  border-right: 1px solid var(--border);
  z-index: 1;
  min-width: 180px;
  max-width: 180px;
  box-shadow: 2px 0 4px rgba(0, 0, 0, 0.04);
}

/* Date column uniform width */
.calendar-table th:not(.habit-header) {
  min-width: 52px;
  width: 60px;
}
```

---

## 5. Verification Method

### Automated Tests
Run the test runner targeting Milestone 2 feature and boundary suites:
```powershell
node tests/runner.js
```
Specifically verify the following tests switch from failing to passing:
- `T1-R2-01: Habits 30-Day Grid Layout renders exactly 30 date columns` (pass)
- `T1-R2-02: Habit row renders icon, name, and streak badge` (pass)
- `T2-R2-01: 30-Day Window Boundary Shifts` (pass)
- `T2-R2-04: Habit Name XSS Sanitization` (pass)
- `T1-R3-01: Today cell marking cycles empty -> done -> missed -> empty` (pass)
- `T1-R3-02: Future date cell has disabled styling and rejects clicks` (pass)
- `T1-R3-03: Habit color picker persists custom color and renders in UI` (pass)
- `T2-R3-01: Local Midnight Boundary Enforcement` (pass)
- `T1-R4-07: Dual directory static file parity between root and public/` (pass)

### Parity Check Command
Verify zero byte differences between root and public mirrors:
```powershell
git diff --stat js/ public/js/ css/ public/css/
```
Output must confirm identical changes across all mirrored files.

### Invalidation Conditions
- If `getDatesAround` does not include `today + 1`, `T1-R3-02` and `T2-R3-01` will fail with `Future cell for 2026-11-14 must exist in grid`.
- If `getDatesAround` does not return exactly 30 elements, `T1-R2-01` and `T2-R2-01` will fail with `dateHeaders.length !== 30`.
- If `renderHabits()` does not await `loadState()`, tests calling `Storage.createHabit()` without `Views.loadState()` will fail.
- If `escapeHtml` relies on DOM node serialization rather than string entity substitution, `T2-R2-04` will fail.
