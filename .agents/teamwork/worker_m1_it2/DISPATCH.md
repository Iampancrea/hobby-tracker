## 2026-11-13T07:20:01Z

You are the Worker for Iteration 2 of Milestone 1 (Shell, PWA Desktop Identity & Controls).
Working directory: d:\amol\projects\hobby tracker website
Your state folder: d:\amol\projects\hobby tracker website\.agents\teamwork\worker_m1_it2

MANDATORY INTEGRITY WARNING:
DO NOT CHEAT. All implementations must be genuine. DO NOT hardcode test results, create dummy/facade implementations, or circumvent the intended task. A teamwork_auditor will independently verify your work. Integrity violations WILL be detected and your work WILL be rejected.

MANDATORY INPUTS:
- Read ORIGINAL_REQUEST.md at: d:\amol\projects\hobby tracker website\.agents\teamwork\ORIGINAL_REQUEST.md
- Read PROJECT.md at: d:\amol\projects\hobby tracker website\PROJECT.md
- Read SCOPE.md at: d:\amol\projects\hobby tracker website\.agents\teamwork\sub_orch_m1\SCOPE.md
- Read Forensic Auditor Report at: d:\amol\projects\hobby tracker website\.agents\teamwork\auditor_m1_1\handoff.md
- Read Explorer it2 1 handoff at: d:\amol\projects\hobby tracker website\.agents\teamwork\explorer_m1_it2_1\handoff.md
- Read Explorer it2 2 handoff at: d:\amol\projects\hobby tracker website\.agents\teamwork\explorer_m1_it2_2\handoff.md
- Read Explorer it2 3 handoff at: d:\amol\projects\hobby tracker website\.agents\teamwork\explorer_m1_it2_3\handoff.md

WRITE OWNERSHIP:
You have exclusive write ownership of:
- `js/app.js` and `public/js/app.js`
- `tests/verify_m1.js`
- `tests/adversarial_m1.js`

DETAILED TASKS TO IMPLEMENT:
1. Canonical Document Title Contract Alignment:
   In `js/app.js:564-571`, update the `titles` dictionary inside `App.switchView(view)` to:
   ```javascript
   // Dynamic Document Title for Task Manager & Desktop Shell
   const titles = {
     habits: 'Habits — Hobby Tracker',
     tasks: 'Tasks — Hobby Tracker',
     diary: 'Diary — Hobby Tracker',
     settings: 'Settings — Hobby Tracker'
   };
   document.title = titles[view] || 'Hobby Tracker';
   ```
2. Dual Directory Sync:
   Copy `js/app.js` directly to `public/js/app.js` to ensure 100% byte-for-byte SHA256 parity.
3. Test Suite Alignment:
   - In `tests/verify_m1.js:129`, update the assertion to check for `'Habits — Hobby Tracker'`.
   - In `tests/adversarial_m1.js:410-415`, update the expected titles in Suite D to match the canonical contract (`'Habits — Hobby Tracker'`, `'Tasks — Hobby Tracker'`, `'Diary — Hobby Tracker'`, `'Settings — Hobby Tracker'`).
4. Verification & Official Test Runner Execution:
   Run and document the results of:
   - `node -c js/app.js public/js/app.js`
   - SHA-256 parity check across all 15 client files between `./` and `public/`
   - Official test runner: `node tests/runner.js --filter=r4` (must achieve 7 / 7 PASS)
   - `node tests/verify_m1.js`
   - `node tests/adversarial_m1.js`

OUTPUT:
Deliver your complete handoff report to `d:\amol\projects\hobby tracker website\.agents\teamwork\worker_m1_it2\handoff.md`.
Notify the orchestrator via send_message when complete.
