# Scope: Milestone 2 — Habits 30-Day Grid, Cell Marking, Notes & Bug Fixes

## Architecture & Code Layout
- Target files:
  - `js/views.js` & `public/js/views.js` (Grid generation, cell rendering, date formatting, habit color application, cell notes badges & tooltips, click handlers)
  - `js/storage.js` & `public/js/storage.js` (createNote / deleteNote cell linking, habit status toggle validation)
  - `js/app.js` & `public/js/app.js` (App.init() idempotency guard, event listeners, cell note interactions)
  - `css/style.css` & `public/css/style.css` (30-day grid styling, sticky labels, disabled future cell styling, cell note badges for default, love, discipline)
  - `index.html` & `public/index.html`
- Dual Directory Parity: Root and public/ directories are 100% byte-for-byte identical.

## Feature Inventory (Milestone 2)
| # | Feature | Description | Milestone | Source | Status |
|---|---------|-------------|-----------|--------|--------|
| 5 | Habits 30-Day Calendar Grid | Expand habits view from 11-day window to 30-day historical and current calendar grid (past 28 days + today + 1 tomorrow = 30 days) with sticky habit labels and horizontal scroll | M2 | R2 | DONE |
| 6 | Cell Marking & Future Dates | Standardize local date keys (YYYY-MM-DD); allow today (Nov 13) marking; disable future dates (Nov 14 onwards) with clear visual feedback (.disabled, pointer-events: none, cursor: not-allowed) and disallow toggling | M2 | R3 | DONE |
| 7 | Habit Color Picker | Apply custom habit color to icons (`style="color: ${habit.color}"`) and completed cells (`style="background-color: ${habit.color}"`); persist across reloads and edits | M2 | R3 | DONE |
| 8 | Alert Spam Fix | Add idempotency guard to App.init() (`if (this.initialized) return; this.initialized = true;`) to prevent stacking event listeners on #save-habit-btn; single alert on invalid name | M2 | R3 | DONE |
| 9 | Categorized Habit Cell Notes | Fix Storage.createNote & deleteNote to maintain `state.cells[`${habitId}|${date}`].noteId = note.id`; implement Default, Love, Discipline categories; render distinct visual badges (.cell-note-badge.badge-default, .badge-love, .badge-discipline) & tooltips; open notes via direct click and contextmenu | M2 | R3 | DONE |

## Interface Contracts
- `Views.getDatesAround(offset, pastDays = 28, futureDays = 1)` generates 30 contiguous dates in local YYYY-MM-DD.
- `Storage.createNote(noteData)`: accepts `{ habitId, date, type, text }`, links to `state.cells[`${habitId}|${date}`].noteId = note.id`.
- `Storage.deleteNote(id)`: deletes note from `state.notes` and unsets `noteId` in `state.cells`.
- `Storage.updateCell(habitId, date, updates)` & `Storage.setHabitStatus(habitId, date, status)`: blocks mutations if `date > todayStr`.
- `Habit Cell Marking`: cycles 'empty' -> 'done' -> 'missed' -> 'empty' on direct click.

## Milestones / Iteration Target
- Iteration 1:
  - Gate Result: **PASS** (Worker DONE, Reviewer 1 APPROVE, Reviewer 2 APPROVE, Challenger 1 APPROVE, Challenger 2 APPROVE, Forensic Auditor CLEAN).
  - All test suites passing 100% (`runner.js --filter=r3`, `--filter=notes`, `--filter=habits`, `tests/adversarial_m2.js`, `tests/adversarial_m2_challenger1.js`, `tests/adversarial_m2_challenger2.js`).
