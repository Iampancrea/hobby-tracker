// End-to-End Encrypted Cloud Sync Engine via GitHub Private Gist
// Zero hosting costs. 100% private. Smart entity-level auto-merge.
const Sync = {
  status: 'idle', // 'idle' | 'syncing' | 'synced' | 'error' | 'offline'
  lastError: null,
  statusListeners: [],
  autoSyncTimer: null,
  syncDebounceTimer: null,
  GIST_FILENAME: 'hobby_tracker_vault.json.enc',

  init() {
    // Listen for online/offline events
    window.addEventListener('online', () => {
      this.setStatus('idle');
      this.syncNow();
    });

    window.addEventListener('offline', () => {
      this.setStatus('offline');
    });

    // Listen for local storage changes to trigger debounced sync
    Storage.subscribeToChanges(() => {
      if (this.status !== 'syncing') {
        this.triggerDebouncedSync();
      }
    });

    // Periodic auto-sync every 5 minutes when active and online
    if (this.autoSyncTimer) clearInterval(this.autoSyncTimer);
    this.autoSyncTimer = setInterval(() => {
      if (navigator.onLine && Storage.isUnlocked()) {
        this.syncNow({ background: true });
      }
    }, 5 * 60 * 1000);
  },

  onStatusChange(fn) {
    this.statusListeners.push(fn);
    fn(this.status, this.lastError);
  },

  setStatus(status, error = null) {
    this.status = status;
    this.lastError = error;
    for (const fn of this.statusListeners) {
      try { fn(this.status, this.lastError); } catch (e) { console.error('Status listener error:', e); }
    }
  },

  triggerDebouncedSync() {
    clearTimeout(this.syncDebounceTimer);
    this.syncDebounceTimer = setTimeout(async () => {
      const config = await Storage.getSyncConfig();
      if (config.token && config.autoSync && navigator.onLine && Storage.isUnlocked()) {
        this.syncNow({ background: true });
      }
    }, 3000);
  },

  // GitHub API request helper
  async ghRequest(endpoint, token, method = 'GET', body = null) {
    const headers = {
      'Authorization': `Bearer ${token.trim()}`,
      'Accept': 'application/vnd.github.v3+json',
      'X-GitHub-Api-Version': '2022-11-28',
      'Content-Type': 'application/json'
    };

    const options = { method, headers };
    if (body) options.body = JSON.stringify(body);

    const res = await fetch(`https://api.github.com${endpoint}`, options);
    if (!res.ok) {
      const err = await res.json().catch(() => ({ message: res.statusText }));
      throw new Error(err.message || `GitHub API error (${res.status})`);
    }
    return res.json();
  },

  // Locate or create the private gist
  async getOrCreateGist(token, cachedGistId = null) {
    if (cachedGistId) {
      try {
        const gist = await this.ghRequest(`/gists/${cachedGistId}`, token);
        if (gist && gist.files && gist.files[this.GIST_FILENAME]) {
          return gist;
        }
      } catch (e) {
        console.warn('Cached gist not found or inaccessible, searching existing gists...', e);
      }
    }

    // Search user's recent gists for the filename
    const gists = await this.ghRequest('/gists?per_page=100', token);
    const existing = gists.find(g => g.files && g.files[this.GIST_FILENAME]);
    if (existing) {
      return this.ghRequest(`/gists/${existing.id}`, token);
    }

    // Create a new secret gist
    const newGist = await this.ghRequest('/gists', token, 'POST', {
      description: 'Hobby Tracker Encrypted Vault (Zero-Knowledge)',
      public: false,
      files: {
        [this.GIST_FILENAME]: {
          content: JSON.stringify({ initial: true, createdAt: new Date().toISOString() })
        }
      }
    });

    return newGist;
  },

  // Smart Entity-Level Auto-Merge Algorithm
  mergeStates(local, remote) {
    const merged = JSON.parse(JSON.stringify(local));

    // 1. Combine tombstones
    const tombstones = {
      habits: { ...(local.tombstones?.habits || {}), ...(remote.tombstones?.habits || {}) },
      tasks: { ...(local.tombstones?.tasks || {}), ...(remote.tombstones?.tasks || {}) },
      notes: { ...(local.tombstones?.notes || {}), ...(remote.tombstones?.notes || {}) },
      quotes: { ...(local.tombstones?.quotes || {}), ...(remote.tombstones?.quotes || {}) },
      goals: { ...(local.tombstones?.goals || {}), ...(remote.tombstones?.goals || {}) },
      thoughts: { ...(local.tombstones?.thoughts || {}), ...(remote.tombstones?.thoughts || {}) }
    };
    merged.tombstones = tombstones;

    // 2. Merge habits
    const habitMap = new Map();
    (local.habits || []).forEach(h => habitMap.set(h.id, h));
    (remote.habits || []).forEach(remoteHabit => {
      const deletedAt = tombstones.habits[remoteHabit.id];
      const remoteUpdated = new Date(remoteHabit.updatedAt || remoteHabit.createdAt || 0).getTime();
      if (deletedAt && new Date(deletedAt).getTime() >= remoteUpdated) {
        habitMap.delete(remoteHabit.id);
        return;
      }

      if (!habitMap.has(remoteHabit.id)) {
        habitMap.set(remoteHabit.id, remoteHabit);
      } else {
        const localHabit = habitMap.get(remoteHabit.id);
        const localUpdated = new Date(localHabit.updatedAt || localHabit.createdAt || 0).getTime();
        if (remoteUpdated > localUpdated) {
          habitMap.set(remoteHabit.id, remoteHabit);
        }
      }
    });
    merged.habits = Array.from(habitMap.values()).filter(h => !tombstones.habits[h.id]);

    // 3. Merge cells
    const mergedCells = { ...(local.cells || {}) };
    const remoteCells = remote.cells || {};
    for (const [key, remoteCell] of Object.entries(remoteCells)) {
      if (!mergedCells[key]) {
        mergedCells[key] = remoteCell;
      } else {
        const localCell = mergedCells[key];
        const remoteTime = new Date(remoteCell.updatedAt || 0).getTime();
        const localTime = new Date(localCell.updatedAt || 0).getTime();
        if (remoteTime > localTime) {
          mergedCells[key] = remoteCell;
        }
      }
    }
    merged.cells = mergedCells;

    // 4. Merge notes
    const noteMap = new Map();
    (local.notes || []).forEach(n => noteMap.set(n.id, n));
    (remote.notes || []).forEach(remoteNote => {
      const deletedAt = tombstones.notes[remoteNote.id];
      const remoteUpdated = new Date(remoteNote.updatedAt || remoteNote.createdAt || 0).getTime();
      if (deletedAt && new Date(deletedAt).getTime() >= remoteUpdated) {
        noteMap.delete(remoteNote.id);
        return;
      }

      if (!noteMap.has(remoteNote.id)) {
        noteMap.set(remoteNote.id, remoteNote);
      } else {
        const localNote = noteMap.get(remoteNote.id);
        const localUpdated = new Date(localNote.updatedAt || localNote.createdAt || 0).getTime();
        if (remoteUpdated > localUpdated) {
          noteMap.set(remoteNote.id, remoteNote);
        }
      }
    });
    merged.notes = Array.from(noteMap.values()).filter(n => !tombstones.notes[n.id]);

    // 5. Merge tasks
    const taskMap = new Map();
    (local.tasks || []).forEach(t => taskMap.set(t.id, t));
    (remote.tasks || []).forEach(remoteTask => {
      const deletedAt = tombstones.tasks[remoteTask.id];
      const remoteUpdated = new Date(remoteTask.updatedAt || remoteTask.createdAt || 0).getTime();
      if (deletedAt && new Date(deletedAt).getTime() >= remoteUpdated) {
        taskMap.delete(remoteTask.id);
        return;
      }

      if (!taskMap.has(remoteTask.id)) {
        taskMap.set(remoteTask.id, remoteTask);
      } else {
        const localTask = taskMap.get(remoteTask.id);
        // Merge history for calendar tasks
        const combinedHistory = { ...(localTask.history || {}) };
        for (const [date, hist] of Object.entries(remoteTask.history || {})) {
          if (!combinedHistory[date]) {
            combinedHistory[date] = hist;
          } else {
            const rTime = new Date(hist.updatedAt || 0).getTime();
            const lTime = new Date(combinedHistory[date].updatedAt || 0).getTime();
            if (rTime > lTime) combinedHistory[date] = hist;
          }
        }
        const localUpdated = new Date(localTask.updatedAt || localTask.createdAt || 0).getTime();
        const winner = remoteUpdated > localUpdated ? remoteTask : localTask;
        taskMap.set(remoteTask.id, {
          ...winner,
          history: combinedHistory
        });
      }
    });
    merged.tasks = Array.from(taskMap.values()).filter(t => !tombstones.tasks[t.id]);

    // 6. Merge diary
    const mergedDiary = { ...(local.diary || {}) };
    for (const [date, remoteDiary] of Object.entries(remote.diary || {})) {
      if (!mergedDiary[date]) {
        mergedDiary[date] = remoteDiary;
      } else {
        const localDiary = mergedDiary[date];
        const rTime = new Date(remoteDiary.updatedAt || 0).getTime();
        const lTime = new Date(localDiary.updatedAt || 0).getTime();

        // Merge daily tasks
        const taskMap = new Map();
        (localDiary.tasks || []).forEach(t => taskMap.set(t.title, t));
        (remoteDiary.tasks || []).forEach(t => {
          if (!taskMap.has(t.title)) {
            taskMap.set(t.title, t);
          } else if (t.status === 'done') {
            taskMap.set(t.title, t);
          }
        });

        mergedDiary[date] = {
          entry: (rTime > lTime ? remoteDiary.entry : localDiary.entry) || localDiary.entry || remoteDiary.entry || '',
          mood: (rTime > lTime ? remoteDiary.mood : localDiary.mood) || localDiary.mood || remoteDiary.mood || null,
          tasks: Array.from(taskMap.values()),
          updatedAt: new Date(Math.max(rTime, lTime)).toISOString()
        };
      }
    }
    merged.diary = mergedDiary;

    // 7. Merge quotes
    const quoteMap = new Map();
    (local.quotes || []).forEach(q => quoteMap.set(q.id, q));
    (remote.quotes || []).forEach(q => {
      if (!tombstones.quotes[q.id] && !quoteMap.has(q.id)) {
        quoteMap.set(q.id, q);
      }
    });
    merged.quotes = Array.from(quoteMap.values()).filter(q => !tombstones.quotes[q.id]);

    // 8. Merge goals (Plans & Quick Goals)
    const goalMap = new Map();
    (local.goals || []).forEach(g => {
      if (g && g.id) goalMap.set(g.id, g);
    });
    (remote.goals || []).forEach(remoteGoal => {
      if (!remoteGoal || !remoteGoal.id) return;
      const deletedAt = tombstones.goals[remoteGoal.id];
      const remoteUpdated = new Date(remoteGoal.updatedAt || remoteGoal.createdAt || 0).getTime();
      if (deletedAt && new Date(deletedAt).getTime() >= remoteUpdated) {
        goalMap.delete(remoteGoal.id);
        return;
      }
      if (!goalMap.has(remoteGoal.id)) {
        goalMap.set(remoteGoal.id, remoteGoal);
      } else {
        const localGoal = goalMap.get(remoteGoal.id);
        const localUpdated = new Date(localGoal.updatedAt || localGoal.createdAt || 0).getTime();
        if (remoteUpdated > localUpdated) {
          goalMap.set(remoteGoal.id, remoteGoal);
        }
      }
    });
    merged.goals = Array.from(goalMap.values())
      .filter(g => !tombstones.goals[g.id])
      .map((g, idx) => ({
        ...g,
        parentId: (g.parentId && !tombstones.goals[g.parentId] && g.parentId !== g.id) ? String(g.parentId) : null,
        strategy: typeof g.strategy === 'string' ? g.strategy : (g.strategy != null ? String(g.strategy) : ''),
        linkedHabitIds: Array.isArray(g.linkedHabitIds)
          ? Array.from(new Set(g.linkedHabitIds.filter(hid => hid && !tombstones.habits[hid]).map(String)))
          : [],
        linkedTaskIds: Array.isArray(g.linkedTaskIds)
          ? Array.from(new Set(g.linkedTaskIds.filter(tid => tid && !tombstones.tasks[tid]).map(String)))
          : [],
        order: (typeof g.order === 'number' && Number.isFinite(g.order)) ? g.order : idx
      }));

    // 9. Merge thoughts
    const thoughtMap = new Map();
    (local.thoughts || []).forEach(th => {
      if (th && th.id) thoughtMap.set(th.id, th);
    });
    (remote.thoughts || []).forEach(remoteThought => {
      if (!remoteThought || !remoteThought.id) return;
      const deletedAt = tombstones.thoughts[remoteThought.id];
      const remoteUpdated = new Date(remoteThought.updatedAt || remoteThought.createdAt || 0).getTime();
      if (deletedAt && new Date(deletedAt).getTime() >= remoteUpdated) {
        thoughtMap.delete(remoteThought.id);
        return;
      }
      if (!thoughtMap.has(remoteThought.id)) {
        thoughtMap.set(remoteThought.id, remoteThought);
      } else {
        const localThought = thoughtMap.get(remoteThought.id);
        const localUpdated = new Date(localThought.updatedAt || localThought.createdAt || 0).getTime();
        if (remoteUpdated > localUpdated) {
          thoughtMap.set(remoteThought.id, remoteThought);
        }
      }
    });
    const validThoughtColors = ['default', 'amber', 'sage', 'rose', 'slate'];
    merged.thoughts = Array.from(thoughtMap.values())
      .filter(th => !tombstones.thoughts[th.id])
      .map(th => ({
        ...th,
        title: th.title != null ? String(th.title) : '',
        body: th.body != null ? String(th.body) : '',
        tag: th.tag != null ? String(th.tag) : '',
        color: validThoughtColors.includes(th.color) ? th.color : 'default',
        pinned: !!th.pinned,
        expanded: !!th.expanded,
        planId: (th.planId && !tombstones.goals[th.planId]) ? String(th.planId) : null,
        readCount: Number.isFinite(Number(th.readCount)) ? Number(th.readCount) : 0,
        lastReadAt: th.lastReadAt || null
      }));

    merged.lastModifiedAt = new Date().toISOString();
    return merged;
  },

  // Main Sync Execution
  async syncNow(options = { background: false }) {
    if (!navigator.onLine) {
      this.setStatus('offline');
      return { success: false, reason: 'offline' };
    }

    const config = await Storage.getSyncConfig();
    if (!config.token) {
      this.setStatus('idle');
      return { success: false, reason: 'not_configured' };
    }

    const password = Storage.getMasterPassword();
    if (!password) {
      this.setStatus('idle');
      return { success: false, reason: 'locked' };
    }

    this.setStatus('syncing');

    try {
      // 1. Fetch or create Gist
      const gist = await this.getOrCreateGist(config.token, config.gistId);
      if (gist.id !== config.gistId) {
        config.gistId = gist.id;
        await Storage.saveSyncConfig({ gistId: gist.id });
      }

      const fileObj = gist.files[this.GIST_FILENAME];
      let remoteState = null;

      // 2. Download and decrypt remote state if it exists
      if (fileObj && fileObj.content) {
        let contentRaw = fileObj.content;
        if (fileObj.truncated && fileObj.raw_url) {
          const rawRes = await fetch(fileObj.raw_url);
          contentRaw = await rawRes.text();
        }

        try {
          const parsed = JSON.parse(contentRaw);
          if (parsed.ciphertext && parsed.iv && parsed.salt) {
            remoteState = await CryptoUtils.decrypt(parsed, password);
          }
        } catch (e) {
          console.warn('Could not decrypt remote gist (might be first sync or different password):', e);
        }
      }

      // 3. Merge states
      const localState = await Storage.getRawState();
      let mergedState = localState;

      if (remoteState) {
        mergedState = this.mergeStates(localState, remoteState);
        await Storage.saveRawState(mergedState);
      }

      // 4. Encrypt merged state and upload
      const encryptedBundle = await CryptoUtils.encrypt(mergedState, password);
      await this.ghRequest(`/gists/${gist.id}`, config.token, 'PATCH', {
        files: {
          [this.GIST_FILENAME]: {
            content: JSON.stringify(encryptedBundle)
          }
        }
      });

      const now = new Date().toISOString();
      await Storage.saveSyncConfig({ lastSyncedAt: now });
      this.setStatus('synced');
      return { success: true, syncedAt: now };
    } catch (err) {
      console.error('Sync failed:', err);
      this.setStatus('error', err.message);
      return { success: false, error: err.message };
    }
  }
};

if (typeof module !== 'undefined' && module.exports) {
  module.exports = Sync;
}
