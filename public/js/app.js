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

    if (typeof ThemeManager !== 'undefined') {
      ThemeManager.bindControls();
    }

    // Register Service Worker for 100% Offline Support & Automatic Updates
    if ('serviceWorker' in navigator) {
      let isRefreshing = false;

      // Handle automatic page refresh when new service worker takes control
      if (typeof navigator.serviceWorker.addEventListener === 'function') {
        navigator.serviceWorker.addEventListener('controllerchange', () => {
          if (!isRefreshing) {
            isRefreshing = true;
            window.location.reload();
          }
        });
      }

      navigator.serviceWorker.register('./sw.js', { updateViaCache: 'none' }).then(reg => {
        if (!reg) return;

        // Proactively check for updates immediately on launch
        if (typeof reg.update === 'function') {
          reg.update().catch(() => {});
        }

        // Periodically check for updates if app stays open (every 15 minutes)
        setInterval(() => {
          if (typeof reg.update === 'function') reg.update().catch(() => {});
        }, 15 * 60 * 1000);

        const updateBanner = document.getElementById('update-notification');
        const updateText = document.getElementById('update-banner-text');
        const reloadBtn = document.getElementById('update-reload-btn');

        const triggerImmediateUpdate = (worker) => {
          if (updateBanner) {
            if (updateText) updateText.textContent = 'Updating to latest version...';
            updateBanner.style.display = 'flex';
          }
          if (worker && typeof worker.postMessage === 'function') {
            worker.postMessage({ type: 'SKIP_WAITING' });
          }
          setTimeout(() => {
            if (!isRefreshing) {
              isRefreshing = true;
              window.location.reload();
            }
          }, 800);
        };

        if (reloadBtn) {
          reloadBtn.addEventListener('click', () => {
            if (reg.waiting) {
              triggerImmediateUpdate(reg.waiting);
            } else {
              window.location.reload();
            }
          });
        }

        // If a worker is already waiting from a previous background download
        if (reg.waiting && navigator.serviceWorker.controller) {
          triggerImmediateUpdate(reg.waiting);
        }

        // When a new update is found during active launch
        if (typeof reg.addEventListener === 'function') {
          reg.addEventListener('updatefound', () => {
            const newWorker = reg.installing;
            if (newWorker && typeof newWorker.addEventListener === 'function') {
              newWorker.addEventListener('statechange', () => {
                if (newWorker.state === 'installed' && navigator.serviceWorker.controller) {
                  // A new version downloaded in background: auto-apply!
                  triggerImmediateUpdate(newWorker);
                }
              });
            }
          });
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

    // Desktop Sidebar Collapse & Expand
    const collapseBtn = document.getElementById('sidebar-collapse-btn');
    const expandBtn = document.getElementById('sidebar-expand-btn');
    const mainContent = document.querySelector('.main-content');

    const setSidebarCollapsed = (collapsed) => {
      if (!sidebar) return;
      if (collapsed) {
        sidebar.classList.add('collapsed');
        if (mainContent) mainContent.classList.add('sidebar-collapsed');
        try { localStorage.setItem('hobby_sidebar_collapsed', '1'); } catch (_) {}
      } else {
        sidebar.classList.remove('collapsed');
        if (mainContent) mainContent.classList.remove('sidebar-collapsed');
        try { localStorage.removeItem('hobby_sidebar_collapsed'); } catch (_) {}
      }
    };

    if (collapseBtn) collapseBtn.addEventListener('click', () => setSidebarCollapsed(true));
    if (expandBtn) expandBtn.addEventListener('click', () => setSidebarCollapsed(false));

    try {
      if (localStorage.getItem('hobby_sidebar_collapsed') === '1' && window.innerWidth > 768) {
        setSidebarCollapsed(true);
      }
    } catch (_) {}

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
      } else if (!res.success && res.reason === 'locked') {
        this.switchView('settings');
        const syncMsg = document.getElementById('sync-settings-msg');
        if (syncMsg) {
          this.showSyncMasterPasswordPrompt(syncMsg);
          syncMsg.scrollIntoView({ behavior: 'smooth' });
        }
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
    const stepHabitTimeline = (days) => {
      if (Views.habitGridHasLayout()) {
        Views.scrollHabitsByDays(days);
      } else {
        Views.currentHabitDateOffset += days;
        Views.renderHabits();
      }
    };

    document.getElementById('prev-week').addEventListener('click', () => {
      stepHabitTimeline(-7);
    });

    document.getElementById('next-week').addEventListener('click', () => {
      stepHabitTimeline(7);
    });

    document.getElementById('today-btn').addEventListener('click', () => {
      Views.currentHabitDateOffset = 0;
      if (Views.habitGridHasLayout()) {
        Views.scrollHabitGridToDate(DateUtils.todayKey());
      } else {
        Views.renderHabits({ centerToday: true });
      }
    });

    const habitJumpDate = document.getElementById('habit-jump-date');
    if (habitJumpDate) {
      habitJumpDate.addEventListener('change', () => {
        if (!habitJumpDate.value) return;
        Views.scrollHabitGridToDate(habitJumpDate.value);
      });
    }

    document.getElementById('add-habit-btn').addEventListener('click', () => {
      Views.openHabitModal();
    });

    document.getElementById('show-archived-habits').addEventListener('change', () => {
      Views.renderHabits({ preserveScroll: true });
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

    const stepDiaryDay = (days) => {
      const nextDate = DateUtils.addDays(Views.currentDiaryDate || DateUtils.todayKey(), days);
      Views.currentDiaryDate = nextDate;
      const [y, m] = nextDate.split('-').map(Number);
      Views.diaryNavYear = y;
      Views.diaryNavMonth = m - 1;
      const dInput = document.getElementById('diary-date');
      if (dInput) dInput.value = nextDate;
      Views.renderDiary();
    };

    const prevDayBtn = document.getElementById('prev-day');
    if (prevDayBtn) {
      prevDayBtn.addEventListener('click', () => stepDiaryDay(-1));
    }

    const nextDayBtn = document.getElementById('next-day');
    if (nextDayBtn) {
      nextDayBtn.addEventListener('click', () => stepDiaryDay(1));
    }

    // Mood selector buttons
    document.querySelectorAll('.mood-btn').forEach(btn => {
      btn.addEventListener('click', async (e) => {
        const clickedBtn = e.currentTarget;
        const mood = clickedBtn.dataset.mood;
        const date = Views.currentDiaryDate || DateUtils.todayKey();

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
            } else if (res.reason === 'locked') {
              this.showSyncMasterPasswordPrompt(syncMsg);
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
        a.download = `hobby-tracker-backup-${DateUtils.todayKey()}.json`;
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

    // Settings: Check for updates manually without clearing login/session
    const checkUpdatesBtn = document.getElementById('check-updates-btn');
    if (checkUpdatesBtn) {
      checkUpdatesBtn.addEventListener('click', async () => {
        const msg = document.getElementById('update-status-msg');
        if (msg) {
          msg.textContent = 'Checking for updates...';
          msg.style.display = 'block';
        }
        try {
          if ('serviceWorker' in navigator && typeof navigator.serviceWorker.getRegistration === 'function') {
            const reg = await navigator.serviceWorker.getRegistration();
            if (reg) {
              if (typeof reg.update === 'function') {
                await reg.update();
              }
              if (reg.waiting || reg.installing) {
                if (msg) msg.textContent = 'New update found! Installing in background...';
                if (reg.waiting) {
                  reg.waiting.postMessage({ type: 'SKIP_WAITING' });
                }
                return;
              }
            }
          }
          if (msg) {
            msg.textContent = '✓ You are already on the latest version (v3.7)!';
            setTimeout(() => {
              if (msg) msg.style.display = 'none';
            }, 3500);
          }
        } catch (err) {
          console.warn('Update check error:', err);
          if (msg) {
            msg.textContent = '✓ You are on the latest version.';
            setTimeout(() => {
              if (msg) msg.style.display = 'none';
            }, 3000);
          }
        }
      });
    }

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
        await Views.renderHabits({ preserveScroll: true });
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
        Views.renderHabits({ preserveScroll: true });
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
        Views.renderHabits({ preserveScroll: true });
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
        Views.renderHabits({ preserveScroll: true });
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
        Views.renderHabits({ preserveScroll: true });
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

    // Goal Modal and Event Handlers
    const openGoalModal = (goalId = null, defaultCategory = 'quick') => {
      const modal = document.getElementById('goal-modal');
      if (!modal) return;
      const titleInput = document.getElementById('goal-title');
      const tagInput = document.getElementById('goal-tag');
      const targetDateInput = document.getElementById('goal-target-date');
      const descInput = document.getElementById('goal-description');
      const milestonesInput = document.getElementById('goal-milestones');
      const deleteBtn = document.getElementById('delete-goal-btn');
      const modalTitle = document.getElementById('goal-modal-title');

      modal.dataset.goalId = goalId || '';

      if (goalId && Views.state && Views.state.goals) {
        const goal = Views.state.goals.find(g => g.id === goalId);
        if (goal) {
          if (modalTitle) modalTitle.textContent = 'Edit Goal';
          if (titleInput) titleInput.value = goal.title || '';
          if (tagInput) tagInput.value = goal.tag || '';
          if (targetDateInput) targetDateInput.value = goal.targetDate || '';
          if (descInput) descInput.value = goal.description || '';
          const ms = (goal.milestones || []).map(m => m.text).join('\n');
          if (milestonesInput) milestonesInput.value = ms;
          const radio = document.querySelector(`input[name="goal-category-radio"][value="${goal.category || 'quick'}"]`);
          if (radio) radio.checked = true;
          if (deleteBtn) deleteBtn.style.display = 'inline-block';
          modal.style.display = 'flex';
          if (titleInput) titleInput.focus();
          return;
        }
      }

      if (modalTitle) modalTitle.textContent = 'Add Goal';
      if (titleInput) titleInput.value = '';
      if (tagInput) tagInput.value = '';
      if (targetDateInput) targetDateInput.value = '';
      if (descInput) descInput.value = '';
      if (milestonesInput) milestonesInput.value = '';
      const radio = document.querySelector(`input[name="goal-category-radio"][value="${defaultCategory}"]`);
      if (radio) radio.checked = true;
      if (deleteBtn) deleteBtn.style.display = 'none';
      modal.style.display = 'flex';
      if (titleInput) titleInput.focus();
    };

    window.openGoalModal = openGoalModal;

    const addGoalBtn = document.getElementById('add-goal-btn');
    if (addGoalBtn) {
      addGoalBtn.addEventListener('click', () => openGoalModal());
    }

    document.querySelectorAll('.btn-propose-goal').forEach(btn => {
      btn.addEventListener('click', () => {
        openGoalModal(null, btn.dataset.category || 'quick');
      });
    });

    const closeGoalModal = () => {
      const modal = document.getElementById('goal-modal');
      if (modal) modal.style.display = 'none';
    };

    const goalModalCloseBtn = document.getElementById('goal-modal-close');
    if (goalModalCloseBtn) {
      goalModalCloseBtn.addEventListener('click', closeGoalModal);
    }

    // Filter tabs in Goals
    document.querySelectorAll('.goal-filter-btn').forEach(btn => {
      btn.addEventListener('click', () => {
        Views.currentGoalFilter = btn.dataset.filter;
        Views.renderGoals();
      });
    });

    // Save Goal
    const saveGoalBtn = document.getElementById('save-goal-btn');
    if (saveGoalBtn) {
      saveGoalBtn.addEventListener('click', async () => {
        const modal = document.getElementById('goal-modal');
        const goalId = modal.dataset.goalId;
        const title = document.getElementById('goal-title').value.trim();
        if (!title) {
          alert('Please enter a goal title');
          return;
        }
        const categoryRadio = document.querySelector('input[name="goal-category-radio"]:checked');
        const category = categoryRadio ? categoryRadio.value : 'quick';
        const tag = document.getElementById('goal-tag').value.trim() || 'General';
        const targetDate = document.getElementById('goal-target-date').value.trim();
        const description = document.getElementById('goal-description').value.trim();
        const milestoneLines = document.getElementById('goal-milestones').value
          .split('\n')
          .map(l => l.trim())
          .filter(l => l.length > 0);

        let existingGoal = null;
        if (goalId && Views.state && Views.state.goals) {
          existingGoal = Views.state.goals.find(g => g.id === goalId);
        }

        const milestones = milestoneLines.map((line, idx) => {
          let done = false;
          if (existingGoal && existingGoal.milestones && existingGoal.milestones[idx]) {
            if (existingGoal.milestones[idx].text === line) {
              done = !!existingGoal.milestones[idx].done;
            }
          }
          return { id: 'm_' + idx + '_' + Date.now(), text: line, done };
        });

        const total = milestones.length;
        const doneCount = milestones.filter(m => m.done).length;
        const progress = total > 0 ? Math.round((doneCount / total) * 100) : (existingGoal ? existingGoal.progress : 0);

        try {
          if (goalId) {
            await API.updateGoal(goalId, {
              title,
              category,
              tag,
              targetDate,
              description,
              milestones,
              progress
            });
          } else {
            await API.createGoal({
              title,
              category,
              tag,
              targetDate,
              description,
              milestones,
              progress
            });
          }
          modal.style.display = 'none';
          await Views.loadState();
          Views.renderGoals();
        } catch (e) {
          alert('Error: ' + e.message);
        }
      });
    }

    // Delete Goal
    const deleteGoalBtn = document.getElementById('delete-goal-btn');
    if (deleteGoalBtn) {
      deleteGoalBtn.addEventListener('click', async () => {
        if (!confirm('Delete this goal and all its milestones?')) return;
        const modal = document.getElementById('goal-modal');
        const goalId = modal.dataset.goalId;
        if (!goalId) return;

        try {
          await API.deleteGoal(goalId);
          modal.style.display = 'none';
          await Views.loadState();
          Views.renderGoals();
        } catch (e) {
          alert('Error: ' + e.message);
        }
      });
    }

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

  showSyncMasterPasswordPrompt(syncMsg) {
    if (!syncMsg) return;
    syncMsg.style.display = 'block';
    syncMsg.innerHTML = `
      <div style="background: rgba(245, 158, 11, 0.08); border: 1px solid rgba(245, 158, 11, 0.35); border-radius: 8px; padding: 14px; margin-top: 10px;">
        <div style="font-weight: 600; color: var(--amber-glow, #b45309); margin-bottom: 6px; font-size: 14px;">🔐 Master Password Required for Encrypted Cloud Sync</div>
        <div style="font-size: 13px; color: var(--text-muted); line-height: 1.5; margin-bottom: 10px;">
          You unlocked Hobby Tracker with your Quick PIN. Because all sync data is encrypted with your Master Password before sending to GitHub, please enter your Master Password once below to authorize sync (this also permanently links your PIN):
        </div>
        <div style="display: flex; gap: 8px; flex-wrap: wrap;">
          <input type="password" id="sync-unlock-password" placeholder="Enter Master Password" style="flex: 1; min-width: 220px; padding: 8px 12px; border: 1px solid var(--border); border-radius: var(--radius-sm); font-size: 14px;">
          <button type="button" id="sync-unlock-btn" class="btn btn-primary btn-small">Authorize & Sync</button>
        </div>
        <div id="sync-unlock-error" style="color: var(--danger); font-size: 12px; margin-top: 8px; display: none;"></div>
      </div>
    `;

    const unlockBtn = document.getElementById('sync-unlock-btn');
    const unlockPass = document.getElementById('sync-unlock-password');
    const unlockErr = document.getElementById('sync-unlock-error');

    if (unlockBtn && unlockPass) {
      const doUnlock = async () => {
        const pass = unlockPass.value.trim();
        if (!pass) return;
        try {
          const auth = await Storage.getKV('auth');
          if (auth && auth.masterHash) {
            const hash = await CryptoUtils.sha256(pass, auth.masterSalt);
            if (hash !== auth.masterHash) {
              if (unlockErr) {
                unlockErr.textContent = 'Incorrect master password. Please try again.';
                unlockErr.style.display = 'block';
              }
              return;
            }
          }

          // Valid master password! Cache it in memory & session
          await Storage.setUnlocked(true, pass);

          // If PIN is configured, wrap it now with session PIN or current PIN
          if (auth && auth.pinHash && auth.pinSalt) {
            const sessionPin = sessionStorage.getItem('ht_session_pin');
            if (sessionPin) {
              auth.wrappedMasterKey = await CryptoUtils.encrypt({ masterPassword: pass }, sessionPin, auth.pinSalt);
              await Storage.setKV('auth', auth);
            }
          }

          syncMsg.innerHTML = '<span style="color:var(--primary);">✓ Master Password authorized! Syncing encrypted vault...</span>';
          const retryRes = await Sync.syncNow();
          if (retryRes.success) {
            syncMsg.innerHTML = '<span style="color:var(--primary);">✓ Successfully connected and synced with GitHub Private Gist!</span>';
            Views.renderSettings();
          } else {
            syncMsg.innerHTML = `<span style="color:var(--danger);">⚠️ Connection error: ${retryRes.error || retryRes.reason}</span>`;
          }
        } catch (e) {
          if (unlockErr) {
            unlockErr.textContent = 'Error: ' + e.message;
            unlockErr.style.display = 'block';
          }
        }
      };

      unlockBtn.addEventListener('click', doUnlock);
      unlockPass.addEventListener('keydown', (e) => {
        if (e.key === 'Enter') {
          e.preventDefault();
          doUnlock();
        }
      });
    }
  },

  refreshCurrentView() {
    this.switchView(this.currentViewName, { preserveHabitScroll: true });
  },

  switchView(view, options = {}) {
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
      goals: 'Goals — Hobby Tracker',
      diary: 'Diary — Hobby Tracker',
      settings: 'Settings — Hobby Tracker'
    };
    document.title = titles[view] || 'Hobby Tracker';

    // Keep top quote banner visible across all view changes
    if (typeof Views.renderTopQuote === 'function') {
      Views.renderTopQuote();
    }

    if (view === 'habits') {
      Views.renderHabits(options.preserveHabitScroll
        ? { preserveScroll: true }
        : { centerToday: true });
    }
    else if (view === 'tasks') Views.renderTasks();
    else if (view === 'goals') Views.renderGoals();
    else if (view === 'diary') Views.renderDiary();
    else if (view === 'settings') Views.renderSettings();
  }
};

// Launch Auth
Auth.init();
