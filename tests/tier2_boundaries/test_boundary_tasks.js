'use strict';

const { describe, test, beforeEach, afterEach } = require('../runner');
const assert = require('../helpers/assert');
const { bootApp } = require('../helpers/env');

describe('Tier 2: Boundary & Corner Cases — Tasks (R2)', () => {
  let env;

  beforeEach(async () => {
    env = await bootApp({ systemDate: '2026-11-13' });
    await env.unlockVault('TestPassword123!');
    env.switchView('tasks');
  });

  afterEach(() => {
    if (env) env.teardown();
  });

  test('T2-R2-B1: Task Title Length Boundaries', async () => {
    // 1-character title boundary
    const t1 = await env.Storage.createTask({ title: 'A' });
    assert.strictEqual(t1.title, 'A', '1-character task title must be accepted');

    // 255-character title boundary
    const longTitle = 'T'.repeat(255);
    const t2 = await env.Storage.createTask({ title: longTitle });
    assert.strictEqual(t2.title, longTitle, '255-character task title must be accepted');

    await env.Views.loadState();
    await env.Views.renderTasks();

    // Verify both tasks persist in state.tasks
    const rawState = await env.Storage.getRawState();
    const storedT1 = rawState.tasks.find(t => t.id === t1.id);
    const storedT2 = rawState.tasks.find(t => t.id === t2.id);
    assert.ok(storedT1, '1-character task must be stored in state');
    assert.ok(storedT2, '255-character task must be stored in state');
    assert.strictEqual(storedT2.title.length, 255, 'Stored long task title must retain all 255 characters');

    // Verify task element rendering without layout explosion
    const taskContainer = env.document.getElementById('task-grid') || env.document.getElementById('view-tasks');
    assert.ok(taskContainer, 'Tasks view container must exist');
    assert.domContains(env.document, taskContainer, 'A', '1-character task must be rendered');
    assert.domContains(env.document, taskContainer, longTitle, '255-character task must be rendered');
  });

  test('T2-R2-B2: Task Title XSS Sanitization', async () => {
    const xssPayload = '<script>window.__task_xss = true;</script><img src="x" onerror="window.__task_xss=true"><b>Injected Task</b>';
    const task = await env.Storage.createTask({ title: xssPayload });

    await env.Views.loadState();
    await env.Views.renderTasks();

    // Verify script payload was not executed
    assert.strictEqual(env.window.__task_xss, undefined, 'Task title XSS payload must NOT execute in window context');

    // Verify no unescaped script tag is inserted into task list DOM
    const taskContainer = env.document.getElementById('task-grid') || env.document.getElementById('view-tasks');
    const scriptNode = taskContainer.querySelector('script');
    assert.strictEqual(
      !!scriptNode,
      false,
      '<script> elements must not be inserted as active DOM nodes in tasks list'
    );

    // Verify sanitized title text content is visible
    assert.domContains(env.document, taskContainer, 'Injected Task', 'Sanitized task title text must be displayed');
  });

  test('T2-R2-B3: Duplicate Task Titles Independence', async () => {
    const sharedTitle = 'Deploy release package';

    // Create 3 tasks with identical titles
    const t1 = await env.Storage.createTask({ title: sharedTitle });
    const t2 = await env.Storage.createTask({ title: sharedTitle });
    const t3 = await env.Storage.createTask({ title: sharedTitle });

    // Verify unique IDs
    assert.notStrictEqual(t1.id, t2.id, 'Duplicate title tasks must have distinct IDs (t1 vs t2)');
    assert.notStrictEqual(t2.id, t3.id, 'Duplicate title tasks must have distinct IDs (t2 vs t3)');
    assert.notStrictEqual(t1.id, t3.id, 'Duplicate title tasks must have distinct IDs (t1 vs t3)');

    // Toggle t1 to done
    if (typeof env.Storage.setTaskStatus === 'function') {
      await env.Storage.setTaskStatus(t1.id, 'done');
    } else {
      await env.Storage.updateTask(t1.id, { status: 'done' });
    }

    let state = await env.Storage.getRawState();
    let stored1 = state.tasks.find(t => t.id === t1.id);
    let stored2 = state.tasks.find(t => t.id === t2.id);
    let stored3 = state.tasks.find(t => t.id === t3.id);

    assert.strictEqual(stored1.status, 'done', 'Task 1 must have status "done"');
    assert.strictEqual(stored2.status || 'pending', 'pending', 'Task 2 must remain "pending"');
    assert.strictEqual(stored3.status || 'pending', 'pending', 'Task 3 must remain "pending"');

    // Delete t2 independently
    await env.Storage.deleteTask(t2.id);
    state = await env.Storage.getRawState();
    assert.strictEqual(state.tasks.some(t => t.id === t2.id), false, 'Task 2 must be deleted');
    assert.strictEqual(state.tasks.some(t => t.id === t1.id), true, 'Task 1 must remain after Task 2 deletion');
    assert.strictEqual(state.tasks.some(t => t.id === t3.id), true, 'Task 3 must remain after Task 2 deletion');
  });

  test('T2-R2-B4: Empty Filter State Rendering', async () => {
    // Create 2 pending tasks (0 completed tasks)
    await env.Storage.createTask({ title: 'Pending Task Alpha' });
    await env.Storage.createTask({ title: 'Pending Task Beta' });

    await env.Views.loadState();
    await env.Views.renderTasks();

    // Look for completed tasks filter button
    const completedFilterBtn = env.document.querySelector('.task-filter-btn[data-filter="completed"], [data-task-filter="completed"]');
    assert.ok(completedFilterBtn, 'Filter button for "completed" tasks must exist in dedicated tasks view');

    env.click(completedFilterBtn);
    await env.Views.renderTasks();

    // Verify 0 completed task items displayed
    const completedItems = env.document.querySelectorAll('.task-item.done, [data-task-status="done"]');
    assert.strictEqual(completedItems.length, 0, 'No task items should be displayed under completed filter when none are completed');

    // Verify friendly empty state message
    const emptyMsg = env.document.querySelector('#tasks-empty-state, .tasks-checklist .empty-state, #task-grid .empty-state');
    assert.ok(emptyMsg, 'Friendly empty state message must be displayed when filter matches 0 tasks');
  });

  test('T2-R2-B5: All Tasks Archived Toggle', async () => {
    // Create 2 archived tasks
    const t1 = await env.Storage.createTask({ title: 'Archived Project A' });
    const t2 = await env.Storage.createTask({ title: 'Archived Project B' });
    await env.Storage.updateTask(t1.id, { archived: true });
    await env.Storage.updateTask(t2.id, { archived: true });

    const showArchivedCheckbox = env.document.getElementById('show-archived-tasks');
    assert.ok(showArchivedCheckbox, '#show-archived-tasks checkbox must exist');
    showArchivedCheckbox.checked = false;

    await env.Views.loadState();
    await env.Views.renderTasks();

    const taskGrid = env.document.getElementById('task-grid');
    assert.ok(taskGrid, '#task-grid container must exist');
    assert.ok(
      taskGrid.querySelector('.empty-state'),
      'When all tasks are archived and showArchived is false, empty state must be shown'
    );

    // Toggle Show Archived to true
    showArchivedCheckbox.checked = true;
    await env.Views.renderTasks();

    assert.domContains(env.document, taskGrid, 'Archived Project A', 'Archived task A must be visible when showArchived is checked');
    assert.domContains(env.document, taskGrid, 'Archived Project B', 'Archived task B must be visible when showArchived is checked');
  });

  test('T2-R2-B6: Rapid Checkbox Toggling Synchronization', async () => {
    const task = await env.Storage.createTask({ title: 'Rapid toggle sync task' });
    await env.Views.loadState();
    await env.Views.renderTasks();

    const taskItem = env.document.querySelector(`[data-task-id="${task.id}"]`);
    assert.ok(taskItem, `Task element for task ${task.id} must be rendered`);

    const checkbox = taskItem.querySelector('input[type="checkbox"], .task-checkbox');
    assert.ok(checkbox, 'Task item must render an interactive checkbox');

    // 1. Rapidly click checkbox 10 times (even count: pending -> done -> pending ...)
    for (let i = 0; i < 10; i++) {
      env.click(checkbox);
      await new Promise(r => setTimeout(r, 8));
    }
    await new Promise(r => setTimeout(r, 40));

    let state = await env.Storage.getRawState();
    let updatedTask = state.tasks.find(t => t.id === task.id);
    assert.strictEqual(
      updatedTask.status,
      'pending',
      'After 10 rapid toggles from pending, status in IndexedDB must synchronize to "pending"'
    );
    assert.strictEqual(checkbox.checked, false, 'Checkbox visual state must match IndexedDB status ("pending" / unchecked)');

    // 2. Click 11th time (odd count: pending -> done)
    env.click(checkbox);
    await new Promise(r => setTimeout(r, 40));

    state = await env.Storage.getRawState();
    updatedTask = state.tasks.find(t => t.id === task.id);
    assert.strictEqual(
      updatedTask.status,
      'done',
      'After 11th toggle, status in IndexedDB must synchronize to "done"'
    );
    assert.strictEqual(checkbox.checked, true, 'Checkbox visual state must match IndexedDB status ("done" / checked)');
  });
});
