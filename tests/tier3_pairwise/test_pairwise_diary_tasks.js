'use strict';

const { describe, test, beforeEach, afterEach } = require('../runner');
const assert = require('../helpers/assert');
const { bootApp } = require('../helpers/env');

describe('Tier 3: Pairwise - Diary Tasks ↔ Dedicated Tasks View (R1 ↔ R2)', () => {
  let env;

  beforeEach(async () => {
    env = await bootApp({ systemDate: '2026-11-13' });
    await env.unlockVault('TestPassword123!');
  });

  afterEach(() => {
    if (env) env.teardown();
  });

  test('T3-PAIR-02: Diary today\'s tasks vs Dedicated tasks checklist operational independence', async () => {
    const todayStr = '2026-11-13';

    // 1. Add tasks in Diary for today
    env.switchView('diary');
    await env.selectDiaryDate(todayStr);

    const diaryData = await env.Storage.getDiary(todayStr);
    diaryData.tasks = [
      { title: 'Reflect on morning intentions', status: 'pending' },
      { title: 'Review project roadmap', status: 'pending' }
    ];
    await env.Storage.saveDiary(todayStr, diaryData);
    await env.Views.renderDiary();

    // 2. Add tasks in Dedicated Tasks view (including one with identical title)
    env.switchView('tasks');
    const dedicatedTask1 = await env.Storage.createTask({
      title: 'Reflect on morning intentions' // Identical title to test collision resistance
    });
    // Ensure task status is pending per R2 spec
    await env.Storage.updateTask(dedicatedTask1.id, { status: 'pending' });

    const dedicatedTask2 = await env.Storage.createTask({
      title: 'Configure CI test pipeline'
    });
    await env.Storage.updateTask(dedicatedTask2.id, { status: 'pending' });

    assert.ok(dedicatedTask1 && dedicatedTask1.id, 'Dedicated task 1 must have unique id');
    assert.ok(dedicatedTask2 && dedicatedTask2.id, 'Dedicated task 2 must have unique id');

    // 3. Verify data isolation in storage
    const initialState = await env.Storage.getRawState();
    const storedDiary = initialState.diary && initialState.diary[todayStr];
    assert.ok(storedDiary && storedDiary.tasks, 'Diary tasks must exist in state.diary[date]');
    assert.strictEqual(storedDiary.tasks.length, 2, 'Diary must contain exactly 2 tasks');

    const storedDedicated = initialState.tasks || [];
    assert.ok(storedDedicated.some(t => t.id === dedicatedTask1.id), 'Dedicated task 1 must exist in state.tasks');
    assert.ok(storedDedicated.some(t => t.id === dedicatedTask2.id), 'Dedicated task 2 must exist in state.tasks');

    // 4. Toggle Diary Task completion via UI / API
    const currentDiary = await env.Storage.getDiary(todayStr);
    currentDiary.tasks[0].status = 'done';
    await env.Storage.saveDiary(todayStr, currentDiary);
    await env.Views.renderDiary();

    // Verify Diary task 0 is done
    const stateAfterDiaryToggle = await env.Storage.getRawState();
    assert.strictEqual(
      stateAfterDiaryToggle.diary[todayStr].tasks[0].status,
      'done',
      'Diary task 0 must be marked done'
    );

    // Verify Dedicated Task with identical title remains pending
    const dedicated1AfterDiaryToggle = stateAfterDiaryToggle.tasks.find(t => t.id === dedicatedTask1.id);
    assert.strictEqual(
      dedicated1AfterDiaryToggle.status,
      'pending',
      'Dedicated task with identical title must remain pending when diary task is toggled'
    );

    // 5. Toggle Dedicated Task completion
    await env.Storage.updateTask(dedicatedTask2.id, { status: 'done' });
    const stateAfterDedicatedToggle = await env.Storage.getRawState();
    const dedicated2Updated = stateAfterDedicatedToggle.tasks.find(t => t.id === dedicatedTask2.id);
    assert.strictEqual(
      dedicated2Updated.status,
      'done',
      'Dedicated task 2 must be marked done'
    );

    // Verify Diary task 1 remains pending
    assert.strictEqual(
      stateAfterDedicatedToggle.diary[todayStr].tasks[1].status,
      'pending',
      'Diary task 1 must remain pending when dedicated task is toggled'
    );

    // 6. Delete a task from Diary
    const diaryForDelete = await env.Storage.getDiary(todayStr);
    diaryForDelete.tasks.splice(1, 1); // remove 'Review project roadmap'
    await env.Storage.saveDiary(todayStr, diaryForDelete);

    const stateAfterDiaryDelete = await env.Storage.getRawState();
    assert.strictEqual(
      stateAfterDiaryDelete.diary[todayStr].tasks.length,
      1,
      'Diary tasks count must decrease to 1 after deletion'
    );
    assert.strictEqual(
      stateAfterDiaryDelete.diary[todayStr].tasks[0].title,
      'Reflect on morning intentions'
    );

    // Verify Dedicated tasks were NOT deleted or altered
    const remainingDedicated = stateAfterDiaryDelete.tasks.filter(t => !t._deleted);
    assert.strictEqual(
      remainingDedicated.length,
      storedDedicated.length,
      'Dedicated tasks count must remain completely unaffected by diary task deletion'
    );

    // 7. Delete Dedicated task 1 and verify tombstone creation
    await env.Storage.deleteTask(dedicatedTask1.id);
    const stateAfterDedicatedDelete = await env.Storage.getRawState();

    const dedicatedDeletedFound = (stateAfterDedicatedDelete.tasks || []).find(t => t.id === dedicatedTask1.id);
    assert.strictEqual(
      dedicatedDeletedFound,
      undefined,
      'Deleted dedicated task must be removed from active state.tasks'
    );
    assert.ok(
      stateAfterDedicatedDelete.tombstones &&
      stateAfterDedicatedDelete.tombstones.tasks &&
      stateAfterDedicatedDelete.tombstones.tasks[dedicatedTask1.id],
      'Deleted dedicated task must have a tombstone in state.tombstones.tasks'
    );

    // Verify Diary task remains intact in state.diary
    assert.strictEqual(
      stateAfterDedicatedDelete.diary[todayStr].tasks.length,
      1,
      'Diary tasks must remain intact after dedicated task deletion'
    );
    assert.strictEqual(
      stateAfterDedicatedDelete.diary[todayStr].tasks[0].title,
      'Reflect on morning intentions'
    );
  });
});
