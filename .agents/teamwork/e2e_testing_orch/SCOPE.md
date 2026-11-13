# Scope: E2E Testing Track

## Architecture
- **Target**: Hobby Tracker PWA client-side application (Vanilla JS, HTML5, CSS3, IndexedDB, Web Crypto, Service Worker).
- **Test Strategy**: Opaque-box requirement-driven testing.
- **Test Runner**: Node.js automated test runner (`tests/runner.js`) that runs all test tiers and outputs standardized TAP/console reports with exit code 0 on all pass, non-zero on failure.
- **Environment Simulation**: JSDOM or lightweight mock browser environment (DOM, localStorage, sessionStorage, crypto.subtle, indexedDB via fake-indexeddb or in-memory mock) to allow fast, deterministic, CI/CD-friendly execution of client code and E2E flows in Node.js.

## Feature Inventory
| # | Feature | Description | Milestone | Source |
|---|---------|-------------|-----------|--------|
| 1 | Top Header Quote Banner | Permanent quote banner in top header across all views | E2E-2, E2E-3 | R4 |
| 2 | Button Cleanup | Exit button removed, Lock button retained | E2E-2, E2E-3 | R4 |
| 3 | PWA Desktop Identity | Manifest standalone settings, window title sync | E2E-2, E2E-3 | R4 |
| 4 | Dual Directory Parity | Parity between root and public/ | E2E-2, E2E-3 | Arch |
| 5 | Habits 30-Day Grid | 30-day historical and current calendar grid | E2E-2, E2E-3 | R2 |
| 6 | Cell Marking & Future Dates | Allow today (Nov 13), disable future dates (Nov 14+) | E2E-2, E2E-3 | R3 |
| 7 | Habit Color Picker | Apply & persist custom habit colors | E2E-2, E2E-3 | R3 |
| 8 | Alert Spam Fix | Single alert trigger for invalid inputs | E2E-2, E2E-3 | R3 |
| 9 | Categorized Cell Notes | Default, Love, Discipline notes, badges, tooltips | E2E-2, E2E-3 | R3 |
| 10 | Diary Date Navigation Sidebar | Left calendar sidebar, arbitrary past date/year jump | E2E-2, E2E-3 | R1 |
| 11 | Diary Mood Selector | Active state toggle and mood persistence | E2E-2, E2E-3 | R1 |
| 12 | Diary Autosave & Integrity | Data integrity and persistence across dates | E2E-2, E2E-3 | R1 |
| 13 | Dedicated Tasks View | Dedicated checklist view modeled on diary tasks | E2E-2, E2E-3 | R2 |
| 14 | Task Filtering & Actions | Filter active/completed/all, manage tasks | E2E-2, E2E-3 | R2 |
| 15 | Encrypted Cloud Sync Interface | Zero-knowledge client encryption before sync | E2E-2, E2E-3 | R5 |
| 16 | Cross-Feature Interactions | Pairwise interactions between notes, diary, tasks, sync | E2E-4 | T3 |
| 17 | Real-World Workflows | Realistic user day-in-the-life scenarios | E2E-5 | T4 |

## Milestones
| # | Name | Scope | Dependencies | Status |
|---|------|-------|-------------|--------|
| E2E-1 | Test Infrastructure & Runner | TEST_INFRA.md, tests/runner.js, assertions, mock environment | none | IN_PROGRESS |
| E2E-2 | Tier 1 Feature Coverage Tests | >=25 tests covering all features in isolation | E2E-1 | PLANNED |
| E2E-3 | Tier 2 Boundary & Corner Tests | >=25 tests covering edge cases, dates, Unicode, errors | E2E-1 | PLANNED |
| E2E-4 | Tier 3 Cross-Feature Pairwise Tests | >=5 tests covering pairwise feature interactions | E2E-2, E2E-3 | PLANNED |
| E2E-5 | Tier 4 Real-World Application Scenarios | >=5 tests covering end-to-end user workflows | E2E-2, E2E-3 | PLANNED |
| E2E-6 | Full Suite Verification & TEST_READY.md | Run full test suite, verify pass/fail, publish TEST_READY.md | E2E-1, E2E-2, E2E-3, E2E-4, E2E-5 | PLANNED |

## Code Layout for Tests
```
tests/
├── runner.js                 # Central test runner executing all tiers
├── helpers/
│   ├── env.js                # DOM, Storage, Crypto, Mock environment setup
│   └── assert.js             # Assertion helper utilities
├── tier1_features/
│   ├── test_r1_diary.js      # Diary navigation & mood selector tests
│   ├── test_r2_habits_tasks.js # 30-day habits grid & dedicated tasks view tests
│   ├── test_r3_cells_notes.js  # Cell marking, color picker, alerts, cell notes tests
│   ├── test_r4_shell_pwa.js    # Quote banner, exit button, PWA identity tests
│   └── test_r5_crypto_sync.js  # Client-side encryption & sync interface tests
├── tier2_boundaries/
│   ├── test_boundary_diary.js
│   ├── test_boundary_habits.js
│   ├── test_boundary_notes.js
│   ├── test_boundary_tasks.js
│   └── test_boundary_crypto.js
├── tier3_pairwise/
│   ├── test_pairwise_notes_sync.js
│   ├── test_pairwise_diary_tasks.js
│   ├── test_pairwise_dates_mood.js
│   ├── test_pairwise_quote_views.js
│   └── test_pairwise_lock_crypto.js
└── tier4_scenarios/
    ├── test_scenario_daily_workflow.js
    ├── test_scenario_yearly_reflection.js
    ├── test_scenario_habit_recovery.js
    ├── test_scenario_offline_online_sync.js
    └── test_scenario_vault_security.js
```
