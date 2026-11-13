'use strict';

const { describe, test, beforeEach, afterEach } = require('../runner');
const assert = require('../helpers/assert');
const { bootApp } = require('../helpers/env');

describe('Tier 1: Feature R1 - Diary Navigation & Mood Selector', () => {
  let env;

  beforeEach(async () => {
    env = await bootApp();
    await env.unlockVault('TestPassword123!');
    env.switchView('diary');
  });

  afterEach(() => {
    if (env) env.teardown();
  });

  test('T1-R1-01: Diary calendar sidebar renders month/year navigation', async () => {
    const sidebar = env.document.querySelector('.diary-sidebar, #diary-sidebar-calendar, .diary-calendar-nav');
    assert.ok(sidebar, 'Diary view must render a left sidebar calendar navigation');
    assert.domVisible(env.document, sidebar, 'Diary calendar sidebar navigation must be visible');
  });

  test('T1-R1-02: Direct date jump to arbitrary past date loads entry', async () => {
    const targetDate = '2025-08-25';
    await env.selectDiaryDate(targetDate);

    const diaryDateInput = env.document.getElementById('diary-date');
    assert.ok(diaryDateInput, '#diary-date input element must exist');
    assert.strictEqual(env.Views.currentDiaryDate, targetDate, 'Views.currentDiaryDate must equal target past date');
    assert.strictEqual(diaryDateInput.value, targetDate, '#diary-date value must equal target past date');
  });

  test('T1-R1-03: Backward day navigation steps date cleanly', async () => {
    await env.selectDiaryDate('2026-11-13');
    const prevBtn = env.document.getElementById('prev-day');
    assert.ok(prevBtn, '#prev-day button must exist');

    env.click(prevBtn);
    await new Promise(r => setTimeout(r, 10));

    assert.strictEqual(env.Views.currentDiaryDate, '2026-11-12', 'Clicking prev-day must decrement currentDiaryDate by 1 day');
    const diaryDateInput = env.document.getElementById('diary-date');
    if (diaryDateInput) {
      assert.strictEqual(diaryDateInput.value, '2026-11-12', '#diary-date value must be updated to previous day');
    }
  });

  test('T1-R1-04: Forward day navigation steps date cleanly', async () => {
    await env.selectDiaryDate('2026-11-13');
    const nextBtn = env.document.getElementById('next-day');
    assert.ok(nextBtn, '#next-day button must exist');

    env.click(nextBtn);
    await new Promise(r => setTimeout(r, 10));

    assert.strictEqual(env.Views.currentDiaryDate, '2026-11-14', 'Clicking next-day must increment currentDiaryDate by 1 day');
    const diaryDateInput = env.document.getElementById('diary-date');
    if (diaryDateInput) {
      assert.strictEqual(diaryDateInput.value, '2026-11-14', '#diary-date value must be updated to next day');
    }
  });

  test('T1-R1-05: Mood selector toggles active visual state', async () => {
    const greatMoodBtn = env.document.querySelector('.mood-btn[data-mood="great"]');
    assert.ok(greatMoodBtn, 'Mood button for "great" must exist in #mood-selector');

    env.click(greatMoodBtn);

    assert.domHasClass(env.document, greatMoodBtn, 'active', 'Clicked mood button must have .active class');

    const otherMoodBtns = env.document.querySelectorAll('.mood-btn:not([data-mood="great"])');
    for (const btn of otherMoodBtns) {
      assert.domNotHasClass(env.document, btn, 'active', 'Other mood buttons must NOT have .active class');
    }
  });

  test('T1-R1-06: Selected mood persists to storage on save', async () => {
    const testDate = '2026-11-13';
    await env.selectDiaryDate(testDate);

    const goodMoodBtn = env.document.querySelector('.mood-btn[data-mood="good"]');
    assert.ok(goodMoodBtn, 'Mood button for "good" must exist');
    env.click(goodMoodBtn);

    const rawState = await env.Storage.getRawState();
    const entry = rawState.diary && rawState.diary[testDate];
    assert.ok(entry, `Diary record for ${testDate} must exist in storage`);
    assert.strictEqual(entry.mood, 'good', 'Selected mood must be persisted in state.diary[date].mood');
  });

  test('T1-R1-07: Diary entry autosaves text without data loss', async () => {
    const testDate = '2026-11-13';
    await env.selectDiaryDate(testDate);

    const textarea = env.document.getElementById('diary-entry');
    assert.ok(textarea, '#diary-entry textarea must exist');

    const reflectionText = 'Today was a productive day building genuine E2E test infrastructure.';
    textarea.value = reflectionText;
    textarea.blur();

    await new Promise(r => setTimeout(r, 20));

    const rawState = await env.Storage.getRawState();
    assert.ok(rawState.diary && rawState.diary[testDate], 'Diary entry for test date must exist in storage');
    assert.strictEqual(rawState.diary[testDate].entry, reflectionText, 'Diary text must be autosaved in state.diary[date].entry');
  });
});
