'use strict';

/**
 * Adversarial Stress & Verification Harness for Milestone 2
 * Habits 30-Day Grid, Cell Marking, Notes & Bug Fixes
 */

const fs = require('node:fs');
const path = require('node:path');
const crypto = require('node:crypto');
const { bootApp } = require('./helpers/env');
const assert = require('node:assert');

async function runAdversarialM2Suite() {
  console.log('======================================================================');
  console.log('  MILESTONE 2 ADVERSARIAL STRESS & EMPIRICAL CHALLENGE SUITE');
  console.log('======================================================================\n');

  let passed = 0;
  let failed = 0;
  const failureDetails = [];
  const edgeCaseFindings = [];

  function recordPass(testName) {
    passed++;
    console.log(`  [PASS] ${testName}`);
  }

  function recordFail(testName, err) {
    failed++;
    console.error(`  [FAIL] ${testName}`);
    console.error(`         ${err.message || err}`);
    failureDetails.push({ testName, error: err });
  }

  function recordFinding(category, finding) {
    edgeCaseFindings.push({ category, finding });
    console.log(`  [NOTE] [${category}] ${finding}`);
  }

  // -------------------------------------------------------------------------
  // SUITE A: 30-Day Grid Geometry & Date Shift Boundaries
  // -------------------------------------------------------------------------
  console.log('--- SUITE A: 30-Day Grid Geometry & Date Boundaries ---');

  try {
    const env = await bootApp({ systemDate: '2026-11-13' });
    await env.unlockVault('TestPassword123!');
    env.switchView('habits');

    const habit = await env.Storage.createHabit({ name: 'Geometry Habit', icon: '📐' });
    await env.Views.renderHabits();

    const dates = env.Views.getDatesAround(0, 28, 1);
    assert.strictEqual(dates.length, 30, 'Default getDatesAround must return exactly 30 dates');
    assert.strictEqual(dates[28], '2026-11-13', 'Date index 28 must be today (2026-11-13)');
    assert.strictEqual(dates[29], '2026-11-14', 'Date index 29 must be tomorrow (2026-11-14)');

    // Verify DOM column count
    const dateHeaders = env.document.querySelectorAll('#habit-grid table thead th:not(.habit-header), #habit-grid th.day-header');
    assert.strictEqual(dateHeaders.length, 30, 'Habit grid rendered table must contain exactly 30 date headers');

    const habitCells = env.document.querySelectorAll(`.day-cell[data-habit="${habit.id}"]`);
    assert.strictEqual(habitCells.length, 30, 'Habit row must render exactly 30 day cells');

    env.teardown();
    recordPass('A1: Default 30-day geometry renders exactly 30 columns (28 past + 1 today + 1 tomorrow)');
  } catch (err) {
    recordFail('A1: Default 30-day geometry verification', err);
  }

  try {
    const env = await bootApp({ systemDate: '2026-11-13' });
    await env.unlockVault('TestPassword123!');
    env.switchView('habits');
    await env.Storage.createHabit({ name: 'Shift Habit', icon: '⚡' });

    for (const offset of [-7, -30, -365, 7]) {
      env.Views.currentHabitDateOffset = offset;
      await env.Views.renderHabits();
      const headers = env.document.querySelectorAll('#habit-grid th.day-header');
      assert.strictEqual(headers.length, 30, `Grid at offset ${offset} must render exactly 30 day headers`);
    }

    env.teardown();
    recordPass('A2: Offset shifts (-7, -30, -365, +7) maintain exact 30-column contiguous count');
  } catch (err) {
    recordFail('A2: Offset shifts verification', err);
  }

  // -------------------------------------------------------------------------
  // SUITE B: Cell Marking, Direct Cycling & Future Date Security
  // -------------------------------------------------------------------------
  console.log('\n--- SUITE B: Cell Marking & Future Date Security ---');

  try {
    const env = await bootApp({ systemDate: '2026-11-13' });
    await env.unlockVault('TestPassword123!');
    env.switchView('habits');

    const habit = await env.Storage.createHabit({ name: 'Cycling Test', icon: '🚴' });
    await env.Views.renderHabits();

    const todayStr = '2026-11-13';
    const cellSelector = `.day-cell[data-habit="${habit.id}"][data-date="${todayStr}"]`;

    // Click 1: empty -> done
    env.click(env.document.querySelector(cellSelector));
    await new Promise(r => setTimeout(r, 20));
    let cellRecord = (await env.Storage.getRawState()).cells[`${habit.id}|${todayStr}`];
    assert.strictEqual(cellRecord.status, 'done', 'Click 1 must set status to done');

    // Click 2: done -> missed
    await env.Views.renderHabits();
    env.click(env.document.querySelector(cellSelector));
    await new Promise(r => setTimeout(r, 20));
    cellRecord = (await env.Storage.getRawState()).cells[`${habit.id}|${todayStr}`];
    assert.strictEqual(cellRecord.status, 'missed', 'Click 2 must set status to missed');

    // Click 3: missed -> empty
    await env.Views.renderHabits();
    env.click(env.document.querySelector(cellSelector));
    await new Promise(r => setTimeout(r, 20));
    cellRecord = (await env.Storage.getRawState()).cells[`${habit.id}|${todayStr}`];
    assert.strictEqual(cellRecord.status, 'empty', 'Click 3 must set status to empty');

    // Click 4: empty -> done (second cycle)
    await env.Views.renderHabits();
    env.click(env.document.querySelector(cellSelector));
    await new Promise(r => setTimeout(r, 20));
    cellRecord = (await env.Storage.getRawState()).cells[`${habit.id}|${todayStr}`];
    assert.strictEqual(cellRecord.status, 'done', 'Click 4 must set status to done again');

    env.teardown();
    recordPass('B1: Direct cell click cycling cycles empty -> done -> missed -> empty -> done seamlessly');
  } catch (err) {
    recordFail('B1: Direct cell click cycling', err);
  }

  try {
    const env = await bootApp({ systemDate: '2026-11-13' });
    await env.unlockVault('TestPassword123!');
    env.switchView('habits');

    const habit = await env.Storage.createHabit({ name: 'Future Security', icon: '🔒' });
    await env.Views.renderHabits();

    const tomorrowStr = '2026-11-14';
    const tomorrowCell = env.document.querySelector(`.day-cell[data-habit="${habit.id}"][data-date="${tomorrowStr}"]`);
    assert.ok(tomorrowCell, 'Tomorrow cell must exist in DOM');
    assert.ok(tomorrowCell.classList.contains('disabled'), 'Tomorrow cell must have .disabled class');

    // Click in DOM must be ignored
    env.click(tomorrowCell);
    await new Promise(r => setTimeout(r, 20));
    let rawState = await env.Storage.getRawState();
    let cellData = rawState.cells[`${habit.id}|${tomorrowStr}`];
    assert.ok(!cellData || cellData.status === 'empty', 'Click on tomorrow cell must be rejected');

    // Storage updateCell with status 'done' must throw
    let threw = false;
    try {
      await env.Storage.updateCell(habit.id, tomorrowStr, { status: 'done' });
    } catch (e) {
      threw = true;
      assert.strictEqual(e.message, 'Cannot set status for future dates');
    }
    assert.ok(threw, 'Storage.updateCell must throw on future date status done');

    // Storage updateCell with status 'missed' must throw
    threw = false;
    try {
      await env.Storage.updateCell(habit.id, tomorrowStr, { status: 'missed' });
    } catch (e) {
      threw = true;
      assert.strictEqual(e.message, 'Cannot set status for future dates');
    }
    assert.ok(threw, 'Storage.updateCell must throw on future date status missed');

    // Storage updateCell with status 'empty' must succeed
    const emptyUpdate = await env.Storage.updateCell(habit.id, tomorrowStr, { status: 'empty' });
    assert.strictEqual(emptyUpdate.status, 'empty', 'Setting empty status on future date should succeed');

    env.teardown();
    recordPass('B2: Future date security enforced at both DOM and Storage layers');
  } catch (err) {
    recordFail('B2: Future date security enforcement', err);
  }

  // -------------------------------------------------------------------------
  // SUITE C: Habit Custom Colors & Hex Sanitization
  // -------------------------------------------------------------------------
  console.log('\n--- SUITE C: Habit Custom Colors & Hex Sanitization ---');

  try {
    const env = await bootApp({ systemDate: '2026-11-13' });
    await env.unlockVault('TestPassword123!');

    // 1. Valid 6-character hex
    const h1 = await env.Storage.createHabit({ name: 'Hex6', color: '#ff5722' });
    assert.strictEqual(h1.color, '#ff5722');

    // 2. 3-character hex shorthand expansion
    const h2 = await env.Storage.createHabit({ name: 'Hex3', color: '#03f' });
    assert.strictEqual(h2.color, '#0033ff');

    // 3. Fallback on invalid hex strings
    const h3 = await env.Storage.createHabit({ name: 'InvalidHex', color: '#12345' });
    assert.strictEqual(h3.color, '#3fa34d');

    const h4 = await env.Storage.createHabit({ name: 'NonHex', color: 'blue' });
    assert.strictEqual(h4.color, '#3fa34d');

    const h5 = await env.Storage.createHabit({ name: 'InjectionAttempt', color: 'red; background: black' });
    assert.strictEqual(h5.color, '#3fa34d');

    // 4. Verification in rendered UI
    env.switchView('habits');
    await env.Storage.updateCell(h1.id, '2026-11-13', { status: 'done' });
    await env.Views.renderHabits();

    const habitRow = env.document.querySelector(`.habit-row[data-habit-row="${h1.id}"]`);
    assert.ok(habitRow, 'Habit row must exist');
    const habitIcon = habitRow.querySelector('.habit-icon');
    assert.ok(habitIcon.getAttribute('style').includes('#ff5722'), 'Icon style must include habit color');

    const doneCell = habitRow.querySelector('.cell-status.done');
    assert.ok(doneCell, 'Completed cell must exist');
    assert.ok(doneCell.getAttribute('style').includes('#ff5722'), 'Completed cell style must include habit color');

    env.teardown();
    recordPass('C1: Habit color sanitization, expansion, fallback and rendering verified');
  } catch (err) {
    recordFail('C1: Habit color sanitization and rendering', err);
  }

  // -------------------------------------------------------------------------
  // SUITE D: Alert Spam Elimination & Init Idempotency
  // -------------------------------------------------------------------------
  console.log('\n--- SUITE D: Alert Spam Elimination & Init Idempotency ---');

  try {
    const env = await bootApp({ systemDate: '2026-11-13' });
    await env.unlockVault('TestPassword123!');

    // Call init multiple times
    await env.App.init();
    await env.App.init();
    await env.App.init();
    await env.App.init();

    env.Views.openHabitModal();
    env.document.getElementById('habit-name').value = '';

    env.spies.alerts = [];
    env.click('#save-habit-btn');

    assert.strictEqual(env.spies.alerts.length, 1, 'Only exactly 1 alert must fire despite multiple init() calls');
    assert.strictEqual(env.spies.alerts[0], 'Please enter a habit name');

    env.teardown();
    recordPass('D1: App.init idempotency guard completely prevents listener stacking');
  } catch (err) {
    recordFail('D1: Alert spam idempotency verification', err);
  }

  // -------------------------------------------------------------------------
  // SUITE E: Categorized Notes Lifecycle & Cascading Cleanup
  // -------------------------------------------------------------------------
  console.log('\n--- SUITE E: Categorized Notes Lifecycle & Cascading Cleanup ---');

  try {
    const env = await bootApp({ systemDate: '2026-11-13' });
    await env.unlockVault('TestPassword123!');
    env.switchView('habits');

    const habit = await env.Storage.createHabit({ name: 'Notes Habit', icon: '📝' });
    const todayStr = '2026-11-13';

    // 1. Create Default Note
    const noteDef = await env.Storage.createNote({ habitId: habit.id, date: todayStr, type: 'default', text: 'Default note' });
    let state = await env.Storage.getRawState();
    assert.strictEqual(state.cells[`${habit.id}|${todayStr}`].noteId, noteDef.id, 'Cell must link to note.id');

    await env.Views.renderHabits();
    let badge = env.document.querySelector('.cell-note-badge');
    assert.ok(badge.classList.contains('badge-default'), 'Badge must have .badge-default class');

    // 2. Update to Love Note
    await env.Storage.updateNote(noteDef.id, { type: 'love', text: 'Loved todays session' });
    await env.Views.renderHabits();
    badge = env.document.querySelector('.cell-note-badge');
    assert.ok(badge.classList.contains('badge-love'), 'Badge must update to .badge-love class');
    assert.strictEqual(badge.getAttribute('title'), "Loved todays session");

    // 3. Update to Discipline Note
    await env.Storage.updateNote(noteDef.id, { type: 'discipline', text: 'Stayed hard' });
    await env.Views.renderHabits();
    badge = env.document.querySelector('.cell-note-badge');
    assert.ok(badge.classList.contains('badge-discipline'), 'Badge must update to .badge-discipline class');
    assert.strictEqual(badge.getAttribute('title'), 'Stayed hard');

    // 4. Delete note and verify cell unlinking
    await env.Storage.deleteNote(noteDef.id);
    state = await env.Storage.getRawState();
    assert.strictEqual(state.cells[`${habit.id}|${todayStr}`].noteId, undefined, 'Cell noteId must be undefined');
    assert.ok(state.tombstones.notes[noteDef.id], 'Deleted note must have tombstone');

    // 5. Create new note and delete habit to verify cascading cleanup
    const note2 = await env.Storage.createNote({ habitId: habit.id, date: todayStr, type: 'love', text: 'Note to be orphaned' });
    await env.Storage.deleteHabit(habit.id);
    state = await env.Storage.getRawState();
    assert.ok(!state.notes.some(n => n.id === note2.id), 'Orphan note must be deleted when habit is removed');
    assert.ok(state.tombstones.notes[note2.id], 'Orphan note must have tombstone recorded');
    assert.strictEqual(state.cells[`${habit.id}|${todayStr}`], undefined, 'Habit cells must be purged');

    env.teardown();
    recordPass('E1: Categorized notes lifecycle, updating, badges, and cascading cleanup verified');
  } catch (err) {
    recordFail('E1: Categorized notes lifecycle and cleanup', err);
  }

  // -------------------------------------------------------------------------
  // SUITE F: Dual Directory Parity
  // -------------------------------------------------------------------------
  console.log('\n--- SUITE F: Dual Directory Parity Check ---');

  try {
    function getHash(filePath) {
      const buffer = fs.readFileSync(filePath);
      return crypto.createHash('sha256').update(buffer).digest('hex');
    }

    function compareDirectories(dirA, dirB) {
      const entries = fs.readdirSync(dirA);
      for (const entry of entries) {
        const fullA = path.join(dirA, entry);
        const rel = path.relative('public', fullA);
        const fullB = path.join('.', rel);

        const statA = fs.statSync(fullA);
        if (statA.isDirectory()) {
          compareDirectories(fullA, fullB);
        } else {
          assert.ok(fs.existsSync(fullB), `Root file ${rel} must exist to match public/${rel}`);
          const hashA = getHash(fullA);
          const hashB = getHash(fullB);
          assert.strictEqual(hashA, hashB, `File mismatch in ${rel}: public SHA ${hashA} !== root SHA ${hashB}`);
        }
      }
    }

    compareDirectories('public', '.');
    recordPass('F1: 100% byte-for-byte dual directory parity confirmed across all files');
  } catch (err) {
    recordFail('F1: Dual directory parity', err);
  }

  console.log('\n======================================================================');
  console.log(`  RESULTS: ${passed} PASSED, ${failed} FAILED`);
  console.log('======================================================================');

  if (failed > 0) {
    console.error('\nFAILURE SUMMARY:');
    failureDetails.forEach(f => console.error(` - ${f.testName}: ${f.error.message}`));
    process.exit(1);
  }
}

runAdversarialM2Suite().catch(err => {
  console.error('Fatal suite runner error:', err);
  process.exit(1);
});
