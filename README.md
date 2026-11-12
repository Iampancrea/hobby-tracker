# Hobby Tracker

A Notion-style habit tracker with calendar view, daily diary, and persistent task management.

## Features

- **Password-protected**: Secure login with session-only authentication (logs out when you close the browser)
- **Habit Calendar**: Track daily habits with a scrollable calendar grid (shows past/future dates)
- **Cell Status**: Mark habits as done ✓, missed ✗, or leave empty
- **Notes**: Add contextual notes to any habit cell (Love notes, Discipline notes, or Default)
- **Calendar Tasks**: Persistent tasks that span months/years with visual indicators for dates before task creation
- **Daily Diary**: Separate per-day task list and journal entries with mood tracking
- **Motivational Quotes**: Pre-seeded quotes you can customize
- **Multi-device**: Access from any device on your network
- **Data Export/Import**: Backup and restore your data anytime

## Quick Start

1. **Install Node.js** (v18+) or use Bun if you have it
   - Download from: https://nodejs.org/

2. **Start the server**:
   ```bash
   node server.js
   ```

3. **Open in browser**:
   - Local: http://localhost:3000
   - Other devices: Use the network address shown in the console (e.g., http://192.168.1.100:3000)

4. **First run**: Create a password when prompted

## Usage Guide

### Habits View
- Click **+ Add Habit** to create a new habit
- Click any cell to cycle through: Empty → Done → Missed → Empty
- Right-click or long-press a cell to add/view notes
- Use the week navigation buttons (◀ Today ▶) to move through time
- Check **Show archived** to see archived habits
- Streak counter shows consecutive days completed

### Tasks View
- Click **+ Add Task** to create persistent calendar tasks
- Tasks show a hatched pattern on dates before they were created
- Click cells to mark tasks done/missed
- Tasks persist across months/years (unlike diary tasks which are per-day)

### Diary View
- Navigate between days with the date picker
- Write daily journal entries (auto-saved)
- Add per-day tasks that don't carry over
- Track your mood with emoji buttons
- Motivational quote rotates each day

### Settings
- **Change Password**: Update your login password
- **Quotes**: Add custom motivational quotes or delete existing ones
- **Data Management**: Export your data as JSON backup, or import from a previous backup

## Data Storage

All data is stored in `data.json` in the same directory as the server. The file is automatically created on first run.

**Important**: 
- Login sessions are stored in memory only (not persisted)
- Closing the browser logs you out (session cookie)
- Server restart logs everyone out
- Data persists across server restarts

## Network Access

To use from other devices:
1. Make sure all devices are on the same network
2. Check the console output for your network IP (e.g., `http://192.168.1.100:3000`)
3. Access that URL from other devices
4. You may need to allow the port through your firewall

## Port Configuration

Change the port by setting the PORT environment variable:

```bash
PORT=8080 node server.js
```

## Backup & Restore

**Backup**: Use the Export Data button in Settings to download a JSON backup

**Restore**: Use the Import Data button to restore from a backup file

## Technical Details

- **Backend**: Zero-dependency Node.js HTTP server
- **Storage**: JSON file (no database required)
- **Auth**: PBKDF2 password hashing with salt
- **Frontend**: Vanilla JavaScript (no frameworks)
- **Styling**: Custom CSS with CSS variables

## Keyboard Shortcuts

- `Enter` in diary task input: Add task
- Click outside modals: Close them
- Click nav items: Switch views

## Troubleshooting

**Can't access from other devices?**
- Check firewall settings
- Verify all devices are on the same network
- Try accessing via IP address instead of localhost

**Data not saving?**
- Check file permissions on `data.json`
- Ensure the server process has write access to the directory

**Password not working?**
- Login is case-sensitive
- If you forget your password, delete `data.json` and start fresh (you'll lose all data)

## License

Personal use - built for He
