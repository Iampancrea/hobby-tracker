# Milestone 1 Investigation Report: PWA Desktop Identity, Shell Meta Tags & Task Manager Integration

## 1. Observation

Direct code inspections and file system checks yielded the following verified facts:

### 1.1 Manifest Files
- **File Paths**:
  - `manifest.webmanifest`: Exists in root (`./manifest.webmanifest`) and `public/` (`./public/manifest.webmanifest`).
  - `manifest.json`: Does **not** exist in either root or `public/` (`file does not exist` on both).
- **Current `manifest.webmanifest` Content (Lines 1–30)**:
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
- **Deficiencies Observed**:
  1. No `id` field (W3C specification & Chromium AUMID desktop identity).
  2. `short_name` is `"Tracker"` instead of `"Hobby Tracker"`.
  3. No `scope` field (defaults to start_url directory without explicit perimeter).
  4. No `display_override` array (`["window-controls-overlay", "standalone", "minimal-ui"]`).
  5. Icon definitions combine `"purpose": "any maskable"` into single objects instead of separate objects for `purpose: "any"` and `purpose: "maskable"`.
  6. No fallback `manifest.json` file.

### 1.2 Shell `<head>` Meta & Link Tags
- **File Paths**: `index.html` (lines 3–17) and `public/index.html` (lines 3–17).
- **Current HTML Head**:
  ```html
  <head>
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
    ...
  </head>
  ```
- **Deficiencies Observed**:
  1. Missing `<meta name="application-name" content="Hobby Tracker">` (Windows Shell & Task Manager identity).
  2. Missing `<meta name="msapplication-TileColor" content="#3fa34d">` (Windows Start Menu & Taskbar accent).
  3. Missing `<meta name="msapplication-TileImage" content="./icons/icon-192.png">` (Windows tile icon).
  4. Missing `<meta name="msapplication-config" content="none">` (suppresses browserconfig.xml 404s).
  5. Missing explicit 192x192 and 512x512 PNG favicon links (`<link rel="icon" type="image/png" sizes="...">`).
  6. Missing alternate link to `manifest.json`.

### 1.3 Document Titles & View Transitions
- **File Paths**: `js/app.js` (lines 551–566) and `public/js/app.js` (lines 551–566).
  ```javascript
  switchView(view) {
    this.currentViewName = view;
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
- **Observation**: `document.title` is **never** assigned anywhere in `js/app.js`, `public/js/app.js`, or any other JS file in the project. The only title in the app is the static `<title>Hobby Tracker</title>` in `index.html`.
- **Lock Handler Observation**: In `js/auth.js` and `public/js/auth.js` (lines 216–223):
  ```javascript
  lockApp() {
    Storage.lock();
    document.getElementById('app').style.display = 'none';
    document.getElementById('login-screen').style.display = 'flex';
    document.getElementById('password').value = '';
    document.getElementById('confirm-password').value = '';
    this.evaluateAuthState();
  },
  ```
  `document.title` is never updated when the vault is locked.

### 1.4 Service Worker & Server Cache Strategy
- **File Paths**: `sw.js` (lines 1–19) and `public/sw.js` (lines 1–19).
  ```javascript
  const CACHE_NAME = 'hobby-tracker-v1';

  const APP_SHELL = [
    './',
    './index.html',
    './manifest.webmanifest',
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
- **File Path**: `server.js` (lines 120–130):
  `MIME_TYPES` contains `.html`, `.css`, `.js`, `.json`, `.png`, `.jpg`, `.gif`, `.svg`, `.ico`, but lacks `.webmanifest`. Requests for `.webmanifest` return `Content-Type: application/octet-stream`.

---

## 2. Logic Chain

1. **PWA Desktop Identity in Windows Task Manager**:
   - On Windows 10/11, Chromium (Edge & Chrome) creates an application package identity (AUMID - Application User Model ID) when installing a PWA.
   - According to the W3C Web Application Manifest spec and Chromium implementation, if an explicit `id` is omitted, the browser derives identity from `start_url`. If query params or start URLs shift, identity is lost or duplicated.
   - Setting `"id": "hobby-tracker-pwa"` guarantees a deterministic AUMID for Windows shell grouping, taskbar pinning, and process grouping in Windows Task Manager.
   - If `short_name` is `"Tracker"` while `name` is `"Hobby Tracker"`, Windows shell displays the truncated `"Tracker"` under small tiles or taskbar previews. Aligning `short_name: "Hobby Tracker"` ensures uniform branding.
   - `display_override: ["window-controls-overlay", "standalone", "minimal-ui"]` signals modern Windows desktop window manager capabilities, letting the app display cleanly as an independent desktop window.

2. **Icon Separation ("any" vs "maskable")**:
   - Maskable icons are intended for adaptive shapes (e.g. Android circles/squircles or Windows live tiles) and require a 40% safe zone margin. Standard "any" icons use full bleed.
   - Combining `"purpose": "any maskable"` in a single entry forces desktop shells to either crop standard icons or render maskable icons with excess empty padding on the desktop taskbar and Task Manager process icon.
   - Separating entries into distinct 192x192 and 512x512 objects for `purpose: "any"` and `purpose: "maskable"` adheres to W3C best practices and resolves desktop rendering artifacts.

3. **Windows Task Manager Top-Level Window Title**:
   - Windows Task Manager queries the Win32 `HWND` window caption for running applications.
   - In Chromium PWA standalone windows, the `HWND` caption is directly bound to the DOM's `document.title`.
   - Currently, because `document.title` is static, Task Manager always displays `"Hobby Tracker"`, providing no context to the user or task switcher whether the vault is locked or what workspace is active.
   - Centralizing title updates inside `App.switchView(view)` guarantees that switching between Habits, Tasks, Diary, and Settings immediately updates the `document.title` and therefore the Windows Task Manager window caption.
   - Setting `document.title = 'Hobby Tracker (Locked)'` in `Auth.lockApp()` and in `Auth.evaluateAuthState()` when locked ensures Task Manager immediately reflects the locked state.

4. **Cache Invalidation & MIME Parity**:
   - `sw.js` uses a Stale-While-Revalidate caching strategy. If `manifest.webmanifest`, `index.html`, or JS files are updated without updating `CACHE_NAME`, browsers running the current service worker will continue to serve stale shell files.
   - Bumping `CACHE_NAME = 'hobby-tracker-v2'` triggers the `activate` event, which executes `caches.delete(key)` on all non-matching cache stores, invalidating old assets and recaching the upgraded files immediately.
   - Adding `'./manifest.json'` to `APP_SHELL` ensures offline support for clients requesting the JSON manifest fallback.
   - Adding `'.webmanifest': 'application/manifest+json'` to `MIME_TYPES` in `server.js` guarantees that `server.js` serves manifests with the standard MIME type required by strict PWA validators.

---

## 3. Caveats

1. **Dual Directory Parity**:
   Any modification to `manifest.webmanifest`, `manifest.json`, `index.html`, `js/app.js`, `js/auth.js`, and `sw.js` must be copied identically into both `./` (root) and `./public/`.
2. **Windows Task Manager Refresh Latency**:
   Windows Task Manager polls window titles periodically (every 1–2 seconds depending on update speed setting in Task Manager). Title updates in the DOM are instant in Alt+Tab and the window titlebar, and appear in Task Manager on its next polling tick.
3. **PWA Re-installation for Manifest Cache**:
   If an instance of the PWA was already installed in Chrome/Edge on Windows prior to manifest `id` introduction, Chromium updates the manifest in the background during periodic update checks (every ~24 hours), or instantly upon reinstalling / refreshing the app window.

---

## 4. Conclusion & Concrete Implementation Strategy

### 4.1 Manifest Files (`manifest.webmanifest` and `manifest.json`)
Create/update identically in root and `public/`:
- `manifest.webmanifest`
- `manifest.json`

**Exact JSON Content**:
```json
{
  "id": "hobby-tracker-pwa",
  "name": "Hobby Tracker",
  "short_name": "Hobby Tracker",
  "description": "Offline-first Notion-style habit tracker and daily diary with encrypted sync.",
  "scope": "./",
  "start_url": "./index.html",
  "display": "standalone",
  "display_override": [
    "window-controls-overlay",
    "standalone",
    "minimal-ui"
  ],
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
  "categories": [
    "productivity",
    "utilities"
  ]
}
```

### 4.2 Shell `<head>` Meta & Link Tags (`index.html` and `public/index.html`)
In `<head>` of both files, replace lines 4–13 with:
```html
  <meta charset="UTF-8">
  <meta name="viewport" content="width=device-width, initial-scale=1.0, maximum-scale=1.0, user-scalable=no, viewport-fit=cover">
  <meta name="application-name" content="Hobby Tracker">
  <meta name="theme-color" content="#3fa34d">
  <meta name="msapplication-TileColor" content="#3fa34d">
  <meta name="msapplication-TileImage" content="./icons/icon-192.png">
  <meta name="msapplication-config" content="none">
  <meta name="apple-mobile-web-app-capable" content="yes">
  <meta name="apple-mobile-web-app-status-bar-style" content="black-translucent">
  <title>Hobby Tracker</title>
  <link rel="manifest" href="./manifest.webmanifest">
  <link rel="alternate" type="application/json" href="./manifest.json" title="Web App Manifest">
  <link rel="icon" type="image/svg+xml" href="./icons/icon.svg">
  <link rel="icon" type="image/png" sizes="192x192" href="./icons/icon-192.png">
  <link rel="icon" type="image/png" sizes="512x512" href="./icons/icon-512.png">
  <link rel="apple-touch-icon" sizes="192x192" href="./icons/icon-192.png">
  <link rel="stylesheet" href="./css/style.css">
```

### 4.3 Dynamic Document Titles (`js/app.js` and `public/js/app.js`)
Update `switchView(view)` (lines 551–566) in both files:
```javascript
  switchView(view) {
    this.currentViewName = view;
    document.querySelectorAll('.nav-item').forEach(item => {
      item.classList.toggle('active', item.dataset.view === view);
    });

    document.querySelectorAll('.view').forEach(v => {
      v.classList.toggle('active', v.id === `view-${view}`);
    });

    // Dynamic Document Title for Task Manager & Desktop Shell
    const titles = {
      habits: 'Daily Habits — Hobby Tracker',
      tasks: 'Tasks Checklist — Hobby Tracker',
      diary: 'Daily Diary — Hobby Tracker',
      settings: 'Settings — Hobby Tracker'
    };
    document.title = titles[view] || 'Hobby Tracker';

    if (view === 'habits') Views.renderHabits();
    else if (view === 'tasks') Views.renderTasks();
    else if (view === 'diary') Views.renderDiary();
    else if (view === 'settings') Views.renderSettings();
  }
```

### 4.4 Lock State Title (`js/auth.js` and `public/js/auth.js`)
In `Auth.lockApp()` and `Auth.evaluateAuthState()`:
```javascript
  lockApp() {
    Storage.lock();
    document.getElementById('app').style.display = 'none';
    document.getElementById('login-screen').style.display = 'flex';
    document.getElementById('password').value = '';
    document.getElementById('confirm-password').value = '';
    document.title = 'Hobby Tracker (Locked)';
    this.evaluateAuthState();
  },
```
In `Auth.evaluateAuthState()`:
```javascript
      } else {
        // Already configured
        this.hasPin = status.hasPin;
        confirmGroup.style.display = 'none';
        if (pinSetupGroup) pinSetupGroup.style.display = 'none';
        loginBtn.textContent = 'Unlock Vault';

        if (Storage.isUnlocked()) {
          this.showApp();
        } else {
          document.title = 'Hobby Tracker (Locked)';
          if (this.hasPin) {
            this.showPinPad();
          } else {
            this.showPasswordForm();
          }
        }
      }
```

### 4.5 Service Worker & Server MIME Updates (`sw.js`, `public/sw.js`, `server.js`)
1. In `sw.js` and `public/sw.js`:
   - Bump cache version: `const CACHE_NAME = 'hobby-tracker-v2';`
   - Add `./manifest.json` to `APP_SHELL`:
     ```javascript
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
2. In `server.js` (line 120):
   Add `.webmanifest`:
   ```javascript
   const MIME_TYPES = {
     '.html': 'text/html',
     '.css': 'text/css',
     '.js': 'application/javascript',
     '.json': 'application/json',
     '.webmanifest': 'application/manifest+json',
     '.png': 'image/png',
     '.jpg': 'image/jpeg',
     '.gif': 'image/gif',
     '.svg': 'image/svg+xml',
     '.ico': 'image/x-icon'
   };
   ```

---

## 5. Verification Method

### 5.1 Verification Commands
1. **JSON Syntax & Property Validation**:
   ```powershell
   Get-Content -Path "manifest.webmanifest", "public\manifest.webmanifest", "manifest.json", "public\manifest.json" | ConvertFrom-Json | Select-Object id, name, short_name, scope, start_url, display, display_override
   ```
   **Expected**: All 4 files parse without errors and return:
   - `id`: `"hobby-tracker-pwa"`
   - `name`: `"Hobby Tracker"`
   - `short_name`: `"Hobby Tracker"`
   - `scope`: `"./"`
   - `start_url`: `"./index.html"`
   - `display_override`: `["window-controls-overlay", "standalone", "minimal-ui"]`

2. **Dual-Folder Parity Check**:
   ```powershell
   Compare-Object (Get-FileHash -Algorithm SHA256 "manifest.webmanifest").Hash (Get-FileHash -Algorithm SHA256 "public\manifest.webmanifest").Hash
   Compare-Object (Get-FileHash -Algorithm SHA256 "manifest.json").Hash (Get-FileHash -Algorithm SHA256 "public\manifest.json").Hash
   Compare-Object (Get-FileHash -Algorithm SHA256 "index.html").Hash (Get-FileHash -Algorithm SHA256 "public\index.html").Hash
   Compare-Object (Get-FileHash -Algorithm SHA256 "sw.js").Hash (Get-FileHash -Algorithm SHA256 "public\sw.js").Hash
   Compare-Object (Get-FileHash -Algorithm SHA256 "js\app.js").Hash (Get-FileHash -Algorithm SHA256 "public\js\app.js").Hash
   Compare-Object (Get-FileHash -Algorithm SHA256 "js\auth.js").Hash (Get-FileHash -Algorithm SHA256 "public\js\auth.js").Hash
   ```
   **Expected**: No differences returned (exit code 0).

3. **MIME Type Check from Server**:
   Start server in background and run:
   ```powershell
   $resp = Invoke-WebRequest -Uri "http://localhost:3000/manifest.webmanifest" -Method Head
   $resp.Headers["Content-Type"]
   ```
   **Expected**: `application/manifest+json`.

4. **DOM Title Check in Headless / Browser / Unit Test**:
   Execute simulated view switching and lock event in test harness:
   - `App.switchView('habits')` -> `document.title === 'Daily Habits — Hobby Tracker'`
   - `App.switchView('tasks')` -> `document.title === 'Tasks Checklist — Hobby Tracker'`
   - `App.switchView('diary')` -> `document.title === 'Daily Diary — Hobby Tracker'`
   - `App.switchView('settings')` -> `document.title === 'Settings — Hobby Tracker'`
   - `Auth.lockApp()` -> `document.title === 'Hobby Tracker (Locked)'`

### 5.2 Invalidation Conditions
- Any file difference between root and `public/` invalidates dual-directory parity.
- Any unescaped JSON or invalid MIME header invalidates PWA manifest installability.
- If `document.title` reverts to `"Hobby Tracker"` on view switches, task manager dynamic title integration has failed.
