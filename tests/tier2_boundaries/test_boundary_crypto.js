'use strict';

const { describe, test, beforeEach, afterEach } = require('../runner');
const assert = require('../helpers/assert');
const { bootApp } = require('../helpers/env');

describe('Tier 2: Boundary & Corner Cases — Cryptography & Sync (R5)', () => {
  let env;

  beforeEach(async () => {
    env = await bootApp();
    await env.unlockVault('TestPassword123!');
  });

  afterEach(() => {
    if (env) env.teardown();
  });

  test('T2-R5-01: Decryption with Incorrect Password', async () => {
    const rawState = await env.Storage.getRawState();
    const correctPassword = 'CorrectVaultPassword!123';
    const wrongPassword = 'WrongVaultPassword!999';

    // Encrypt legitimate vault state with correct password
    const envelope = await env.CryptoUtils.encrypt(rawState, correctPassword);
    assert.strictEqual(envelope.version, 1, 'Encrypted envelope version must be 1');
    assert.ok(envelope.ciphertext && envelope.iv && envelope.salt);

    // Attempting decryption with incorrect password must reject
    await assert.rejects(
      async () => {
        await env.CryptoUtils.decrypt(envelope, wrongPassword);
      },
      /Decryption failed|Incorrect password/,
      'Decrypting with wrong password must throw authentication failure exception'
    );

    // Verify local storage was not mutated or corrupted by failed attempt
    const stateAfter = await env.Storage.getRawState();
    assert.deepStrictEqual(stateAfter, rawState, 'Local storage state must remain 100% intact');
  });

  test('T2-R5-02: Corrupted Ciphertext or Tampered IV', async () => {
    const password = 'TamperProofPassword!456';
    const payload = { habits: [{ id: 'h1', name: 'Original Habit' }], notes: [] };

    const envelope = await env.CryptoUtils.encrypt(payload, password);

    // 1. Corrupt 1 character in ciphertext
    const rawCipher = envelope.ciphertext;
    const flippedCipher = rawCipher.startsWith('A')
      ? 'B' + rawCipher.slice(1)
      : 'A' + rawCipher.slice(1);
    const tamperedCipherEnvelope = { ...envelope, ciphertext: flippedCipher };

    await assert.rejects(
      async () => {
        await env.CryptoUtils.decrypt(tamperedCipherEnvelope, password);
      },
      /Decryption failed/,
      'Tampering with 1 character of ciphertext must cause authentication failure'
    );

    // 2. Corrupt 1 character in IV
    const rawIv = envelope.iv;
    const flippedIv = rawIv.startsWith('A')
      ? 'B' + rawIv.slice(1)
      : 'A' + rawIv.slice(1);
    const tamperedIvEnvelope = { ...envelope, iv: flippedIv };

    await assert.rejects(
      async () => {
        await env.CryptoUtils.decrypt(tamperedIvEnvelope, password);
      },
      /Decryption failed/,
      'Tampering with IV must cause authentication failure'
    );

    // 3. Corrupt salt hex
    const rawSalt = envelope.salt;
    const flippedSalt = rawSalt.startsWith('0')
      ? 'f' + rawSalt.slice(1)
      : '0' + rawSalt.slice(1);
    const tamperedSaltEnvelope = { ...envelope, salt: flippedSalt };

    await assert.rejects(
      async () => {
        await env.CryptoUtils.decrypt(tamperedSaltEnvelope, password);
      },
      /Decryption failed/,
      'Tampering with salt must derive wrong key and reject decryption'
    );
  });

  test('T2-R5-03: PIN Format with Leading Zeros', async () => {
    // 1. PIN with leading zero ('0042')
    await env.Storage.changePin('0042');
    await env.Storage.lock();

    // Verify unlock with string '0042' succeeds
    const res = await env.Storage.loginWithPin('0042');
    assert.strictEqual(res.success, true, 'Unlocking with PIN string "0042" must succeed');
    assert.strictEqual(env.Storage.isUnlocked(), true, 'Storage must be in unlocked state');

    // Verify unlock with stripped number/string '42' fails
    await env.Storage.lock();
    await assert.rejects(
      async () => {
        await env.Storage.loginWithPin('42');
      },
      /Incorrect PIN/,
      'Numeric truncation to "42" must be rejected'
    );

    // 2. All-zeros PIN boundary ('0000')
    await env.Storage.loginWithPin('0042');
    await env.Storage.changePin('0000');
    await env.Storage.lock();

    const resZeros = await env.Storage.loginWithPin('0000');
    assert.strictEqual(resZeros.success, true, 'Unlocking with all-zeros PIN "0000" must succeed');

    await env.Storage.lock();
    await assert.rejects(
      async () => {
        await env.Storage.loginWithPin('0');
      },
      /Incorrect PIN/,
      'Truncated zero "0" must be rejected'
    );
  });

  test('T2-R5-04: Gist API 401 Unauthorized / Network Error', async () => {
    await env.Storage.saveSyncConfig({
      token: 'ghp_invalid_token_test',
      gistId: 'gist_test_401',
      autoSync: true
    });

    // 1. Mock 401 Unauthorized from GitHub API
    env.window.fetch = async () => ({
      ok: false,
      status: 401,
      statusText: 'Unauthorized',
      json: async () => ({ message: 'Bad credentials' })
    });

    const syncResult = await env.Sync.syncNow();
    assert.strictEqual(syncResult.success, false, 'Sync must return success: false on 401');
    assert.ok(
      syncResult.error && syncResult.error.includes('Bad credentials'),
      'Sync result must capture error message from GitHub API'
    );
    assert.strictEqual(env.Sync.status, 'error', 'Sync engine status must be "error"');

    // Verify UI updates without throwing uncaught rejection
    env.App.updateSyncUI('error', 'Bad credentials');
    const indicator = env.document.getElementById('sidebar-sync-indicator');
    if (indicator) {
      assert.domContains(env.document, indicator, 'Sync Error');
    }

    // 2. Network Offline simulation
    env.window.navigator.onLine = false;
    const offlineResult = await env.Sync.syncNow();
    assert.strictEqual(offlineResult.success, false, 'Sync must return success: false when offline');
    assert.strictEqual(offlineResult.reason, 'offline', 'Sync reason must report "offline"');
    assert.strictEqual(env.Sync.status, 'offline', 'Sync status must be set to "offline"');
  });

  test('T2-R5-05: Large Payload Encryption (1MB+ Vault State)', async () => {
    // Generate 1MB+ vault payload
    const chunk100k = 'X'.repeat(102400); // 100 KB
    const largeDiary = {};
    for (let i = 1; i <= 11; i++) {
      largeDiary[`2026-11-${String(i).padStart(2, '0')}`] = {
        entry: `Diary Day ${i}: ` + chunk100k,
        tasks: [],
        mood: 'great'
      };
    }

    const largeState = {
      habits: [{ id: 'h_large', name: 'High Volume Journaling' }],
      cells: {},
      notes: [],
      tasks: [],
      diary: largeDiary,
      quotes: [],
      tombstones: {}
    };

    const serializedSize = Buffer.byteLength(JSON.stringify(largeState));
    assert.ok(
      serializedSize >= 1048576,
      `Payload must be at least 1MB (1,048,576 bytes), actual size: ${serializedSize} bytes`
    );

    // 1. Encryption performance benchmark (<2000ms)
    const t0 = Date.now();
    const envelope = await env.CryptoUtils.encrypt(largeState, 'BenchmarkPass123!');
    const encDuration = Date.now() - t0;
    assert.ok(
      encDuration < 2000,
      `Encryption of 1MB+ payload must finish under 2000ms, took ${encDuration}ms`
    );

    // Verify envelope integrity
    assert.strictEqual(envelope.version, 1);
    assert.ok(envelope.ciphertext.length > 1000000, 'Ciphertext must be proportionally sized to 1MB+ input');

    // 2. Decryption performance benchmark (<2000ms)
    const t1 = Date.now();
    const decrypted = await env.CryptoUtils.decrypt(envelope, 'BenchmarkPass123!');
    const decDuration = Date.now() - t1;
    assert.ok(
      decDuration < 2000,
      `Decryption of 1MB+ payload must finish under 2000ms, took ${decDuration}ms`
    );

    // Verify round-trip content equality
    assert.strictEqual(
      Object.keys(decrypted.diary).length,
      11,
      'Decrypted diary must contain all 11 large diary entries'
    );
    assert.strictEqual(
      decrypted.diary['2026-11-01'].entry,
      largeState.diary['2026-11-01'].entry,
      'Large diary entry text must match original exactly'
    );
  });

  test('T2-R5-06: Empty Vault State Encryption', async () => {
    // Empty vault baseline structure
    const emptyState = {
      habits: [],
      cells: {},
      notes: [],
      tasks: [],
      diary: {},
      quotes: [],
      tombstones: {},
      config: {}
    };

    // 1. Encrypt empty vault
    const envelope = await env.CryptoUtils.encrypt(emptyState, 'EmptyStatePass123!');

    assert.strictEqual(envelope.version, 1, 'Envelope version must be 1');
    assert.strictEqual(envelope.salt.length, 32, 'Salt hex must be exactly 32 characters (16 bytes)');
    assert.ok(envelope.iv && typeof envelope.iv === 'string', 'IV must be valid base64 string');
    assert.ok(envelope.ciphertext && typeof envelope.ciphertext === 'string', 'Ciphertext must be valid base64');
    assert.ok(!isNaN(new Date(envelope.encryptedAt).getTime()), 'encryptedAt must be valid ISO timestamp');

    // 2. Decrypt empty vault
    const decrypted = await env.CryptoUtils.decrypt(envelope, 'EmptyStatePass123!');

    // Normalize across VM context realm boundary
    assert.deepStrictEqual(
      JSON.parse(JSON.stringify(decrypted)),
      emptyState,
      'Decrypted empty vault must be deeply equal to original empty state structure'
    );
    assert.strictEqual(Array.isArray(decrypted.habits), true, 'decrypted.habits must be array');
    assert.strictEqual(decrypted.habits.length, 0, 'decrypted.habits must have length 0');
    assert.strictEqual(typeof decrypted.cells, 'object', 'decrypted.cells must be object');
  });
});
