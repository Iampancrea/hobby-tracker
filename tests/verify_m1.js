// Verification script for Milestone 1
const fs = require('fs');
const path = require('path');
const crypto = require('crypto');
const http = require('http');

function hashFile(filePath) {
  const content = fs.readFileSync(filePath);
  return crypto.createHash('sha256').update(content).digest('hex');
}

console.log('=== Step 1: Dual Directory Parity Check ===');
const clientFiles = [
  'index.html',
  'manifest.webmanifest',
  'manifest.json',
  'sw.js',
  'css/style.css',
  'js/app.js',
  'js/views.js',
  'js/auth.js',
  'js/api.js',
  'js/crypto.js',
  'js/storage.js',
  'js/sync.js',
  'icons/icon-192.png',
  'icons/icon-512.png',
  'icons/icon.svg'
];

let parityErrors = 0;
for (const file of clientFiles) {
  const rootPath = path.join(__dirname, '..', file);
  const pubPath = path.join(__dirname, '..', 'public', file);

  if (!fs.existsSync(rootPath)) {
    console.error(`FAIL: Missing in root: ${file}`);
    parityErrors++;
    continue;
  }
  if (!fs.existsSync(pubPath)) {
    console.error(`FAIL: Missing in public: ${file}`);
    parityErrors++;
    continue;
  }

  const hRoot = hashFile(rootPath);
  const hPub = hashFile(pubPath);

  if (hRoot !== hPub) {
    console.error(`FAIL: SHA-256 mismatch for ${file}!\n  root:   ${hRoot}\n  public: ${hPub}`);
    parityErrors++;
  } else {
    console.log(`PASS: ${file} matches (${hRoot.substring(0, 16)}...)`);
  }
}

if (parityErrors > 0) {
  console.error(`Dual directory parity failed with ${parityErrors} errors.`);
  process.exit(1);
} else {
  console.log(`Parity check PASSED: All ${clientFiles.length} files match 100% byte-for-byte.`);
}

console.log('\n=== Step 2: Manifest Structure Validation ===');
const manifestFiles = [
  'manifest.webmanifest',
  'manifest.json',
  'public/manifest.webmanifest',
  'public/manifest.json'
];

for (const mFile of manifestFiles) {
  const fullPath = path.join(__dirname, '..', mFile);
  const raw = fs.readFileSync(fullPath, 'utf8');
  const json = JSON.parse(raw);

  if (json.id !== 'hobby-tracker-pwa') throw new Error(`${mFile}: invalid id`);
  if (json.name !== 'Hobby Tracker') throw new Error(`${mFile}: invalid name`);
  if (json.short_name !== 'Hobby Tracker') throw new Error(`${mFile}: invalid short_name`);
  if (json.scope !== './') throw new Error(`${mFile}: invalid scope`);
  if (json.start_url !== './index.html') throw new Error(`${mFile}: invalid start_url`);
  if (json.display !== 'standalone') throw new Error(`${mFile}: invalid display`);
  if (!Array.isArray(json.display_override) || json.display_override[0] !== 'window-controls-overlay') {
    throw new Error(`${mFile}: invalid display_override`);
  }

  const hasAny192 = json.icons.some(i => i.src.includes('192') && i.purpose === 'any');
  const hasMaskable192 = json.icons.some(i => i.src.includes('192') && i.purpose === 'maskable');
  const hasAny512 = json.icons.some(i => i.src.includes('512') && i.purpose === 'any');
  const hasMaskable512 = json.icons.some(i => i.src.includes('512') && i.purpose === 'maskable');

  if (!hasAny192 || !hasMaskable192 || !hasAny512 || !hasMaskable512) {
    throw new Error(`${mFile}: missing separated any/maskable icon definitions`);
  }

  console.log(`PASS: ${mFile} schema valid.`);
}

console.log('\n=== Step 3: DOM & Structural Checks ===');
const indexHtml = fs.readFileSync(path.join(__dirname, '..', 'index.html'), 'utf8');

if (!indexHtml.includes('id="top-quote-banner"')) throw new Error('index.html missing #top-quote-banner');
if (!indexHtml.includes('name="application-name" content="Hobby Tracker"')) throw new Error('index.html missing application-name meta');
if (!indexHtml.includes('name="msapplication-TileColor" content="#3fa34d"')) throw new Error('index.html missing msapplication-TileColor meta');
if (!indexHtml.includes('name="msapplication-TileImage" content="./icons/icon-192.png"')) throw new Error('index.html missing msapplication-TileImage meta');
if (!indexHtml.includes('href="./manifest.json"')) throw new Error('index.html missing manifest.json link');
if (indexHtml.includes('id="logout-btn"')) throw new Error('index.html still contains id="logout-btn"');
if (indexHtml.includes('id="quote-section"')) throw new Error('index.html still contains id="quote-section"');
if (!indexHtml.includes('id="lock-btn"') || !indexHtml.includes('Lock Vault')) throw new Error('index.html missing updated #lock-btn');

console.log('PASS: index.html DOM requirements met.');

console.log('\n=== Step 4: CSS Checks ===');
const styleCss = fs.readFileSync(path.join(__dirname, '..', 'css/style.css'), 'utf8');
if (!styleCss.includes('.top-quote-banner')) throw new Error('style.css missing .top-quote-banner');
if (!styleCss.includes('.top-quote-content')) throw new Error('style.css missing .top-quote-content');
if (!styleCss.includes('.quote-mark')) throw new Error('style.css missing .quote-mark');
if (!styleCss.includes('.top-quote-body')) throw new Error('style.css missing .top-quote-body');
console.log('PASS: style.css classes verified.');

console.log('\n=== Step 5: JavaScript Logic Checks ===');
const viewsJs = fs.readFileSync(path.join(__dirname, '..', 'js/views.js'), 'utf8');
if (!viewsJs.includes('renderTopQuote')) throw new Error('views.js missing renderTopQuote');
if (!viewsJs.includes('_activeQuote')) throw new Error('views.js missing _activeQuote');
if (viewsJs.includes('document.getElementById(\'quote-section\')')) throw new Error('views.js still references #quote-section');

const appJs = fs.readFileSync(path.join(__dirname, '..', 'js/app.js'), 'utf8');
if (!appJs.includes("'Habits — Hobby Tracker'")) throw new Error('app.js missing dynamic title for habits');
if (!appJs.includes("'Tasks — Hobby Tracker'")) throw new Error('app.js missing dynamic title for tasks');
if (!appJs.includes("'Diary — Hobby Tracker'")) throw new Error('app.js missing dynamic title for diary');
if (!appJs.includes("'Settings — Hobby Tracker'")) throw new Error('app.js missing dynamic title for settings');
if (!appJs.includes('Views.renderTopQuote')) throw new Error('app.js missing Views.renderTopQuote calls');

const authJs = fs.readFileSync(path.join(__dirname, '..', 'js/auth.js'), 'utf8');
if (authJs.includes('logout-btn')) throw new Error('auth.js still references logout-btn');
if (!authJs.includes('Hobby Tracker (Locked)')) throw new Error('auth.js missing document.title = Hobby Tracker (Locked)');

const swJs = fs.readFileSync(path.join(__dirname, '..', 'sw.js'), 'utf8');
if (!swJs.includes('hobby-tracker-v2')) throw new Error('sw.js cache version not bumped to v2');
if (!swJs.includes('./manifest.json')) throw new Error('sw.js APP_SHELL missing ./manifest.json');

console.log('PASS: JavaScript logic verified.');

console.log('\n=== Step 6: Server MIME & Static Serving Smoke Test ===');
const serverJs = fs.readFileSync(path.join(__dirname, '..', 'server.js'), 'utf8');
if (!serverJs.includes("'.webmanifest': 'application/manifest+json'")) {
  throw new Error("server.js MIME_TYPES missing .webmanifest definition");
}

// Start server child process
const { spawn } = require('child_process');
const serverProc = spawn(process.execPath, ['server.js'], {
  cwd: path.join(__dirname, '..'),
  env: Object.assign({}, process.env, { PORT: '3099' }),
  stdio: 'pipe'
});

serverProc.stdout.on('data', d => process.stdout.write('[server] ' + d));
serverProc.stderr.on('data', d => process.stderr.write('[server err] ' + d));

setTimeout(() => {
  // Test HTTP GET /
  const req = http.get('http://localhost:3099/index.html', (res) => {
    console.log(`Server root index.html response status: ${res.statusCode}`);
    if (res.statusCode !== 200) {
      serverProc.kill();
      throw new Error(`Expected HTTP 200, got ${res.statusCode}`);
    }

    // Test HTTP GET /manifest.webmanifest
    http.get('http://localhost:3099/manifest.webmanifest', (mRes) => {
      console.log(`Server manifest.webmanifest status: ${mRes.statusCode}`);
      console.log(`Server manifest.webmanifest content-type: ${mRes.headers['content-type']}`);
      
      let rawData = '';
      mRes.on('data', chunk => rawData += chunk);
      mRes.on('end', () => {
        const parsed = JSON.parse(rawData);
        if (parsed.id !== 'hobby-tracker-pwa') {
          serverProc.kill();
          throw new Error('Manifest content invalid from server');
        }

        if (mRes.headers['content-type'] !== 'application/manifest+json') {
          serverProc.kill();
          throw new Error(`Expected application/manifest+json, got ${mRes.headers['content-type']}`);
        }

        console.log('PASS: Server smoke test passed completely.');
        serverProc.kill();
        console.log('\n*** ALL MILESTONE 1 VERIFICATIONS PASSED 100% ***');
        process.exit(0);
      });
    }).on('error', err => {
      serverProc.kill();
      console.error('Manifest request error:', err);
      process.exit(1);
    });
  });

  req.on('error', (err) => {
    serverProc.kill();
    console.error('Server request error:', err);
    process.exit(1);
  });
}, 1500);
