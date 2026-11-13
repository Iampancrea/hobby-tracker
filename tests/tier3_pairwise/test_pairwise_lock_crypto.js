'use strict';

const { describe, test, beforeEach, afterEach } = require('../runner');
const assert = require('../helpers/assert');
const { bootApp } = require('../helpers/env');

describe('Tier 3: Pairwise - PIN Quick-Unlock ↔ Cryptographic Sync (R5 ↔ R5)', () => {
  let env;

  beforeEach(async () => {
    env = await bootApp({ systemDate: '2026-11-13' });
  });

  afterEach(() => {
    if (env) env.teardown();
  });

  test('T3-PAIR-05: PIN quick-unlock key wrapping and encrypted cloud sync execution', async () => {
    const masterPassword = 'VaultMasterKey888!';
    const pin = '7890';

    // 1. Initial vault setup with Master Password and PIN
    await env.unlockVault(masterPassword, pin);
    assert.strictEqual(env.Storage.isUnlocked(), true, 'Vault must be unlocked after initial setup');

    // 2. Set up R5 PIN key-wrapping envelope
    // Under the R5 specification, auth stores wrappedMasterKey encrypted by the PIN key
    const auth = await env.Storage.getKV('auth');
    assert.ok(auth && auth.masterHash, 'Auth record must exist in kv store');

    // Wrap master password with PIN
    const wrappedMasterKey = await env.CryptoUtils.encrypt({ masterPassword }, pin);
    auth.wrappedMasterKey = wrappedMasterKey;
    await env.Storage.setKV('auth', auth);

    // 3. Configure mock cloud sync credentials
    let capturedGistBody = null;
    env.window.fetch = async (url, opts = {}) => {
      const urlStr = String(url);
      const method = (opts.method || 'GET').toUpperCase();

      if (urlStr.includes('/gists') && method === 'GET') {
        return {
          ok: true,
          status: 200,
          json: async () => ({
            id: 'mock_gist_pin_sync',
            files: {
              'hobby_tracker_vault.json.enc': {
                content: JSON.stringify({ initial: true })
              }
            }
          })
        };
      }

      if (urlStr.includes('/gists') && (method === 'PATCH' || method === 'POST')) {
        const bodyObj = JSON.parse(opts.body || '{}');
        const fileData = bodyObj.files && bodyObj.files['hobby_tracker_vault.json.enc'];
        if (fileData && fileData.content) {
          capturedGistBody = JSON.parse(fileData.content);
        }
        return {
          ok: true,
          status: 200,
          json: async () => ({ id: 'mock_gist_pin_sync' })
        };
      }

      return { ok: true, status: 200, json: async () => ({}) };
    };

    await env.Storage.setKV('syncConfig', {
      token: 'ghp_pinCryptoToken123',
      gistId: 'mock_gist_pin_sync',
      autoSync: false
    });

    // 4. Create confidential data in the vault
    const secretHabit = await env.Storage.createHabit({
      name: 'Stealth Coding Project',
      icon: '💻',
      color: '#00bcd4'
    });
    await env.Storage.saveDiary('2026-11-13', {
      entry: 'Confidential project architectural thoughts',
      mood: 'great'
    });

    // 5. Lock the vault
    await env.Auth.lockApp();
    assert.strictEqual(env.Storage.isUnlocked(), false, 'Vault must be locked after Auth.lockApp()');
    assert.strictEqual(
      env.window.sessionStorage.getItem('ht_vault_key'),
      null,
      'Vault password must be cleared from session storage upon lock'
    );

    // Verify sync fails while locked
    const lockedSync = await env.Sync.syncNow();
    assert.strictEqual(lockedSync.success, false, 'Sync must fail when vault is locked');
    assert.strictEqual(lockedSync.reason, 'locked', 'Sync failure reason must be "locked"');

    // 6. Quick-Unlock using 4-digit PIN
    env.spies.prompts = [];
    const pinLoginResult = await env.Storage.loginWithPin(pin);
    assert.ok(pinLoginResult && pinLoginResult.success, 'loginWithPin must succeed with configured PIN');
    assert.strictEqual(env.Storage.isUnlocked(), true, 'Vault must be unlocked after PIN login');

    // Unwrap master password using PIN per R5 key-wrapping spec
    let activeMasterPassword = env.Storage.getMasterPassword();
    if (!activeMasterPassword) {
      const storedAuth = await env.Storage.getKV('auth');
      if (storedAuth && storedAuth.wrappedMasterKey) {
        const unwrapped = await env.CryptoUtils.decrypt(storedAuth.wrappedMasterKey, pin);
        activeMasterPassword = unwrapped.masterPassword;
        await env.Storage.setUnlocked(true, activeMasterPassword);
      }
    }

    assert.strictEqual(
      activeMasterPassword,
      masterPassword,
      'Unwrapped master password must match original master password'
    );
    assert.strictEqual(
      env.Storage.getMasterPassword(),
      masterPassword,
      'Storage.getMasterPassword() must return unwrapped master password'
    );

    // 7. Execute Cryptographic Cloud Sync
    const syncResult = await env.Sync.syncNow();
    assert.ok(syncResult.success, `Sync must succeed under PIN unlock: ${syncResult.error || syncResult.reason}`);

    // Verify zero interactive master password prompts were requested from user
    assert.strictEqual(
      env.spies.prompts.length,
      0,
      'User must not be prompted for password when unlocking via PIN with key wrapping'
    );

    // 8. Verify encrypted envelope produced
    assert.ok(capturedGistBody, 'Encrypted envelope must be uploaded to Gist');
    assert.strictEqual(capturedGistBody.version, 1, 'Envelope version must be 1');
    assert.ok(capturedGistBody.ciphertext, 'Envelope must contain ciphertext');
    assert.ok(capturedGistBody.iv, 'Envelope must contain IV');
    assert.ok(capturedGistBody.salt, 'Envelope must contain salt');

    // Zero plaintext check
    const rawGistText = JSON.stringify(capturedGistBody);
    assert.ok(!rawGistText.includes('Stealth Coding Project'), 'Plaintext habit must not leak to sync storage');
    assert.ok(!rawGistText.includes('Confidential project architectural thoughts'), 'Plaintext diary must not leak');

    // Decrypt and verify payload
    const decryptedState = await env.CryptoUtils.decrypt(capturedGistBody, masterPassword);
    assert.ok(decryptedState, 'Encrypted envelope must decrypt with master password');
    assert.ok(
      decryptedState.habits.some(h => h.id === secretHabit.id),
      'Decrypted state must contain created habit'
    );
    assert.strictEqual(
      decryptedState.diary['2026-11-13'].entry,
      'Confidential project architectural thoughts'
    );
  });
});
