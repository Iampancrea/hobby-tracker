// Views module
const Views = {
  state: null,
  currentHabitDateOffset: 0,
  currentTaskDateOffset: 0,
  currentDiaryDate: new Date().toISOString().split('T')[0],
  _activeQuote: null,

  async loadState() {
    this.state = await API.getState();
    this.renderTopQuote();
  },

  renderTopQuote(forceRefresh = false) {
    const banner = document.getElementById('top-quote-banner');
    if (!banner) return;

    const quotes = (this.state && this.state.quotes) || [];
    if (!quotes.length) {
      banner.style.display = 'none';
      this._activeQuote = null;
      return;
    }

    // Retain current quote on routine view switching unless forced or deleted
    if (!forceRefresh && this._activeQuote && quotes.some(q => q.id === this._activeQuote.id)) {
      banner.style.display = 'block';
      return;
    }

    // Deterministic daily index with quote count modulo
    const todayStr = new Date().toISOString().split('T')[0];
    let hash = 0;
    for (let i = 0; i < todayStr.length; i++) {
      hash = ((hash << 5) - hash) + todayStr.charCodeAt(i);
    }
    const quoteIndex = Math.abs(hash) % quotes.length;
    const selectedQuote = quotes[quoteIndex] || quotes[0];
    this._activeQuote = selectedQuote;

    const quoteTextEl = document.getElementById('quote-text') || banner.querySelector('blockquote');
    const quoteAuthorEl = document.getElementById('quote-author') || banner.querySelector('cite');

    if (quoteTextEl) {
      const cleanText = (selectedQuote.text || '').trim().replace(/^["“]+|["”]+$/g, '');
      quoteTextEl.textContent = `"${cleanText}"`;
    }

    if (quoteAuthorEl) {
      const author = (selectedQuote.author || '').trim() || 'Unknown';
      quoteAuthorEl.textContent = `— ${author}`;
    }

    banner.style.display = 'block';
  },

  // Date helpers
  formatDateKey(d = new Date()) {
    if (typeof d === 'string') return d.split('T')[0];
    return d.toISOString().split('T')[0];
  },

  getDatesAround(offset = 0, pastDays = 28, futureDays = 1) {
    const dates = [];
    const now = new Date();
    const todayStr = this.formatDateKey(now);
    const [y, m, d] = todayStr.split('-').map(Number);
    const anchorUTC = Date.UTC(y, m - 1, d) + (offset * 86400000);

    for (let i = -pastDays; i <= futureDays; i++) {
      const dt = new Date(anchorUTC + (i * 86400000));
      dates.push(this.formatDateKey(dt));
    }
    return dates;
  },

  formatDate(dateStr) {
    const [y, m, d] = dateStr.split('-').map(Number);
    const date = new Date(Date.UTC(y, m - 1, d));
    const todayStr = this.formatDateKey(new Date());

    const days = ['Sun', 'Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat'];
    const months = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec'];

    const day = days[date.getUTCDay()];
    const month = months[date.getUTCMonth()];
    const dayNum = date.getUTCDate();

    return {
      day,
      month,
      dayNum,
      isToday: dateStr === todayStr
    };
  },

  // Habits view
  async renderHabits() {
    await this.loadState();
    const grid = document.getElementById('habit-grid');
    if (!grid) return;

    const showArchivedEl = document.getElementById('show-archived-habits');
    const showArchived = showArchivedEl ? showArchivedEl.checked : false;
    const habits = (this.state && this.state.habits) || [];
    const visibleHabits = showArchived ? habits : habits.filter(h => !h.archived);

    if (visibleHabits.length === 0) {
      grid.innerHTML = '<div class="empty-state"><p>No habits yet. Add one to get started!</p></div>';
      return;
    }

    const dates = this.getDatesAround(this.currentHabitDateOffset || 0, 28, 1);
    const todayStr = this.formatDateKey(new Date());

    let html = '<table class="calendar-table"><thead><tr>';
    html += '<td class="habit-header">Habit</td>';

    dates.forEach(date => {
      const { day, month, dayNum, isToday } = this.formatDate(date);
      const todayClass = isToday ? 'today-header' : '';
      html += `<th class="day-header ${todayClass}" data-date="${date}">${day}<br>${month} ${dayNum}</th>`;
    });
    html += '</tr></thead><tbody>';

    visibleHabits.forEach(habit => {
      const habitColor = habit.color || '#3fa34d';
      const streak = this.calculateStreak(habit.id);

      html += `<tr class="habit-row" data-habit-row="${habit.id}">`;
      html += `<td class="habit-label" data-habit="${habit.id}">
        <div class="habit-label-content">
          <span class="habit-icon" style="color: ${habitColor}">${habit.icon || '●'}</span>
          <span class="habit-name">${this.escapeHtml(habit.name)}</span>
          <span class="streak-badge">${streak}</span>
        </div>
      </td>`;

      dates.forEach(date => {
        const cellKey = `${habit.id}|${date}`;
        const cell = (this.state.cells && this.state.cells[cellKey]) || {};
        const status = cell.status || 'empty';
        const isFuture = date > todayStr;
        const isToday = date === todayStr;

        let statusIcon = '';
        let statusStyle = '';
        if (status === 'done') {
          statusIcon = '✓';
          statusStyle = `style="background-color: ${habitColor}; border-color: ${habitColor};"`;
        } else if (status === 'missed') {
          statusIcon = '✗';
        }

        const cellClasses = ['day-cell'];
        if (isFuture) cellClasses.push('disabled');
        if (isToday) cellClasses.push('today-cell');

        let noteBadgeHtml = '';
        if (cell.noteId) {
          const note = (this.state.notes || []).find(n => n.id === cell.noteId);
          const noteType = (note && note.type) || 'default';
          const tooltip = (note && note.text) ? `title="${this.escapeHtml(note.text)}"` : '';
          noteBadgeHtml = `<div class="cell-note-badge cell-note-indicator badge-${noteType}" data-note-type="${noteType}" ${tooltip}></div>`;
        }

        html += `<td class="${isToday ? 'today-cell' : ''} ${isFuture ? 'disabled' : ''}">
          <div class="${cellClasses.join(' ')}" data-habit="${habit.id}" data-habit-id="${habit.id}" data-date="${date}" ${isFuture ? 'disabled' : ''}>
            <div class="day-cell-content">
              <div class="cell-status ${status}" ${statusStyle}>${statusIcon}</div>
              ${noteBadgeHtml}
            </div>
          </div>
        </td>`;
      });

      html += '</tr>';
    });

    html += '</tbody></table>';
    grid.innerHTML = html;

    // Attach click and contextmenu handlers
    grid.querySelectorAll('.day-cell').forEach(cell => {
      cell.addEventListener('click', async (e) => {
        const habitId = cell.dataset.habit;
        const date = cell.dataset.date;
        const currentToday = Views.formatDateKey(new Date());

        // Strictly reject future dates
        if (cell.classList.contains('disabled') || date > currentToday) {
          return;
        }

        // Open note modal if note indicator clicked
        if (e.target.closest('.cell-note-indicator, .cell-note-badge, .note-badge')) {
          Views.openNoteModal(habitId, date);
          return;
        }

        // Direct status cycle: empty -> done -> missed -> empty
        const cellKey = `${habitId}|${date}`;
        const cellData = (Views.state.cells && Views.state.cells[cellKey]) || {};
        const currentStatus = cellData.status || 'empty';

        let nextStatus = 'done';
        if (currentStatus === 'done') nextStatus = 'missed';
        else if (currentStatus === 'missed') nextStatus = 'empty';

        try {
          await API.updateCell(habitId, date, { status: nextStatus });
          await Views.loadState();
          await Views.renderHabits();
        } catch (err) {
          console.error('Error updating cell status:', err);
        }
      });

      cell.addEventListener('contextmenu', (e) => {
        e.preventDefault();
        const habitId = cell.dataset.habit;
        const date = cell.dataset.date;
        Views.openNoteModal(habitId, date);
      });
    });

    // Note badge direct click
    grid.querySelectorAll('.cell-note-badge, .cell-note-indicator').forEach(badge => {
      badge.addEventListener('click', (e) => {
        e.stopPropagation();
        const cell = badge.closest('.day-cell');
        if (!cell) return;
        const habitId = cell.dataset.habit;
        const date = cell.dataset.date;
        Views.openNoteModal(habitId, date);
      });
    });

    // Habit label click to open edit modal
    grid.querySelectorAll('.habit-label').forEach(label => {
      label.addEventListener('click', () => {
        const habitId = label.dataset.habit;
        if (habitId) Views.openHabitModal(habitId);
      });
    });
  },

  calculateStreak(habitId) {
    let streak = 0;
    const now = new Date();
    const todayStr = this.formatDateKey(now);
    const [y, m, d] = todayStr.split('-').map(Number);
    const todayUTC = Date.UTC(y, m - 1, d);

    for (let i = 0; i < 365; i++) {
      const dt = new Date(todayUTC - (i * 86400000));
      const dateStr = this.formatDateKey(dt);
      const cellKey = `${habitId}|${dateStr}`;
      const cell = this.state && this.state.cells && this.state.cells[cellKey];

      if (cell && cell.status === 'done') {
        streak++;
      } else if (cell && cell.status === 'missed') {
        break;
      } else if (i > 0) {
        break;
      }
    }

    return streak;
  },

  openCellMenu(habitId, date) {
    this.openNoteModal(habitId, date);
  },

  openNoteModal(habitId, date) {
    const cellKey = `${habitId}|${date}`;
    const cell = (this.state && this.state.cells && this.state.cells[cellKey]) || {};
    const note = cell.noteId ? (this.state.notes || []).find(n => n.id === cell.noteId) : null;

    const modal = document.getElementById('note-modal');
    if (!modal) return;
    const content = modal.querySelector('.note-modal-content');
    const title = document.getElementById('note-modal-title');
    const textArea = document.getElementById('note-text');
    const deleteBtn = document.getElementById('delete-note-btn');

    if (title) title.textContent = note ? 'Edit Note' : 'Add Note';
    if (textArea) textArea.value = note ? (note.text || '') : '';
    if (deleteBtn) deleteBtn.style.display = note ? 'inline-flex' : 'none';

    const type = note ? (note.type || 'default') : 'default';
    modal.querySelectorAll('.note-type-btn').forEach(btn => {
      btn.classList.toggle('active', btn.dataset.type === type);
    });

    if (content) {
      content.className = 'modal-content note-modal-content';
      if (type === 'love') content.classList.add('note-type-love');
      else if (type === 'discipline') content.classList.add('note-type-discipline');
    }

    modal.style.display = 'flex';
    modal.dataset.habitId = habitId;
    modal.dataset.date = date;
    modal.dataset.noteId = note ? note.id : '';
  },

  openHabitModal(habitId = null) {
    const modal = document.getElementById('habit-modal');
    const title = document.getElementById('habit-modal-title');
    const nameInput = document.getElementById('habit-name');
    const iconInput = document.getElementById('habit-icon');
    const colorInput = document.getElementById('habit-color');
    const archiveBtn = document.getElementById('archive-habit-btn');
    const deleteBtn = document.getElementById('delete-habit-btn');

    if (habitId) {
      const habit = this.state.habits.find(h => h.id === habitId);
      if (!habit) return;

      title.textContent = 'Edit Habit';
      nameInput.value = habit.name;
      iconInput.value = habit.icon;
      colorInput.value = habit.color || '#3fa34d';
      archiveBtn.style.display = 'inline-flex';
      archiveBtn.textContent = habit.archived ? 'Unarchive' : 'Archive';
      deleteBtn.style.display = 'inline-flex';
      modal.dataset.habitId = habitId;
    } else {
      title.textContent = 'Add Habit';
      nameInput.value = '';
      iconInput.value = '●';
      colorInput.value = '#3fa34d';
      archiveBtn.style.display = 'none';
      deleteBtn.style.display = 'none';
      modal.dataset.habitId = '';
    }

    modal.style.display = 'flex';
  },

  // Tasks view
  async renderTasks() {
    const grid = document.getElementById('task-grid');
    const showArchived = document.getElementById('show-archived-tasks').checked;
    const tasks = showArchived ? this.state.tasks : this.state.tasks.filter(t => !t.archived);
    
    if (tasks.length === 0) {
      grid.innerHTML = '<div class="empty-state"><p>No tasks yet. Add one to get started!</p></div>';
      return;
    }

    const dates = this.getDatesAround(this.currentTaskDateOffset);
    const today = new Date().toISOString().split('T')[0];

    let html = '<table class="calendar-table"><thead><tr>';
    html += '<th class="habit-header">Task</th>';
    
    dates.forEach(date => {
      const { day, month, dayNum, isToday } = this.formatDate(date);
      const todayClass = isToday ? 'today-header' : '';
      html += `<th class="${todayClass}">${day}<br>${month} ${dayNum}</th>`;
    });
    html += '</tr></thead><tbody>';

    tasks.forEach(task => {
      html += `<tr>`;
      
      // Task label
      html += `<td class="habit-label">
        <div class="habit-label-content">
          <span class="habit-icon">✓</span>
          <span class="habit-name">${this.escapeHtml(task.title)}</span>
        </div>
      </td>`;

      // Date cells
      dates.forEach(date => {
        const createdDate = task.createdAt;
        const dateBeforeCreation = date < createdDate;
        const isDone = task.doneDates && task.doneDates.includes(date);
        const isMissed = task.missedDates && task.missedDates.includes(date);
        const todayClass = date === today ? 'today-cell' : '';
        
        let status = 'empty';
        let statusIcon = '';
        
        if (dateBeforeCreation) {
          status = 'not-existed';
          statusIcon = '—';
        } else if (isDone) {
          status = 'done';
          statusIcon = '✓';
        } else if (isMissed) {
          status = 'missed';
          statusIcon = '✗';
        }

        html += `<td class="${todayClass}">
          <div class="day-cell" data-task="${task.id}" data-date="${date}" data-before="${dateBeforeCreation}">
            <div class="day-cell-content">
              <div class="cell-status ${status}" title="${dateBeforeCreation ? 'Task did not exist on this date' : ''}">${statusIcon}</div>
            </div>
          </div>
        </td>`;
      });

      html += '</tr>';
    });

    html += '</tbody></table>';
    grid.innerHTML = html;

    // Add click handlers
    grid.querySelectorAll('.day-cell').forEach(cell => {
      cell.addEventListener('click', (e) => {
        const taskId = cell.dataset.task;
        const date = cell.dataset.date;
        const beforeCreation = cell.dataset.before === 'true';
        if (beforeCreation) return; // Can't interact with cells before task creation
        this.openTaskCellMenu(taskId, date);
      });
    });
  },

  openTaskCellMenu(taskId, date) {
    const task = this.state.tasks.find(t => t.id === taskId);
    if (!task) return;

    const isDone = task.doneDates && task.doneDates.includes(date);
    const isMissed = task.missedDates && task.missedDates.includes(date);
    
    let newStatus = 'done';
    if (isDone) newStatus = 'missed';
    else if (isMissed) newStatus = null;

    const menu = document.createElement('div');
    menu.style.position = 'fixed';
    menu.style.background = 'white';
    menu.style.border = '1px solid #e0dfdc';
    menu.style.borderRadius = '6px';
    menu.style.boxShadow = '0 4px 12px rgba(0,0,0,0.15)';
    menu.style.padding = '8px';
    menu.style.zIndex = '999';
    
    const rect = event.target.getBoundingClientRect();
    menu.style.left = rect.right + 8 + 'px';
    menu.style.top = rect.top + 'px';
    
    menu.innerHTML = `
      <button class="menu-item" data-action="cycle" style="display:block;width:100%;padding:8px 12px;text-align:left;border:none;background:none;cursor:pointer;border-radius:4px;">
        ${newStatus === 'done' ? '✓ Mark Done' : newStatus === 'missed' ? '✗ Mark Missed' : '○ Clear'}
      </button>
      <button class="menu-item" data-action="edit" style="display:block;width:100%;padding:8px 12px;text-align:left;border:none;background:none;cursor:pointer;border-radius:4px;">Edit Task</button>
    `;
    
    document.body.appendChild(menu);
    
    const closeMenu = (e) => {
      if (!menu.contains(e.target)) {
        menu.remove();
        document.removeEventListener('click', closeMenu);
      }
    };
    
    setTimeout(() => {
      document.addEventListener('click', closeMenu);
    }, 0);
    
    menu.querySelectorAll('.menu-item').forEach(item => {
      item.addEventListener('mouseenter', () => {
        item.style.background = '#f0efec';
      });
      item.addEventListener('mouseleave', () => {
        item.style.background = 'none';
      });
    });
    
    menu.querySelector('[data-action="cycle"]').addEventListener('click', async () => {
      menu.remove();
      try {
        await API.markTask(taskId, date, newStatus);
        await this.loadState();
        this.renderTasks();
      } catch (e) {
        alert('Error: ' + e.message);
      }
    });
    
    menu.querySelector('[data-action="edit"]').addEventListener('click', () => {
      menu.remove();
      this.openTaskModal(taskId);
    });
  },

  openTaskModal(taskId = null) {
    const modal = document.getElementById('task-modal');
    const title = document.getElementById('task-modal-title');
    const titleInput = document.getElementById('task-title');
    const archiveBtn = document.getElementById('archive-task-btn');
    const deleteBtn = document.getElementById('delete-task-btn');
    
    if (taskId) {
      const task = this.state.tasks.find(t => t.id === taskId);
      if (!task) return;
      
      title.textContent = 'Edit Task';
      titleInput.value = task.title;
      archiveBtn.style.display = 'inline-flex';
      archiveBtn.textContent = task.archived ? 'Unarchive' : 'Archive';
      deleteBtn.style.display = 'inline-flex';
      modal.dataset.taskId = taskId;
    } else {
      title.textContent = 'Add Task';
      titleInput.value = '';
      archiveBtn.style.display = 'none';
      deleteBtn.style.display = 'none';
      modal.dataset.taskId = '';
    }
    
    modal.style.display = 'flex';
  },

  // Diary view
  async renderDiary() {
    const dateInput = document.getElementById('diary-date');
    dateInput.value = this.currentDiaryDate;
    
    try {
      const diary = await API.getDiary(this.currentDiaryDate);
      
      // Entry
      document.getElementById('diary-entry').value = diary.entry || '';
      
      // Tasks
      const tasksList = document.getElementById('diary-tasks');
      if (diary.tasks && diary.tasks.length > 0) {
        let html = '';
        diary.tasks.forEach((task, idx) => {
          html += `
            <div class="diary-task-item">
              <input type="checkbox" class="diary-task-checkbox" data-idx="${idx}" ${task.status === 'done' ? 'checked' : ''}>
              <span class="diary-task-text ${task.status}">${this.escapeHtml(task.title)}</span>
              <button class="diary-task-delete" data-idx="${idx}">×</button>
            </div>
          `;
        });
        tasksList.innerHTML = html;
        
        // Add handlers
        tasksList.querySelectorAll('.diary-task-checkbox').forEach(cb => {
          cb.addEventListener('change', async () => {
            const idx = parseInt(cb.dataset.idx);
            diary.tasks[idx].status = cb.checked ? 'done' : 'pending';
            await API.saveDiary(this.currentDiaryDate, diary);
          });
        });
        
        tasksList.querySelectorAll('.diary-task-delete').forEach(btn => {
          btn.addEventListener('click', async () => {
            const idx = parseInt(btn.dataset.idx);
            diary.tasks.splice(idx, 1);
            await API.saveDiary(this.currentDiaryDate, diary);
            this.renderDiary();
          });
        });
      } else {
        tasksList.innerHTML = '<div class="empty-state"><p>No tasks for today. Add one below.</p></div>';
      }
      
      // Mood
      document.querySelectorAll('.mood-btn').forEach(btn => {
        btn.classList.toggle('active', btn.dataset.mood === diary.mood);
      });
    } catch (e) {
      console.error('Error loading diary:', e);
    }
  },

  // Settings view
  async renderSettings() {
    // 1. Sync configuration
    try {
      const syncConfig = await Storage.getSyncConfig();
      const tokenInput = document.getElementById('sync-github-token');
      const gistInput = document.getElementById('sync-gist-id');
      const autoSyncToggle = document.getElementById('sync-auto-toggle');
      const syncMsg = document.getElementById('sync-settings-msg');

      if (tokenInput) tokenInput.value = syncConfig.token || '';
      if (gistInput) gistInput.value = syncConfig.gistId || '';
      if (autoSyncToggle) autoSyncToggle.checked = syncConfig.autoSync !== false;

      if (syncMsg) {
        if (syncConfig.lastSyncedAt) {
          const timeAgo = new Date(syncConfig.lastSyncedAt).toLocaleString();
          syncMsg.innerHTML = `<span style="color:var(--primary);">✓ Last Synced: ${timeAgo}</span>`;
          syncMsg.style.display = 'block';
        } else {
          syncMsg.style.display = 'none';
        }
      }

      // 2. PIN status
      const auth = await Storage.checkSetup();
      const removePinBtn = document.getElementById('remove-pin-btn');
      if (removePinBtn) {
        removePinBtn.style.display = auth.hasPin ? 'inline-flex' : 'none';
      }
    } catch (e) {
      console.warn('Settings render error:', e);
    }

    // 3. Quotes
    const quotesList = document.getElementById('quotes-list');
    const quotes = this.state.quotes || [];
    
    if (quotes.length > 0) {
      let html = '';
      quotes.forEach(quote => {
        html += `
          <div class="quote-item">
            <div class="quote-item-content">
              <div class="quote-item-text">${this.escapeHtml(quote.text)}</div>
              <div class="quote-item-author">— ${this.escapeHtml(quote.author || 'Unknown')}</div>
            </div>
            ${quote.custom ? `<button class="quote-item-delete" data-id="${quote.id}">×</button>` : ''}
          </div>
        `;
      });
      quotesList.innerHTML = html;
      
      quotesList.querySelectorAll('.quote-item-delete').forEach(btn => {
        btn.addEventListener('click', async () => {
          if (confirm('Delete this quote?')) {
            await API.deleteQuote(btn.dataset.id);
            await this.loadState();
            this.renderSettings();
            this.renderTopQuote(true);
          }
        });
      });
    } else {
      quotesList.innerHTML = '<p style="color:#787774;">No quotes yet.</p>';
    }
  },

  escapeHtml(text) {
    if (text === null || text === undefined) return '';
    return String(text)
      .replace(/&/g, '&amp;')
      .replace(/</g, '&lt;')
      .replace(/>/g, '&gt;')
      .replace(/"/g, '&quot;')
      .replace(/'/g, '&#039;');
  }
};
