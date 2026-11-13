'use strict';

/**
 * Milestone 2 Challenger 1 Empirical Test Harness
 * 
 * Verifies:
 * 1. 30-Day Grid Geometry across extreme offsets (-365, -90, -30, 0, +30).
 * 2. Rapid cell status cycling, multi-habit/multi-date matrix stress & state persistence.
 * 3. Future date cell blocking (UI clicks & Storage API rejection for tomorrow, next week, next month, next year, 2099).
 * 4. Leap years (2024 leap day Feb 29 vs 2026 non-leap) and month/year boundaries (Dec 31 -> Jan 1, Apr 30 -> May 1).
 */

const fs = require('node:fs');
const path = require('node:path');
const assert = require('node:assert');
const { bootApp } = require('./helpers/env');

async function runChallenger1Suite() {
  console.log('======================================================================');
  console.log('  MILESTONE 2 — CHALLENGER 1 EMPIRICAL ADVERSARIAL HARNESS');
  console.log('======================================================================\n');

  let passed = 0;
  let failed = 0;
  const failureDetails = [];
  const evidenceLogs = [];

  function recordPass(testName, details = '') {
    passed++;
    console.log(`  ✓ [PASS] ${testName}${details ? ` (${details})` : ''}`);
  }

  function recordFail(testName, err) {
    failed++;
    console.error(`  ✗ [FAIL] ${testName}`);
    console.error(`         ${err.stack || err.message || err}`);
    failureDetails.push({ testName, error: err });
  }

  function logEvidence(section, msg) {
    evidenceLogs.push({ section, msg });
    console.log(`    [EVIDENCE - ${section}] ${msg}`);
  }

  // =========================================================================
  // SECTION 1: 30-DAY GRID GEOMETRY ACROSS EXTREME OFFSETS (-365, -90, -30, 0, +30)
  // =========================================================================
  console.log('--- SECTION 1: 30-Day Grid Geometry Across Extreme Offsets ---');

  const extremeOffsets = [-365, -90, -30, 0, 30];

  for (const offset of extremeOffsets) {
    try {
      const env = await bootApp({ systemDate: '2026-11-13' });
      await env.unlockVault('TestPassword123!');
      env.switchView('habits');

      const h1 = await env.Storage.createHabit({ name: `Offset ${offset} Alpha`, icon: '🌊', color: '#00bcd4' });
      const h2 = await env.Storage.createHabit({ name: `Offset ${offset} Beta`, icon: '⚡', color: '#ff9800' });

      env.Views.currentHabitDateOffset = offset;
      await env.Views.renderHabits();

      // 1. Check table structure
      const table = env.document.querySelector('#habit-grid table.calendar-table');
      assert.ok(table, `Calendar table must exist at offset ${offset}`);

      // 2. Date header count: exactly 30 date column headers
      const dateThs = Array.from(env.document.querySelectorAll('#habit-grid table thead th'))
        .filter(th => !th.classList.contains('habit-header'));
      assert.strictEqual(
        dateThs.length,
        30,
        `Offset ${offset}: Expected exactly 30 date headers, found ${dateThs.length}`
      );

      // 3. For each habit, verify exactly 30 cells in tbody row
      for (const h of [h1, h2]) {
        const row = env.document.querySelector(`.habit-row[data-habit-row="${h.id}"]`);
        assert.ok(row, `Habit row ${h.id} must exist`);

        const cells = env.document.querySelectorAll(`.day-cell[data-habit="${h.id}"]`);
        assert.strictEqual(
          cells.length,
          30,
          `Offset ${offset}: Habit ${h.id} must have exactly 30 day cells, found ${cells.length}`
        );

        // 4. Verify all 30 dates are valid YYYY-MM-DD and strictly contiguous (+1 day step)
        const cellDates = Array.from(cells).map(c => c.dataset.date);
        for (let i = 0; i < cellDates.length; i++) {
          const dStr = cellDates[i];
          assert.ok(/^\d{4}-\d{2}-\d{2}$/.test(dStr), `Date "${dStr}" must match YYYY-MM-DD format`);

          if (i > 0) {
            const prevUtc = new Date(cellDates[i - 1] + 'T00:00:00.000Z').getTime();
            const currUtc = new Date(dStr + 'T00:00:00.000Z').getTime();
            const dayDiff = Math.round((currUtc - prevUtc) / 86400000);
            assert.strictEqual(
              dayDiff,
              1,
              `Contiguity break at offset ${offset}: ${cellDates[i - 1]} -> ${dStr} (diff: ${dayDiff})`
            );
          }
        }

        // 5. Verify offset-specific state invariants
        if (offset === 30) {
          // At +30 days, every date in the 30-day window is in December 2026/January 2027 (future)
          // All 30 cells must be disabled
          const disabledCount = Array.from(cells).filter(c => c.classList.contains('disabled')).length;
          assert.strictEqual(
            disabledCount,
            30,
            `Offset +30: All 30 cells must be disabled for future dates, found ${disabledCount}`
          );
        } else if (offset === -365) {
          // At -365 days, every date is in late 2025 (strictly past). None should be disabled.
          const disabledCount = Array.from(cells).filter(c => c.classList.contains('disabled')).length;
          assert.strictEqual(
            disabledCount,
            0,
            `Offset -365: All 30 cells must be past dates (0 disabled), found ${disabledCount}`
          );
        } else if (offset === 0) {
          // At offset 0: exactly 28 days past + today (index 28) + 1 tomorrow (index 29)
          const disabledCount = Array.from(cells).filter(c => c.classList.contains('disabled')).length;
          assert.strictEqual(
            disabledCount,
            1,
            `Offset 0: Exactly 1 tomorrow cell must be disabled, found ${disabledCount}`
          );

          const todayCell = Array.from(cells).find(c => c.dataset.date === '2026-11-13');
          assert.ok(todayCell && !todayCell.classList.contains('disabled'), 'Today cell (2026-11-13) must not be disabled');
          assert.ok(todayCell.classList.contains('today-cell'), 'Today cell must have .today-cell class');

          const tomorrowCell = Array.from(cells).find(c => c.dataset.date === '2026-11-14');
          assert.ok(tomorrowCell && tomorrowCell.classList.contains('disabled'), 'Tomorrow cell (2026-11-14) must be disabled');
        }
      }

      logEvidence(
        'GridGeometry',
        `Offset ${offset.toString().padStart(4, ' ')}: 30 columns [${dateThs[0].dataset.date} to ${dateThs[29].dataset.date}], strictly contiguous, correct disabled flags`
      );
      env.teardown();
      recordPass(`1. Grid Geometry at offset ${offset}`, `Range: ${dateThs[0].dataset.date}..${dateThs[29].dataset.date}`);
    } catch (err) {
      recordFail(`1. Grid Geometry at offset ${offset}`, err);
    }
  }

  // =========================================================================
  // SECTION 2: CELL MARKING RAPID CYCLING, MATRIX STRESS & PERSISTENCE
  // =========================================================================
  console.log('\n--- SECTION 2: Cell Marking Rapid Cycling, Matrix Stress & Persistence ---');

  // Test 2.1: Multi-cycle rapid status rotation on today cell
  try {
    const env = await bootApp({ systemDate: '2026-11-13' });
    await env.unlockVault('TestPassword123!');
    env.switchView('habits');

    const habit = await env.Storage.createHabit({ name: 'Rapid Clicker', icon: '⚡', color: '#ff5722' });
    await env.Views.renderHabits();

    const todayStr = '2026-11-13';
    const cellSelector = `.day-cell[data-habit="${habit.id}"][data-date="${todayStr}"]`;

    // 15 rapid clicks = 5 full cycles of (empty -> done -> missed -> empty)
    for (let clickIndex = 1; clickIndex <= 15; clickIndex++) {
      const cell = env.document.querySelector(cellSelector);
      assert.ok(cell, `Cell must be present before click ${clickIndex}`);
      env.click(cell);
      await new Promise(r => setTimeout(r, 10));

      const expectedPhase = clickIndex % 3;
      const expectedStatus = expectedPhase === 1 ? 'done' : expectedPhase === 2 ? 'missed' : 'empty';

      const rawState = await env.Storage.getRawState();
      const currentStatus = rawState.cells[`${habit.id}|${todayStr}`]?.status || 'empty';
      assert.strictEqual(
        currentStatus,
        expectedStatus,
        `Click ${clickIndex}: Expected status "${expectedStatus}", got "${currentStatus}"`
      );

      // Verify DOM reflects status
      const updatedCell = env.document.querySelector(cellSelector);
      const statusEl = updatedCell.querySelector('.cell-status');
      assert.ok(statusEl, 'Status indicator element must exist in cell DOM');
      assert.ok(
        statusEl.classList.contains(expectedStatus),
        `DOM status element must have class "${expectedStatus}" at click ${clickIndex}`
      );
      if (expectedStatus === 'done') {
        assert.strictEqual(statusEl.textContent, '✓');
        assert.ok(statusEl.getAttribute('style').includes(habit.color));
      } else if (expectedStatus === 'missed') {
        assert.strictEqual(statusEl.textContent, '✗');
      }
    }

    logEvidence('Cycling', 'Executed 15 rapid consecutive clicks cycling 5 complete rotations (empty -> done -> missed -> empty) with 100% DOM and storage synchronization');
    env.teardown();
    recordPass('2.1: Rapid status cycling across 15 clicks (5 full rotations)');
  } catch (err) {
    recordFail('2.1: Rapid status cycling', err);
  }

  // Test 2.2: Matrix stress — 5 habits x 5 historical dates = 25 distinct cells
  try {
    const env = await bootApp({ systemDate: '2026-11-13' });
    await env.unlockVault('TestPassword123!');
    env.switchView('habits');

    const habitList = [];
    const colors = ['#e91e63', '#9c27b0', '#2196f3', '#4caf50', '#ff9800'];
    const icons = ['🎨', '🧘', '💧', '🥗', '🏃'];

    for (let i = 0; i < 5; i++) {
      const h = await env.Storage.createHabit({
        name: `Matrix Habit ${i + 1}`,
        icon: icons[i],
        color: colors[i]
      });
      habitList.push(h);
    }

    const testDates = ['2026-11-13', '2026-11-12', '2026-11-10', '2026-11-05', '2026-10-25'];
    await env.Views.renderHabits();

    // Map each cell (h, d) to clicks = ((h + d) % 3) + 1:
    // clicks 1 -> done, clicks 2 -> missed, clicks 3 -> empty
    for (let hIdx = 0; hIdx < 5; hIdx++) {
      for (let dIdx = 0; dIdx < 5; dIdx++) {
        const hid = habitList[hIdx].id;
        const dt = testDates[dIdx];
        const numClicks = ((hIdx + dIdx) % 3) + 1;

        for (let c = 0; c < numClicks; c++) {
          const cell = env.document.querySelector(`.day-cell[data-habit="${hid}"][data-date="${dt}"]`);
          assert.ok(cell, `Cell for ${hid}|${dt} must exist in grid`);
          env.click(cell);
          await new Promise(r => setTimeout(r, 6));
        }
      }
    }

    // Verify all 25 cells in storage
    const finalState = await env.Storage.getRawState();
    let checkedCount = 0;

    for (let hIdx = 0; hIdx < 5; hIdx++) {
      for (let dIdx = 0; dIdx < 5; dIdx++) {
        const hid = habitList[hIdx].id;
        const dt = testDates[dIdx];
        const numClicks = ((hIdx + dIdx) % 3) + 1;
        const expected = numClicks === 1 ? 'done' : numClicks === 2 ? 'missed' : 'empty';

        const storedStatus = finalState.cells[`${hid}|${dt}`]?.status || 'empty';
        assert.strictEqual(
          storedStatus,
          expected,
          `Cell [${hIdx},${dIdx}] (${hid}|${dt}) expected status "${expected}", got "${storedStatus}"`
        );
        checkedCount++;
      }
    }

    // Reload state and re-verify persistence from disk/IndexedDB
    await env.Views.loadState();
    for (let hIdx = 0; hIdx < 5; hIdx++) {
      for (let dIdx = 0; dIdx < 5; dIdx++) {
        const hid = habitList[hIdx].id;
        const dt = testDates[dIdx];
        const numClicks = ((hIdx + dIdx) % 3) + 1;
        const expected = numClicks === 1 ? 'done' : numClicks === 2 ? 'missed' : 'empty';

        const viewCell = env.Views.state.cells[`${hid}|${dt}`];
        const viewStatus = (viewCell && viewCell.status) || 'empty';
        assert.strictEqual(viewStatus, expected, `Persisted state mismatch on reload for ${hid}|${dt}`);
      }
    }

    logEvidence('MatrixStress', `Successfully cycled and verified 25 cells (5 habits x 5 dates) with reload persistence`);
    env.teardown();
    recordPass('2.2: Matrix stress cycling (5 habits x 5 dates = 25 cells)', `${checkedCount}/25 cells verified`);
  } catch (err) {
    recordFail('2.2: Matrix stress cycling', err);
  }

  // =========================================================================
  // SECTION 3: FUTURE DATE CELL BLOCKING (UI CLICKS & STORAGE API REJECTIONS)
  // =========================================================================
  console.log('\n--- SECTION 3: Future Date Cell Blocking ---');

  // Test 3.1: UI click rejection for future dates in default grid & future offset grid
  try {
    const env = await bootApp({ systemDate: '2026-11-13' });
    await env.unlockVault('TestPassword123!');
    env.switchView('habits');

    const habit = await env.Storage.createHabit({ name: 'Sentinel Habit', icon: '🛡️', color: '#673ab7' });
    await env.Views.renderHabits();

    // 1. In default grid, tomorrow is 2026-11-14
    const tomorrowCell = env.document.querySelector(`.day-cell[data-habit="${habit.id}"][data-date="2026-11-14"]`);
    assert.ok(tomorrowCell, 'Tomorrow cell must exist in default grid');
    assert.ok(tomorrowCell.classList.contains('disabled'), 'Tomorrow cell must have .disabled class');
    assert.ok(tomorrowCell.hasAttribute('disabled'), 'Tomorrow cell must have disabled attribute');

    // Attempt UI click
    env.click(tomorrowCell);
    await new Promise(r => setTimeout(r, 15));

    let state = await env.Storage.getRawState();
    let cellRecord = state.cells[`${habit.id}|2026-11-14`];
    assert.ok(
      !cellRecord || cellRecord.status === 'empty',
      'UI click on tomorrow cell must be blocked from mutating status'
    );

    // 2. In +30 offset grid (all dates in future)
    env.Views.currentHabitDateOffset = 30;
    await env.Views.renderHabits();

    const futureCells = env.document.querySelectorAll(`.day-cell[data-habit="${habit.id}"]`);
    assert.strictEqual(futureCells.length, 30);

    for (const fc of Array.from(futureCells).slice(0, 10)) {
      const fDate = fc.dataset.date;
      assert.ok(fDate > '2026-11-13', `Date ${fDate} must be future`);
      assert.ok(fc.classList.contains('disabled'), `Future date cell ${fDate} must have .disabled class`);

      env.click(fc);
      await new Promise(r => setTimeout(r, 10));

      state = await env.Storage.getRawState();
      cellRecord = state.cells[`${habit.id}|${fDate}`];
      assert.ok(
        !cellRecord || cellRecord.status === 'empty',
        `UI click on future cell ${fDate} must be rejected`
      );
    }

    logEvidence('FutureUI', 'Verified UI clicks on tomorrow and 10 future cells in +30 grid are completely rejected');
    env.teardown();
    recordPass('3.1: Future date UI click rejection');
  } catch (err) {
    recordFail('3.1: Future date UI click rejection', err);
  }

  // Test 3.2: Direct Storage API strict rejection across future date horizons
  try {
    const env = await bootApp({ systemDate: '2026-11-13' });
    await env.unlockVault('TestPassword123!');

    const habit = await env.Storage.createHabit({ name: 'API Guard Habit', icon: '🔒', color: '#009688' });

    const horizons = [
      { name: 'tomorrow', date: '2026-11-14' },
      { name: 'next week', date: '2026-11-20' },
      { name: 'next month', date: '2026-12-15' },
      { name: 'next year', date: '2027-11-13' },
      { name: 'year 2099', date: '2099-01-01' }
    ];

    const restrictedStatuses = ['done', 'missed'];

    for (const horizon of horizons) {
      for (const st of restrictedStatuses) {
        // Vector A: Storage.setHabitStatus
        let setStatusError = null;
        try {
          await env.Storage.setHabitStatus(habit.id, horizon.date, st);
        } catch (err) {
          setStatusError = err;
        }
        assert.ok(setStatusError, `Storage.setHabitStatus must throw for ${horizon.name} (${horizon.date}) with status "${st}"`);
        assert.strictEqual(
          setStatusError.message,
          'Cannot set status for future dates',
          `Error message must be "Cannot set status for future dates"`
        );

        // Vector B: Storage.updateCell
        let updateCellError = null;
        try {
          await env.Storage.updateCell(habit.id, horizon.date, { status: st });
        } catch (err) {
          updateCellError = err;
        }
        assert.ok(updateCellError, `Storage.updateCell must throw for ${horizon.name} (${horizon.date}) with status "${st}"`);
        assert.strictEqual(
          updateCellError.message,
          'Cannot set status for future dates'
        );

        // Vector C: API.updateCell
        let apiError = null;
        try {
          await env.API.updateCell(habit.id, horizon.date, { status: st });
        } catch (err) {
          apiError = err;
        }
        assert.ok(apiError, `API.updateCell must throw for ${horizon.name} (${horizon.date}) with status "${st}"`);
        assert.strictEqual(
          apiError.message,
          'Cannot set status for future dates'
        );
      }

      // Safe clearance: status 'empty' on future cell must NOT throw
      const cleared = await env.Storage.updateCell(habit.id, horizon.date, { status: 'empty' });
      assert.strictEqual(cleared.status, 'empty');
    }

    logEvidence('FutureAPI', 'Tested 5 future horizons against done and missed across Storage.setHabitStatus, Storage.updateCell, and API.updateCell (all 30 rejection attempts threw strictly)');
    env.teardown();
    recordPass('3.2: Storage & API future date strict rejection (5 horizons x 2 statuses x 3 methods = 30 rejections)');
  } catch (err) {
    recordFail('3.2: Storage & API future date strict rejection', err);
  }

  // =========================================================================
  // SECTION 4: LEAP YEARS & MONTH BOUNDARY TRANSITIONS
  // =========================================================================
  console.log('\n--- SECTION 4: Leap Years & Month Boundaries ---');

  // Test 4.1: Leap Year 2024 — System Date 2024-03-01
  try {
    const env = await bootApp({ systemDate: '2024-03-01' });
    await env.unlockVault('TestPassword123!');
    env.switchView('habits');

    const habit = await env.Storage.createHabit({ name: 'Leap Year Habit', icon: '🐸', color: '#4caf50' });
    await env.Views.renderHabits();

    const dateHeaders = Array.from(env.document.querySelectorAll('#habit-grid table thead th'))
      .filter(th => !th.classList.contains('habit-header'))
      .map(th => th.dataset.date);

    assert.strictEqual(dateHeaders.length, 30, 'Leap year grid must render exactly 30 columns');
    assert.ok(dateHeaders.includes('2024-02-29'), '2024-02-29 (leap day) MUST exist in 2024 30-day window');
    assert.ok(dateHeaders.includes('2024-02-28'), '2024-02-28 must exist');
    assert.ok(dateHeaders.includes('2024-03-01'), '2024-03-01 must exist');

    const idx28 = dateHeaders.indexOf('2024-02-28');
    const idx29 = dateHeaders.indexOf('2024-02-29');
    const idx01 = dateHeaders.indexOf('2024-03-01');
    assert.strictEqual(idx29, idx28 + 1, 'Feb 29 must immediately follow Feb 28');
    assert.strictEqual(idx01, idx29 + 1, 'March 1 must immediately follow Feb 29');

    // Feb 29, 2024 is in past relative to March 1, 2024: must be markable
    const feb29Cell = env.document.querySelector(`.day-cell[data-habit="${habit.id}"][data-date="2024-02-29"]`);
    assert.ok(feb29Cell, 'Feb 29 cell must exist in grid');
    assert.ok(!feb29Cell.classList.contains('disabled'), 'Past leap day Feb 29 must not be disabled');

    env.click(feb29Cell);
    await new Promise(r => setTimeout(r, 15));

    const state = await env.Storage.getRawState();
    assert.strictEqual(state.cells[`${habit.id}|2024-02-29`]?.status, 'done', 'Feb 29 past cell can be marked done');

    logEvidence('LeapYear', 'Leap year 2024: Feb 28 -> Feb 29 -> March 1 sequence contiguous, Feb 29 past cell successfully marked');
    env.teardown();
    recordPass('4.1: Leap Year 2024 Feb 29 sequence & past marking');
  } catch (err) {
    recordFail('4.1: Leap Year 2024 Feb 29 sequence & past marking', err);
  }

  // Test 4.2: Leap Day as Today (2024-02-29)
  try {
    const env = await bootApp({ systemDate: '2024-02-29' });
    await env.unlockVault('TestPassword123!');
    env.switchView('habits');

    const habit = await env.Storage.createHabit({ name: 'Leap Today Habit', icon: '🎂', color: '#e91e63' });
    await env.Views.renderHabits();

    const todayCell = env.document.querySelector(`.day-cell[data-habit="${habit.id}"][data-date="2024-02-29"]`);
    assert.ok(todayCell, 'Feb 29 today cell must exist');
    assert.ok(todayCell.classList.contains('today-cell'), 'Feb 29 must have .today-cell class');
    assert.ok(!todayCell.classList.contains('disabled'), 'Feb 29 today must not be disabled');

    // Tomorrow is 2024-03-01 -> must be disabled!
    const tomorrowCell = env.document.querySelector(`.day-cell[data-habit="${habit.id}"][data-date="2024-03-01"]`);
    assert.ok(tomorrowCell, 'March 1 tomorrow cell must exist');
    assert.ok(tomorrowCell.classList.contains('disabled'), 'March 1 tomorrow cell must be disabled');

    // Mark today (Feb 29)
    env.click(todayCell);
    await new Promise(r => setTimeout(r, 15));

    let state = await env.Storage.getRawState();
    assert.strictEqual(state.cells[`${habit.id}|2024-02-29`]?.status, 'done', 'Feb 29 today can be marked done');

    // Attempt to mark tomorrow (March 1)
    env.click(tomorrowCell);
    await new Promise(r => setTimeout(r, 15));

    state = await env.Storage.getRawState();
    assert.ok(!state.cells[`${habit.id}|2024-03-01`] || state.cells[`${habit.id}|2024-03-01`].status === 'empty');

    logEvidence('LeapToday', 'When system date is Feb 29: today is interactive, tomorrow March 1 is strictly disabled');
    env.teardown();
    recordPass('4.2: Leap Day as Today (2024-02-29) & March 1 tomorrow blocking');
  } catch (err) {
    recordFail('4.2: Leap Day as Today', err);
  }

  // Test 4.3: Non-Leap Year 2026 — System Date 2026-03-01
  try {
    const env = await bootApp({ systemDate: '2026-03-01' });
    await env.unlockVault('TestPassword123!');
    env.switchView('habits');

    await env.Storage.createHabit({ name: 'Standard Feb Habit', icon: '📆', color: '#ff5722' });
    await env.Views.renderHabits();

    const dateHeaders = Array.from(env.document.querySelectorAll('#habit-grid table thead th'))
      .filter(th => !th.classList.contains('habit-header'))
      .map(th => th.dataset.date);

    assert.strictEqual(dateHeaders.length, 30, 'Non-leap year grid must render exactly 30 columns');
    assert.ok(dateHeaders.includes('2026-02-28'), '2026-02-28 must exist');
    assert.ok(dateHeaders.includes('2026-03-01'), '2026-03-01 must exist');
    assert.ok(!dateHeaders.includes('2026-02-29'), '2026-02-29 MUST NOT exist in non-leap year 2026');

    const idx28 = dateHeaders.indexOf('2026-02-28');
    const idx01 = dateHeaders.indexOf('2026-03-01');
    assert.strictEqual(idx01, idx28 + 1, '2026-03-01 must immediately follow 2026-02-28');

    logEvidence('NonLeap', 'Non-leap year 2026: Feb 28 connects directly to March 1 with 0 spurious leap days');
    env.teardown();
    recordPass('4.3: Non-Leap Year 2026 transition Feb 28 -> March 1 with zero Feb 29');
  } catch (err) {
    recordFail('4.3: Non-Leap Year 2026 transition', err);
  }

  // Test 4.4: Year Rollover (Dec 31, 2026 -> Jan 1, 2027) & Cross-Year Streak
  try {
    const env = await bootApp({ systemDate: '2027-01-01' });
    await env.unlockVault('TestPassword123!');
    env.switchView('habits');

    const habit = await env.Storage.createHabit({ name: 'Cross Year Habit', icon: '🎆', color: '#9c27b0' });
    await env.Views.renderHabits();

    const dateHeaders = Array.from(env.document.querySelectorAll('#habit-grid table thead th'))
      .filter(th => !th.classList.contains('habit-header'))
      .map(th => th.dataset.date);

    assert.strictEqual(dateHeaders.length, 30, 'Year rollover grid must render exactly 30 columns');
    assert.ok(dateHeaders.includes('2026-12-31'), '2026-12-31 must exist in 30-day window for 2027-01-01');
    assert.ok(dateHeaders.includes('2027-01-01'), '2027-01-01 (today) must exist');
    assert.ok(dateHeaders.includes('2027-01-02'), '2027-01-02 (tomorrow) must exist');

    const idxDec31 = dateHeaders.indexOf('2026-12-31');
    const idxJan01 = dateHeaders.indexOf('2027-01-01');
    assert.strictEqual(idxJan01, idxDec31 + 1, '2027-01-01 must immediately follow 2026-12-31');

    // Header label formatting check
    const fmtDec = env.Views.formatDate('2026-12-31');
    const fmtJan = env.Views.formatDate('2027-01-01');
    assert.strictEqual(fmtDec.month, 'Dec');
    assert.strictEqual(fmtDec.dayNum, 31);
    assert.strictEqual(fmtJan.month, 'Jan');
    assert.strictEqual(fmtJan.dayNum, 1);

    // Cross-year streak: 2026-12-30 (done), 2026-12-31 (done), 2027-01-01 (done)
    await env.Storage.setHabitStatus(habit.id, '2026-12-30', 'done');
    await env.Storage.setHabitStatus(habit.id, '2026-12-31', 'done');
    await env.Storage.setHabitStatus(habit.id, '2027-01-01', 'done');
    await env.Views.loadState();

    const streak = env.Views.calculateStreak(habit.id);
    assert.strictEqual(streak, 3, `Cross-year streak across Dec 30, 31, Jan 1 must be 3, got ${streak}`);

    logEvidence('YearRollover', 'Year rollover Dec 31, 2026 -> Jan 1, 2027 renders seamless sequence, accurate month/day labels, and cross-year streak = 3');
    env.teardown();
    recordPass('4.4: Year Rollover Dec 31 -> Jan 1 & cross-year streak');
  } catch (err) {
    recordFail('4.4: Year Rollover Dec 31 -> Jan 1', err);
  }

  // Test 4.5: 30-Day Month Transition (April 30 -> May 1)
  try {
    const env = await bootApp({ systemDate: '2026-05-01' });
    await env.unlockVault('TestPassword123!');
    env.switchView('habits');

    await env.Storage.createHabit({ name: 'May Day Habit', icon: '🌸', color: '#e91e63' });
    await env.Views.renderHabits();

    const dateHeaders = Array.from(env.document.querySelectorAll('#habit-grid table thead th'))
      .filter(th => !th.classList.contains('habit-header'))
      .map(th => th.dataset.date);

    assert.strictEqual(dateHeaders.length, 30);
    assert.ok(dateHeaders.includes('2026-04-30'), 'April 30 must exist');
    assert.ok(dateHeaders.includes('2026-05-01'), 'May 1 must exist');
    assert.ok(!dateHeaders.includes('2026-04-31'), 'April 31 must NOT exist (April has 30 days)');

    const idxApr30 = dateHeaders.indexOf('2026-04-30');
    const idxMay01 = dateHeaders.indexOf('2026-05-01');
    assert.strictEqual(idxMay01, idxApr30 + 1, 'May 1 must immediately follow April 30');

    logEvidence('MonthBoundary', 'April 30 -> May 1 transitions cleanly without fictitious April 31');
    env.teardown();
    recordPass('4.5: 30-Day Month Transition (April 30 -> May 1)');
  } catch (err) {
    recordFail('4.5: 30-Day Month Transition', err);
  }

  // =========================================================================
  // SECTION 5: DUAL DIRECTORY PARITY VERIFICATION
  // =========================================================================
  console.log('\n--- SECTION 5: Dual Directory Parity Verification ---');

  try {
    const crypto = require('node:crypto');
    function sha256(filePath) {
      return crypto.createHash('sha256').update(fs.readFileSync(filePath)).digest('hex');
    }

    const targetFiles = [
      'js/views.js',
      'js/storage.js',
      'js/app.js',
      'css/style.css',
      'index.html'
    ];

    for (const rel of targetFiles) {
      const rootPath = path.resolve(rel);
      const pubPath = path.resolve('public', rel);

      assert.ok(fs.existsSync(rootPath), `Root file ${rel} must exist`);
      assert.ok(fs.existsSync(pubPath), `Public file public/${rel} must exist`);

      const rootHash = sha256(rootPath);
      const pubHash = sha256(pubPath);

      assert.strictEqual(
        rootHash,
        pubHash,
        `File parity divergence detected in ${rel}! Root ${rootHash} !== Public ${pubHash}`
      );
      logEvidence('Parity', `${rel.padEnd(16, ' ')} -> ${rootHash.slice(0, 16)}... (100% MATCH)`);
    }

    recordPass('5.1: 100% Dual-Directory Parity across root and public/ targets');
  } catch (err) {
    recordFail('5.1: Dual-Directory Parity', err);
  }

  // =========================================================================
  // FINAL VERDICT
  // =========================================================================
  console.log('\n======================================================================');
  console.log('  CHALLENGER 1 EMPIRICAL RESULTS & VERDICT');
  console.log('======================================================================');
  console.log(`  PASSED:   ${passed}`);
  console.log(`  FAILED:   ${failed}`);
  console.log(`  TOTAL:    ${passed + failed}`);
  console.log(`  VERDICT:  ${failed === 0 ? 'APPROVE' : 'REJECT'}`);
  console.log('======================================================================\n');

  return {
    passed,
    failed,
    failureDetails,
    evidenceLogs,
    verdict: failed === 0 ? 'APPROVE' : 'REJECT'
  };
}

if (require.main === module) {
  runChallenger1Suite()
    .then(res => {
      process.exit(res.failed === 0 ? 0 : 1);
    })
    .catch(err => {
      console.error('Fatal suite runner error:', err);
      process.exit(1);
    });
}

module.exports = { runChallenger1Suite };
