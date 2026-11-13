const http = require('http');
const fs = require('fs');
const path = require('path');
const crypto = require('crypto');

const PORT = process.env.PORT || 3000;
const DATA_FILE = path.join(__dirname, 'data.json');
const PUBLIC_DIR = path.join(__dirname, 'public');

// --- In-memory state ---
let data = {
  config: { passwordHash: null, salt: null },
  habits: [],
  cells: {},
  notes: [],
  tasks: [],
  diary: {},
  quotes: [
    { id: 'q_seed_1', text: 'Discipline is choosing what you want most over what you want now.', author: 'Unknown', custom: false },
    { id: 'q_seed_2', text: 'Small days build the life you\'re looking for.', author: 'Unknown', custom: false }
  ]
};

const sessions = new Map(); // sessionToken -> { expiry }

// --- Data persistence ---
function loadData() {
  if (fs.existsSync(DATA_FILE)) {
    try {
      const raw = fs.readFileSync(DATA_FILE, 'utf8');
      const parsed = JSON.parse(raw);
      data = { ...data, ...parsed };
    } catch (e) {
      console.error('Failed to load data.json:', e);
    }
  }
}

function saveData() {
  fs.writeFileSync(DATA_FILE, JSON.stringify(data, null, 2), 'utf8');
}

loadData();

// --- Auth helpers ---
function hashPassword(password, salt) {
  if (!salt) salt = crypto.randomBytes(16).toString('hex');
  const hash = crypto.pbkdf2Sync(password, salt, 100000, 64, 'sha256').toString('hex');
  return { hash, salt };
}

function verifyPassword(password, hash, salt) {
  const result = hashPassword(password, salt);
  return result.hash === hash;
}

function generateSessionToken() {
  return crypto.randomBytes(32).toString('hex');
}

function isAuthenticated(req) {
  const token = getSessionToken(req);
  if (!token) return false;
  const session = sessions.get(token);
  if (!session) return false;
  if (session.expiry < Date.now()) {
    sessions.delete(token);
    return false;
  }
  return true;
}

function getSessionToken(req) {
  const cookie = req.headers.cookie;
  if (cookie) {
    const match = cookie.match(/session=([^;]+)/);
    if (match) return match[1];
  }
  const auth = req.headers.authorization;
  if (auth && auth.startsWith('Bearer ')) {
    return auth.slice(7);
  }
  return null;
}

function setSessionCookie(res, token) {
  res.setHeader('Set-Cookie', `session=${token}; HttpOnly; SameSite=Lax; Path=/`);
}

// --- Request parsing ---
function parseBody(req) {
  return new Promise((resolve, reject) => {
    let body = '';
    req.on('data', chunk => { body += chunk; });
    req.on('end', () => {
      try {
        resolve(body ? JSON.parse(body) : {});
      } catch (e) {
        reject(e);
      }
    });
    req.on('error', reject);
  });
}

// --- Response helpers ---
function sendJson(res, data, status = 200) {
  res.writeHead(status, {
    'Content-Type': 'application/json',
    'Cache-Control': 'no-store'
  });
  res.end(JSON.stringify(data));
}

function sendError(res, message, status = 400) {
  sendJson(res, { error: message }, status);
}

// --- Static file serving ---
const MIME_TYPES = {
  '.html': 'text/html',
  '.css': 'text/css',
  '.js': 'application/javascript',
  '.json': 'application/json',
  '.webmanifest': 'application/manifest+json',
  '.png': 'image/png',
  '.jpg': 'image/jpeg',
  '.gif': 'image/gif',
  '.svg': 'image/svg+xml',
  '.ico': 'image/x-icon'
};

function serveStatic(req, res, filePath) {
  const ext = path.extname(filePath);
  const contentType = MIME_TYPES[ext] || 'application/octet-stream';
  
  fs.readFile(filePath, (err, content) => {
    if (err) {
      if (err.code === 'ENOENT') {
        // Try index.html for SPA routing
        fs.readFile(path.join(PUBLIC_DIR, 'index.html'), (err2, indexContent) => {
          if (err2) {
            res.writeHead(404);
            res.end('Not found');
          } else {
            res.writeHead(200, { 'Content-Type': 'text/html' });
            res.end(indexContent);
          }
        });
      } else {
        res.writeHead(500);
        res.end('Server error');
      }
    } else {
      res.writeHead(200, { 'Content-Type': contentType });
      res.end(content);
    }
  });
}

// --- API Routes ---
async function handleApi(req, res, urlPath) {
  // Public routes
  if (req.method === 'GET' && urlPath === '/api/check-setup') {
    // Returns whether a password has been set
    return sendJson(res, { passwordSet: !!data.config.passwordHash });
  }

  if (req.method === 'POST' && urlPath === '/api/setup') {
    const body = await parseBody(req);
    if (data.config.passwordHash) {
      return sendError(res, 'Password already set', 400);
    }
    if (!body.password || body.password.length < 4) {
      return sendError(res, 'Password must be at least 4 characters', 400);
    }
    const { hash, salt } = hashPassword(body.password);
    data.config.passwordHash = hash;
    data.config.salt = salt;
    saveData();
    const token = generateSessionToken();
    sessions.set(token, { expiry: Date.now() + 24 * 60 * 60 * 1000 }); // 24h
    setSessionCookie(res, token);
    return sendJson(res, { success: true });
  }

  if (req.method === 'POST' && urlPath === '/api/login') {
    const body = await parseBody(req);
    if (!data.config.passwordHash) {
      return sendError(res, 'No password set. Please setup first.', 400);
    }
    if (!verifyPassword(body.password, data.config.passwordHash, data.config.salt)) {
      return sendError(res, 'Invalid password', 401);
    }
    const token = generateSessionToken();
    sessions.set(token, { expiry: Date.now() + 24 * 60 * 60 * 1000 });
    setSessionCookie(res, token);
    return sendJson(res, { success: true });
  }

  if (req.method === 'POST' && urlPath === '/api/logout') {
    const token = getSessionToken(req);
    if (token) sessions.delete(token);
    res.setHeader('Set-Cookie', 'session=; Max-Age=0; Path=/');
    return sendJson(res, { success: true });
  }

  // Protected routes
  if (!isAuthenticated(req)) {
    return sendError(res, 'Unauthorized', 401);
  }

  if (req.method === 'GET' && urlPath === '/api/state') {
    return sendJson(res, data);
  }

  if (req.method === 'POST' && urlPath === '/api/logout') {
    const token = getSessionToken(req);
    if (token) sessions.delete(token);
    res.setHeader('Set-Cookie', 'session=; Max-Age=0; Path=/');
    return sendJson(res, { success: true });
  }

  // Habits
  if (req.method === 'POST' && urlPath === '/api/habits') {
    const body = await parseBody(req);
    const habit = {
      id: 'h_' + Date.now() + '_' + Math.random().toString(36).slice(2),
      name: body.name || 'New Habit',
      color: body.color || '#3fa34d',
      icon: body.icon || '●',
      createdAt: new Date().toISOString().split('T')[0],
      archived: false
    };
    data.habits.push(habit);
    saveData();
    return sendJson(res, habit);
  }

  if (req.method === 'PATCH' && urlPath.startsWith('/api/habits/')) {
    const id = urlPath.split('/')[3];
    const body = await parseBody(req);
    const habit = data.habits.find(h => h.id === id);
    if (!habit) return sendError(res, 'Not found', 404);
    if (body.name !== undefined) habit.name = body.name;
    if (body.color !== undefined) habit.color = body.color;
    if (body.icon !== undefined) habit.icon = body.icon;
    if (body.archived !== undefined) habit.archived = body.archived;
    saveData();
    return sendJson(res, habit);
  }

  if (req.method === 'DELETE' && urlPath.startsWith('/api/habits/')) {
    const id = urlPath.split('/')[3];
    data.habits = data.habits.filter(h => h.id !== id);
    // Clean up cells and notes
    Object.keys(data.cells).forEach(key => {
      if (key.startsWith(id + '|')) delete data.cells[key];
    });
    data.notes = data.notes.filter(n => n.habitId !== id);
    saveData();
    return sendJson(res, { success: true });
  }

  // Cells
  if (req.method === 'PATCH' && urlPath.match(/^\/api\/cells\/[^/]+\/\d{4}-\d{2}-\d{2}$/)) {
    const parts = urlPath.split('/');
    const habitId = parts[3];
    const date = parts[4];
    const body = await parseBody(req);
    const key = `${habitId}|${date}`;
    if (!data.cells[key]) data.cells[key] = {};
    if (body.status !== undefined) data.cells[key].status = body.status;
    if (body.noteId !== undefined) data.cells[key].noteId = body.noteId;
    saveData();
    return sendJson(res, data.cells[key]);
  }

  if (req.method === 'DELETE' && urlPath.match(/^\/api\/cells\/[^/]+\/\d{4}-\d{2}-\d{2}$/)) {
    const parts = urlPath.split('/');
    const habitId = parts[3];
    const date = parts[4];
    const key = `${habitId}|${date}`;
    delete data.cells[key];
    saveData();
    return sendJson(res, { success: true });
  }

  // Notes
  if (req.method === 'POST' && urlPath === '/api/notes') {
    const body = await parseBody(req);
    const note = {
      id: 'n_' + Date.now() + '_' + Math.random().toString(36).slice(2),
      type: body.type || 'default',
      text: body.text || '',
      habitId: body.habitId,
      date: body.date,
      createdAt: new Date().toISOString()
    };
    data.notes.push(note);
    const cellKey = `${body.habitId}|${body.date}`;
    if (!data.cells[cellKey]) data.cells[cellKey] = {};
    data.cells[cellKey].noteId = note.id;
    saveData();
    return sendJson(res, note);
  }

  if (req.method === 'PATCH' && urlPath.startsWith('/api/notes/')) {
    const id = urlPath.split('/')[3];
    const body = await parseBody(req);
    const note = data.notes.find(n => n.id === id);
    if (!note) return sendError(res, 'Not found', 404);
    if (body.text !== undefined) note.text = body.text;
    if (body.type !== undefined) note.type = body.type;
    saveData();
    return sendJson(res, note);
  }

  if (req.method === 'DELETE' && urlPath.startsWith('/api/notes/')) {
    const id = urlPath.split('/')[3];
    const note = data.notes.find(n => n.id === id);
    if (note) {
      const cellKey = `${note.habitId}|${note.date}`;
      if (data.cells[cellKey]) delete data.cells[cellKey].noteId;
    }
    data.notes = data.notes.filter(n => n.id !== id);
    saveData();
    return sendJson(res, { success: true });
  }

  // Tasks (calendar tasks)
  if (req.method === 'POST' && urlPath === '/api/tasks') {
    const body = await parseBody(req);
    const task = {
      id: 't_' + Date.now() + '_' + Math.random().toString(36).slice(2),
      title: body.title || 'New Task',
      createdAt: new Date().toISOString().split('T')[0],
      archived: false,
      doneDates: [],
      missedDates: []
    };
    data.tasks.push(task);
    saveData();
    return sendJson(res, task);
  }

  if (req.method === 'PATCH' && urlPath.startsWith('/api/tasks/')) {
    const id = urlPath.split('/')[3];
    const body = await parseBody(req);
    const task = data.tasks.find(t => t.id === id);
    if (!task) return sendError(res, 'Not found', 404);
    if (body.title !== undefined) task.title = body.title;
    if (body.archived !== undefined) task.archived = body.archived;
    saveData();
    return sendJson(res, task);
  }

  if (req.method === 'POST' && urlPath.match(/^\/api\/tasks\/[^/]+\/mark$/)) {
    const id = urlPath.split('/')[3];
    const body = await parseBody(req);
    const task = data.tasks.find(t => t.id === id);
    if (!task) return sendError(res, 'Not found', 404);
    const date = body.date;
    if (body.status === 'done') {
      if (!task.doneDates.includes(date)) task.doneDates.push(date);
      task.missedDates = task.missedDates.filter(d => d !== date);
    } else if (body.status === 'missed') {
      if (!task.missedDates.includes(date)) task.missedDates.push(date);
      task.doneDates = task.doneDates.filter(d => d !== date);
    } else {
      task.doneDates = task.doneDates.filter(d => d !== date);
      task.missedDates = task.missedDates.filter(d => d !== date);
    }
    saveData();
    return sendJson(res, task);
  }

  if (req.method === 'DELETE' && urlPath.startsWith('/api/tasks/')) {
    const id = urlPath.split('/')[3];
    data.tasks = data.tasks.filter(t => t.id !== id);
    saveData();
    return sendJson(res, { success: true });
  }

  // Diary
  if (req.method === 'GET' && urlPath.match(/^\/api\/diary\/\d{4}-\d{2}-\d{2}$/)) {
    const date = urlPath.split('/')[3];
    return sendJson(res, data.diary[date] || { entry: '', tasks: [], mood: null });
  }

  if (req.method === 'POST' && urlPath.match(/^\/api\/diary\/\d{4}-\d{2}-\d{2}$/)) {
    const date = urlPath.split('/')[3];
    const body = await parseBody(req);
    data.diary[date] = {
      entry: body.entry || '',
      tasks: body.tasks || [],
      mood: body.mood || null
    };
    saveData();
    return sendJson(res, data.diary[date]);
  }

  // Quotes
  if (req.method === 'POST' && urlPath === '/api/quotes') {
    const body = await parseBody(req);
    const quote = {
      id: 'q_' + Date.now() + '_' + Math.random().toString(36).slice(2),
      text: body.text || '',
      author: body.author || '',
      custom: true
    };
    data.quotes.push(quote);
    saveData();
    return sendJson(res, quote);
  }

  if (req.method === 'DELETE' && urlPath.startsWith('/api/quotes/')) {
    const id = urlPath.split('/')[3];
    const quote = data.quotes.find(q => q.id === id);
    if (quote && quote.custom) {
      data.quotes = data.quotes.filter(q => q.id !== id);
      saveData();
    }
    return sendJson(res, { success: true });
  }

  // Password change
  if (req.method === 'PATCH' && urlPath === '/api/password') {
    const body = await parseBody(req);
    if (!verifyPassword(body.currentPassword, data.config.passwordHash, data.config.salt)) {
      return sendError(res, 'Current password is incorrect', 400);
    }
    if (!body.newPassword || body.newPassword.length < 4) {
      return sendError(res, 'New password must be at least 4 characters', 400);
    }
    const { hash, salt } = hashPassword(body.newPassword);
    data.config.passwordHash = hash;
    data.config.salt = salt;
    saveData();
    return sendJson(res, { success: true });
  }

  // Export/Import
  if (req.method === 'GET' && urlPath === '/api/export') {
    res.writeHead(200, {
      'Content-Type': 'application/json',
      'Content-Disposition': `attachment; filename="hobby-tracker-backup-${new Date().toISOString().split('T')[0]}.json"`
    });
    res.end(JSON.stringify(data, null, 2));
    return;
  }

  if (req.method === 'POST' && urlPath === '/api/import') {
    const body = await parseBody(req);
    if (!body.data) return sendError(res, 'No data provided', 400);
    data = { ...data, ...body.data };
    saveData();
    return sendJson(res, { success: true });
  }

  sendError(res, 'Not found', 404);
}

// --- Main request handler ---
const server = http.createServer(async (req, res) => {
  const url = new URL(req.url, `http://${req.headers.host}`);
  const urlPath = url.pathname;

  try {
    if (urlPath.startsWith('/api/')) {
      await handleApi(req, res, urlPath);
    } else {
      const filePath = path.join(PUBLIC_DIR, urlPath === '/' ? 'index.html' : urlPath);
      serveStatic(req, res, filePath);
    }
  } catch (e) {
    console.error('Request error:', e);
    sendError(res, 'Server error', 500);
  }
});

server.listen(PORT, () => {
  console.log(`\n  Hobby Tracker running at:`);
  console.log(`  → http://localhost:${PORT}`);
  console.log(`  → http://${getLocalIP()}:${PORT} (other devices)\n`);
});

function getLocalIP() {
  const { networkInterfaces } = require('os');
  const nets = networkInterfaces();
  for (const name of Object.keys(nets)) {
    for (const net of nets[name]) {
      if (net.family === 'IPv4' && !net.internal) {
        return net.address;
      }
    }
  }
  return 'localhost';
}
