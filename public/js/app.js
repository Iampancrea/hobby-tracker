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

    // Top quote banner Next button
    const quoteNextBtn = document.getElementById('quote-next-btn');
    if (quoteNextBtn) {
      quoteNextBtn.addEventListener('click', () => {
        Views.renderTopQuote(true);
        if (this.currentViewName === 'settings') {
          Views.renderSettings();
        }
      });
    }

    // Settings: Quotes
    const quoteForm = document.getElementById('add-quote-form');
    const newQuoteInput = document.getElementById('new-quote-text');
    const quoteBigCapsBtn = document.getElementById('quote-big-caps-btn');
    const quotePreviewWrap = document.getElementById('quote-live-preview');
    const quotePreviewText = document.getElementById('quote-live-preview-text');

    const updateQuoteComposerUI = () => {
      if (!newQuoteInput) return;
      const val = newQuoteInput.value || '';
      const pos = typeof newQuoteInput.selectionStart === 'number' ? newQuoteInput.selectionStart : val.length;
      const markersBefore = (val.slice(0, pos).match(/\^\^/g) || []).length;
      const insideBigCaps = markersBefore % 2 === 1;

      if (quoteBigCapsBtn) {
        quoteBigCapsBtn.classList.toggle('active', insideBigCaps);
      }
      if (quotePreviewWrap && quotePreviewText) {
        if (val.trim() && (val.includes('^^') || val.includes('\n'))) {
          quotePreviewText.innerHTML = Views.formatQuoteHtml(val);
          quotePreviewWrap.style.display = 'block';
        } else {
          quotePreviewWrap.style.display = 'none';
          quotePreviewText.innerHTML = '';
        }
      }
    };

    if (newQuoteInput) {
      newQuoteInput.addEventListener('keydown', (e) => {
        if (e.key === 'Enter' && !e.shiftKey) {
          e.preventDefault();
          if (quoteForm) {
            if (typeof quoteForm.requestSubmit === 'function') {
              quoteForm.requestSubmit();
            } else {
              quoteForm.dispatchEvent(new Event('submit', { bubbles: true, cancelable: true }));
            }
          }
        }
      });
      newQuoteInput.addEventListener('input', updateQuoteComposerUI);
      newQuoteInput.addEventListener('click', updateQuoteComposerUI);
      newQuoteInput.addEventListener('keyup', updateQuoteComposerUI);
    }

    if (quoteBigCapsBtn && newQuoteInput) {
      quoteBigCapsBtn.addEventListener('click', () => {
        const val = newQuoteInput.value || '';
        const start = typeof newQuoteInput.selectionStart === 'number' ? newQuoteInput.selectionStart : val.length;
        const end = typeof newQuoteInput.selectionEnd === 'number' ? newQuoteInput.selectionEnd : val.length;

        if (end > start) {
          const selected = val.slice(start, end);
          let nextVal;
          let nextStart;
          let nextEnd;

          if (selected.startsWith('^^') && selected.endsWith('^^') && selected.length >= 4) {
            const inner = selected.slice(2, -2);
            nextVal = val.slice(0, start) + inner + val.slice(end);
            nextStart = start;
            nextEnd = start + inner.length;
          } else if (val.slice(Math.max(0, start - 2), start) === '^^' && val.slice(end, end + 2) === '^^') {
            nextVal = val.slice(0, start - 2) + selected + val.slice(end + 2);
            nextStart = start - 2;
            nextEnd = nextStart + selected.length;
          } else {
            const wrapped = `^^${selected.toUpperCase()}^^`;
            nextVal = val.slice(0, start) + wrapped + val.slice(end);
            nextStart = start;
            nextEnd = start + wrapped.length;
          }

          newQuoteInput.value = nextVal;
          newQuoteInput.focus();
          if (typeof newQuoteInput.setSelectionRange === 'function') {
            newQuoteInput.setSelectionRange(nextStart, nextEnd);
          }
        } else {
          if (val.slice(Math.max(0, start - 2), start) === '^^' && val.slice(start, start + 2) === '^^') {
            // Cursor is inside an empty ^^^^ pair — toggle it off cleanly
            const untoggled = val.slice(0, start - 2) + val.slice(start + 2);
            const nextPos = start - 2;
            newQuoteInput.value = untoggled;
            newQuoteInput.focus();
            if (typeof newQuoteInput.setSelectionRange === 'function') {
              newQuoteInput.setSelectionRange(nextPos, nextPos);
            }
            updateQuoteComposerUI();
            return;
          }
          const markersBefore = (val.slice(0, start).match(/\^\^/g) || []).length;
          if (markersBefore % 2 === 1) {
            // Cursor is inside an open ^^...^^ block — jump out past closing ^^
            const closeIdx = val.indexOf('^^', start);
            if (closeIdx !== -1) {
              const afterClose = closeIdx + 2;
              newQuoteInput.focus();
              if (typeof newQuoteInput.setSelectionRange === 'function') {
                newQuoteInput.setSelectionRange(afterClose, afterClose);
              }
              updateQuoteComposerUI();
              return;
            }
          }
          const needsPad = val.slice(Math.max(0, start - 2), start) === '^^';
          const insertion = needsPad ? ' ^^^^' : '^^^^';
          const nextVal = val.slice(0, start) + insertion + val.slice(end);
          newQuoteInput.value = nextVal;
          const innerPos = start + (needsPad ? 3 : 2);
          newQuoteInput.focus();
          if (typeof newQuoteInput.setSelectionRange === 'function') {
            newQuoteInput.setSelectionRange(innerPos, innerPos);
          }
        }
        updateQuoteComposerUI();
      });
    }

    if (quoteForm) {
      quoteForm.addEventListener('submit', async (e) => {
        e.preventDefault();
        const text = (newQuoteInput ? newQuoteInput.value : '').trim();
        const author = document.getElementById('new-quote-author').value.trim();

        if (!text) return;

        try {
          const created = await API.createQuote({ text, author });
          if (newQuoteInput) newQuoteInput.value = '';
          document.getElementById('new-quote-author').value = '';
          updateQuoteComposerUI();
          await Views.loadState();
          Views.renderSettings();
          Views.renderTopQuote(true, created && created.id);
        } catch (e) {
          alert('Error: ' + e.message);
        }
      });
    }

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
            msg.textContent = '✓ You are already on the latest version (v3.11)!';
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

    // Plan / Goal Modal and Event Handlers
    const openGoalModal = (goalId = null, defaultCategory = 'quick', parentId = null) => {
      const modal = document.getElementById('goal-modal');
      if (!modal) return;
      const titleInput = document.getElementById('goal-title');
      const tagInput = document.getElementById('goal-tag');
      const targetDateInput = document.getElementById('goal-target-date');
      const descInput = document.getElementById('goal-description');
      const strategyInput = document.getElementById('goal-strategy');
      const parentIdInput = document.getElementById('goal-parent-id');
      const milestonesInput = document.getElementById('goal-milestones');
      const deleteBtn = document.getElementById('delete-goal-btn');
      const modalTitle = document.getElementById('goal-modal-title');
      const saveBtn = document.getElementById('save-goal-btn');

      modal.dataset.goalId = goalId || '';

      if (goalId && Views.state && Views.state.goals) {
        const goal = Views.state.goals.find(g => g.id === goalId);
        if (goal) {
          const isChildGoal = !!(goal.parentId || parentId);
          if (modalTitle) modalTitle.textContent = isChildGoal ? 'Edit Quick Goal' : 'Edit Plan';
          if (saveBtn) saveBtn.textContent = isChildGoal ? 'Save Quick Goal' : 'Save Plan';
          if (titleInput) titleInput.value = goal.title || '';
          if (tagInput) tagInput.value = goal.tag || '';
          if (targetDateInput) targetDateInput.value = goal.targetDate || '';
          if (descInput) descInput.value = goal.description || '';
          if (strategyInput) strategyInput.value = goal.strategy || '';
          if (parentIdInput) parentIdInput.value = goal.parentId || parentId || '';
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

      const isChild = !!parentId;
      if (modalTitle) modalTitle.textContent = isChild ? 'Add Quick Goal' : 'Add Plan';
      if (saveBtn) saveBtn.textContent = isChild ? 'Save Quick Goal' : 'Save Plan';
      if (titleInput) titleInput.value = '';
      if (tagInput) tagInput.value = '';
      if (targetDateInput) targetDateInput.value = '';
      if (descInput) descInput.value = '';
      if (strategyInput) strategyInput.value = '';
      if (parentIdInput) parentIdInput.value = parentId || '';
      if (milestonesInput) milestonesInput.value = '';
      const radio = document.querySelector(`input[name="goal-category-radio"][value="${defaultCategory}"]`);
      if (radio) radio.checked = true;
      if (deleteBtn) deleteBtn.style.display = 'none';
      modal.style.display = 'flex';
      if (titleInput) titleInput.focus();
    };

    window.openGoalModal = openGoalModal;

    const addPlanBtn = document.getElementById('add-plan-btn');
    if (addPlanBtn) {
      addPlanBtn.addEventListener('click', () => {
        const f = Views.currentPlanFilter;
        const defaultCat = (f === 'quick' || f === 'mid' || f === 'long') ? f : 'quick';
        openGoalModal(null, defaultCat, null);
      });
    }

    const addGoalBtn = document.getElementById('add-goal-btn');
    if (addGoalBtn) {
      addGoalBtn.addEventListener('click', () => openGoalModal());
    }

    const closeGoalModal = () => {
      const modal = document.getElementById('goal-modal');
      if (modal) modal.style.display = 'none';
    };

    const goalModalCloseBtn = document.getElementById('goal-modal-close');
    if (goalModalCloseBtn) {
      goalModalCloseBtn.addEventListener('click', closeGoalModal);
    }

    // Filter tabs in Plans
    const plansFilterGroup = document.getElementById('plans-filter-group');
    if (plansFilterGroup) {
      plansFilterGroup.querySelectorAll('.plan-filter-btn').forEach(btn => {
        btn.addEventListener('click', () => {
          plansFilterGroup.querySelectorAll('.plan-filter-btn').forEach(b => b.classList.remove('active'));
          btn.classList.add('active');
          Views.currentPlanFilter = btn.dataset.filter || 'all';
          if (typeof Views.renderPlans === 'function') Views.renderPlans();
        });
      });
    }

    const plansMobileBackBtn = document.getElementById('plans-mobile-back-btn');
    if (plansMobileBackBtn) {
      plansMobileBackBtn.addEventListener('click', () => {
        Views.mobilePlanDetailOpen = false;
        const workspace = document.querySelector('.plans-workspace');
        if (workspace) workspace.classList.remove('is-mobile-detail');
        if (typeof Views.renderPlans === 'function') Views.renderPlans();
      });
    }

    // Save Plan / Goal
    const saveGoalBtn = document.getElementById('save-goal-btn');
    if (saveGoalBtn) {
      saveGoalBtn.addEventListener('click', async () => {
        const modal = document.getElementById('goal-modal');
        const goalId = modal.dataset.goalId;
        const title = document.getElementById('goal-title').value.trim();
        if (!title) {
          alert('Please enter a plan title');
          return;
        }
        const categoryRadio = document.querySelector('input[name="goal-category-radio"]:checked');
        const category = categoryRadio ? categoryRadio.value : 'quick';
        const tag = document.getElementById('goal-tag').value.trim() || 'General';
        const targetDate = document.getElementById('goal-target-date').value.trim();
        const description = document.getElementById('goal-description').value.trim();
        const strategyEl = document.getElementById('goal-strategy');
        const strategy = strategyEl ? strategyEl.value.trim() : '';
        const parentIdEl = document.getElementById('goal-parent-id');
        const parentId = (parentIdEl && parentIdEl.value.trim()) ? parentIdEl.value.trim() : null;
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
              strategy,
              parentId,
              milestones,
              progress
            });
          } else {
            const created = await API.createGoal({
              title,
              category,
              tag,
              targetDate,
              description,
              strategy,
              parentId,
              milestones,
              progress
            });
            if (created && created.id && !parentId) {
              Views.selectedPlanId = created.id;
              Views.mobilePlanDetailOpen = true;
            }
          }
          modal.style.display = 'none';
          await Views.loadState();
          if (typeof Views.renderPlans === 'function') await Views.renderPlans();
          else if (typeof Views.renderGoals === 'function') Views.renderGoals();
        } catch (e) {
          alert('Error: ' + e.message);
        }
      });
    }

    // Delete Plan / Goal
    const deleteGoalBtn = document.getElementById('delete-goal-btn');
    if (deleteGoalBtn) {
      deleteGoalBtn.addEventListener('click', async () => {
        if (!confirm('Delete this plan and all its milestones?')) return;
        const modal = document.getElementById('goal-modal');
        const goalId = modal.dataset.goalId;
        if (!goalId) return;

        try {
          await API.deleteGoal(goalId);
          modal.style.display = 'none';
          if (Views.selectedPlanId === goalId) {
            Views.selectedPlanId = null;
            Views.mobilePlanDetailOpen = false;
          }
          await Views.loadState();
          if (typeof Views.renderPlans === 'function') await Views.renderPlans();
          else if (typeof Views.renderGoals === 'function') Views.renderGoals();
        } catch (e) {
          alert('Error: ' + e.message);
        }
      });
    }

    // Thoughts View Composer, Toolbar & Modal Bindings
    const thoughtBodyInput = document.getElementById('thought-body-input');
    const thoughtTitleInput = document.getElementById('thought-title-input');
    const thoughtTagInput = document.getElementById('thought-tag-input');
    const thoughtPlanSelect = document.getElementById('thought-plan-select');
    const thoughtPreSaveBtn = document.getElementById('thought-pre-save-btn');
    const thoughtOptionsBtn = document.getElementById('thought-composer-options-btn');
    const thoughtPostWritePanel = document.getElementById('thought-post-write-panel');
    const thoughtConfirmSaveBtn = document.getElementById('thought-confirm-save-btn');
    const thoughtSkipTitleBtn = document.getElementById('thought-skip-title-btn');
    const thoughtCancelSaveBtn = document.getElementById('thought-cancel-save-btn');

    const setThoughtPanelOpen = (open) => {
      if (!thoughtPostWritePanel) return;
      thoughtPostWritePanel.style.display = open ? '' : 'none';
      if (thoughtOptionsBtn) {
        thoughtOptionsBtn.setAttribute('aria-expanded', String(!!open));
      }
    };

    const getComposerThoughtColor = () => {
      const activeDot = document.querySelector('#thought-post-write-panel .thought-color-dot.active');
      return (activeDot && activeDot.dataset.color) || 'default';
    };

    const setComposerThoughtColor = (color = 'default') => {
      document.querySelectorAll('#thought-post-write-panel .thought-color-dot').forEach(dot => {
        dot.classList.toggle('active', dot.dataset.color === color);
      });
    };

    document.querySelectorAll('#thought-post-write-panel .thought-color-dot').forEach(dot => {
      dot.addEventListener('click', () => {
        setComposerThoughtColor(dot.dataset.color || 'default');
      });
    });

    if (thoughtPreSaveBtn) {
      thoughtPreSaveBtn.addEventListener('click', () => {
        setThoughtPanelOpen(true);
        if (thoughtTitleInput) thoughtTitleInput.focus();
      });
    }

    if (thoughtOptionsBtn) {
      thoughtOptionsBtn.addEventListener('click', () => {
        if (!thoughtPostWritePanel) return;
        const isHidden = thoughtPostWritePanel.style.display === 'none';
        setThoughtPanelOpen(isHidden);
      });
    }

    if (thoughtCancelSaveBtn) {
      thoughtCancelSaveBtn.addEventListener('click', () => {
        setThoughtPanelOpen(false);
      });
    }

    const saveComposerThought = async (untitled = false) => {
      const body = thoughtBodyInput ? thoughtBodyInput.value.trim() : '';
      if (!body) {
        alert('Please write a thought first');
        if (thoughtBodyInput) thoughtBodyInput.focus();
        return;
      }

      const title = untitled ? '' : (thoughtTitleInput ? thoughtTitleInput.value.trim() : '');
      const tag = thoughtTagInput ? thoughtTagInput.value.trim() : '';
      const color = getComposerThoughtColor();
      const planId = (thoughtPlanSelect && thoughtPlanSelect.value) ? thoughtPlanSelect.value : null;

      try {
        await API.createThought({
          title,
          body,
          tag,
          color,
          planId,
          pinned: false,
          expanded: false
        });
        if (thoughtBodyInput) thoughtBodyInput.value = '';
        if (thoughtTitleInput) thoughtTitleInput.value = '';
        if (thoughtTagInput) thoughtTagInput.value = '';
        if (thoughtPlanSelect) thoughtPlanSelect.value = '';
        setComposerThoughtColor('default');
        setThoughtPanelOpen(false);
        await Views.loadState();
        if (typeof Views.renderThoughts === 'function') await Views.renderThoughts();
      } catch (e) {
        alert('Error: ' + e.message);
      }
    };

    if (thoughtConfirmSaveBtn) {
      thoughtConfirmSaveBtn.addEventListener('click', () => saveComposerThought(false));
    }

    if (thoughtSkipTitleBtn) {
      thoughtSkipTitleBtn.addEventListener('click', () => saveComposerThought(true));
    }

    if (thoughtBodyInput) {
      thoughtBodyInput.addEventListener('keydown', (e) => {
        if ((e.ctrlKey || e.metaKey) && e.key === 'Enter') {
          e.preventDefault();
          if (thoughtPostWritePanel && thoughtPostWritePanel.style.display === 'none') {
            setThoughtPanelOpen(true);
            if (thoughtTitleInput) thoughtTitleInput.focus();
          } else {
            saveComposerThought(false);
          }
        }
      });
    }

    const thoughtsFilterGroup = document.getElementById('thoughts-filter-group');
    if (thoughtsFilterGroup) {
      thoughtsFilterGroup.querySelectorAll('.thought-filter-btn').forEach(btn => {
        btn.addEventListener('click', () => {
          thoughtsFilterGroup.querySelectorAll('.thought-filter-btn').forEach(b => b.classList.remove('active'));
          btn.classList.add('active');
          Views.currentThoughtFilter = btn.dataset.filter || 'all';
          if (typeof Views.renderThoughts === 'function') Views.renderThoughts();
        });
      });
    }

    const thoughtsPlanFilter = document.getElementById('thoughts-plan-filter');
    if (thoughtsPlanFilter) {
      thoughtsPlanFilter.addEventListener('change', (e) => {
        Views.currentThoughtPlanFilter = e.target.value || 'all';
        if (typeof Views.renderThoughts === 'function') Views.renderThoughts();
      });
    }

    const thoughtsSearchInput = document.getElementById('thoughts-search-input');
    if (thoughtsSearchInput) {
      thoughtsSearchInput.addEventListener('input', (e) => {
        Views.currentThoughtSearch = e.target.value || '';
        if (typeof Views.renderThoughts === 'function') Views.renderThoughts();
      });
    }

    const thoughtsExpandAllBtn = document.getElementById('thoughts-expand-all-btn');
    if (thoughtsExpandAllBtn) {
      thoughtsExpandAllBtn.addEventListener('click', () => {
        if (!(Views.expandedThoughtIds instanceof Set)) {
          Views.expandedThoughtIds = new Set();
        }
        const thoughts = (Views.state && Views.state.thoughts) || [];
        thoughts.forEach(t => {
          if (t && t.id) Views.expandedThoughtIds.add(t.id);
        });
        if (typeof Views.renderThoughts === 'function') Views.renderThoughts();
      });
    }

    const thoughtsCollapseAllBtn = document.getElementById('thoughts-collapse-all-btn');
    if (thoughtsCollapseAllBtn) {
      thoughtsCollapseAllBtn.addEventListener('click', () => {
        if (Views.expandedThoughtIds instanceof Set) {
          Views.expandedThoughtIds.clear();
        } else {
          Views.expandedThoughtIds = new Set();
        }
        if (typeof Views.renderThoughts === 'function') Views.renderThoughts();
      });
    }

    // Thought Edit Modal
    document.querySelectorAll('#thought-modal .thought-color-dot').forEach(dot => {
      dot.addEventListener('click', () => {
        document.querySelectorAll('#thought-modal .thought-color-dot').forEach(d => d.classList.remove('active'));
        dot.classList.add('active');
      });
    });

    const saveThoughtEditBtn = document.getElementById('save-thought-edit-btn');
    if (saveThoughtEditBtn) {
      saveThoughtEditBtn.addEventListener('click', async () => {
        const modal = document.getElementById('thought-modal');
        if (!modal) return;
        const thoughtId = modal.dataset.thoughtId;
        if (!thoughtId) return;

        const titleInput = document.getElementById('thought-edit-title');
        const bodyInput = document.getElementById('thought-edit-body');
        const tagInput = document.getElementById('thought-edit-tag');
        const planSelect = document.getElementById('thought-edit-plan');
        const activeDot = modal.querySelector('.thought-color-dot.active');

        const body = bodyInput ? bodyInput.value.trim() : '';
        if (!body) {
          alert('Please write a thought first');
          if (bodyInput) bodyInput.focus();
          return;
        }

        const title = titleInput ? titleInput.value.trim() : '';
        const tag = tagInput ? tagInput.value.trim() : '';
        const planId = (planSelect && planSelect.value) ? planSelect.value : null;
        const color = (activeDot && activeDot.dataset.color) || 'default';

        try {
          await API.updateThought(thoughtId, { title, body, tag, planId, color });
          modal.style.display = 'none';
          await Views.loadState();
          if (typeof Views.renderThoughts === 'function') await Views.renderThoughts();
        } catch (e) {
          alert('Error: ' + e.message);
        }
      });
    }

    const deleteThoughtEditBtn = document.getElementById('delete-thought-edit-btn');
    if (deleteThoughtEditBtn) {
      deleteThoughtEditBtn.addEventListener('click', async () => {
        const modal = document.getElementById('thought-modal');
        if (!modal) return;
        const thoughtId = modal.dataset.thoughtId;
        if (!thoughtId) return;
        if (!confirm('Delete this thought?')) return;

        try {
          await API.deleteThought(thoughtId);
          modal.style.display = 'none';
          if (Views.expandedThoughtIds instanceof Set) {
            Views.expandedThoughtIds.delete(thoughtId);
          }
          if (Views.spotlightThoughtId === thoughtId) {
            Views.spotlightThoughtId = null;
          }
          await Views.loadState();
          if (typeof Views.renderThoughts === 'function') await Views.renderThoughts();
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
    if (view === 'goals') view = 'plans';
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
      plans: 'Plans — Hobby Tracker',
      thoughts: 'Thoughts — Hobby Tracker',
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
    else if (view === 'plans') {
      if (typeof Views.renderPlans === 'function') Views.renderPlans();
      else if (typeof Views.renderGoals === 'function') Views.renderGoals();
    }
    else if (view === 'thoughts') {
      if (typeof Views.renderThoughts === 'function') Views.renderThoughts();
    }
    else if (view === 'diary') Views.renderDiary();
    else if (view === 'settings') Views.renderSettings();
  }
};

// Launch Auth
Auth.init();
