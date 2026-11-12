// Views module
const Views = {
  state: null,
  currentHabitDateOffset: 0,
  currentTaskDateOffset: 0,
  currentDiaryDate: new Date().toISOString().split('T')[0],

  async loadState() {
    this.state = await API.getState();
  },

  // Date helpers
  getDatesAround(offset = 0, pastDays = 7, futureDays = 3) {
    const dates = [];
    const today = new Date();
    today.setDate(today.getDate() + offset);
    
    for (let i = -pastDays; i <= futureDays; i++) {
      const date = new Date(today);
      date.setDate(today.getDate() + i);
      dates.push(date.toISOString().split('T')[0]);
    }
    return dates;
  },

  formatDate(dateStr) {
    const date = new Date(dateStr + 'T00:00:00');
    const today = new Date();
    today.setHours(0, 0, 0, 0);
    
    const days = ['Sun', 'Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat'];
    const months = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec'];
    
    const day = days[date.getDay()];
    const month = months[date.getMonth()];
    const dayNum = date.getDate();
    
    if (date.getTime() === today.getTime()) {
      return { day, month, dayNum, isToday: true };
    }
    return { day, month, dayNum, isToday: false };
  },

  // Habits view
  async renderHabits() {
    const grid = document.getElementById('habit-grid');
    const showArchived = document.getElementById('show-archived-habits').checked;
    const habits = showArchived ? this.state.habits : this.state.habits.filter(h => !h.archived);
    
    if (habits.length === 0) {
      grid.innerHTML = '<div class="empty-state"><p>No habits yet. Add one to get started!</p></div>';
      return;
    }

    const dates = this.getDatesAround(this.currentHabitDateOffset);
    const today = new Date().toISOString().split('T')[0];

    let html = '<table class="calendar-table"><thead><tr>';
    html += '<th class="habit-header">Habit</th>';
    
    dates.forEach(date => {
      const { day, month, dayNum, isToday } = this.formatDate(date);
      const todayClass = isToday ? 'today-header' : '';
      html += `<th class="${todayClass}">${day}<br>${month} ${dayNum}</th>`;
    });
    html += '</tr></thead><tbody>';

    habits.forEach(habit => {
      html += `<tr>`;
      
      // Habit label
      const streak = this.calculateStreak(habit.id);
      html += `<td class="habit-label">
        <div class="habit-label-content">
          <span class="habit-icon">${habit.icon}</span>
          <span class="habit-name">${this.escapeHtml(habit.name)}</span>
          ${streak > 0 ? `<span class="streak-badge">${streak}</span>` : ''}
        </div>
      </td>`;

      // Date cells
      dates.forEach(date => {
        const cellKey = `${habit.id}|${date}`;
        const cell = this.state.cells[cellKey] || {};
        const status = cell.status || 'empty';
        const hasNote = !!cell.noteId;
        const todayClass = date === today ? 'today-cell' : '';
        
        let statusIcon = '';
        if (status === 'done') statusIcon = '✓';
        else if (status === 'missed') statusIcon = '✗';
        else if (status === 'empty') statusIcon = '';

        html += `<td class="${todayClass}">
          <div class="day-cell" data-habit="${habit.id}" data-date="${date}">
            <div class="day-cell-content">
              <div class="cell-status ${status}">${statusIcon}</div>
              ${hasNote ? '<div class="cell-note-indicator"></div>' : ''}
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
        const habitId = cell.dataset.habit;
        const date = cell.dataset.date;
        this.openCellMenu(habitId, date);
      });
    });
  },

  calculateStreak(habitId) {
    let streak = 0;
    const today = new Date();
    
    for (let i = 0; i < 365; i++) {
      const date = new Date(today);
      date.setDate(today.getDate() - i);
      const dateStr = date.toISOString().split('T')[0];
      const cellKey = `${habitId}|${dateStr}`;
      const cell = this.state.cells[cellKey];
      
      if (cell && cell.status === 'done') {
        streak++;
      } else if (cell && cell.status === 'missed') {
        break;
      } else if (i > 0) {
        // If no data and not today, streak might still be going
        // But if we hit a gap, break
        break;
      }
    }
    
    return streak;
  },

  openCellMenu(habitId, date) {
    const cellKey = `${habitId}|${date}`;
    const cell = this.state.cells[cellKey] || {};
    const status = cell.status || 'empty';
    
    // Cycle through statuses
    let newStatus = 'done';
    if (status === 'done') newStatus = 'missed';
    else if (status === 'missed') newStatus = 'empty';
    
    // Check for long press or right click for notes
    // For simplicity, we'll add a notes button
    const habit = this.state.habits.find(h => h.id === habitId);
    if (!habit) return;

    // Show a simple menu
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
      ${cell.noteId ? '<button class="menu-item" data-action="view-note" style="display:block;width:100%;padding:8px 12px;text-align:left;border:none;background:none;cursor:pointer;border-radius:4px;">View Note</button>' : '<button class="menu-item" data-action="add-note" style="display:block;width:100%;padding:8px 12px;text-align:left;border:none;background:none;cursor:pointer;border-radius:4px;">Add Note</button>'}
      <button class="menu-item" data-action="edit" style="display:block;width:100%;padding:8px 12px;text-align:left;border:none;background:none;cursor:pointer;border-radius:4px;">Edit Habit</button>
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
        await API.updateCell(habitId, date, { status: newStatus });
        await this.loadState();
        this.renderHabits();
      } catch (e) {
        alert('Error: ' + e.message);
      }
    });
    
    menu.querySelector('[data-action="add-note"], [data-action="view-note"]').addEventListener('click', () => {
      menu.remove();
      this.openNoteModal(habitId, date);
    });
    
    menu.querySelector('[data-action="edit"]').addEventListener('click', () => {
      menu.remove();
      this.openHabitModal(habitId);
    });
  },

  openNoteModal(habitId, date) {
    const cellKey = `${habitId}|${date}`;
    const cell = this.state.cells[cellKey] || {};
    const note = cell.noteId ? this.state.notes.find(n => n.id === cell.noteId) : null;
    
    const modal = document.getElementById('note-modal');
    const content = modal.querySelector('.note-modal-content');
    const title = document.getElementById('note-modal-title');
    const textArea = document.getElementById('note-text');
    const deleteBtn = document.getElementById('delete-note-btn');
    
    title.textContent = note ? 'Edit Note' : 'Add Note';
    textArea.value = note ? note.text : '';
    deleteBtn.style.display = note ? 'inline-flex' : 'none';
    
    // Set note type
    const type = note ? note.type : 'default';
    modal.querySelectorAll('.note-type-btn').forEach(btn => {
      btn.classList.toggle('active', btn.dataset.type === type);
    });
    
    // Apply styling
    content.className = 'modal-content note-modal-content';
    if (type === 'love') content.classList.add('note-type-love');
    else if (type === 'discipline') content.classList.add('note-type-discipline');
    
    modal.style.display = 'flex';
    modal.dataset.habitId = habitId;
    modal.dataset.date = date;
    modal.dataset.noteId = note ? note.id : '';
    
    // Note type handlers
    modal.querySelectorAll('.note-type-btn').forEach(btn => {
      btn.onclick = () => {
        modal.querySelectorAll('.note-type-btn').forEach(b => b.classList.remove('active'));
        btn.classList.add('active');
        
        content.className = 'modal-content note-modal-content';
        if (btn.dataset.type === 'love') content.classList.add('note-type-love');
        else if (btn.dataset.type === 'discipline') content.classList.add('note-type-discipline');
      };
    });
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
      colorInput.value = habit.color;
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
          }
        });
      });
    } else {
      quotesList.innerHTML = '<p style="color:#787774;">No quotes yet.</p>';
    }
  },

  escapeHtml(text) {
    const div = document.createElement('div');
    div.textContent = text;
    return div.innerHTML;
  }
};
