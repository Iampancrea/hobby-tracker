'use strict';

const { describe, test, beforeEach, afterEach } = require('../runner');
const assert = require('../helpers/assert');
const { bootApp } = require('../helpers/env');

describe('Tier 1: Feature R3 - Cell Marking, Color Picker, Alert Spam & Notes', () => {
  let env;

  beforeEach(async () => {
    env = await bootApp({ systemDate: '2026-11-13' });
    await env.unlockVault('TestPassword123!');
    env.switchView('habits');
  });

  afterEach(() => {
    if (env) env.teardown();
  });

  test('T1-R3-01: Today cell marking cycles empty -> done -> missed -> empty', async () => {
    const todayStr = '2026-11-13';
    const habit = await env.Storage.createHabit({ name: 'Workout', icon: '💪', color: '#ff5722' });
    await env.Views.renderHabits();

    const cell = env.document.querySelector(`.day-cell[data-habit="${habit.id}"][data-date="${todayStr}"], .day-cell[data-habit-id="${habit.id}"][data-date="${todayStr}"]`);
    assert.ok(cell, `Today's cell for date ${todayStr} must exist in habit grid`);

    // Click 1: empty -> done
    env.click(cell);
    await new Promise(r => setTimeout(r, 15));
    let cellKey = `${habit.id}|${todayStr}`;
    let state = await env.Storage.getRawState();
    assert.strictEqual(state.cells[cellKey]?.status, 'done', 'First click on today cell must set status to "done"');

    // Click 2: done -> missed
    await env.Views.renderHabits();
    const cellDone = env.document.querySelector(`.day-cell[data-habit="${habit.id}"][data-date="${todayStr}"], .day-cell[data-habit-id="${habit.id}"][data-date="${todayStr}"]`);
    env.click(cellDone);
    await new Promise(r => setTimeout(r, 15));
    state = await env.Storage.getRawState();
    assert.strictEqual(state.cells[cellKey]?.status, 'missed', 'Second click on today cell must cycle status to "missed"');

    // Click 3: missed -> empty
    await env.Views.renderHabits();
    const cellMissed = env.document.querySelector(`.day-cell[data-habit="${habit.id}"][data-date="${todayStr}"], .day-cell[data-habit-id="${habit.id}"][data-date="${todayStr}"]`);
    env.click(cellMissed);
    await new Promise(r => setTimeout(r, 15));
    state = await env.Storage.getRawState();
    const statusAfterCycle = state.cells[cellKey]?.status;
    assert.ok(
      statusAfterCycle === 'empty' || statusAfterCycle === undefined,
      'Third click on today cell must cycle status back to empty'
    );
  });

  test('T1-R3-02: Future date cell has disabled styling and rejects clicks', async () => {
    const futureDate = '2026-11-14';
    const habit = await env.Storage.createHabit({ name: 'Study', icon: '📖', color: '#3fa34d' });
    await env.Views.renderHabits();

    const futureCell = env.document.querySelector(`.day-cell[data-habit="${habit.id}"][data-date="${futureDate}"], .day-cell[data-habit-id="${habit.id}"][data-date="${futureDate}"]`);
    assert.ok(futureCell, `Future cell for ${futureDate} must exist in grid`);

    assert.ok(
      futureCell.classList.contains('disabled') || futureCell.hasAttribute('disabled'),
      'Future date cell must have disabled class or attribute'
    );

    // Clicking future cell must be rejected
    env.click(futureCell);
    await new Promise(r => setTimeout(r, 15));

    const state = await env.Storage.getRawState();
    const cellKey = `${habit.id}|${futureDate}`;
    assert.ok(
      !state.cells[cellKey] || state.cells[cellKey].status === 'empty',
      'Future cell must not be markable in storage'
    );
  });

  test('T1-R3-03: Habit color picker persists custom color and renders in UI', async () => {
    const customColor = '#e91e63';
    const habit = await env.Storage.createHabit({ name: 'Drawing', icon: '🎨', color: customColor });
    await env.Views.renderHabits();

    const habitCell = env.document.querySelector(`[data-habit="${habit.id}"], [data-habit-id="${habit.id}"]`);
    const habitRow = habitCell ? habitCell.closest('tr') : env.document.querySelector('.habit-row');
    assert.ok(habitRow, 'Habit row must exist');

    const iconEl = habitRow.querySelector('.habit-icon');
    assert.ok(iconEl, 'Habit icon element must exist');
    const appliedColor = iconEl.style.color || iconEl.style.backgroundColor || iconEl.getAttribute('style') || '';
    assert.ok(
      appliedColor.toLowerCase().includes(customColor.toLowerCase()),
      `Habit custom color ${customColor} must be applied to icon styling`
    );

    const state = await env.Storage.getRawState();
    const savedHabit = state.habits.find(h => h.id === habit.id);
    assert.strictEqual(savedHabit.color, customColor, 'Custom habit color must persist in storage');
  });

  test('T1-R3-04: Alert spam fix triggers validation alert exactly once', async () => {
    // Perform lock and unlock cycles
    env.click('#lock-btn');
    await new Promise(r => setTimeout(r, 15));
    await env.unlockVault('TestPassword123!');

    env.click('#lock-btn');
    await new Promise(r => setTimeout(r, 15));
    await env.unlockVault('TestPassword123!');

    env.switchView('habits');

    // Trigger add habit with empty name
    const addBtn = env.document.getElementById('add-habit-btn');
    if (addBtn) env.click(addBtn);

    const habitNameInput = env.document.getElementById('habit-name');
    if (habitNameInput) habitNameInput.value = '';

    const saveBtn = env.document.getElementById('save-habit-btn');
    assert.ok(saveBtn, '#save-habit-btn must exist');

    env.spies.alerts = [];
    env.click(saveBtn);

    assert.strictEqual(
      env.spies.alerts.length,
      1,
      `Validation alert must trigger exactly once, but triggered ${env.spies.alerts.length} times: [${env.spies.alerts.join(', ')}]`
    );
    assert.ok(
      env.spies.alerts[0].toLowerCase().includes('habit name'),
      'Alert message must mention entering a habit name'
    );
  });

  test('T1-R3-05: Categorized cell note links note.id into state.cells', async () => {
    const todayStr = '2026-11-13';
    const habit = await env.Storage.createHabit({ name: 'Piano', icon: '🎹', color: '#9c27b0' });

    const note = await env.Storage.createNote({
      habitId: habit.id,
      date: todayStr,
      type: 'love',
      text: 'Played Chopin Nocturne with passion'
    });

    assert.ok(note && note.id, 'createNote must return an object with a note id');
    assert.strictEqual(note.type, 'love', 'Note type must be love');

    const state = await env.Storage.getRawState();
    const cellKey = `${habit.id}|${todayStr}`;
    assert.ok(state.cells[cellKey], 'Target cell must exist in state.cells');
    assert.strictEqual(
      state.cells[cellKey].noteId,
      note.id,
      'Cell in state.cells must have noteId linked directly to note.id'
    );
  });

  test('T1-R3-06: Cell note visual badges render distinct categories and tooltips', async () => {
    const dateStr = '2026-11-13';
    const habit = await env.Storage.createHabit({ name: 'Running', icon: '🏃', color: '#2196f3' });

    const note = await env.Storage.createNote({
      habitId: habit.id,
      date: dateStr,
      type: 'discipline',
      text: 'Pushed through fatigue to run 5k'
    });

    await env.Views.renderHabits();

    const cell = env.document.querySelector(`.day-cell[data-habit="${habit.id}"][data-date="${dateStr}"], .day-cell[data-habit-id="${habit.id}"][data-date="${dateStr}"]`);
    assert.ok(cell, 'Cell with note must exist in habit grid');

    const badge = cell.querySelector('.cell-note-indicator, .note-badge, .note-indicator, [data-note-type]');
    assert.ok(badge, 'Cell with note must render a visible note badge/indicator');

    const badgeClass = badge.className || '';
    assert.ok(
      badgeClass.includes('discipline') || badge.getAttribute('data-note-type') === 'discipline',
      'Note badge must reflect the "discipline" category'
    );
  });

  test('T1-R3-07: Cell note deletion removes note and unsets cell.noteId', async () => {
    const dateStr = '2026-11-13';
    const habit = await env.Storage.createHabit({ name: 'Journaling', icon: '✍️', color: '#4caf50' });

    const note = await env.Storage.createNote({
      habitId: habit.id,
      date: dateStr,
      type: 'default',
      text: 'Brief reflection note'
    });

    await env.Storage.deleteNote(note.id);

    const state = await env.Storage.getRawState();
    const foundNote = state.notes.find(n => n.id === note.id);
    assert.strictEqual(foundNote, undefined, 'Deleted note must be removed from state.notes');

    const cellKey = `${habit.id}|${dateStr}`;
    assert.ok(
      !state.cells[cellKey] || !state.cells[cellKey].noteId,
      'Cell noteId must be unset or null after note deletion'
    );
    assert.ok(
      state.tombstones && state.tombstones.notes && state.tombstones.notes[note.id],
      'Deleted note must record a tombstone in state.tombstones.notes'
    );
  });
});
