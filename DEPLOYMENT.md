# Hobby Tracker - 24/7 Deployment Guide

## The Login Bug (FIXED)
There was a bug in `public/js/auth.js` where the form submit handler wasn't being attached when a password already existed. **Fixed.** Hard refresh your browser (Ctrl+Shift+R) and it should work now.

---

## Running 24/7 — Your Options

### Truth: nothing runs when the PC is off.

Here are your real options:

---

### Option A: Run on Your PC (Free, Works from Anywhere)

**What you get:** Server runs on your PC, accessible from your phone/laptop anywhere via Tailscale.

**Requirements:**
- PC stays powered on (disable sleep)
- Node.js installed

**Setup:**

1. **Install as Windows Service (auto-start on boot):**
   - Right-click `install-service.bat`
   - Select "Run as administrator"
   - Follow prompts

2. **Disable Sleep Mode:**
   - Settings → System → Power & sleep
   - Set "Sleep" to "Never"

3. **Access from Other Devices (same WiFi):**
   - Open `http://<your-PC-IP>:3000` (the IP is shown when you run `node server.js`)

4. **Access from ANYWHERE (phone, outside home):**
   - Install [Tailscale](https://tailscale.com) (free for personal use)
   - Install on your PC and phone
   - Log in with same account on both
   - Open `http://<your-tailscale-IP>:3000` on your phone

**Pros:** Free, full control, data stays on your machine  
**Cons:** PC must stay on

---

### Option B: Deploy to Cloud (True 24/7, ~$1/month)

**What you get:** Server runs in the cloud, always online, accessible from anywhere.

**Requirements:**
- Render.com account (free to sign up)
- GitHub repo (optional but recommended)

**Setup:**

1. **Push to GitHub:**
   ```bash
   cd "D:\amol\projects\hobby tracker website"
   git init
   git add .
   git commit -m "initial commit"
   git remote add origin https://github.com/YOUR_USERNAME/hobby-tracker.git
   git push -u origin main
   ```

2. **Deploy on Render:**
   - Go to [render.com](https://render.com)
   - Sign up (free)
   - Click "New +" → "Web Service"
   - Connect your GitHub repo
   - Configure:
     - **Name:** hobby-tracker
     - **Environment:** Docker
     - **Plan:** Free (or Starter for persistent disk)
     - **Health Check Path:** `/api/state`
   - Click "Create Web Service"

3. **Important — Persistent Storage:**
   - Render's free tier has ephemeral storage (data resets on deploys)
   - For persistent data, use the **Starter plan ($7/month)** which includes a 1GB disk
   - The `render.yaml` file configures this automatically

4. **Access:**
   - Render gives you a URL like `hobby-tracker.onrender.com`
   - Open it from any device, anywhere

**Pros:** True 24/7, no PC needed, accessible globally  
**Cons:** ~$7/month for persistent storage (free tier loses data on restarts)

---

### Option C: Oracle Cloud Free Tier (True 24/7, Free but Complex)

Oracle offers a genuinely free always-on VM (ARM, 4 cores, 24GB RAM).

**Pros:** Completely free, true 24/7  
**Cons:** Complex setup (Linux VM, SSH, firewall config, domain/DNS optional)

If you want this, I can write a deploy script for you. Just ask.

---

## My Recommendation

**Start with Option A** (your PC + Tailscale). It's free, fast, and you control everything. Only move to cloud if you need true 24/7 without keeping your PC on.

If you want **zero maintenance cloud**, use Render with the Starter plan.

---

## Quick Start (Local Testing)

```bash
cd "D:\amol\projects\hobby tracker website"
node server.js
```

Then open `http://localhost:3000`

---

## Files in This Project

```
hobby tracker website/
├── server.js              # Node.js backend (zero dependencies)
├── data.json              # Auto-created, stores all your data
├── install-service.bat    # Windows service installer
├── Dockerfile             # For cloud deployment
├── render.yaml            # Render.com config
├── public/
│   ├── index.html         # Main page
│   ├── css/style.css      # Notion-style theming
│   └── js/
│       ├── api.js         # API client
│       ├── auth.js        # Login/logout
│       ├── views.js       # UI rendering
│       └── app.js         # Main app logic
└── README.md              # This file
```

---

## Features

✅ **Daily Habit Tracker** — Calendar view with habits on left, scrollable dates on right  
✅ **Notes with Personality** — Love notes (pink serif), discipline notes (dark mono), default notes  
✅ **Calendar Tasks** — Persistent tasks spanning months/years  
✅ **Daily Diary** — Per-day entries, tasks, mood tracker  
✅ **Motivational Quotes** — Rotating quotes you can add/edit  
✅ **Settings** — Change password, export/import data  
✅ **Multi-Device** — Access from any device on your network (or anywhere with Tailscale)  
✅ **Session-Only Auth** — Close browser = logged out, but data persists

---

## Need Help?

- Login not working? Hard refresh (Ctrl+Shift+R)
- Server won't start? Make sure Node.js is installed: `node --version`
- Can't access from phone? Check firewall allows port 3000
- Want cloud deploy? I can write step-by-step instructions for any platform
