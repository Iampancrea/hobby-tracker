'use strict';

const { describe, test, beforeEach, afterEach } = require('../runner');
const assert = require('../helpers/assert');
const { bootApp } = require('../helpers/env');

describe('Tier 4: Scenario 1 - Day-in-the-Life User Workflow (E2E Integration)', () => {
  let env;

  beforeEach(async () => {
    env = await bootApp({ systemDate: '2026-11-13' });
  });

  afterEach(() => {
    if (env) env.teardown();
  });

  test('T4-SCEN-01: Complete day-in-the-life user workflow from PIN unlock to sync and lock', async () => {
    const masterPassword = 'MorningRoutineMaster2026!';
    const pin = '5555';
    const todayStr = '2026-11-13';
    const yesterdayStr = '2026-11-12';

    // 1. Initial Setup: Create master password, PIN, and wrapped key
    await env.unlockVault(masterPassword, pin);
    const auth = await env.Storage.getKV('auth');
    auth.wrappedMasterKey = await env.CryptoUtils.encrypt({ masterPassword }, pin);
    await env.Storage.setKV('auth', auth);

    // Initial habit creation
    const habitRun = await env.Storage.createHabit({
      name: 'Morning Run & Stretch',
      icon: '🏃',
      color: '#4caf50'
    });

    // Lock vault to begin real-world morning unlock scenario
    await env.Auth.lockApp();
    assert.strictEqual(env.Storage.isUnlocked(), false, 'Vault must be locked prior to morning workflow');

    // 2. Step 1: User wakes up and unlocks vault via 4-digit PIN
    const pinResult = await env.Storage.loginWithPin(pin);
    assert.ok(pinResult && pinResult.success, 'PIN quick-unlock must succeed');
    assert.strictEqual(env.Storage.isUnlocked(), true, 'Vault must be unlocked after PIN login');

    // Unwrap master key for background crypto
    let activePassword = env.Storage.getMasterPassword();
    if (!activePassword) {
      const storedAuth = await env.Storage.getKV('auth');
      if (storedAuth && storedAuth.wrappedMasterKey) {
        const unwrapped = await env.CryptoUtils.decrypt(storedAuth.wrappedMasterKey, pin);
        activePassword = unwrapped.masterPassword;
        await env.Storage.setUnlocked(true, activePassword);
      }
    }
    assert.strictEqual(activePassword, masterPassword);

    // 3. Step 2: View morning motivational quote in top header banner
    env.Views.renderTopQuote();
    const banner = env.document.getElementById('top-quote-banner');
    assert.ok(banner, '#top-quote-banner must exist');
    assert.domVisible(env.document, banner, 'Quote banner must be visible in morning workflow');
    const quoteTextEl = env.document.getElementById('quote-text');
    assert.ok(quoteTextEl && quoteTextEl.textContent.trim().length > 0, 'Morning quote text must be rendered');

    // 4. Step 3: Mark today's habit done in 30-day grid
    env.switchView('habits');
    await env.Storage.updateCell(habitRun.id, todayStr, { status: 'done' });
    await env.Views.renderHabits();

    const stateAfterDone = await env.Storage.getRawState();
    const todayCellKey = `${habitRun.id}|${todayStr}`;
    assert.ok(stateAfterDone.cells[todayCellKey], 'Today cell record must exist');
    assert.strictEqual(stateAfterDone.cells[todayCellKey].status, 'done', 'Today habit must be marked done');

    // 5. Step 4: Attach a Discipline note to yesterday's missed habit
    await env.Storage.updateCell(habitRun.id, yesterdayStr, { status: 'missed' });
    const disciplineNote = await env.Storage.createNote({
      habitId: habitRun.id,
      date: yesterdayStr,
      type: 'discipline',
      text: 'Rainy morning, missed the outdoor run, but held self accountable with indoor stretches'
    });
    await env.Storage.updateCell(habitRun.id, yesterdayStr, {
      status: 'missed',
      noteId: disciplineNote.id
    });

    const stateAfterNote = await env.Storage.getRawState();
    const yesterdayCellKey = `${habitRun.id}|${yesterdayStr}`;
    assert.strictEqual(stateAfterNote.cells[yesterdayCellKey].status, 'missed');
    assert.strictEqual(stateAfterNote.cells[yesterdayCellKey].noteId, disciplineNote.id);
    const foundDisciplineNote = stateAfterNote.notes.find(n => n.id === disciplineNote.id);
    assert.ok(foundDisciplineNote);
    assert.strictEqual(foundDisciplineNote.type, 'discipline');

    // 6. Step 5: Switch to Tasks view, create tasks and complete budget review
    env.switchView('tasks');
    const taskBudget = await env.Storage.createTask({ title: 'Complete Q4 budget review' });
    await env.Storage.updateTask(taskBudget.id, { status: 'pending' });

    const taskAuto = await env.Storage.createTask({ title: 'Call auto shop for inspection' });
    await env.Storage.updateTask(taskAuto.id, { status: 'pending' });

    // Complete taskBudget
    await env.Storage.updateTask(taskBudget.id, { status: 'done' });

    const stateAfterTasks = await env.Storage.getRawState();
    const budgetStored = stateAfterTasks.tasks.find(t => t.id === taskBudget.id);
    const autoStored = stateAfterTasks.tasks.find(t => t.id === taskAuto.id);
    assert.strictEqual(budgetStored.status, 'done', 'Budget review task must be completed');
    assert.strictEqual(autoStored.status, 'pending', 'Auto inspection task must remain pending');

    // 7. Step 6: Open Diary, log mood "Great" and daily reflection
    env.switchView('diary');
    await env.selectDiaryDate(todayStr);

    const diaryReflectionText = 'Great energetic morning. Budget finalized early and weather cleared up nicely.';
    await env.Storage.saveDiary(todayStr, {
      entry: diaryReflectionText,
      mood: 'great',
      tasks: [{ title: 'Morning mindfulness session', status: 'done' }]
    });
    await env.Views.renderDiary();

    const greatBtn = env.document.querySelector('.mood-btn[data-mood="great"]');
    assert.ok(greatBtn, 'Mood great button must exist');
    assert.domHasClass(env.document, greatBtn, 'active', 'Mood "great" must be active on diary view');

    const diaryInput = env.document.getElementById('diary-entry');
    assert.ok(diaryInput && diaryInput.value.includes('Great energetic morning'), 'Diary reflection must be rendered');

    // 8. Step 7: Cloud Auto-Sync
    let syncPayload = null;
    env.window.fetch = async (url, opts = {}) => {
      const urlStr = String(url);
      const method = (opts.method || 'GET').toUpperCase();

      if (urlStr.includes('/gists') && method === 'GET') {
        return {
          ok: true,
          status: 200,
          json: async () => ({
            id: 'mock_gist_daily_flow',
            files: {
              'hobby_tracker_vault.json.enc': {
                content: JSON.stringify({ initial: true })
              }
            }
          })
        };
      }

      if (urlStr.includes('/gists') && (method === 'PATCH' || method === 'POST')) {
        const body = JSON.parse(opts.body || '{}');
        const fileData = body.files && body.files['hobby_tracker_vault.json.enc'];
        if (fileData && fileData.content) {
          syncPayload = JSON.parse(fileData.content);
        }
        return { ok: true, status: 200, json: async () => ({ id: 'mock_gist_daily_flow' }) };
      }

      return { ok: true, status: 200, json: async () => ({}) };
    };

    await env.Storage.setKV('syncConfig', {
      token: 'ghp_dailyWorkflowToken',
      gistId: 'mock_gist_daily_flow',
      autoSync: true
    });

    const syncRes = await env.Sync.syncNow();
    assert.ok(syncRes.success, `Sync must succeed: ${syncRes.error || syncRes.reason}`);
    assert.ok(syncPayload, 'Sync payload must be uploaded');

    // Verify zero plaintext in sync payload
    const rawSync = JSON.stringify(syncPayload);
    assert.ok(!rawSync.includes('Great energetic morning'), 'Plaintext diary reflection must not leak');
    assert.ok(!rawSync.includes('Morning Run & Stretch'), 'Plaintext habit name must not leak');

    // 9. Step 8: Lock Vault at end of day
    await env.Auth.lockApp();
    assert.strictEqual(env.Storage.isUnlocked(), false, 'Vault must be locked at conclusion of daily workflow');
    assert.strictEqual(env.window.sessionStorage.getItem('ht_vault_key'), null);
    assert.domVisible(env.document, '#login-screen');
    assert.domHidden(env.document, '#app');
  });
});
