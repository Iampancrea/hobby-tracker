// Configuration constants

// === DEV BYPASS ===
// Flip to true while testing to skip the login screen
export const DEV_SKIP_LOGIN = false;

// === DEFAULT SETTINGS ===
export const DEFAULT_SETTINGS = {
  theme: 'light', // 'light' | 'dark' | 'auto'
  accent: '#2383e2',
  weekStart: 1, // 0=Sunday, 1=Monday
  pastDays: 21,
  futureDays: 5,
  showDidNotExistIndicator: true,
  showStats: true
};

// === SEEDED QUOTES ===
export const SEEDED_QUOTES = [
  {
    id: 'quote-1',
    text: 'The secret of getting ahead is getting started.',
    author: 'Mark Twain',
    builtIn: true,
    createdAt: new Date().toISOString()
  },
  {
    id: 'quote-2',
    text: 'You do not rise to the level of your goals. You fall to the level of your systems.',
    author: 'James Clear',
    builtIn: true,
    createdAt: new Date().toISOString()
  }
];

// === DEFAULT HABITS ===
export const DEFAULT_HABITS = [
  {
    id: 'habit-1',
    name: 'Cold Bath',
    emoji: '🧊',
    color: '#2383e2',
    createdAt: null, // set on first run
    archived: false,
    order: 0
  },
  {
    id: 'habit-2',
    name: '8 Hours Sleep',
    emoji: '😴',
    color: '#7c3aed',
    createdAt: null,
    archived: false,
    order: 1
  },
  {
    id: 'habit-3',
    name: 'Exercise',
    emoji: '💪',
    color: '#10b981',
    createdAt: null,
    archived: false,
    order: 2
  }
];

// === NOTE KINDS ===
export const NOTE_KINDS = {
  log: {
    name: 'Log',
    emoji: '📝',
    description: 'Default habit note'
  },
  love: {
    name: 'Love',
    emoji: '💕',
    description: 'Affectionate reflection'
  },
  discipline: {
    name: 'Discipline',
    emoji: '⚡',
    description: 'Hard truths'
  },
  insight: {
    name: 'Insight',
    emoji: '💡',
    description: 'Realizations'
  },
  vent: {
    name: 'Vent',
    emoji: '🔥',
    description: 'Raw emotion'
  },
  win: {
    name: 'Win',
    emoji: '🏆',
    description: 'Achievements'
  }
};

// === MOOD OPTIONS ===
export const MOOD_OPTIONS = ['😊', '😐', '😔', '😤', '🤩', '😴', '🤔'];

// === TASK REPEAT OPTIONS ===
export const REPEAT_OPTIONS = [
  { value: 'none', label: 'One-time' },
  { value: 'daily', label: 'Daily' },
  { value: 'weekdays', label: 'Weekdays (Mon-Fri)' },
  { value: 'weekly', label: 'Weekly' },
  { value: 'monthly', label: 'Monthly' }
];

// === TIMELINE RANGES ===
export const TIMELINE_RANGES = [
  { value: 14, label: '2 weeks' },
  { value: 30, label: '1 month' },
  { value: 90, label: '3 months' },
  { value: 365, label: '1 year' }
];
