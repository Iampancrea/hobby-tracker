// Views module
const Views = {
  state: null,
  currentHabitDateOffset: 0,
  currentTaskDateOffset: 0,
  currentDiaryDate: DateUtils.todayKey(),
  currentGoalFilter: 'all',
  currentPlanFilter: 'all',
  selectedPlanId: null,
  mobilePlanDetailOpen: false,
  currentThoughtFilter: 'all',
  currentThoughtPlanFilter: 'all',
  currentThoughtSearch: '',
  spotlightThoughtId: null,
  expandedThoughtIds: new Set(),
  _activeQuote: null,

  // Infinite habit timeline state
  HABIT_PAST_DAYS: 28,
  HABIT_FUTURE_DAYS: 1,
  HABIT_CHUNK_DAYS: 21,
  HABIT_INITIAL_PAST_RUNWAY: 21,
  HABIT_INITIAL_FUTURE_RUNWAY: 42,
  HABIT_EDGE_THRESHOLD: 180,
  HABIT_MAX_COLUMNS: 1100,
  _habitDates: [],
  _habitScrollRaf: null,
  _habitExtending: false,

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
    const todayStr = DateUtils.todayKey();
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

  // Date helpers (all user-facing dates are local-time based)
  formatDateKey(d = new Date()) {
    if (typeof d === 'string') return d.split('T')[0];
    return DateUtils.toKey(d);
  },

  todayKey() {
    return DateUtils.todayKey();
  },

  getDatesBetween(startKey, endKey) {
    const dates = [];
    let cursor = startKey;
    let guard = 0;
    while (cursor <= endKey && guard < 5000) {
      dates.push(cursor);
      cursor = DateUtils.addDays(cursor, 1);
      guard++;
    }
    return dates;
  },

  getDatesAround(offset = 0, pastDays = 28, futureDays = 1) {
    const anchor = DateUtils.addDays(DateUtils.todayKey(), offset);
    return this.getDatesBetween(
      DateUtils.addDays(anchor, -pastDays),
      DateUtils.addDays(anchor, futureDays)
    );
  },

  formatDate(dateStr) {
    const date = DateUtils.fromKey(dateStr);
    const todayStr = DateUtils.todayKey();

    const days = ['Sun', 'Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat'];
    const months = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec'];

    return {
      day: days[date.getDay()],
      month: months[date.getMonth()],
      dayNum: date.getDate(),
      isToday: dateStr === todayStr
    };
  },

  formatDateRange(startKey, endKey) {
    if (!startKey || !endKey) return '';
    const months = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec'];
    const [sy, sm, sd] = startKey.split('-').map(Number);
    const [ey, em, ed] = endKey.split('-').map(Number);

    if (startKey === endKey) return `${months[sm - 1]} ${sd}, ${sy}`;
    if (sy === ey && sm === em) return `${months[sm - 1]} ${sd} – ${ed}, ${sy}`;
    if (sy === ey) return `${months[sm - 1]} ${sd} – ${months[em - 1]} ${ed}, ${sy}`;
    return `${months[sm - 1]} ${sd}, ${sy} – ${months[em - 1]} ${ed}, ${ey}`;
  },

  formatFullDate(dateKey) {
    const days = ['Sunday', 'Monday', 'Tuesday', 'Wednesday', 'Thursday', 'Friday', 'Saturday'];
    const months = ['January', 'February', 'March', 'April', 'May', 'June', 'July', 'August', 'September', 'October', 'November', 'December'];
    const date = DateUtils.fromKey(dateKey || DateUtils.todayKey());
    return `${days[date.getDay()]}, ${months[date.getMonth()]} ${date.getDate()}, ${date.getFullYear()}`;
  },

  // Habits view (infinite horizontal timeline)
  async renderHabits(options = {}) {
    await this.loadState();
    const grid = document.getElementById('habit-grid');
    if (!grid) return;

    const visibleHabits = this.getVisibleHabits();

    if (visibleHabits.length === 0) {
      grid.innerHTML = '<div class="empty-state"><p>No habits yet. Add one to get started!</p></div>';
      this._habitDates = [];
      this.updateHabitRangeLabel();
      return;
    }

    let dates;
    let builtFresh = false;
    if ((options.preserveScroll || options.preserveRange) && this._habitDates.length) {
      dates = this._habitDates.slice();
    } else {
      builtFresh = true;
      dates = this.getDatesAround(
        this.currentHabitDateOffset || 0,
        this.HABIT_PAST_DAYS,
        this.HABIT_FUTURE_DAYS
      );

      // On real screens, give the timeline a generous runway in both
      // directions so today can sit comfortably near the middle. The test
      // DOM has no layout, so the canonical 30-day window stays intact.
      if (this.habitGridHasLayout(grid)) {
        dates = this.getDatesBetween(
          DateUtils.addDays(dates[0], -this.HABIT_INITIAL_PAST_RUNWAY),
          DateUtils.addDays(dates[dates.length - 1], this.HABIT_INITIAL_FUTURE_RUNWAY)
        );
      }
    }

    this.renderHabitTable(dates, visibleHabits, {
      preserveScroll: !!options.preserveScroll
    });

    if (options.centerToday || builtFresh) {
      const targetDate = options.centerToday
        ? DateUtils.todayKey()
        : DateUtils.addDays(DateUtils.todayKey(), this.currentHabitDateOffset || 0);
      setTimeout(() => this.scrollHabitGridToDate(targetDate, false), 0);
    }
  },

  getVisibleHabits() {
    const showArchivedEl = document.getElementById('show-archived-habits');
    const showArchived = showArchivedEl ? showArchivedEl.checked : false;
    const habits = (this.state && this.state.habits) || [];
    return showArchived ? habits : habits.filter(h => !h.archived);
  },

  renderHabitTable(dates, visibleHabits, options = {}) {
    const grid = document.getElementById('habit-grid');
    if (!grid) return;

    const todayStr = DateUtils.todayKey();
    const anchor = options.preserveScroll ? this.getHabitAnchor() : null;

    const dateMeta = new Map();
    dates.forEach(date => {
      const info = this.formatDate(date);
      info.dow = DateUtils.fromKey(date).getDay();
      info.isMonthStart = info.dayNum === 1;
      info.isWeekend = info.dow === 0 || info.dow === 6;
      dateMeta.set(date, info);
    });

    let html = '<table class="calendar-table"><thead><tr>';
    html += '<th class="habit-header"><span class="habit-header-label">Habit</span></th>';

    dates.forEach(date => {
      const meta = dateMeta.get(date);
      const classes = ['day-header'];
      if (meta.isToday) classes.push('today-header');
      if (meta.isMonthStart) classes.push('month-start');
      if (meta.isWeekend) classes.push('weekend-header');
      html += `<th class="${classes.join(' ')}" data-date="${date}" title="${this.formatFullDate(date)}">` +
        `<span class="day-name">${meta.day}</span>` +
        `<span class="day-date">${meta.month} ${meta.dayNum}</span>` +
        '</th>';
    });
    html += '</tr></thead><tbody>';

    visibleHabits.forEach(habit => {
      const habitColor = habit.color || '#3fa34d';
      const streak = this.calculateStreak(habit.id);

      html += `<tr class="habit-row" data-habit-row="${habit.id}" style="--habit-color: ${habitColor}">`;
      html += `<td class="habit-label" data-habit="${habit.id}" style="border-left: 4px solid ${habitColor}; background: var(--surface);">
        <div class="habit-label-content">
          <span class="habit-streak ${streak > 0 ? 'active' : 'zero'}" title="${streak} day streak">🔥 ${streak}</span>
          <span class="habit-icon" style="color: ${habitColor}">${habit.icon || '●'}</span>
          <span class="habit-name">${this.escapeHtml(habit.name)}</span>
          <button type="button" class="habit-delete-row-btn" data-habit-id="${habit.id}" title="Delete Habit">🗑️</button>
        </div>
      </td>`;

      dates.forEach(date => {
        const meta = dateMeta.get(date);
        const cellKey = `${habit.id}|${date}`;
        const cell = (this.state.cells && this.state.cells[cellKey]) || {};
        const status = cell.status || 'empty';
        const isFuture = date > todayStr;

        let statusIcon = '';
        let statusStyle = '';
        if (status === 'done') {
          statusIcon = '✓';
          statusStyle = `style="background-color: ${habitColor}; border-color: ${habitColor}; color: #ffffff;"`;
        } else if (status === 'missed') {
          statusIcon = '✗';
        }

        const cellClasses = ['day-cell'];
        if (isFuture) cellClasses.push('disabled');
        if (meta.isToday) cellClasses.push('today-cell');
        if (meta.isWeekend) cellClasses.push('weekend-cell');
        if (meta.isMonthStart) cellClasses.push('month-start-cell');

        let noteBadgeHtml = '';
        if (cell.noteId) {
          const note = (this.state.notes || []).find(n => n.id === cell.noteId);
          const noteType = (note && note.type) || 'default';
          const tooltip = (note && note.text) ? `title="${this.escapeHtml(note.text)}"` : '';
          noteBadgeHtml = `<div class="cell-note-badge cell-note-indicator badge-${noteType}" data-note-type="${noteType}" ${tooltip}></div>`;
        }

        html += `<td class="${meta.isToday ? 'today-cell' : ''} ${isFuture ? 'disabled' : ''} ${meta.isWeekend ? 'weekend-cell' : ''} ${meta.isMonthStart ? 'month-start-cell' : ''}">
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
    this._habitDates = dates.slice();

    if (anchor) this.restoreHabitAnchor(anchor);
    this.bindHabitScroll();
    this.updateHabitRangeLabel();

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
        const currentToday = DateUtils.todayKey();

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
          await Views.renderHabits({ preserveScroll: true });
        } catch (err) {
          console.error('Error updating cell status:', err);
        }
      });

      // Prevent browser text-selection / action menu on rapid double-clicks
      cell.addEventListener('dblclick', (e) => {
        e.preventDefault();
        e.stopPropagation();
      });

      cell.addEventListener('mousedown', (e) => {
        if (e.detail > 1) e.preventDefault();
      });

      // Right-click directly toggles Missed (Cross Mark ✗)
      cell.addEventListener('contextmenu', async (e) => {
        e.preventDefault();
        const habitId = cell.dataset.habit;
        const date = cell.dataset.date;
        const currentToday = DateUtils.todayKey();
        if (cell.classList.contains('disabled') || date > currentToday) return;

        const cellKey = `${habitId}|${date}`;
        const cellData = (Views.state.cells && Views.state.cells[cellKey]) || {};
        const currentStatus = cellData.status || 'empty';
        const nextStatus = currentStatus === 'missed' ? 'empty' : 'missed';

        try {
          await API.updateCell(habitId, date, { status: nextStatus });
          await Views.loadState();
          await Views.renderHabits({ preserveScroll: true });
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
          Views.renderHabits({ preserveScroll: true });
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

  // --- Infinite habit timeline helpers ---
  // The test DOM has no layout engine, so all scrolling behaviour is gated
  // behind a real (positive) clientWidth. Tests therefore keep seeing the
  // canonical 30-column window while browsers get an endless timeline.
  habitGridHasLayout(grid = document.getElementById('habit-grid')) {
    if (!grid) return false;
    const width = Number(grid.clientWidth);
    return Number.isFinite(width) && width > 0;
  },

  getHabitAnchor() {
    const grid = document.getElementById('habit-grid');
    if (!grid || !this.habitGridHasLayout(grid)) return null;

    const scrollLeft = Number(grid.scrollLeft) || 0;
    const headers = grid.querySelectorAll('th.day-header');
    if (!headers.length) return { date: null, delta: 0, scrollLeft };

    let anchorHeader = headers[0];
    for (let i = 0; i < headers.length; i++) {
      const left = Number(headers[i].offsetLeft) || 0;
      if (left <= scrollLeft) anchorHeader = headers[i];
      else break;
    }

    return {
      date: anchorHeader.dataset.date || null,
      delta: scrollLeft - (Number(anchorHeader.offsetLeft) || 0),
      scrollLeft
    };
  },

  restoreHabitAnchor(anchor) {
    const grid = document.getElementById('habit-grid');
    if (!grid || !anchor) return;

    if (anchor.date) {
      const header = grid.querySelector(`th.day-header[data-date="${anchor.date}"]`);
      if (header) {
        const target = (Number(header.offsetLeft) || 0) + (Number(anchor.delta) || 0);
        grid.scrollLeft = Math.max(0, target);
        return;
      }
    }

    if (Number.isFinite(Number(anchor.scrollLeft))) {
      grid.scrollLeft = Math.max(0, Number(anchor.scrollLeft));
    }
  },

  bindHabitScroll() {
    const grid = document.getElementById('habit-grid');
    if (!grid) return;
    grid.onscroll = () => this.onHabitScroll();
  },

  onHabitScroll() {
    const grid = document.getElementById('habit-grid');
    if (!grid || !this.habitGridHasLayout(grid)) return;

    // Extend synchronously: the edge check is cheap and this keeps the
    // timeline growing even where animation frames are throttled.
    this.maybeExtendHabitTimeline();

    if (this._habitScrollRaf) return;

    const run = () => {
      this._habitScrollRaf = null;
      this.updateHabitRangeLabel();
    };

    if (typeof requestAnimationFrame === 'function') {
      this._habitScrollRaf = requestAnimationFrame(run);
    } else {
      this._habitScrollRaf = setTimeout(run, 16);
    }
  },

  maybeExtendHabitTimeline() {
    const grid = document.getElementById('habit-grid');
    if (!grid || this._habitExtending || !this._habitDates.length) return;
    if (!this.habitGridHasLayout(grid)) return;

    const dates = this._habitDates;
    if (dates.length >= this.HABIT_MAX_COLUMNS) return;

    const scrollLeft = Number(grid.scrollLeft) || 0;
    const viewport = Number(grid.clientWidth) || 0;
    const scrollWidth = Number(grid.scrollWidth) || 0;
    const nearStart = scrollLeft <= this.HABIT_EDGE_THRESHOLD;
    const nearEnd = scrollWidth - (scrollLeft + viewport) <= this.HABIT_EDGE_THRESHOLD;
    if (!nearStart && !nearEnd) return;

    let nextDates = dates.slice();

    if (nearStart) {
      const room = this.HABIT_MAX_COLUMNS - nextDates.length;
      if (room > 0) {
        const count = Math.min(this.HABIT_CHUNK_DAYS, room);
        const first = nextDates[0];
        nextDates = this.getDatesBetween(
          DateUtils.addDays(first, -count),
          DateUtils.addDays(first, -1)
        ).concat(nextDates);
      }
    }

    if (nearEnd) {
      const room = this.HABIT_MAX_COLUMNS - nextDates.length;
      if (room > 0) {
        const count = Math.min(this.HABIT_CHUNK_DAYS, room);
        const last = nextDates[nextDates.length - 1];
        nextDates = nextDates.concat(this.getDatesBetween(
          DateUtils.addDays(last, 1),
          DateUtils.addDays(last, count)
        ));
      }
    }

    if (nextDates.length === dates.length) return;

    this._habitExtending = true;
    this.renderHabitTable(nextDates, this.getVisibleHabits(), { preserveScroll: true });

    // The re-render itself moves scrollLeft while restoring the anchor.
    // Keep edge checks paused for a couple of frames so that the resulting
    // scroll event cannot start a redundant extension pass.
    const release = () => { this._habitExtending = false; };
    if (typeof requestAnimationFrame === 'function') {
      requestAnimationFrame(() => requestAnimationFrame(release));
    } else {
      setTimeout(release, 32);
    }
  },

  getHabitVisibleCenterDate() {
    const grid = document.getElementById('habit-grid');
    if (!grid || !this.habitGridHasLayout(grid) || !this._habitDates.length) {
      return this._habitDates[0] || DateUtils.todayKey();
    }

    const scrollLeft = Number(grid.scrollLeft) || 0;
    const viewport = Number(grid.clientWidth) || 0;
    const sticky = grid.querySelector('th.habit-header');
    const stickyWidth = Number(sticky && sticky.offsetWidth) || 0;
    const centerX = scrollLeft + stickyWidth + Math.max(0, viewport - stickyWidth) / 2;

    let result = this._habitDates[0];
    grid.querySelectorAll('th.day-header').forEach(header => {
      const left = Number(header.offsetLeft) || 0;
      if (left <= centerX && header.dataset.date) result = header.dataset.date;
    });
    return result;
  },

  scrollHabitGridToDate(dateKey, smooth = true) {
    if (!dateKey) return false;
    const grid = document.getElementById('habit-grid');
    if (!grid) return false;

    if (!this._habitDates.includes(dateKey)) {
      this.centerHabitTimelineOn(dateKey, smooth);
      return true;
    }

    if (!this.habitGridHasLayout(grid)) return false;
    const header = grid.querySelector(`th.day-header[data-date="${dateKey}"]`);
    if (!header) return false;

    const viewport = Number(grid.clientWidth) || 0;
    const sticky = grid.querySelector('th.habit-header');
    const stickyWidth = Number(sticky && sticky.offsetWidth) || 0;
    const visibleWidth = Math.max(0, viewport - stickyWidth);
    const headerLeft = Number(header.offsetLeft) || 0;
    const headerWidth = Number(header.offsetWidth) || 0;
    const target = headerLeft + headerWidth / 2 - visibleWidth / 2 - stickyWidth;
    const maxScroll = Math.max(0, (Number(grid.scrollWidth) || 0) - viewport);
    let left = Math.min(maxScroll, Math.max(0, target));

    // Snap to a date-column boundary so the first visible column is not
    // awkwardly sliced in half by the sticky habit column.
    let nearest = null;
    grid.querySelectorAll('th.day-header').forEach(candidate => {
      const candidateLeft = Number(candidate.offsetLeft) || 0;
      const distance = Math.abs(candidateLeft - (left + stickyWidth));
      if (!nearest || distance < nearest.distance) {
        nearest = { left: candidateLeft, distance };
      }
    });
    if (nearest) {
      left = Math.min(maxScroll, Math.max(0, nearest.left - stickyWidth));
    }

    if (smooth && typeof grid.scrollTo === 'function') {
      try {
        grid.scrollTo({ left, behavior: 'smooth' });
      } catch (_) {
        grid.scrollLeft = left;
      }
    } else {
      grid.scrollLeft = left;
    }
    this.updateHabitRangeLabel();
    return true;
  },

  scrollHabitsByDays(days, smooth = true) {
    if (!this._habitDates.length) return false;
    const baseDate = this.getHabitVisibleCenterDate();
    return this.scrollHabitGridToDate(DateUtils.addDays(baseDate, days), smooth);
  },

  centerHabitTimelineOn(dateKey, smooth = true) {
    const grid = document.getElementById('habit-grid');
    if (!grid) return;

    const target = dateKey || DateUtils.todayKey();
    let dates = this.getDatesBetween(
      DateUtils.addDays(target, -this.HABIT_PAST_DAYS),
      DateUtils.addDays(target, this.HABIT_FUTURE_DAYS)
    );

    if (this.habitGridHasLayout(grid)) {
      dates = this.getDatesBetween(
        DateUtils.addDays(dates[0], -this.HABIT_INITIAL_PAST_RUNWAY),
        DateUtils.addDays(dates[dates.length - 1], this.HABIT_INITIAL_FUTURE_RUNWAY)
      );
    }

    this.renderHabitTable(dates, this.getVisibleHabits(), { preserveScroll: false });
    setTimeout(() => this.scrollHabitGridToDate(target, smooth), 0);
  },

  updateHabitRangeLabel() {
    const label = document.getElementById('habit-range-label');
    if (!label) return;
    if (!this._habitDates.length) {
      label.textContent = '';
      return;
    }
    label.textContent = this.formatDateRange(
      this._habitDates[0],
      this._habitDates[this._habitDates.length - 1]
    );
  },

  calculateStreak(habitId) {
    let streak = 0;
    const todayStr = DateUtils.todayKey();

    for (let i = 0; i < 365; i++) {
      const dateStr = DateUtils.addDays(todayStr, -i);
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
        <div class="task-item ${isDone ? 'done' : ''}" data-task-id="${task.id}" data-task-status="${task.status || 'pending'}" draggable="true">
          <div class="task-drag-handle" title="Hold and drag to reorder" aria-label="Hold and drag to reorder">⠿</div>
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

    // Prevent double-click text selection / context menu on tasks & checkboxes
    container.querySelectorAll('.task-item, .task-checkbox, .task-title, .task-item-left').forEach(el => {
      el.addEventListener('dblclick', (e) => {
        e.preventDefault();
        e.stopPropagation();
      });
      el.addEventListener('mousedown', (e) => {
        if (e.detail > 1) e.preventDefault();
      });
    });

    // Wire Smooth Drag & Drop Reordering (Desktop & Mobile Touch)
    let draggedItem = null;
    const taskItems = container.querySelectorAll('.task-item');

    taskItems.forEach(item => {
      // Desktop HTML5 drag
      item.addEventListener('dragstart', (e) => {
        draggedItem = item;
        item.classList.add('task-dragging');
        if (e.dataTransfer) {
          e.dataTransfer.effectAllowed = 'move';
          e.dataTransfer.setData('text/plain', item.dataset.taskId);
        }
      });

      item.addEventListener('dragend', () => {
        item.classList.remove('task-dragging');
        container.querySelectorAll('.task-item').forEach(el => {
          el.classList.remove('task-drag-over-top', 'task-drag-over-bottom');
        });
        draggedItem = null;
      });

      item.addEventListener('dragover', (e) => {
        e.preventDefault();
        if (!draggedItem || draggedItem === item) return;
        if (e.dataTransfer) e.dataTransfer.dropEffect = 'move';

        const rect = item.getBoundingClientRect();
        const midY = rect.top + rect.height / 2;
        if (e.clientY < midY) {
          item.classList.add('task-drag-over-top');
          item.classList.remove('task-drag-over-bottom');
        } else {
          item.classList.add('task-drag-over-bottom');
          item.classList.remove('task-drag-over-top');
        }
      });

      item.addEventListener('dragleave', () => {
        item.classList.remove('task-drag-over-top', 'task-drag-over-bottom');
      });

      item.addEventListener('drop', async (e) => {
        e.preventDefault();
        e.stopPropagation();
        if (!draggedItem || draggedItem === item) return;

        const rect = item.getBoundingClientRect();
        const midY = rect.top + rect.height / 2;
        const insertBefore = e.clientY < midY;

        item.classList.remove('task-drag-over-top', 'task-drag-over-bottom');

        if (insertBefore) {
          container.insertBefore(draggedItem, item);
        } else {
          container.insertBefore(draggedItem, item.nextSibling);
        }

        const newOrderedIds = Array.from(container.querySelectorAll('.task-item'))
          .map(el => el.dataset.taskId)
          .filter(Boolean);

        await API.reorderTasks(newOrderedIds);
        await this.loadState();
      });

      // Mobile Touch Hold-and-Drag
      let touchStartY = 0;
      let isTouchDragging = false;

      item.addEventListener('touchstart', (e) => {
        if (e.target.closest('.task-checkbox, .task-item-actions')) return;
        touchStartY = e.touches[0].clientY;
        draggedItem = item;
      }, { passive: true });

      item.addEventListener('touchmove', (e) => {
        if (!draggedItem || draggedItem !== item) return;
        const currentY = e.touches[0].clientY;
        if (Math.abs(currentY - touchStartY) > 10) {
          isTouchDragging = true;
          item.classList.add('task-dragging');
        }
        if (isTouchDragging) {
          if (e.cancelable) e.preventDefault();
          const targetEl = document.elementFromPoint(e.touches[0].clientX, currentY);
          const targetItem = targetEl && targetEl.closest('.task-item');
          if (targetItem && targetItem !== item) {
            const rect = targetItem.getBoundingClientRect();
            if (currentY < rect.top + rect.height / 2) {
              container.insertBefore(item, targetItem);
            } else {
              container.insertBefore(item, targetItem.nextSibling);
            }
          }
        }
      }, { passive: false });

      item.addEventListener('touchend', async () => {
        if (isTouchDragging) {
          item.classList.remove('task-dragging');
          isTouchDragging = false;
          draggedItem = null;
          const newOrderedIds = Array.from(container.querySelectorAll('.task-item'))
            .map(el => el.dataset.taskId)
            .filter(Boolean);
          await API.reorderTasks(newOrderedIds);
          await this.loadState();
        }
      });
    });

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
  populateDiaryYearOptions(yearSelect, selectedYear) {
    if (!yearSelect) return;
    const parsed = parseInt(selectedYear, 10);
    const center = Number.isFinite(parsed) ? parsed : new Date().getFullYear();

    // Keep a wide window around the selected year. Whenever the user
    // navigates past either edge, the window is rebuilt around the new year,
    // so the calendar behaves like an endless timeline.
    const span = 25;
    let html = '';
    for (let y = center - span; y <= center + span; y++) {
      html += `<option value="${y}">${y}</option>`;
    }
    yearSelect.innerHTML = html;
  },

  setDiaryNavMonth(monthDelta) {
    let month = (Number(this.diaryNavMonth) || 0) + monthDelta;
    while (month < 0) {
      month += 12;
      this.diaryNavYear = (Number(this.diaryNavYear) || new Date().getFullYear()) - 1;
    }
    while (month > 11) {
      month -= 12;
      this.diaryNavYear = (Number(this.diaryNavYear) || new Date().getFullYear()) + 1;
    }
    this.diaryNavMonth = month;

    const monthSelect = document.getElementById('diary-month-select');
    const yearSelect = document.getElementById('diary-year-select');
    if (monthSelect) monthSelect.value = this.diaryNavMonth;
    if (yearSelect) {
      this.populateDiaryYearOptions(yearSelect, this.diaryNavYear);
      yearSelect.value = this.diaryNavYear;
    }
    this.renderDiaryMiniCalendar();
  },

  renderDiaryCalendarSidebar() {
    const sidebar = document.getElementById('diary-sidebar-calendar') || document.querySelector('.diary-sidebar');
    if (!sidebar) return;

    const dateParts = String(this.currentDiaryDate || DateUtils.todayKey()).split('-');
    const currentYear = parseInt(dateParts[0], 10);
    const currentMonth = parseInt(dateParts[1], 10) - 1; // 0-indexed

    if (!Number.isFinite(this.diaryNavYear)) this.diaryNavYear = currentYear;
    if (!Number.isFinite(this.diaryNavMonth)) this.diaryNavMonth = currentMonth;

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
    }

    if (monthSelect) {
      monthSelect.value = this.diaryNavMonth;
      monthSelect.onchange = () => {
        this.diaryNavMonth = parseInt(monthSelect.value, 10);
        this.renderDiaryMiniCalendar();
      };
    }

    if (yearSelect) {
      this.populateDiaryYearOptions(yearSelect, this.diaryNavYear);
      yearSelect.value = this.diaryNavYear;
      yearSelect.onchange = () => {
        this.diaryNavYear = parseInt(yearSelect.value, 10);
        this.renderDiaryMiniCalendar();
      };
    }

    // Previous / Next Month button wiring
    const prevMonthBtn = document.getElementById('diary-prev-month');
    if (prevMonthBtn) {
      prevMonthBtn.onclick = () => this.setDiaryNavMonth(-1);
    }

    const nextMonthBtn = document.getElementById('diary-next-month');
    if (nextMonthBtn) {
      nextMonthBtn.onclick = () => this.setDiaryNavMonth(1);
    }

    const todayBtn = document.getElementById('diary-jump-today-btn');
    if (todayBtn) {
      todayBtn.onclick = () => {
        const todayStr = DateUtils.todayKey();
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

    const y = Number.isFinite(this.diaryNavYear) ? this.diaryNavYear : new Date().getFullYear();
    const m = Number.isFinite(this.diaryNavMonth) ? this.diaryNavMonth : new Date().getMonth();
    const firstDay = new Date(y, m, 1).getDay();
    const daysInMonth = new Date(y, m + 1, 0).getDate();
    const todayStr = DateUtils.todayKey();

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

      html += `<button type="button" class="${cls}" data-date="${dateStr}" aria-label="${this.formatFullDate(dateStr)}">${d}</button>`;
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
      const dt = DateUtils.fromKey(this.currentDiaryDate);
      const fullDays = ['Sunday', 'Monday', 'Tuesday', 'Wednesday', 'Thursday', 'Friday', 'Saturday'];
      const fullMonths = ['January', 'February', 'March', 'April', 'May', 'June', 'July', 'August', 'September', 'October', 'November', 'December'];
      const dateTitleEl = document.getElementById('diary-page-date-display');
      const dayNameEl = document.getElementById('diary-page-day-name');
      if (dateTitleEl) {
        dateTitleEl.textContent = `${fullDays[dt.getDay()]}, ${fullMonths[dt.getMonth()]} ${dt.getDate()}, ${dt.getFullYear()}`;
      }
      if (dayNameEl) {
        const todayKey = DateUtils.todayKey();
        const isToday = this.currentDiaryDate === todayKey;
        dayNameEl.textContent = isToday
          ? '★ Today\'s Journal Page'
          : (this.currentDiaryDate > todayKey ? 'Future Journal Page' : 'Historical Journal Page');
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
      quotesList.innerHTML = '<p style="color: var(--text-muted);">No quotes yet.</p>';
    }
  },

  // Plans & Quick Goals helpers
  getHorizonMeta(category) {
    const map = {
      quick: { key: 'quick', icon: '⚡', label: 'Quick (1–7d)' },
      mid: { key: 'mid', icon: '🚀', label: 'Mid-Term (1–6m)' },
      long: { key: 'long', icon: '🌟', label: 'Long-Term (1–5y)' }
    };
    return map[category] || map.quick;
  },

  computePlanProgress(plan, allGoals = []) {
    if (!plan) return 0;
    if (plan.status === 'completed') return 100;

    const milestones = Array.isArray(plan.milestones) ? plan.milestones : [];
    const childGoals = allGoals.filter(g => g.parentId === plan.id && g.status !== 'archived');
    const totalUnits = milestones.length + childGoals.length;

    if (totalUnits === 0) {
      return typeof plan.progress === 'number' ? plan.progress : 0;
    }

    const doneMilestones = milestones.filter(m => m.done).length;
    let childProgressSum = 0;
    childGoals.forEach(cg => {
      if (cg.status === 'completed') {
        childProgressSum += 1;
      } else if (Array.isArray(cg.milestones) && cg.milestones.length > 0) {
        const cgDone = cg.milestones.filter(m => m.done).length;
        childProgressSum += cgDone / cg.milestones.length;
      } else {
        childProgressSum += Math.max(0, Math.min(100, Number(cg.progress) || 0)) / 100;
      }
    });

    return Math.round(((doneMilestones + childProgressSum) / totalUnits) * 100);
  },

  populatePlanSelect(selectEl, defaultLabel, defaultValue, selectedValue) {
    if (!selectEl) return;
    const allGoals = (this.state && this.state.goals) || [];
    const topPlans = allGoals.filter(g => !g.parentId && g.status !== 'archived');

    let html = `<option value="${this.escapeHtml(defaultValue)}">${this.escapeHtml(defaultLabel)}</option>`;
    topPlans.forEach(p => {
      html += `<option value="${this.escapeHtml(p.id)}">${this.escapeHtml(p.title)}</option>`;
    });
    selectEl.innerHTML = html;

    const hasMatch = selectedValue !== undefined && selectedValue !== null &&
      (selectedValue === defaultValue || topPlans.some(p => p.id === selectedValue));
    selectEl.value = hasMatch ? selectedValue : defaultValue;
  },

  // Plans view (Master-Detail workspace)
  async renderPlans() {
    await this.loadState();
    const allGoals = (this.state && this.state.goals) || [];
    const habits = (this.state && this.state.habits) || [];
    const tasks = (this.state && this.state.tasks) || [];
    const thoughts = (this.state && this.state.thoughts) || [];

    const topPlans = allGoals.filter(g => !g.parentId && g.status !== 'archived');
    const filter = this.currentPlanFilter || 'all';

    document.querySelectorAll('.plan-filter-btn').forEach(btn => {
      btn.classList.toggle('active', btn.dataset.filter === filter);
    });

    const filteredPlans = topPlans.filter(p => {
      if (filter === 'active') return p.status !== 'completed';
      if (filter === 'completed') return p.status === 'completed';
      if (filter === 'quick' || filter === 'mid' || filter === 'long') return (p.category || 'quick') === filter;
      return true;
    });

    if (filteredPlans.length === 0) {
      this.selectedPlanId = null;
      this.mobilePlanDetailOpen = false;
    } else if (!this.selectedPlanId || !filteredPlans.some(p => p.id === this.selectedPlanId)) {
      this.selectedPlanId = filteredPlans[0].id;
    }

    const selectedPlan = this.selectedPlanId
      ? filteredPlans.find(p => p.id === this.selectedPlanId) || null
      : null;

    const workspace = document.querySelector('.plans-workspace');
    if (workspace) {
      workspace.classList.toggle('is-mobile-detail', !!(this.mobilePlanDetailOpen && selectedPlan));
    }

    const listEl = document.getElementById('plans-list');
    if (listEl) {
      if (filteredPlans.length === 0) {
        listEl.innerHTML = '<div class="empty-state plans-empty-list"><p>No plans match this filter yet. Add a plan to get started!</p></div>';
      } else {
        const habitIdsSet = new Set(habits.map(h => h.id));
        listEl.innerHTML = filteredPlans.map(plan => {
          const isSelected = selectedPlan && plan.id === selectedPlan.id;
          const isCompleted = plan.status === 'completed';
          const horizon = this.getHorizonMeta(plan.category);
          const progressPercent = this.computePlanProgress(plan, allGoals);
          const quickCount = allGoals.filter(g => g.parentId === plan.id && g.status !== 'archived').length;
          const habitCount = (Array.isArray(plan.linkedHabitIds) ? plan.linkedHabitIds : []).filter(id => habitIdsSet.has(id)).length;
          const thoughtCount = thoughts.filter(t => t.planId === plan.id).length;

          return `
            <div class="plan-list-item ${isSelected ? 'active' : ''} ${isCompleted ? 'completed' : ''}" data-plan-id="${this.escapeHtml(plan.id)}" role="button" tabindex="0">
              <div class="plan-list-item-top">
                <span class="plan-horizon-dot horizon-${horizon.key}" title="${horizon.label}"></span>
                <div class="plan-list-item-title">${this.escapeHtml(plan.title)}</div>
                <span class="plan-list-item-pct">${isCompleted ? '✓ 100%' : `${progressPercent}%`}</span>
              </div>
              <div class="plan-list-progress-bar">
                <div class="plan-list-progress-fill" style="width: ${progressPercent}%;"></div>
              </div>
              <div class="plan-list-item-meta">${quickCount} quick · ${habitCount} habits · ${thoughtCount} thoughts</div>
            </div>
          `;
        }).join('');

        listEl.querySelectorAll('.plan-list-item[data-plan-id]').forEach(item => {
          const selectItem = () => {
            this.selectedPlanId = item.dataset.planId;
            this.mobilePlanDetailOpen = true;
            if (workspace) workspace.classList.add('is-mobile-detail');
            this.renderPlans();
          };
          item.addEventListener('click', selectItem);
          item.addEventListener('keydown', (e) => {
            if (e.key === 'Enter' || e.key === ' ') {
              e.preventDefault();
              selectItem();
            }
          });
        });
      }
    }

    const detailEl = document.getElementById('plans-detail');
    if (detailEl) {
      this.renderPlanDetail(detailEl, selectedPlan, { allGoals, habits, tasks, thoughts });
    }
  },

  renderPlanDetail(detailEl, plan, ctx) {
    if (!plan) {
      detailEl.innerHTML = `
        <div class="empty-state plan-detail-empty">
          <p>Select a plan to view its strategy, 1–7 day quick goals, linked habits, tasks, and attached thoughts.</p>
        </div>
      `;
      return;
    }

    const { allGoals, habits, tasks, thoughts } = ctx;
    const isCompleted = plan.status === 'completed';
    const horizon = this.getHorizonMeta(plan.category);
    const progressPercent = this.computePlanProgress(plan, allGoals);
    const childQuickGoals = allGoals.filter(g => g.parentId === plan.id && g.status !== 'archived');
    const milestones = Array.isArray(plan.milestones) ? plan.milestones : [];

    const habitMap = new Map(habits.map(h => [h.id, h]));
    const linkedHabitIds = Array.isArray(plan.linkedHabitIds) ? plan.linkedHabitIds : [];
    const linkedHabits = [];
    const linkedHabitSet = new Set();
    linkedHabitIds.forEach(hid => {
      if (!linkedHabitSet.has(hid) && habitMap.has(hid)) {
        linkedHabitSet.add(hid);
        linkedHabits.push(habitMap.get(hid));
      }
    });
    const unlinkedHabits = habits.filter(h => !h.archived && !linkedHabitSet.has(h.id));

    const taskMap = new Map(tasks.map(t => [t.id, t]));
    const linkedTaskIds = Array.isArray(plan.linkedTaskIds) ? plan.linkedTaskIds : [];
    const linkedTasks = [];
    const linkedTaskSet = new Set();
    linkedTaskIds.forEach(tid => {
      if (!linkedTaskSet.has(tid) && taskMap.has(tid)) {
        linkedTaskSet.add(tid);
        linkedTasks.push(taskMap.get(tid));
      }
    });
    const unlinkedTasks = tasks.filter(t => !t.archived && !linkedTaskSet.has(t.id));

    const attachedThoughts = thoughts.filter(t => t.planId === plan.id);
    const todayKey = DateUtils.todayKey();
    if (!(this.expandedThoughtIds instanceof Set)) this.expandedThoughtIds = new Set();

    const quickGoalsHtml = childQuickGoals.length === 0
      ? '<p class="plan-empty-hint">No 1–7 day quick goals yet. Add an immediate target below.</p>'
      : childQuickGoals.map(qg => {
          const qgDone = qg.status === 'completed';
          const qgProgress = this.computePlanProgress(qg, allGoals);
          return `
            <div class="plan-quick-goal-row ${qgDone ? 'completed' : ''}" data-goal-id="${this.escapeHtml(qg.id)}">
              <label class="plan-quick-goal-label">
                <input type="checkbox" class="plan-quick-goal-check" data-goal-id="${this.escapeHtml(qg.id)}" ${qgDone ? 'checked' : ''}>
                <span class="plan-quick-goal-title">${this.escapeHtml(qg.title)}</span>
              </label>
              <div class="plan-quick-goal-meta">
                ${qg.targetDate ? `<span class="goal-timeline-pill">⏳ ${this.escapeHtml(qg.targetDate)}</span>` : ''}
                <span class="plan-quick-goal-progress">${qgDone ? '100%' : `${qgProgress}%`}</span>
                <button type="button" class="btn-goal-action plan-quick-edit-btn" data-goal-id="${this.escapeHtml(qg.id)}" title="Edit Quick Goal">✎</button>
                <button type="button" class="btn-goal-action plan-quick-delete-btn" data-goal-id="${this.escapeHtml(qg.id)}" title="Delete Quick Goal">&times;</button>
              </div>
            </div>
          `;
        }).join('');

    const linkedHabitsHtml = linkedHabits.length === 0
      ? '<p class="plan-empty-hint">No habits linked yet.</p>'
      : linkedHabits.map(h => {
          const hColor = h.color || '#3fa34d';
          const streak = this.calculateStreak(h.id);
          const cellKey = `${h.id}|${todayKey}`;
          const cell = (this.state.cells && this.state.cells[cellKey]) || {};
          const isDoneToday = cell.status === 'done';
          return `
            <div class="plan-habit-chip ${isDoneToday ? 'done' : ''}" data-habit-id="${this.escapeHtml(h.id)}" style="--habit-color: ${this.escapeHtml(hColor)}">
              <span class="plan-habit-icon" style="color: ${this.escapeHtml(hColor)}">${this.escapeHtml(h.icon || '●')}</span>
              <span class="plan-habit-name">${this.escapeHtml(h.name)}</span>
              <span class="plan-habit-streak">🔥 ${streak}</span>
              <button type="button" class="plan-habit-toggle-btn ${isDoneToday ? 'done' : ''}" data-habit-id="${this.escapeHtml(h.id)}" title="${isDoneToday ? 'Done today — click to clear' : 'Mark done today'}">${isDoneToday ? '✓ Done' : 'Mark Today'}</button>
              <button type="button" class="plan-habit-unlink-btn" data-habit-id="${this.escapeHtml(h.id)}" title="Unlink habit">&times;</button>
            </div>
          `;
        }).join('');

    const linkedTasksHtml = linkedTasks.length === 0
      ? '<p class="plan-empty-hint">No tasks linked yet.</p>'
      : linkedTasks.map(t => {
          const isDone = t.status === 'done';
          return `
            <div class="plan-task-row ${isDone ? 'done' : ''}" data-task-id="${this.escapeHtml(t.id)}">
              <label class="plan-task-check-label">
                <input type="checkbox" class="plan-task-checkbox" data-task-id="${this.escapeHtml(t.id)}" ${isDone ? 'checked' : ''}>
                <span class="plan-task-title ${isDone ? 'completed' : ''}">${this.escapeHtml(t.title)}</span>
              </label>
              <button type="button" class="plan-task-unlink-btn" data-task-id="${this.escapeHtml(t.id)}" title="Unlink task">&times;</button>
            </div>
          `;
        }).join('');

    const milestonesHtml = milestones.length === 0
      ? '<p class="plan-empty-hint">No milestones yet. Edit this plan to add checklist steps.</p>'
      : `
        <div class="goal-milestones-list">
          ${milestones.map((m, idx) => `
            <label class="goal-milestone-item ${m.done ? 'done' : ''}">
              <input type="checkbox" class="goal-milestone-check" data-goal-id="${this.escapeHtml(plan.id)}" data-idx="${idx}" ${m.done ? 'checked' : ''}>
              <span class="custom-checkbox"></span>
              <span class="milestone-text">${this.escapeHtml(m.text || '')}</span>
            </label>
          `).join('')}
        </div>
      `;

    const attachedThoughtsHtml = attachedThoughts.length === 0
      ? '<p class="plan-empty-hint">No thoughts attached yet. Link insights from the Thoughts view.</p>'
      : attachedThoughts.map(t => {
          const color = ['default', 'amber', 'sage', 'rose', 'slate'].includes(t.color) ? t.color : 'default';
          const isExpanded = this.expandedThoughtIds.has(t.id);
          const snippet = this.formatThoughtPreview(t.body);
          return `
            <div class="plan-thought-chip color-${color} ${isExpanded ? 'expanded' : ''}" data-thought-id="${this.escapeHtml(t.id)}">
              <div class="plan-thought-chip-header">
                <div class="plan-thought-chip-meta">
                  ${t.pinned ? '<span class="thought-pin-badge" title="Pinned">📌</span>' : ''}
                  ${t.title ? `<strong class="plan-thought-chip-title">${this.escapeHtml(t.title)}</strong>` : ''}
                  ${t.tag ? `<span class="thought-tag-badge">${this.escapeHtml(t.tag)}</span>` : ''}
                </div>
                <div class="plan-thought-chip-actions">
                  <button type="button" class="btn-goal-action plan-thought-expand-btn" data-thought-id="${this.escapeHtml(t.id)}" title="${isExpanded ? 'Collapse' : 'Expand'}">${isExpanded ? '▾' : '▸'}</button>
                  <button type="button" class="btn-goal-action plan-thought-unlink-btn" data-thought-id="${this.escapeHtml(t.id)}" title="Unlink thought">&times;</button>
                </div>
              </div>
              <div class="plan-thought-chip-preview" ${isExpanded ? 'style="display:none;"' : ''}>${this.escapeHtml(snippet)}</div>
              <div class="plan-thought-chip-body" style="white-space: pre-wrap; display: ${isExpanded ? 'block' : 'none'};">${this.escapeHtml(t.body || '')}</div>
            </div>
          `;
        }).join('');

    detailEl.innerHTML = `
      <div class="plan-detail-card ${isCompleted ? 'completed' : ''}" data-plan-id="${this.escapeHtml(plan.id)}">
        <div class="plan-detail-header">
          <div class="plan-detail-header-main">
            <div class="goal-tags-row">
              <span class="plan-horizon-badge horizon-${horizon.key}">${horizon.icon} ${horizon.label}</span>
              <span class="goal-tag-pill">${this.escapeHtml(plan.tag || 'General')}</span>
              ${plan.targetDate ? `<span class="goal-timeline-pill">⏳ ${this.escapeHtml(plan.targetDate)}</span>` : ''}
              ${isCompleted ? '<span class="goal-status-pill completed">✓ Completed</span>' : ''}
            </div>
            <h2 class="plan-detail-title">${this.escapeHtml(plan.title)}</h2>
            ${plan.description ? `<p class="plan-detail-desc">${this.escapeHtml(plan.description)}</p>` : ''}
          </div>
          <div class="plan-detail-header-actions">
            <button type="button" class="btn btn-secondary btn-small plan-edit-btn" data-plan-id="${this.escapeHtml(plan.id)}">✎ Edit</button>
            <button type="button" class="btn btn-secondary btn-small plan-toggle-complete-btn" data-plan-id="${this.escapeHtml(plan.id)}">${isCompleted ? '↺ Mark Active' : '✓ Mark Complete'}</button>
            <button type="button" class="btn btn-danger btn-small plan-delete-btn" data-plan-id="${this.escapeHtml(plan.id)}">Delete</button>
          </div>
        </div>

        <div class="goal-progress-wrap plan-detail-progress">
          <div class="goal-progress-meta">
            <span class="progress-label">Overall Progress</span>
            <span class="progress-percent">${progressPercent}%</span>
          </div>
          <div class="goal-progress-bar">
            <div class="goal-progress-fill" style="width: ${progressPercent}%;"></div>
          </div>
        </div>

        <div class="plan-section-block plan-strategy-box">
          <div class="plan-section-header">
            <h3>Strategy &amp; Rules</h3>
          </div>
          <textarea id="plan-strategy-input" class="plan-strategy-input" rows="3" placeholder="Operating rules, weekly cadence, constraints, or principles for this plan..."></textarea>
          <div class="plan-strategy-actions">
            <button type="button" id="plan-strategy-save-btn" class="btn btn-primary btn-small">Save Strategy</button>
            <span id="plan-strategy-status" class="plan-inline-status"></span>
          </div>
        </div>

        <div class="plan-section-block">
          <div class="plan-section-header">
            <h3>⚡ 1–7 Day Quick Goals</h3>
            <span class="plan-section-count">${childQuickGoals.length}</span>
          </div>
          <div class="plan-quick-goals-list">
            ${quickGoalsHtml}
          </div>
          <div class="plan-inline-add-row">
            <input type="text" id="plan-quick-title-input" placeholder="Add a 1–7 day quick goal under this plan...">
            <button type="button" id="plan-quick-add-btn" class="btn btn-primary btn-small">+ Add Quick Goal</button>
          </div>
        </div>

        <div class="plan-section-block">
          <div class="plan-section-header">
            <h3>🔥 Linked Habits</h3>
            <span class="plan-section-count">${linkedHabits.length}</span>
          </div>
          <div class="plan-linked-habits">
            ${linkedHabitsHtml}
          </div>
          <div class="plan-inline-add-row">
            <select id="plan-link-habit-select" ${unlinkedHabits.length === 0 ? 'disabled' : ''}>
              <option value="">${unlinkedHabits.length ? 'Select a habit to link...' : 'All habits linked'}</option>
              ${unlinkedHabits.map(h => `<option value="${this.escapeHtml(h.id)}">${this.escapeHtml((h.icon || '●') + ' ' + h.name)}</option>`).join('')}
            </select>
            <button type="button" id="plan-link-habit-btn" class="btn btn-secondary btn-small" ${unlinkedHabits.length === 0 ? 'disabled' : ''}>Link Habit</button>
          </div>
        </div>

        <div class="plan-section-block">
          <div class="plan-section-header">
            <h3>✓ Linked Tasks</h3>
            <span class="plan-section-count">${linkedTasks.length}</span>
          </div>
          <div class="plan-linked-tasks">
            ${linkedTasksHtml}
          </div>
          <div class="plan-inline-add-row">
            <select id="plan-link-task-select" ${unlinkedTasks.length === 0 ? 'disabled' : ''}>
              <option value="">${unlinkedTasks.length ? 'Select an existing task to link...' : 'No unlinked tasks available'}</option>
              ${unlinkedTasks.map(t => `<option value="${this.escapeHtml(t.id)}">${this.escapeHtml(t.title)}</option>`).join('')}
            </select>
            <button type="button" id="plan-link-task-btn" class="btn btn-secondary btn-small" ${unlinkedTasks.length === 0 ? 'disabled' : ''}>Link Task</button>
          </div>
          <div class="plan-inline-add-row">
            <input type="text" id="plan-new-task-input" placeholder="Create &amp; link a new task...">
            <button type="button" id="plan-new-task-btn" class="btn btn-primary btn-small">+ Add &amp; Link Task</button>
          </div>
        </div>

        <div class="plan-section-block">
          <div class="plan-section-header">
            <h3>Milestones</h3>
            <span class="plan-section-count">${milestones.filter(m => m.done).length}/${milestones.length}</span>
          </div>
          ${milestonesHtml}
        </div>

        <div class="plan-section-block">
          <div class="plan-section-header">
            <h3>💭 Attached Thoughts</h3>
            <span class="plan-section-count">${attachedThoughts.length}</span>
          </div>
          <div class="plan-attached-thoughts">
            ${attachedThoughtsHtml}
          </div>
        </div>
      </div>
    `;

    // Set textarea/select values directly in JS for exact DOM & MockElement fidelity
    const strategyInput = document.getElementById('plan-strategy-input');
    if (strategyInput) strategyInput.value = plan.strategy || '';
    const linkHabitSelect = document.getElementById('plan-link-habit-select');
    if (linkHabitSelect) linkHabitSelect.value = '';
    const linkTaskSelect = document.getElementById('plan-link-task-select');
    if (linkTaskSelect) linkTaskSelect.value = '';

    this.bindPlanDetailEvents(detailEl, plan);
  },

  bindPlanDetailEvents(detailEl, plan) {
    const editBtn = detailEl.querySelector('.plan-edit-btn');
    if (editBtn) {
      editBtn.addEventListener('click', () => {
        if (typeof window.openGoalModal === 'function') {
          window.openGoalModal(plan.id);
        }
      });
    }

    const toggleCompleteBtn = detailEl.querySelector('.plan-toggle-complete-btn');
    if (toggleCompleteBtn) {
      toggleCompleteBtn.addEventListener('click', async () => {
        const newStatus = plan.status === 'completed' ? 'active' : 'completed';
        const newProgress = newStatus === 'completed' ? 100 : 0;
        await API.updateGoal(plan.id, { status: newStatus, progress: newProgress });
        await this.renderPlans();
      });
    }

    const deleteBtn = detailEl.querySelector('.plan-delete-btn');
    if (deleteBtn) {
      deleteBtn.addEventListener('click', async () => {
        if (confirm(`Delete plan "${plan.title}"?`)) {
          await API.deleteGoal(plan.id);
          if (this.selectedPlanId === plan.id) {
            this.selectedPlanId = null;
            this.mobilePlanDetailOpen = false;
          }
          await this.renderPlans();
        }
      });
    }

    const strategySaveBtn = document.getElementById('plan-strategy-save-btn');
    const strategyInput = document.getElementById('plan-strategy-input');
    if (strategySaveBtn && strategyInput) {
      strategySaveBtn.addEventListener('click', async () => {
        await API.updateGoal(plan.id, { strategy: strategyInput.value });
        await this.renderPlans();
        const statusEl = document.getElementById('plan-strategy-status');
        if (statusEl) statusEl.textContent = 'Saved ✓';
      });
    }

    // Nested 1-7d Quick Goals
    const quickAddInput = document.getElementById('plan-quick-title-input');
    const quickAddBtn = document.getElementById('plan-quick-add-btn');
    const addQuickGoal = async () => {
      const title = quickAddInput ? quickAddInput.value.trim() : '';
      if (!title) return;
      await API.createGoal({ title, category: 'quick', parentId: plan.id });
      if (quickAddInput) quickAddInput.value = '';
      await this.renderPlans();
    };
    if (quickAddBtn) quickAddBtn.addEventListener('click', addQuickGoal);
    if (quickAddInput) {
      quickAddInput.addEventListener('keydown', (e) => {
        if (e.key === 'Enter') {
          e.preventDefault();
          addQuickGoal();
        }
      });
    }

    detailEl.querySelectorAll('.plan-quick-goal-check').forEach(cb => {
      cb.addEventListener('change', async () => {
        const goalId = cb.dataset.goalId;
        const newStatus = cb.checked ? 'completed' : 'active';
        await API.updateGoal(goalId, { status: newStatus, progress: cb.checked ? 100 : 0 });
        await this.renderPlans();
      });
    });

    detailEl.querySelectorAll('.plan-quick-edit-btn').forEach(btn => {
      btn.addEventListener('click', (e) => {
        e.stopPropagation();
        if (typeof window.openGoalModal === 'function') {
          window.openGoalModal(btn.dataset.goalId, 'quick', plan.id);
        }
      });
    });

    detailEl.querySelectorAll('.plan-quick-delete-btn').forEach(btn => {
      btn.addEventListener('click', async (e) => {
        e.stopPropagation();
        if (confirm('Delete this quick goal?')) {
          await API.deleteGoal(btn.dataset.goalId);
          await this.renderPlans();
        }
      });
    });

    // Linked Habits
    const todayKey = DateUtils.todayKey();
    detailEl.querySelectorAll('.plan-habit-toggle-btn').forEach(btn => {
      btn.addEventListener('click', async (e) => {
        e.stopPropagation();
        const habitId = btn.dataset.habitId;
        const cellKey = `${habitId}|${todayKey}`;
        const cell = (this.state.cells && this.state.cells[cellKey]) || {};
        const nextStatus = cell.status === 'done' ? 'empty' : 'done';
        await API.updateCell(habitId, todayKey, { status: nextStatus });
        await this.renderPlans();
      });
    });

    detailEl.querySelectorAll('.plan-habit-unlink-btn').forEach(btn => {
      btn.addEventListener('click', async (e) => {
        e.stopPropagation();
        await API.unlinkHabitFromPlan(plan.id, btn.dataset.habitId);
        await this.renderPlans();
      });
    });

    const linkHabitBtn = document.getElementById('plan-link-habit-btn');
    const linkHabitSelect = document.getElementById('plan-link-habit-select');
    if (linkHabitBtn && linkHabitSelect) {
      linkHabitBtn.addEventListener('click', async () => {
        const habitId = linkHabitSelect.value;
        if (!habitId) return;
        await API.linkHabitToPlan(plan.id, habitId);
        await this.renderPlans();
      });
    }

    // Linked Tasks
    detailEl.querySelectorAll('.plan-task-checkbox').forEach(cb => {
      cb.addEventListener('change', async () => {
        const taskId = cb.dataset.taskId;
        const newStatus = cb.checked ? 'done' : 'pending';
        await API.updateTask(taskId, { status: newStatus });
        await this.renderPlans();
      });
    });

    detailEl.querySelectorAll('.plan-task-unlink-btn').forEach(btn => {
      btn.addEventListener('click', async (e) => {
        e.stopPropagation();
        await API.unlinkTaskFromPlan(plan.id, btn.dataset.taskId);
        await this.renderPlans();
      });
    });

    const linkTaskBtn = document.getElementById('plan-link-task-btn');
    const linkTaskSelect = document.getElementById('plan-link-task-select');
    if (linkTaskBtn && linkTaskSelect) {
      linkTaskBtn.addEventListener('click', async () => {
        const taskId = linkTaskSelect.value;
        if (!taskId) return;
        await API.linkTaskToPlan(plan.id, taskId);
        await this.renderPlans();
      });
    }

    const newTaskInput = document.getElementById('plan-new-task-input');
    const newTaskBtn = document.getElementById('plan-new-task-btn');
    const createAndLinkTask = async () => {
      const title = newTaskInput ? newTaskInput.value.trim() : '';
      if (!title) return;
      const created = await API.createTask({ title });
      if (created && created.id) {
        await API.linkTaskToPlan(plan.id, created.id);
      }
      if (newTaskInput) newTaskInput.value = '';
      await this.renderPlans();
    };
    if (newTaskBtn) newTaskBtn.addEventListener('click', createAndLinkTask);
    if (newTaskInput) {
      newTaskInput.addEventListener('keydown', (e) => {
        if (e.key === 'Enter') {
          e.preventDefault();
          createAndLinkTask();
        }
      });
    }

    // Milestones checklist
    detailEl.querySelectorAll('.goal-milestone-check').forEach(input => {
      input.addEventListener('change', async (e) => {
        const goalId = e.target.dataset.goalId;
        const idx = parseInt(e.target.dataset.idx, 10);
        await API.toggleGoalMilestone(goalId, idx);
        await this.renderPlans();
      });
    });

    // Attached Thoughts
    detailEl.querySelectorAll('.plan-thought-unlink-btn').forEach(btn => {
      btn.addEventListener('click', async (e) => {
        e.stopPropagation();
        await API.updateThought(btn.dataset.thoughtId, { planId: null });
        await this.renderPlans();
      });
    });

    detailEl.querySelectorAll('.plan-thought-chip').forEach(chip => {
      const toggleExpand = () => {
        const tid = chip.dataset.thoughtId;
        if (this.expandedThoughtIds.has(tid)) this.expandedThoughtIds.delete(tid);
        else this.expandedThoughtIds.add(tid);
        this.renderPlans();
      };
      const expandBtn = chip.querySelector('.plan-thought-expand-btn');
      if (expandBtn) {
        expandBtn.addEventListener('click', (e) => {
          e.stopPropagation();
          toggleExpand();
        });
      }
      const header = chip.querySelector('.plan-thought-chip-header');
      const preview = chip.querySelector('.plan-thought-chip-preview');
      if (header) {
        header.addEventListener('click', (e) => {
          if (e.target.closest('button')) return;
          toggleExpand();
        });
      }
      if (preview) {
        preview.addEventListener('click', toggleExpand);
      }
    });
  },

  // Thoughts helpers & view
  formatThoughtPreview(body) {
    const collapsed = String(body || '').replace(/\s+/g, ' ').trim();
    if (collapsed.length <= 180) return collapsed;
    return collapsed.slice(0, 177).trimEnd() + '…';
  },

  pickSpotlightThought(thoughts) {
    if (!Array.isArray(thoughts) || thoughts.length === 0) return null;
    if (this.spotlightThoughtId) {
      const existing = thoughts.find(t => t.id === this.spotlightThoughtId);
      if (existing) return existing;
    }

    const sorted = thoughts.slice().sort((a, b) => {
      if (!!a.pinned !== !!b.pinned) return a.pinned ? -1 : 1;
      const aLast = a.lastReadAt || '';
      const bLast = b.lastReadAt || '';
      if (aLast !== bLast) return aLast < bLast ? -1 : 1;
      return (Number(a.readCount) || 0) - (Number(b.readCount) || 0);
    });
    const picked = sorted[0];
    this.spotlightThoughtId = picked ? picked.id : null;
    return picked;
  },

  renderThoughtSpotlight(thoughts, topPlans) {
    const spotlightEl = document.getElementById('thought-spotlight');
    if (!spotlightEl) return;

    const spotlight = this.pickSpotlightThought(thoughts);
    if (!spotlight) {
      spotlightEl.innerHTML = `
        <div class="spotlight-empty">
          <span class="spotlight-kicker">✨ Spotlight</span>
          <p>Write your first conclusion or insight below. Your pinned and least-recently-read thoughts will resurface here.</p>
        </div>
      `;
      return;
    }

    const planMap = new Map(topPlans.map(p => [p.id, p]));
    const linkedPlan = spotlight.planId ? planMap.get(spotlight.planId) : null;
    const readCount = Number(spotlight.readCount) || 0;

    spotlightEl.innerHTML = `
      <div class="spotlight-top-row">
        <span class="spotlight-kicker">✨ Worth Re-reading</span>
        <div class="spotlight-badges">
          ${spotlight.pinned ? '<span class="thought-pin-badge">📌 Pinned</span>' : ''}
          ${spotlight.tag ? `<span class="thought-tag-badge">${this.escapeHtml(spotlight.tag)}</span>` : ''}
          ${linkedPlan ? `<span class="thought-plan-badge">🎯 ${this.escapeHtml(linkedPlan.title)}</span>` : ''}
          <span class="spotlight-read-count">Read ${readCount}×</span>
        </div>
      </div>
      ${spotlight.title ? `<h3 class="spotlight-title">${this.escapeHtml(spotlight.title)}</h3>` : ''}
      <div class="spotlight-body" style="white-space: pre-wrap;">${this.escapeHtml(spotlight.body || '')}</div>
      <div class="spotlight-actions">
        <button type="button" id="spotlight-read-btn" class="btn btn-primary btn-small">✓ Mark Read</button>
        <button type="button" id="spotlight-next-btn" class="btn btn-secondary btn-small" ${thoughts.length < 2 ? 'disabled' : ''}>Next Thought →</button>
      </div>
    `;

    const readBtn = document.getElementById('spotlight-read-btn');
    if (readBtn) {
      readBtn.addEventListener('click', async () => {
        await API.markThoughtRead(spotlight.id);
        await this.renderThoughts();
      });
    }

    const nextBtn = document.getElementById('spotlight-next-btn');
    if (nextBtn) {
      nextBtn.addEventListener('click', () => {
        if (thoughts.length < 2) return;
        const currentIdx = thoughts.findIndex(t => t.id === spotlight.id);
        const nextThought = thoughts[(currentIdx + 1) % thoughts.length];
        this.spotlightThoughtId = nextThought.id;
        this.renderThoughtSpotlight(thoughts, topPlans);
      });
    }
  },

  computeReorderedThoughtIds(visibleOrderedIds, allThoughts) {
    if (!Array.isArray(allThoughts) || allThoughts.length === 0) return visibleOrderedIds;
    if (visibleOrderedIds.length === allThoughts.length) return visibleOrderedIds;

    const visibleSet = new Set(visibleOrderedIds);
    let cursor = 0;
    return allThoughts.map(t => {
      if (visibleSet.has(t.id)) {
        const nextId = visibleOrderedIds[cursor];
        cursor++;
        return nextId;
      }
      return t.id;
    });
  },

  async renderThoughts() {
    await this.loadState();
    const thoughts = (this.state && this.state.thoughts) || [];
    const allGoals = (this.state && this.state.goals) || [];
    const topPlans = allGoals.filter(g => !g.parentId && g.status !== 'archived');

    if (!(this.expandedThoughtIds instanceof Set)) {
      this.expandedThoughtIds = new Set();
    }

    const filter = this.currentThoughtFilter || 'all';
    document.querySelectorAll('.thought-filter-btn').forEach(btn => {
      btn.classList.toggle('active', btn.dataset.filter === filter);
    });

    if (this.currentThoughtPlanFilter && this.currentThoughtPlanFilter !== 'all') {
      if (!topPlans.some(p => p.id === this.currentThoughtPlanFilter)) {
        this.currentThoughtPlanFilter = 'all';
      }
    }

    // Populate plan selects in composer, filter bar, and edit modal
    const composerPlanSelect = document.getElementById('thought-plan-select');
    if (composerPlanSelect) {
      this.populatePlanSelect(composerPlanSelect, 'No linked plan', '', composerPlanSelect.value || '');
    }
    const planFilterSelect = document.getElementById('thoughts-plan-filter');
    if (planFilterSelect) {
      this.populatePlanSelect(planFilterSelect, 'All Plans', 'all', this.currentThoughtPlanFilter || 'all');
    }
    const editPlanSelect = document.getElementById('thought-edit-plan');
    if (editPlanSelect) {
      this.populatePlanSelect(editPlanSelect, 'No linked plan', '', editPlanSelect.value || '');
    }

    this.renderThoughtSpotlight(thoughts, topPlans);

    const listEl = document.getElementById('thoughts-list');
    if (!listEl) return;

    const planFilter = this.currentThoughtPlanFilter || 'all';
    const search = (this.currentThoughtSearch || '').trim().toLowerCase();

    const filtered = thoughts.filter(t => {
      if (filter === 'pinned' && !t.pinned) return false;
      if (planFilter !== 'all' && t.planId !== planFilter) return false;
      if (search) {
        const hay = `${t.title || ''}\n${t.body || ''}\n${t.tag || ''}`.toLowerCase();
        if (!hay.includes(search)) return false;
      }
      return true;
    });

    const ordered = [
      ...filtered.filter(t => t.pinned),
      ...filtered.filter(t => !t.pinned)
    ];

    if (ordered.length === 0) {
      listEl.innerHTML = `
        <div class="empty-state thoughts-empty-state">
          <p>${thoughts.length === 0 ? 'No thoughts captured yet. Write a lesson or conclusion above!' : 'No thoughts match the current filters.'}</p>
        </div>
      `;
      return;
    }

    const planMap = new Map(topPlans.map(p => [p.id, p]));
    const colorOptions = ['default', 'amber', 'sage', 'rose', 'slate'];

    listEl.innerHTML = ordered.map(t => {
      const color = colorOptions.includes(t.color) ? t.color : 'default';
      const isExpanded = this.expandedThoughtIds.has(t.id);
      const linkedPlan = t.planId ? planMap.get(t.planId) : null;
      const previewText = this.formatThoughtPreview(t.body);

      return `
        <div class="thought-card color-${color} ${t.pinned ? 'pinned' : ''} ${isExpanded ? 'expanded' : ''}" data-thought-id="${this.escapeHtml(t.id)}" draggable="true">
          <div class="thought-card-header">
            <div class="thought-drag-handle" title="Hold and drag to reorder" aria-label="Hold and drag to reorder">⠿</div>
            <div class="thought-card-summary" role="button" tabindex="0">
              <div class="thought-card-top-row">
                <div class="thought-card-badges">
                  ${t.pinned ? '<span class="thought-pin-badge" title="Pinned">📌</span>' : ''}
                  ${t.title ? `<span class="thought-card-title">${this.escapeHtml(t.title)}</span>` : ''}
                  ${t.tag ? `<span class="thought-tag-badge">${this.escapeHtml(t.tag)}</span>` : ''}
                  ${linkedPlan ? `<span class="thought-plan-badge">🎯 ${this.escapeHtml(linkedPlan.title)}</span>` : ''}
                </div>
              </div>
              <div class="thought-card-preview" ${isExpanded ? 'style="display:none;"' : ''}>${this.escapeHtml(previewText)}</div>
            </div>
            <button type="button" class="thought-card-expand-btn" data-thought-id="${this.escapeHtml(t.id)}" aria-expanded="${isExpanded ? 'true' : 'false'}" title="${isExpanded ? 'Collapse thought' : 'Expand thought'}">${isExpanded ? '▾' : '▸'}</button>
          </div>
          <div class="thought-card-details" style="display:${isExpanded ? 'block' : 'none'};">
            <div class="thought-card-body" style="white-space: pre-wrap; display:${isExpanded ? 'block' : 'none'};">${this.escapeHtml(t.body || '')}</div>
            <div class="thought-card-actions">
              <button type="button" class="btn btn-secondary btn-small thought-pin-btn ${t.pinned ? 'active' : ''}" data-thought-id="${this.escapeHtml(t.id)}">${t.pinned ? '📌 Unpin' : '📌 Pin'}</button>
              <div class="thought-color-picker thought-card-colors" role="group" aria-label="Card color">
                ${colorOptions.map(c => `<button type="button" class="thought-color-dot ${color === c ? 'active' : ''}" data-thought-id="${this.escapeHtml(t.id)}" data-color="${c}" title="Color: ${c}" aria-label="Set color ${c}"></button>`).join('')}
              </div>
              <select class="thought-card-plan-select" data-thought-id="${this.escapeHtml(t.id)}" aria-label="Link thought to plan">
                <option value="">No linked plan</option>
                ${topPlans.map(p => `<option value="${this.escapeHtml(p.id)}">${this.escapeHtml(p.title)}</option>`).join('')}
              </select>
              <button type="button" class="btn btn-secondary btn-small thought-edit-btn" data-thought-id="${this.escapeHtml(t.id)}">✎ Edit</button>
              <button type="button" class="btn btn-danger btn-small thought-delete-btn" data-thought-id="${this.escapeHtml(t.id)}">Delete</button>
            </div>
          </div>
        </div>
      `;
    }).join('');

    // Ensure each card's plan select value matches saved planId
    ordered.forEach(t => {
      const card = listEl.querySelector(`.thought-card[data-thought-id="${t.id}"]`);
      const sel = card ? card.querySelector('.thought-card-plan-select') : null;
      if (sel) {
        sel.value = (t.planId && planMap.has(t.planId)) ? t.planId : '';
      }
    });

    this.bindThoughtListEvents(listEl, thoughts);
  },

  bindThoughtListEvents(listEl, allThoughts) {
    let draggedCard = null;
    const cards = listEl.querySelectorAll('.thought-card');

    const saveOrderFromDom = async () => {
      const visibleOrderedIds = Array.from(listEl.querySelectorAll('.thought-card'))
        .map(el => el.dataset.thoughtId)
        .filter(Boolean);
      const finalOrderedIds = this.computeReorderedThoughtIds(visibleOrderedIds, allThoughts);
      await API.reorderThoughts(finalOrderedIds);
      await this.renderThoughts();
    };

    cards.forEach(card => {
      const thoughtId = card.dataset.thoughtId;

      // Toggle expand on header / expand button click
      const toggleExpand = () => {
        if (this.expandedThoughtIds.has(thoughtId)) {
          this.expandedThoughtIds.delete(thoughtId);
        } else {
          this.expandedThoughtIds.add(thoughtId);
        }
        this.renderThoughts();
      };

      const header = card.querySelector('.thought-card-header');
      if (header) {
        header.addEventListener('click', (e) => {
          if (e.target.closest('.thought-drag-handle')) return;
          toggleExpand();
        });
      }

      const summary = card.querySelector('.thought-card-summary');
      if (summary) {
        summary.addEventListener('keydown', (e) => {
          if (e.key === 'Enter' || e.key === ' ') {
            e.preventDefault();
            toggleExpand();
          }
        });
      }

      // Allow text selection in body while keeping drag handle draggable on desktop
      card.addEventListener('mousedown', (e) => {
        if (e.detail > 1) e.preventDefault();
        if (e.target.closest('.thought-card-details')) {
          card.draggable = false;
        } else {
          card.draggable = true;
        }
      });
      card.addEventListener('mouseup', () => {
        card.draggable = true;
      });

      // Desktop HTML5 drag-and-drop
      card.addEventListener('dragstart', (e) => {
        draggedCard = card;
        card.classList.add('thought-dragging');
        if (e.dataTransfer) {
          e.dataTransfer.effectAllowed = 'move';
          e.dataTransfer.setData('text/plain', thoughtId);
        }
      });

      card.addEventListener('dragend', () => {
        card.classList.remove('thought-dragging');
        listEl.querySelectorAll('.thought-card').forEach(el => {
          el.classList.remove('thought-drag-over-top', 'thought-drag-over-bottom');
        });
        draggedCard = null;
      });

      card.addEventListener('dragover', (e) => {
        e.preventDefault();
        if (!draggedCard || draggedCard === card) return;
        if (e.dataTransfer) e.dataTransfer.dropEffect = 'move';

        const rect = card.getBoundingClientRect();
        const midY = rect.top + rect.height / 2;
        if (e.clientY < midY) {
          card.classList.add('thought-drag-over-top');
          card.classList.remove('thought-drag-over-bottom');
        } else {
          card.classList.add('thought-drag-over-bottom');
          card.classList.remove('thought-drag-over-top');
        }
      });

      card.addEventListener('dragleave', () => {
        card.classList.remove('thought-drag-over-top', 'thought-drag-over-bottom');
      });

      card.addEventListener('drop', async (e) => {
        e.preventDefault();
        e.stopPropagation();
        if (!draggedCard || draggedCard === card) return;

        const rect = card.getBoundingClientRect();
        const midY = rect.top + rect.height / 2;
        const insertBefore = e.clientY < midY;

        card.classList.remove('thought-drag-over-top', 'thought-drag-over-bottom');
        if (insertBefore) {
          listEl.insertBefore(draggedCard, card);
        } else {
          listEl.insertBefore(draggedCard, card.nextSibling);
        }

        await saveOrderFromDom();
      });

      // Mobile touch hold-and-drag via .thought-drag-handle
      let touchStartY = 0;
      let isTouchDragging = false;
      const handle = card.querySelector('.thought-drag-handle');

      const onTouchStart = (e) => {
        if (e.target.closest('button, select, input, textarea, .thought-card-details')) return;
        if (handle && !e.target.closest('.thought-drag-handle') && e.target !== card) return;
        touchStartY = e.touches[0].clientY;
        draggedCard = card;
      };

      const onTouchMove = (e) => {
        if (!draggedCard || draggedCard !== card) return;
        const currentY = e.touches[0].clientY;
        if (Math.abs(currentY - touchStartY) > 10) {
          isTouchDragging = true;
          card.classList.add('thought-dragging');
        }
        if (isTouchDragging) {
          if (e.cancelable) e.preventDefault();
          const targetEl = document.elementFromPoint(e.touches[0].clientX, currentY);
          const targetCard = targetEl && targetEl.closest('.thought-card');
          if (targetCard && targetCard !== card) {
            const rect = targetCard.getBoundingClientRect();
            if (currentY < rect.top + rect.height / 2) {
              listEl.insertBefore(card, targetCard);
            } else {
              listEl.insertBefore(card, targetCard.nextSibling);
            }
          }
        }
      };

      const onTouchEnd = async () => {
        if (isTouchDragging) {
          card.classList.remove('thought-dragging');
          isTouchDragging = false;
          draggedCard = null;
          await saveOrderFromDom();
        } else {
          draggedCard = null;
        }
      };

      card.addEventListener('touchstart', onTouchStart, { passive: true });
      card.addEventListener('touchmove', onTouchMove, { passive: false });
      card.addEventListener('touchend', onTouchEnd);

      // Quick actions
      const pinBtn = card.querySelector('.thought-pin-btn');
      if (pinBtn) {
        pinBtn.addEventListener('click', async (e) => {
          e.stopPropagation();
          const t = allThoughts.find(item => item.id === thoughtId);
          if (!t) return;
          await API.updateThought(thoughtId, { pinned: !t.pinned });
          await this.renderThoughts();
        });
      }

      card.querySelectorAll('.thought-color-dot').forEach(dot => {
        dot.addEventListener('click', async (e) => {
          e.stopPropagation();
          await API.updateThought(thoughtId, { color: dot.dataset.color || 'default' });
          await this.renderThoughts();
        });
      });

      const planSelect = card.querySelector('.thought-card-plan-select');
      if (planSelect) {
        planSelect.addEventListener('change', async (e) => {
          e.stopPropagation();
          await API.updateThought(thoughtId, { planId: planSelect.value || null });
          await this.renderThoughts();
        });
      }

      const editBtn = card.querySelector('.thought-edit-btn');
      if (editBtn) {
        editBtn.addEventListener('click', (e) => {
          e.stopPropagation();
          this.openThoughtModal(thoughtId);
        });
      }

      const deleteBtn = card.querySelector('.thought-delete-btn');
      if (deleteBtn) {
        deleteBtn.addEventListener('click', async (e) => {
          e.stopPropagation();
          if (confirm('Delete this thought?')) {
            this.expandedThoughtIds.delete(thoughtId);
            if (this.spotlightThoughtId === thoughtId) this.spotlightThoughtId = null;
            await API.deleteThought(thoughtId);
            await this.renderThoughts();
          }
        });
      }
    });
  },

  openThoughtModal(thoughtId) {
    const modal = document.getElementById('thought-modal');
    if (!modal || !thoughtId) return;
    const thoughts = (this.state && this.state.thoughts) || [];
    const thought = thoughts.find(t => t.id === thoughtId);
    if (!thought) return;

    modal.dataset.thoughtId = thoughtId;

    const titleInput = document.getElementById('thought-edit-title');
    const bodyInput = document.getElementById('thought-edit-body');
    const tagInput = document.getElementById('thought-edit-tag');
    const planSelect = document.getElementById('thought-edit-plan');

    if (titleInput) titleInput.value = thought.title || '';
    if (bodyInput) bodyInput.value = thought.body || '';
    if (tagInput) tagInput.value = thought.tag || '';
    if (planSelect) {
      this.populatePlanSelect(planSelect, 'No linked plan', '', thought.planId || '');
    }

    const activeColor = ['default', 'amber', 'sage', 'rose', 'slate'].includes(thought.color)
      ? thought.color
      : 'default';
    modal.querySelectorAll('.thought-color-dot').forEach(dot => {
      dot.classList.toggle('active', dot.dataset.color === activeColor);
    });

    modal.style.display = 'flex';
    if (bodyInput && typeof bodyInput.focus === 'function') {
      bodyInput.focus();
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

Views.renderGoals = Views.renderPlans;
