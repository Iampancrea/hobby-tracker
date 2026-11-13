Enhance and fix the Hobby Tracker PWA: redesign the Diary view with a date-picker sidebar and fix mood selection, revamp Tasks into a dedicated task checklist, maintain Habits as a 30-day calendar grid with categorized cell notes, fix cell marking and color picker bugs, resolve duplicate alerts, move the motivational quote banner to the top header, remove the redundant Exit button, configure PWA standalone identity for Windows Task Manager, and implement encrypted cloud sync.

Working directory: d:\amol\projects\hobby tracker website
Integrity mode: development

## Requirements

### R1. Diary View Redesign, Date Navigation & Mood Selector
Redesign the Diary page to feature a calendar navigation sidebar on the left supporting direct date jumping to any arbitrary past date (e.g. jumping directly to August 25th of the previous year) as well as day-by-day forward and backward navigation. Fix the mood selector buttons so clicking a mood updates its active visual state and persists the selected mood with the diary entry for that date.

### R2. Habits 30-Day Calendar Grid & Revamped Dedicated Tasks View
Retain the Habits section as a 30-day historical and current calendar grid with a clean, modern aesthetic matching the application theme. Revamp the Tasks section into a dedicated task list view modeled after the today's tasks checklist in the diary, providing interactive checkboxes, task creation, and clean task management.

### R3. Cell Marking, Color Picker, Alert Spam & Categorized Cell Notes
Fix habit grid cell marking logic so that today's date (e.g., Friday Nov 13) can be checked and toggled without restriction, while future dates (e.g., Saturday Nov 14 onwards) remain disabled with clear visual feedback. Fix the habit color picker mechanism so custom colors are applied and persisted properly. Eliminate duplicate alert popups so messages like "please enter habit name" appear at most once per trigger. Implement full habit cell note functionality supporting Default, Love, and Discipline note categories, accessible via click, context menu, or drag-and-drop, and display distinct note badges/indicators on cells with notes.

### R4. Top Header Quote Banner, Button Cleanup & PWA Desktop Identity
Relocate the motivational quote into a permanent, prominent top header banner in the app shell, visible across all views. Remove the redundant Exit button in the bottom-left corner, retaining the Lock button for security lock functionality. Update the PWA manifest and desktop window configuration so the application runs with full standalone identity, proper window title, and visible recognition in Windows Task Manager.

### R5. Encrypted Cloud Sync
Implement an encrypted cloud sync feature in the Hobby Tracker that encrypts data (habits, tasks, notes, diary entries) client-side before syncing and decrypts upon retrieval, allowing users to securely back up and sync their data.

## Acceptance Criteria

### Diary Navigation & Mood Selector
- [ ] Diary page features a left sidebar calendar navigation allowing jumping directly to any chosen past date (including past years).
- [ ] Forward and backward navigation controls allow moving day by day through diary dates smoothly.
- [ ] Diary entries and notes load and save correctly for any selected date without data loss.
- [ ] Mood selector buttons visibly update their active selected state upon click and persist the selected mood on save and reload.

### Habits 30-Day Grid & Revamped Tasks View
- [ ] Habits view renders a 30-day historical and current calendar grid with a clean, modern design.
- [ ] Tasks section functions as a dedicated task checklist view modeled after the diary today's tasks, supporting interactive task completion and task management.

### Cell Interactions, Notes & Bug Fixes
- [ ] Marking today's date (Friday Nov 13) works reliably and persists across page reloads.
- [ ] Future dates cannot be marked and display clear disabled styling.
- [ ] Habit color picker updates habit colors in the UI and persists choices across reloads.
- [ ] "Please enter habit name" validation alert triggers exactly once when input is invalid.
- [ ] Cell notes can be created and edited on any cell with reason descriptions (e.g. missed habit explanations).
- [ ] Cell notes support Default, Love, and Discipline categories and render distinct visual badges/indicators on the habit cells.

### Shell Layout, Controls & PWA Identity
- [ ] The motivational quote is prominently displayed in the top header banner across all views.
- [ ] The redundant Exit button is removed, leaving the Lock button functioning to lock the vault.
- [ ] Web app manifest and desktop window configuration provide standalone app identity, name, icons, and appropriate window title visible in Windows Task Manager.

### Encrypted Cloud Sync
- [ ] An encrypted cloud sync interface is available in the application.
- [ ] All user data (habits, tasks, notes, diary entries) is encrypted client-side prior to sync transmission and decrypted upon sync retrieval.
- [ ] Sync operations succeed without exposing plaintext data to external endpoints.
