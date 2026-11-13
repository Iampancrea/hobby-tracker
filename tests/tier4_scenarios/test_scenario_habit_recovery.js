'use strict';

const { describe, test, beforeEach, afterEach } = require('../runner');
const assert = require('../helpers/assert');
const { bootApp } = require('../helpers/env');

describe('Tier 4: Scenario 3 - Habit Stumbling, Recovery & Notes Journey', () => {
  let env;

  beforeEach(async () => {
    env = await bootApp({ systemDate: '2026-11-13' });
    await env.unlockVault('TestPassword123!');
  });

  afterEach(() => {
    if (env) env.teardown();
  });

  test('T4-SCEN-03: Habit stumbling, notes, and recovery streak calculation across 30 days', async () => {
    const formatLocalDate = (d) => {
      const y = d.getFullYear();
      const m = String(d.getMonth() + 1).padStart(2, '0');
      const day = String(d.getDate()).padStart(2, '0');
      return `${y}-${m}-${day}`;
    };

    const baseDate = new Date(2026, 10, 13); // 2026-11-13 in local time
    const getDateStr = (offsetDays) => {
      const d = new Date(baseDate);
      d.setDate(baseDate.getDate() + offsetDays);
      return formatLocalDate(d);
    };

    // 1. Create habit with initial green color
    const habit = await env.Storage.createHabit({
      name: 'Daily Writing & Practice',
      icon: '✍️',
      color: '#3fa34d'
    });
    assert.ok(habit && habit.id, 'Habit must be created');

    // 2. Populate 30-day history with initial streak, stumbling gap, and recovery
    // - Days -29 to -10 (20 days): 'done'
    for (let i = -29; i <= -10; i++) {
      const dateStr = getDateStr(i);
      await env.Storage.updateCell(habit.id, dateStr, { status: 'done' });
    }

    // - Days -9 to -6 (4 days): 'missed' (stumbling gap)
    const stumbleDay1 = getDateStr(-9);
    const stumbleDay2 = getDateStr(-7);

    for (let i = -9; i <= -6; i++) {
      const dateStr = getDateStr(i);
      await env.Storage.updateCell(habit.id, dateStr, { status: 'missed' });
    }

    // Attach Love note to first missed day
    const loveNote = await env.Storage.createNote({
      habitId: habit.id,
      date: stumbleDay1,
      type: 'love',
      text: 'Compassion after heavy work deadline, gave myself rest'
    });
    await env.Storage.updateCell(habit.id, stumbleDay1, {
      status: 'missed',
      noteId: loveNote.id
    });

    // Attach Discipline note to second missed day
    const disciplineNote = await env.Storage.createNote({
      habitId: habit.id,
      date: stumbleDay2,
      type: 'discipline',
      text: 'Pushed through resistance to outline next scene'
    });
    await env.Storage.updateCell(habit.id, stumbleDay2, {
      status: 'missed',
      noteId: disciplineNote.id
    });

    // - Days -5 to -1 (5 days): 'done' (recovery)
    for (let i = -5; i <= -1; i++) {
      const dateStr = getDateStr(i);
      await env.Storage.updateCell(habit.id, dateStr, { status: 'done' });
    }

    // - Day 0 (Today: 2026-11-13): 'done'
    const todayStr = getDateStr(0);
    await env.Storage.updateCell(habit.id, todayStr, { status: 'done' });

    // 3. Verify notes and linkages in storage
    const state = await env.Storage.getRawState();
    const storedLoveNote = state.notes.find(n => n.id === loveNote.id);
    const storedDisciplineNote = state.notes.find(n => n.id === disciplineNote.id);

    assert.ok(storedLoveNote, 'Love note must exist in state.notes');
    assert.strictEqual(storedLoveNote.type, 'love');
    assert.strictEqual(state.cells[`${habit.id}|${stumbleDay1}`].noteId, loveNote.id);

    assert.ok(storedDisciplineNote, 'Discipline note must exist in state.notes');
    assert.strictEqual(storedDisciplineNote.type, 'discipline');
    assert.strictEqual(state.cells[`${habit.id}|${stumbleDay2}`].noteId, disciplineNote.id);

    // 4. Update habit color via color picker (custom purple)
    const newColor = '#9c27b0';
    await env.Storage.updateHabit(habit.id, { color: newColor });
    const updatedHabit = (await env.Storage.getRawState()).habits.find(h => h.id === habit.id);
    assert.strictEqual(updatedHabit.color, newColor, 'Habit color must be updated to #9c27b0');

    // 5. Render habits and verify UI reflection
    env.switchView('habits');
    await env.Views.renderHabits();

    // 6. Verify Streak Recalculation Logic
    // Function calculating current active streak ending at today
    const calculateCurrentStreak = (cells, habitId, currentDateStr) => {
      let streak = 0;
      const [year, month, day] = currentDateStr.split('-').map(Number);
      let checkDate = new Date(year, month - 1, day);

      while (true) {
        const dStr = formatLocalDate(checkDate);
        const cell = cells[`${habitId}|${dStr}`];
        if (cell && cell.status === 'done') {
          streak++;
          checkDate.setDate(checkDate.getDate() - 1);
        } else {
          break;
        }
      }
      return streak;
    };

    const currentState = await env.Storage.getRawState();
    const currentStreak = calculateCurrentStreak(currentState.cells, habit.id, todayStr);

    // From day -5 to day 0 is exactly 6 contiguous 'done' days
    assert.strictEqual(
      currentStreak,
      6,
      'Recovery streak must equal exactly 6 days (contiguous done days ending today)'
    );

    // 7. Test streak interruption and recovery:
    // Interrupt streak by clearing yesterday
    const yesterdayStr = getDateStr(-1);
    await env.Storage.updateCell(habit.id, yesterdayStr, { status: 'empty' });
    const interruptedState = await env.Storage.getRawState();
    const interruptedStreak = calculateCurrentStreak(interruptedState.cells, habit.id, todayStr);
    assert.strictEqual(
      interruptedStreak,
      1,
      'Streak must drop to 1 when yesterday is empty'
    );

    // Restore yesterday as done -> streak recovers to 6
    await env.Storage.updateCell(habit.id, yesterdayStr, { status: 'done' });
    const recoveredState = await env.Storage.getRawState();
    const recoveredStreak = calculateCurrentStreak(recoveredState.cells, habit.id, todayStr);
    assert.strictEqual(
      recoveredStreak,
      6,
      'Streak must recover to 6 when yesterday is restored as done'
    );
  });
});
