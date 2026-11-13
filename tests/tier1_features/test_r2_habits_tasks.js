'use strict';

const { describe, test, beforeEach, afterEach } = require('../runner');
const assert = require('../helpers/assert');
const { bootApp } = require('../helpers/env');

describe('Tier 1: Feature R2 - Habits 30-Day Grid & Dedicated Tasks View', () => {
  let env;

  beforeEach(async () => {
    env = await bootApp();
    await env.unlockVault('TestPassword123!');
  });

  afterEach(() => {
    if (env) env.teardown();
  });

  test('T1-R2-01: Habits 30-Day Grid Layout renders exactly 30 date columns', async () => {
    env.switchView('habits');
    await env.Storage.createHabit({ name: 'Meditation', icon: '🧘', color: '#3fa34d' });
    await env.Views.renderHabits();

    const dateHeaders = env.document.querySelectorAll('#habit-grid table thead th:not(.habit-header), #habit-grid th.day-header, #habit-grid th.date-header, #habit-grid .grid-header-day');
    assert.strictEqual(
      dateHeaders.length,
      30,
      `Habits grid must render exactly 30 date column headers, found ${dateHeaders.length}`
    );
  });

  test('T1-R2-02: Habit row renders icon, name, and streak badge', async () => {
    env.switchView('habits');
    const habit = await env.Storage.createHabit({ name: 'Reading', icon: '📚', color: '#4a90e2' });
    await env.Views.renderHabits();

    const cellEl = env.document.querySelector(`[data-habit="${habit.id}"], [data-habit-id="${habit.id}"]`);
    const habitRow = cellEl ? cellEl.closest('tr') : env.document.querySelector('.habit-row');
    assert.ok(habitRow, `Habit row for habit ${habit.id} must exist in habit grid`);

    const iconEl = habitRow.querySelector('.habit-icon');
    assert.ok(iconEl, 'Habit row must contain .habit-icon');
    assert.domContains(env.document, iconEl, '📚', 'Habit icon must match created habit icon');

    const nameEl = habitRow.querySelector('.habit-name');
    assert.ok(nameEl, 'Habit row must contain .habit-name');
    assert.domContains(env.document, nameEl, 'Reading', 'Habit name must display "Reading"');

    const streakEl = habitRow.querySelector('.habit-streak, .streak-badge, .streak-count');
    assert.ok(streakEl, 'Habit row must render a streak indicator/badge');
  });

  test('T1-R2-03: Dedicated Tasks View renders dedicated vertical checklist', async () => {
    env.switchView('tasks');

    // Dedicated tasks view must not be a 2D calendar matrix with day headers
    const taskCalendarGrid = env.document.querySelector('#task-grid table thead th.day-header, #task-grid .calendar-day-header');
    assert.strictEqual(taskCalendarGrid, null, 'Dedicated tasks view must NOT render a 2D calendar matrix');

    const checklistContainer = env.document.querySelector('#tasks-checklist, .tasks-checklist, #task-list, .task-list, #tasks-container');
    assert.ok(checklistContainer, 'Dedicated tasks view must render a vertical checklist container');
  });

  test('T1-R2-04: Task creation creates record with pending status and unique ID', async () => {
    env.switchView('tasks');
    const taskTitle = 'Write E2E test specs';

    const task = await env.Storage.createTask({ title: taskTitle });
    assert.ok(task && task.id, 'Created task must return an object with a unique id');
    assert.strictEqual(task.title, taskTitle, 'Created task title must match input');
    assert.strictEqual(task.status, 'pending', 'Created task must have default status "pending"');
    assert.strictEqual(task.archived, false, 'Created task must have archived: false');

    const rawState = await env.Storage.getRawState();
    const storedTask = rawState.tasks.find(t => t.id === task.id);
    assert.ok(storedTask, 'Created task must be persisted in state.tasks');
  });

  test('T1-R2-05: Interactive task checkbox toggles pending/done status', async () => {
    env.switchView('tasks');
    const task = await env.Storage.createTask({ title: 'Complete checklist review' });
    await env.Views.renderTasks();

    const taskItem = env.document.querySelector(`[data-task-id="${task.id}"]`);
    assert.ok(taskItem, `Task element for task ${task.id} must be rendered in task list`);

    const checkbox = taskItem.querySelector('input[type="checkbox"], .task-checkbox');
    assert.ok(checkbox, 'Task item must render an interactive checkbox');

    env.click(checkbox);
    await new Promise(r => setTimeout(r, 20));

    const updatedState = await env.Storage.getRawState();
    const updatedTask = updatedState.tasks.find(t => t.id === task.id);
    assert.strictEqual(updatedTask.status, 'done', 'Clicking task checkbox must update task status to "done"');
  });

  test('T1-R2-06: Task filtering controls filter active, completed, and all tasks', async () => {
    env.switchView('tasks');
    const t1 = await env.Storage.createTask({ title: 'Pending task item' });
    const t2 = await env.Storage.createTask({ title: 'Done task item' });
    if (typeof env.Storage.setTaskStatus === 'function') {
      await env.Storage.setTaskStatus(t2.id, 'done');
    } else {
      await env.Storage.updateTask(t2.id, { status: 'done' });
    }
    await env.Views.renderTasks();

    const activeFilterBtn = env.document.querySelector('.task-filter-btn[data-filter="active"], [data-task-filter="active"]');
    assert.ok(activeFilterBtn, 'Filter button for "active" tasks must exist');
    env.click(activeFilterBtn);
    await env.Views.renderTasks();

    let renderedT1 = env.document.querySelector(`[data-task-id="${t1.id}"]`);
    let renderedT2 = env.document.querySelector(`[data-task-id="${t2.id}"]`);
    assert.ok(renderedT1, 'Pending task must be visible under Active filter');
    assert.strictEqual(renderedT2, null, 'Completed task must be hidden under Active filter');

    const completedFilterBtn = env.document.querySelector('.task-filter-btn[data-filter="completed"], [data-task-filter="completed"]');
    assert.ok(completedFilterBtn, 'Filter button for "completed" tasks must exist');
    env.click(completedFilterBtn);
    await env.Views.renderTasks();

    renderedT1 = env.document.querySelector(`[data-task-id="${t1.id}"]`);
    renderedT2 = env.document.querySelector(`[data-task-id="${t2.id}"]`);
    assert.strictEqual(renderedT1, null, 'Pending task must be hidden under Completed filter');
    assert.ok(renderedT2, 'Completed task must be visible under Completed filter');
  });

  test('T1-R2-07: Task archival and deletion updates state and tombstones', async () => {
    env.switchView('tasks');
    const task = await env.Storage.createTask({ title: 'Temporary task for deletion' });

    // Deletion
    await env.Storage.deleteTask(task.id);
    const rawState = await env.Storage.getRawState();

    const activeTask = rawState.tasks.find(t => t.id === task.id);
    assert.strictEqual(activeTask, undefined, 'Deleted task must not be in state.tasks');
    assert.ok(
      rawState.tombstones && rawState.tombstones.tasks && rawState.tombstones.tasks[task.id],
      'Deleted task must record a tombstone in state.tombstones.tasks'
    );
  });
});
