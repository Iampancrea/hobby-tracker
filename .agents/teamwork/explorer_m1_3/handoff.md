# Milestone 1 Investigation Report: Dual Directory Sync, Verification & Regression Analysis

**Date**: 2026-11-13  
**Investigator**: Explorer 3 (Milestone 1)  
**State Folder**: `d:\amol\projects\hobby tracker website\.agents\teamwork\explorer_m1_3`  

---

## 1. Observation

### 1.1 Dual Directory File Mapping & Hash Comparison

Investigation of `./` (root) and `./public` using PowerShell `Get-FileHash -Algorithm SHA256` revealed that exactly **14 client assets** currently exist in `public/`. Every single file in `public/` matches its root counterpart byte-for-byte with identical SHA-256 hashes:

| # | Relative Path | Root Size | Public Size | SHA-256 Match |
|---|---------------|-----------|-------------|---------------|
| 1 | `index.html` | 18,874 B | 18,874 B | `2ECC4FC47C6206C3B171CF9EB9A49EACB7B681417A185037593CDC0F236A531D` (MATCH) |
| 2 | `manifest.webmanifest` | 724 B | 724 B | `CA2D078FA70CC4A1616BE54AD37AB055D3744735026690D9CB1D981BD485121E` (MATCH) |
| 3 | `sw.js` | 1,764 B | 1,764 B | `099AF5134640F836A763BC2D98D1DF688E50BA08CBDB4C21CC5B0CCC554D873C` (MATCH) |
| 4 | `css/style.css` | 19,068 B | 19,068 B | `D7225B00C8B020708ED637910E810F159411C4183B4D0650246DFC6F63357D7F` (MATCH) |
| 5 | `icons/icon-192.png` | 1,842 B | 1,842 B | `676CB2CAC64B11F48064BA2D82D414F26CE2F7A3DBCEC67A08F08A8FC34C8D78` (MATCH) |
| 6 | `icons/icon-512.png` | 5,642 B | 5,642 B | `A31D74EEE22E2D98ECE94A2B5218F91DE498D1531657665BC99F1F15C1B46BF5` (MATCH) |
| 7 | `icons/icon.svg` | 2,188 B | 2,188 B | `5C9E0750E7D24E29134AE1053D9E391DAABA554B4A3C3DC1237C2CEFFCAA2F63` (MATCH) |
| 8 | `js/api.js` | 2,478 B | 2,478 B | `F1DCE0A668F4EB628A99547DDC4A3A1CDE66F8C37EF06F997B4549E0525CA534` (MATCH) |
| 9 | `js/app.js` | 19,278 B | 19,278 B | `44893B5149207526A1A1AC5E86431CF83C41BAEAC86CE1DFDB8BC561A2E8E88F` (MATCH) |
| 10 | `js/auth.js` | 6,826 B | 6,826 B | `BED6B75F9E6928CAA303F5523A56FF2C825E25ED11745BA8282F4BFE1E8A81E4` (MATCH) |
| 11 | `js/crypto.js` | 3,637 B | 3,637 B | `EAED8BB0EFF4D6CAE8E26CD2EB078B4A1A2D938DE2692B93612AC3733319539A` (MATCH) |
| 12 | `js/storage.js` | 15,079 B | 15,079 B | `DD62CE7C0A3069798207FAAFC632327B333724F550BE7B5340CB97CB720DA272` (MATCH) |
| 13 | `js/sync.js` | 12,432 B | 12,432 B | `8749F5475C25604FA69804FF00471D026868505AF5AF2DC4B2B7251554720649` (MATCH) |
| 14 | `js/views.js` | 22,368 B | 22,368 B | `725E8E447DD4741F40AAFFCABAA29324FF4D672462DAB54579860E24B5C488B4` (MATCH) |

### 1.2 Unmirrored Files in Root
The following files exist in `./` but are **not** present in `public/`:
- **Legacy modular styles**: `css/base.css`, `css/diary.css`, `css/layout.css`, `css/notes.css`, `css/tracker.css`
- **Legacy modular scripts**: `js/config.js`, `js/sha256.js`, `js/util.js`
- **Backend / Deployment assets**: `server.js`, `Dockerfile`, `render.yaml`, `install-service.bat`, `DEPLOYMENT.md`, `README.md`, `PROJECT.md`
- **Note on `manifest.json`**: Neither `./manifest.json` nor `./public/manifest.json` currently exists (`Test-Path` returned `False` for both).

### 1.3 Serving Discrepancy & Dual Folder Imperative
1. **Node.js Local Server (`server.js`)**:
   - `server.js:8`: `const PUBLIC_DIR = path.join(__dirname, 'public');`
   - `server.js:472-473`:
     ```javascript
     const filePath = path.join(PUBLIC_DIR, urlPath === '/' ? 'index.html' : urlPath);
     serveStatic(req, res, filePath);
     ```
   `server.js` serves client static assets **exclusively from `public/`**.
2. **GitHub Pages Deployment (`DEPLOYMENT.md`)**:
   - `DEPLOYMENT.md:34`: `"Deploy from a branch → Branch: main → Folder: / (root)"`
   GitHub Pages serves client static assets **exclusively from root `./`**.

### 1.4 Verification & Test Runner Environment
- **Node.js version**: `v24.14.1`.
- **`package.json`**: Does **not** exist in repository root (`Test-Path "package.json"` returned `False`).
- **Test framework**: No npm-based test runner (Jest, Mocha, Vitest) is installed.
- **Node syntax check (`node -c`)**: Executed across all 20 `.js` files in the repository. All 20 passed with exit code 0 (`OK`).

### 1.5 Regression & Dependency Trace: `#logout-btn`
Verbatim occurrences across the codebase:
- `index.html:130-131`:
  ```html
  <div class="sidebar-footer">
    <button id="lock-btn" class="btn btn-secondary btn-small" title="Lock App">🔒 Lock</button>
    <button id="logout-btn" class="btn btn-secondary btn-small">Exit</button>
  </div>
  ```
  *(Identical in `public/index.html:130-131`)*
- `js/auth.js:14-18`:
  ```javascript
  const logoutBtn = document.getElementById('logout-btn');

  if (logoutBtn) {
    logoutBtn.addEventListener('click', () => this.lockApp());
  }
  ```
  *(Identical in `public/js/auth.js:14-18`)*
- `js/app.js:41-47`:
  ```javascript
  // Lock button
  const lockBtn = document.getElementById('lock-btn');
  if (lockBtn) {
    lockBtn.addEventListener('click', () => {
      toggleSidebar(false);
      Auth.lockApp();
    });
  }
  ```
- `css/style.css:236-243`:
  ```css
  .sidebar-footer {
    padding: 16px;
    border-top: 1px solid var(--border);
  }

  .sidebar-footer .btn {
    width: 100%;
  }
  ```
- **Other modules**: `js/views.js`, `js/storage.js`, `js/sync.js`, `js/api.js` have **zero references** to `logout-btn`.

### 1.6 Regression & Dependency Trace: Quotes & Banner
Verbatim occurrences of quote elements and handlers:
- `index.html:200-204`:
  ```html
  <div class="diary-content">
    <div class="quote-section" id="quote-section">
      <blockquote id="quote-text"></blockquote>
      <cite id="quote-author"></cite>
    </div>
  ```
  *(Currently nested strictly within `#view-diary`)*
- `js/views.js:494-505` inside `renderDiary()`:
  ```javascript
  // Quote
  const quoteSection = document.getElementById('quote-section');
  const quotes = this.state.quotes;
  if (quotes.length > 0) {
    const randomQuote = quotes[Math.floor(Math.random() * quotes.length)];
    document.getElementById('quote-text').textContent = `"${randomQuote.text}"`;
    document.getElementById('quote-author').textContent = `— ${randomQuote.author || 'Unknown'}`;
    quoteSection.style.display = 'block';
  } else {
    quoteSection.style.display = 'none';
  }
  ```
- `js/views.js:538`: Re-invokes `this.renderDiary()` when diary entry is autosaved or manually saved.
- `js/views.js:588-618` inside `renderSettings()`:
  Renders `#quotes-list` and handles quote deletion via `await API.deleteQuote(btn.dataset.id); await this.loadState(); this.renderSettings();`.
- `js/app.js:280-296`:
  Handles `#add-quote-form` submission via `await API.createQuote({ text, author }); ... await Views.loadState(); Views.renderSettings();`.
- `css/style.css:495-515`:
  Defines styling for `.quote-section`, `.quote-section blockquote`, `.quote-section cite`.

---

## 2. Logic Chain

1. **Parity Requirement**:
   - Observation 1.3 proves that `server.js` serves files exclusively from `public/`, whereas GitHub Pages serves from `./`.
   - Therefore, any change to `index.html`, `manifest.webmanifest`, `manifest.json`, `sw.js`, `css/style.css`, or `js/*.js` must be synchronized 1:1 between root and `public/`. Modifying only one location immediately causes either local development (`server.js`) or production deployment (GitHub Pages) to break or serve stale code.
2. **Legacy File Assessment**:
   - Observation 1.2 and commit history `465bade` show that `css/base.css`, `css/diary.css`, `css/layout.css`, `css/notes.css`, `css/tracker.css`, and `js/config.js`, `js/sha256.js`, `js/util.js` were legacy split files before being consolidated into `css/style.css` and the unified scripts.
   - None of these files are referenced by `index.html` or `sw.js`. They are unmirrored orphans in root. They should **not** be copied into `public/`.
3. **Safety of `#logout-btn` Removal**:
   - Observation 1.5 shows `#logout-btn` is only bound in `js/auth.js:14-18` where it calls `this.lockApp()`, identical to `#lock-btn`.
   - `js/app.js:41-47` already binds `#lock-btn` and invokes `Auth.lockApp()` while closing the mobile sidebar.
   - In `css/style.css:241`, `.sidebar-footer .btn` specifies `width: 100%`.
   - Thus, removing `<button id="logout-btn">` from `index.html` leaves `#lock-btn` as the sole button in `.sidebar-footer`, cleanly spanning full width without layout breakage.
   - Removing the listener block in `js/auth.js` introduces zero regressions in any module (`views.js`, `diary.js`, `habits.js`, `tasks.js`, `settings.js`).
4. **Fatal Regression Risk in Quote Banner Relocation**:
   - Observation 1.6 shows that `renderDiary()` in `js/views.js:495-504` directly accesses `document.getElementById('quote-section')` and manipulates its `.style.display`.
   - If `#quote-section` is moved to a top banner `#top-quote-banner` without refactoring `renderDiary()`, `document.getElementById('quote-section')` returns `null`.
   - `quoteSection.style.display = 'block'` will immediately throw an uncaught `TypeError: Cannot read properties of null (reading 'style')`.
   - This fatal exception halts `renderDiary()` mid-execution, preventing `diary-entry` (line 507) and `diary-tasks` (line 510) from loading. The diary view completely breaks.
5. **Decoupled Architecture for Quote Banner**:
   - Moving the banner to `.main-content` above all view containers makes it globally visible across Habits, Tasks, Diary, and Settings (because views are toggled via `.view.active`).
   - Quote rendering logic must be extracted from `renderDiary()` into a standalone `Views.renderTopQuote()` method.
   - `Views.renderTopQuote()` must be invoked:
     1. During initial startup (`App.init()`) after `Views.loadState()`.
     2. In Settings when adding a new quote (`app.js:292`).
     3. In Settings when deleting a quote (`views.js:612`).
     4. Whenever state is refreshed via cloud sync (`App.init()` onStatusChange listener).
   - `renderDiary()` must have lines 494-504 removed completely.
6. **Task Manager & PWA Identity**:
   - Windows Task Manager identifies PWAs by `manifest.webmanifest` (`name` and `short_name`) and the active `document.title`.
   - Currently, `document.title` remains static (`"Hobby Tracker"`).
   - In `App.switchView(view)`, `document.title` must be set dynamically to `${ViewTitle} — Hobby Tracker`.
   - In `Auth.lockApp()`, `document.title` must be set to `Hobby Tracker (Locked)`.

---

## 3. Caveats

1. **Service Worker Cache Invalidation**:
   - `sw.js` caches all client assets in `APP_SHELL`. During development and browser testing, updates to `style.css` or `js/*.js` will not be picked up if the Service Worker serves from cache unless:
     - The cache name in `sw.js` is bumped (e.g., from `'hobby-tracker-v1'` to `'hobby-tracker-v1.1'`), OR
     - DevTools "Disable cache" / "Update on reload" is checked, or a hard refresh (`Ctrl+F5`) is performed.
2. **Missing `manifest.json`**:
   - `manifest.json` currently does not exist. Milestone 1 implementers must create it alongside `manifest.webmanifest` in both root and `public/`.
3. **Seeded vs Custom Quotes**:
   - If a user deletes all quotes in Settings, `state.quotes` becomes empty. `Views.renderTopQuote()` must handle `quotes.length === 0` gracefully by setting `#top-quote-banner.style.display = 'none'` rather than throwing an error or rendering empty quotes.
4. **No Build Step / Bundler**:
   - The application does not use Webpack, Vite, or Babel. All code written must remain valid native vanilla browser JavaScript (ES6+), without `import`/`export` syntax in scripts loaded via standard `<script>` tags.

---

## 4. Conclusion & Implementation Specifications

### 4.1 Affected Files Checklist for Milestone 1
The following files require synchronized edits:
1. `index.html` & `public/index.html`
2. `manifest.webmanifest` & `public/manifest.webmanifest`
3. `manifest.json` & `public/manifest.json` (New file)
4. `sw.js` & `public/sw.js`
5. `css/style.css` & `public/css/style.css`
6. `js/views.js` & `public/js/views.js`
7. `js/app.js` & `public/js/app.js`
8. `js/auth.js` & `public/js/auth.js`

---

### 4.2 Exact Code Change Recipes

#### Recipe A: `index.html` & `public/index.html`
1. **Remove `#logout-btn` and update `#lock-btn` label** (around line 129):
```html
<!-- BEFORE -->
      <div class="sidebar-footer">
        <button id="lock-btn" class="btn btn-secondary btn-small" title="Lock App">🔒 Lock</button>
        <button id="logout-btn" class="btn btn-secondary btn-small">Exit</button>
      </div>

<!-- AFTER -->
      <div class="sidebar-footer">
        <button id="lock-btn" class="btn btn-secondary btn-small" title="Lock App">🔒 Lock Vault</button>
      </div>
```

2. **Add Top Quote Banner in `.main-content`** (around line 137, above `<div id="view-habits">`):
```html
<!-- AFTER -->
    <main class="main-content">
      <!-- Permanent Top Header Quote Banner -->
      <div id="top-quote-banner" class="top-quote-banner" style="display:none;">
        <blockquote id="quote-text"></blockquote>
        <cite id="quote-author"></cite>
      </div>

      <!-- Habits View -->
      <div id="view-habits" class="view active">
```

3. **Remove old quote block from `#view-diary`** (around lines 200-205):
```html
<!-- BEFORE -->
        <div class="diary-content">
          <div class="quote-section" id="quote-section">
            <blockquote id="quote-text"></blockquote>
            <cite id="quote-author"></cite>
          </div>
          <div class="diary-section">

<!-- AFTER -->
        <div class="diary-content">
          <div class="diary-section">
```

4. **Add Windows tile & PWA meta tags in `<head>`**:
```html
  <meta name="application-name" content="Hobby Tracker">
  <meta name="msapplication-TileColor" content="#3fa34d">
  <meta name="msapplication-TileImage" content="./icons/icon-192.png">
  <link rel="alternate" type="application/manifest+json" href="./manifest.json">
```

---

#### Recipe B: `css/style.css` & `public/css/style.css`
Add styling for `#top-quote-banner`:
```css
/* === TOP HEADER QUOTE BANNER === */
.top-quote-banner {
  background: var(--surface);
  padding: 16px 20px;
  border-radius: var(--radius);
  border-left: 4px solid var(--primary);
  margin-bottom: 24px;
  box-shadow: 0 1px 3px rgba(0, 0, 0, 0.05);
}

.top-quote-banner blockquote {
  font-size: 15px;
  font-style: italic;
  color: var(--text);
  margin: 0 0 6px 0;
  line-height: 1.4;
}

.top-quote-banner cite {
  font-size: 13px;
  color: var(--text-muted);
  font-style: normal;
  display: block;
}
```

---

#### Recipe C: `js/views.js` & `public/js/views.js`
1. **Add `renderTopQuote()` to `Views` object**:
```javascript
  renderTopQuote() {
    const banner = document.getElementById('top-quote-banner');
    if (!banner) return;
    const quotes = this.state.quotes || [];
    if (quotes.length > 0) {
      const randomQuote = quotes[Math.floor(Math.random() * quotes.length)];
      const quoteText = document.getElementById('quote-text');
      const quoteAuthor = document.getElementById('quote-author');
      if (quoteText) quoteText.textContent = `"${randomQuote.text}"`;
      if (quoteAuthor) quoteAuthor.textContent = `— ${randomQuote.author || 'Unknown'}`;
      banner.style.display = 'block';
    } else {
      banner.style.display = 'none';
    }
  },
```

2. **Clean up `renderDiary()`** (remove lines 494-505):
```javascript
  async renderDiary() {
    const dateInput = document.getElementById('diary-date');
    dateInput.value = this.currentDiaryDate;
    
    try {
      const diary = await API.getDiary(this.currentDiaryDate);
      
      // Entry
      document.getElementById('diary-entry').value = diary.entry || '';
      
      // Tasks
      const tasksList = document.getElementById('diary-tasks');
```

3. **Call `this.renderTopQuote()` in `renderSettings()` after quote deletion**:
```javascript
      quotesList.querySelectorAll('.quote-item-delete').forEach(btn => {
        btn.addEventListener('click', async () => {
          if (confirm('Delete this quote?')) {
            await API.deleteQuote(btn.dataset.id);
            await this.loadState();
            this.renderSettings();
            this.renderTopQuote();
          }
        });
      });
```

---

#### Recipe D: `js/app.js` & `public/js/app.js`
1. **Call `Views.renderTopQuote()` on init & quote creation**:
- In `App.init()` (line 7):
  ```javascript
  await Views.loadState();
  Views.renderTopQuote();
  ```
- In `#add-quote-form` listener (line 292):
  ```javascript
  await API.createQuote({ text, author });
  document.getElementById('new-quote-text').value = '';
  document.getElementById('new-quote-author').value = '';
  await Views.loadState();
  Views.renderSettings();
  Views.renderTopQuote();
  ```
- In `Sync.onStatusChange` listener (line 21):
  ```javascript
  if (status === 'synced') {
    await Views.loadState();
    Views.renderTopQuote();
    this.refreshCurrentView();
  }
  ```

2. **Dynamic `document.title` in `App.switchView(view)`**:
```javascript
  switchView(view) {
    this.currentViewName = view;
    
    const titleMap = {
      habits: 'Habits',
      tasks: 'Tasks',
      diary: 'Diary',
      settings: 'Settings'
    };
    const viewTitle = titleMap[view] || 'Habits';
    document.title = `${viewTitle} — Hobby Tracker`;

    document.querySelectorAll('.nav-item').forEach(item => {
      item.classList.toggle('active', item.dataset.view === view);
    });

    document.querySelectorAll('.view').forEach(v => {
      v.classList.toggle('active', v.id === `view-${view}`);
    });

    if (view === 'habits') Views.renderHabits();
    else if (view === 'tasks') Views.renderTasks();
    else if (view === 'diary') Views.renderDiary();
    else if (view === 'settings') Views.renderSettings();
  }
```

---

#### Recipe E: `js/auth.js` & `public/js/auth.js`
1. **Remove `#logout-btn` listener** (lines 14-18):
```javascript
    // Lines 14-18 removed
```
2. **Update `document.title` on `lockApp()`**:
```javascript
  lockApp() {
    Storage.lock();
    document.title = 'Hobby Tracker (Locked)';
    document.getElementById('app').style.display = 'none';
    document.getElementById('login-screen').style.display = 'flex';
    document.getElementById('password').value = '';
    document.getElementById('confirm-password').value = '';
    this.evaluateAuthState();
  },
```

---

#### Recipe F: `manifest.webmanifest`, `manifest.json`, and `sw.js`
1. **Manifest configuration** (identical in `manifest.webmanifest`, `public/manifest.webmanifest`, `manifest.json`, `public/manifest.json`):
```json
{
  "id": "./index.html",
  "name": "Hobby Tracker",
  "short_name": "Hobby Tracker",
  "description": "Offline-first Notion-style habit tracker and daily diary with encrypted sync.",
  "start_url": "./index.html",
  "scope": "./",
  "display": "standalone",
  "display_override": ["window-controls-overlay", "standalone", "minimal-ui"],
  "orientation": "any",
  "background_color": "#f7f6f3",
  "theme_color": "#3fa34d",
  "icons": [
    {
      "src": "icons/icon-192.png",
      "sizes": "192x192",
      "type": "image/png",
      "purpose": "any"
    },
    {
      "src": "icons/icon-192.png",
      "sizes": "192x192",
      "type": "image/png",
      "purpose": "maskable"
    },
    {
      "src": "icons/icon-512.png",
      "sizes": "512x512",
      "type": "image/png",
      "purpose": "any"
    },
    {
      "src": "icons/icon-512.png",
      "sizes": "512x512",
      "type": "image/png",
      "purpose": "maskable"
    },
    {
      "src": "icons/icon.svg",
      "sizes": "any",
      "type": "image/svg+xml",
      "purpose": "any"
    }
  ],
  "categories": ["productivity", "utilities"]
}
```

2. **`sw.js` & `public/sw.js` cache update**:
Add `'./manifest.json'` and bump version:
```javascript
const CACHE_NAME = 'hobby-tracker-v1.1';

const APP_SHELL = [
  './',
  './index.html',
  './manifest.webmanifest',
  './manifest.json',
  './css/style.css',
  './js/crypto.js',
  './js/storage.js',
  './js/sync.js',
  './js/api.js',
  './js/auth.js',
  './js/views.js',
  './js/app.js',
  './icons/icon-192.png',
  './icons/icon-512.png',
  './icons/icon.svg'
];
```

---

## 5. Verification Method

### 5.1 Automated Parity Verification Script
Run the following PowerShell script to guarantee 100% byte-for-byte SHA-256 equality across all client files:
```powershell
$targetFiles = @(
    "index.html",
    "manifest.webmanifest",
    "manifest.json",
    "sw.js",
    "css\style.css",
    "icons\icon-192.png",
    "icons\icon-512.png",
    "icons\icon.svg",
    "js\api.js",
    "js\app.js",
    "js\auth.js",
    "js\crypto.js",
    "js\storage.js",
    "js\sync.js",
    "js\views.js"
)

$errors = @()
foreach ($file in $targetFiles) {
    $root = $file
    $pub = Join-Path "public" $file
    if (-not (Test-Path $root)) { $errors += "Missing in root: $root"; continue }
    if (-not (Test-Path $pub)) { $errors += "Missing in public: $pub"; continue }
    $hRoot = (Get-FileHash $root -Algorithm SHA256).Hash
    $hPub = (Get-FileHash $pub -Algorithm SHA256).Hash
    if ($hRoot -ne $hPub) {
        $errors += "HASH MISMATCH on $file (Root: $hRoot != Public: $hPub)"
    }
}

if ($errors.Count -eq 0) {
    Write-Host "SUCCESS: All $($targetFiles.Count) client files match 100% byte-for-byte!" -ForegroundColor Green
} else {
    Write-Error ("PARITY CHECK FAILED:`n" + ($errors -join "`n"))
}
```

### 5.2 Client File Copy / Sync Automation
To copy modified files from root to `public/` reliably:
```powershell
$targetFiles = @(
    "index.html",
    "manifest.webmanifest",
    "manifest.json",
    "sw.js",
    "css\style.css",
    "icons\icon-192.png",
    "icons\icon-512.png",
    "icons\icon.svg",
    "js\api.js",
    "js\app.js",
    "js\auth.js",
    "js\crypto.js",
    "js\storage.js",
    "js\sync.js",
    "js\views.js"
)
foreach ($f in $targetFiles) {
    if (Test-Path $f) {
        $dest = Join-Path "public" $f
        $destDir = Split-Path $dest
        if (-not (Test-Path $destDir)) { New-Item -ItemType Directory -Path $destDir -Force | Out-Null }
        Copy-Item -Path $f -Destination $dest -Force
    }
}
Write-Host "Client files synced to public/." -ForegroundColor Green
```

### 5.3 JavaScript Syntax Verification
Run native node syntax checking across all repository JS files:
```powershell
Get-ChildItem -Recurse -Filter "*.js" | Where-Object { $_.FullName -notmatch '\\\.git|\\\.agents|\\node_modules' } | ForEach-Object {
    $out = & node -c $_.FullName 2>&1
    if ($LASTEXITCODE -ne 0) {
        Write-Error "Syntax error in $($_.FullName): $out"
    } else {
        Write-Host "Syntax OK: $($_.Name)" -ForegroundColor Green
    }
}
```

### 5.4 Manifest JSON Validation
Validate that both manifest files contain valid JSON syntax:
```powershell
node -e "const fs = require('fs'); ['manifest.webmanifest', 'manifest.json', 'public/manifest.webmanifest', 'public/manifest.json'].forEach(f => { if (fs.existsSync(f)) { JSON.parse(fs.readFileSync(f, 'utf8')); console.log(f + ': Valid JSON'); } else { console.warn(f + ': File not found'); } });"
```

### 5.5 Smoke Test via Built-in Server
Start the local server and verify HTTP 200 response:
```powershell
# In PowerShell:
$proc = Start-Process node -ArgumentList "server.js" -PassThru
Start-Sleep -Seconds 2
$response = Invoke-WebRequest -Uri "http://localhost:3000" -UseBasicParsing
Write-Host "HTTP Status:" $response.StatusCode
Stop-Process -Id $proc.Id -Force
```
Expected output: `HTTP Status: 200`.

### 5.6 Invalidation Conditions
This investigation report is invalidated if:
1. `server.js` is altered to serve from `./` instead of `public/`, or a bundler (Vite, Webpack) is introduced.
2. A build-step script or test runner framework (e.g. Playwright, Jest) changes how static files are distributed.
3. IDs `#top-quote-banner`, `#quote-text`, or `#quote-author` are renamed inconsistently across HTML and JS.
