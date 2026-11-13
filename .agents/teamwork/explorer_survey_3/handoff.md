# Explorer 3 Survey Handoff Report: Shell Layout, PWA Identity & Encrypted Cloud Sync

**Explorer**: Explorer 3 (Shell, PWA & Cloud Sync)  
**Scope**: R4 (Top Header Quote Banner, Bottom-Left Controls Cleanup, PWA Desktop Identity & Windows Task Manager) and R5 (Encrypted Cloud Sync & Cryptographic Storage Architecture)  
**Date**: 2026-11-13  
**Status**: Complete  

---

## 1. Observation

### 1.0 Architectural Context: Dual File Tree Warning
The project contains duplicate copies of core frontend assets:
- **Root Directory**: `index.html`, `manifest.webmanifest`, `sw.js`, `css/style.css`, `js/*.js`, `icons/*`
- **`public/` Directory**: `public/index.html`, `public/manifest.webmanifest`, `public/sw.js`, `public/css/style.css`, `public/js/*.js`, `public/icons/*`

File hash comparisons (`Get-FileHash`) confirm that root files and `public/` files are byte-for-byte identical (e.g. `index.html` SHA256: `2ECC4FC47C6206C3B171CF9EB9A49EACB7B681417A185037593CDC0F236A531D`).
- Per `server.js` lines 8 and 472:
  ```javascript
  const PUBLIC_DIR = path.join(__dirname, 'public');
  // ...
  const filePath = path.join(PUBLIC_DIR, urlPath === '/' ? 'index.html' : urlPath);
  ```
  `server.js` serves exclusively from `public/`.
- Per `DEPLOYMENT.md` line 34:
  `Select Deploy from a branch -> Branch: main -> Folder: / (root) -> Click Save.`
  GitHub Pages serves exclusively from `/ (root)`.
*Consequence*: Any frontend code changes must be synchronized across **both** root and `public/` to prevent divergent behavior between local Node development and GitHub Pages hosting.

---

### 1.1 R4.1: Motivational Quote Placement & Trapping
- **Current DOM Location** (`index.html` lines 201-204, `public/index.html` lines 201-204):
  ```html
  <!-- Diary View -->
  <div id="view-diary" class="view">
    <div class="view-header">
      <h1>Daily Diary</h1>
      <!-- ... -->
    </div>
    <div class="diary-content">
      <div class="quote-section" id="quote-section">
        <blockquote id="quote-text"></blockquote>
        <cite id="quote-author"></cite>
      </div>
  ```
- **Current Display Rules** (`css/style.css` lines 253-259):
  ```css
  .view {
    display: none;
  }
  .view.active {
    display: block;
    animation: fadeIn 0.2s ease;
  }
  ```
- **Current Rendering Routine** (`js/views.js` lines 494-504, inside `renderDiary()`):
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
- **Observation Result**: Because `#quote-section` is nested as a child of `#view-diary`, when the user navigates to `Habits` (`#view-habits`), `Tasks` (`#view-tasks`), or `Settings` (`#view-settings`), `#view-diary` receives `display: none`. The motivational quote is completely inaccessible on every screen other than Diary. Furthermore, the quote re-randomizes on every diary date change rather than acting as a persistent shell header.

---

### 1.2 R4.2: Bottom-Left Controls (Exit vs. Lock Buttons)
- **Current DOM** (`index.html` lines 129-133, `public/index.html` lines 129-133):
  ```html
  <div class="sidebar-footer">
    <button id="lock-btn" class="btn btn-secondary btn-small" title="Lock App">🔒 Lock</button>
    <button id="logout-btn" class="btn btn-secondary btn-small">Exit</button>
  </div>
  ```
- **Current CSS** (`css/style.css` lines 236-243):
  ```css
  .sidebar-footer {
    padding: 16px;
    border-top: 1px solid var(--border);
  }

  .sidebar-footer .btn {
    width: 100%;
  }
  ```
- **Current JS Event Listeners**:
  1. `js/auth.js` lines 14-18:
     ```javascript
     const logoutBtn = document.getElementById('logout-btn');
     if (logoutBtn) {
       logoutBtn.addEventListener('click', () => this.lockApp());
     }
     ```
  2. `js/app.js` lines 41-47:
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
- **Observation Result**: `#logout-btn` ("Exit") and `#lock-btn` ("🔒 Lock") perform the identical action: calling `Auth.lockApp()`. Both buttons have CSS rule `width: 100%`, forcing them to stack awkwardly in the bottom-left sidebar footer. In a web/PWA context, "Exit" is a misnomer (it does not terminate the browser or close the PWA process; it merely locks the vault).

---

### 1.3 R4.3: PWA Desktop Identity, Manifest & Task Manager Window Configuration
- **Current Manifest** (`manifest.webmanifest` lines 1-30):
  ```json
  {
    "name": "Hobby Tracker",
    "short_name": "Tracker",
    "description": "Offline-first Notion-style habit tracker and daily diary with encrypted sync.",
    "start_url": "./index.html",
    "display": "standalone",
    "orientation": "any",
    "background_color": "#f7f6f3",
    "theme_color": "#3fa34d",
    "icons": [
      {
        "src": "icons/icon-192.png",
        "sizes": "192x192",
        "type": "image/png",
        "purpose": "any maskable"
      },
      {
        "src": "icons/icon-512.png",
        "sizes": "512x512",
        "type": "image/png",
        "purpose": "any maskable"
      },
      {
        "src": "icons/icon.svg",
        "sizes": "any",
        "type": "image/svg+xml"
      }
    ],
    "categories": ["productivity", "utilities"]
  }
  ```
- **Current HTML Head** (`index.html` lines 4-17):
  ```html
  <meta charset="UTF-8">
  <meta name="viewport" content="width=device-width, initial-scale=1.0, maximum-scale=1.0, user-scalable=no, viewport-fit=cover">
  <meta name="theme-color" content="#3fa34d">
  <meta name="apple-mobile-web-app-capable" content="yes">
  <meta name="apple-mobile-web-app-status-bar-style" content="black-translucent">
  <title>Hobby Tracker</title>
  <link rel="manifest" href="./manifest.webmanifest">
  <link rel="icon" type="image/svg+xml" href="./icons/icon.svg">
  <link rel="apple-touch-icon" href="./icons/icon-192.png">
  <link rel="stylesheet" href="./css/style.css">
  ```
- **Service Worker Cache** (`sw.js` lines 4-19):
  `APP_SHELL` includes `./index.html`, `./manifest.webmanifest`, `./css/style.css`, the JS bundle, and three icon paths.
- **Dynamic View Title Handling** (`js/app.js` lines 551-565):
  `switchView(view)` toggles CSS classes on `.nav-item` and `.view`, but never sets `document.title`.
- **Observation Result**:
  1. `short_name: "Tracker"` causes Windows (via Chrome/Edge PWA installation) to create shortcuts and Task Manager entries labeled `"Tracker"` instead of the full application identity `"Hobby Tracker"`.
  2. Missing manifest `id` and `scope` fields allows browser heuristics to misidentify the app identity across path variations.
  3. Missing `display_override` prevents modern Windows title bar / standalone window optimization.
  4. Combining `"purpose": "any maskable"` into single icon definitions triggers Chromium's maskable safe-zone padding on desktop, resulting in blurry, shrunken icons on Windows taskbars.
  5. `index.html` is missing `<meta name="application-name" content="Hobby Tracker">`, `<meta name="apple-mobile-web-app-title" content="Hobby Tracker">`, Windows tile tags (`msapplication-TileColor`, `msapplication-TileImage`), and explicit PNG favicons.
  6. Static `<title>` never reflects active sub-views, leaving Task Manager processes without view context.

---

### 1.4 R5: Data Storage Structure & Encrypted Cloud Sync

#### 1.4.1 Client-Side Storage Structure (`js/storage.js`)
- IndexedDB database: `HobbyTrackerVault` (v1).
- Object Store `kv`:
  - `'auth'`: `{ masterHash, masterSalt, pinHash, pinSalt, configuredAt }`
  - `'syncConfig'`: `{ token, gistId, autoSync, lastSyncedAt }`
- Object Store `state`:
  - `'main'`: Complete tracker snapshot containing:
    1. `habits`: `Array<{ id, name, icon, color, archived, createdAt, updatedAt }>`
    2. `cells`: `Record<string, { habitId, date, status: 'empty'|'done'|'missed', noteId?, updatedAt }>` (keys: `${habitId}|${date}`)
    3. `notes`: `Array<{ id, type: 'default'|'love'|'discipline', text, createdAt, updatedAt }>`
    4. `tasks`: `Array<{ id, title, archived, createdAt, updatedAt, history: Record<date, { status, updatedAt }> }>`
    5. `diary`: `Record<date, { entry: string, tasks: Array<{ title, status, done? }>, mood: string|null, updatedAt }>`
    6. `quotes`: `Array<{ id, text, author, custom, createdAt, updatedAt }>`
    7. `tombstones`: `Record<'habits'|'tasks'|'notes'|'quotes', Record<id, ISOString>>`
    8. `lastModifiedAt`: ISOString
- **Defect in Note Storage** (`js/storage.js` lines 339-353):
  `createNote(noteData)` saves the note into `state.notes`, but **never** updates `state.cells[`${noteData.habitId}|${noteData.date}`].noteId = note.id`. Newly created notes in IndexedDB are disconnected from habit cells!

#### 1.4.2 Cryptographic Implementation (`js/crypto.js`)
- **Key Derivation**: PBKDF2 using SHA-256, 100,000 iterations, 16-byte random hex salt (`CryptoUtils.deriveKey`).
- **Cipher**: AES-GCM 256-bit with 12-byte random cryptographic IV (`crypto.getRandomValues(iv)`).
- **Payload Envelope Structure**:
  ```json
  {
    "version": 1,
    "salt": "<hex>",
    "iv": "<base64>",
    "ciphertext": "<base64>",
    "encryptedAt": "<ISOString>"
  }
  ```
- **Zero Plaintext Exposure**: Gist upload (`js/sync.js` lines 331-339) serializes and sends exclusively `JSON.stringify(encryptedBundle)`. Plaintext user data, habit names, notes, tasks, diary entries, and master passwords are never sent over the wire or stored remotely unencrypted.

#### 1.4.3 Critical PIN / Sync Lockout Defect (`js/storage.js` line 183 & `js/sync.js` lines 285-289)
- In `js/storage.js`:
  ```javascript
  async loginWithPin(pin) {
    const auth = await this.getKV('auth');
    if (!auth || !auth.pinHash) throw new Error('PIN not configured...');
    const hash = await CryptoUtils.sha256(pin, auth.pinSalt);
    if (hash !== auth.pinHash) throw new Error('Incorrect PIN');

    await this.setUnlocked(true); // <--- NOTE: NO PASSWORD PASSED
    return { success: true };
  }
  ```
- In `js/storage.js` lines 191-201:
  ```javascript
  async setUnlocked(status, password = null) {
    this._unlocked = !!status;
    if (password) {
      this._cachedPassword = password;
      sessionStorage.setItem('ht_vault_key', password);
    }
    // ...
  }
  ```
- In `js/sync.js` lines 285-289:
  ```javascript
  const password = Storage.getMasterPassword();
  if (!password) {
    this.setStatus('idle');
    return { success: false, reason: 'locked' };
  }
  ```
- **Observation Result**: When a user logs in with their 4-digit PIN, `_cachedPassword` remains `null`. As a consequence, `Storage.getMasterPassword()` returns `null`, and every sync attempt immediately aborts with `{ success: false, reason: 'locked' }`. Sync is completely broken for any session unlocked with a PIN!

#### 1.4.4 Export / Import Unencrypted State (`js/storage.js` lines 490-507 & `js/app.js` lines 299-330)
- `exportData()` produces a plaintext JSON blob (`JSON.stringify(state, null, 2)`).
- There is currently no encrypted backup export/import mechanism to protect offline backups.

---

## 2. Logic Chain

```
[Observation 1.1: #quote-section trapped in #view-diary]
  --> #view-diary has display:none when habits, tasks, or settings is active
  --> Users cannot see motivational quotes during daily tracking or configuration
  --> Relocating quote banner to the top of .main-content (app shell) maintains visibility across all views
  --> Quote rendering must be decoupled from renderDiary() into a dedicated Views.renderTopQuote() routine

[Observation 1.2: #logout-btn and #lock-btn both call Auth.lockApp()]
  --> Two full-width buttons in sidebar footer perform the identical action
  --> "Exit" is semantically inaccurate in a browser/PWA (does not quit process)
  --> Removing #logout-btn eliminates UI redundancy and frees vertical space without losing any locking functionality

[Observation 1.3: manifest short_name: "Tracker", missing id/scope, unified any/maskable icon purpose]
  --> Windows PWA shims use short_name for desktop icons and process headers
  --> Conflated "any maskable" icons cause Chrome/Edge to apply round padding clips on Windows taskbars
  --> Correcting short_name to "Hobby Tracker", adding id/scope/display_override, and splitting icons into explicit "any" and "maskable" entries ensures native standalone desktop identity and crisp taskbar/Task Manager branding

[Observation 1.4.3: PIN login sets unlocked=true without password]
  --> Storage._cachedPassword is null when unlocked via PIN
  --> Sync.syncNow() requires Storage.getMasterPassword() to derive AES-GCM key
  --> Result: Encrypted cloud sync fails on all PIN unlocks
  --> Cryptographic solution: Wrap (encrypt) the master password with a PIN-derived key stored in auth.encryptedMasterKey during PIN setup. Decrypt on PIN entry so the master key is restored in memory for sync operations.
```

---

## 3. Caveats
1. **GitHub Gist Rate Limits**: GitHub Personal Access Tokens (classic) have a rate limit of 5,000 requests/hour. The 3-second debounce and 5-minute interval in `js/sync.js` easily operate within this limit, but rapid network drops could trigger retries.
2. **First-Time Sync Password Mismatch**: If a user configures sync on a secondary device with an existing secret Gist using a different master password, AES-GCM decryption will reject the ciphertext (authentication tag mismatch). The app correctly catches this, but needs an explicit UI error alerting the user that the remote vault was encrypted with a different master password.
3. **Dual Directory Maintenance**: Any implementer working on source files must edit or mirror both `root` and `public/` files. Neglecting one will result in tests passing on Node but failing on GitHub Pages (or vice versa).

---

## 4. Conclusion & Proposed Implementation Specification

### 4.1 Relocating Motivational Quote Banner (R4.1)

#### A. DOM Modification (`index.html` & `public/index.html`)
Remove lines 201-204 from `#view-diary` and insert `.app-quote-banner` at the top of `<main class="main-content">` (line 138):
```html
<main class="main-content">
  <!-- Permanent App Shell Quote Banner (Visible on all views) -->
  <div class="top-quote-banner" id="top-quote-banner">
    <div class="quote-banner-inner">
      <span class="quote-symbol">“</span>
      <div class="quote-content-group">
        <blockquote id="quote-text">Discipline is choosing what you want most over what you want now.</blockquote>
        <cite id="quote-author">— Unknown</cite>
      </div>
    </div>
  </div>

  <!-- Habits View -->
  <div id="view-habits" class="view active">
    <!-- ... -->
```

#### B. CSS Styling (`css/style.css` & `public/css/style.css`)
```css
/* === PERMANENT APP SHELL TOP QUOTE BANNER === */
.top-quote-banner {
  background: var(--surface);
  border: 1px solid var(--border);
  border-left: 4px solid var(--primary);
  border-radius: var(--radius);
  padding: 14px 20px;
  margin-bottom: 24px;
  box-shadow: var(--shadow);
  transition: all 0.2s ease;
}

.quote-banner-inner {
  display: flex;
  align-items: flex-start;
  gap: 14px;
}

.quote-symbol {
  font-family: var(--font-serif);
  font-size: 32px;
  line-height: 1;
  color: var(--primary);
  opacity: 0.85;
}

.quote-content-group {
  flex: 1;
}

.top-quote-banner blockquote {
  font-family: var(--font-serif);
  font-style: italic;
  font-size: 15px;
  color: var(--text);
  line-height: 1.45;
  margin-bottom: 4px;
}

.top-quote-banner cite {
  font-size: 12px;
  color: var(--text-muted);
  font-style: normal;
  display: block;
}
```

#### C. JS Logic Decoupling (`js/views.js` & `public/js/views.js`)
1. Remove lines 494-504 from `renderDiary()`.
2. Add a dedicated method `renderTopQuote()` to `Views`:
```javascript
renderTopQuote() {
  const quoteBanner = document.getElementById('top-quote-banner');
  const quoteText = document.getElementById('quote-text');
  const quoteAuthor = document.getElementById('quote-author');
  if (!quoteBanner || !quoteText || !quoteAuthor) return;

  const quotes = this.state.quotes || [];
  if (quotes.length === 0) {
    quoteBanner.style.display = 'none';
    return;
  }

  // Consistent daily quote based on calendar date hash or random fallback
  const todayStr = new Date().toISOString().split('T')[0];
  let hash = 0;
  for (let i = 0; i < todayStr.length; i++) hash = ((hash << 5) - hash) + todayStr.charCodeAt(i);
  const selectedQuote = quotes[Math.abs(hash) % quotes.length];

  quoteText.textContent = selectedQuote.text;
  quoteAuthor.textContent = `— ${selectedQuote.author || 'Unknown'}`;
  quoteBanner.style.display = 'block';
}
```
3. Call `this.renderTopQuote()` in `Views.loadState()` and after deleting/adding quotes in `renderSettings()`.

---

### 4.2 Removing Redundant Exit Button (R4.2)

#### A. DOM Modification (`index.html` & `public/index.html`)
Replace lines 129-133:
```html
<!-- BEFORE -->
<div class="sidebar-footer">
  <button id="lock-btn" class="btn btn-secondary btn-small" title="Lock App">🔒 Lock</button>
  <button id="logout-btn" class="btn btn-secondary btn-small">Exit</button>
</div>

<!-- AFTER -->
<div class="sidebar-footer">
  <button id="lock-btn" class="btn btn-secondary btn-small" title="Lock Vault">🔒 Lock Vault</button>
</div>
```

#### B. Script Cleanup
- In `js/auth.js` (lines 14-18): Safely remove `logoutBtn` variable and listener.
- In `js/app.js` (lines 41-47): Retain `lockBtn` listener triggering `Auth.lockApp()`.

---

### 4.3 PWA Desktop Identity & Windows Task Manager (R4.3)

#### A. Manifest Updates (`manifest.webmanifest` & `public/manifest.webmanifest`)
Provide a dual manifest setup (`manifest.webmanifest` and `manifest.json`):
```json
{
  "id": "hobby-tracker-pwa",
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
      "src": "icons/icon-512.png",
      "sizes": "512x512",
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
      "purpose": "maskable"
    },
    {
      "src": "icons/icon.svg",
      "sizes": "any",
      "type": "image/svg+xml"
    }
  ],
  "categories": ["productivity", "utilities"]
}
```

#### B. Head Meta Tag Hardening (`index.html` & `public/index.html`)
Add before line 13:
```html
<meta name="application-name" content="Hobby Tracker">
<meta name="apple-mobile-web-app-title" content="Hobby Tracker">
<meta name="msapplication-TileColor" content="#3fa34d">
<meta name="msapplication-TileImage" content="./icons/icon-512.png">
<link rel="icon" type="image/png" sizes="192x192" href="./icons/icon-192.png">
<link rel="icon" type="image/png" sizes="512x512" href="./icons/icon-512.png">
<link rel="icon" type="image/svg+xml" href="./icons/icon.svg">
<link rel="alternate" type="application/manifest+json" href="./manifest.json">
```

#### C. Dynamic Document Title for Task Manager (`js/app.js` line 551)
Update `switchView(view)`:
```javascript
switchView(view) {
  this.currentViewName = view;
  const viewTitles = {
    habits: 'Daily Habits — Hobby Tracker',
    tasks: 'Tasks Checklist — Hobby Tracker',
    diary: 'Daily Diary — Hobby Tracker',
    settings: 'Settings — Hobby Tracker'
  };
  document.title = viewTitles[view] || 'Hobby Tracker';

  document.querySelectorAll('.nav-item').forEach(item => {
    item.classList.toggle('active', item.dataset.view === view);
  });
  // ...
}
```
And in `Auth.lockApp()`:
```javascript
document.title = 'Hobby Tracker (Locked)';
```

---

### 4.4 Encrypted Cloud Sync & Cryptographic Fixes (R5)

#### A. Fixing the PIN Key-Wrapping Defect
1. **During PIN Setup / Change** (`Storage.setup` / `Storage.changePin`):
   Derive a key from `pin` using PBKDF2 (`CryptoUtils.deriveKey(pin, pinSalt)`) and encrypt the `masterPassword` into `auth.wrappedMasterKey = await CryptoUtils.encrypt({ masterPassword }, pin, pinSalt)`.
2. **During PIN Login** (`Storage.loginWithPin`):
   After verifying `pinHash`, decrypt `auth.wrappedMasterKey` with the PIN key to recover `masterPassword`. Pass this recovered password into `this.setUnlocked(true, recoveredMasterPassword)`.
3. **Result**: Both password login and PIN login yield a populated `_cachedPassword` and `sessionStorage.getItem('ht_vault_key')`. Sync runs flawlessly regardless of login method.

#### B. Fixing Note Cell Association in Storage
In `Storage.createNote(noteData)` (`js/storage.js` line 349):
```javascript
const cellKey = `${noteData.habitId}|${noteData.date}`;
if (!state.cells) state.cells = {};
if (!state.cells[cellKey]) {
  state.cells[cellKey] = { habitId: noteData.habitId, date: noteData.date, status: 'empty' };
}
state.cells[cellKey].noteId = note.id;
state.cells[cellKey].updatedAt = now;
```
In `Storage.deleteNote(id)`:
Clean up any cell referencing `cell.noteId === id`.

#### C. Encrypted Backup Export / Import Support
Add an "Export Encrypted Backup (.enc)" option in Settings:
- Export: `const encryptedBlob = await CryptoUtils.encrypt(state, masterPassword); return new Blob([JSON.stringify(encryptedBlob)], { type: 'application/json' });`
- Import: If `importedJson.ciphertext && importedJson.salt`, prompt for or use `masterPassword` with `CryptoUtils.decrypt()`, ensuring offline backups are zero-knowledge encrypted.

---

## 5. Verification Method

### 5.1 Independent Manual Verification Steps

1. **Top Header Quote Banner Visibility Across All Views**:
   - Start the app (`node server.js` or open GitHub Pages / static server).
   - Sign in and click through all four navigation tabs: `Habits`, `Tasks`, `Diary`, `Settings`.
   - **Verification**: The motivational quote banner must remain visible at the top across all four views. In the Diary view, verify that no duplicate quote section appears.

2. **Single Bottom-Left Lock Button**:
   - Inspect the bottom-left sidebar.
   - **Verification**: Only the `🔒 Lock Vault` button exists. The `Exit` button is gone.
   - Click `🔒 Lock Vault`.
   - **Verification**: App immediately switches to the lock screen, and `sessionStorage.getItem('ht_vault_key')` is cleared.

3. **PWA Standalone & Windows Task Manager Identity**:
   - Open app in Google Chrome or Microsoft Edge.
   - Click the "Install Hobby Tracker" icon in the address bar.
   - Open Windows Task Manager (`Ctrl + Shift + Esc`).
   - Switch tabs inside the PWA (`Habits`, `Tasks`, `Diary`).
   - **Verification**:
     - The process group displays icon `icon-512.png` and name `Hobby Tracker`.
     - The window subtitle in Task Manager matches the active view (e.g. `Daily Habits — Hobby Tracker`).

4. **PIN Unlock with Cloud Sync**:
   - In Settings, configure a 4-digit PIN and a valid GitHub Personal Access Token.
   - Lock the app and unlock using the 4-digit PIN pad.
   - Trigger a sync via the sidebar button or Settings.
   - **Verification**: Sync indicator changes from `Ready` → `Syncing...` → `Synced` without error. Open the private Gist on GitHub; verify the uploaded file `hobby_tracker_vault.json.enc` contains only `{ version, salt, iv, ciphertext, encryptedAt }` with zero plaintext user data.

5. **Dual Directory Parity Check**:
   - Run the hash comparison script:
     ```powershell
     $pairs = @(
       @('index.html', 'public\index.html'),
       @('manifest.webmanifest', 'public\manifest.webmanifest'),
       @('sw.js', 'public\sw.js'),
       @('css\style.css', 'public\css\style.css'),
       @('js\app.js', 'public\js\app.js'),
       @('js\views.js', 'public\js\views.js'),
       @('js\storage.js', 'public\js\storage.js'),
       @('js\auth.js', 'public\js\auth.js')
     )
     $pairs | ForEach-Object {
       $h1 = (Get-FileHash $_[0]).Hash
       $h2 = (Get-FileHash $_[1]).Hash
       [PSCustomObject]@{ File = $_[0]; Match = ($h1 -eq $h2) }
     } | Format-Table -AutoSize
     ```
   - **Verification**: Every file pair must output `Match: True`.
