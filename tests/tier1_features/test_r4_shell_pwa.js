'use strict';

const fs = require('node:fs');
const path = require('node:path');
const { describe, test, beforeEach, afterEach } = require('../runner');
const assert = require('../helpers/assert');
const { bootApp } = require('../helpers/env');

describe('Tier 1: Feature R4 - Top Quote Banner, Button Cleanup & PWA Desktop Identity', () => {
  let env;

  beforeEach(async () => {
    env = await bootApp();
    await env.unlockVault('TestPassword123!');
  });

  afterEach(() => {
    if (env) env.teardown();
  });

  test('T1-R4-01: Permanent top header quote banner is visible across all views', async () => {
    const banner = env.document.getElementById('top-quote-banner');
    assert.ok(banner, '#top-quote-banner must exist in main app header shell');

    const views = ['habits', 'tasks', 'diary', 'settings'];
    for (const view of views) {
      env.switchView(view);
      assert.domVisible(
        env.document,
        '#top-quote-banner',
        `#top-quote-banner must remain visible when viewing ${view}`
      );
    }
  });

  test('T1-R4-02: Top quote banner renders quote text and author from state', async () => {
    const quoteTextEl = env.document.getElementById('quote-text');
    const quoteAuthorEl = env.document.getElementById('quote-author');
    assert.ok(quoteTextEl, '#quote-text element must exist');
    assert.ok(quoteAuthorEl, '#quote-author element must exist');

    assert.ok(quoteTextEl.textContent.trim().length > 0, 'Quote text must be populated');
    assert.ok(quoteAuthorEl.textContent.trim().length > 0, 'Quote author must be populated');
  });

  test('T1-R4-03: Redundant Exit button is removed from sidebar', async () => {
    const exitBtn = env.document.getElementById('logout-btn');
    assert.strictEqual(exitBtn, null, '#logout-btn (Exit button) must be completely removed from sidebar DOM');

    const lockBtn = env.document.getElementById('lock-btn');
    assert.ok(lockBtn, '#lock-btn must remain present in sidebar footer');
  });

  test('T1-R4-04: Lock Vault functionality locks vault and displays login screen', async () => {
    const lockBtn = env.document.getElementById('lock-btn');
    assert.ok(lockBtn, '#lock-btn must exist');

    env.click(lockBtn);
    await new Promise(r => setTimeout(r, 20));

    const loginScreen = env.document.getElementById('login-screen');
    const appScreen = env.document.getElementById('app');

    assert.domVisible(env.document, loginScreen, 'Login screen must become visible when locked');
    assert.domHidden(env.document, appScreen, 'App screen must become hidden when locked');
    assert.strictEqual(env.document.title, 'Hobby Tracker (Locked)', 'Document title must reflect locked state');
    assert.strictEqual(env.Storage.isUnlocked(), false, 'Storage._unlocked must be false after locking');
  });

  test('T1-R4-05: PWA manifest configures standalone display and icons', async () => {
    const rootDir = path.resolve(__dirname, '..', '..');
    const manifestPath = path.join(rootDir, 'manifest.webmanifest');
    assert.ok(fs.existsSync(manifestPath), 'manifest.webmanifest must exist at project root');

    const manifestContent = JSON.parse(fs.readFileSync(manifestPath, 'utf8'));
    assert.strictEqual(manifestContent.display, 'standalone', 'Manifest display property must be "standalone"');
    assert.strictEqual(manifestContent.name, 'Hobby Tracker', 'Manifest name must be "Hobby Tracker"');
    assert.ok(manifestContent.id, 'Manifest must specify a unique app id');
    assert.ok(manifestContent.scope, 'Manifest must specify app scope');

    assert.ok(Array.isArray(manifestContent.icons), 'Manifest must provide an icons array');
    const iconSizes = manifestContent.icons.map(i => i.sizes);
    assert.ok(iconSizes.includes('192x192'), 'Manifest must include 192x192 icon');
    assert.ok(iconSizes.includes('512x512'), 'Manifest must include 512x512 icon');
  });

  test('T1-R4-06: Dynamic window title updates with view for Windows Task Manager', async () => {
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
  });

  test('T1-R4-07: Dual directory static file parity between root and public/', async () => {
    const rootDir = path.resolve(__dirname, '..', '..');
    const filesToCompare = [
      'index.html',
      'manifest.webmanifest',
      'sw.js',
      'css/style.css',
      'js/api.js',
      'js/app.js',
      'js/auth.js',
      'js/crypto.js',
      'js/storage.js',
      'js/sync.js',
      'js/views.js'
    ];

    for (const relPath of filesToCompare) {
      const rootFilePath = path.join(rootDir, relPath);
      const publicFilePath = path.join(rootDir, 'public', relPath);

      assert.ok(fs.existsSync(rootFilePath), `Root file ${relPath} must exist`);
      assert.ok(fs.existsSync(publicFilePath), `Public mirror file public/${relPath} must exist`);

      const rootBuf = fs.readFileSync(rootFilePath);
      const pubBuf = fs.readFileSync(publicFilePath);
      assert.ok(
        rootBuf.equals(pubBuf),
        `Parity mismatch: ${relPath} and public/${relPath} must be byte-for-byte identical`
      );
    }
  });
});
