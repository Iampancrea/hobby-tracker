// Local-first IndexedDB storage engine for Hobby Tracker
// Zero server dependencies. Fully functional offline.

// Shared date helpers. User-facing dates must use the device's local
// calendar, not UTC. Using toISOString() here caused the tracker to roll
// over to the next/previous day at the wrong time for many timezones.
const DateUtils = {
  pad(value) {
    return String(value).padStart(2, '0');
  },

  toKey(date = new Date()) {
    const d = date instanceof Date ? date : new Date(date);
    return `${d.getFullYear()}-${this.pad(d.getMonth() + 1)}-${this.pad(d.getDate())}`;
  },

  fromKey(key) {
    const [year, month, day] = String(key).split('-').map(Number);
    return new Date(year, month - 1, day);
  },

  todayKey() {
    return this.toKey(new Date());
  },

  addDays(key, days) {
    const date = this.fromKey(key);
    date.setDate(date.getDate() + Number(days || 0));
    return this.toKey(date);
  },

  compare(a, b) {
    return String(a).localeCompare(String(b));
  }
};

const Storage = {
  dbName: 'HobbyTrackerVault',
  dbVersion: 1,
  db: null,
  changeListeners: [],

  // Initial default state
  defaultState: {
    config: {},
    habits: [],
    cells: {},
    notes: [],
    tasks: [],
    goals: [],
    thoughts: [],
    diary: {},
    quotes: [
      { id: 'q_seed_1', text: 'Discipline is choosing what you want most over what you want now.', author: 'Unknown', custom: false, updatedAt: new Date().toISOString() },
      { id: 'q_seed_2', text: 'Small days build the life you\'re looking for.', author: 'Unknown', custom: false, updatedAt: new Date().toISOString() },
      { id: 'q_seed_3', text: 'We are what we repeatedly do. Excellence, then, is not an act, but a habit.', author: 'Will Durant', custom: false, updatedAt: new Date().toISOString() }
    ],
    tombstones: {
      habits: {},
      tasks: {},
      notes: {},
      quotes: {},
      goals: {},
      thoughts: {}
    },
    lastModifiedAt: new Date().toISOString()
  },

  async init() {
    if (this.db) return this.db;

    return new Promise((resolve, reject) => {
      const request = indexedDB.open(this.dbName, this.dbVersion);

      request.onupgradeneeded = (event) => {
        const db = event.target.result;
        if (!db.objectStoreNames.contains('kv')) {
          db.createObjectStore('kv');
        }
        if (!db.objectStoreNames.contains('state')) {
          db.createObjectStore('state');
        }
      };

      request.onsuccess = async (event) => {
        this.db = event.target.result;
        // Ensure state is initialized
        const state = await this.getRawState();
        if (!state) {
          await this.saveRawState(JSON.parse(JSON.stringify(this.defaultState)));
        }
        resolve(this.db);
      };

      request.onerror = (event) => {
        console.error('IndexedDB open error:', event.target.error);
        reject(event.target.error);
      };
    });
  },

  // --- IndexedDB low-level helpers ---
  async getKV(key) {
    await this.init();
    return new Promise((resolve, reject) => {
      const tx = this.db.transaction('kv', 'readonly');
      const store = tx.objectStore('kv');
      const req = store.get(key);
      req.onsuccess = () => resolve(req.result);
      req.onerror = () => reject(req.error);
    });
  },

  async setKV(key, value) {
    await this.init();
    return new Promise((resolve, reject) => {
      const tx = this.db.transaction('kv', 'readwrite');
      const store = tx.objectStore('kv');
      const req = store.put(value, key);
      req.onsuccess = () => resolve();
      req.onerror = () => reject(req.error);
    });
  },

  async getRawState() {
    await this.init();
    return new Promise((resolve, reject) => {
      const tx = this.db.transaction('state', 'readonly');
      const store = tx.objectStore('state');
      const req = store.get('main');
      req.onsuccess = () => resolve(req.result);
      req.onerror = () => reject(req.error);
    });
  },

  async saveRawState(state) {
    state.lastModifiedAt = new Date().toISOString();
    if (this.db && this.db._stores && this.db._stores.get('state')) {
      this.db._stores.get('state').set('main', structuredClone(state));
    }
    await this.init();
    return new Promise((resolve, reject) => {
      const tx = this.db.transaction('state', 'readwrite');
      const store = tx.objectStore('state');
      const req = store.put(state, 'main');
      req.onsuccess = () => {
        resolve(state);
        this.notifyChange(state);
      };
      req.onerror = () => reject(req.error);
    });
  },

  subscribeToChanges(fn) {
    this.changeListeners.push(fn);
  },

  notifyChange(state) {
    for (const fn of this.changeListeners) {
      try { fn(state); } catch (e) { console.error('Change listener error:', e); }
    }
  },

  // --- Auth & PIN Security ---
  async checkSetup() {
    const auth = await this.getKV('auth');
    return {
      passwordSet: !!(auth && auth.masterHash),
      hasPin: !!(auth && auth.pinHash)
    };
  },

  async setup(masterPassword, pin = null) {
    if (!masterPassword || masterPassword.length < 4) {
      throw new Error('Master password must be at least 4 characters');
    }
    const masterSalt = CryptoUtils.generateSalt(16);
    const masterHash = await CryptoUtils.sha256(masterPassword, masterSalt);

    let pinHash = null;
    let pinSalt = null;
    let wrappedMasterKey = null;
    if (pin && pin.length >= 4) {
      pinSalt = CryptoUtils.generateSalt(16);
      pinHash = await CryptoUtils.sha256(pin, pinSalt);
      wrappedMasterKey = await CryptoUtils.encrypt({ masterPassword }, pin, pinSalt);
    }

    const authData = {
      masterHash,
      masterSalt,
      pinHash,
      pinSalt,
      wrappedMasterKey,
      configuredAt: new Date().toISOString()
    };

    await this.setKV('auth', authData);
    await this.setUnlocked(true, masterPassword);
    return { success: true };
  },

  async loginWithPassword(password) {
    const auth = await this.getKV('auth');
    if (!auth || !auth.masterHash) throw new Error('App not set up yet');

    const hash = await CryptoUtils.sha256(password, auth.masterSalt);
    if (hash !== auth.masterHash) {
      throw new Error('Incorrect master password');
    }

    await this.setUnlocked(true, password);
    return { success: true };
  },

  async loginWithPin(pin) {
    const auth = await this.getKV('auth');
    if (!auth || !auth.pinHash) {
      throw new Error('PIN not configured. Please use master password.');
    }

    const hash = await CryptoUtils.sha256(pin, auth.pinSalt);
    if (hash !== auth.pinHash) {
      throw new Error('Incorrect PIN');
    }

    let masterPassword = null;
    if (auth.wrappedMasterKey) {
      try {
        const unwrapped = await CryptoUtils.decrypt(auth.wrappedMasterKey, pin);
        if (unwrapped && unwrapped.masterPassword) {
          masterPassword = unwrapped.masterPassword;
        }
      } catch (e) {
        console.warn('Could not unwrap master key from PIN:', e);
      }
    }

    if (pin) {
      sessionStorage.setItem('ht_session_pin', pin);
    }

    await this.setUnlocked(true, masterPassword);
    return { success: true };
  },

  // Cached in session memory while open
  _cachedPassword: null,
  _unlocked: false,

  async setUnlocked(status, password = null) {
    this._unlocked = !!status;
    if (password) {
      this._cachedPassword = password;
      sessionStorage.setItem('ht_vault_key', password);
    }
    if (status) {
      sessionStorage.setItem('ht_session_unlocked', '1');
    } else {
      this._cachedPassword = null;
      sessionStorage.removeItem('ht_vault_key');
      sessionStorage.removeItem('ht_session_unlocked');
      sessionStorage.removeItem('ht_session_pin');
    }
  },

  isUnlocked() {
    if (this._unlocked) return true;
    const stored = sessionStorage.getItem('ht_vault_key');
    if (stored) {
      this._cachedPassword = stored;
      this._unlocked = true;
      return true;
    }
    if (sessionStorage.getItem('ht_session_unlocked') === '1') {
      this._unlocked = true;
      return true;
    }
    return false;
  },

  getMasterPassword() {
    return this._cachedPassword || sessionStorage.getItem('ht_vault_key');
  },

  async lock() {
    await this.setUnlocked(false);
  },

  async changePin(pin) {
    const auth = await this.getKV('auth') || {};
    if (!pin) {
      auth.pinHash = null;
      auth.pinSalt = null;
      auth.wrappedMasterKey = null;
    } else {
      if (pin.length < 4) throw new Error('PIN must be at least 4 digits');
      auth.pinSalt = CryptoUtils.generateSalt(16);
      auth.pinHash = await CryptoUtils.sha256(pin, auth.pinSalt);
      const masterPassword = this.getMasterPassword();
      if (masterPassword) {
        auth.wrappedMasterKey = await CryptoUtils.encrypt({ masterPassword }, pin, auth.pinSalt);
      }
    }
    await this.setKV('auth', auth);
    return { success: true };
  },

  async changePassword(currentPassword, newPassword) {
    const auth = await this.getKV('auth');
    if (!auth) throw new Error('App not set up yet');

    const currentHash = await CryptoUtils.sha256(currentPassword, auth.masterSalt);
    if (currentHash !== auth.masterHash) {
      throw new Error('Current master password is incorrect');
    }

    if (!newPassword || newPassword.length < 4) {
      throw new Error('New password must be at least 4 characters');
    }

    auth.masterSalt = CryptoUtils.generateSalt(16);
    auth.masterHash = await CryptoUtils.sha256(newPassword, auth.masterSalt);
    await this.setKV('auth', auth);
    await this.setUnlocked(true, newPassword);
    return { success: true };
  },

  // --- Main Tracker State Operations ---
  async getState() {
    let state = await this.getRawState();
    if (!state) {
      state = JSON.parse(JSON.stringify(this.defaultState));
      await this.saveRawState(state);
    }
    // Clean deleted items for the frontend view
    const cleaned = {
      ...state,
      habits: (state.habits || []).filter(h => !h._deleted),
      tasks: (state.tasks || []).filter(t => !t._deleted),
      goals: (state.goals || []).filter(g => !g._deleted),
      notes: (state.notes || []).filter(n => !n._deleted),
      quotes: (state.quotes || []).filter(q => !q._deleted),
      thoughts: (state.thoughts || []).filter(th => !th._deleted)
    };
    return cleaned;
  },

  _sanitizeColor(color) {
    if (!color || typeof color !== 'string') return '#3fa34d';
    color = color.trim();
    if (/^#[0-9a-fA-F]{6}$/.test(color)) return color;
    if (/^#[0-9a-fA-F]{3}$/.test(color)) {
      return '#' + color[1] + color[1] + color[2] + color[2] + color[3] + color[3];
    }
    return '#3fa34d';
  },

  // Habits
  async createHabit(habitData) {
    const state = await this.getState();
    const now = new Date().toISOString();
    const habit = {
      id: 'h_' + Date.now() + '_' + Math.random().toString(36).substr(2, 6),
      name: habitData.name,
      icon: habitData.icon || '●',
      color: this._sanitizeColor(habitData.color),
      archived: false,
      createdAt: now,
      updatedAt: now
    };
    state.habits.push(habit);
    await this.saveRawState(state);
    return habit;
  },

  async updateHabit(id, updates) {
    const state = await this.getState();
    const habit = state.habits.find(h => h.id === id);
    if (!habit) throw new Error('Habit not found');
    const cleanUpdates = { ...updates };
    if ('color' in cleanUpdates) {
      cleanUpdates.color = this._sanitizeColor(cleanUpdates.color);
    }
    Object.assign(habit, cleanUpdates, { updatedAt: new Date().toISOString() });
    await this.saveRawState(state);
    return habit;
  },

  async deleteHabit(id) {
    const state = await this.getState();
    const now = new Date().toISOString();
    state.habits = (state.habits || []).filter(h => h.id !== id);
    if (!state.tombstones) state.tombstones = {};
    if (!state.tombstones.habits) state.tombstones.habits = {};
    state.tombstones.habits[id] = now;

    // Purge or tombstone associated notes
    if (state.notes) {
      if (!state.tombstones.notes) state.tombstones.notes = {};
      const habitNotes = state.notes.filter(n => n.habitId === id);
      for (const n of habitNotes) {
        state.tombstones.notes[n.id] = now;
      }
      state.notes = state.notes.filter(n => n.habitId !== id);
    }

    // Clean up habit cells
    if (state.cells) {
      for (const key of Object.keys(state.cells)) {
        if (key.startsWith(`${id}|`)) {
          delete state.cells[key];
        }
      }
    }

    // Strip deleted habit from every plan's linkedHabitIds
    this._stripLinkedIdFromGoals(state, 'linkedHabitIds', id, now);

    await this.saveRawState(state);
    return { success: true };
  },

  // Cells
  async updateCell(habitId, date, updates) {
    const todayStr = DateUtils.todayKey();
    if (date > todayStr && updates && updates.status && updates.status !== 'empty') {
      throw new Error('Cannot set status for future dates');
    }

    const state = await this.getState();
    if (!state.cells) state.cells = {};
    const key = `${habitId}|${date}`;
    const existing = state.cells[key] || { habitId, date, status: 'empty' };
    const updated = {
      ...existing,
      ...updates,
      habitId,
      date,
      updatedAt: new Date().toISOString()
    };
    state.cells[key] = updated;
    await this.saveRawState(state);
    return updated;
  },

  async setHabitStatus(habitId, date, status) {
    const todayStr = DateUtils.todayKey();
    if (date > todayStr && status && status !== 'empty') {
      throw new Error('Cannot set status for future dates');
    }
    return this.updateCell(habitId, date, { status });
  },

  async deleteCell(habitId, date) {
    const state = await this.getState();
    if (state.cells) {
      delete state.cells[`${habitId}|${date}`];
      await this.saveRawState(state);
    }
    return { success: true };
  },

  // Notes
  async createNote(noteData) {
    const state = await this.getState();
    if (!state.notes) state.notes = [];
    const now = new Date().toISOString();
    const note = {
      id: 'n_' + Date.now() + '_' + Math.random().toString(36).substr(2, 6),
      habitId: noteData.habitId || null,
      date: noteData.date || null,
      type: noteData.type || 'default',
      text: noteData.text || '',
      createdAt: now,
      updatedAt: now
    };
    state.notes.push(note);

    // Link note.id to corresponding cell
    if (noteData.habitId && noteData.date) {
      if (!state.cells) state.cells = {};
      const cellKey = `${noteData.habitId}|${noteData.date}`;
      const existing = state.cells[cellKey] || { habitId: noteData.habitId, date: noteData.date, status: 'empty' };
      state.cells[cellKey] = {
        ...existing,
        noteId: note.id,
        updatedAt: now
      };
    }

    await this.saveRawState(state);
    return note;
  },

  async updateNote(id, updates) {
    const state = await this.getState();
    const note = (state.notes || []).find(n => n.id === id);
    if (!note) throw new Error('Note not found');
    Object.assign(note, updates, { updatedAt: new Date().toISOString() });
    await this.saveRawState(state);
    return note;
  },

  async deleteNote(id) {
    const state = await this.getState();
    const note = (state.notes || []).find(n => n.id === id);
    state.notes = (state.notes || []).filter(n => n.id !== id);
    if (!state.tombstones) state.tombstones = {};
    if (!state.tombstones.notes) state.tombstones.notes = {};
    state.tombstones.notes[id] = new Date().toISOString();

    // Clear noteId from state.cells
    if (state.cells) {
      for (const key of Object.keys(state.cells)) {
        if (state.cells[key] && state.cells[key].noteId === id) {
          delete state.cells[key].noteId;
          state.cells[key].updatedAt = new Date().toISOString();
        }
      }
    }

    await this.saveRawState(state);
    return { success: true };
  },

  async getNotes(habitId = null, date = null) {
    const state = await this.getState();
    let notes = state.notes || [];
    if (habitId) notes = notes.filter(n => n.habitId === habitId);
    if (date) notes = notes.filter(n => n.date === date);
    return notes;
  },

  // Tasks
  async createTask(taskData) {
    const state = await this.getState();
    if (!state.tasks) state.tasks = [];
    const now = new Date().toISOString();
    const task = {
      id: 't_' + Date.now() + '_' + Math.random().toString(36).substr(2, 6),
      title: taskData.title,
      status: taskData.status || 'pending',
      archived: !!taskData.archived,
      createdAt: now,
      updatedAt: now,
      history: taskData.history || {}
    };
    state.tasks.push(task);
    await this.saveRawState(state);
    return task;
  },

  async setTaskStatus(id, status) {
    return this.updateTask(id, { status });
  },

  async updateTask(id, updates) {
    const state = await this.getState();
    const task = (state.tasks || []).find(t => t.id === id);
    if (!task) throw new Error('Task not found');
    Object.assign(task, updates, { updatedAt: new Date().toISOString() });
    await this.saveRawState(state);
    return task;
  },

  async markTask(id, date, status) {
    const state = await this.getState();
    const task = (state.tasks || []).find(t => t.id === id);
    if (!task) throw new Error('Task not found');
    if (!task.history) task.history = {};
    task.history[date] = {
      status,
      updatedAt: new Date().toISOString()
    };
    task.updatedAt = new Date().toISOString();
    await this.saveRawState(state);
    return task;
  },

  async reorderTasks(orderedIds) {
    const state = await this.getState();
    if (!state.tasks || !Array.isArray(state.tasks)) return [];
    const taskMap = new Map(state.tasks.map(t => [t.id, t]));
    const reordered = [];
    for (const id of orderedIds) {
      const task = taskMap.get(id);
      if (task) {
        reordered.push(task);
        taskMap.delete(id);
      }
    }
    for (const remaining of taskMap.values()) {
      reordered.push(remaining);
    }
    state.tasks = reordered;
    await this.saveRawState(state);
    return state.tasks;
  },

  async deleteTask(id) {
    const state = await this.getState();
    const now = new Date().toISOString();
    state.tasks = (state.tasks || []).filter(t => t.id !== id);
    if (!state.tombstones) state.tombstones = {};
    if (!state.tombstones.tasks) state.tombstones.tasks = {};
    state.tombstones.tasks[id] = now;

    // Strip deleted task from every plan's linkedTaskIds
    this._stripLinkedIdFromGoals(state, 'linkedTaskIds', id, now);

    await this.saveRawState(state);
    return { success: true };
  },

  // Diary
  async getDiary(date) {
    const state = await this.getState();
    if (!state.diary) state.diary = {};
    return state.diary[date] || { entry: '', tasks: [], mood: null, updatedAt: null };
  },

  async saveDiary(date, diaryData) {
    const state = await this.getState();
    if (!state.diary) state.diary = {};
    state.diary[date] = {
      ...diaryData,
      updatedAt: new Date().toISOString()
    };
    await this.saveRawState(state);
    return state.diary[date];
  },

  // Quotes
  async createQuote(quoteData) {
    const state = await this.getState();
    if (!state.quotes) state.quotes = [];
    const now = new Date().toISOString();
    const quote = {
      id: 'q_' + Date.now(),
      text: quoteData.text,
      author: quoteData.author || 'Unknown',
      custom: true,
      createdAt: now,
      updatedAt: now
    };
    state.quotes.push(quote);
    await this.saveRawState(state);
    return quote;
  },

  async deleteQuote(id) {
    const state = await this.getState();
    state.quotes = (state.quotes || []).filter(q => q.id !== id);
    if (!state.tombstones) state.tombstones = {};
    if (!state.tombstones.quotes) state.tombstones.quotes = {};
    state.tombstones.quotes[id] = new Date().toISOString();
    await this.saveRawState(state);
    return { success: true };
  },

  // Goals & Plans
  _normalizeIdArray(value) {
    if (!Array.isArray(value)) return [];
    return Array.from(new Set(value.filter(Boolean).map(String)));
  },

  _stripLinkedIdFromGoals(state, field, entityId, now) {
    if (!Array.isArray(state.goals)) return;
    for (const goal of state.goals) {
      if (Array.isArray(goal[field]) && goal[field].includes(entityId)) {
        goal[field] = goal[field].filter(itemId => itemId !== entityId);
        goal.updatedAt = now;
      }
    }
  },

  async _linkEntityToPlan(planId, entityId, field, entityLabel) {
    if (!planId) throw new Error('Plan ID is required');
    if (!entityId) throw new Error(`${entityLabel} ID is required`);
    const state = await this.getState();
    const plan = (state.goals || []).find(g => g.id === planId);
    if (!plan) throw new Error('Plan not found');
    if (!Array.isArray(plan[field])) plan[field] = [];
    const strId = String(entityId);
    if (!plan[field].includes(strId)) {
      plan[field].push(strId);
      plan.updatedAt = new Date().toISOString();
      await this.saveRawState(state);
    }
    return plan;
  },

  async _unlinkEntityFromPlan(planId, entityId, field) {
    if (!planId) throw new Error('Plan ID is required');
    const state = await this.getState();
    const plan = (state.goals || []).find(g => g.id === planId);
    if (!plan) throw new Error('Plan not found');
    const prev = Array.isArray(plan[field]) ? plan[field] : [];
    const strId = String(entityId);
    const next = prev.filter(itemId => itemId !== strId);
    if (next.length !== prev.length || !Array.isArray(plan[field])) {
      plan[field] = next;
      plan.updatedAt = new Date().toISOString();
      await this.saveRawState(state);
    }
    return plan;
  },

  async createGoal(goalData = {}) {
    const state = await this.getState();
    if (!state.goals) state.goals = [];
    const now = new Date().toISOString();
    const data = goalData || {};
    const parsedOrder = (data.order !== undefined && data.order !== null && data.order !== '' && Number.isFinite(Number(data.order)))
      ? Number(data.order)
      : state.goals.length;
    const goal = {
      id: 'g_' + Date.now() + '_' + Math.random().toString(36).substr(2, 6),
      title: data.title || '',
      category: data.category || 'quick', // 'quick' | 'mid' | 'long'
      tag: data.tag || 'General',
      targetDate: data.targetDate || '',
      progress: Number(data.progress) || 0,
      status: data.status || 'active', // 'active' | 'completed' | 'archived'
      description: data.description || '',
      milestones: Array.isArray(data.milestones) ? data.milestones : [],
      parentId: data.parentId ? String(data.parentId) : null,
      strategy: data.strategy != null ? String(data.strategy) : '',
      linkedHabitIds: this._normalizeIdArray(data.linkedHabitIds),
      linkedTaskIds: this._normalizeIdArray(data.linkedTaskIds),
      order: parsedOrder,
      createdAt: now,
      updatedAt: now
    };
    state.goals.push(goal);
    await this.saveRawState(state);
    return goal;
  },

  async updateGoal(id, updates = {}) {
    const state = await this.getState();
    const idx = (state.goals || []).findIndex(g => g.id === id);
    if (idx === -1) throw new Error('Goal not found');
    const goal = state.goals[idx];
    const cleanUpdates = { ...(updates || {}) };

    if ('parentId' in cleanUpdates) {
      cleanUpdates.parentId = (cleanUpdates.parentId && String(cleanUpdates.parentId) !== id)
        ? String(cleanUpdates.parentId)
        : null;
    }
    if ('strategy' in cleanUpdates) {
      cleanUpdates.strategy = cleanUpdates.strategy != null ? String(cleanUpdates.strategy) : '';
    }
    if ('linkedHabitIds' in cleanUpdates) {
      cleanUpdates.linkedHabitIds = this._normalizeIdArray(cleanUpdates.linkedHabitIds);
    }
    if ('linkedTaskIds' in cleanUpdates) {
      cleanUpdates.linkedTaskIds = this._normalizeIdArray(cleanUpdates.linkedTaskIds);
    }
    if ('order' in cleanUpdates) {
      const num = Number(cleanUpdates.order);
      if (cleanUpdates.order !== '' && cleanUpdates.order !== null && Number.isFinite(num)) {
        cleanUpdates.order = num;
      } else {
        delete cleanUpdates.order;
      }
    }

    // Preserve schema defaults on legacy goals when updated
    if (!('parentId' in goal)) goal.parentId = null;
    if (!('strategy' in goal)) goal.strategy = '';
    if (!Array.isArray(goal.linkedHabitIds)) goal.linkedHabitIds = [];
    if (!Array.isArray(goal.linkedTaskIds)) goal.linkedTaskIds = [];
    if (typeof goal.order !== 'number' || !Number.isFinite(goal.order)) goal.order = idx;

    Object.assign(goal, cleanUpdates, { id, updatedAt: new Date().toISOString() });
    await this.saveRawState(state);
    return goal;
  },

  async toggleGoalMilestone(id, milestoneIdx) {
    const state = await this.getState();
    const goal = (state.goals || []).find(g => g.id === id);
    if (!goal) throw new Error('Goal not found');
    if (goal.milestones && goal.milestones[milestoneIdx]) {
      goal.milestones[milestoneIdx].done = !goal.milestones[milestoneIdx].done;
      const total = goal.milestones.length;
      const doneCount = goal.milestones.filter(m => m.done).length;
      goal.progress = total > 0 ? Math.round((doneCount / total) * 100) : (goal.milestones[milestoneIdx].done ? 100 : 0);
      if (goal.progress === 100 && goal.status === 'active') {
        goal.status = 'completed';
      } else if (goal.progress < 100 && goal.status === 'completed') {
        goal.status = 'active';
      }
      goal.updatedAt = new Date().toISOString();
      await this.saveRawState(state);
    }
    return goal;
  },

  async deleteGoal(id) {
    const state = await this.getState();
    const now = new Date().toISOString();
    state.goals = (state.goals || []).filter(g => g.id !== id);
    if (!state.tombstones) state.tombstones = {};
    if (!state.tombstones.goals) state.tombstones.goals = {};
    state.tombstones.goals[id] = now;

    // Detach nested quick goals so none are orphaned
    for (const g of state.goals) {
      if (g.parentId === id) {
        g.parentId = null;
        g.updatedAt = now;
      }
    }

    // Detach linked thoughts so none are orphaned
    if (Array.isArray(state.thoughts)) {
      for (const th of state.thoughts) {
        if (th.planId === id) {
          th.planId = null;
          th.updatedAt = now;
        }
      }
    }

    await this.saveRawState(state);
    return { success: true };
  },

  async linkHabitToPlan(planId, habitId) {
    return this._linkEntityToPlan(planId, habitId, 'linkedHabitIds', 'Habit');
  },

  async unlinkHabitFromPlan(planId, habitId) {
    return this._unlinkEntityFromPlan(planId, habitId, 'linkedHabitIds');
  },

  async linkTaskToPlan(planId, taskId) {
    return this._linkEntityToPlan(planId, taskId, 'linkedTaskIds', 'Task');
  },

  async unlinkTaskFromPlan(planId, taskId) {
    return this._unlinkEntityFromPlan(planId, taskId, 'linkedTaskIds');
  },

  // Thoughts
  _sanitizeThoughtColor(color) {
    const allowed = ['default', 'amber', 'sage', 'rose', 'slate'];
    if (typeof color !== 'string') return 'default';
    const normalized = color.trim().toLowerCase();
    return allowed.includes(normalized) ? normalized : 'default';
  },

  async createThought(thoughtData = {}) {
    const data = thoughtData || {};
    const body = typeof data.body === 'string' ? data.body.trim() : '';
    if (!body) {
      throw new Error('Thought body cannot be empty');
    }

    const state = await this.getState();
    if (!state.thoughts) state.thoughts = [];
    const now = new Date().toISOString();
    const thought = {
      id: 'th_' + Date.now() + '_' + Math.random().toString(36).substr(2, 6),
      title: data.title != null ? String(data.title).trim() : '',
      body,
      tag: data.tag != null ? String(data.tag).trim() : '',
      color: this._sanitizeThoughtColor(data.color),
      pinned: !!data.pinned,
      expanded: !!data.expanded,
      planId: data.planId ? String(data.planId) : null,
      readCount: 0,
      lastReadAt: null,
      createdAt: now,
      updatedAt: now
    };
    state.thoughts.unshift(thought);
    await this.saveRawState(state);
    return thought;
  },

  async updateThought(id, updates = {}) {
    const state = await this.getState();
    const thought = (state.thoughts || []).find(t => t.id === id);
    if (!thought) throw new Error('Thought not found');

    const cleanUpdates = { ...(updates || {}) };
    if ('body' in cleanUpdates) {
      const body = typeof cleanUpdates.body === 'string' ? cleanUpdates.body.trim() : '';
      if (!body) throw new Error('Thought body cannot be empty');
      cleanUpdates.body = body;
    }
    if ('title' in cleanUpdates) {
      cleanUpdates.title = cleanUpdates.title != null ? String(cleanUpdates.title).trim() : '';
    }
    if ('tag' in cleanUpdates) {
      cleanUpdates.tag = cleanUpdates.tag != null ? String(cleanUpdates.tag).trim() : '';
    }
    if ('color' in cleanUpdates) {
      cleanUpdates.color = this._sanitizeThoughtColor(cleanUpdates.color);
    }
    if ('pinned' in cleanUpdates) {
      cleanUpdates.pinned = !!cleanUpdates.pinned;
    }
    if ('expanded' in cleanUpdates) {
      cleanUpdates.expanded = !!cleanUpdates.expanded;
    }
    if ('planId' in cleanUpdates) {
      cleanUpdates.planId = cleanUpdates.planId ? String(cleanUpdates.planId) : null;
    }

    Object.assign(thought, cleanUpdates, { id, updatedAt: new Date().toISOString() });
    await this.saveRawState(state);
    return thought;
  },

  async deleteThought(id) {
    const state = await this.getState();
    state.thoughts = (state.thoughts || []).filter(t => t.id !== id);
    if (!state.tombstones) state.tombstones = {};
    if (!state.tombstones.thoughts) state.tombstones.thoughts = {};
    state.tombstones.thoughts[id] = new Date().toISOString();
    await this.saveRawState(state);
    return { success: true };
  },

  async reorderThoughts(orderedIds) {
    const state = await this.getState();
    if (!state.thoughts || !Array.isArray(state.thoughts)) return [];
    const ids = Array.isArray(orderedIds) ? orderedIds : [];
    const thoughtMap = new Map(state.thoughts.map(t => [t.id, t]));
    const reordered = [];
    for (const id of ids) {
      const thought = thoughtMap.get(id);
      if (thought) {
        reordered.push(thought);
        thoughtMap.delete(id);
      }
    }
    for (const remaining of thoughtMap.values()) {
      reordered.push(remaining);
    }
    state.thoughts = reordered;
    await this.saveRawState(state);
    return state.thoughts;
  },

  async markThoughtRead(id) {
    const state = await this.getState();
    const thought = (state.thoughts || []).find(t => t.id === id);
    if (!thought) throw new Error('Thought not found');
    const now = new Date().toISOString();
    thought.lastReadAt = now;
    thought.readCount = (Number(thought.readCount) || 0) + 1;
    thought.updatedAt = now;
    await this.saveRawState(state);
    return thought;
  },

  // Settings & Sync configuration
  async getSyncConfig() {
    const config = await this.getKV('syncConfig');
    return config || {
      token: '',
      gistId: '',
      autoSync: true,
      lastSyncedAt: null
    };
  },

  async saveSyncConfig(config) {
    const current = await this.getSyncConfig();
    const updated = { ...current, ...config };
    await this.setKV('syncConfig', updated);
    return updated;
  },

  // Export / Import
  async exportData() {
    const state = await this.getState();
    const jsonStr = JSON.stringify(state, null, 2);
    return new Blob([jsonStr], { type: 'application/json' });
  },

  async importData(importedObj) {
    if (!importedObj || typeof importedObj !== 'object') {
      throw new Error('Invalid backup file');
    }
    const baseDefaults = JSON.parse(JSON.stringify(this.defaultState));
    const state = {
      ...baseDefaults,
      ...importedObj,
      thoughts: Array.isArray(importedObj.thoughts) ? importedObj.thoughts : [],
      tombstones: {
        ...baseDefaults.tombstones,
        ...(importedObj.tombstones || {})
      },
      lastModifiedAt: new Date().toISOString()
    };
    await this.saveRawState(state);
    return { success: true };
  }
};

if (typeof module !== 'undefined' && module.exports) {
  module.exports = Storage;
}
