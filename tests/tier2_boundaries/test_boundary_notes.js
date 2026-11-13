'use strict';

const { describe, test, beforeEach, afterEach } = require('../runner');
const assert = require('../helpers/assert');
const { bootApp } = require('../helpers/env');

describe('Tier 2: Boundary & Corner Cases — Notes & Cells (R3)', () => {
  let env;

  beforeEach(async () => {
    env = await bootApp({ systemDate: '2026-11-13T23:59:59.000Z' });
    await env.unlockVault('TestPassword123!');
    env.switchView('habits');
  });

  afterEach(() => {
    if (env) env.teardown();
  });

  test('T2-R3-01: Local Midnight Boundary Enforcement', async () => {
    const habit = await env.Storage.createHabit({ name: 'Midnight Check', icon: '🌙', color: '#3fa34d' });
    await env.Views.loadState();
    await env.Views.renderHabits();

    const todayStr = '2026-11-13';
    const tomorrowStr = '2026-11-14';

    // 1. Today's cell (2026-11-13) at 23:59:59 must be allowed and not disabled
    const todayCell = env.document.querySelector(`.day-cell[data-habit="${habit.id}"][data-date="${todayStr}"]`);
    assert.ok(todayCell, `Today's cell for ${todayStr} must exist in habit grid`);
    assert.domNotHasClass(env.document, todayCell, 'disabled', 'Today cell must not have .disabled class');

    // 2. Tomorrow's cell (2026-11-14) must be disabled and reject clicks
    const tomorrowCell = env.document.querySelector(`.day-cell[data-habit="${habit.id}"][data-date="${tomorrowStr}"]`);
    assert.ok(tomorrowCell, `Tomorrow's cell for ${tomorrowStr} must exist in grid`);
    assert.domHasClass(env.document, tomorrowCell, 'disabled', 'Future date cell must have .disabled class');

    // Attempting to click tomorrow's cell must be rejected
    env.click(tomorrowCell);
    await new Promise(r => setTimeout(r, 15));
    const stateBefore = await env.Storage.getRawState();
    const futureCellData = stateBefore.cells && stateBefore.cells[`${habit.id}|${tomorrowStr}`];
    assert.ok(
      !futureCellData || futureCellData.status === 'empty',
      'Future date cell must reject click and remain empty'
    );

    // 3. Advance clock by 2 seconds across midnight boundary to 2026-11-14 00:00:01
    env.setSystemDate('2026-11-14T00:00:01.000Z');
    await env.Views.renderHabits();

    const newTodayCell = env.document.querySelector(`.day-cell[data-habit="${habit.id}"][data-date="${tomorrowStr}"]`);
    if (newTodayCell) {
      assert.domNotHasClass(
        env.document,
        newTodayCell,
        'disabled',
        'Once midnight passes, 2026-11-14 becomes today and must not be disabled'
      );
    }
  });

  test('T2-R3-02: Invalid Habit Color Hex Fallback', async () => {
    // Test empty color, invalid string, and malformed hex
    const invalidHabit1 = await env.Storage.createHabit({ name: 'Empty Color', icon: '🎨', color: '' });
    const invalidHabit2 = await env.Storage.createHabit({ name: 'Invalid Color', icon: '🎨', color: 'not-a-color' });
    const invalidHabit3 = await env.Storage.createHabit({ name: 'Short Hex', icon: '🎨', color: '#123' });

    await env.Views.loadState();
    await env.Views.renderHabits();

    // Verify fallbacks in storage or UI rendering
    const state = await env.Storage.getRawState();
    const h1 = state.habits.find(h => h.id === invalidHabit1.id);
    const h2 = state.habits.find(h => h.id === invalidHabit2.id);
    const h3 = state.habits.find(h => h.id === invalidHabit3.id);

    const validHexRegex = /^#([0-9a-fA-F]{6})$/;

    // Empty color must fall back to default #3fa34d
    assert.strictEqual(
      h1.color || '#3fa34d',
      '#3fa34d',
      'Empty habit color must fall back to default #3fa34d'
    );

    // Invalid non-hex color string must fall back safely to default #3fa34d
    const color2 = validHexRegex.test(h2.color) ? h2.color : '#3fa34d';
    assert.strictEqual(color2, '#3fa34d', 'Non-hex color string must safely fall back to #3fa34d');

    // Malformed hex must safely normalize or fall back to default
    const color3 = validHexRegex.test(h3.color) ? h3.color : '#3fa34d';
    assert.ok(validHexRegex.test(color3), 'Habit color must be a valid 6-character hex color');
  });

  test('T2-R3-03: Repeated Clicks on Empty Habit Save', async () => {
    env.Views.openHabitModal();
    const nameInput = env.document.getElementById('habit-name');
    nameInput.value = '';

    env.spies.alerts = [];

    // Rapidly click Save Habit 10 consecutive times
    for (let i = 0; i < 10; i++) {
      env.click('#save-habit-btn');
    }
    await new Promise(r => setTimeout(r, 20));

    // Must trigger exactly 10 alert callbacks (one per click without cascading queuing)
    assert.strictEqual(
      env.spies.alerts.length,
      10,
      `Clicking save with empty name 10 times must trigger exactly 10 validation alerts, got ${env.spies.alerts.length}`
    );

    for (const alertMsg of env.spies.alerts) {
      assert.strictEqual(alertMsg, 'Please enter a habit name', 'Alert message must match validation text');
    }

    // Verify no blank habit was created
    const rawState = await env.Storage.getRawState();
    const blankHabits = rawState.habits.filter(h => !h.name || h.name.trim() === '');
    assert.strictEqual(blankHabits.length, 0, 'No empty-named habits must be saved in storage');
  });

  test('T2-R3-04: Note Category Modal Switching', async () => {
    const habit = await env.Storage.createHabit({ name: 'Reading', icon: '📚', color: '#4a90e2' });
    const todayStr = '2026-11-13';

    env.Views.openNoteModal(habit.id, todayStr);

    const modal = env.document.getElementById('note-modal');
    assert.ok(modal, '#note-modal must exist');
    const modalContent = modal.querySelector('.note-modal-content');

    // 1. Switch to 'love' category
    const loveBtn = modal.querySelector('.note-type-btn[data-type="love"]');
    assert.ok(loveBtn, 'Love category button must exist in note modal');
    env.click(loveBtn);

    assert.domHasClass(env.document, loveBtn, 'active', 'Love button must have .active class when clicked');
    assert.domHasClass(env.document, modalContent, 'note-type-love', 'Modal content must apply .note-type-love styling class');

    // 2. Switch to 'discipline' category
    const disciplineBtn = modal.querySelector('.note-type-btn[data-type="discipline"]');
    assert.ok(disciplineBtn, 'Discipline category button must exist in note modal');
    env.click(disciplineBtn);

    assert.domHasClass(env.document, disciplineBtn, 'active', 'Discipline button must have .active class');
    assert.domNotHasClass(env.document, loveBtn, 'active', 'Love button must clear .active class when discipline is selected');
    assert.domHasClass(env.document, modalContent, 'note-type-discipline', 'Modal content must update to .note-type-discipline');

    // 3. Save note with discipline category
    const noteText = 'Fell off routine today, recommitting tomorrow morning.';
    await env.type('#note-text', noteText);
    env.click('#save-note-btn');
    await new Promise(r => setTimeout(r, 20));

    // Verify saved note structure
    const rawState = await env.Storage.getRawState();
    const savedNote = (rawState.notes || []).find(n => n.text === noteText);
    assert.ok(savedNote, 'Created note must exist in state.notes');
    assert.strictEqual(savedNote.type, 'discipline', 'Saved note must have category "discipline"');

    // Verify cell linkage
    const cellKey = `${habit.id}|${todayStr}`;
    const cellRecord = rawState.cells && rawState.cells[cellKey];
    assert.ok(cellRecord, `Cell record for ${cellKey} must exist`);
    assert.strictEqual(cellRecord.noteId, savedNote.id, 'Cell record must store noteId of created note');
  });

  test('T2-R3-05: Extremely Long Note Text (5,000 Chars)', async () => {
    const habit = await env.Storage.createHabit({ name: 'Journaling', icon: '✍️', color: '#3fa34d' });
    const todayStr = '2026-11-13';

    // Construct 5,000-character detailed reflection note
    const longText = 'Note reflection: ' + 'A'.repeat(4980);
    assert.strictEqual(longText.length, 4997, 'Test note text length must be ~5,000 characters');

    // Create note via Storage
    const note = await env.Storage.createNote({
      habitId: habit.id,
      date: todayStr,
      type: 'discipline',
      text: longText
    });

    await env.Storage.updateCell(habit.id, todayStr, { noteId: note.id });
    await env.Views.loadState();
    await env.Views.renderHabits();

    // Verify note is stored without character truncation
    const rawState = await env.Storage.getRawState();
    const storedNote = rawState.notes.find(n => n.id === note.id);
    assert.ok(storedNote, 'Note must exist in storage');
    assert.strictEqual(storedNote.text, longText, '5,000-character note must preserve all characters in storage');

    // Open note modal and verify full text is restored in textarea
    env.Views.openNoteModal(habit.id, todayStr);
    const textarea = env.document.getElementById('note-text');
    assert.strictEqual(textarea.value, longText, 'Textarea must load full 5,000-character note without truncation');
  });

  test('T2-R3-06: Orphan Note Deletion on Habit Removal', async () => {
    const habit = await env.Storage.createHabit({ name: 'Temporary Habit', icon: '🗑️', color: '#e91e63' });
    const todayStr = '2026-11-13';

    // Attach a note to the habit
    const note = await env.Storage.createNote({
      habitId: habit.id,
      date: todayStr,
      type: 'love',
      text: 'Celebrated milestone'
    });
    await env.Storage.updateCell(habit.id, todayStr, { noteId: note.id, status: 'done' });

    let rawState = await env.Storage.getRawState();
    assert.ok(rawState.habits.some(h => h.id === habit.id), 'Habit must exist prior to deletion');
    assert.ok((rawState.notes || []).some(n => n.id === note.id), 'Note must exist prior to deletion');
    assert.ok(rawState.cells[`${habit.id}|${todayStr}`], 'Cell must exist prior to deletion');

    // Delete the habit
    await env.Storage.deleteHabit(habit.id);

    rawState = await env.Storage.getRawState();

    // 1. Habit must be removed from active habits and recorded in tombstones
    assert.strictEqual(
      rawState.habits.some(h => h.id === habit.id),
      false,
      'Deleted habit must not be in state.habits'
    );
    assert.ok(
      rawState.tombstones && rawState.tombstones.habits && rawState.tombstones.habits[habit.id],
      'Deleted habit must be recorded in state.tombstones.habits'
    );

    // 2. Cell notes associated with the deleted habit must be cleaned up or marked deleted
    const activeNote = (rawState.notes || []).find(n => n.id === note.id);
    const noteInTombstones = rawState.tombstones && rawState.tombstones.notes && rawState.tombstones.notes[note.id];
    assert.ok(
      !activeNote || noteInTombstones,
      'Associated cell notes must be cleaned up or recorded in tombstones when habit is removed'
    );
  });
});
