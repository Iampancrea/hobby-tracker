# Scope: Milestone 1 — Shell, PWA Desktop Identity & Controls

## Status: DONE

## Architecture
- Presentation Layer: HTML shell (`index.html`), Styles (`css/style.css`), UI Controllers (`js/views.js`, `js/app.js`, `js/auth.js`)
- PWA / Identity Layer: `manifest.webmanifest`, `manifest.json`, `sw.js`, `server.js` MIME registration
- Synchronization: 100% exact SHA-256 byte-for-byte parity across all 15 client files between `./` and `public/`

## Feature Inventory
| # | Feature | Description | Milestone | Status |
|---|---------|-------------|-----------|--------|
| 1 | Top Header Quote Banner | Moved quote to `#top-quote-banner` in `.main-content`. Rendered via decoupled `Views.renderTopQuote()` with caching and sanitization. | M1 | DONE |
| 2 | Button Cleanup | Removed redundant Exit button (`#logout-btn`), retained and styled Lock button (`#lock-btn`) for vault locking. Cleaned event listeners. | M1 | DONE |
| 3 | PWA Desktop Identity | Enhanced manifests (`manifest.webmanifest`, `manifest.json`) with `id: "hobby-tracker-pwa"`, `short_name: "Hobby Tracker"`, `scope`, `display_override`, separated any/maskable icon definitions. Added Windows meta tags to `<head>`. | M1 | DONE |
| 4 | Dynamic Document Titles | Configured `App.switchView` to dynamically set canonical document titles (`Habits — Hobby Tracker`, `Tasks — Hobby Tracker`, `Diary — Hobby Tracker`, `Settings — Hobby Tracker`) and `Auth.lockApp()` to set `Hobby Tracker (Locked)`. | M1 | DONE |
| 5 | Dual Directory Sync | 100% byte-for-byte SHA256 parity maintained across all 15 client files between root and `public/`. | M1 | DONE |

## Code Layout & Verified Files
- Modified client files (100% byte-for-byte identical in `./` and `public/`):
  - `index.html` <-> `public/index.html`
  - `manifest.webmanifest` <-> `public/manifest.webmanifest`
  - `manifest.json` <-> `public/manifest.json`
  - `sw.js` <-> `public/sw.js`
  - `css/style.css` <-> `public/css/style.css`
  - `js/app.js` <-> `public/js/app.js`
  - `js/views.js` <-> `public/js/views.js`
  - `js/auth.js` <-> `public/js/auth.js`
- Server file:
  - `server.js` (MIME type for `.webmanifest` registered)
- Verified test suites:
  - `node tests/runner.js --filter=r4` -> 7 / 7 PASS (100%)
  - `node tests/verify_m1.js` -> PASS (100%)
  - `node tests/adversarial_m1.js` -> 14 / 14 PASS (100%)
