# Scope: Milestone 3 (Diary Redesign, Date Picker Sidebar & Mood Selector)

## Architecture
- Diary View (`#view-diary`) in `index.html` and `public/index.html`.
- Diary rendering & navigation logic in `js/views.js` (and `public/js/views.js`).
- Event handlers, mood selection, autosave, and state integration in `js/app.js` (and `public/js/app.js`).
- Styling for calendar sidebar, month/year selectors, mood buttons, and responsive diary layout in `css/style.css` (and `public/css/style.css`).

## Feature Inventory
| # | Feature | Description | Milestone | Status |
|---|---------|-------------|-----------|--------|
| 1 | Calendar Navigation Sidebar | Left-hand calendar sidebar in `#view-diary` with interactive month and year selectors enabling jumping to arbitrary past dates/years | M3 | IN_PROGRESS |
| 2 | Calendar Cell Indicators | Day cells with active selection, today indicator, and indicators/dots for dates containing saved entries | M3 | IN_PROGRESS |
| 3 | Day Step Synchronization | `#prev-day` and `#next-day` buttons step dates forward/backward and synchronize active state in the calendar sidebar | M3 | IN_PROGRESS |
| 4 | Mood Selector Toggle & Persistence | Mood buttons toggle `.active` state exclusively, persist selected mood in `state.diary[date].mood`, and restore on date navigation | M3 | IN_PROGRESS |
| 5 | Diary Autosave & Data Integrity | Clean autosave on input/blur and when switching dates, preventing loss of written text/notes | M3 | IN_PROGRESS |
| 6 | Dual Directory Parity | Exact byte-for-byte parity between root and `public/` files | M3 | IN_PROGRESS |

## Milestones
| # | Name | Scope | Dependencies | Status |
|---|------|-------|-------------|--------|
| M3 | Diary Redesign, Date Picker Sidebar & Mood Selector | Full diary UI overhaul, calendar sidebar, mood selection, autosave | None | IN_PROGRESS |

## Interface Contracts
- `state.diary[date] = { text: string, mood?: string, updatedAt?: string }`
- Calendar sidebar selectors: Year selector dropdown/stepper, Month selector dropdown/stepper, calendar grid rendering days of selected month.
- Event listeners: `#prev-day`, `#next-day`, calendar cell clicks, mood button clicks (`.mood-btn`), diary text input/blur autosave.
