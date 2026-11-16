// API adapter routing calls to local-first IndexedDB engine and Encrypted Sync
const API = {
  // Auth & PIN
  async checkSetup() {
    return Storage.checkSetup();
  },

  async setup(password, pin = null) {
    return Storage.setup(password, pin);
  },

  async login(password) {
    return Storage.loginWithPassword(password);
  },

  async loginWithPin(pin) {
    return Storage.loginWithPin(pin);
  },

  async logout() {
    return Storage.lock();
  },

  async getState() {
    if (!Storage.isUnlocked()) {
      throw new Error('Unauthorized');
    }
    return Storage.getState();
  },

  // Habits
  async createHabit(habit) {
    return Storage.createHabit(habit);
  },

  async updateHabit(id, updates) {
    return Storage.updateHabit(id, updates);
  },

  async deleteHabit(id) {
    return Storage.deleteHabit(id);
  },

  // Cells
  async updateCell(habitId, date, updates) {
    return Storage.updateCell(habitId, date, updates);
  },

  async deleteCell(habitId, date) {
    return Storage.deleteCell(habitId, date);
  },

  // Notes
  async createNote(note) {
    return Storage.createNote(note);
  },

  async updateNote(id, updates) {
    return Storage.updateNote(id, updates);
  },

  async deleteNote(id) {
    return Storage.deleteNote(id);
  },

  // Tasks
  async createTask(task) {
    return Storage.createTask(task);
  },

  async updateTask(id, updates) {
    return Storage.updateTask(id, updates);
  },

  async reorderTasks(orderedIds) {
    return Storage.reorderTasks(orderedIds);
  },

  async markTask(id, date, status) {
    return Storage.markTask(id, date, status);
  },

  async deleteTask(id) {
    return Storage.deleteTask(id);
  },

  // Diary
  async getDiary(date) {
    return Storage.getDiary(date);
  },

  async saveDiary(date, data) {
    return Storage.saveDiary(date, data);
  },

  // Quotes
  async createQuote(quote) {
    return Storage.createQuote(quote);
  },

  async deleteQuote(id) {
    return Storage.deleteQuote(id);
  },

  // Security
  async changePassword(currentPassword, newPassword) {
    return Storage.changePassword(currentPassword, newPassword);
  },

  async changePin(pin) {
    return Storage.changePin(pin);
  },

  // Sync
  async getSyncConfig() {
    return Storage.getSyncConfig();
  },

  async saveSyncConfig(config) {
    return Storage.saveSyncConfig(config);
  },

  async syncNow() {
    return Sync.syncNow();
  },

  // Export / Import
  async exportData() {
    return Storage.exportData();
  },

  async importData(data) {
    return Storage.importData(data);
  }
};
