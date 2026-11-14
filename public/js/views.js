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
    html += '<th class="habit-header">Habit</th>';

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
          <button type="button" class="habit-delete-row-btn" data-habit-id="${habit.id}" title="Delete Habit">🗑️</button>
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

    // Auto-scroll grid to today (Nov 14) so today's date is centered in view
    setTimeout(() => {
      const todayEl = grid.querySelector('.today-cell') || grid.querySelector('.today-header');
      const container = document.querySelector('.habit-grid-container');
      if (todayEl && container) {
        if (typeof todayEl.scrollIntoView === 'function') {
          todayEl.scrollIntoView({ behavior: 'auto', block: 'nearest', inline: 'center' });
        }
        const cellRect = todayEl.getBoundingClientRect ? todayEl.getBoundingClientRect() : null;
        const contRect = container.getBoundingClientRect ? container.getBoundingClientRect() : null;
        if (cellRect && contRect && container.clientWidth) {
          container.scrollLeft += (cellRect.left - contRect.left) - (container.clientWidth / 2) + (cellRect.width / 2);
        } else if (todayEl.offsetLeft !== undefined) {
          const offsetLeft = todayEl.offsetLeft;
          const containerWidth = container.clientWidth || 800;
          container.scrollLeft = Math.max(0, offsetLeft - (containerWidth / 2) + 60);
        }
      }
    }, 50);

    // Wire Draggable Note Tray
    document.querySelectorAll('.note-tray-pill').forEach(pill => {
      pill.ondragstart = (e) => {
        if (e.dataTransfer) {
          e.dataTransfer.setData('text/plain', pill.dataset.noteType);
        }
      };
      pill.onclick = () => {
        const wasActive = pill.classList.contains('active-stamp');
        document.querySelectorAll('.note-tray-pill').forEach(p => p.classList.remove('active-stamp'));
        if (!wasActive) pill.classList.add('active-stamp');
      };
    });

    // Attach click and contextmenu handlers
    grid.querySelectorAll('.day-cell').forEach(cell => {
      // Drag & Drop Note acceptance
      cell.ondragover = (e) => {
        if (cell.classList.contains('disabled')) return;
        e.preventDefault();
        cell.classList.add('cell-drop-target');
      };

      cell.ondragleave = () => {
        cell.classList.remove('cell-drop-target');
      };

      cell.ondrop = (e) => {
        e.preventDefault();
        cell.classList.remove('cell-drop-target');
        if (cell.classList.contains('disabled')) return;
        const noteType = (e.dataTransfer && e.dataTransfer.getData('text/plain')) || 'default';
        const habitId = cell.dataset.habit;
        const date = cell.dataset.date;
        Views.openNoteModal(habitId, date, noteType);
      };

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

        // If a note tray badge is active in stamp mode, open note with that type
        const activeStamp = document.querySelector('.note-tray-pill.active-stamp');
        if (activeStamp) {
          Views.openNoteModal(habitId, date, activeStamp.dataset.noteType);
          activeStamp.classList.remove('active-stamp');
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

      // Right-click directly toggles Missed (Cross Mark ✗)
      cell.addEventListener('contextmenu', async (e) => {
        e.preventDefault();
        const habitId = cell.dataset.habit;
        const date = cell.dataset.date;
        const currentToday = Views.formatDateKey(new Date());
        if (cell.classList.contains('disabled') || date > currentToday) return;

        const cellKey = `${habitId}|${date}`;
        const cellData = (Views.state.cells && Views.state.cells[cellKey]) || {};
        const currentStatus = cellData.status || 'empty';
        const nextStatus = currentStatus === 'missed' ? 'empty' : 'missed';

        try {
          await API.updateCell(habitId, date, { status: nextStatus });
          await Views.loadState();
          await Views.renderHabits();
        } catch (err) {
          console.error('Error toggling cross mark:', err);
        }
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

    // Habit row direct delete button
    grid.querySelectorAll('.habit-delete-row-btn').forEach(btn => {
      btn.addEventListener('click', async (e) => {
        e.stopPropagation();
        const habitId = btn.dataset.habitId;
        const habit = (Views.state.habits || []).find(h => h.id === habitId);
        const habitName = habit ? habit.name : 'this habit';
        if (confirm(`Delete habit "${habitName}" and all its history?`)) {
          await API.deleteHabit(habitId);
          await Views.loadState();
          Views.renderHabits();
        }
      });
    });

    // Habit label click to open edit modal
    grid.querySelectorAll('.habit-label').forEach(label => {
      label.addEventListener('click', (e) => {
        if (e.target.closest('.habit-delete-row-btn')) return;
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

  openNoteModal(habitId, date, selectedType = null) {
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

    const type = selectedType || (note ? (note.type || 'default') : 'default');
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

  currentTaskFilter: 'all', // 'all' | 'active' | 'completed'

  // Tasks view (Dedicated Checklist)
  async renderTasks() {
    const container = document.getElementById('tasks-checklist') || document.getElementById('task-grid');
    if (!container) return;

    await this.loadState();
    const showArchived = document.getElementById('show-archived-tasks')?.checked || false;
    let tasks = (this.state && this.state.tasks) ? [...this.state.tasks] : [];
    if (!showArchived) {
      tasks = tasks.filter(t => !t.archived);
    }

    if (this.currentTaskFilter === 'active') {
      tasks = tasks.filter(t => t.status !== 'done');
    } else if (this.currentTaskFilter === 'completed') {
      tasks = tasks.filter(t => t.status === 'done');
    }

    // Update filter buttons visual state
    document.querySelectorAll('.task-filter-btn').forEach(btn => {
      btn.classList.toggle('active', btn.dataset.filter === this.currentTaskFilter);
      btn.onclick = () => {
        this.currentTaskFilter = btn.dataset.filter;
        this.renderTasks();
      };
    });

    if (tasks.length === 0) {
      container.innerHTML = `
        <div id="tasks-empty-state" class="empty-state">
          <p>${this.currentTaskFilter === 'completed' ? 'No completed tasks yet.' : this.currentTaskFilter === 'active' ? 'No active tasks!' : 'No tasks yet. Add one above!'}</p>
        </div>
      `;
      return;
    }

    let html = '';
    tasks.forEach(task => {
      const isDone = task.status === 'done';
      html += `
        <div class="task-item ${isDone ? 'done' : ''}" data-task-id="${task.id}" data-task-status="${task.status || 'pending'}">
          <div class="task-item-left">
            <input type="checkbox" class="task-checkbox" data-task-id="${task.id}" ${isDone ? 'checked' : ''}>
            <span class="task-title ${isDone ? 'completed' : ''}">${this.escapeHtml(task.title)}</span>
          </div>
          <div class="task-item-actions">
            <button type="button" class="task-archive-btn" data-task-id="${task.id}" title="${task.archived ? 'Unarchive' : 'Archive'}">
              ${task.archived ? '📂' : '📦'}
            </button>
            <button type="button" class="task-delete-btn" data-task-id="${task.id}" title="Delete">×</button>
          </div>
        </div>
      `;
    });
    container.innerHTML = html;

    // Attach checkbox handlers
    container.querySelectorAll('.task-checkbox').forEach(cb => {
      const onToggle = async () => {
        const taskId = cb.dataset.taskId;
        const newStatus = cb.checked ? 'done' : 'pending';
        const task = (this.state.tasks || []).find(t => t.id === taskId);
        if (task) task.status = newStatus;
        await API.updateTask(taskId, { status: newStatus });
        await this.loadState();
        this.renderTasks();
      };
      cb.addEventListener('change', onToggle);
    });

    // Attach delete handlers
    container.querySelectorAll('.task-delete-btn').forEach(btn => {
      btn.addEventListener('click', async () => {
        const taskId = btn.dataset.taskId;
        await API.deleteTask(taskId);
        await this.loadState();
        this.renderTasks();
      });
    });

    // Attach archive handlers
    container.querySelectorAll('.task-archive-btn').forEach(btn => {
      btn.addEventListener('click', async () => {
        const taskId = btn.dataset.taskId;
        const task = (this.state.tasks || []).find(t => t.id === taskId);
        if (task) {
          await API.updateTask(taskId, { archived: !task.archived });
          await this.loadState();
          this.renderTasks();
        }
      });
    });
  },

  openTaskModal(taskId = null) {
    const modal = document.getElementById('task-modal');
    if (!modal) return;
    const title = document.getElementById('task-modal-title');
    const titleInput = document.getElementById('task-title');
    const archiveBtn = document.getElementById('archive-task-btn');
    const deleteBtn = document.getElementById('delete-task-btn');
    
    if (taskId) {
      const task = (this.state.tasks || []).find(t => t.id === taskId);
      if (!task) return;
      
      if (title) title.textContent = 'Edit Task';
      if (titleInput) titleInput.value = task.title;
      if (archiveBtn) {
        archiveBtn.style.display = 'inline-flex';
        archiveBtn.textContent = task.archived ? 'Unarchive' : 'Archive';
      }
      if (deleteBtn) deleteBtn.style.display = 'inline-flex';
      modal.dataset.taskId = taskId;
    } else {
      if (title) title.textContent = 'Add Task';
      if (titleInput) titleInput.value = '';
      if (archiveBtn) archiveBtn.style.display = 'none';
      if (deleteBtn) deleteBtn.style.display = 'none';
      modal.dataset.taskId = '';
    }
    
    modal.style.display = 'flex';
  },

  // Diary Calendar Sidebar Navigation
  renderDiaryCalendarSidebar() {
    const sidebar = document.getElementById('diary-sidebar-calendar') || document.querySelector('.diary-sidebar');
    if (!sidebar) return;

    const dateParts = this.currentDiaryDate.split('-');
    const currentYear = parseInt(dateParts[0], 10);
    const currentMonth = parseInt(dateParts[1], 10) - 1; // 0-indexed

    if (this.diaryNavYear === undefined) this.diaryNavYear = currentYear;
    if (this.diaryNavMonth === undefined) this.diaryNavMonth = currentMonth;

    const monthSelect = document.getElementById('diary-month-select');
    const yearSelect = document.getElementById('diary-year-select');
    const monthNames = ['January', 'February', 'March', 'April', 'May', 'June', 'July', 'August', 'September', 'October', 'November', 'December'];

    const getOptionsCount = (el) => {
      if (!el) return 0;
      if (el.options && typeof el.options.length === 'number') return el.options.length;
      if (el.children && typeof el.children.length === 'number') return el.children.length;
      return (el.querySelectorAll ? el.querySelectorAll('option').length : 0);
    };

    if (monthSelect && getOptionsCount(monthSelect) === 0) {
      monthNames.forEach((name, idx) => {
        const opt = document.createElement('option');
        opt.value = idx;
        opt.textContent = name;
        monthSelect.appendChild(opt);
      });
      monthSelect.onchange = () => {
        this.diaryNavMonth = parseInt(monthSelect.value, 10);
        this.renderDiaryMiniCalendar();
      };
    }

    if (yearSelect && getOptionsCount(yearSelect) === 0) {
      for (let y = 2015; y <= 2035; y++) {
        const opt = document.createElement('option');
        opt.value = y;
        opt.textContent = y;
        yearSelect.appendChild(opt);
      }
      yearSelect.onchange = () => {
        this.diaryNavYear = parseInt(yearSelect.value, 10);
        this.renderDiaryMiniCalendar();
      };
    }

    if (monthSelect) monthSelect.value = this.diaryNavMonth;
    if (yearSelect) yearSelect.value = this.diaryNavYear;

    // Previous / Next Month button wiring
    const prevMonthBtn = document.getElementById('diary-prev-month');
    if (prevMonthBtn) {
      prevMonthBtn.onclick = () => {
        this.diaryNavMonth--;
        if (this.diaryNavMonth < 0) {
          this.diaryNavMonth = 11;
          this.diaryNavYear--;
        }
        if (monthSelect) monthSelect.value = this.diaryNavMonth;
        if (yearSelect) yearSelect.value = this.diaryNavYear;
        this.renderDiaryMiniCalendar();
      };
    }

    const nextMonthBtn = document.getElementById('diary-next-month');
    if (nextMonthBtn) {
      nextMonthBtn.onclick = () => {
        this.diaryNavMonth++;
        if (this.diaryNavMonth > 11) {
          this.diaryNavMonth = 0;
          this.diaryNavYear++;
        }
        if (monthSelect) monthSelect.value = this.diaryNavMonth;
        if (yearSelect) yearSelect.value = this.diaryNavYear;
        this.renderDiaryMiniCalendar();
      };
    }

    const todayBtn = document.getElementById('diary-jump-today-btn');
    if (todayBtn) {
      todayBtn.onclick = () => {
        const todayStr = new Date().toISOString().split('T')[0];
        this.currentDiaryDate = todayStr;
        const parts = todayStr.split('-');
        this.diaryNavYear = parseInt(parts[0], 10);
        this.diaryNavMonth = parseInt(parts[1], 10) - 1;
        this.renderDiary();
      };
    }

    this.renderDiaryMiniCalendar();
  },

  renderDiaryMiniCalendar() {
    const miniCalendar = document.getElementById('diary-mini-calendar');
    if (!miniCalendar) return;

    const y = this.diaryNavYear;
    const m = this.diaryNavMonth;
    const firstDay = new Date(y, m, 1).getDay();
    const daysInMonth = new Date(y, m + 1, 0).getDate();
    const todayStr = new Date().toISOString().split('T')[0];

    let html = '<div class="mini-cal-weekdays">';
    ['Su', 'Mo', 'Tu', 'We', 'Th', 'Fr', 'Sa'].forEach(d => {
      html += `<span class="mini-cal-day-name">${d}</span>`;
    });
    html += '</div><div class="mini-cal-days">';

    // Empty spaces before first day of month
    for (let i = 0; i < firstDay; i++) {
      html += '<span class="mini-cal-day empty"></span>';
    }

    // Days of month
    for (let d = 1; d <= daysInMonth; d++) {
      const dayStr = String(d).padStart(2, '0');
      const monthStr = String(m + 1).padStart(2, '0');
      const dateStr = `${y}-${monthStr}-${dayStr}`;
      const isSelected = dateStr === this.currentDiaryDate;
      const isToday = dateStr === todayStr;
      const diaryData = this.state && this.state.diary && this.state.diary[dateStr];
      const hasEntry = !!(diaryData && (diaryData.entry || diaryData.mood || (diaryData.tasks && diaryData.tasks.length > 0)));

      let cls = 'mini-cal-day';
      if (isSelected) cls += ' selected';
      if (isToday) cls += ' today';
      if (hasEntry) cls += ' has-entry';

      html += `<button type="button" class="${cls}" data-date="${dateStr}">${d}</button>`;
    }

    html += '</div>';
    miniCalendar.innerHTML = html;

    // Attach click handlers to days
    miniCalendar.querySelectorAll('.mini-cal-day[data-date]').forEach(btn => {
      btn.addEventListener('click', () => {
        this.currentDiaryDate = btn.dataset.date;
        this.renderDiary();
      });
    });
  },

  // Diary view
  async renderDiary() {
    const dateInput = document.getElementById('diary-date');
    if (dateInput) dateInput.value = this.currentDiaryDate;

    if (this.currentDiaryDate) {
      const dateParts = this.currentDiaryDate.split('-');
      this.diaryNavYear = parseInt(dateParts[0], 10);
      this.diaryNavMonth = parseInt(dateParts[1], 10) - 1;

      // Update readable Book Heading
      const [y, m, d] = dateParts.map(Number);
      const dt = new Date(Date.UTC(y, m - 1, d));
      const fullDays = ['Sunday', 'Monday', 'Tuesday', 'Wednesday', 'Thursday', 'Friday', 'Saturday'];
      const fullMonths = ['January', 'February', 'March', 'April', 'May', 'June', 'July', 'August', 'September', 'October', 'November', 'December'];
      const dateTitleEl = document.getElementById('diary-page-date-display');
      const dayNameEl = document.getElementById('diary-page-day-name');
      if (dateTitleEl) {
        dateTitleEl.textContent = `${fullDays[dt.getUTCDay()]}, ${fullMonths[dt.getUTCMonth()]} ${dt.getUTCDate()}, ${dt.getUTCFullYear()}`;
      }
      if (dayNameEl) {
        const isToday = this.currentDiaryDate === this.formatDateKey(new Date());
        dayNameEl.textContent = isToday ? '★ Today\'s Journal Page' : 'Historical Journal Page';
      }
    }
    this.renderDiaryCalendarSidebar();
    
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
    try {
      if (!this.state && Storage.isUnlocked()) {
        await this.loadState();
      }
    } catch (_) {}
    const quotesList = document.getElementById('quotes-list');
    const quotes = (this.state && this.state.quotes) || [];
    
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
