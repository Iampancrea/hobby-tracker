# Explorer 3 Handoff Report: Categorized Habit Cell Notes, Existing Tests & Verification (Milestone 2)

## 1. Observation

### 1.1 `js/storage.js` Note & Cell Linkage Deficiencies
In `js/storage.js`, lines 339–372 implement note creation, update, and deletion:
```javascript
339:   // Notes
340:   async createNote(noteData) {
341:     const state = await this.getState();
342:     if (!state.notes) state.notes = [];
343:     const now = new Date().toISOString();
344:     const note = {
345:       id: 'n_' + Date.now() + '_' + Math.random().toString(36).substr(2, 6),
346:       type: noteData.type || 'default',
347:       text: noteData.text || '',
348:       createdAt: now,
349:       updatedAt: now
350:     };
351:     state.notes.push(note);
352:     await this.saveRawState(state);
353:     return note;
354:   },
...
364:   async deleteNote(id) {
365:     const state = await this.getState();
366:     state.notes = (state.notes || []).filter(n => n.id !== id);
367:     if (!state.tombstones) state.tombstones = {};
368:     if (!state.tombstones.notes) state.tombstones.notes = {};
369:     state.tombstones.notes[id] = new Date().toISOString();
370:     await this.saveRawState(state);
371:     return { success: true };
372:   },
```
Direct Observations:
1. `createNote(noteData)` ignores `noteData.habitId` and `noteData.date`. The created `note` object does not include `habitId` or `date`.
2. `createNote` never touches `state.cells`. It does not set `state.cells[`${habitId}|${date}`].noteId = note.id`.
3. `deleteNote(id)` filters `state.notes` and updates `state.tombstones.notes`, but never clears `noteId` from `state.cells`. Any cell that held `noteId === id` retains a dangling pointer to a deleted note.
4. `getNotes(habitId, date)` does not exist in `js/storage.js`.
5. `deleteHabit(id)` in lines 301–309 removes the habit and records a tombstone, but fails to clean up or tombstone associated cell notes (`note.habitId === id`) or habit cells.

### 1.2 `js/views.js` Cell Rendering & Interaction Deficiencies
In `js/views.js`:
- Lines 58–69 generate dates:
  ```javascript
  getDatesAround(offset = 0, pastDays = 7, futureDays = 3) {
  ```
  Only 11 dates are returned (past 7 + today + future 3), failing the 30-day grid requirement.
- Line 90: `renderHabits()` reads `this.state.habits` without ensuring state is fresh from storage (`await this.loadState()` is absent at the beginning of `renderHabits()`).
- Lines 120–121:
  ```javascript
  <span class="habit-icon">${habit.icon}</span>
  <span class="habit-name">${this.escapeHtml(habit.name)}</span>
  ```
  Custom habit color `habit.color` is not applied as inline style `style="color: ${habit.color}"`.
- Lines 127–147:
  ```javascript
  const cellKey = `${habit.id}|${date}`;
  const cell = this.state.cells[cellKey] || {};
  const status = cell.status || 'empty';
  const hasNote = !!cell.noteId;
  ...
  <td class="${todayClass}">
    <div class="day-cell" data-habit="${habit.id}" data-date="${date}">
      <div class="day-cell-content">
        <div class="cell-status ${status}">${statusIcon}</div>
        ${hasNote ? '<div class="cell-note-indicator"></div>' : ''}
      </div>
    </div>
  </td>
  ```
  - `hasNote` is evaluated via `cell.noteId`, which is never populated due to `createNote()` omitting cell linkage.
  - Cell notes are rendered only as a generic `<div class="cell-note-indicator"></div>` without categorized badge classes (`.cell-note-badge`, `.badge-default`, `.badge-love`, `.badge-discipline`), category data attributes (`data-note-type`), or reason description tooltips (`title="${note.text}"`).
  - Completed cells (`status === 'done'`) do not apply `style="background-color: ${habit.color}"`.
  - Future date cells (`date > todayStr`) do not receive `.disabled` class or `disabled` attribute.
- Lines 156–162 & 190–269:
  ```javascript
  grid.querySelectorAll('.day-cell').forEach(cell => {
    cell.addEventListener('click', (e) => {
      const habitId = cell.dataset.habit;
      const date = cell.dataset.date;
      this.openCellMenu(habitId, date);
    });
  });
  ```
  Clicking `.day-cell` invokes `openCellMenu()`, which opens a popup menu (`Mark Done`, `Mark Missed`, `Add Note`, `Edit Habit`) rather than cycling cell status directly. This blocks direct marking and causes tests (`T1-R3-01`) to fail.
- Lines 303–312:
  ```javascript
  modal.querySelectorAll('.note-type-btn').forEach(btn => {
    btn.onclick = () => { ... };
  });
  ```
  `openNoteModal` registers handlers via `btn.onclick`. In headless test environments (`env.js` MockElement), event dispatch only invokes listeners registered via `addEventListener('click')`, causing category styling switches to not trigger in automated tests (`T2-R3-04`).
- Lines 655–659:
  ```javascript
  escapeHtml(text) {
    const div = document.createElement('div');
    div.textContent = text;
    return div.innerHTML;
  }
  ```
  In `tests/helpers/env.js`, `serializeNodeToHTML()` prints raw `node.textContent` without escaping HTML entities (`<`, `>`, `&`). Consequently, payload strings like `<script>...</script>` are inserted into the DOM as active `<script>` nodes in tests (`T2-R2-04`).

### 1.3 `js/app.js` Event Listeners & Note Handling
In `js/app.js`:
- Line 5: `async init()` lacks an idempotency guard. Every time the vault locks and unlocks, `App.init()` attaches redundant event listeners to `#save-habit-btn`. This causes `alert('Please enter a habit name')` to fire multiple times per trigger (`T1-R3-04`).
- Lines 352–357:
  ```javascript
  document.querySelectorAll('#note-modal .note-type-btn').forEach(btn => {
    btn.addEventListener('click', () => {
      document.querySelectorAll('#note-modal .note-type-btn').forEach(b => b.classList.remove('active'));
      btn.classList.add('active');
    });
  });
  ```
  Clicking note category buttons in `app.js` only updates `.active` class on the button; it does not update the modal container's class to `.note-type-love` or `.note-type-discipline`.

### 1.4 `index.html` Note Modal Markup
In `index.html` lines 353–372:
```html
<div id="note-modal" class="modal" style="display:none;">
  <div class="modal-content note-modal-content">
    <div class="modal-header">
      <h2 id="note-modal-title">Add Note</h2>
      <button class="modal-close">&times;</button>
    </div>
    <div class="note-type-selector">
      <button class="note-type-btn active" data-type="default">Default</button>
      <button class="note-type-btn" data-type="love">Love</button>
      <button class="note-type-btn" data-type="discipline">Discipline</button>
    </div>
    <div class="modal-body">
      <textarea id="note-text" placeholder="Write your note..."></textarea>
    </div>
    <div class="modal-footer">
      <button id="delete-note-btn" class="btn btn-danger" style="display:none;">Delete</button>
      <button id="save-note-btn" class="btn btn-primary">Save</button>
    </div>
  </div>
</div>
```
The modal structure with category buttons (`data-type="default"`, `"love"`, `"discipline"`), textarea `#note-text`, delete button `#delete-note-btn`, and save button `#save-note-btn` is properly defined.

### 1.5 `css/style.css` Note Styling
In `css/style.css`:
- Lines 855–920 provide styling for `.note-modal-content.note-type-love` (pink border `#ec4899`, serif italic) and `.note-modal-content.note-type-discipline` (dark background `#1a1a1a`, amber `#f59e0b`, monospace).
- Line 545 defines only `.cell-note-indicator`:
  ```css
  .cell-note-indicator {
    width: 8px;
    height: 8px;
    border-radius: 50%;
    background: var(--primary);
  }
  ```
  Classes `.cell-note-badge`, `.badge-default`, `.badge-love`, and `.badge-discipline` are missing.

### 1.6 Dual Directory Parity
Execution of Node.js SHA-256 hash comparison across all files in `public/` and `.` confirmed:
- Currently 15 client files exist in `public/`:
  - `css/style.css`
  - `icons/icon-192.png`, `icons/icon-512.png`, `icons/icon.svg`
  - `index.html`
  - `js/api.js`, `js/app.js`, `js/auth.js`, `js/crypto.js`, `js/storage.js`, `js/sync.js`, `js/views.js`
  - `manifest.json`, `manifest.webmanifest`, `sw.js`
- All 15 files are currently 100% byte-for-byte identical between root and `public/`.

### 1.7 Current Test Suite Baseline Execution
Command run: `node tests/runner.js --filter=r3`
Result:
```
[TIER 1: FEATURE COVERAGE]
  ▶ test_r3_cells_notes.js (7 tests)
    ✗ T1-R3-01: Today cell marking cycles empty -> done -> missed -> empty
    ✗ T1-R3-02: Future date cell has disabled styling and rejects clicks
    ✗ T1-R3-03: Habit color picker persists custom color and renders in UI
    ✗ T1-R3-04: Alert spam fix triggers validation alert exactly once
    ✗ T1-R3-05: Categorized cell note links note.id into state.cells
    ✗ T1-R3-06: Cell note visual badges render distinct categories and tooltips
    ✓ T1-R3-07: Cell note deletion removes note and unsets cell.noteId
Execution Summary: 1 / 7 PASS (14%)
```

Command run: `node tests/runner.js --filter=notes`
Result:
```
Tier 1 (Feature Coverage)        : 1 / 7 PASS (14%)
Tier 2 (Boundary & Corner Cases) : 3 / 6 PASS (50%)
Tier 3 (Cross-Feature Pairwise)  : 1 / 1 PASS (100%)
Total: 5 / 14 PASS (36%)
```

Command run: `node tests/runner.js --filter=habits`
Result:
```
Tier 1 (Feature Coverage)        : 1 / 7 PASS (14%)
Tier 2 (Boundary & Corner Cases) : 4 / 6 PASS (67%)
Total: 5 / 13 PASS (38%)
```

---

## 2. Logic Chain

1. **Cell Note Storage Disconnection**:
   - In `js/storage.js:339`, `createNote(noteData)` constructs `note = { id, type, text, createdAt, updatedAt }` and pushes it to `state.notes`.
   - Because `noteData.habitId` and `noteData.date` are ignored, the note object lacks habit and date metadata.
   - Crucially, `state.cells[`${habitId}|${date}`]` is never updated with `noteId: note.id`.
   - Therefore, `test_r3_cells_notes.js:157` (`assert.strictEqual(state.cells[cellKey].noteId, note.id)`) fails immediately with `Target cell must exist in state.cells`.
   - In `deleteNote(id)`, only `state.notes` is filtered; `state.cells` is not scanned, leaving orphaned references.
   - In `deleteHabit(id)`, associated notes in `state.notes` are not purged or tombstoned, causing `T2-R3-06` to fail.

2. **Visual Cell Rendering Failure**:
   - `renderHabits()` checks `const hasNote = !!cell.noteId`. Since `noteId` was never stored in the cell, `hasNote` evaluates to `false` for every cell.
   - Even if `cell.noteId` were present, `renderHabits()` only renders `<div class="cell-note-indicator"></div>` without category-specific classes (`.badge-love`, `.badge-discipline`, `.badge-default`) or description tooltips (`title="${note.text}"`).
   - Consequently, `T1-R3-06` fails because no element matching `.cell-note-badge`, `.badge-discipline`, or `[data-note-type="discipline"]` is rendered.

3. **Cell Click vs. Note Interaction Conflict**:
   - In `views.js:156`, cell click opens `openCellMenu(habitId, date)`. This creates a DOM popup menu rather than toggling cell status.
   - `T1-R3-01` expects clicking `.day-cell` to immediately cycle status `empty -> done -> missed -> empty`.
   - To support both status cycling and note editing, direct click on the cell (outside the note badge) must cycle status, while clicking the `.cell-note-badge` directly or right-clicking (`contextmenu`) on the cell opens `openNoteModal(habitId, date)`.

4. **Future Date Disabling & Date Window Geometry**:
   - `getDatesAround(offset, pastDays = 7, futureDays = 3)` produces only 11 days.
   - `T1-R2-01` requires exactly 30 date column headers.
   - `T1-R3-02` and `T2-R3-01` explicitly assert that tomorrow (`2026-11-14` when today is `2026-11-13`) exists in the grid and has `.disabled` styling and rejects status toggling.
   - Setting `getDatesAround(offset = 0, pastDays = 28, futureDays = 1)` yields exactly 28 + 1 (today) + 1 (tomorrow) = 30 contiguous days. Tomorrow is rendered in the grid, flagged as `isFuture = date > todayStr`, given class `disabled` and attribute `disabled`, and rejected from click toggles.

5. **Alert Spam Event Listener Accumulation**:
   - In `js/app.js:5`, `App.init()` attaches event listeners without checking if it has already initialized.
   - Every vault unlock calls `App.init()`, attaching duplicate click handlers to `#save-habit-btn`.
   - Adding `if (this.initialized) return; this.initialized = true;` ensures listeners are bound exactly once.

6. **Mock DOM Compatibility for Category Buttons & XSS**:
   - In `views.js`, `btn.onclick` is ignored by the test environment `MockElement.dispatchEvent()`. Using `addEventListener('click')` in `app.js` and updating `note-modal-content` class directly ensures both browser and test harness function correctly.
   - Replacing DOM-based `escapeHtml()` with regex replacement prevents `<script>` nodes from being generated in `MockDocument`.

---

## 3. Caveats

- **Timezone Drift**: Date string generation must use local date getters (`getFullYear()`, `getMonth() + 1`, `getDate()`) formatted as `YYYY-MM-DD` rather than UTC `toISOString().split('T')[0]` to avoid date shifting across local midnight boundaries.
- **Milestone 4 Task View**: `test_r2_habits_tasks.js` contains task checklist tests (T1-R2-03 through T1-R2-06) that belong to Milestone 4 (Revamped Dedicated Tasks View). In Milestone 2, our target is passing all R3 tests (`test_r3_cells_notes.js`), habits tests (`T1-R2-01`, `T1-R2-02`, `test_boundary_habits.js`), and notes boundary/pairwise tests.

---

## 4. Conclusion & Actionable Contract Recommendations

### 4.1 Data Model Contracts

#### Note Contract
```javascript
{
  id: string,               // 'n_' + timestamp + '_' + randomStr
  habitId: string,          // ID of associated habit (e.g. 'h_...')
  date: string,             // Local date 'YYYY-MM-DD'
  type: string,             // 'default' | 'love' | 'discipline'
  text: string,             // User note / explanation
  createdAt: string,        // ISO timestamp
  updatedAt: string         // ISO timestamp
}
```

#### Cell Contract in `state.cells[`${habitId}|${date}`]`
```javascript
{
  habitId: string,          // ID of habit
  date: string,             // 'YYYY-MM-DD'
  status: string,           // 'empty' | 'done' | 'missed'
  noteId?: string,          // Linked note id ('n_...') or omitted if no note
  updatedAt: string         // ISO timestamp
}
```

### 4.2 Storage Layer Modifications (`js/storage.js` & `public/js/storage.js`)

#### 1. `createNote(noteData)`
```javascript
  async createNote(noteData) {
    const state = await this.getState();
    if (!state.notes) state.notes = [];
    const now = new Date().toISOString();
    const note = {
      id: 'n_' + Date.now() + '_' + Math.random().toString(36).substr(2, 6),
      habitId: noteData.habitId || null,
      date: noteData.date || null,
      type: noteData.type || 'default',
      text: noteData.text || '',
      createdAt: now,
      updatedAt: now
    };
    state.notes.push(note);

    // Link note.id to corresponding cell
    if (noteData.habitId && noteData.date) {
      if (!state.cells) state.cells = {};
      const cellKey = `${noteData.habitId}|${noteData.date}`;
      const existing = state.cells[cellKey] || { habitId: noteData.habitId, date: noteData.date, status: 'empty' };
      state.cells[cellKey] = {
        ...existing,
        noteId: note.id,
        updatedAt: now
      };
    }

    await this.saveRawState(state);
    return note;
  },
```

#### 2. `deleteNote(id)`
```javascript
  async deleteNote(id) {
    const state = await this.getState();
    const note = (state.notes || []).find(n => n.id === id);
    state.notes = (state.notes || []).filter(n => n.id !== id);
    if (!state.tombstones) state.tombstones = {};
    if (!state.tombstones.notes) state.tombstones.notes = {};
    state.tombstones.notes[id] = new Date().toISOString();

    // Clear noteId from state.cells
    if (state.cells) {
      for (const key of Object.keys(state.cells)) {
        if (state.cells[key] && state.cells[key].noteId === id) {
          delete state.cells[key].noteId;
          state.cells[key].updatedAt = new Date().toISOString();
        }
      }
    }

    await this.saveRawState(state);
    return { success: true };
  },
```

#### 3. `deleteHabit(id)` (T2-R3-06 Orphan Note Cleanup)
```javascript
  async deleteHabit(id) {
    const state = await this.getState();
    const now = new Date().toISOString();
    state.habits = state.habits.filter(h => h.id !== id);
    if (!state.tombstones) state.tombstones = {};
    if (!state.tombstones.habits) state.tombstones.habits = {};
    state.tombstones.habits[id] = now;

    // Purge or tombstone associated notes
    if (state.notes) {
      if (!state.tombstones.notes) state.tombstones.notes = {};
      const habitNotes = state.notes.filter(n => n.habitId === id);
      for (const n of habitNotes) {
        state.tombstones.notes[n.id] = now;
      }
      state.notes = state.notes.filter(n => n.habitId !== id);
    }

    // Clean up habit cells
    if (state.cells) {
      for (const key of Object.keys(state.cells)) {
        if (key.startsWith(`${id}|`)) {
          delete state.cells[key];
        }
      }
    }

    await this.saveRawState(state);
    return { success: true };
  },
```

#### 4. `getNotes(habitId = null, date = null)`
```javascript
  async getNotes(habitId = null, date = null) {
    const state = await this.getState();
    let notes = state.notes || [];
    if (habitId) notes = notes.filter(n => n.habitId === habitId);
    if (date) notes = notes.filter(n => n.date === date);
    return notes;
  },
```

### 4.3 View Layer Modifications (`js/views.js` & `public/js/views.js`)

#### 1. Date Generation for 30-Day Grid (`getDatesAround`)
```javascript
  getDatesAround(offset = 0, pastDays = 28, futureDays = 1) {
    const dates = [];
    const today = new Date();
    today.setDate(today.getDate() + offset);
    
    for (let i = -pastDays; i <= futureDays; i++) {
      const date = new Date(today);
      date.setDate(today.getDate() + i);
      const year = date.getFullYear();
      const month = String(date.getMonth() + 1).padStart(2, '0');
      const day = String(date.getDate()).padStart(2, '0');
      dates.push(`${year}-${month}-${day}`);
    }
    return dates;
  },

  getTodayStr() {
    const d = new Date();
    const year = d.getFullYear();
    const month = String(d.getMonth() + 1).padStart(2, '0');
    const day = String(d.getDate()).padStart(2, '0');
    return `${year}-${month}-${day}`;
  },
```

#### 2. Robust HTML Escaping
```javascript
  escapeHtml(str) {
    if (!str) return '';
    return String(str)
      .replace(/&/g, '&amp;')
      .replace(/</g, '&lt;')
      .replace(/>/g, '&gt;')
      .replace(/"/g, '&quot;')
      .replace(/'/g, '&#39;');
  },
```

#### 3. Habit Grid Rendering (`renderHabits()`)
```javascript
  async renderHabits() {
    await this.loadState();
    const grid = document.getElementById('habit-grid');
    const showArchivedEl = document.getElementById('show-archived-habits');
    const showArchived = showArchivedEl ? showArchivedEl.checked : false;
    const habits = showArchived ? this.state.habits : (this.state.habits || []).filter(h => !h.archived);
    
    if (habits.length === 0) {
      grid.innerHTML = '<div class="empty-state"><p>No habits yet. Add one to get started!</p></div>';
      return;
    }

    const dates = this.getDatesAround(this.currentHabitDateOffset || 0);
    const todayStr = this.getTodayStr();

    let html = '<table class="calendar-table"><thead><tr>';
    html += '<th class="habit-header">Habit</th>';
    
    dates.forEach(date => {
      const { day, month, dayNum, isToday } = this.formatDate(date);
      const todayClass = isToday ? 'today-header' : '';
      html += `<th class="${todayClass}">${day}<br>${month} ${dayNum}</th>`;
    });
    html += '</tr></thead><tbody>';

    habits.forEach(habit => {
      html += `<tr>`;
      
      const streak = this.calculateStreak(habit.id);
      const habitColor = (habit.color && /^#([0-9a-fA-F]{6})$/.test(habit.color)) ? habit.color : '#3fa34d';

      html += `<td class="habit-label">
        <div class="habit-label-content">
          <span class="habit-icon" style="color: ${habitColor};">${habit.icon || '●'}</span>
          <span class="habit-name">${this.escapeHtml(habit.name)}</span>
          ${streak > 0 ? `<span class="streak-badge">${streak}</span>` : ''}
        </div>
      </td>`;

      dates.forEach(date => {
        const cellKey = `${habit.id}|${date}`;
        const cell = this.state.cells[cellKey] || {};
        const status = cell.status || 'empty';
        const isFuture = date > todayStr;
        const isToday = date === todayStr;
        const todayClass = isToday ? 'today-cell' : '';
        const disabledClass = isFuture ? 'disabled' : '';

        // Note lookup
        const note = cell.noteId ? (this.state.notes || []).find(n => n.id === cell.noteId) : null;
        const noteType = note ? (note.type || 'default') : 'default';
        const noteText = note ? (note.text || '') : '';

        let statusIcon = '';
        if (status === 'done') statusIcon = '✓';
        else if (status === 'missed') statusIcon = '✗';

        const doneStyle = (status === 'done') ? `style="background-color: ${habitColor};"` : '';

        let badgeHtml = '';
        if (note) {
          badgeHtml = `<div class="cell-note-badge cell-note-indicator badge-${noteType}" data-note-type="${noteType}" title="${this.escapeHtml(noteText)}"></div>`;
        }

        html += `<td class="${todayClass}">
          <div class="day-cell ${disabledClass}" data-habit="${habit.id}" data-date="${date}" ${isFuture ? 'disabled' : ''}>
            <div class="day-cell-content">
              <div class="cell-status ${status}" ${doneStyle}>${statusIcon}</div>
              ${badgeHtml}
            </div>
          </div>
        </td>`;
      });

      html += '</tr>';
    });

    html += '</tbody></table>';
    grid.innerHTML = html;

    // Direct cell click handler: cycle empty -> done -> missed -> empty
    grid.querySelectorAll('.day-cell').forEach(cell => {
      cell.addEventListener('click', async (e) => {
        if (e.target.closest('.cell-note-badge') || e.target.closest('.cell-note-indicator')) {
          return;
        }
        const habitId = cell.dataset.habit;
        const date = cell.dataset.date;
        const today = this.getTodayStr();
        if (date > today) return;

        const cellKey = `${habitId}|${date}`;
        const currentCell = this.state.cells[cellKey] || {};
        const currentStatus = currentCell.status || 'empty';

        let newStatus = 'done';
        if (currentStatus === 'done') newStatus = 'missed';
        else if (currentStatus === 'missed') newStatus = 'empty';

        try {
          await API.updateCell(habitId, date, { status: newStatus });
          await this.loadState();
          await this.renderHabits();
        } catch (err) {
          console.error('Cell update failed:', err);
        }
      });

      // Contextmenu: open note modal on right click
      cell.addEventListener('contextmenu', (e) => {
        e.preventDefault();
        const habitId = cell.dataset.habit;
        const date = cell.dataset.date;
        this.openNoteModal(habitId, date);
      });
    });

    // Note badge click handler: open note modal directly
    grid.querySelectorAll('.cell-note-badge, .cell-note-indicator').forEach(badge => {
      badge.addEventListener('click', (e) => {
        e.stopPropagation();
        const cell = badge.closest('.day-cell');
        if (!cell) return;
        const habitId = cell.dataset.habit;
        const date = cell.dataset.date;
        this.openNoteModal(habitId, date);
      });
    });
  },
```

#### 4. `openNoteModal(habitId, date)`
```javascript
  openNoteModal(habitId, date) {
    const cellKey = `${habitId}|${date}`;
    const cell = this.state.cells[cellKey] || {};
    const note = cell.noteId ? (this.state.notes || []).find(n => n.id === cell.noteId) : null;
    
    const modal = document.getElementById('note-modal');
    const content = modal.querySelector('.note-modal-content');
    const title = document.getElementById('note-modal-title');
    const textArea = document.getElementById('note-text');
    const deleteBtn = document.getElementById('delete-note-btn');
    
    title.textContent = note ? 'Edit Note' : 'Add Note';
    textArea.value = note ? note.text : '';
    deleteBtn.style.display = note ? 'inline-flex' : 'none';
    
    const type = note ? (note.type || 'default') : 'default';
    modal.querySelectorAll('.note-type-btn').forEach(btn => {
      btn.classList.toggle('active', btn.dataset.type === type);
    });
    
    content.className = 'modal-content note-modal-content';
    if (type === 'love') content.classList.add('note-type-love');
    else if (type === 'discipline') content.classList.add('note-type-discipline');
    
    modal.style.display = 'flex';
    modal.dataset.habitId = habitId;
    modal.dataset.date = date;
    modal.dataset.noteId = note ? note.id : '';
  },
```

### 4.4 App Event Handlers (`js/app.js` & `public/js/app.js`)

#### 1. Idempotency Guard in `App.init()`
```javascript
  async init() {
    if (this.initialized) return;
    this.initialized = true;

    await Views.loadState();
    Views.renderTopQuote();
    ...
```

#### 2. Note Category Switching Event Listener
```javascript
    const noteModal = document.getElementById('note-modal');
    const noteContent = noteModal?.querySelector('.note-modal-content');
    document.querySelectorAll('#note-modal .note-type-btn').forEach(btn => {
      btn.addEventListener('click', () => {
        document.querySelectorAll('#note-modal .note-type-btn').forEach(b => b.classList.remove('active'));
        btn.classList.add('active');
        if (noteContent) {
          noteContent.className = 'modal-content note-modal-content';
          if (btn.dataset.type === 'love') noteContent.classList.add('note-type-love');
          else if (btn.dataset.type === 'discipline') noteContent.classList.add('note-type-discipline');
        }
      });
    });
```

### 4.5 CSS Enhancements (`css/style.css` & `public/css/style.css`)
```css
/* Note Badges on Habit Cells */
.cell-note-badge {
  position: absolute;
  top: 4px;
  right: 4px;
  width: 10px;
  height: 10px;
  border-radius: 50%;
  cursor: pointer;
  z-index: 2;
  transition: transform 0.15s ease;
}

.cell-note-badge:hover {
  transform: scale(1.3);
}

.cell-note-badge.badge-default {
  background-color: var(--primary, #3fa34d);
  box-shadow: 0 0 2px rgba(0, 0, 0, 0.3);
}

.cell-note-badge.badge-love {
  background-color: #ec4899;
  box-shadow: 0 0 4px rgba(236, 72, 153, 0.6);
}

.cell-note-badge.badge-discipline {
  background-color: #f59e0b;
  box-shadow: 0 0 4px rgba(245, 158, 11, 0.6);
}

/* Disabled Future Day Cells */
.day-cell.disabled {
  opacity: 0.35;
  cursor: not-allowed !important;
  pointer-events: none;
  background: var(--surface-alt);
}
```

---

## 5. Verification Method

### 5.1 Verification Commands
The Worker and Reviewer can independently verify all Milestone 2 features using the following commands:

1. **Target Feature Test (R3 - Cells & Notes)**:
   ```powershell
   node tests/runner.js --filter=r3
   ```
   *Expected*: All 7 tests in `test_r3_cells_notes.js` pass (100%).

2. **Notes Boundary & Pairwise Coverage**:
   ```powershell
   node tests/runner.js --filter=notes
   ```
   *Expected*: All tests across `test_r3_cells_notes.js`, `test_boundary_notes.js`, and `test_pairwise_notes_sync.js` pass.

3. **Habits Grid & Boundary Coverage**:
   ```powershell
   node tests/runner.js --filter=habits
   ```
   *Expected*: `test_boundary_habits.js` passes all 6 tests including XSS sanitization, streak calculation, and 30-day window shifts.

4. **Dual Directory Parity Verification**:
   ```powershell
   node -e "
   const fs = require('fs'), path = require('path'), crypto = require('crypto');
   function hash(p) { return crypto.createHash('sha256').update(fs.readFileSync(p)).digest('hex'); }
   function check(dir) {
     for (const f of fs.readdirSync(dir)) {
       const pub = path.join(dir, f), rel = path.relative('public', pub), root = path.join('.', rel);
       if (fs.statSync(pub).isDirectory()) check(pub);
       else if (hash(pub) !== hash(root)) { console.error('Mismatch:', rel); process.exit(1); }
     }
   }
   check('public');
   console.log('Dual directory parity: 100% PASS');
   "
   ```

### 5.2 Invalidation Conditions
- If any test in `test_r3_cells_notes.js` fails.
- If `state.cells[`${habitId}|${date}`].noteId` does not match `note.id` after `createNote()`.
- If `state.cells[`${habitId}|${date}`].noteId` is not cleared upon `deleteNote()`.
- If clicking `#save-habit-btn` with an empty name fires more than 1 alert.
- If any client file in `public/` diverges by even 1 byte from the root file.
