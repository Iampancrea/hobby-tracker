'use strict';

const { describe, test, beforeEach, afterEach } = require('../runner');
const assert = require('../helpers/assert');
const { bootApp } = require('../helpers/env');

describe('Tier 3: Pairwise - Top Quote Banner ↔ View Navigation & Lock (R4 ↔ R4)', () => {
  let env;

  beforeEach(async () => {
    env = await bootApp({ systemDate: '2026-11-13' });
    await env.unlockVault('TestPassword123!');
  });

  afterEach(() => {
    if (env) env.teardown();
  });

  test('T3-PAIR-04: Top quote banner consistency across view switches and vault lock', async () => {
    const customQuoteText = 'Simplicity is prerequisite for reliability.';
    const customAuthor = 'Edsger W. Dijkstra';

    // 1. Create a custom quote and set as the active quote collection
    const quoteObj = {
      id: 'q_custom_test',
      text: customQuoteText,
      author: customAuthor,
      custom: true,
      updatedAt: new Date().toISOString()
    };
    const rawState = await env.Storage.getRawState();
    rawState.quotes = [quoteObj];
    await env.Storage.saveRawState(rawState);
    await env.Views.loadState();
    env.Views.renderTopQuote(true);

    const banner = env.document.getElementById('top-quote-banner');
    assert.ok(banner, '#top-quote-banner element must exist in top app header');
    assert.domVisible(env.document, banner, 'Top quote banner must be visible');
    assert.domContains(env.document, banner, customQuoteText, 'Quote text must be displayed in banner');
    assert.domContains(env.document, banner, customAuthor, 'Author must be displayed in banner');

    // 2. View Navigation Consistency: Habits view
    env.switchView('habits');
    assert.domVisible(env.document, banner, 'Banner must remain visible on Habits view');
    assert.domContains(env.document, banner, customQuoteText, 'Quote text must remain unchanged on Habits view');
    assert.ok(env.document.title.includes('Habits'), 'Document title must reflect Habits view');

    // 3. View Navigation Consistency: Tasks view
    env.switchView('tasks');
    assert.domVisible(env.document, banner, 'Banner must remain visible on Tasks view');
    assert.domContains(env.document, banner, customQuoteText, 'Quote text must remain unchanged on Tasks view');
    assert.ok(env.document.title.includes('Tasks'), 'Document title must reflect Tasks view');

    // 4. View Navigation Consistency: Diary view
    env.switchView('diary');
    assert.domVisible(env.document, banner, 'Banner must remain visible on Diary view');
    assert.domContains(env.document, banner, customQuoteText, 'Quote text must remain unchanged on Diary view');
    assert.ok(env.document.title.includes('Diary'), 'Document title must reflect Diary view');

    // 5. View Navigation Consistency: Settings view
    env.switchView('settings');
    assert.domVisible(env.document, banner, 'Banner must remain visible on Settings view');
    assert.domContains(env.document, banner, customQuoteText, 'Quote text must remain unchanged on Settings view');
    assert.ok(env.document.title.includes('Settings'), 'Document title must reflect Settings view');

    // 6. Vault Security Lock
    const lockBtn = env.document.getElementById('lock-btn');
    assert.ok(lockBtn, '#lock-btn must exist in sidebar');
    env.click(lockBtn);
    await new Promise(r => setTimeout(r, 20));

    // 7. Verify locked state UI
    const appContainer = env.document.getElementById('app');
    assert.domHidden(env.document, appContainer, 'Main #app container must be hidden when vault is locked');

    const loginScreen = env.document.getElementById('login-screen');
    assert.domVisible(env.document, loginScreen, 'Login screen must be visible when vault is locked');

    assert.strictEqual(
      env.document.title,
      'Hobby Tracker (Locked)',
      'Document title must equal "Hobby Tracker (Locked)"'
    );

    // 8. Verify login screen does NOT leak private quote
    const loginScreenText = loginScreen.textContent || '';
    assert.ok(
      !loginScreenText.includes(customQuoteText),
      'Login screen must not leak private quotes to unauthenticated users'
    );

    // 9. Verify cryptographic lock in storage
    assert.strictEqual(env.Storage.isUnlocked(), false, 'Vault must report isUnlocked() === false');
    assert.strictEqual(
      env.window.sessionStorage.getItem('ht_vault_key'),
      null,
      'Session storage vault key must be erased upon lock'
    );
  });
});
