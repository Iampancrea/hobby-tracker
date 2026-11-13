## Task Assignment
Milestone: E2E-3 - Tier 3 Cross-Feature & Tier 4 Real-World Application Scenario Tests
Role: Integration & Scenario Test Builder
Working Directory: d:\amol\projects\hobby tracker website
State Folder: d:\amol\projects\hobby tracker website\.agents\teamwork\teamwork_worker_tier3_4

Files Owned Exclusively:
- tests/tier3_pairwise/test_pairwise_notes_sync.js
- tests/tier3_pairwise/test_pairwise_diary_tasks.js
- tests/tier3_pairwise/test_pairwise_dates_mood.js
- tests/tier3_pairwise/test_pairwise_quote_views.js
- tests/tier3_pairwise/test_pairwise_lock_crypto.js
- tests/tier4_scenarios/test_scenario_daily_workflow.js
- tests/tier4_scenarios/test_scenario_yearly_reflection.js
- tests/tier4_scenarios/test_scenario_habit_recovery.js
- tests/tier4_scenarios/test_scenario_offline_online_sync.js
- tests/tier4_scenarios/test_scenario_vault_security.js

Reference Materials:
- ORIGINAL_REQUEST.md: d:\amol\projects\hobby tracker website\.agents\teamwork\ORIGINAL_REQUEST.md
- PROJECT.md: d:\amol\projects\hobby tracker website\PROJECT.md
- TEST_INFRA.md: d:\amol\projects\hobby tracker website\TEST_INFRA.md
- Test Harness: tests/helpers/env.js and tests/helpers/assert.js
- Runner: tests/runner.js
- Existing Tier 1 Tests for reference: tests/tier1_features/

Objectives:
Implement all 5 Tier 3 Pairwise tests and 5 Tier 4 Real-World Application Scenario tests per TEST_INFRA.md:
Tier 3 (Pairwise):
1. `tests/tier3_pairwise/test_pairwise_notes_sync.js`: Categorized notes (Default, Love, Discipline) preserved through encrypted sync.
2. `tests/tier3_pairwise/test_pairwise_diary_tasks.js`: Diary today's tasks vs Dedicated tasks checklist operational independence.
3. `tests/tier3_pairwise/test_pairwise_dates_mood.js`: Multi-date jumping and independent mood persistence across dates/years.
4. `tests/tier3_pairwise/test_pairwise_quote_views.js`: Top quote banner consistency across view switches and vault lock.
5. `tests/tier3_pairwise/test_pairwise_lock_crypto.js`: PIN quick-unlock key wrapping and encrypted cloud sync execution.

Tier 4 (Scenarios):
1. `tests/tier4_scenarios/test_scenario_daily_workflow.js`: Complete day-in-the-life user workflow (unlock -> quote -> mark habit -> note -> task checklist -> diary reflection & mood -> cloud sync -> lock).
2. `tests/tier4_scenarios/test_scenario_yearly_reflection.js`: Historical year jump to August 25th of previous year, entry update, day-by-day stepping, return to today.
3. `tests/tier4_scenarios/test_scenario_habit_recovery.js`: 30-day habit tracking with missed days, Love/Discipline notes, badges, color picker update, streak recovery.
4. `tests/tier4_scenarios/test_scenario_offline_online_sync.js`: Multi-device sync simulation (Device A creates & syncs, Device B pulls & decrypts, Device A offline edit & sync, Device B syncs).
5. `tests/tier4_scenarios/test_scenario_vault_security.js`: Vault security lifecycle (setup -> data -> password change & re-encryption -> old password fails -> new password unlocks -> PIN unlocks -> encrypted backup export -> wipe -> import restore).

Verify execution via:
`node tests/runner.js --tier=3`
`node tests/runner.js --tier=4`
Ensure all tests run cleanly without hanging.
Write handoff.md and notify when complete.


## 2026-11-13T07:10:15Z
You are a Worker for Milestone E2E-3 (Tier 3 Cross-Feature & Tier 4 Real-World Application Scenario Tests).
Working directory: d:\amol\projects\hobby tracker website
State folder: d:\amol\projects\hobby tracker website\.agents\teamwork\teamwork_worker_tier3_4
Read the authoritative request at: d:\amol\projects\hobby tracker website\.agents\teamwork\ORIGINAL_REQUEST.md
Read the project architecture and feature inventory at: d:\amol\projects\hobby tracker website\PROJECT.md
Read the test infrastructure specification at: d:\amol\projects\hobby tracker website\TEST_INFRA.md
Read your task assignment at: d:\amol\projects\hobby tracker website\.agents\teamwork\teamwork_worker_tier3_4\DISPATCH.md
Read the existing test runner and helpers at:
- tests/runner.js
- tests/helpers/env.js
- tests/helpers/assert.js
- tests/tier1_features/ (for established test patterns and DSL)

Write ownership:
You exclusively own and may create/modify the following files:
- tests/tier3_pairwise/test_pairwise_notes_sync.js
- tests/tier3_pairwise/test_pairwise_diary_tasks.js
- tests/tier3_pairwise/test_pairwise_dates_mood.js
- tests/tier3_pairwise/test_pairwise_quote_views.js
- tests/tier3_pairwise/test_pairwise_lock_crypto.js
- tests/tier4_scenarios/test_scenario_daily_workflow.js
- tests/tier4_scenarios/test_scenario_yearly_reflection.js
- tests/tier4_scenarios/test_scenario_habit_recovery.js
- tests/tier4_scenarios/test_scenario_offline_online_sync.js
- tests/tier4_scenarios/test_scenario_vault_security.js
DO NOT modify application source code (files in js/, css/, or index.html). You are building the opaque-box test track.
