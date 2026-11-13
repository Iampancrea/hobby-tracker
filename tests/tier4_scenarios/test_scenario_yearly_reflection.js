'use strict';

const { describe, test, beforeEach, afterEach } = require('../runner');
const assert = require('../helpers/assert');
const { bootApp } = require('../helpers/env');

describe('Tier 4: Scenario 2 - Year-in-Review Historical Reflection (Memory Lane Jump)', () => {
  let env;

  beforeEach(async () => {
    env = await bootApp({ systemDate: '2026-11-13' });
    await env.unlockVault('TestPassword123!');
  });

  afterEach(() => {
    if (env) env.teardown();
  });

  test('T4-SCEN-02: Memory lane past year reflection across historical dates and return to today', async () => {
    const todayStr = '2026-11-13';
    const pastAug24 = '2025-08-24';
    const pastAug25 = '2025-08-25';
    const pastAug26 = '2025-08-26';

    // 1. Pre-populate historical entries for August 2025
    await env.Storage.saveDiary(pastAug24, {
      entry: 'Preparing packing list for mountain trip',
      mood: 'good',
      tasks: [{ title: 'Pack hiking boots', status: 'done' }]
    });

    await env.Storage.saveDiary(pastAug25, {
      entry: 'Arrived at lakeside cabin, magnificent sunset',
      mood: 'great',
      tasks: [{ title: 'Unpack camera gear', status: 'done' }]
    });

    await env.Storage.saveDiary(pastAug26, {
      entry: 'Early morning kayak ride around island',
      mood: 'great',
      tasks: [{ title: 'Charge drone batteries', status: 'done' }]
    });

    // Pre-populate today's entry
    await env.Storage.saveDiary(todayStr, {
      entry: 'Focusing on end-of-year goals and project delivery today',
      mood: 'okay',
      tasks: [{ title: 'Run automated test matrix', status: 'pending' }]
    });

    // 2. Open Diary view
    env.switchView('diary');

    // 3. Jump sidebar calendar / date selector to August 25th of previous year (2025-08-25)
    await env.selectDiaryDate(pastAug25);
    assert.strictEqual(env.Views.currentDiaryDate, pastAug25, 'currentDiaryDate must equal August 25 2025');

    const dateInput = env.document.getElementById('diary-date');
    if (dateInput) assert.strictEqual(dateInput.value, pastAug25);

    const diaryEntryEl = env.document.getElementById('diary-entry');
    assert.ok(diaryEntryEl, '#diary-entry textarea must exist');
    assert.ok(
      diaryEntryEl.value.includes('Arrived at lakeside cabin, magnificent sunset'),
      'Historical entry for August 25 2025 must be displayed in textarea value'
    );

    const greatMoodBtn = env.document.querySelector('.mood-btn[data-mood="great"]');
    assert.ok(greatMoodBtn, 'Mood great button must exist');
    assert.domHasClass(env.document, greatMoodBtn, 'active', 'Mood great must be active for historical date');

    // 4. Update historical reflection with 1-year anniversary perspective
    const updatedReflection = 'Arrived at lakeside cabin, magnificent sunset — [1-Year Anniversary Edit]: That sunset inspired our entire creative journey.';
    const aug25Data = await env.Storage.getDiary(pastAug25);
    aug25Data.entry = updatedReflection;
    await env.Storage.saveDiary(pastAug25, aug25Data);
    await env.Views.renderDiary();

    assert.ok(
      diaryEntryEl.value.includes('[1-Year Anniversary Edit]'),
      'Updated reflection must render in diary textarea value'
    );

    // 5. Step day-by-day: Step backward to Aug 24
    const prevBtn = env.document.getElementById('prev-day');
    assert.ok(prevBtn, '#prev-day button must exist');
    env.click(prevBtn);
    await new Promise(r => setTimeout(r, 15));

    assert.strictEqual(env.Views.currentDiaryDate, pastAug24, 'Clicking prev-day must step back to Aug 24');
    assert.ok(diaryEntryEl.value.includes('Preparing packing list for mountain trip'));
    const goodMoodBtn = env.document.querySelector('.mood-btn[data-mood="good"]');
    assert.domHasClass(env.document, goodMoodBtn, 'active', 'Mood "good" must be active for Aug 24');

    // 6. Step forward to Aug 25
    const nextBtn = env.document.getElementById('next-day');
    assert.ok(nextBtn, '#next-day button must exist');
    env.click(nextBtn);
    await new Promise(r => setTimeout(r, 15));

    assert.strictEqual(env.Views.currentDiaryDate, pastAug25, 'Stepping forward must return to Aug 25');
    assert.ok(diaryEntryEl.value.includes('[1-Year Anniversary Edit]'));
    assert.domHasClass(env.document, greatMoodBtn, 'active');

    // 7. Step forward to Aug 26
    env.click(nextBtn);
    await new Promise(r => setTimeout(r, 15));

    assert.strictEqual(env.Views.currentDiaryDate, pastAug26, 'Stepping forward must advance to Aug 26');
    assert.ok(diaryEntryEl.value.includes('Early morning kayak ride around island'));
    assert.domHasClass(env.document, greatMoodBtn, 'active');

    // 8. Return to Today (2026-11-13)
    await env.selectDiaryDate(todayStr);
    assert.strictEqual(env.Views.currentDiaryDate, todayStr, 'Must return cleanly to today');
    assert.ok(diaryEntryEl.value.includes('Focusing on end-of-year goals and project delivery today'));

    const okayMoodBtn = env.document.querySelector('.mood-btn[data-mood="okay"]');
    assert.domHasClass(env.document, okayMoodBtn, 'active', 'Today mood "okay" must be active');

    // 9. Verify storage integrity across past and present
    const finalState = await env.Storage.getRawState();
    assert.strictEqual(finalState.diary[pastAug25].entry, updatedReflection, 'Historical edit must persist in storage');
    assert.strictEqual(finalState.diary[pastAug25].mood, 'great');

    assert.strictEqual(
      finalState.diary[todayStr].entry,
      'Focusing on end-of-year goals and project delivery today',
      'Today entry must remain completely unaffected by historical edits'
    );
    assert.strictEqual(finalState.diary[todayStr].mood, 'okay');
  });
});
