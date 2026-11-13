'use strict';

const { describe, test, beforeEach, afterEach } = require('../runner');
const assert = require('../helpers/assert');
const { bootApp } = require('../helpers/env');

describe('Tier 3: Pairwise - Diary Date Navigation ↔ Mood Persistence (R1 ↔ R1)', () => {
  let env;

  beforeEach(async () => {
    env = await bootApp({ systemDate: '2026-11-13' });
    await env.unlockVault('TestPassword123!');
    env.switchView('diary');
  });

  afterEach(() => {
    if (env) env.teardown();
  });

  test('T3-PAIR-03: Multi-date jumping and independent mood persistence across dates/years', async () => {
    const date1 = '2024-03-15'; // 2 years in the past (leap year)
    const date2 = '2025-07-20'; // 1 year in the past
    const date3 = '2026-11-13'; // Current date

    // 1. Assign mood & entry for Date 1 (2024-03-15) -> "great"
    await env.selectDiaryDate(date1);
    await env.Storage.saveDiary(date1, {
      mood: 'great',
      entry: 'Journey to the mountains in spring 2024',
      tasks: []
    });

    // 2. Assign mood & entry for Date 2 (2025-07-20) -> "okay"
    await env.selectDiaryDate(date2);
    await env.Storage.saveDiary(date2, {
      mood: 'okay',
      entry: 'Quiet summer day working from home',
      tasks: []
    });

    // 3. Assign mood & entry for Date 3 (2026-11-13) -> "terrible"
    await env.selectDiaryDate(date3);
    await env.Storage.saveDiary(date3, {
      mood: 'terrible',
      entry: 'Challenging debugging sessions all afternoon',
      tasks: []
    });

    // Helper to check active mood button
    const assertActiveMood = (expectedMood) => {
      const allMoodBtns = env.document.querySelectorAll('.mood-btn');
      assert.ok(allMoodBtns.length >= 5, 'All 5 mood buttons must exist in the DOM');

      for (const btn of allMoodBtns) {
        const moodVal = btn.dataset.mood;
        if (moodVal === expectedMood) {
          assert.domHasClass(
            env.document,
            btn,
            'active',
            `Mood button "${expectedMood}" must have .active class`
          );
        } else {
          assert.domNotHasClass(
            env.document,
            btn,
            'active',
            `Mood button "${moodVal}" must NOT have .active class`
          );
        }
      }
    };

    // 4. Jump to Date 1 (2024-03-15) and verify state
    await env.selectDiaryDate(date1);
    assert.strictEqual(env.Views.currentDiaryDate, date1);
    const dateInput1 = env.document.getElementById('diary-date');
    if (dateInput1) assert.strictEqual(dateInput1.value, date1);
    const entryEl1 = env.document.getElementById('diary-entry');
    assert.ok(entryEl1 && entryEl1.value.includes('Journey to the mountains'));
    assertActiveMood('great');

    // 5. Jump to Date 2 (2025-07-20) and verify state
    await env.selectDiaryDate(date2);
    assert.strictEqual(env.Views.currentDiaryDate, date2);
    const dateInput2 = env.document.getElementById('diary-date');
    if (dateInput2) assert.strictEqual(dateInput2.value, date2);
    const entryEl2 = env.document.getElementById('diary-entry');
    assert.ok(entryEl2 && entryEl2.value.includes('Quiet summer day'));
    assertActiveMood('okay');

    // 6. Jump to Date 3 (2026-11-13) and verify state
    await env.selectDiaryDate(date3);
    assert.strictEqual(env.Views.currentDiaryDate, date3);
    const dateInput3 = env.document.getElementById('diary-date');
    if (dateInput3) assert.strictEqual(dateInput3.value, date3);
    const entryEl3 = env.document.getElementById('diary-entry');
    assert.ok(entryEl3 && entryEl3.value.includes('Challenging debugging'));
    assertActiveMood('terrible');

    // 7. Step back 1 day with #prev-day button to unvisited date 2026-11-12
    const prevBtn = env.document.getElementById('prev-day');
    assert.ok(prevBtn, '#prev-day button must exist');
    env.click(prevBtn);
    await new Promise(r => setTimeout(r, 15));

    assert.strictEqual(env.Views.currentDiaryDate, '2026-11-12');
    // For unvisited date, no mood button should be active
    const unvisitedBtns = env.document.querySelectorAll('.mood-btn.active');
    assert.strictEqual(
      unvisitedBtns.length,
      0,
      'Unvisited date must have zero active mood buttons'
    );

    // 8. Step forward 1 day with #next-day button back to 2026-11-13
    const nextBtn = env.document.getElementById('next-day');
    assert.ok(nextBtn, '#next-day button must exist');
    env.click(nextBtn);
    await new Promise(r => setTimeout(r, 15));

    assert.strictEqual(env.Views.currentDiaryDate, '2026-11-13');
    assertActiveMood('terrible');

    // 9. Jump back to Date 1 (2024-03-15) to confirm zero bleed-over
    await env.selectDiaryDate(date1);
    assert.strictEqual(env.Views.currentDiaryDate, date1);
    assertActiveMood('great');

    // 10. Verify storage records
    const rawState = await env.Storage.getRawState();
    assert.strictEqual(rawState.diary[date1].mood, 'great');
    assert.strictEqual(rawState.diary[date2].mood, 'okay');
    assert.strictEqual(rawState.diary[date3].mood, 'terrible');
  });
});
