// Main app module for Hobby Tracker PWA
const App = {
  currentViewName: 'habits',
  initialized: false,

  async init() {
    await Views.loadState();
    Views.renderTopQuote();

    if (this.initialized) {
      this.refreshCurrentView();
      return;
    }
    this.initialized = true;

    // Register Service Worker for 100% Offline Support
    if ('serviceWorker' in navigator) {
      navigator.serviceWorker.register('./sw.js').then(reg => {
        if (reg && typeof reg.update === 'function') {
          reg.update().catch(() => {});
        }
      }).catch(err => {
        console.warn('ServiceWorker registration error:', err);
      });
    }

    // Initialize Sync Status Listener
    Sync.onStatusChange(async (status, error) => {
      this.updateSyncUI(status, error);
      if (status === 'synced') {
        // Automatically refresh active views when changes arrive from other device
        await Views.loadState();
        Views.renderTopQuote(true);
        this.refreshCurrentView();
      }
    });

    // Mobile Sidebar Drawer Controls
    const mobileMenuBtn = document.getElementById('mobile-menu-btn');
    const sidebarCloseBtn = document.getElementById('sidebar-close-btn');
    const backdrop = document.getElementById('sidebar-backdrop');
    const sidebar = document.getElementById('sidebar');

    const toggleSidebar = (open) => {
      if (sidebar) sidebar.classList.toggle('open', open);
      if (backdrop) backdrop.classList.toggle('active', open);
    };

    if (mobileMenuBtn) mobileMenuBtn.addEventListener('click', () => toggleSidebar(true));
    if (sidebarCloseBtn) sidebarCloseBtn.addEventListener('click', () => toggleSidebar(false));
    if (backdrop) backdrop.addEventListener('click', () => toggleSidebar(false));

    // Lock button
    const lockBtn = document.getElementById('lock-btn');
    if (lockBtn) {
      lockBtn.addEventListener('click', () => {
        toggleSidebar(false);
        Auth.lockApp();
      });
    }

    // Quick Sync Buttons
    const triggerSync = async () => {
      const res = await Sync.syncNow();
      if (!res.success && res.reason === 'not_configured') {
        this.switchView('settings');
        alert('Please configure your GitHub Personal Access Token in Settings to enable Cloud Sync.');
      }
    };

    const sidebarSyncBtn = document.getElementById('sidebar-sync-btn');
    const mobileSyncBadge = document.getElementById('mobile-sync-badge');
    const manualSyncBtn = document.getElementById('manual-sync-btn');

    if (sidebarSyncBtn) sidebarSyncBtn.addEventListener('click', triggerSync);
    if (mobileSyncBadge) mobileSyncBadge.addEventListener('click', triggerSync);
    if (manualSyncBtn) manualSyncBtn.addEventListener('click', triggerSync);

    // Navigation
    document.querySelectorAll('.nav-item').forEach(item => {
      item.addEventListener('click', () => {
        const view = item.dataset.view;
        this.switchView(view);
        toggleSidebar(false);
      });
    });

    // Habits view controls
    document.getElementById('prev-week').addEventListener('click', () => {
      Views.currentHabitDateOffset -= 7;
      Views.renderHabits();
    });

    document.getElementById('next-week').addEventListener('click', () => {
      Views.currentHabitDateOffset += 7;
      Views.renderHabits();
    });

    document.getElementById('today-btn').addEventListener('click', () => {
      Views.currentHabitDateOffset = 0;
      Views.renderHabits();
    });

    document.getElementById('add-habit-btn').addEventListener('click', () => {
      Views.openHabitModal();
    });

    document.getElementById('show-archived-habits').addEventListener('change', () => {
      Views.renderHabits();
    });

    // Tasks view controls
    const prevWeekTasks = document.getElementById('prev-week-tasks');
    if (prevWeekTasks) {
      prevWeekTasks.addEventListener('click', () => {
        Views.currentTaskDateOffset -= 7;
        Views.renderTasks();
      });
    }

    const nextWeekTasks = document.getElementById('next-week-tasks');
    if (nextWeekTasks) {
      nextWeekTasks.addEventListener('click', () => {
        Views.currentTaskDateOffset += 7;
        Views.renderTasks();
      });
    }

    const todayBtnTasks = document.getElementById('today-btn-tasks');
    if (todayBtnTasks) {
      todayBtnTasks.addEventListener('click', () => {
        Views.currentTaskDateOffset = 0;
        Views.renderTasks();
      });
    }

    const addTaskBtn = document.getElementById('add-task-btn');
    if (addTaskBtn) {
      addTaskBtn.addEventListener('click', () => {
        Views.openTaskModal();
      });
    }

    const showArchivedTasks = document.getElementById('show-archived-tasks');
    if (showArchivedTasks) {
      showArchivedTasks.addEventListener('change', () => {
        Views.renderTasks();
      });
    }

    // Task filter controls
    document.querySelectorAll('.task-filter-btn').forEach(btn => {
      btn.addEventListener('click', (e) => {
        document.querySelectorAll('.task-filter-btn').forEach(b => b.classList.remove('active'));
        e.currentTarget.classList.add('active');
        Views.currentTaskFilter = e.currentTarget.getAttribute('data-filter') || 'all';
        Views.renderTasks();
      });
    });

    // Diary view controls
    const diaryDateInput = document.getElementById('diary-date');
    if (diaryDateInput) {
      diaryDateInput.addEventListener('change', (e) => {
        if (e.target.value) {
          Views.currentDiaryDate = e.target.value;
          const [y, m] = e.target.value.split('-').map(Number);
          Views.diaryNavYear = y;
          Views.diaryNavMonth = m - 1;
          Views.renderDiary();
        }
      });
    }

    const prevDayBtn = document.getElementById('prev-day');
    if (prevDayBtn) {
      prevDayBtn.addEventListener('click', () => {
        const [y, m, d] = Views.currentDiaryDate.split('-').map(Number);
        const dt = new Date(Date.UTC(y, m - 1, d - 1));
        const nextY = dt.getUTCFullYear();
        const nextM = String(dt.getUTCMonth() + 1).padStart(2, '0');
        const nextD = String(dt.getUTCDate()).padStart(2, '0');
        Views.currentDiaryDate = `${nextY}-${nextM}-${nextD}`;
        Views.diaryNavYear = nextY;
        Views.diaryNavMonth = dt.getUTCMonth();
        const dInput = document.getElementById('diary-date');
        if (dInput) dInput.value = Views.currentDiaryDate;
        Views.renderDiary();
      });
    }

    const nextDayBtn = document.getElementById('next-day');
    if (nextDayBtn) {
      nextDayBtn.addEventListener('click', () => {
        const [y, m, d] = Views.currentDiaryDate.split('-').map(Number);
        const dt = new Date(Date.UTC(y, m - 1, d + 1));
        const nextY = dt.getUTCFullYear();
        const nextM = String(dt.getUTCMonth() + 1).padStart(2, '0');
        const nextD = String(dt.getUTCDate()).padStart(2, '0');
        Views.currentDiaryDate = `${nextY}-${nextM}-${nextD}`;
        Views.diaryNavYear = nextY;
        Views.diaryNavMonth = dt.getUTCMonth();
        const dInput = document.getElementById('diary-date');
        if (dInput) dInput.value = Views.currentDiaryDate;
        Views.renderDiary();
      });
    }

    // Mood selector buttons
    document.querySelectorAll('.mood-btn').forEach(btn => {
      btn.addEventListener('click', async (e) => {
        const clickedBtn = e.currentTarget;
        const mood = clickedBtn.dataset.mood;
        const date = Views.currentDiaryDate || (document.getElementById('diary-date') ? document.getElementById('diary-date').value : new Date().toISOString().split('T')[0]);

        const wasActive = clickedBtn.classList.contains('active');
        document.querySelectorAll('.mood-btn').forEach(b => b.classList.remove('active'));
        const newMood = wasActive ? null : mood;
        if (!wasActive) {
          clickedBtn.classList.add('active');
        }

        if (Views.state) {
          if (!Views.state.diary) Views.state.diary = {};
          if (!Views.state.diary[date]) Views.state.diary[date] = { entry: '', tasks: [], mood: null };
          Views.state.diary[date].mood = newMood;
          Views.state.diary[date].updatedAt = new Date().toISOString();
          Storage.saveRawState(Views.state);
        } else {
          try {
            const diary = await API.getDiary(date);
            diary.mood = newMood;
            await API.saveDiary(date, diary);
          } catch (err) {
            console.error('Error saving mood:', err);
          }
        }
        if (Views.renderDiaryMiniCalendar) {
          Views.renderDiaryMiniCalendar();
        }
      });
    });

    document.getElementById('diary-entry').addEventListener('blur', async () => {
      const date = Views.currentDiaryDate;
      const entry = document.getElementById('diary-entry').value;
      try {
        const diary = await API.getDiary(date);
        diary.entry = entry;
        await API.saveDiary(date, diary);
      } catch (e) {
        console.error('Error saving diary entry:', e);
      }
    });

    document.getElementById('add-diary-task-btn').addEventListener('click', async () => {
      const input = document.getElementById('new-diary-task');
      const title = input.value.trim();
      if (!title) return;

      try {
        const diary = await API.getDiary(Views.currentDiaryDate);
        if (!diary.tasks) diary.tasks = [];
        diary.tasks.push({ title, status: 'pending' });
        await API.saveDiary(Views.currentDiaryDate, diary);
        input.value = '';
        Views.renderDiary();
      } catch (e) {
        console.error('Error adding diary task:', e);
      }
    });

    document.getElementById('new-diary-task').addEventListener('keydown', (e) => {
      if (e.key === 'Enter') {
        document.getElementById('add-diary-task-btn').click();
      }
    });

    // Settings: Sync configuration form
    const syncForm = document.getElementById('sync-settings-form');
    if (syncForm) {
      syncForm.addEventListener('submit', async (e) => {
        e.preventDefault();
        const token = document.getElementById('sync-github-token').value.trim();
        const autoSync = document.getElementById('sync-auto-toggle').checked;
        const syncMsg = document.getElementById('sync-settings-msg');

        try {
          await Storage.saveSyncConfig({ token, autoSync });
          syncMsg.innerHTML = '<span style="color:var(--primary);">Sync settings saved! Testing connection...</span>';
          syncMsg.style.display = 'block';

          if (token) {
            const res = await Sync.syncNow();
            if (res.success) {
              syncMsg.innerHTML = '<span style="color:var(--primary);">✓ Successfully connected and synced with GitHub Private Gist!</span>';
              Views.renderSettings();
            } else {
              syncMsg.innerHTML = `<span style="color:var(--danger);">⚠️ Connection error: ${res.error || res.reason}</span>`;
            }
          }
        } catch (err) {
          syncMsg.innerHTML = `<span style="color:var(--danger);">Error: ${err.message}</span>`;
          syncMsg.style.display = 'block';
        }
      });
    }

    // Settings: Quick PIN form
    const pinForm = document.getElementById('change-pin-form');
    if (pinForm) {
      pinForm.addEventListener('submit', async (e) => {
        e.preventDefault();
        const pin = document.getElementById('new-pin-input').value.trim();
        const pinMsg = document.getElementById('pin-status-msg');

        if (pin.length !== 4) {
          alert('PIN must be exactly 4 digits');
          return;
        }

        try {
          await Storage.changePin(pin);
          document.getElementById('new-pin-input').value = '';
          pinMsg.textContent = 'Quick PIN updated successfully!';
          pinMsg.style.display = 'block';
          Views.renderSettings();
          setTimeout(() => { pinMsg.style.display = 'none'; }, 3000);
        } catch (err) {
          alert('Error: ' + err.message);
        }
      });
    }

    const removePinBtn = document.getElementById('remove-pin-btn');
    if (removePinBtn) {
      removePinBtn.addEventListener('click', async () => {
        if (!confirm('Disable Quick PIN? You will need your master password to unlock.')) return;
        try {
          await Storage.changePin(null);
          Views.renderSettings();
          alert('Quick PIN disabled.');
        } catch (err) {
          alert('Error: ' + err.message);
        }
      });
    }

    // Settings: Password change
    document.getElementById('change-password-form').addEventListener('submit', async (e) => {
      e.preventDefault();
      const current = document.getElementById('current-password').value;
      const newPass = document.getElementById('new-password').value;
      const confirm = document.getElementById('confirm-new-password').value;
      const errorDiv = document.getElementById('password-error');
      const successDiv = document.getElementById('password-success');

      errorDiv.style.display = 'none';
      successDiv.style.display = 'none';

      if (newPass !== confirm) {
        errorDiv.textContent = 'New passwords do not match';
        errorDiv.style.display = 'block';
        return;
      }

      try {
        await API.changePassword(current, newPass);
        successDiv.textContent = 'Password changed successfully!';
        successDiv.style.display = 'block';
        document.getElementById('current-password').value = '';
        document.getElementById('new-password').value = '';
        document.getElementById('confirm-new-password').value = '';
      } catch (e) {
        errorDiv.textContent = e.message;
        errorDiv.style.display = 'block';
      }
    });

    // Settings: Quotes
    document.getElementById('add-quote-form').addEventListener('submit', async (e) => {
      e.preventDefault();
      const text = document.getElementById('new-quote-text').value.trim();
      const author = document.getElementById('new-quote-author').value.trim();

      if (!text) return;

      try {
        await API.createQuote({ text, author });
        document.getElementById('new-quote-text').value = '';
        document.getElementById('new-quote-author').value = '';
        await Views.loadState();
        Views.renderSettings();
        Views.renderTopQuote(true);
      } catch (e) {
        alert('Error: ' + e.message);
      }
    });

    // Settings: Export / Import
    document.getElementById('export-btn').addEventListener('click', async () => {
      try {
        const blob = await API.exportData();
        const url = URL.createObjectURL(blob);
        const a = document.createElement('a');
        a.href = url;
        a.download = `hobby-tracker-backup-${new Date().toISOString().split('T')[0]}.json`;
        a.click();
        URL.revokeObjectURL(url);
      } catch (e) {
        alert('Export failed: ' + e.message);
      }
    });

    document.getElementById('import-file').addEventListener('change', async (e) => {
      const file = e.target.files[0];
      if (!file) return;

      const reader = new FileReader();
      reader.onload = async (event) => {
        try {
          const data = JSON.parse(event.target.result);
          await API.importData(data);
          await Views.loadState();
          this.refreshCurrentView();
          alert('Data imported successfully!');
        } catch (e) {
          alert('Import failed: ' + e.message);
        }
      };
      reader.readAsText(file);
      e.target.value = '';
    });

    // Modal close buttons
    document.querySelectorAll('.modal-close').forEach(btn => {
      btn.addEventListener('click', () => {
        btn.closest('.modal').style.display = 'none';
      });
    });

    document.querySelectorAll('.modal').forEach(modal => {
      modal.addEventListener('click', (e) => {
        if (e.target === modal) {
          modal.style.display = 'none';
        }
      });
    });

    // Note Modal
    const noteModal = document.getElementById('note-modal');
    const noteContent = noteModal ? noteModal.querySelector('.note-modal-content') : null;
    document.querySelectorAll('#note-modal .note-type-btn').forEach(btn => {
      btn.addEventListener('click', () => {
        document.querySelectorAll('#note-modal .note-type-btn').forEach(b => b.classList.remove('active'));
        btn.classList.add('active');
        if (noteContent) {
          noteContent.className = 'modal-content note-modal-content';
          if (btn.dataset.type === 'love') noteContent.classList.add('note-type-love');
          else if (btn.dataset.type === 'discipline') noteContent.classList.add('note-type-discipline');
        }
      });
    });

    document.getElementById('save-note-btn').addEventListener('click', async () => {
      const modal = document.getElementById('note-modal');
      const habitId = modal.dataset.habitId;
      const date = modal.dataset.date;
      const noteId = modal.dataset.noteId;
      const text = document.getElementById('note-text').value.trim();
      const activeBtn = modal.querySelector('.note-type-btn.active');
      const type = (activeBtn && activeBtn.dataset.type) || 'default';

      try {
        if (noteId) {
          await API.updateNote(noteId, { text, type });
        } else {
          await API.createNote({ habitId, date, text, type });
        }
        modal.style.display = 'none';
        await Views.loadState();
        await Views.renderHabits();
      } catch (e) {
        alert('Error: ' + e.message);
      }
    });

    document.getElementById('delete-note-btn').addEventListener('click', async () => {
      if (!confirm('Delete this note?')) return;
      const modal = document.getElementById('note-modal');
      const noteId = modal.dataset.noteId;

      try {
        await API.deleteNote(noteId);
        modal.style.display = 'none';
        await Views.loadState();
        Views.renderHabits();
      } catch (e) {
        alert('Error: ' + e.message);
      }
    });

    // Habit Modal
    document.getElementById('save-habit-btn').addEventListener('click', async () => {
      const modal = document.getElementById('habit-modal');
      const habitId = modal.dataset.habitId;
      const name = document.getElementById('habit-name').value.trim();
      const icon = document.getElementById('habit-icon').value || '●';
      const color = document.getElementById('habit-color').value;

      if (!name) {
        alert('Please enter a habit name');
        return;
      }

      try {
        if (habitId) {
          await API.updateHabit(habitId, { name, icon, color });
        } else {
          await API.createHabit({ name, icon, color });
        }
        modal.style.display = 'none';
        await Views.loadState();
        Views.renderHabits();
      } catch (e) {
        alert('Error: ' + e.message);
      }
    });

    document.getElementById('archive-habit-btn').addEventListener('click', async () => {
      const modal = document.getElementById('habit-modal');
      const habitId = modal.dataset.habitId;
      const habit = Views.state.habits.find(h => h.id === habitId);

      try {
        await API.updateHabit(habitId, { archived: !habit.archived });
        modal.style.display = 'none';
        await Views.loadState();
        Views.renderHabits();
      } catch (e) {
        alert('Error: ' + e.message);
      }
    });

    document.getElementById('delete-habit-btn').addEventListener('click', async () => {
      if (!confirm('Delete this habit and all its data?')) return;
      const modal = document.getElementById('habit-modal');
      const habitId = modal.dataset.habitId;

      try {
        await API.deleteHabit(habitId);
        modal.style.display = 'none';
        await Views.loadState();
        Views.renderHabits();
      } catch (e) {
        alert('Error: ' + e.message);
      }
    });

    // Task Modal
    document.getElementById('save-task-btn').addEventListener('click', async () => {
      const modal = document.getElementById('task-modal');
      const taskId = modal.dataset.taskId;
      const title = document.getElementById('task-title').value.trim();

      if (!title) {
        alert('Please enter a task title');
        return;
      }

      try {
        if (taskId) {
          await API.updateTask(taskId, { title });
        } else {
          await API.createTask({ title });
        }
        modal.style.display = 'none';
        await Views.loadState();
        Views.renderTasks();
      } catch (e) {
        alert('Error: ' + e.message);
      }
    });

    document.getElementById('archive-task-btn').addEventListener('click', async () => {
      const modal = document.getElementById('task-modal');
      const taskId = modal.dataset.taskId;
      const task = Views.state.tasks.find(t => t.id === taskId);

      try {
        await API.updateTask(taskId, { archived: !task.archived });
        modal.style.display = 'none';
        await Views.loadState();
        Views.renderTasks();
      } catch (e) {
        alert('Error: ' + e.message);
      }
    });

    document.getElementById('delete-task-btn').addEventListener('click', async () => {
      if (!confirm('Delete this task and all its data?')) return;
      const modal = document.getElementById('task-modal');
      const taskId = modal.dataset.taskId;

      try {
        await API.deleteTask(taskId);
        modal.style.display = 'none';
        await Views.loadState();
        Views.renderTasks();
      } catch (e) {
        alert('Error: ' + e.message);
      }
    });

    // Initial render
    this.switchView('habits');
  },

  updateSyncUI(status, error = null) {
    const sidebarIndicator = document.getElementById('sidebar-sync-indicator');
    const mobileBadge = document.getElementById('mobile-sync-badge');

    let text = 'Synced';
    let dotClass = 'synced';

    if (status === 'syncing') {
      text = 'Syncing...';
      dotClass = 'syncing';
    } else if (status === 'offline') {
      text = 'Offline';
      dotClass = 'offline';
    } else if (status === 'error') {
      text = 'Sync Error';
      dotClass = 'error';
    } else if (status === 'idle') {
      text = 'Ready';
      dotClass = 'idle';
    }

    if (sidebarIndicator) {
      const label = sidebarIndicator.querySelector('.sync-label');
      const dot = sidebarIndicator.querySelector('.sync-dot');
      if (label) label.textContent = text;
      if (dot) dot.className = `sync-dot ${dotClass}`;
      sidebarIndicator.title = error ? `Error: ${error}` : `Sync status: ${text}`;
    }

    if (mobileBadge) {
      const textEl = mobileBadge.querySelector('.sync-text');
      const dot = mobileBadge.querySelector('.sync-dot');
      if (textEl) textEl.textContent = text;
      if (dot) dot.className = `sync-dot ${dotClass}`;
      mobileBadge.title = error ? `Error: ${error}` : `Sync status: ${text}`;
    }
  },

  refreshCurrentView() {
    this.switchView(this.currentViewName);
  },

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
      habits: 'Habits — Hobby Tracker',
      tasks: 'Tasks — Hobby Tracker',
      diary: 'Diary — Hobby Tracker',
      settings: 'Settings — Hobby Tracker'
    };
    document.title = titles[view] || 'Hobby Tracker';

    // Keep top quote banner visible across all view changes
    if (typeof Views.renderTopQuote === 'function') {
      Views.renderTopQuote();
    }

    if (view === 'habits') Views.renderHabits();
    else if (view === 'tasks') Views.renderTasks();
    else if (view === 'diary') Views.renderDiary();
    else if (view === 'settings') Views.renderSettings();
  }
};

// Launch Auth
Auth.init();
