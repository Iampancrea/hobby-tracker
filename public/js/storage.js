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
      quotes: {}
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
    if (!status) {
      this._cachedPassword = null;
      sessionStorage.removeItem('ht_vault_key');
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
      notes: (state.notes || []).filter(n => !n._deleted),
      quotes: (state.quotes || []).filter(q => !q._deleted)
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

  async deleteTask(id) {
    const state = await this.getState();
    state.tasks = (state.tasks || []).filter(t => t.id !== id);
    if (!state.tombstones) state.tombstones = {};
    if (!state.tombstones.tasks) state.tombstones.tasks = {};
    state.tombstones.tasks[id] = new Date().toISOString();
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
    const state = {
      ...this.defaultState,
      ...importedObj,
      lastModifiedAt: new Date().toISOString()
    };
    await this.saveRawState(state);
    return { success: true };
  }
};

if (typeof module !== 'undefined' && module.exports) {
  module.exports = Storage;
}
