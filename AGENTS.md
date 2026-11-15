# AGENTS.md — Working Agreement

## What this project is

Hobby Tracker is a personal, offline-first habit tracker PWA for Windows and Android.
Its core features are intentional and must keep working:

- 30-day habit grid (infinite in both directions in the browser UI)
- Daily diary with mood, notes, and calendar navigation
- Dedicated tasks checklist
- Motivational quote banner
- Encrypted local storage and optional GitHub Gist sync
- Quick PIN / master-password unlock
- Installable offline PWA

## Permission and autonomy

You have broad permission to improve this app without asking first, including:

- Fixing bugs, crashes, broken layouts, date/time bugs, and accessibility issues
- Refining UI, styling, spacing, animations, responsiveness, and mobile/PWA behaviour
- Improving performance, code organization, and developer documentation
- Tightening data safety, validation, and error handling
- Making the experience feel smoother and more polished on both Windows and Android

Ask before doing any of the following:

- Adding a new creative or "useful" feature the user did not request
- Adding or removing a top-level view, workflow, or navigation concept
- Changing the stored data schema, encryption format, or sync protocol
- Adding frameworks, build tools, external services, or dependencies
- Redesigning the core purpose or scope of the app
- Deleting user data or changing default data in a destructive way
- Making large visual redesigns that replace the established identity

When in doubt about whether something is a "fix/polish" or a "new feature", ask.

## Technical guardrails

- Vanilla HTML, CSS, and JavaScript only. No build step and no framework.
- Keep the app fully usable offline.
- Keep all user-facing dates local-time based. Use `DateUtils` helpers; never use
  `toISOString().slice(0, 10)` for calendar-day keys.
- Future habit cells stay unmarkable; future dates may still be browsed.
- Root files and `public/` must remain byte-for-byte identical.
- Bump `CACHE_NAME` in `sw.js` when the shipped app shell changes.
- Keep the test harness contract intact: without browser layout, the habit grid
  must still render exactly 30 date columns so `getDatesAround(0, 28, 1)` and the
  existing tests remain valid. Infinite scrolling must only activate when a real
  layout width is available.
- Do not put plaintext user data into sync requests, exports, or logs.
- Use `confirm` before destructive actions, and preserve tombstones for sync.

## Workflow

1. Read the surrounding code before editing; match existing style and patterns.
2. Make focused changes rather than broad rewrites.
3. Run `node tests/runner.js` and keep all 75 tests passing.
4. Mirror changed root files into `public/` after edits.
5. Update `PROJECT.md` when architecture, features, or contracts change.
6. Explain what changed, why, and anything the user should verify on Windows and
   Android.

## Product defaults

- Prefer calm, uncluttered layouts with sensible density.
- Preserve the existing green primary colour and paper/journal diary identity.
- Keep touch targets usable on phones and keyboard/mouse interactions usable on
  Windows.
- The top-left menu control must never cover the quote banner.
- Calendar navigation should feel effectively endless in both directions.
