'use strict';

const { describe, test, beforeEach, afterEach } = require('../runner');
const assert = require('../helpers/assert');
const { bootApp } = require('../helpers/env');

describe('Tier 2: Boundary & Corner Cases — Habits (R2)', () => {
  let env;

  beforeEach(async () => {
    env = await bootApp({ systemDate: '2026-11-13' });
    await env.unlockVault('TestPassword123!');
    env.switchView('habits');
  });

  afterEach(() => {
    if (env) env.teardown();
  });

  test('T2-R2-01: 30-Day Window Boundary Shifts', async () => {
    const habit = await env.Storage.createHabit({ name: 'Hydration', icon: '💧', color: '#3fa34d' });
    await env.Views.loadState();
    await env.Views.renderHabits();

    const offsets = [-30, -60, -90];
    for (const offset of offsets) {
      env.Views.currentHabitDateOffset = offset;
      await env.Views.renderHabits();

      // Check header date columns excluding habit name column
      const allHeaders = env.document.querySelectorAll('#habit-grid table thead th');
      const dateHeaders = Array.from(allHeaders).filter(th => !th.classList.contains('habit-header'));
      assert.strictEqual(
        dateHeaders.length,
        30,
        `Habit grid must render contiguous 30-day columns when offset by ${offset} days, found ${dateHeaders.length}`
      );

      // Verify cells for the habit row match the 30-day block geometry
      const cells = env.document.querySelectorAll(`.day-cell[data-habit="${habit.id}"]`);
      assert.strictEqual(
        cells.length,
        30,
        `Habit row must render exactly 30 cells at offset ${offset}`
      );

      // Verify date sequence has no nulls or NaNs
      for (const cell of cells) {
        const dateStr = cell.dataset.date;
        assert.ok(dateStr && /^\d{4}-\d{2}-\d{2}$/.test(dateStr), `Cell date "${dateStr}" must be a valid YYYY-MM-DD string`);
      }
    }
  });

  test('T2-R2-02: Zero Habits / All Archived Empty State', async () => {
    // 1. Initial empty state with 0 habits
    const rawState = await env.Storage.getRawState();
    rawState.habits = [];
    await env.Storage.saveRawState(rawState);
    await env.Views.loadState();
    await env.Views.renderHabits();

    const grid = env.document.getElementById('habit-grid');
    assert.ok(grid, '#habit-grid container must exist');
    const emptyStateEl = grid.querySelector('.empty-state');
    assert.ok(emptyStateEl, 'Empty state element must be rendered when 0 habits exist');
    assert.domContains(env.document, emptyStateEl, 'No habits yet', 'Empty state message must guide user to add a habit');
    assert.strictEqual(grid.querySelector('table'), null, 'No table should be rendered when habits array is empty');

    // 2. All habits archived state
    const habit = await env.Storage.createHabit({ name: 'Archived Habit', icon: '📦', color: '#888888' });
    await env.Storage.updateHabit(habit.id, { archived: true });

    const showArchivedCheckbox = env.document.getElementById('show-archived-habits');
    showArchivedCheckbox.checked = false;

    await env.Views.loadState();
    await env.Views.renderHabits();

    assert.ok(
      grid.querySelector('.empty-state'),
      'Empty state must be displayed when all existing habits are archived and showArchived is false'
    );
    assert.strictEqual(grid.querySelector('table'), null, 'Table should not render when all habits are hidden');

    // 3. Enabling showArchived reveals archived habit
    showArchivedCheckbox.checked = true;
    await env.Views.renderHabits();
    assert.ok(grid.querySelector('table'), 'Table must render when showArchived is checked');
    assert.domContains(env.document, grid, 'Archived Habit', 'Archived habit name must be visible when showArchived is true');
  });

  test('T2-R2-03: Habit Name Extreme Lengths', async () => {
    // 1-character name boundary
    const h1 = await env.Storage.createHabit({ name: 'A', icon: '⚡', color: '#3fa34d' });
    // 150-character name boundary
    const longName = 'H'.repeat(150);
    const h2 = await env.Storage.createHabit({ name: longName, icon: '📜', color: '#4a90e2' });

    await env.Views.loadState();
    await env.Views.renderHabits();

    const nameElements = env.document.querySelectorAll('.habit-name');
    assert.strictEqual(nameElements.length, 2, 'Both habit rows must be rendered in grid');

    const renderedNames = Array.from(nameElements).map(el => (el.textContent || '').trim());
    assert.ok(renderedNames.includes('A'), '1-character habit name "A" must be rendered');
    assert.ok(renderedNames.includes(longName), '150-character habit name must be rendered without truncation crash');

    // Ensure table structure integrity remains intact
    const rows = env.document.querySelectorAll('#habit-grid tbody tr');
    assert.strictEqual(rows.length, 2, 'Habits grid must maintain 2 distinct table rows');
  });

  test('T2-R2-04: Habit Name XSS Sanitization', async () => {
    const xssPayload = '<script>window.__habit_xss = true;</script><b>Injected Habit</b>';
    const habit = await env.Storage.createHabit({ name: xssPayload, icon: '🛡️', color: '#ff5722' });

    await env.Views.loadState();
    await env.Views.renderHabits();

    // Verify script payload was not executed in the window context
    assert.strictEqual(env.window.__habit_xss, undefined, 'XSS script payload must NOT execute in window context');

    // Verify no active script element was injected into DOM
    const habitNameEl = env.document.querySelector('.habit-name');
    assert.ok(habitNameEl, '.habit-name element must exist');

    const scriptNode = habitNameEl.querySelector('script');
    assert.strictEqual(
      !!scriptNode,
      false,
      '<script> elements must not be inserted as active DOM nodes in habit-name'
    );
    assert.ok(
      (habitNameEl.textContent || '').includes('Injected Habit'),
      'Sanitized habit text should be preserved as text content'
    );
  });

  test('T2-R2-05: 50+ Habits Scalability Stress', async () => {
    // Generate 50 active habits directly in state to avoid redundant transaction cycles
    const rawState = await env.Storage.getRawState();
    const now = new Date().toISOString();
    for (let i = 1; i <= 50; i++) {
      rawState.habits.push({
        id: `h_scale_${i}`,
        name: `Scale Habit ${String(i).padStart(2, '0')}`,
        icon: '🏃',
        color: '#3fa34d',
        archived: false,
        createdAt: now,
        updatedAt: now
      });
    }

    // Set sample cells on first 10 habits
    for (let i = 1; i <= 10; i++) {
      rawState.cells[`h_scale_${i}|2026-11-13`] = {
        habitId: `h_scale_${i}`,
        date: '2026-11-13',
        status: 'done',
        updatedAt: now
      };
    }
    await env.Storage.saveRawState(rawState);

    const startTime = Date.now();
    await env.Views.loadState();
    await env.Views.renderHabits();
    const duration = Date.now() - startTime;

    // Must render 50 rows within 2000ms
    assert.ok(duration < 2000, `Rendering 50 habits must complete within performance budget (<2000ms), took ${duration}ms`);

    const renderedRows = env.document.querySelectorAll('#habit-grid tbody tr');
    assert.strictEqual(renderedRows.length, 50, 'Habits grid must render all 50 habit rows without memory exhaustion');

    // Verify rendered cell count
    const cells = env.document.querySelectorAll('#habit-grid .day-cell');
    assert.ok(cells.length >= 50 * 11, `Rendered cell count must be at least 50 rows x column count (found ${cells.length})`);
  });

  test('T2-R2-06: Streak Calculation with Interspersed Gaps', async () => {
    const habit = await env.Storage.createHabit({ name: 'Morning Run', icon: '🏃', color: '#ff9800' });
    const today = '2026-11-13';

    // Helper to calculate past date string
    const pastDate = (daysAgo) => {
      const d = new Date(today);
      d.setDate(d.getDate() - daysAgo);
      return d.toISOString().split('T')[0];
    };

    // Case 1: Consecutive done days (today, yesterday, 2 days ago) -> streak = 3
    await env.Storage.updateCell(habit.id, today, { status: 'done' });
    await env.Storage.updateCell(habit.id, pastDate(1), { status: 'done' });
    await env.Storage.updateCell(habit.id, pastDate(2), { status: 'done' });

    await env.Views.loadState();
    let streak = env.Views.calculateStreak(habit.id);
    assert.strictEqual(streak, 3, 'Consecutive done days (today, -1, -2) must produce streak of 3');

    // Case 2: Interspersed missed gap at day -3, followed by past done days (-4, -5)
    await env.Storage.updateCell(habit.id, pastDate(3), { status: 'missed' });
    await env.Storage.updateCell(habit.id, pastDate(4), { status: 'done' });
    await env.Storage.updateCell(habit.id, pastDate(5), { status: 'done' });

    await env.Views.loadState();
    streak = env.Views.calculateStreak(habit.id);
    assert.strictEqual(streak, 3, 'Missed day at day -3 must terminate streak calculation at 3');

    // Case 3: Today is empty (not completed yet), yesterday and 2 days ago are done -> current streak = 2
    await env.Storage.updateCell(habit.id, today, { status: 'empty' });
    await env.Views.loadState();
    streak = env.Views.calculateStreak(habit.id);
    assert.strictEqual(streak, 2, 'Unmarked today must preserve active streak from yesterday (streak = 2)');

    // Case 4: Today is marked missed -> streak resets to 0
    await env.Storage.updateCell(habit.id, today, { status: 'missed' });
    await env.Views.loadState();
    streak = env.Views.calculateStreak(habit.id);
    assert.strictEqual(streak, 0, 'Marking today as missed must immediately drop streak to 0');
  });
});
