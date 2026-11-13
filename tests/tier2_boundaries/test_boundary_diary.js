'use strict';

const { describe, test, beforeEach, afterEach } = require('../runner');
const assert = require('../helpers/assert');
const { bootApp } = require('../helpers/env');

describe('Tier 2: Boundary & Corner Cases — Diary (R1)', () => {
  let env;

  beforeEach(async () => {
    env = await bootApp({ systemDate: '2026-11-13' });
    await env.unlockVault('TestPassword123!');
    env.switchView('diary');
  });

  afterEach(() => {
    if (env) env.teardown();
  });

  test('T2-R1-01: Leap Year Date Calculation (Feb 29)', async () => {
    // 1. Direct date jump to leap day (2024-02-29)
    await env.selectDiaryDate('2024-02-29');
    assert.strictEqual(env.Views.currentDiaryDate, '2024-02-29', 'Views.currentDiaryDate must equal 2024-02-29 on leap year');
    const dateInput = env.document.getElementById('diary-date');
    if (dateInput) {
      assert.strictEqual(dateInput.value, '2024-02-29', '#diary-date input must display 2024-02-29');
    }

    // 2. Stepping forward from 2024-02-28 must land on 2024-02-29
    await env.selectDiaryDate('2024-02-28');
    env.click('#next-day');
    await new Promise(r => setTimeout(r, 15));
    assert.strictEqual(env.Views.currentDiaryDate, '2024-02-29', 'Stepping next from 2024-02-28 must land on leap day 2024-02-29');

    // 3. Stepping forward from leap day 2024-02-29 must land on 2024-03-01
    env.click('#next-day');
    await new Promise(r => setTimeout(r, 15));
    assert.strictEqual(env.Views.currentDiaryDate, '2024-03-01', 'Stepping next from 2024-02-29 must land on 2024-03-01');

    // 4. Stepping backward from 2024-03-01 must land on 2024-02-29
    env.click('#prev-day');
    await new Promise(r => setTimeout(r, 15));
    assert.strictEqual(env.Views.currentDiaryDate, '2024-02-29', 'Stepping prev from 2024-03-01 must land on leap day 2024-02-29');

    // 5. Non-leap year: stepping forward from 2023-02-28 must skip to 2023-03-01
    await env.selectDiaryDate('2023-02-28');
    env.click('#next-day');
    await new Promise(r => setTimeout(r, 15));
    assert.strictEqual(env.Views.currentDiaryDate, '2023-03-01', 'Stepping next from 2023-02-28 on non-leap year must advance directly to 2023-03-01');

    // 6. Stepping backward from 2023-03-01 must land on 2023-02-28
    env.click('#prev-day');
    await new Promise(r => setTimeout(r, 15));
    assert.strictEqual(env.Views.currentDiaryDate, '2023-02-28', 'Stepping prev from 2023-03-01 on non-leap year must land on 2023-02-28');
  });

  test('T2-R1-02: Year Transition Rollover (Dec 31 to Jan 1)', async () => {
    // 1. Jump to New Year Eve 2025-12-31
    await env.selectDiaryDate('2025-12-31');
    assert.strictEqual(env.Views.currentDiaryDate, '2025-12-31');

    // 2. Step forward across year boundary
    env.click('#next-day');
    await new Promise(r => setTimeout(r, 15));
    assert.strictEqual(env.Views.currentDiaryDate, '2026-01-01', 'Stepping next across 2025-12-31 must transition smoothly to 2026-01-01');
    const dateInput = env.document.getElementById('diary-date');
    if (dateInput) {
      assert.strictEqual(dateInput.value, '2026-01-01', '#diary-date value must update to 2026-01-01');
    }

    // 3. Step backward across year boundary
    env.click('#prev-day');
    await new Promise(r => setTimeout(r, 15));
    assert.strictEqual(env.Views.currentDiaryDate, '2025-12-31', 'Stepping prev across 2026-01-01 must transition back to 2025-12-31');
    if (dateInput) {
      assert.strictEqual(dateInput.value, '2025-12-31', '#diary-date value must update to 2025-12-31');
    }

    // 4. Secondary decade boundary transition (2029-12-31 to 2030-01-01)
    await env.selectDiaryDate('2029-12-31');
    env.click('#next-day');
    await new Promise(r => setTimeout(r, 15));
    assert.strictEqual(env.Views.currentDiaryDate, '2030-01-01', 'Decade boundary transition to 2030-01-01 must calculate cleanly');
  });

  test('T2-R1-03: Distant Past Date Navigation (10+ Years)', async () => {
    const pastDate = '2015-01-01';
    await env.selectDiaryDate(pastDate);

    assert.strictEqual(env.Views.currentDiaryDate, pastDate, 'Views.currentDiaryDate must update to distant past date');
    const dateInput = env.document.getElementById('diary-date');
    if (dateInput) {
      assert.strictEqual(dateInput.value, pastDate, '#diary-date input must display distant past date');
    }

    // Verify empty diary state renders gracefully without error
    const entryEl = env.document.getElementById('diary-entry');
    assert.ok(entryEl, '#diary-entry textarea must exist');
    assert.strictEqual(entryEl.value, '', 'Distant past date without entry must display empty textarea');

    const tasksContainer = env.document.getElementById('diary-tasks');
    assert.ok(tasksContainer, '#diary-tasks container must exist');
    assert.domContains(env.document, tasksContainer, 'No tasks for today', 'Distant past date must render empty tasks state');

    // No mood button should be active on an unrecorded date
    const activeMood = env.document.querySelector('.mood-btn.active');
    assert.strictEqual(activeMood, null, 'No mood button should have .active on an empty date');

    // Persistence on distant past date
    const testEntry = 'Reflecting on an entry 10+ years ago.';
    await env.type('#diary-entry', testEntry);
    entryEl.dispatchEvent(new env.window.Event('blur'));
    await new Promise(r => setTimeout(r, 20));

    // Navigate to today and return to verify persistence
    await env.selectDiaryDate('2026-11-13');
    await env.selectDiaryDate(pastDate);
    assert.strictEqual(env.document.getElementById('diary-entry').value, testEntry, 'Historical entry must reload cleanly from storage');
  });

  test('T2-R1-04: Rapid Consecutive Mood Clicks', async () => {
    const testDate = '2026-11-13';
    await env.selectDiaryDate(testDate);

    const moods = ['great', 'good', 'okay', 'bad', 'terrible'];
    const buttons = moods.map(m => env.document.querySelector(`.mood-btn[data-mood="${m}"]`));
    for (const btn of buttons) {
      assert.ok(btn, 'Mood button must exist');
    }

    // Rapid consecutive clicks across mood selector in <50ms
    for (const btn of buttons) {
      env.click(btn);
      await new Promise(r => setTimeout(r, 8));
    }
    await new Promise(r => setTimeout(r, 40));

    const lastBtn = buttons[buttons.length - 1]; // terrible
    assert.domHasClass(env.document, lastBtn, 'active', 'Last clicked mood button ("terrible") must have .active class');

    // Confirm all other mood buttons do not have .active class
    for (let i = 0; i < buttons.length - 1; i++) {
      assert.domNotHasClass(env.document, buttons[i], 'active', `Prior mood button "${moods[i]}" must not have .active class`);
    }

    // Verify storage record holds the stabilized mood
    const rawState = await env.Storage.getRawState();
    const entry = rawState.diary && rawState.diary[testDate];
    assert.ok(entry, `Diary record for ${testDate} must exist in storage`);
    assert.strictEqual(entry.mood, 'terrible', 'Persisted mood must match last clicked button "terrible"');
  });

  test('T2-R1-05: Massive Unicode & Emoji Diary Text', async () => {
    const testDate = '2026-11-13';
    await env.selectDiaryDate(testDate);

    // Build 10,000+ characters of mixed Arabic, Chinese, Devanagari, and complex emojis
    const unicodePattern = 'العربية 中文测试 नमस्ते दुनिया 👨‍👩‍👧‍👦 🧘🏽‍♂️ 🚀 🌟 🏳️‍🌈 \nSpecial symbols: <>&"\'`~@#$%^&*()_+-=[]{}|;:,.<>?/\\\n';
    let massiveContent = '';
    while (massiveContent.length < 10500) {
      massiveContent += unicodePattern;
    }

    const textarea = env.document.getElementById('diary-entry');
    assert.ok(textarea, '#diary-entry textarea must exist');

    await env.type(textarea, massiveContent);
    textarea.dispatchEvent(new env.window.Event('blur'));
    await new Promise(r => setTimeout(r, 30));

    // Verify raw storage content preserves exact characters
    const rawState = await env.Storage.getRawState();
    const diaryRecord = rawState.diary && rawState.diary[testDate];
    assert.ok(diaryRecord, 'Diary record must be saved in storage');
    assert.strictEqual(diaryRecord.entry, massiveContent, 'Storage must store 10,000+ character Unicode text with exact fidelity');

    // Navigate to another date and return to test full reload cycle
    await env.selectDiaryDate('2026-11-12');
    assert.notStrictEqual(env.document.getElementById('diary-entry').value, massiveContent);

    await env.selectDiaryDate(testDate);
    assert.strictEqual(
      env.document.getElementById('diary-entry').value,
      massiveContent,
      'Diary textarea must reload 10,000+ character Unicode & emoji string with 100% byte fidelity'
    );
  });

  test('T2-R1-06: Whitespace & Empty Diary Tasks', async () => {
    const testDate = '2026-11-13';
    await env.selectDiaryDate(testDate);

    const taskInput = env.document.getElementById('new-diary-task');
    const addBtn = env.document.getElementById('add-diary-task-btn');
    assert.ok(taskInput, '#new-diary-task input must exist');
    assert.ok(addBtn, '#add-diary-task-btn button must exist');

    // 1. Submitting empty string
    taskInput.value = '';
    env.click(addBtn);
    await new Promise(r => setTimeout(r, 15));

    // 2. Submitting spaces only
    taskInput.value = '     ';
    env.click(addBtn);
    await new Promise(r => setTimeout(r, 15));

    // 3. Submitting tabs and newlines
    taskInput.value = '\t \n \t ';
    env.click(addBtn);
    await new Promise(r => setTimeout(r, 15));

    // Verify no tasks were created in storage
    let diary = await env.Storage.getDiary(testDate);
    assert.strictEqual(
      (diary.tasks || []).length,
      0,
      'Submitting empty or whitespace-only task must not create items in diary.tasks'
    );

    // 4. Submit legitimate task
    taskInput.value = 'Legitimate diary task';
    env.click(addBtn);
    await new Promise(r => setTimeout(r, 15));

    diary = await env.Storage.getDiary(testDate);
    assert.strictEqual(diary.tasks.length, 1, 'Legitimate task must be added');
    assert.strictEqual(diary.tasks[0].title, 'Legitimate diary task');

    // 5. Submit whitespace again after valid task
    taskInput.value = '   ';
    env.click(addBtn);
    await new Promise(r => setTimeout(r, 15));

    diary = await env.Storage.getDiary(testDate);
    assert.strictEqual(diary.tasks.length, 1, 'Subsequent whitespace submission must be rejected');
  });
});
