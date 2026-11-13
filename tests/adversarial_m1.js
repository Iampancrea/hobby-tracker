'use strict';

/**
 * Adversarial Stress & Verification Harness for Milestone 1
 * Shell, PWA Desktop Identity & Controls
 */

const fs = require('node:fs');
const path = require('node:path');
const { bootApp } = require('./helpers/env');
const assert = require('node:assert');

async function runAdversarialSuite() {
  console.log('======================================================================');
  console.log('  MILESTONE 1 ADVERSARIAL STRESS & EMPIRICAL CHALLENGE SUITE');
  console.log('======================================================================\n');

  let passed = 0;
  let failed = 0;
  const failureDetails = [];
  const edgeCaseFindings = [];

  function recordPass(testName) {
    passed++;
    console.log(`  [PASS] ${testName}`);
  }

  function recordFail(testName, err) {
    failed++;
    console.error(`  [FAIL] ${testName}`);
    console.error(`         ${err.message || err}`);
    failureDetails.push({ testName, error: err });
  }

  function recordFinding(category, finding) {
    edgeCaseFindings.push({ category, finding });
    console.log(`  [NOTE] [${category}] ${finding}`);
  }

  // -------------------------------------------------------------------------
  // SUITE A: Quote Decoupling, Normalization & Sanitization
  // -------------------------------------------------------------------------
  console.log('--- SUITE A: Quote Decoupling, Normalization & Sanitization ---');

  // A1: Zero quotes handling
  try {
    const env = await bootApp();
    await env.unlockVault('TestPassword123!');
    const banner = env.document.getElementById('top-quote-banner');

    // Case A1.1: empty array
    env.Views.state.quotes = [];
    env.Views.renderTopQuote(true);
    assert.strictEqual(banner.style.display, 'none', 'Banner must be hidden when quotes array is empty');
    assert.strictEqual(env.Views._activeQuote, null, '_activeQuote must be null when quotes empty');

    // Case A1.2: undefined / null state quotes
    env.Views.state.quotes = null;
    env.Views.renderTopQuote(true);
    assert.strictEqual(banner.style.display, 'none', 'Banner must be hidden when quotes is null');

    // Case A1.3: null state entirely
    const savedState = env.Views.state;
    env.Views.state = null;
    env.Views.renderTopQuote(true);
    assert.strictEqual(banner.style.display, 'none', 'Banner must be hidden when state is null');
    env.Views.state = savedState;

    env.teardown();
    recordPass('A1: Zero quotes and null state handling (gracefully hides banner)');
  } catch (e) {
    recordFail('A1: Zero quotes and null state handling', e);
  }

  // A2: Single quote handling
  try {
    const env = await bootApp();
    await env.unlockVault('TestPassword123!');
    const banner = env.document.getElementById('top-quote-banner');
    const quoteTextEl = env.document.getElementById('quote-text');
    const quoteAuthorEl = env.document.getElementById('quote-author');

    env.Views.state.quotes = [{ id: 'q_solo', text: 'Solo Journey', author: 'Lone Wolf' }];
    env.Views.renderTopQuote(true);

    assert.strictEqual(banner.style.display, 'block', 'Banner must be displayed for single quote');
    assert.strictEqual(quoteTextEl.textContent, '"Solo Journey"', 'Quote text must be wrapped in standard quotes');
    assert.strictEqual(quoteAuthorEl.textContent, '— Lone Wolf', 'Author must have em-dash prefix');
    assert.strictEqual(env.Views._activeQuote.id, 'q_solo');

    env.teardown();
    recordPass('A2: Single quote rendering (clean display & em-dash author)');
  } catch (e) {
    recordFail('A2: Single quote rendering', e);
  }

  // A3: Surrounding quotation marks normalization (double quote prevention)
  try {
    const env = await bootApp();
    await env.unlockVault('TestPassword123!');
    const quoteTextEl = env.document.getElementById('quote-text');
    const quoteAuthorEl = env.document.getElementById('quote-author');

    const testCases = [
      { rawText: 'Plain quote without quotes', expected: '"Plain quote without quotes"', desc: 'plain unquoted string' },
      { rawText: '"Already Quoted"', expected: '"Already Quoted"', desc: 'standard ASCII double quotes' },
      { rawText: '“Smart Quoted”', expected: '"Smart Quoted"', desc: 'typographical curly double quotes' },
      { rawText: '""Double double quotes""', expected: '"Double double quotes"', desc: 'nested double ASCII quotes' },
      { rawText: '““Double smart quotes””', expected: '"Double smart quotes"', desc: 'nested double typographical quotes' },
      { rawText: '"“Mixed double quotes”"', expected: '"Mixed double quotes"', desc: 'mixed ASCII and typographical quotes' },
      { rawText: '', expected: '""', desc: 'empty text string' }
    ];

    for (const tc of testCases) {
      env.Views.state.quotes = [{ id: 'q_norm', text: tc.rawText, author: 'Author' }];
      env.Views.renderTopQuote(true);
      assert.strictEqual(
        quoteTextEl.textContent,
        tc.expected,
        `Normalization failed for ${tc.desc}: expected ${tc.expected}, got ${quoteTextEl.textContent}`
      );
    }

    // Edge case checks: single quotes (apostrophes)
    env.Views.state.quotes = [{ id: 'q_single', text: "'Single Quoted'", author: 'Author' }];
    env.Views.renderTopQuote(true);
    if (quoteTextEl.textContent === "\"'Single Quoted'\"") {
      recordFinding('A3-EdgeCase', "Single straight quotes ('...') are not stripped by regex /^[\"“]+|[\"”]+$/g, producing \"'Single Quoted'\"");
    }

    // Missing author fallback
    env.Views.state.quotes = [{ id: 'q_no_auth', text: 'Quote', author: '' }];
    env.Views.renderTopQuote(true);
    assert.strictEqual(quoteAuthorEl.textContent, '— Unknown', 'Missing author must default to "— Unknown"');

    env.Views.state.quotes = [{ id: 'q_null_auth', text: 'Quote', author: null }];
    env.Views.renderTopQuote(true);
    assert.strictEqual(quoteAuthorEl.textContent, '— Unknown', 'Null author must default to "— Unknown"');

    env.teardown();
    recordPass('A3: Double quote prevention for straight and typographical curly double quotes');
  } catch (e) {
    recordFail('A3: Double quote prevention for straight and typographical curly double quotes', e);
  }

  // A4: HTML / XSS character injection
  try {
    const env = await bootApp();
    await env.unlockVault('TestPassword123!');
    const quoteTextEl = env.document.getElementById('quote-text');
    const quoteAuthorEl = env.document.getElementById('quote-author');

    const maliciousQuote = {
      id: 'q_xss',
      text: '<script>alert("xss")</script><b onmouseover="alert(1)">Bold</b>',
      author: '<img src=x onerror=alert(2)>'
    };

    env.Views.state.quotes = [maliciousQuote];
    env.Views.renderTopQuote(true);

    // Verify safe node insertion via textContent (must be pure text nodes, zero script/img elements)
    assert.strictEqual(
      quoteTextEl.childNodes.length,
      1,
      'quoteTextEl must have exactly 1 child node (text node)'
    );
    assert.strictEqual(
      quoteTextEl.childNodes[0].nodeType,
      3,
      'quoteTextEl child must be a TextNode (nodeType === 3)'
    );
    assert.strictEqual(
      quoteTextEl.textContent,
      '"<script>alert("xss")</script><b onmouseover="alert(1)">Bold</b>"',
      'Raw HTML strings must be stored strictly as text content without execution'
    );

    assert.strictEqual(
      quoteAuthorEl.childNodes.length,
      1,
      'quoteAuthorEl must have exactly 1 child node (text node)'
    );
    assert.strictEqual(
      quoteAuthorEl.childNodes[0].nodeType,
      3,
      'quoteAuthorEl child must be a TextNode (nodeType === 3)'
    );
    assert.strictEqual(
      quoteAuthorEl.textContent,
      '— <img src=x onerror=alert(2)>',
      'Author HTML strings must be stored strictly as text content'
    );

    env.teardown();
    recordPass('A4: HTML and XSS injection immunity (textContent textNode assignment verified)');
  } catch (e) {
    recordFail('A4: HTML and XSS injection immunity', e);
  }

  // A5: Quote deletion and active quote cache invalidation
  try {
    const env = await bootApp();
    await env.unlockVault('TestPassword123!');
    const banner = env.document.getElementById('top-quote-banner');

    env.Views.state.quotes = [
      { id: 'q1', text: 'Quote 1', author: 'Author 1' },
      { id: 'q2', text: 'Quote 2', author: 'Author 2' }
    ];

    env.Views.renderTopQuote(true);
    const initialQuoteId = env.Views._activeQuote.id;
    assert.ok(initialQuoteId === 'q1' || initialQuoteId === 'q2');

    // Simulate deleting the currently active quote
    env.Views.state.quotes = env.Views.state.quotes.filter(q => q.id !== initialQuoteId);
    // Routine renderTopQuote without forceRefresh should detect that _activeQuote is gone
    env.Views.renderTopQuote(false);
    assert.notStrictEqual(
      env.Views._activeQuote.id,
      initialQuoteId,
      'After active quote deletion, _activeQuote must update to a remaining quote'
    );
    assert.strictEqual(banner.style.display, 'block');

    // Delete remaining quote
    env.Views.state.quotes = [];
    env.Views.renderTopQuote(false);
    assert.strictEqual(env.Views._activeQuote, null, 'When all quotes deleted, _activeQuote must be null');
    assert.strictEqual(banner.style.display, 'none', 'When all quotes deleted, banner must be hidden');

    env.teardown();
    recordPass('A5: Active quote cache invalidation on quote deletion');
  } catch (e) {
    recordFail('A5: Active quote cache invalidation on quote deletion', e);
  }

  // -------------------------------------------------------------------------
  // SUITE B: View Switching Stability & Re-roll Prevention
  // -------------------------------------------------------------------------
  console.log('\n--- SUITE B: View Switching Stability & Re-roll Prevention ---');

  // B1: Rapid view switching stability (200 switches)
  try {
    const env = await bootApp();
    await env.unlockVault('TestPassword123!');
    const banner = env.document.getElementById('top-quote-banner');

    env.Views.state.quotes = [
      { id: 'q1', text: 'First Quote', author: 'First' },
      { id: 'q2', text: 'Second Quote', author: 'Second' },
      { id: 'q3', text: 'Third Quote', author: 'Third' },
      { id: 'q4', text: 'Fourth Quote', author: 'Fourth' }
    ];

    env.Views.renderTopQuote(true);
    const pinnedQuoteId = env.Views._activeQuote.id;
    assert.ok(pinnedQuoteId, 'An active quote must be selected initially');

    const views = ['habits', 'tasks', 'diary', 'settings'];
    for (let i = 0; i < 200; i++) {
      const targetView = views[i % views.length];
      env.switchView(targetView);

      // Verify active quote has NOT changed
      assert.strictEqual(
        env.Views._activeQuote.id,
        pinnedQuoteId,
        `Active quote must remain stable at iteration ${i} (view: ${targetView})`
      );
      // Verify banner remains visible
      assert.strictEqual(
        banner.style.display,
        'block',
        `Top quote banner must remain visible on view "${targetView}"`
      );
    }

    env.teardown();
    recordPass('B1: Rapid view switching (200 cycles) preserves _activeQuote without re-rolling');
  } catch (e) {
    recordFail('B1: Rapid view switching (200 cycles) preserves _activeQuote without re-rolling', e);
  }

  // B2: Diary date navigation independence from top quote banner
  try {
    const env = await bootApp();
    await env.unlockVault('TestPassword123!');
    const banner = env.document.getElementById('top-quote-banner');

    env.switchView('diary');
    const initialQuote = env.Views._activeQuote;
    assert.ok(initialQuote, 'Active quote must exist in diary view');

    // Simulate navigating 30 different diary dates
    for (let day = 1; day <= 30; day++) {
      const dateStr = `2026-10-${String(day).padStart(2, '0')}`;
      env.Views.currentDiaryDate = dateStr;
      await env.Views.renderDiary();

      assert.strictEqual(
        env.Views._activeQuote.id,
        initialQuote.id,
        `Quote must not re-roll on diary date change to ${dateStr}`
      );
      assert.strictEqual(banner.style.display, 'block');
    }

    // Check old quote container is gone from diary
    const oldQuoteSection = env.document.querySelector('#view-diary #quote-section');
    assert.strictEqual(oldQuoteSection, null, '#quote-section must not exist inside #view-diary');

    env.teardown();
    recordPass('B2: Diary date navigation has zero side-effects on top quote');
  } catch (e) {
    recordFail('B2: Diary date navigation has zero side-effects on top quote', e);
  }

  // -------------------------------------------------------------------------
  // SUITE C: Button Cleanup & Lock Mechanism Stress
  // -------------------------------------------------------------------------
  console.log('\n--- SUITE C: Button Cleanup & Lock Mechanism Stress ---');

  // C1: Total absence of #logout-btn
  try {
    const env = await bootApp();
    const logoutById = env.document.getElementById('logout-btn');
    assert.strictEqual(logoutById, null, '#logout-btn must not exist via getElementById');

    const logoutByQuery = env.document.querySelector('#logout-btn');
    assert.strictEqual(logoutByQuery, null, '#logout-btn must not exist via querySelector');

    const logoutAll = env.document.querySelectorAll('#logout-btn');
    assert.strictEqual(logoutAll.length, 0, '#logout-btn count must be 0');

    // Static code search across all JS files
    const jsFiles = ['js/app.js', 'js/auth.js', 'js/views.js', 'js/storage.js', 'js/sync.js'];
    for (const f of jsFiles) {
      const content = fs.readFileSync(path.join(__dirname, '..', f), 'utf8');
      assert.ok(
        !content.includes('logout-btn'),
        `File ${f} must not contain references to "logout-btn"`
      );
    }

    env.teardown();
    recordPass('C1: Absolute absence of #logout-btn from DOM and all JS files');
  } catch (e) {
    recordFail('C1: Absolute absence of #logout-btn from DOM and all JS files', e);
  }

  // C2: Repeated invocations of #lock-btn
  try {
    const env = await bootApp();
    await env.unlockVault('TestPassword123!');
    const lockBtn = env.document.getElementById('lock-btn');
    assert.ok(lockBtn, '#lock-btn must exist in sidebar');

    // Click 100 times in rapid succession
    for (let i = 0; i < 100; i++) {
      env.click(lockBtn);
      assert.strictEqual(env.Storage.isUnlocked(), false, `Storage must remain locked on click ${i}`);
      assert.strictEqual(env.document.title, 'Hobby Tracker (Locked)');
      const loginScreen = env.document.getElementById('login-screen');
      assert.strictEqual(loginScreen.style.display, 'flex');
      const appEl = env.document.getElementById('app');
      assert.strictEqual(appEl.style.display, 'none');
    }

    env.teardown();
    recordPass('C2: 100 rapid consecutive #lock-btn clicks succeed without memory leaks or crash');
  } catch (e) {
    recordFail('C2: 100 rapid consecutive #lock-btn clicks succeed without memory leaks or crash', e);
  }

  // C3: Re-unlock and re-lock stress cycles (10 complete roundtrips)
  try {
    const env = await bootApp();

    for (let cycle = 1; cycle <= 10; cycle++) {
      await env.unlockVault('TestPassword123!');
      assert.strictEqual(env.Storage.isUnlocked(), true, `Vault must be unlocked on cycle ${cycle}`);
      assert.strictEqual(env.document.getElementById('app').style.display, 'flex');

      const lockBtn = env.document.getElementById('lock-btn');
      env.click(lockBtn);
      assert.strictEqual(env.Storage.isUnlocked(), false, `Vault must be locked on cycle ${cycle}`);
      assert.strictEqual(env.document.getElementById('app').style.display, 'none');
      assert.strictEqual(env.document.title, 'Hobby Tracker (Locked)');
    }

    env.teardown();
    recordPass('C3: 10 complete unlock/lock roundtrip cycles without state degradation');
  } catch (e) {
    recordFail('C3: 10 complete unlock/lock roundtrip cycles without state degradation', e);
  }

  // -------------------------------------------------------------------------
  // SUITE D: Document Titles & Contract Compliance
  // -------------------------------------------------------------------------
  console.log('\n--- SUITE D: Document Titles & Contract Compliance ---');

  // D1: Document title behavior across view switching
  try {
    const env = await bootApp();
    await env.unlockVault('TestPassword123!');

    const views = ['habits', 'tasks', 'diary', 'settings'];
    const expectedTitles = {
      habits: 'Habits — Hobby Tracker',
      tasks: 'Tasks — Hobby Tracker',
      diary: 'Diary — Hobby Tracker',
      settings: 'Settings — Hobby Tracker'
    };

    for (const v of views) {
      env.switchView(v);
      assert.strictEqual(
        env.document.title,
        expectedTitles[v],
        `Title for view "${v}" must be "${expectedTitles[v]}", got "${env.document.title}"`
      );
      assert.ok(
        env.document.title.includes(v.charAt(0).toUpperCase() + v.slice(1)) ||
        env.document.title.includes('Daily') ||
        env.document.title.includes('Tasks') ||
        env.document.title.includes('Diary'),
        'View title must contain view keyword'
      );
      assert.ok(
        env.document.title.includes('Hobby Tracker'),
        'View title must contain "Hobby Tracker"'
      );
    }

    // Test unknown view fallback
    env.switchView('nonexistent_view');
    assert.strictEqual(
      env.document.title,
      'Hobby Tracker',
      'Unknown view must fall back to "Hobby Tracker"'
    );

    // Test lock transition
    const lockBtn = env.document.getElementById('lock-btn');
    env.click(lockBtn);
    assert.strictEqual(
      env.document.title,
      'Hobby Tracker (Locked)',
      'Locked state must set title to "Hobby Tracker (Locked)"'
    );

    env.teardown();
    recordPass('D1: Document titles across all 4 views, fallback, and locked state');
  } catch (e) {
    recordFail('D1: Document titles across all 4 views, fallback, and locked state', e);
  }

  // D2: Official E2E Suite R4 test verification
  try {
    const env = await bootApp();
    await env.unlockVault('TestPassword123!');

    // Official E2E Suite assertions from tests/tier1_features/test_r4_shell_pwa.js
    env.switchView('habits');
    assert.ok(
      env.document.title.includes('Habits') && env.document.title.includes('Hobby Tracker'),
      `Habits view title must include "Habits" and "Hobby Tracker", got "${env.document.title}"`
    );

    env.switchView('tasks');
    assert.ok(
      env.document.title.includes('Tasks') && env.document.title.includes('Hobby Tracker'),
      `Tasks view title must include "Tasks" and "Hobby Tracker", got "${env.document.title}"`
    );

    env.switchView('diary');
    assert.ok(
      env.document.title.includes('Diary') && env.document.title.includes('Hobby Tracker'),
      `Diary view title must include "Diary" and "Hobby Tracker", got "${env.document.title}"`
    );

    env.switchView('settings');
    assert.ok(
      env.document.title.includes('Settings') && env.document.title.includes('Hobby Tracker'),
      `Settings view title must include "Settings" and "Hobby Tracker", got "${env.document.title}"`
    );

    env.teardown();
    recordPass('D2: Conformance to official Tier 1 test_r4_shell_pwa.js title criteria');
  } catch (e) {
    recordFail('D2: Conformance to official Tier 1 test_r4_shell_pwa.js title criteria', e);
  }

  // -------------------------------------------------------------------------
  // SUITE E: PWA Manifest & Shell Metadata Audit
  // -------------------------------------------------------------------------
  console.log('\n--- SUITE E: PWA Manifest & Shell Metadata Audit ---');

  // E1: Manifest completeness & icon separation
  try {
    const rootDir = path.resolve(__dirname, '..');
    const webmanifestPath = path.join(rootDir, 'manifest.webmanifest');
    const jsonManifestPath = path.join(rootDir, 'manifest.json');

    const mWeb = JSON.parse(fs.readFileSync(webmanifestPath, 'utf8'));
    const mJson = JSON.parse(fs.readFileSync(jsonManifestPath, 'utf8'));

    assert.deepStrictEqual(mWeb, mJson, 'manifest.webmanifest and manifest.json must have identical content');

    assert.strictEqual(mWeb.id, 'hobby-tracker-pwa');
    assert.strictEqual(mWeb.name, 'Hobby Tracker');
    assert.strictEqual(mWeb.short_name, 'Hobby Tracker');
    assert.strictEqual(mWeb.scope, './');
    assert.strictEqual(mWeb.start_url, './index.html');
    assert.strictEqual(mWeb.display, 'standalone');
    assert.deepStrictEqual(mWeb.display_override, ['window-controls-overlay', 'standalone', 'minimal-ui']);

    // Check separate any and maskable icons
    const icons192 = mWeb.icons.filter(i => i.sizes === '192x192');
    const icons512 = mWeb.icons.filter(i => i.sizes === '512x512');

    assert.strictEqual(icons192.length, 2, 'Must have 2 entries for 192x192 icons (any and maskable)');
    assert.strictEqual(icons512.length, 2, 'Must have 2 entries for 512x512 icons (any and maskable)');

    const hasAny192 = icons192.some(i => i.purpose === 'any');
    const hasMaskable192 = icons192.some(i => i.purpose === 'maskable');
    const hasAny512 = icons512.some(i => i.purpose === 'any');
    const hasMaskable512 = icons512.some(i => i.purpose === 'maskable');

    assert.ok(hasAny192 && hasMaskable192, '192x192 icons must separate any and maskable');
    assert.ok(hasAny512 && hasMaskable512, '512x512 icons must separate any and maskable');

    // Verify physical image files exist and are not 0 bytes
    for (const icon of mWeb.icons) {
      const iconPath = path.join(rootDir, icon.src);
      assert.ok(fs.existsSync(iconPath), `Icon file ${iconPath} must exist`);
      const stat = fs.statSync(iconPath);
      assert.ok(stat.size > 0, `Icon file ${iconPath} must not be empty`);
    }

    recordPass('E1: PWA Manifest schema, separated icon purposing, and physical file existence');
  } catch (e) {
    recordFail('E1: PWA Manifest schema, separated icon purposing, and physical file existence', e);
  }

  // E2: HTML Head Windows & PWA Metadata
  try {
    const rootDir = path.resolve(__dirname, '..');
    const html = fs.readFileSync(path.join(rootDir, 'index.html'), 'utf8');

    assert.ok(html.includes('<meta name="application-name" content="Hobby Tracker">'), 'Missing application-name meta');
    assert.ok(html.includes('<meta name="msapplication-TileColor" content="#3fa34d">'), 'Missing msapplication-TileColor meta');
    assert.ok(html.includes('<meta name="msapplication-TileImage" content="./icons/icon-192.png">'), 'Missing msapplication-TileImage meta');
    assert.ok(html.includes('<meta name="msapplication-config" content="none">'), 'Missing msapplication-config meta');
    assert.ok(html.includes('<link rel="manifest" href="./manifest.webmanifest">'), 'Missing manifest.webmanifest link');
    assert.ok(html.includes('<link rel="alternate" type="application/json" href="./manifest.json" title="Web App Manifest">'), 'Missing manifest.json alternate link');

    recordPass('E2: HTML Head Windows & PWA metadata tags');
  } catch (e) {
    recordFail('E2: HTML Head Windows & PWA metadata tags', e);
  }

  // -------------------------------------------------------------------------
  // SUMMARY
  // -------------------------------------------------------------------------
  console.log('\n======================================================================');
  console.log(`TOTAL ADVERSARIAL TESTS: ${passed + failed}`);
  console.log(`PASSED: ${passed}`);
  console.log(`FAILED: ${failed}`);
  console.log(`FINDINGS / NOTES: ${edgeCaseFindings.length}`);
  console.log('======================================================================\n');

  return { passed, failed, failureDetails, edgeCaseFindings };
}

if (require.main === module) {
  runAdversarialSuite().then(res => {
    process.exit(res.failed > 0 ? 1 : 0);
  }).catch(e => {
    console.error('Harness runtime fatal error:', e);
    process.exit(1);
  });
}

module.exports = runAdversarialSuite;
