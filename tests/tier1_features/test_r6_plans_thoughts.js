'use strict';

const { describe, test, beforeEach, afterEach } = require('../runner');
const assert = require('../helpers/assert');
const { bootApp } = require('../helpers/env');

const flush = (ms = 35) => new Promise(r => setTimeout(r, ms));

describe('Tier 1: Feature R6 - Plans Master-Detail & Thoughts', () => {
  let env;

  beforeEach(async () => {
    env = await bootApp();
    await env.unlockVault('TestPassword123!');
  });

  afterEach(() => {
    if (env) env.teardown();
  });

  // ---------------------------------------------------------------------------
  // PLANS TESTS
  // ---------------------------------------------------------------------------

  test('T1-R6-01: Shell navigation switches to Plans and Thoughts and preserves legacy goals aliases', async () => {
    const plansNav = env.document.querySelector('.nav-item[data-view="plans"]');
    const thoughtsNav = env.document.querySelector('.nav-item[data-view="thoughts"]');
    assert.ok(plansNav, 'Sidebar must contain nav item for plans');
    assert.ok(thoughtsNav, 'Sidebar must contain nav item for thoughts');

    env.switchView('plans');
    await flush();
    assert.domHasClass(env.document, '#view-plans', 'active');
    assert.strictEqual(env.document.title, 'Plans — Hobby Tracker');

    env.switchView('thoughts');
    await flush();
    assert.domHasClass(env.document, '#view-thoughts', 'active');
    assert.strictEqual(env.document.title, 'Thoughts — Hobby Tracker');

    // Legacy 'goals' alias must route to 'plans'
    env.switchView('goals');
    await flush();
    assert.domHasClass(env.document, '#view-plans', 'active');
    assert.strictEqual(env.document.title, 'Plans — Hobby Tracker');
    assert.strictEqual(env.Views.renderGoals, env.Views.renderPlans, 'Views.renderGoals must alias Views.renderPlans');
  });

  test('T1-R6-02: Plans master-detail renders list, switches selection, toggles mobile pane, and saves strategy', async () => {
    env.switchView('plans');
    await flush();

    // Create Plan A via #goal-modal UI (default 'quick' horizon)
    env.click('#add-plan-btn');
    await env.type('#goal-title', 'Run Half Marathon');
    await env.type('#goal-tag', 'Fitness');
    await env.type('#goal-target-date', '7 days');
    await env.type('#goal-description', 'Build aerobic endurance safely');
    await env.type('#goal-strategy', 'Run 4x/week at conversational pace');
    await env.type('#goal-milestones', 'Complete 10K\nComplete 15K');
    env.click('#save-goal-btn');
    await flush();

    // Create Plan B ('mid' horizon) via API
    const planB = await env.API.createGoal({
      title: 'Learn Rust Systems',
      category: 'mid',
      tag: 'Engineering',
      strategy: '30 mins daily reading'
    });
    await env.Views.renderPlans();
    await flush();

    const listItems = env.document.querySelectorAll('#plans-list .plan-list-item');
    assert.strictEqual(listItems.length, 2, 'Master list must render both top-level plans');

    // Click Plan B in master list
    const itemB = env.document.querySelector(`.plan-list-item[data-plan-id="${planB.id}"]`);
    assert.ok(itemB, 'Plan B list item must exist');
    env.click(itemB);
    await flush();

    assert.domContains(env.document, '#plans-detail .plan-detail-title', 'Learn Rust Systems');
    assert.domHasClass(env.document, '#plans-workspace', 'is-mobile-detail');

    // Mobile back button clears mobile detail state
    env.click('#plans-mobile-back-btn');
    await flush();
    assert.domNotHasClass(env.document, '#plans-workspace', 'is-mobile-detail');

    // Re-select Plan B and update Strategy & Rules inline
    env.click(env.document.querySelector(`.plan-list-item[data-plan-id="${planB.id}"]`));
    await flush();
    await env.type('#plan-strategy-input', 'Build one CLI tool per week without skipping');
    env.click('#plan-strategy-save-btn');
    await flush();

    assert.domContains(env.document, '#plan-strategy-status', 'Saved');
    const stateAfter = await env.Storage.getState();
    const savedPlanB = stateAfter.goals.find(g => g.id === planB.id);
    assert.strictEqual(savedPlanB.strategy, 'Build one CLI tool per week without skipping');

    // Horizon & completion filters
    env.click('.plan-filter-btn[data-filter="quick"]');
    await flush();
    assert.strictEqual(env.document.querySelectorAll('#plans-list .plan-list-item').length, 1);
    assert.domContains(env.document, '#plans-list', 'Run Half Marathon');

    env.click('.plan-filter-btn[data-filter="mid"]');
    await flush();
    assert.strictEqual(env.document.querySelectorAll('#plans-list .plan-list-item').length, 1);
    assert.domContains(env.document, '#plans-list', 'Learn Rust Systems');

    env.click('.plan-filter-btn[data-filter="all"]');
    await flush();
    env.click('.plan-toggle-complete-btn');
    await flush();
    env.click('.plan-filter-btn[data-filter="completed"]');
    await flush();
    assert.strictEqual(env.document.querySelectorAll('#plans-list .plan-list-item').length, 1);
  });

  test('T1-R6-03: Nested 1-7d Quick Goals stay nested under parent Plan and drive computed progress', async () => {
    const parentPlan = await env.API.createGoal({
      title: 'Launch Portfolio Site',
      category: 'mid',
      milestones: [{ id: 'm1', text: 'Buy domain', done: false }]
    });

    env.Views.selectedPlanId = parentPlan.id;
    env.switchView('plans');
    await flush();

    // Add two nested 1-7d Quick Goals via inline composer
    await env.type('#plan-quick-title-input', 'Draft hero copy');
    env.click('#plan-quick-add-btn');
    await flush();

    await env.type('#plan-quick-title-input', 'Compress project images');
    env.click('#plan-quick-add-btn');
    await flush();

    const state = await env.Storage.getState();
    const children = state.goals.filter(g => g.parentId === parentPlan.id);
    assert.strictEqual(children.length, 2, 'Both Quick Goals must have parentId equal to parent plan');
    assert.ok(children.every(c => c.category === 'quick'), 'Nested quick goals must have category "quick"');

    // Top-level master list must show only the parent Plan, not child Quick Goals
    assert.strictEqual(env.document.querySelectorAll('#plans-list .plan-list-item').length, 1);
    assert.domContains(env.document, '#plans-list .plan-list-item-meta', '2 quick');

    // 1 milestone + 2 quick goals = 3 units; complete 1 quick goal -> 33%
    const firstQuickCb = env.document.querySelector(`.plan-quick-goal-check[data-goal-id="${children[0].id}"]`);
    assert.ok(firstQuickCb, 'Quick goal checkbox must render');
    env.click(firstQuickCb);
    await flush();

    assert.domText(env.document, '.plan-detail-progress .progress-percent', '33%');

    // Complete milestone & second quick goal -> 100%
    const msCb = env.document.querySelector(`.goal-milestone-check[data-goal-id="${parentPlan.id}"][data-idx="0"]`);
    env.click(msCb);
    await flush();
    const secondQuickCb = env.document.querySelector(`.plan-quick-goal-check[data-goal-id="${children[1].id}"]`);
    env.click(secondQuickCb);
    await flush();

    assert.domText(env.document, '.plan-detail-progress .progress-percent', '100%');
  });

  test('T1-R6-04: Live Habit and Task linking updates today cell and task status in real time', async () => {
    const plan = await env.API.createGoal({ title: 'Deep Work Protocol', category: 'mid' });
    const habit = await env.API.createHabit({ name: '90m Focus Block', icon: '⚡', color: '#3fa34d' });
    const existingTask = await env.API.createTask({ title: 'Clear desk before start' });

    env.Views.selectedPlanId = plan.id;
    env.switchView('plans');
    await flush();

    // Link existing habit
    await env.type('#plan-link-habit-select', habit.id);
    env.click('#plan-link-habit-btn');
    await flush();

    const habitChip = env.document.querySelector(`.plan-habit-chip[data-habit-id="${habit.id}"]`);
    assert.ok(habitChip, 'Linked habit chip must render in Plan detail');
    assert.domContains(env.document, habitChip, '90m Focus Block');

    // Toggle today's habit status directly inside Plan detail
    const toggleBtn = habitChip.querySelector('.plan-habit-toggle-btn');
    env.click(toggleBtn);
    await flush();

    const d = new Date();
    const localKey = `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;
    const stateAfterHabit = await env.Storage.getState();
    assert.strictEqual(stateAfterHabit.cells[`${habit.id}|${localKey}`]?.status, 'done', 'Habit toggle in Plan must mark today done');
    assert.domHasClass(env.document, `.plan-habit-chip[data-habit-id="${habit.id}"]`, 'done');

    // Link existing task and toggle it
    await env.type('#plan-link-task-select', existingTask.id);
    env.click('#plan-link-task-btn');
    await flush();

    // Create & link a brand new task inline
    await env.type('#plan-new-task-input', 'Configure focus timer');
    env.click('#plan-new-task-btn');
    await flush();

    const taskCheckboxes = env.document.querySelectorAll('.plan-linked-tasks .plan-task-checkbox');
    assert.strictEqual(taskCheckboxes.length, 2, 'Both linked tasks must appear in Plan detail');

    const firstTaskCb = env.document.querySelector(`.plan-task-checkbox[data-task-id="${existingTask.id}"]`);
    env.click(firstTaskCb);
    await flush();

    const stateAfterTask = await env.Storage.getState();
    const updatedTask = stateAfterTask.tasks.find(t => t.id === existingTask.id);
    assert.strictEqual(updatedTask.status, 'done', 'Toggling linked task checkbox in Plan must persist task done status');
    const inlineCreatedTask = stateAfterTask.tasks.find(t => t.title === 'Configure focus timer');
    assert.ok(inlineCreatedTask, 'Inline-created task must persist in state.tasks');
    let updatedPlan = stateAfterTask.goals.find(g => g.id === plan.id);
    assert.ok(updatedPlan.linkedTaskIds.includes(inlineCreatedTask.id), 'Inline-created task ID must be linked to plan');

    // Unlink habit & task via Plan detail buttons
    env.click(`.plan-habit-unlink-btn[data-habit-id="${habit.id}"]`);
    await flush();
    env.click(`.plan-task-unlink-btn[data-task-id="${existingTask.id}"]`);
    await flush();
    const stateAfterUnlink = await env.Storage.getState();
    updatedPlan = stateAfterUnlink.goals.find(g => g.id === plan.id);
    assert.strictEqual(updatedPlan.linkedHabitIds.includes(habit.id), false, 'Unlink habit button must remove habit from plan');
    assert.strictEqual(updatedPlan.linkedTaskIds.includes(existingTask.id), false, 'Unlink task button must remove task from plan');
  });

  test('T1-R6-05: Deleting Habits, Tasks, or Plans cleans up references without orphaning', async () => {
    const plan = await env.API.createGoal({ title: 'Master Plan', category: 'long' });
    const childQuick = await env.API.createGoal({ title: 'Child Quick', category: 'quick', parentId: plan.id });
    const habit = await env.API.createHabit({ name: 'Stretch', icon: '🧘' });
    const task = await env.API.createTask({ title: 'Buy mat' });
    const thought = await env.API.createThought({ body: 'Consistency beats intensity.', planId: plan.id });

    await env.API.linkHabitToPlan(plan.id, habit.id);
    await env.API.linkTaskToPlan(plan.id, task.id);

    // Delete habit -> stripped from plan.linkedHabitIds
    await env.API.deleteHabit(habit.id);
    let state = await env.Storage.getState();
    let planNow = state.goals.find(g => g.id === plan.id);
    assert.strictEqual(planNow.linkedHabitIds.includes(habit.id), false, 'deleteHabit must strip id from linkedHabitIds');

    // Delete task -> stripped from plan.linkedTaskIds
    await env.API.deleteTask(task.id);
    state = await env.Storage.getState();
    planNow = state.goals.find(g => g.id === plan.id);
    assert.strictEqual(planNow.linkedTaskIds.includes(task.id), false, 'deleteTask must strip id from linkedTaskIds');

    // Delete Plan -> childQuick detached (parentId = null) and thought detached (planId = null)
    await env.API.deleteGoal(plan.id);
    state = await env.Storage.getState();
    assert.strictEqual(state.goals.find(g => g.id === plan.id), undefined, 'Deleted plan must be removed');
    assert.ok(state.tombstones.goals[plan.id], 'Deleted plan must record tombstone');

    const detachedChild = state.goals.find(g => g.id === childQuick.id);
    assert.ok(detachedChild, 'Child quick goal must still exist after parent deletion');
    assert.strictEqual(detachedChild.parentId, null, 'Child quick goal must have parentId reset to null');

    const detachedThought = state.thoughts.find(t => t.id === thought.id);
    assert.ok(detachedThought, 'Linked thought must still exist after plan deletion');
    assert.strictEqual(detachedThought.planId, null, 'Linked thought must have planId reset to null');
  });

  // ---------------------------------------------------------------------------
  // THOUGHTS TESTS
  // ---------------------------------------------------------------------------

  test('T1-R6-06: Thoughts write-first composer captures titled and untitled thoughts at index 0', async () => {
    const plan = await env.API.createGoal({ title: 'Reading Habit Plan', category: 'mid' });
    env.switchView('thoughts');
    await flush();

    // Post-write panel starts hidden
    assert.domHidden(env.document, '#thought-post-write-panel');

    // Validation: empty body must not save
    await assert.rejects(
      () => env.API.createThought({ body: '   ' }),
      /empty/i,
      'createThought must reject empty or whitespace-only body'
    );

    // Step 1: Write body first, then click Save Thought to reveal post-write panel
    await env.type('#thought-body-input', 'Short daily sessions compound faster than weekend marathons.');
    env.click('#thought-pre-save-btn');
    assert.domVisible(env.document, '#thought-post-write-panel');

    // Step 2: Add optional title, tag, amber color, and link to Plan
    await env.type('#thought-title-input', 'Compounding Effort');
    await env.type('#thought-tag-input', 'Mindset');
    env.click('#thought-post-write-panel .thought-color-dot[data-color="amber"]');
    await env.type('#thought-plan-select', plan.id);
    env.click('#thought-confirm-save-btn');
    await flush();

    // Panel closes & resets
    assert.domHidden(env.document, '#thought-post-write-panel');
    assert.domValue(env.document, '#thought-body-input', '');

    // Step 3: Write second thought and save untitled (ignoring any text in title input)
    await env.type('#thought-body-input', 'Never miss twice on core habits.');
    env.click('#thought-pre-save-btn');
    await env.type('#thought-title-input', 'Should be skipped');
    env.click('#thought-skip-title-btn');
    await flush();

    const state = await env.Storage.getState();
    assert.strictEqual(state.thoughts.length, 2, 'Two thoughts must be saved');
    assert.strictEqual(state.thoughts[0].body, 'Never miss twice on core habits.', 'Newest thought must insert at index 0');
    assert.strictEqual(state.thoughts[0].title, '', 'Save Untitled must store empty title');
    assert.strictEqual(state.thoughts[1].title, 'Compounding Effort');
    assert.strictEqual(state.thoughts[1].color, 'amber');
    assert.strictEqual(state.thoughts[1].tag, 'Mindset');
    assert.strictEqual(state.thoughts[1].planId, plan.id);

    // Verify attached thought also appears inside Plan detail
    env.Views.selectedPlanId = plan.id;
    env.switchView('plans');
    await flush();
    assert.domContains(env.document, '.plan-attached-thoughts', 'Compounding Effort');
  });

  test('T1-R6-07: Thoughts cards support expand/collapse, Expand/Collapse All, edit modal, pin, plan filter, and search', async () => {
    const planA = await env.API.createGoal({ title: 'Deep Focus', category: 'mid' });
    const t1 = await env.API.createThought({
      title: 'Environment Design',
      body: 'Line one insight\nLine two detail for full view.',
      tag: 'Study',
      color: 'sage',
      planId: planA.id
    });
    const t2 = await env.API.createThought({
      body: 'Plain untitled note for search testing.',
      tag: 'General'
    });

    env.switchView('thoughts');
    await flush();

    // Cards start collapsed with preview visible and details hidden
    const card1 = env.document.querySelector(`.thought-card[data-thought-id="${t1.id}"]`);
    assert.ok(card1, 'Thought 1 card must render');
    assert.domNotHasClass(env.document, card1, 'expanded');
    assert.domVisible(env.document, card1.querySelector('.thought-card-preview'));
    assert.domHidden(env.document, card1.querySelector('.thought-card-details'));

    // Expand individual card
    env.click(card1.querySelector('.thought-card-expand-btn'));
    await flush();
    const card1Expanded = env.document.querySelector(`.thought-card[data-thought-id="${t1.id}"]`);
    assert.domHasClass(env.document, card1Expanded, 'expanded');
    assert.domVisible(env.document, card1Expanded.querySelector('.thought-card-details'));
    assert.domContains(env.document, card1Expanded.querySelector('.thought-card-body'), 'Line two detail');

    // Collapse All & Expand All
    env.click('#thoughts-collapse-all-btn');
    await flush();
    assert.strictEqual(env.document.querySelectorAll('#thoughts-list .thought-card.expanded').length, 0);

    env.click('#thoughts-expand-all-btn');
    await flush();
    assert.strictEqual(env.document.querySelectorAll('#thoughts-list .thought-card.expanded').length, 2);

    // Pin t2 and verify pinned ordering + Pinned filter
    const card2 = env.document.querySelector(`.thought-card[data-thought-id="${t2.id}"]`);
    env.click(card2.querySelector('.thought-pin-btn'));
    await flush();

    const orderedCards = env.document.querySelectorAll('#thoughts-list .thought-card');
    assert.strictEqual(orderedCards[0].dataset.thoughtId, t2.id, 'Pinned thought must render first');

    env.click('.thought-filter-btn[data-filter="pinned"]');
    await flush();
    assert.strictEqual(env.document.querySelectorAll('#thoughts-list .thought-card').length, 1);

    // Reset filter, test plan filter & search
    env.click('.thought-filter-btn[data-filter="all"]');
    await flush();
    await env.type('#thoughts-plan-filter', planA.id);
    await flush();
    assert.strictEqual(env.document.querySelectorAll('#thoughts-list .thought-card').length, 1);
    assert.strictEqual(env.document.querySelector('#thoughts-list .thought-card').dataset.thoughtId, t1.id);

    await env.type('#thoughts-plan-filter', 'all');
    await env.type('#thoughts-search-input', 'Environment');
    await flush();
    assert.strictEqual(env.document.querySelectorAll('#thoughts-list .thought-card').length, 1);

    // Clear search and edit via Thought Modal
    await env.type('#thoughts-search-input', '');
    await flush();
    env.click(env.document.querySelector(`.thought-card[data-thought-id="${t1.id}"] .thought-edit-btn`));
    assert.domVisible(env.document, '#thought-modal');
    await env.type('#thought-edit-title', 'Environment Design v2');
    await env.type('#thought-edit-body', 'Updated full insight body');
    env.click('#thought-modal .thought-color-dot[data-color="rose"]');
    env.click('#save-thought-edit-btn');
    await flush();

    assert.domHidden(env.document, '#thought-modal');
    const stateAfterEdit = await env.Storage.getState();
    const edited = stateAfterEdit.thoughts.find(t => t.id === t1.id);
    assert.strictEqual(edited.title, 'Environment Design v2');
    assert.strictEqual(edited.body, 'Updated full insight body');
    assert.strictEqual(edited.color, 'rose');
  });

  test('T1-R6-08: Reordering Thoughts, Re-read Spotlight markThoughtRead/next, and deletion tombstones', async () => {
    const a = await env.API.createThought({ title: 'Alpha', body: 'First thought body' });
    const b = await env.API.createThought({ title: 'Beta', body: 'Second thought body' });
    const c = await env.API.createThought({ title: 'Gamma', body: 'Third thought body' });

    // Reorder [a, b, c] explicitly
    await env.API.reorderThoughts([a.id, b.id, c.id]);
    env.switchView('thoughts');
    await flush();

    let renderedIds = Array.from(env.document.querySelectorAll('#thoughts-list .thought-card')).map(el => el.dataset.thoughtId);
    assert.deepStrictEqual(renderedIds, [a.id, b.id, c.id], 'reorderThoughts order must persist in list rendering');

    // Spotlight shows one thought with Read 0×
    assert.domContains(env.document, '#thought-spotlight', 'Read 0×');
    const initialSpotlightId = env.Views.spotlightThoughtId;
    assert.ok(initialSpotlightId, 'Spotlight must pick an active thought');

    // Mark Read increments readCount and sets lastReadAt
    env.click('#spotlight-read-btn');
    await flush();

    const stateAfterRead = await env.Storage.getState();
    const readThought = stateAfterRead.thoughts.find(t => t.id === initialSpotlightId);
    assert.strictEqual(readThought.readCount, 1, 'markThoughtRead must increment readCount');
    assert.ok(readThought.lastReadAt && !Number.isNaN(Date.parse(readThought.lastReadAt)), 'markThoughtRead must set valid ISO lastReadAt');
    assert.domContains(env.document, '#thought-spotlight', 'Read 1×');

    // Next Thought cycles Spotlight to a different thought
    env.click('#spotlight-next-btn');
    await flush();
    assert.notStrictEqual(env.Views.spotlightThoughtId, initialSpotlightId, 'Next Thought button must advance Spotlight');

    // Delete thought creates tombstone
    env.click(env.document.querySelector(`.thought-card[data-thought-id="${b.id}"] .thought-delete-btn`));
    await flush();

    const rawAfterDelete = await env.Storage.getRawState();
    assert.strictEqual(rawAfterDelete.thoughts.some(t => t.id === b.id), false);
    assert.ok(rawAfterDelete.tombstones.thoughts[b.id], 'deleteThought must write tombstone in tombstones.thoughts');
  });

  test('T1-R6-09: Sync.mergeStates merges Thoughts, extended Plan fields, and honors tombstones across devices', async () => {
    const localState = {
      habits: [{ id: 'h_keep', name: 'Read', icon: '📖', color: '#3fa34d' }],
      tasks: [{ id: 't_keep', title: 'Outline', status: 'pending' }],
      cells: {},
      notes: [],
      quotes: [],
      diary: {},
      goals: [
        {
          id: 'p_keep',
          title: 'Local Plan Older',
          category: 'mid',
          parentId: null,
          strategy: 'Old strategy',
          linkedHabitIds: ['h_keep', 'h_dead'],
          linkedTaskIds: ['t_keep'],
          order: 0,
          createdAt: '2026-11-01T10:00:00.000Z',
          updatedAt: '2026-11-01T10:00:00.000Z'
        },
        {
          id: 'p_child',
          title: 'Quick Child of Dead Plan',
          category: 'quick',
          parentId: 'p_dead',
          strategy: '',
          linkedHabitIds: [],
          linkedTaskIds: [],
          order: 1,
          createdAt: '2026-11-01T10:00:00.000Z',
          updatedAt: '2026-11-01T10:00:00.000Z'
        }
      ],
      thoughts: [
        {
          id: 'th_shared',
          title: 'Shared Newer Local',
          body: 'Local updated body',
          tag: 'Focus',
          color: 'amber',
          pinned: true,
          expanded: false,
          planId: 'p_keep',
          readCount: 3,
          lastReadAt: '2026-11-12T10:00:00.000Z',
          createdAt: '2026-11-01T10:00:00.000Z',
          updatedAt: '2026-11-12T10:00:00.000Z'
        },
        {
          id: 'th_orphan_plan',
          title: 'Linked to Deleted Plan',
          body: 'Should detach planId',
          tag: '',
          color: 'default',
          pinned: false,
          expanded: false,
          planId: 'p_dead',
          readCount: 0,
          lastReadAt: null,
          createdAt: '2026-11-01T10:00:00.000Z',
          updatedAt: '2026-11-05T10:00:00.000Z'
        }
      ],
      tombstones: {
        habits: { h_dead: '2026-11-10T10:00:00.000Z' },
        tasks: {},
        notes: {},
        quotes: {},
        goals: { p_dead: '2026-11-10T10:00:00.000Z' },
        thoughts: { th_deleted: '2026-11-10T10:00:00.000Z' }
      }
    };

    const remoteState = {
      habits: [],
      tasks: [],
      cells: {},
      notes: [],
      quotes: [],
      diary: {},
      goals: [
        {
          id: 'p_keep',
          title: 'Remote Plan Newer',
          category: 'mid',
          parentId: null,
          strategy: 'Updated remote strategy',
          linkedHabitIds: ['h_keep', 'h_dead'],
          linkedTaskIds: ['t_keep', 't_dead'],
          order: 2,
          createdAt: '2026-11-01T10:00:00.000Z',
          updatedAt: '2026-11-12T12:00:00.000Z'
        },
        {
          id: 'p_dead',
          title: 'Deleted Plan Stale',
          category: 'long',
          createdAt: '2026-11-01T10:00:00.000Z',
          updatedAt: '2026-11-05T10:00:00.000Z'
        }
      ],
      thoughts: [
        {
          id: 'th_shared',
          title: 'Shared Stale Remote',
          body: 'Stale body',
          color: 'default',
          pinned: false,
          planId: 'p_keep',
          createdAt: '2026-11-01T10:00:00.000Z',
          updatedAt: '2026-11-02T10:00:00.000Z'
        },
        {
          id: 'th_deleted',
          title: 'Deleted Thought Stale',
          body: 'Should stay deleted',
          color: 'rose',
          createdAt: '2026-11-01T10:00:00.000Z',
          updatedAt: '2026-11-09T10:00:00.000Z'
        },
        {
          id: 'th_remote_only',
          title: 'Remote Insight',
          body: 'Synced from second device',
          tag: 'Sync',
          color: 'sage',
          pinned: false,
          expanded: false,
          planId: 'p_keep',
          readCount: 1,
          lastReadAt: '2026-11-11T08:00:00.000Z',
          createdAt: '2026-11-11T08:00:00.000Z',
          updatedAt: '2026-11-11T08:00:00.000Z'
        }
      ],
      tombstones: {
        habits: {},
        tasks: { t_dead: '2026-11-11T10:00:00.000Z' },
        notes: {},
        quotes: {},
        goals: {},
        thoughts: {}
      }
    };

    const merged = env.Sync.mergeStates(localState, remoteState);

    // Tombstoned entities must stay deleted
    assert.strictEqual(merged.goals.some(g => g.id === 'p_dead'), false, 'Tombstoned goal must not reappear');
    assert.strictEqual(merged.thoughts.some(t => t.id === 'th_deleted'), false, 'Tombstoned thought must not reappear');
    assert.ok(merged.tombstones.thoughts.th_deleted, 'Merged tombstones must preserve tombstones.thoughts');

    // Extended plan fields preserved and tombstoned refs cleaned
    const mergedPlan = merged.goals.find(g => g.id === 'p_keep');
    assert.ok(mergedPlan);
    assert.strictEqual(mergedPlan.title, 'Remote Plan Newer');
    assert.strictEqual(mergedPlan.strategy, 'Updated remote strategy');
    assert.strictEqual(mergedPlan.order, 2);
    assert.jsonEqual(mergedPlan.linkedHabitIds, ['h_keep'], 'Tombstoned habit IDs must be stripped during merge');
    assert.jsonEqual(mergedPlan.linkedTaskIds, ['t_keep'], 'Tombstoned task IDs must be stripped during merge');

    // Child goal & thought pointing to tombstoned plan must have references cleared
    const mergedChild = merged.goals.find(g => g.id === 'p_child');
    assert.strictEqual(mergedChild.parentId, null, 'Child goal parentId pointing to tombstoned plan must be cleared');

    const detachedThought = merged.thoughts.find(t => t.id === 'th_orphan_plan');
    assert.strictEqual(detachedThought.planId, null, 'Thought planId pointing to tombstoned plan must be cleared');

    // Thought LWW merge & remote-only ingestion
    const sharedThought = merged.thoughts.find(t => t.id === 'th_shared');
    assert.strictEqual(sharedThought.title, 'Shared Newer Local', 'Newer local thought must win');
    assert.strictEqual(sharedThought.readCount, 3);

    const remoteThought = merged.thoughts.find(t => t.id === 'th_remote_only');
    assert.ok(remoteThought, 'Remote-only thought must be merged into local state');
    assert.strictEqual(remoteThought.color, 'sage');
    assert.strictEqual(remoteThought.planId, 'p_keep');
  });
});
