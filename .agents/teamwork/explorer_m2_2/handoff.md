# Milestone 2 Investigation Report: Habit Color Picker & Alert Spam Fix

## 1. Observation

### 1.1 Alert Spam Root Cause
- **Direct observation in `js/auth.js`**:
  Line 225-232:
  ```javascript
  showApp() {
    document.getElementById('login-screen').style.display = 'none';
    document.getElementById('app').style.display = 'flex';
    App.init();

    // Trigger initial background sync on unlock
    Sync.syncNow({ background: true });
  }
  ```
  `Auth.showApp()` is called on:
  - Initial unlock when launch check is complete (`js/auth.js:88`)
  - Successful PIN unlock (`js/auth.js:150`)
  - Successful password setup (`js/auth.js:185`)
  - Successful password unlock (`js/auth.js:192`)
  Every time a user locks the app (`Auth.lockApp()` at line 215) and unlocks again, `Auth.showApp()` invokes `App.init()`.

- **Direct observation in `js/app.js`**:
  Lines 5-7:
  ```javascript
  const App = {
    currentViewName: 'habits',

    async init() {
      await Views.loadState();
      Views.renderTopQuote();
  ```
  There is **no guard flag** (e.g. `this.initialized`) in `App.init()`.
  Further down in `App.init()`, lines 397-407:
  ```javascript
  // Habit Modal
  document.getElementById('save-habit-btn').addEventListener('click', async () => {
    const modal = document.getElementById('habit-modal');
    const habitId = modal.dataset.habitId;
    const name = document.getElementById('habit-name').value.trim();
    const icon = document.getElementById('habit-icon').value || '●';
    const color = document.getElementById('habit-color').value;

    if (!name) {
      alert('Please enter a habit name');
      return;
    }
  ```
  Every execution of `App.init()` attaches a new anonymous event listener to `#save-habit-btn` (as well as `#save-task-btn`, `#save-note-btn`, `#delete-habit-btn`, `#archive-habit-btn`, nav buttons, and sync listeners).
  Because the element is retained in the DOM and listeners are anonymous functions, the listeners accumulate.

- **Verbatim Test Failure**:
  Running `node tests/runner.js --filter=r3` produced:
  ```text
  ✗ T1-R3-04: Alert spam fix triggers validation alert exactly once (128ms)
    Error: Validation alert must trigger exactly once, but triggered 3 times: [Please enter a habit name, Please enter a habit name, Please enter a habit name]

  3 !== 1
  ```
  In test `T1-R3-04` (`tests/tier1_features/test_r3_cells_notes.js:103-137`):
  Initial unlock + 2 lock/unlock cycles = 3 calls to `App.init()`, producing 3 stacked click listeners and 3 alerts on a single click of `#save-habit-btn`.

---

### 1.2 Habit Color Picker Disconnect
- **Direct observation in `index.html` (and `public/index.html`)**:
  Lines 390-394:
  ```html
  <div class="input-group">
    <label for="habit-color">Color</label>
    <input type="color" id="habit-color" value="#3fa34d">
  </div>
  ```
  The color picker `<input type="color" id="habit-color">` exists in `#habit-modal`.

- **Direct observation in `js/app.js` (and `public/js/app.js`)**:
  Lines 402, 411-414:
  ```javascript
  const color = document.getElementById('habit-color').value;
  ...
  if (habitId) {
    await API.updateHabit(habitId, { name, icon, color });
  } else {
    await API.createHabit({ name, icon, color });
  }
  ```
  The selected color is sent to `API.createHabit` or `API.updateHabit`.

- **Direct observation in `js/storage.js` (and `public/js/storage.js`)**:
  Lines 275-299:
  ```javascript
  async createHabit(habitData) {
    const state = await this.getState();
    const now = new Date().toISOString();
    const habit = {
      id: 'h_' + Date.now() + '_' + Math.random().toString(36).substr(2, 6),
      name: habitData.name,
      icon: habitData.icon || '●',
      color: habitData.color || '#3fa34d',
      archived: false,
      createdAt: now,
      updatedAt: now
    };
    state.habits.push(habit);
    await this.saveRawState(state);
    return habit;
  }
  ```
  The color property is saved in `state.habits`. However, if invalid hex values or empty strings are passed, there is no validation/normalization (relevant to `tests/tier2_boundaries/test_boundary_notes.js:63-94` T2-R3-02).

- **Direct observation in `js/views.js` (and `public/js/views.js`)**:
  Lines 118-124 (Habit Label):
  ```javascript
  // Habit label
  const streak = this.calculateStreak(habit.id);
  html += `<td class="habit-label">
    <div class="habit-label-content">
      <span class="habit-icon">${habit.icon}</span>
      <span class="habit-name">${this.escapeHtml(habit.name)}</span>
      ${streak > 0 ? `<span class="streak-badge">${streak}</span>` : ''}
    </div>
  </td>`;
  ```
  Notice: `<span class="habit-icon">${habit.icon}</span>` has **no color styling** applied. `habit.color` is completely unused.

  Lines 139-146 (Completed Cells):
  ```javascript
  html += `<td class="${todayClass}">
    <div class="day-cell" data-habit="${habit.id}" data-date="${date}">
      <div class="day-cell-content">
        <div class="cell-status ${status}">${statusIcon}</div>
        ${hasNote ? '<div class="cell-note-indicator"></div>' : ''}
      </div>
    </div>
  </td>`;
  ```
  Notice: `<div class="cell-status ${status}">${statusIcon}</div>` has **no inline color styling**.

- **Direct observation in `css/style.css` (and `public/css/style.css`)**:
  Lines 462-466:
  ```css
  .habit-icon {
    font-size: 18px;
    width: 24px;
    text-align: center;
  }
  ```
  Lines 520-522:
  ```css
  .cell-status.done {
    background: var(--done);
  }
  ```
  Because no inline styles or dynamic CSS variables are passed, `.cell-status.done` always falls back to the default green (`var(--done)`).

- **Direct observation in `openHabitModal` (`js/views.js:315-347`)**:
  ```javascript
  if (habitId) {
    const habit = this.state.habits.find(h => h.id === habitId);
    if (!habit) return;
    
    title.textContent = 'Edit Habit';
    nameInput.value = habit.name;
    iconInput.value = habit.icon;
    colorInput.value = habit.color;
    ...
  ```
  If `habit.color` is nullish or malformed, `colorInput.value` fails silently or blanks.
  Additionally, clicking on a habit's label or icon does not open `openHabitModal(habit.id)`; currently, editing is only reachable via cell context menu (`js/views.js:267`).

---

### 1.3 Dual Directory Structure Status
- Run `git diff --no-index js/app.js public/js/app.js`: Exit code 0, 0 bytes difference.
- Run `git diff --no-index js/views.js public/js/views.js`: Exit code 0, 0 bytes difference.
- Run `git diff --no-index js/storage.js public/js/storage.js`: Exit code 0, 0 bytes difference.
- Run `git diff --no-index css/style.css public/css/style.css`: Exit code 0, 0 bytes difference.
- Run `git diff --no-index index.html public/index.html`: Exit code 0, 0 bytes difference.
All files in root and `public/` are currently in **100% lockstep parity**.

---

## 2. Logic Chain

1. **Step 1: Alert Spam Invalidation**:
   - `Auth.showApp()` is called on every vault unlock.
   - `Auth.showApp()` unconditionally invokes `App.init()`.
   - `App.init()` attaches event listeners directly to elements (`#save-habit-btn`) each invocation without removing previous listeners or checking if it has already run.
   - Therefore, after $k$ unlocks, exactly $k$ event listeners fire per button click, resulting in $k$ identical `alert("Please enter a habit name")` calls.
   - By introducing an idempotency guard:
     ```javascript
     if (this.initialized) {
       this.refreshCurrentView();
       return;
     }
     this.initialized = true;
     ```
     DOM listeners are attached only once during the lifetime of the page, while subsequent unlocks reliably refresh state and UI without stacking listeners.

2. **Step 2: Habit Color Picker Disconnect**:
   - User chooses a color in `<input type="color" id="habit-color">`.
   - The hex value is sent through `API.createHabit({ color })` / `API.updateHabit(id, { color })` and stored in `state.habits[i].color`.
   - In `Views.renderHabits()`, the rendering templates omit `habit.color` from both `.habit-icon` and `.cell-status.done`.
   - As a result, the browser displays default text color for `.habit-icon` and `var(--done)` for `.cell-status.done`.
   - By adding:
     - `style="color: ${habitColor};"` to `<span class="habit-icon">`
     - `style="background-color: ${habitColor}; border-color: ${habitColor};"` to `<div class="cell-status done">`
     The chosen color is rendered immediately and persisted across reloads.

3. **Step 3: State Freshness in `Views.renderHabits()`**:
   - When tests or actions create or update a habit in `Storage`, `Views.state` must reflect the change.
   - Having `Views.renderHabits()` call `await this.loadState()` at its start guarantees that newly created habits or color changes are immediately available in `this.state` without requiring manual caller reload.

4. **Step 4: Boundary Hex Fallbacks (T2-R3-02)**:
   - `tests/tier2_boundaries/test_boundary_notes.js:63-94` asserts that:
     - Empty color `''` falls back to `#3fa34d`
     - Invalid strings `'not-a-color'` fall back to `#3fa34d`
     - 3-character hex `'#123'` normalizes to a valid 6-character hex (`#112233`) matching `/^#[0-9a-fA-F]{6}$/`.
   - Adding a color sanitizer in `Storage` satisfies this boundary requirement and prevents invalid CSS injection.

---

## 3. Caveats

1. **Date Key Co-dependency**:
   - Explorer 1 is investigating the 30-day grid and local date generation. The completed cell color logic depends on matching `cell.status === 'done'`. As long as `cellKey` uses standard `${habit.id}|${date}`, color application operates independently of date window size.
2. **Note Badges & Tooltips**:
   - Explorer 3 is investigating categorized cell notes. Completed cells that also have a note indicator should retain the note badge (`.cell-note-badge`). Setting `background-color` on `.cell-status.done` does not interfere with child badge elements.
3. **No Unbinding Needed on Lock**:
   - Because the DOM elements inside `#app` remain in place and are merely hidden (`display: none`) while `#login-screen` is visible, keeping listeners bound once is completely safe and avoids unnecessary tear-down and re-registration overhead.

---

## 4. Conclusion & Concrete Recommendations for Worker

### 4.1 Changes to `js/app.js` (and `public/js/app.js`)

#### Recommendation 1: Idempotency Guard in `App.init()`
At line 2:
```javascript
// BEFORE (lines 2-7):
const App = {
  currentViewName: 'habits',

  async init() {
    await Views.loadState();
    Views.renderTopQuote();

// AFTER:
const App = {
  currentViewName: 'habits',
  initialized: false,

  async init() {
    await Views.loadState();
    Views.renderTopQuote();

    // Idempotency guard: prevent duplicate event listeners on multiple unlock cycles
    if (this.initialized) {
      this.refreshCurrentView();
      return;
    }
    this.initialized = true;
```

#### Recommendation 2: Habit Name Validation Alert
Verify lines 404-407 remain intact:
```javascript
      if (!name) {
        alert('Please enter a habit name');
        return;
      }
```
This triggers exactly once per save attempt with an empty habit name.

---

### 4.2 Changes to `js/views.js` (and `public/js/views.js`)

#### Recommendation 1: State Reload at Start of `renderHabits()`
At line 90:
```javascript
// BEFORE (lines 90-94):
  async renderHabits() {
    const grid = document.getElementById('habit-grid');
    const showArchived = document.getElementById('show-archived-habits').checked;
    const habits = showArchived ? this.state.habits : this.state.habits.filter(h => !h.archived);

// AFTER:
  async renderHabits() {
    await this.loadState();
    const grid = document.getElementById('habit-grid');
    const showArchived = document.getElementById('show-archived-habits')?.checked || false;
    const habits = showArchived ? (this.state.habits || []) : (this.state.habits || []).filter(h => !h.archived);
```

#### Recommendation 2: Habit Icon and Completed Cell Color Rendering
In `Views.renderHabits()`, lines 113-150:
```javascript
// BEFORE:
    habits.forEach(habit => {
      html += `<tr>`;
      
      // Habit label
      const streak = this.calculateStreak(habit.id);
      html += `<td class="habit-label">
        <div class="habit-label-content">
          <span class="habit-icon">${habit.icon}</span>
          <span class="habit-name">${this.escapeHtml(habit.name)}</span>
          ${streak > 0 ? `<span class="streak-badge">${streak}</span>` : ''}
        </div>
      </td>`;

      // Date cells
      dates.forEach(date => {
        const cellKey = `${habit.id}|${date}`;
        const cell = this.state.cells[cellKey] || {};
        const status = cell.status || 'empty';
        const hasNote = !!cell.noteId;
        const todayClass = date === today ? 'today-cell' : '';
        
        let statusIcon = '';
        if (status === 'done') statusIcon = '✓';
        else if (status === 'missed') statusIcon = '✗';
        else if (status === 'empty') statusIcon = '';

        html += `<td class="${todayClass}">
          <div class="day-cell" data-habit="${habit.id}" data-date="${date}">
            <div class="day-cell-content">
              <div class="cell-status ${status}">${statusIcon}</div>
              ${hasNote ? '<div class="cell-note-indicator"></div>' : ''}
            </div>
          </div>
        </td>`;
      });

// AFTER:
    habits.forEach(habit => {
      const habitColor = habit.color || '#3fa34d';
      html += `<tr class="habit-row" data-habit-id="${habit.id}">`;
      
      // Habit label
      const streak = this.calculateStreak(habit.id);
      html += `<td class="habit-label" data-habit="${habit.id}">
        <div class="habit-label-content" style="cursor: pointer;" title="Click to edit habit">
          <span class="habit-icon" style="color: ${habitColor};">${habit.icon || '●'}</span>
          <span class="habit-name">${this.escapeHtml(habit.name)}</span>
          ${streak > 0 ? `<span class="streak-badge">${streak}</span>` : ''}
        </div>
      </td>`;

      // Date cells
      dates.forEach(date => {
        const cellKey = `${habit.id}|${date}`;
        const cell = (this.state.cells && this.state.cells[cellKey]) || {};
        const status = cell.status || 'empty';
        const hasNote = !!cell.noteId;
        const todayClass = date === today ? 'today-cell' : '';
        
        let statusIcon = '';
        let doneStyle = '';
        if (status === 'done') {
          statusIcon = '✓';
          doneStyle = `style="background-color: ${habitColor}; border-color: ${habitColor};"`;
        } else if (status === 'missed') {
          statusIcon = '✗';
        } else if (status === 'empty') {
          statusIcon = '';
        }

        html += `<td class="${todayClass}">
          <div class="day-cell" data-habit="${habit.id}" data-date="${date}">
            <div class="day-cell-content">
              <div class="cell-status ${status}" ${doneStyle}>${statusIcon}</div>
              ${hasNote ? '<div class="cell-note-indicator"></div>' : ''}
            </div>
          </div>
        </td>`;
      });
```

#### Recommendation 3: Habit Label Click to Open Edit Modal
In `Views.renderHabits()`, immediately after `grid.innerHTML = html;` (lines 154+):
```javascript
    // Habit label click to edit habit
    grid.querySelectorAll('.habit-label').forEach(label => {
      label.addEventListener('click', () => {
        const habitId = label.dataset.habit;
        if (habitId) this.openHabitModal(habitId);
      });
    });
```

#### Recommendation 4: Edit Habit Modal Color Input Loading
In `Views.openHabitModal(habitId = null)` at line 331:
```javascript
// BEFORE (line 331):
      colorInput.value = habit.color;

// AFTER:
      colorInput.value = habit.color || '#3fa34d';
```

---

### 4.3 Changes to `js/storage.js` (and `public/js/storage.js`)

#### Recommendation: Color Hex Sanitizer and Normalizer
Add helper method in `Storage`:
```javascript
  _sanitizeColor(color) {
    if (!color || typeof color !== 'string') return '#3fa34d';
    color = color.trim();
    if (/^#[0-9a-fA-F]{6}$/.test(color)) return color;
    if (/^#[0-9a-fA-F]{3}$/.test(color)) {
      return '#' + color[1] + color[1] + color[2] + color[2] + color[3] + color[3];
    }
    return '#3fa34d';
  },
```
And in `Storage.createHabit(habitData)`:
```javascript
      color: this._sanitizeColor(habitData.color),
```
And in `Storage.updateHabit(id, updates)`:
```javascript
    if ('color' in updates) {
      updates.color = this._sanitizeColor(updates.color);
    }
```

---

### 4.4 Changes to `css/style.css` (and `public/css/style.css`)

Ensure `.habit-icon` and `.cell-status.done` support dynamic colors cleanly:
```css
.habit-icon {
  font-size: 18px;
  width: 24px;
  text-align: center;
  display: inline-flex;
  align-items: center;
  justify-content: center;
  transition: color 0.15s ease;
}

.cell-status.done {
  background: var(--done);
  color: #ffffff;
  border: 2px solid transparent;
}
```

---

## 5. Verification Method

### 5.1 Test Execution
Run the automated test runner:
```bash
node tests/runner.js --filter=r3
```
This directly tests:
1. `T1-R3-03: Habit color picker persists custom color and renders in UI`
   - Confirms `.habit-icon` receives custom color (`#e91e63`).
   - Confirms custom color persists in storage.
2. `T1-R3-04: Alert spam fix triggers validation alert exactly once`
   - Verifies 2 lock/unlock cycles followed by empty habit save triggers exactly 1 alert instead of 3.
3. `T2-R3-02: Invalid Habit Color Hex Fallback`
   - Run: `node tests/runner.js --filter=test_boundary_notes.js`
   - Verifies empty color, non-hex strings, and 3-char hex normalize safely to `#3fa34d` or 6-char hex.
4. `T2-R3-03: Repeated Clicks on Empty Habit Save`
   - Verifies 10 rapid clicks produce exactly 10 alerts without cascading queueing.

### 5.2 Dual Directory Parity Verification
Verify exact parity after changes:
```bash
git diff --no-index js/app.js public/js/app.js
git diff --no-index js/views.js public/js/views.js
git diff --no-index js/storage.js public/js/storage.js
git diff --no-index css/style.css public/css/style.css
```
All diffs must produce 0 output.

### 5.3 Invalidation Conditions
- If `env.spies.alerts.length > 1` in `T1-R3-04`, the idempotency guard was bypassed or placed after listener registration.
- If `appliedColor` does not include `customColor` in `T1-R3-03`, inline style was not applied to `.habit-icon`.
