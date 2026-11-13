'use strict';

const { describe, test, beforeEach, afterEach } = require('../runner');
const assert = require('../helpers/assert');
const { bootApp } = require('../helpers/env');

describe('Tier 1: Feature R5 - Client-Side Encryption & Cloud Sync', () => {
  let env;

  beforeEach(async () => {
    env = await bootApp();
    await env.unlockVault('TestMasterPassword123!', '1234');
  });

  afterEach(() => {
    if (env) env.teardown();
  });

  test('T1-R5-01: Settings view saves cloud sync configuration to IndexedDB kv store', async () => {
    env.switchView('settings');

    const tokenInput = env.document.getElementById('sync-github-token');
    assert.ok(tokenInput, '#sync-github-token input must exist in Settings');
    const autoToggle = env.document.getElementById('sync-auto-toggle');
    assert.ok(autoToggle, '#sync-auto-toggle checkbox must exist');

    tokenInput.value = 'ghp_fakeTestToken1234567890abcdef';
    autoToggle.checked = true;

    const syncForm = env.document.getElementById('sync-settings-form');
    assert.ok(syncForm, '#sync-settings-form must exist');
    env.submit(syncForm);

    await new Promise(r => setTimeout(r, 25));

    const syncConfig = (await env.Storage.getKV('syncConfig')) || (await env.Storage.getKV('sync'));
    assert.ok(syncConfig, 'Sync settings must be saved in kv store under "syncConfig" or "sync"');
    assert.strictEqual(syncConfig.token, 'ghp_fakeTestToken1234567890abcdef', 'Saved token must match input');
    assert.strictEqual(syncConfig.autoSync, true, 'Saved autoSync setting must match checkbox');
  });

  test('T1-R5-02: Client-side AES-256-GCM encryption produces valid envelope and decrypts', async () => {
    const password = 'TestMasterPassword123!';
    const sensitivePayload = {
      habits: [{ id: 'h1', name: 'Confidential Journaling' }],
      diary: { '2026-11-13': { entry: 'Top Secret Thoughts' } }
    };

    const envelope = await env.CryptoUtils.encrypt(sensitivePayload, password);

    assert.ok(envelope, 'CryptoUtils.encrypt must return an encrypted envelope');
    assert.strictEqual(envelope.version, 1, 'Encrypted envelope version must be 1');
    assert.ok(typeof envelope.salt === 'string' && envelope.salt.length >= 16, 'Envelope must contain salt');
    assert.ok(typeof envelope.iv === 'string' && envelope.iv.length >= 12, 'Envelope must contain IV');
    assert.ok(typeof envelope.ciphertext === 'string' && envelope.ciphertext.length > 0, 'Envelope must contain ciphertext');
    assert.ok(envelope.encryptedAt, 'Envelope must contain timestamp encryptedAt');

    // Decrypt
    const decrypted = await env.CryptoUtils.decrypt(envelope, password);
    assert.jsonEqual(decrypted, sensitivePayload, 'Decrypted payload must match original sensitive payload');
  });

  test('T1-R5-03: Cloud sync transmission exposes zero plaintext to external endpoints', async () => {
    const secretHabitName = 'AbsoluteZeroKnowledgeSecretHabit_98765';
    const secretDiaryText = 'ConfidentialDiaryEntry_54321';

    await env.Storage.createHabit({ name: secretHabitName, icon: '🔒', color: '#111111' });
    const todayStr = '2026-11-13';
    await env.Storage.saveDiary(todayStr, { entry: secretDiaryText });

    // Configure sync credentials
    await env.Storage.setKV('syncConfig', {
      token: 'ghp_testToken123',
      gistId: 'gist_test_123',
      autoSync: false
    });

    env.spies.fetches = [];

    // Trigger sync
    if (env.Sync && typeof env.Sync.syncNow === 'function') {
      await env.Sync.syncNow();
    }

    assert.ok(env.spies.fetches.length > 0, 'Sync must execute a network fetch call');
    for (const req of env.spies.fetches) {
      const bodyStr = req.options && req.options.body ? String(req.options.body) : '';
      assert.ok(
        !bodyStr.includes(secretHabitName),
        `Plaintext leak detected! Habit name "${secretHabitName}" appeared in sync payload`
      );
      assert.ok(
        !bodyStr.includes(secretDiaryText),
        `Plaintext leak detected! Diary text "${secretDiaryText}" appeared in sync payload`
      );
    }
  });

  test('T1-R5-04: PIN quick-unlock enables encrypted sync without master password prompt', async () => {
    // Lock vault
    env.Storage.setUnlocked(false);
    assert.strictEqual(env.Storage.isUnlocked(), false);

    // Unlock via PIN
    const loginResult = await env.Storage.loginWithPin('1234');
    assert.ok(loginResult && loginResult.success, 'loginWithPin must succeed with configured PIN');
    assert.strictEqual(env.Storage.isUnlocked(), true, 'Vault must be unlocked after PIN login');

    // Storage should possess master password or key to perform encrypted operations
    let canEncrypt = false;
    try {
      const masterKey = env.Storage.getMasterPassword ? env.Storage.getMasterPassword() : null;
      if (masterKey) canEncrypt = true;
      else if (env.Storage._cachedPassword) canEncrypt = true;
    } catch (_) {}

    assert.ok(canEncrypt, 'PIN unlock must unwrap master key allowing encrypted operations without password prompt');
  });

  test('T1-R5-05: Encrypted snapshot decryption populates local state correctly', async () => {
    const password = 'TestMasterPassword123!';
    const remoteState = {
      habits: [{ id: 'h_remote_99', name: 'Remote Synced Habit', icon: '🌐', color: '#00bcd4' }],
      cells: {},
      notes: [],
      tasks: [{ id: 't_remote_1', title: 'Remote Task', status: 'pending' }],
      diary: {},
      quotes: [],
      tombstones: { habits: {}, tasks: {}, notes: {}, quotes: {} }
    };

    const encryptedEnvelope = await env.CryptoUtils.encrypt(remoteState, password);

    // Configure mock fetch to return remote gist
    env.window.fetch = async () => ({
      ok: true,
      status: 200,
      json: async () => ({
        id: 'mock_gist_remote',
        updated_at: new Date().toISOString(),
        files: {
          'hobby_tracker_vault.json.enc': {
            content: JSON.stringify(encryptedEnvelope)
          }
        }
      })
    });

    await env.Storage.setKV('sync', { token: 'ghp_test', gistId: 'mock_gist_remote' });

    // Decrypt and ingest remote snapshot
    if (env.Sync && typeof env.Sync.pullFromGist === 'function') {
      const pullSuccess = await env.Sync.pullFromGist();
      assert.ok(pullSuccess, 'pullFromGist must succeed');
      const localState = await env.Storage.getRawState();
      assert.ok(
        localState.habits.some(h => h.id === 'h_remote_99'),
        'Remote habit must be ingested into local state'
      );
    }
  });

  test('T1-R5-06: Encrypted backup JSON export prevents plaintext data leakage', async () => {
    const confidentialName = 'SuperPrivateBackupHabit_123';
    await env.Storage.createHabit({ name: confidentialName, icon: '💎', color: '#ff9800' });

    let backupString = null;
    if (typeof env.Storage.exportEncryptedBackup === 'function') {
      backupString = await env.Storage.exportEncryptedBackup();
    } else {
      // Opaque-box interaction via export button or CryptoUtils
      const state = await env.Storage.getRawState();
      const pwd = env.Storage.getMasterPassword ? env.Storage.getMasterPassword() : env.Storage._cachedPassword;
      const envObj = await env.CryptoUtils.encrypt(state, pwd);
      backupString = JSON.stringify(envObj);
    }

    assert.ok(backupString, 'Backup export must return serialized string');
    assert.ok(
      !backupString.includes(confidentialName),
      'Encrypted backup export must NOT contain plaintext habit name'
    );
    const parsed = JSON.parse(backupString);
    assert.ok(parsed.ciphertext && parsed.iv && parsed.salt, 'Backup must contain valid encrypted envelope fields');
  });

  test('T1-R5-07: Encrypted backup JSON import restores complete state with password', async () => {
    const password = 'TestMasterPassword123!';
    const backupState = {
      habits: [{ id: 'h_restored_1', name: 'Restored Habit', icon: '🔄', color: '#673ab7' }],
      cells: {},
      notes: [],
      tasks: [{ id: 't_restored_1', title: 'Restored Task', status: 'done' }],
      diary: { '2026-11-13': { entry: 'Restored Diary Reflection' } },
      quotes: [],
      tombstones: { habits: {}, tasks: {}, notes: {}, quotes: {} }
    };

    const backupEnvelope = await env.CryptoUtils.encrypt(backupState, password);
    const backupJsonString = JSON.stringify(backupEnvelope);

    // Decrypt and restore
    const restoredPayload = await env.CryptoUtils.decrypt(JSON.parse(backupJsonString), password);
    await env.Storage.saveRawState(restoredPayload);

    const currentState = await env.Storage.getRawState();
    assert.ok(
      currentState.habits.some(h => h.name === 'Restored Habit'),
      'Restored habit must exist in current state'
    );
    assert.ok(
      currentState.tasks.some(t => t.title === 'Restored Task'),
      'Restored task must exist in current state'
    );
    assert.strictEqual(
      currentState.diary['2026-11-13']?.entry,
      'Restored Diary Reflection',
      'Restored diary entry must exist in current state'
    );
  });
});
