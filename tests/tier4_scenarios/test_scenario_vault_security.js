'use strict';

const { describe, test, beforeEach, afterEach } = require('../runner');
const assert = require('../helpers/assert');
const { bootApp } = require('../helpers/env');

describe('Tier 4: Scenario 5 - Vault Security Lifecycle & Password Migration', () => {
  let env;

  beforeEach(async () => {
    env = await bootApp({ systemDate: '2026-11-13' });
  });

  afterEach(() => {
    if (env) env.teardown();
  });

  test('T4-SCEN-05: Vault security lifecycle, master password migration, PIN unwrap, and backup restore', async () => {
    const oldPassword = 'InitialMasterKey2026!';
    const newPassword = 'MigratedMasterKey999!';
    const pin = '1357';
    const todayStr = '2026-11-13';

    // 1. Initial Setup: Create vault with old master password and PIN
    await env.unlockVault(oldPassword, pin);
    assert.strictEqual(env.Storage.isUnlocked(), true, 'Vault must be unlocked after initial setup');

    const authInitial = await env.Storage.getKV('auth');
    authInitial.wrappedMasterKey = await env.CryptoUtils.encrypt({ masterPassword: oldPassword }, pin);
    await env.Storage.setKV('auth', authInitial);

    // 2. Populate Vault with Critical Data
    const habit = await env.Storage.createHabit({
      name: 'Vault Security Audit',
      icon: '🛡️',
      color: '#673ab7'
    });

    const loveNote = await env.Storage.createNote({
      habitId: habit.id,
      date: todayStr,
      type: 'love',
      text: 'Cherishing peace of mind from zero-knowledge encryption'
    });

    const disciplineNote = await env.Storage.createNote({
      habitId: habit.id,
      date: '2026-11-12',
      type: 'discipline',
      text: 'Audited cryptographic salt entropy and PBKDF2 rounds'
    });

    await env.Storage.updateCell(habit.id, todayStr, { status: 'done', noteId: loveNote.id });
    await env.Storage.updateCell(habit.id, '2026-11-12', { status: 'done', noteId: disciplineNote.id });

    await env.Storage.saveDiary(todayStr, {
      entry: 'Critical enterprise secrets stored in local zero-knowledge vault',
      mood: 'great',
      tasks: [{ title: 'Rotate cryptographic credentials', status: 'done' }]
    });

    await env.Storage.createQuote({
      text: 'Security is not a product, but a process.',
      author: 'Bruce Schneier'
    });

    // 3. Master Password Migration (Change Password)
    const changeResult = await env.Storage.changePassword(oldPassword, newPassword);
    assert.ok(changeResult && changeResult.success, 'changePassword must succeed');

    // Update wrapped PIN key with new password per R5 key-wrapping spec
    const authMigrated = await env.Storage.getKV('auth');
    authMigrated.wrappedMasterKey = await env.CryptoUtils.encrypt({ masterPassword: newPassword }, pin);
    await env.Storage.setKV('auth', authMigrated);

    // 4. Lock Vault
    await env.Auth.lockApp();
    assert.strictEqual(env.Storage.isUnlocked(), false, 'Vault must be locked');
    assert.strictEqual(env.window.sessionStorage.getItem('ht_vault_key'), null);

    // 5. Verify Old Password Fails
    let oldPasswordRejected = false;
    try {
      await env.Storage.loginWithPassword(oldPassword);
    } catch (err) {
      oldPasswordRejected = true;
      assert.ok(
        err.message.toLowerCase().includes('incorrect') || err.message.toLowerCase().includes('password'),
        'Rejection message must indicate incorrect password'
      );
    }
    assert.ok(oldPasswordRejected, 'Old master password must be rejected after password migration');
    assert.strictEqual(env.Storage.isUnlocked(), false, 'Vault must remain locked when old password is used');

    // 6. Unlock with New Master Password
    const newLoginResult = await env.Storage.loginWithPassword(newPassword);
    assert.ok(newLoginResult && newLoginResult.success, 'Login with new password must succeed');
    assert.strictEqual(env.Storage.isUnlocked(), true, 'Vault must be unlocked with new password');
    assert.strictEqual(env.Storage.getMasterPassword(), newPassword, 'Active master password must equal new password');

    // 7. Lock and Unlock with PIN (verifying PIN unwrap works with new password)
    await env.Auth.lockApp();
    assert.strictEqual(env.Storage.isUnlocked(), false);

    const pinLogin = await env.Storage.loginWithPin(pin);
    assert.ok(pinLogin && pinLogin.success, 'PIN login must succeed');

    // Unwrap master key using PIN
    const authStored = await env.Storage.getKV('auth');
    assert.ok(authStored && authStored.wrappedMasterKey, 'wrappedMasterKey must exist');
    const unwrappedObj = await env.CryptoUtils.decrypt(authStored.wrappedMasterKey, pin);
    await env.Storage.setUnlocked(true, unwrappedObj.masterPassword);

    assert.strictEqual(
      env.Storage.getMasterPassword(),
      newPassword,
      'Unwrapped master password from PIN must equal migrated new password'
    );

    // 8. Export Encrypted Backup
    const stateToBackup = await env.Storage.getRawState();
    const backupEnvelope = await env.CryptoUtils.encrypt(stateToBackup, newPassword);

    assert.strictEqual(backupEnvelope.version, 1, 'Backup envelope version must be 1');
    assert.ok(backupEnvelope.ciphertext, 'Backup must contain ciphertext');
    assert.ok(backupEnvelope.iv, 'Backup must contain IV');
    assert.ok(backupEnvelope.salt, 'Backup must contain salt');

    // Verify zero plaintext leak in backup
    const backupString = JSON.stringify(backupEnvelope);
    assert.ok(!backupString.includes('Vault Security Audit'), 'Habit name must not leak in backup envelope');
    assert.ok(!backupString.includes('Critical enterprise secrets'), 'Diary entry must not leak in backup envelope');
    assert.ok(!backupString.includes('Bruce Schneier'), 'Quote must not leak in backup envelope');

    // Verify old password CANNOT decrypt the backup
    let oldPasswordDecryptFailed = false;
    try {
      await env.CryptoUtils.decrypt(backupEnvelope, oldPassword);
    } catch (_) {
      oldPasswordDecryptFailed = true;
    }
    assert.ok(oldPasswordDecryptFailed, 'Old password must fail to decrypt backup created with new password');

    // 9. Wipe Local IndexedDB State
    const wipedState = {
      habits: [],
      cells: {},
      notes: [],
      tasks: [],
      diary: {},
      quotes: [],
      tombstones: { habits: {}, tasks: {}, notes: {}, quotes: {} }
    };
    await env.Storage.saveRawState(wipedState);

    const checkWiped = await env.Storage.getRawState();
    assert.strictEqual(checkWiped.habits.length, 0, 'Habits must be 0 after wipe');
    assert.strictEqual(checkWiped.notes.length, 0, 'Notes must be 0 after wipe');
    assert.strictEqual(Object.keys(checkWiped.diary).length, 0, 'Diary must be empty after wipe');

    // 10. Import Encrypted Backup with New Password
    const decryptedState = await env.CryptoUtils.decrypt(backupEnvelope, newPassword);
    await env.Storage.importData(decryptedState);

    // 11. Verify 100% State Restored
    const restoredState = await env.Storage.getRawState();

    // Verify habit
    const restoredHabit = restoredState.habits.find(h => h.id === habit.id);
    assert.ok(restoredHabit, 'Habit must be restored after backup import');
    assert.strictEqual(restoredHabit.name, 'Vault Security Audit');
    assert.strictEqual(restoredHabit.color, '#673ab7');

    // Verify notes
    const restoredLoveNote = restoredState.notes.find(n => n.id === loveNote.id);
    assert.ok(restoredLoveNote, 'Love note must be restored');
    assert.strictEqual(restoredLoveNote.type, 'love');
    assert.strictEqual(restoredLoveNote.text, 'Cherishing peace of mind from zero-knowledge encryption');

    const restoredDisciplineNote = restoredState.notes.find(n => n.id === disciplineNote.id);
    assert.ok(restoredDisciplineNote, 'Discipline note must be restored');
    assert.strictEqual(restoredDisciplineNote.type, 'discipline');

    // Verify cells
    assert.strictEqual(restoredState.cells[`${habit.id}|${todayStr}`]?.noteId, loveNote.id);
    assert.strictEqual(restoredState.cells[`${habit.id}|2026-11-12`]?.noteId, disciplineNote.id);

    // Verify diary
    assert.ok(restoredState.diary[todayStr], 'Diary record must be restored');
    assert.strictEqual(
      restoredState.diary[todayStr].entry,
      'Critical enterprise secrets stored in local zero-knowledge vault'
    );
    assert.strictEqual(restoredState.diary[todayStr].mood, 'great');

    // Verify quotes
    assert.ok(
      restoredState.quotes.some(q => q.author === 'Bruce Schneier'),
      'Bruce Schneier quote must be restored'
    );
  });
});
