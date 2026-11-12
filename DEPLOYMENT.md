# Hobby Tracker — Zero-Cost Offline Deployment Guide

Your project is transformed into a **100% Offline-First Progressive Web App (PWA)** with **End-to-End Encrypted Cloud Sync**.

- **Hosting Cost**: \$0 (Free forever via GitHub Pages)
- **Offline Capable**: Works 100% offline on PC and Android via Service Worker & IndexedDB
- **No 24/7 PC Required**: Android works independently anywhere, syncing asynchronously
- **Encryption**: AES-256-GCM zero-knowledge encryption before data leaves your browser
- **Sync Provider**: Private GitHub Gist (free, unlimited revisions, zero server overhead)

---

## Step 1: Push Code to Your GitHub Account (Only Done Once)

1. Open your browser and go to [GitHub.com/new](https://github.com/new).
2. Set **Repository name**: `hobby-tracker`
3. Set visibility to **Public** (recommended for free GitHub Pages) or **Private** (with Cloudflare Pages).
   > *Note:* Your personal habits, diary entries, and passwords are **never** stored in the repository. The repo only contains static app code (HTML, CSS, JS). Your data stays strictly on your devices and in your private encrypted Gist.
4. Leave "Add a README" **unchecked** (we already have everything).
5. Click **Create repository**.
6. Run these two commands in PowerShell / Terminal:
   ```bash
   git remote add origin https://github.com/YOUR_GITHUB_USERNAME/hobby-tracker.git
   git push -u origin main
   ```

---

## Step 2: Enable GitHub Pages

1. In your GitHub repository, go to **Settings** → **Pages**.
2. Under **Build and deployment** → **Source**:
   - Select **GitHub Actions** (our included workflow will automatically build and deploy it), OR
   - Select **Deploy from a branch** → Branch: `main` → Folder: `/ (root)` → Click **Save**.
3. Your app is live at:
   `https://YOUR_GITHUB_USERNAME.github.io/hobby-tracker/`

---

## Step 3: Install on PC & Android

### On PC (Windows / Mac / Linux)
1. Open your GitHub Pages URL in **Google Chrome** or **Microsoft Edge**.
2. In the URL address bar, click the **Install App** icon (or click the 3 dots menu → **Save and Share** → **Install Hobby Tracker**).
3. The app opens in its own clean window, with taskbar pinning and full offline capabilities.

### On Android Phone
1. Open your GitHub Pages URL in **Google Chrome**.
2. Tap the **3 dots menu** in the top right.
3. Tap **Install App** (or **Add to Home screen**).
4. An icon will appear on your home screen and app drawer.
5. Tap it: it runs fullscreen, exactly like a native app, and works 100% offline.

---

## Step 4: Connect Encrypted Sync (PC ⟷ Android)

To have your PC and Android sync seamlessly without keeping your PC awake:

1. Go to [GitHub Token Settings](https://github.com/settings/tokens/new) (GitHub → Settings → Developer Settings → Personal access tokens → Tokens (classic) → Generate new token).
2. Set **Note**: `Hobby Tracker Sync`
3. Under Scopes, check only:
   - `gist` (Create gists)
4. Click **Generate token** and copy the `ghp_...` string.
5. Open Hobby Tracker on your PC and Android:
   - Go to **Settings** tab → **Encrypted Cloud Sync**.
   - Paste your token into **GitHub Personal Access Token**.
   - Click **Save Sync Settings** → **Sync Now**.
6. The app will automatically create a secret encrypted Gist `hobby_tracker_vault.json.enc` and sync.
7. Any changes you make on phone or PC will now sync smoothly!

---

## Local Development / Offline Testing

If you ever want to test locally on your PC before pushing:
```bash
# Using Node.js
node server.js
```
Open `http://localhost:3000` in your browser.
