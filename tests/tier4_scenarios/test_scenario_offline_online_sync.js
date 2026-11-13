'use strict';

const { describe, test, beforeEach, afterEach } = require('../runner');
const assert = require('../helpers/assert');
const { bootApp } = require('../helpers/env');

describe('Tier 4: Scenario 4 - Multi-Device Sync & Offline Recovery', () => {
  let envA;
  let envB;

  afterEach(() => {
    if (envA) envA.teardown();
    if (envB) envB.teardown();
  });

  test('T4-SCEN-04: Multi-device sync simulation and offline recovery without data collision', async () => {
    const sharedPassword = 'MultiDeviceVault2026!';
    const sharedToken = 'ghp_multiDeviceSyncToken777';
    const sharedGistId = 'gist_multi_device_sim';

    // Shared remote Gist storage mock
    const remoteGist = {
      id: sharedGistId,
      files: {
        'hobby_tracker_vault.json.enc': {
          content: JSON.stringify({ initial: true })
        }
      }
    };

    const makeFetchHandler = () => async (url, opts = {}) => {
      const urlStr = String(url);
      const method = (opts.method || 'GET').toUpperCase();

      if (urlStr.includes('/gists') && method === 'GET') {
        return {
          ok: true,
          status: 200,
          json: async () => JSON.parse(JSON.stringify(remoteGist))
        };
      }

      if (urlStr.includes('/gists') && (method === 'PATCH' || method === 'POST')) {
        const bodyObj = JSON.parse(opts.body || '{}');
        const fileData = bodyObj.files && bodyObj.files['hobby_tracker_vault.json.enc'];
        if (fileData && fileData.content) {
          remoteGist.files['hobby_tracker_vault.json.enc'].content = fileData.content;
        }
        return {
          ok: true,
          status: 200,
          json: async () => JSON.parse(JSON.stringify(remoteGist))
        };
      }

      return { ok: true, status: 200, json: async () => ({}) };
    };

    // 1. Device A: Initial Setup and Data Creation
    envA = await bootApp({ systemDate: '2026-11-13' });
    envA.window.fetch = makeFetchHandler();
    await envA.unlockVault(sharedPassword, '1111');

    const habitA = await envA.Storage.createHabit({
      name: 'Cross-Platform Development',
      icon: '💻',
      color: '#2196f3'
    });

    const noteA = await envA.Storage.createNote({
      habitId: habitA.id,
      date: '2026-11-13',
      type: 'love',
      text: 'Smooth cross-device development experience'
    });
    await envA.Storage.updateCell(habitA.id, '2026-11-13', {
      status: 'done',
      noteId: noteA.id
    });

    await envA.Storage.saveDiary('2026-11-13', {
      entry: 'Initial entry logged from Device A workstation',
      mood: 'great',
      tasks: [{ title: 'Sync test baseline', status: 'done' }]
    });

    await envA.Storage.setKV('syncConfig', {
      token: sharedToken,
      gistId: sharedGistId,
      autoSync: false
    });

    // Device A pushes initial encrypted snapshot
    const syncResA1 = await envA.Sync.syncNow();
    assert.ok(syncResA1.success, `Device A initial sync must succeed: ${syncResA1.error || syncResA1.reason}`);

    const uploadedGistContent = remoteGist.files['hobby_tracker_vault.json.enc'].content;
    assert.ok(!uploadedGistContent.includes('Cross-Platform Development'), 'Zero plaintext leakage on Device A upload');
    assert.ok(!uploadedGistContent.includes('workstation'), 'Zero plaintext diary leakage on Device A upload');

    // 2. Device B: Setup and Pull Initial State
    envB = await bootApp({ systemDate: '2026-11-13' });
    envB.window.fetch = makeFetchHandler();
    await envB.unlockVault(sharedPassword, '2222');

    await envB.Storage.setKV('syncConfig', {
      token: sharedToken,
      gistId: sharedGistId,
      autoSync: false
    });

    const syncResB1 = await envB.Sync.syncNow();
    assert.ok(syncResB1.success, `Device B initial pull must succeed: ${syncResB1.error || syncResB1.reason}`);

    const stateB1 = await envB.Storage.getRawState();
    assert.ok(
      stateB1.habits.some(h => h.id === habitA.id),
      'Device B must receive habit created on Device A'
    );
    assert.ok(
      stateB1.notes.some(n => n.id === noteA.id),
      'Device B must receive note created on Device A'
    );
    assert.strictEqual(
      stateB1.diary['2026-11-13']?.entry,
      'Initial entry logged from Device A workstation'
    );

    // 3. Device A Goes Offline
    envA.window.navigator.onLine = false;
    envA.window.dispatchEvent(new envA.window.Event('offline'));
    assert.strictEqual(envA.Sync.status, 'offline', 'Device A sync status must be offline');

    // Device A makes edits while offline
    await envA.Storage.saveDiary('2026-11-12', {
      entry: 'Offline coding session on airplane mode',
      mood: 'good',
      tasks: [{ title: 'Work without wifi', status: 'done' }]
    });

    const offlineTask = await envA.Storage.createTask({
      title: 'Audit network reconnect logic'
    });
    await envA.Storage.updateTask(offlineTask.id, { status: 'pending' });

    // Device A attempts sync while offline -> fails gracefully without crashing
    const offlineSyncAttempt = await envA.Sync.syncNow();
    assert.strictEqual(offlineSyncAttempt.success, false, 'Sync while offline must fail gracefully');
    assert.strictEqual(offlineSyncAttempt.reason, 'offline', 'Sync failure reason must be "offline"');

    // 4. Device A Reconnects to Internet
    envA.window.navigator.onLine = true;
    envA.window.dispatchEvent(new envA.window.Event('online'));

    // Device A syncs offline changes to cloud
    const reconnectSyncA = await envA.Sync.syncNow();
    assert.ok(reconnectSyncA.success, `Device A reconnect sync must succeed: ${reconnectSyncA.error || reconnectSyncA.reason}`);

    // 5. Device B Pulls and Ingests Updated Snapshot
    const syncResB2 = await envB.Sync.syncNow();
    assert.ok(syncResB2.success, `Device B second sync must succeed: ${syncResB2.error || syncResB2.reason}`);

    // 6. Verify Device B received offline edits without data collision
    const stateB2 = await envB.Storage.getRawState();

    // Verify offline diary entry was merged into Device B
    assert.ok(
      stateB2.diary['2026-11-12'],
      'Device B must receive offline diary entry for 2026-11-12'
    );
    assert.strictEqual(
      stateB2.diary['2026-11-12'].entry,
      'Offline coding session on airplane mode'
    );
    assert.strictEqual(stateB2.diary['2026-11-12'].mood, 'good');

    // Verify offline task was merged into Device B
    assert.ok(
      stateB2.tasks.some(t => t.id === offlineTask.id),
      'Device B must receive offline task'
    );
    const receivedTask = stateB2.tasks.find(t => t.id === offlineTask.id);
    assert.strictEqual(receivedTask.title, 'Audit network reconnect logic');

    // Verify original data still intact on Device B
    assert.ok(
      stateB2.habits.some(h => h.id === habitA.id),
      'Device B original habit must remain intact'
    );
    assert.strictEqual(
      stateB2.diary['2026-11-13'].entry,
      'Initial entry logged from Device A workstation',
      'Device B original diary entry must remain intact'
    );
  });
});
