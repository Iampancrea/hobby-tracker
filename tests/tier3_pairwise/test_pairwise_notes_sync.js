'use strict';

const { describe, test, beforeEach, afterEach } = require('../runner');
const assert = require('../helpers/assert');
const { bootApp } = require('../helpers/env');

describe('Tier 3: Pairwise - Categorized Notes ↔ Encrypted Cloud Sync (R3 ↔ R5)', () => {
  let env1;
  let env2;

  beforeEach(async () => {
    env1 = await bootApp({ systemDate: '2026-11-13' });
    await env1.unlockVault('SharedMasterPassword999!', '1234');
  });

  afterEach(() => {
    if (env1) env1.teardown();
    if (env2) env2.teardown();
  });

  test('T3-PAIR-01: Categorized notes (Default, Love, Discipline) preserved through encrypted sync', async () => {
    const password = 'SharedMasterPassword999!';

    // 1. Create habits on Device 1
    const habitA = await env1.Storage.createHabit({ name: 'Creative Writing', icon: '✍️', color: '#ff9800' });
    const habitB = await env1.Storage.createHabit({ name: 'Physical Fitness', icon: '🏋️', color: '#4caf50' });

    // 2. Create categorized notes (Default, Love, Discipline)
    const noteDefault = await env1.Storage.createNote({
      habitId: habitA.id,
      date: '2026-11-13',
      type: 'default',
      text: 'Routine writing session completed 500 words'
    });

    const noteLove = await env1.Storage.createNote({
      habitId: habitA.id,
      date: '2026-11-12',
      type: 'love',
      text: 'Felt deep emotional flow writing chapter 4'
    });

    const noteDiscipline = await env1.Storage.createNote({
      habitId: habitB.id,
      date: '2026-11-13',
      type: 'discipline',
      text: 'Tired after work but pushed through full squat set'
    });

    assert.ok(noteDefault && noteDefault.id, 'Default note must be created with ID');
    assert.strictEqual(noteDefault.type, 'default');
    assert.ok(noteLove && noteLove.id, 'Love note must be created with ID');
    assert.strictEqual(noteLove.type, 'love');
    assert.ok(noteDiscipline && noteDiscipline.id, 'Discipline note must be created with ID');
    assert.strictEqual(noteDiscipline.type, 'discipline');

    // 3. Link cell records with noteId
    await env1.Storage.updateCell(habitA.id, '2026-11-13', { noteId: noteDefault.id, status: 'done' });
    await env1.Storage.updateCell(habitA.id, '2026-11-12', { noteId: noteLove.id, status: 'done' });
    await env1.Storage.updateCell(habitB.id, '2026-11-13', { noteId: noteDiscipline.id, status: 'done' });

    // 4. Configure Sync on Device 1
    let gistPayloadStore = null;

    env1.window.fetch = async (url, opts = {}) => {
      const urlStr = String(url);
      const method = (opts.method || 'GET').toUpperCase();

      if (urlStr.includes('/gists') && method === 'GET') {
        const fileContent = gistPayloadStore
          ? JSON.stringify(gistPayloadStore)
          : JSON.stringify({ initial: true });

        return {
          ok: true,
          status: 200,
          json: async () => ({
            id: 'mock_gist_t3_01',
            files: {
              'hobby_tracker_vault.json.enc': {
                content: fileContent
              }
            }
          })
        };
      }

      if (urlStr.includes('/gists') && (method === 'PATCH' || method === 'POST')) {
        const bodyObj = JSON.parse(opts.body || '{}');
        const fileData = bodyObj.files && bodyObj.files['hobby_tracker_vault.json.enc'];
        if (fileData && fileData.content) {
          gistPayloadStore = JSON.parse(fileData.content);
        }
        return {
          ok: true,
          status: 200,
          json: async () => ({
            id: 'mock_gist_t3_01',
            files: {
              'hobby_tracker_vault.json.enc': {
                content: fileData ? fileData.content : ''
              }
            }
          })
        };
      }

      return { ok: true, status: 200, json: async () => ({}) };
    };

    await env1.Storage.setKV('syncConfig', {
      token: 'ghp_testTokenT3NotesSync',
      gistId: 'mock_gist_t3_01',
      autoSync: false
    });

    // 5. Execute Cloud Sync from Device 1
    const syncResult = await env1.Sync.syncNow();
    assert.ok(syncResult.success, `Device 1 sync must succeed, got error: ${syncResult.error || syncResult.reason}`);
    assert.ok(gistPayloadStore, 'Encrypted gist payload must have been uploaded');

    // 6. Zero plaintext verification on encrypted gist payload
    const rawGistString = JSON.stringify(gistPayloadStore);
    assert.ok(!rawGistString.includes('Routine writing session'), 'Plaintext note text must not leak to sync storage');
    assert.ok(!rawGistString.includes('emotional flow'), 'Plaintext Love note must not leak to sync storage');
    assert.ok(!rawGistString.includes('pushed through full squat set'), 'Plaintext Discipline note must not leak to sync storage');

    // 7. Boot Device 2 (secondary vault instance)
    env2 = await bootApp({ systemDate: '2026-11-13' });
    await env2.unlockVault(password, '1234');

    // Configure Device 2 fetch to read the uploaded gist
    env2.window.fetch = async (url, opts = {}) => {
      const urlStr = String(url);
      const method = (opts.method || 'GET').toUpperCase();

      if (urlStr.includes('/gists') && method === 'GET') {
        return {
          ok: true,
          status: 200,
          json: async () => ({
            id: 'mock_gist_t3_01',
            files: {
              'hobby_tracker_vault.json.enc': {
                content: JSON.stringify(gistPayloadStore)
              }
            }
          })
        };
      }
      if (urlStr.includes('/gists') && (method === 'PATCH' || method === 'POST')) {
        return { ok: true, status: 200, json: async () => ({ id: 'mock_gist_t3_01' }) };
      }
      return { ok: true, status: 200, json: async () => ({}) };
    };

    await env2.Storage.setKV('syncConfig', {
      token: 'ghp_testTokenT3NotesSync',
      gistId: 'mock_gist_t3_01',
      autoSync: false
    });

    // 8. Pull and sync on Device 2
    const device2Sync = await env2.Sync.syncNow();
    assert.ok(device2Sync.success, `Device 2 sync must succeed, got: ${device2Sync.error || device2Sync.reason}`);

    // 9. Verify decrypted state in Device 2 IndexedDB
    const state2 = await env2.Storage.getRawState();
    assert.ok(state2, 'Device 2 state must exist in storage');

    // Verify notes array
    assert.ok(Array.isArray(state2.notes), 'state.notes on Device 2 must be an array');
    const noteMap2 = new Map(state2.notes.map(n => [n.id, n]));

    const retrievedDefault = noteMap2.get(noteDefault.id);
    assert.ok(retrievedDefault, 'Default note must be present on Device 2 after sync');
    assert.strictEqual(retrievedDefault.type, 'default', 'Default note type must match');
    assert.strictEqual(retrievedDefault.text, 'Routine writing session completed 500 words');

    const retrievedLove = noteMap2.get(noteLove.id);
    assert.ok(retrievedLove, 'Love note must be present on Device 2 after sync');
    assert.strictEqual(retrievedLove.type, 'love', 'Love note type must match');
    assert.strictEqual(retrievedLove.text, 'Felt deep emotional flow writing chapter 4');

    const retrievedDiscipline = noteMap2.get(noteDiscipline.id);
    assert.ok(retrievedDiscipline, 'Discipline note must be present on Device 2 after sync');
    assert.strictEqual(retrievedDiscipline.type, 'discipline', 'Discipline note type must match');
    assert.strictEqual(retrievedDiscipline.text, 'Tired after work but pushed through full squat set');

    // 10. Verify cell.noteId linkages on Device 2
    assert.ok(state2.cells, 'state.cells must exist on Device 2');
    const cellKeyA1 = `${habitA.id}|2026-11-13`;
    const cellKeyA2 = `${habitA.id}|2026-11-12`;
    const cellKeyB1 = `${habitB.id}|2026-11-13`;

    assert.ok(state2.cells[cellKeyA1], `Cell ${cellKeyA1} must exist on Device 2`);
    assert.strictEqual(state2.cells[cellKeyA1].noteId, noteDefault.id, 'Cell noteId linkage for Default note must be intact');

    assert.ok(state2.cells[cellKeyA2], `Cell ${cellKeyA2} must exist on Device 2`);
    assert.strictEqual(state2.cells[cellKeyA2].noteId, noteLove.id, 'Cell noteId linkage for Love note must be intact');

    assert.ok(state2.cells[cellKeyB1], `Cell ${cellKeyB1} must exist on Device 2`);
    assert.strictEqual(state2.cells[cellKeyB1].noteId, noteDiscipline.id, 'Cell noteId linkage for Discipline note must be intact');
  });
});
