# Project: Hobby Tracker PWA Enhancement & Fixes

## Architecture
- **Client Stack**: Vanilla JavaScript (ES6+), HTML5, CSS3 with CSS variables, Service Worker (`sw.js`). No external frontend frameworks or bundlers.
- **Storage Layer**: Local-first IndexedDB (`HobbyTrackerVault` v1) with stores `kv` (auth config, sync config) and `state` (key `'main'`: habits, cells, notes, tasks, diary, quotes, tombstones).
- **Cryptography & Sync**: Web Crypto API (`AES-256-GCM` + `PBKDF2-SHA-256`, 100k iterations, 16-byte salt, 12-byte IV) client-side zero-knowledge encryption syncing to GitHub Private Gists (`hobby_tracker_vault.json.enc`).
- **Server & Serving**: Node.js built-in HTTP server (`server.js`) serving static files from `public/` and optional REST API. Root files serve GitHub Pages native branch deployment.
- **Dual Folder Discipline**: All client modifications must be synchronized identically across both root (`index.html`, `manifest.webmanifest`, `sw.js`, `css/`, `js/`, `icons/`) and `public/`.

## Feature Inventory
| # | Feature | Description | Milestone | Source |
|---|---------|-------------|-----------|--------|
| 1 | Top Header Quote Banner | Move motivational quote to permanent top header banner across all views | M1 | R4 |
| 2 | Button Cleanup | Remove redundant Exit button; retain full-width Lock Vault button | M1 | R4 |
| 3 | PWA Desktop Identity | Update manifest (id, scope, display_override, icon separation), meta tags, and dynamic document.title for Windows Task Manager | M1 | R4 |
| 4 | Dual Directory Parity | Synchronize root and public/ trees identically | M1 | Architecture Survey |
| 5 | Habits 30-Day Calendar Grid | Expand habits view from 11-day window to 30-day historical and current calendar grid | M2 | R2 |
| 6 | Cell Marking & Future Dates | Standardize local date keys; allow today (Nov 13) marking; disable future dates (Nov 14 onwards) with clear disabled visual styling | M2 | R3 |
| 7 | Habit Color Picker | Apply custom habit color to icons, badges, and completed cells in UI | M2 | R3 |
| 8 | Alert Spam Fix | Add idempotency guard to App.init() to eliminate duplicate alert popups on unlock | M2 | R3 |
| 9 | Categorized Habit Cell Notes | Fix cell.noteId linkage in storage; implement Default, Love, Discipline categories with distinct visual badges/indicators, reason tooltips, click and context menu | M2 | R3 |
| 10 | Diary Date Navigation Sidebar | Left sidebar calendar navigation supporting arbitrary past date jumping (months, past years) and day-by-day navigation | M3 | R1 |
| 11 | Diary Mood Selector | Add click listeners, visual active state toggling, and persistence of selected mood in diary entries | M3 | R1 |
| 12 | Diary Autosave & Integrity | Ensure entries and tasks load and save cleanly across all dates without loss | M3 | R1 |
| 13 | Revamped Dedicated Tasks View | Replace 2D calendar matrix with dedicated task checklist modeled on diary checklist with interactive checkboxes, task creation, and management | M4 | R2 |
| 14 | Task Filtering & Actions | Support active, completed, all task filtering and task status management | M4 | R2 |
| 15 | Encrypted Cloud Sync Interface | Cloud sync UI for backup and restore with zero plaintext exposure | M5 | R5 |
| 16 | PIN Key-Wrapping Fix | Wrap master password with PIN key so encrypted sync works when unlocked via PIN | M5 | R5 |
| 17 | Client-Side Encryption | AES-256-GCM zero-knowledge client-side encryption of habits, tasks, notes, diary entries before sync and encrypted backup export/import | M5 | R5 |
| 18 | E2E Testing Suite (Tiers 1-4) | Comprehensive opaque-box test suite verifying all requirements | E2E Track | All |
| 19 | Adversarial Coverage Hardening | White-box stress testing and edge-case validation | Final Milestone | All |
| 20 | Infinite Habit Timeline | Extend the horizontal habit grid by 21-day chunks as the user reaches either edge, with scroll anchoring, a visible date-range label, and a jump-to-date picker | M7 | UX Fix |
| 21 | Non-overlapping Collapsed Topbar | Replace the fixed floating expand button with an in-flow topbar so the menu control can never cover the quote banner | M7 | UX Fix |
| 22 | Local-time Calendar Correctness | Central `DateUtils` helpers keep today keys, streaks, diary navigation, and future-date checks aligned with the device's local calendar | M7 | UX Fix |
| 23 | Endless Diary Month/Year Navigation | Rebuild the year picker around the selected year so month navigation can continue indefinitely in both directions | M7 | UX Fix |

## Milestones
| # | Name | Scope | Dependencies | Status |
|---|------|-------|-------------|--------|
| M1 | Shell, PWA Desktop Identity & Controls | Quote banner relocation, Exit button removal, manifest & Task Manager title, dual folder parity | none | DONE |
| M2 | Habits 30-Day Grid, Cell Marking, Notes & Bug Fixes | 30-day grid, local date logic, future cell disabling, habit colors, alert spam fix, categorized cell notes | M1 | DONE |
| M3 | Diary Redesign, Date Picker Sidebar & Mood Selector | Left sidebar calendar navigation (past dates/years), mood selector click/visual/persistence, diary data integrity | M1 | IN_PROGRESS |
| M4 | Revamped Dedicated Tasks View | Dedicated task checklist modeled on diary checklist, interactive checkboxes, task management | M1 | PLANNED |
| M5 | Encrypted Cloud Sync & Cryptographic Fixes | PIN key-wrapping fix, encrypted sync interface, encrypted backup export/import, zero plaintext transmission | M1, M2, M3, M4 | PLANNED |
| E2E | E2E Test Suite Creation | Test infrastructure, automated runner, and test cases across Tiers 1-4 | none | DONE |
| M6 | Final Milestone: 100% E2E Pass & Adversarial Hardening | Phase 1: Pass 100% E2E tests (Tiers 1-4); Phase 2: Adversarial coverage hardening (Tier 5) | M1, M2, M3, M4, M5, E2E | PLANNED |
| M7 | UX, Timeline & Calendar Polish | Infinite habit timeline, non-overlapping collapsed topbar, local-time date consistency, endless diary year navigation | M1-M5 | DONE |

## Interface Contracts
### App Shell ↔ Views
- `Views.renderTopQuote()`: Global method called on state load and quote modifications. Populates `#top-quote-banner` blockquote and cite.
- `App.switchView(viewName)`: Toggles active view and updates `document.title` to `${ViewTitle} — Hobby Tracker`.
- `Auth.lockApp()`: Locks vault, switches to login screen, clears cached keys, sets `document.title = 'Hobby Tracker (Locked)'`.

### Storage ↔ Habits & Notes
- `Storage.createNote(noteData)`: Must accept `{ habitId, date, type, text }`. Must update `state.cells[`${habitId}|${date}`].noteId = note.id`. Returns created note.
- `Storage.deleteNote(id)`: Removes note from `state.notes` and clears `noteId` from any corresponding cell in `state.cells`.
- `Storage.setHabitStatus(habitId, date, status)`: Validates that `date <= todayStr` before setting status.
- `Views.renderHabits(options)`: Browser timeline renderer. `preserveScroll` keeps the date range and horizontal position after cell edits; `centerToday` scrolls today into view on first load. Without real layout (test DOM), it renders exactly 30 columns.
- `Views.scrollHabitGridToDate(dateKey)`: Centres any date in the habit timeline, rebuilding the range when the date lies outside the loaded window.
- `#habit-range-label` and `#habit-jump-date`: Show the loaded range and allow direct jumps; the range grows by 21-day chunks at either edge.
- `Habit Object`: `{ id, name, icon, color, archived, createdAt, updatedAt }`. Color must be rendered on `.habit-icon` and `.cell-status.done`.

### Storage ↔ Diary
- `state.diary[date]`: `{ entry: string, tasks: Array<{ title: string, status: string }>, mood: string|null, updatedAt: string }`.
- `Views.currentDiaryDate`: `YYYY-MM-DD` string in local time.
- `Views.renderDiaryCalendarSidebar()`: Renders left sidebar calendar allowing arbitrary month/year jumping and date selection.

### Storage ↔ Tasks
- `state.tasks`: Array of task items `{ id, title, status: 'pending'|'done', archived: boolean, createdAt, updatedAt }`.
- `Views.renderTasks()`: Renders vertical checklist with checkboxes, inline add, deletion, and filter controls.

### Auth ↔ Cryptographic Sync
- `Storage.loginWithPin(pin)`: Decrypts `auth.wrappedMasterKey` using PIN-derived key, sets `_cachedPassword` and `sessionStorage.setItem('ht_vault_key', password)` so sync functions under PIN unlock.
- `Sync.syncNow()`: Encrypts snapshot with AES-256-GCM using `Storage.getMasterPassword()`. Sends only encrypted envelope `{ version: 1, salt, iv, ciphertext, encryptedAt }` to private Gist.

## Code Layout
```
/ (Project Root)
├── index.html               # Main app shell & views container (mirrored in public/)
├── manifest.webmanifest     # PWA Web App Manifest (mirrored in public/)
├── manifest.json            # Fallback manifest link (mirrored in public/)
├── sw.js                    # Service Worker caching app shell (mirrored in public/)
├── server.js                # Built-in Node.js HTTP server & API
├── css/
│   └── style.css            # Global design tokens, layout & view styling (mirrored in public/)
├── js/
│   ├── app.js               # Event bindings, routing, view switching (mirrored in public/)
│   ├── auth.js              # Vault unlock, PIN, master password handling (mirrored in public/)
│   ├── views.js             # DOM rendering for habits, tasks, diary, settings (mirrored in public/)
│   ├── storage.js           # IndexedDB storage layer & data models (mirrored in public/)
│   ├── crypto.js            # Web Crypto API AES-GCM / PBKDF2 encryption (mirrored in public/)
│   ├── sync.js              # GitHub Gist encrypted cloud sync (mirrored in public/)
│   ├── api.js               # Storage wrapper facade (mirrored in public/)
│   └── util.js              # Date & DOM utility helpers (mirrored in public/)
├── public/                  # Exact mirror of root files served by server.js
├── tests/                   # E2E test suite and runner
│   ├── runner.js            # Automated test runner
│   ├── tier1_features/      # Tier 1 tests (>=5 per feature)
│   ├── tier2_boundaries/    # Tier 2 tests (boundary & corner cases)
│   ├── tier3_pairwise/      # Tier 3 tests (cross-feature interactions)
│   └── tier4_scenarios/     # Tier 4 tests (real-world workflows)
└── .agents/teamwork/        # Teamwork agent state directories
```
