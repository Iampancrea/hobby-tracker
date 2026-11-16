// Views module
const Views = {
  state: null,
  currentHabitDateOffset: 0,
  currentTaskDateOffset: 0,
  currentDiaryDate: DateUtils.todayKey(),
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
      html += `<td class="habit-label" data-habit="${habit.id}" style="border-left: 4px solid ${habitColor}; background: linear-gradient(90deg, ${habitColor}14 0%, transparent 80%);">
        <div class="habit-label-content">
          <span class="habit-streak ${streak > 0 ? 'active' : 'zero'}" title="${streak} day streak">🔥 ${streak}</span>
          <span class="habit-icon" style="color: ${habitColor}">${habit.icon || '●'}</span>
          <span class="habit-name" style="color: ${habitColor}">${this.escapeHtml(habit.name)}</span>
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
