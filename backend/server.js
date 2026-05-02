const http = require('http');
const crypto = require('crypto');
const fs = require('fs');
const path = require('path');
const url = require('url');

// ── SQLite-lite: JSON file-based database ──────────────────────────────────
const DB_PATH = path.join(__dirname, 'db.json');

function loadDB() {
  if (!fs.existsSync(DB_PATH)) {
    const init = { users: [], projects: [], members: [], tasks: [] };
    fs.writeFileSync(DB_PATH, JSON.stringify(init, null, 2));
    return init;
  }
  return JSON.parse(fs.readFileSync(DB_PATH, 'utf8'));
}

function saveDB(db) {
  fs.writeFileSync(DB_PATH, JSON.stringify(db, null, 2));
}

// ── Crypto helpers ─────────────────────────────────────────────────────────
const JWT_SECRET = 'taskflow_secret_key_2024';

function hashPassword(pw) {
  return crypto.createHmac('sha256', 'salt_key').update(pw).digest('hex');
}

function signJWT(payload) {
  const header = Buffer.from(JSON.stringify({ alg: 'HS256', typ: 'JWT' })).toString('base64url');
  const body = Buffer.from(JSON.stringify({ ...payload, iat: Date.now() })).toString('base64url');
  const sig = crypto.createHmac('sha256', JWT_SECRET).update(`${header}.${body}`).digest('base64url');
  return `${header}.${body}.${sig}`;
}

function verifyJWT(token) {
  try {
    const [header, body, sig] = token.split('.');
    const expected = crypto.createHmac('sha256', JWT_SECRET).update(`${header}.${body}`).digest('base64url');
    if (sig !== expected) return null;
    return JSON.parse(Buffer.from(body, 'base64url').toString());
  } catch { return null; }
}

function uid() {
  return crypto.randomBytes(8).toString('hex');
}

// ── Middleware helpers ─────────────────────────────────────────────────────
function parseBody(req) {
  return new Promise((resolve, reject) => {
    let data = '';
    req.on('data', chunk => data += chunk);
    req.on('end', () => {
      try { resolve(data ? JSON.parse(data) : {}); }
      catch { reject(new Error('Invalid JSON')); }
    });
  });
}

function send(res, status, data) {
  res.writeHead(status, {
    'Content-Type': 'application/json',
    'Access-Control-Allow-Origin': '*',
    'Access-Control-Allow-Headers': 'Content-Type, Authorization',
    'Access-Control-Allow-Methods': 'GET, POST, PUT, PATCH, DELETE, OPTIONS'
  });
  res.end(JSON.stringify(data));
}

function authenticate(req) {
  const auth = req.headers.authorization || '';
  const token = auth.replace('Bearer ', '');
  return verifyJWT(token);
}

// ── Route handlers ─────────────────────────────────────────────────────────

// POST /api/auth/signup
async function signup(req, res) {
  const db = loadDB();
  const body = await parseBody(req);
  const { name, email, password } = body;
  if (!name || !email || !password) return send(res, 400, { error: 'All fields required' });
  if (db.users.find(u => u.email === email)) return send(res, 409, { error: 'Email already in use' });
  const user = { id: uid(), name, email, password: hashPassword(password), createdAt: new Date().toISOString() };
  db.users.push(user);
  saveDB(db);
  const token = signJWT({ id: user.id, email: user.email });
  send(res, 201, { token, user: { id: user.id, name: user.name, email: user.email } });
}

// POST /api/auth/login
async function login(req, res) {
  const db = loadDB();
  const body = await parseBody(req);
  const { email, password } = body;
  const user = db.users.find(u => u.email === email && u.password === hashPassword(password));
  if (!user) return send(res, 401, { error: 'Invalid credentials' });
  const token = signJWT({ id: user.id, email: user.email });
  send(res, 200, { token, user: { id: user.id, name: user.name, email: user.email } });
}

// GET /api/auth/me
function me(req, res) {
  const db = loadDB();
  const payload = authenticate(req);
  if (!payload) return send(res, 401, { error: 'Unauthorized' });
  const user = db.users.find(u => u.id === payload.id);
  if (!user) return send(res, 404, { error: 'User not found' });
  send(res, 200, { id: user.id, name: user.name, email: user.email });
}

// GET /api/projects
function getProjects(req, res) {
  const db = loadDB();
  const payload = authenticate(req);
  if (!payload) return send(res, 401, { error: 'Unauthorized' });
  // Projects where user is owner or member
  const memberOf = db.members.filter(m => m.userId === payload.id).map(m => m.projectId);
  const projects = db.projects.filter(p => p.ownerId === payload.id || memberOf.includes(p.id));
  const enriched = projects.map(p => {
    const memberCount = db.members.filter(m => m.projectId === p.id).length + 1;
    const taskCount = db.tasks.filter(t => t.projectId === p.id).length;
    const doneCount = db.tasks.filter(t => t.projectId === p.id && t.status === 'done').length;
    const role = p.ownerId === payload.id ? 'admin' : (db.members.find(m => m.projectId === p.id && m.userId === payload.id)?.role || 'member');
    return { ...p, memberCount, taskCount, doneCount, role };
  });
  send(res, 200, enriched);
}

// POST /api/projects
async function createProject(req, res) {
  const db = loadDB();
  const payload = authenticate(req);
  if (!payload) return send(res, 401, { error: 'Unauthorized' });
  const body = await parseBody(req);
  const { name, description } = body;
  if (!name) return send(res, 400, { error: 'Name is required' });
  const project = { id: uid(), name, description: description || '', ownerId: payload.id, createdAt: new Date().toISOString() };
  db.projects.push(project);
  saveDB(db);
  send(res, 201, { ...project, role: 'admin', memberCount: 1, taskCount: 0, doneCount: 0 });
}

// GET /api/projects/:id
function getProject(req, res, id) {
  const db = loadDB();
  const payload = authenticate(req);
  if (!payload) return send(res, 401, { error: 'Unauthorized' });
  const project = db.projects.find(p => p.id === id);
  if (!project) return send(res, 404, { error: 'Not found' });
  const memberOf = db.members.filter(m => m.projectId === id).map(m => m.userId);
  if (project.ownerId !== payload.id && !memberOf.includes(payload.id)) return send(res, 403, { error: 'Forbidden' });
  const members = db.members.filter(m => m.projectId === id).map(m => {
    const u = db.users.find(u => u.id === m.userId);
    return { ...m, name: u?.name, email: u?.email };
  });
  const owner = db.users.find(u => u.id === project.ownerId);
  const allMembers = [{ userId: owner.id, name: owner.name, email: owner.email, role: 'admin' }, ...members];
  const tasks = db.tasks.filter(t => t.projectId === id).map(t => {
    const assignee = t.assigneeId ? db.users.find(u => u.id === t.assigneeId) : null;
    return { ...t, assigneeName: assignee?.name };
  });
  const role = project.ownerId === payload.id ? 'admin' : (db.members.find(m => m.projectId === id && m.userId === payload.id)?.role || 'member');
  send(res, 200, { ...project, role, members: allMembers, tasks });
}

// DELETE /api/projects/:id
function deleteProject(req, res, id) {
  const db = loadDB();
  const payload = authenticate(req);
  if (!payload) return send(res, 401, { error: 'Unauthorized' });
  const idx = db.projects.findIndex(p => p.id === id && p.ownerId === payload.id);
  if (idx === -1) return send(res, 403, { error: 'Forbidden or not found' });
  db.projects.splice(idx, 1);
  db.members = db.members.filter(m => m.projectId !== id);
  db.tasks = db.tasks.filter(t => t.projectId !== id);
  saveDB(db);
  send(res, 200, { message: 'Project deleted' });
}

// POST /api/projects/:id/members
async function addMember(req, res, projectId) {
  const db = loadDB();
  const payload = authenticate(req);
  if (!payload) return send(res, 401, { error: 'Unauthorized' });
  const project = db.projects.find(p => p.id === projectId);
  if (!project) return send(res, 404, { error: 'Project not found' });
  if (project.ownerId !== payload.id) {
    const mem = db.members.find(m => m.projectId === projectId && m.userId === payload.id && m.role === 'admin');
    if (!mem) return send(res, 403, { error: 'Only admins can add members' });
  }
  const body = await parseBody(req);
  const { email, role } = body;
  const user = db.users.find(u => u.email === email);
  if (!user) return send(res, 404, { error: 'User not found' });
  if (user.id === project.ownerId) return send(res, 400, { error: 'User is already owner' });
  if (db.members.find(m => m.projectId === projectId && m.userId === user.id)) return send(res, 400, { error: 'Already a member' });
  const member = { id: uid(), projectId, userId: user.id, role: role || 'member', addedAt: new Date().toISOString() };
  db.members.push(member);
  saveDB(db);
  send(res, 201, { ...member, name: user.name, email: user.email });
}

// DELETE /api/projects/:id/members/:userId
function removeMember(req, res, projectId, userId) {
  const db = loadDB();
  const payload = authenticate(req);
  if (!payload) return send(res, 401, { error: 'Unauthorized' });
  const project = db.projects.find(p => p.id === projectId);
  if (!project) return send(res, 404, { error: 'Not found' });
  if (project.ownerId !== payload.id) return send(res, 403, { error: 'Only owner can remove members' });
  const idx = db.members.findIndex(m => m.projectId === projectId && m.userId === userId);
  if (idx === -1) return send(res, 404, { error: 'Member not found' });
  db.members.splice(idx, 1);
  saveDB(db);
  send(res, 200, { message: 'Member removed' });
}

// GET /api/projects/:id/tasks
function getTasks(req, res, projectId) {
  const db = loadDB();
  const payload = authenticate(req);
  if (!payload) return send(res, 401, { error: 'Unauthorized' });
  const project = db.projects.find(p => p.id === projectId);
  if (!project) return send(res, 404, { error: 'Not found' });
  const tasks = db.tasks.filter(t => t.projectId === projectId).map(t => {
    const assignee = t.assigneeId ? db.users.find(u => u.id === t.assigneeId) : null;
    return { ...t, assigneeName: assignee?.name };
  });
  send(res, 200, tasks);
}

// POST /api/projects/:id/tasks
async function createTask(req, res, projectId) {
  const db = loadDB();
  const payload = authenticate(req);
  if (!payload) return send(res, 401, { error: 'Unauthorized' });
  const project = db.projects.find(p => p.id === projectId);
  if (!project) return send(res, 404, { error: 'Project not found' });
  const body = await parseBody(req);
  const { title, description, assigneeId, dueDate, priority } = body;
  if (!title) return send(res, 400, { error: 'Title is required' });
  const task = {
    id: uid(), projectId, title, description: description || '',
    assigneeId: assigneeId || null, dueDate: dueDate || null,
    priority: priority || 'medium', status: 'todo',
    createdById: payload.id, createdAt: new Date().toISOString()
  };
  db.tasks.push(task);
  saveDB(db);
  const assignee = task.assigneeId ? db.users.find(u => u.id === task.assigneeId) : null;
  send(res, 201, { ...task, assigneeName: assignee?.name });
}

// PATCH /api/tasks/:id
async function updateTask(req, res, taskId) {
  const db = loadDB();
  const payload = authenticate(req);
  if (!payload) return send(res, 401, { error: 'Unauthorized' });
  const idx = db.tasks.findIndex(t => t.id === taskId);
  if (idx === -1) return send(res, 404, { error: 'Task not found' });
  const body = await parseBody(req);
  const allowed = ['title', 'description', 'status', 'assigneeId', 'dueDate', 'priority'];
  allowed.forEach(k => { if (body[k] !== undefined) db.tasks[idx][k] = body[k]; });
  db.tasks[idx].updatedAt = new Date().toISOString();
  saveDB(db);
  const task = db.tasks[idx];
  const assignee = task.assigneeId ? db.users.find(u => u.id === task.assigneeId) : null;
  send(res, 200, { ...task, assigneeName: assignee?.name });
}

// DELETE /api/tasks/:id
function deleteTask(req, res, taskId) {
  const db = loadDB();
  const payload = authenticate(req);
  if (!payload) return send(res, 401, { error: 'Unauthorized' });
  const idx = db.tasks.findIndex(t => t.id === taskId);
  if (idx === -1) return send(res, 404, { error: 'Not found' });
  db.tasks.splice(idx, 1);
  saveDB(db);
  send(res, 200, { message: 'Task deleted' });
}

// GET /api/dashboard
function dashboard(req, res) {
  const db = loadDB();
  const payload = authenticate(req);
  if (!payload) return send(res, 401, { error: 'Unauthorized' });
  const memberOf = db.members.filter(m => m.userId === payload.id).map(m => m.projectId);
  const myProjectIds = db.projects.filter(p => p.ownerId === payload.id || memberOf.includes(p.id)).map(p => p.id);
  const allTasks = db.tasks.filter(t => myProjectIds.includes(t.projectId));
  const myTasks = allTasks.filter(t => t.assigneeId === payload.id);
  const now = new Date();
  const overdue = myTasks.filter(t => t.dueDate && new Date(t.dueDate) < now && t.status !== 'done');
  const byStatus = { todo: 0, 'in-progress': 0, review: 0, done: 0 };
  myTasks.forEach(t => { if (byStatus[t.status] !== undefined) byStatus[t.status]++; });
  send(res, 200, {
    totalProjects: myProjectIds.length,
    totalTasks: myTasks.length,
    overdueCount: overdue.length,
    completedCount: byStatus.done,
    byStatus,
    recentTasks: myTasks.sort((a, b) => new Date(b.createdAt) - new Date(a.createdAt)).slice(0, 5).map(t => {
      const p = db.projects.find(p => p.id === t.projectId);
      return { ...t, projectName: p?.name };
    }),
    overdueTasks: overdue.map(t => {
      const p = db.projects.find(p => p.id === t.projectId);
      return { ...t, projectName: p?.name };
    })
  });
}

// GET /api/users (search by email for adding members)
function searchUsers(req, res) {
  const db = loadDB();
  const payload = authenticate(req);
  if (!payload) return send(res, 401, { error: 'Unauthorized' });
  const q = new url.URL('http://x' + req.url).searchParams.get('email') || '';
  const users = db.users.filter(u => u.email.includes(q) && u.id !== payload.id).slice(0, 5)
    .map(u => ({ id: u.id, name: u.name, email: u.email }));
  send(res, 200, users);
}

// ── Router ─────────────────────────────────────────────────────────────────
const server = http.createServer(async (req, res) => {
  if (req.method === 'OPTIONS') {
    res.writeHead(204, {
      'Access-Control-Allow-Origin': '*',
      'Access-Control-Allow-Headers': 'Content-Type, Authorization',
      'Access-Control-Allow-Methods': 'GET, POST, PUT, PATCH, DELETE, OPTIONS'
    });
    return res.end();
  }

  // Serve static frontend
  if (!req.url.startsWith('/api')) {
    const frontendDir = path.join(__dirname, '../frontend/public');
    let filePath = path.join(frontendDir, req.url === '/' ? 'index.html' : req.url);
    if (!fs.existsSync(filePath)) filePath = path.join(frontendDir, 'index.html');
    const ext = path.extname(filePath);
    const mime = { '.html': 'text/html', '.css': 'text/css', '.js': 'application/javascript' };
    res.writeHead(200, { 'Content-Type': mime[ext] || 'text/plain' });
    return res.end(fs.readFileSync(filePath));
  }

  const parsedUrl = new url.URL('http://x' + req.url);
  const pathname = parsedUrl.pathname;
  const parts = pathname.split('/').filter(Boolean);
  // parts: ['api', 'resource', id?, 'sub', subId?]

  try {
    // Auth routes
    if (pathname === '/api/auth/signup' && req.method === 'POST') return await signup(req, res);
    if (pathname === '/api/auth/login' && req.method === 'POST') return await login(req, res);
    if (pathname === '/api/auth/me' && req.method === 'GET') return me(req, res);

    // Dashboard
    if (pathname === '/api/dashboard' && req.method === 'GET') return dashboard(req, res);

    // Users search
    if (pathname === '/api/users' && req.method === 'GET') return searchUsers(req, res);

    // Projects
    if (pathname === '/api/projects' && req.method === 'GET') return getProjects(req, res);
    if (pathname === '/api/projects' && req.method === 'POST') return await createProject(req, res);
    if (parts[1] === 'projects' && parts[2] && !parts[3] && req.method === 'GET') return getProject(req, res, parts[2]);
    if (parts[1] === 'projects' && parts[2] && !parts[3] && req.method === 'DELETE') return deleteProject(req, res, parts[2]);

    // Members
    if (parts[1] === 'projects' && parts[2] && parts[3] === 'members' && !parts[4] && req.method === 'POST') return await addMember(req, res, parts[2]);
    if (parts[1] === 'projects' && parts[2] && parts[3] === 'members' && parts[4] && req.method === 'DELETE') return removeMember(req, res, parts[2], parts[4]);

    // Tasks
    if (parts[1] === 'projects' && parts[2] && parts[3] === 'tasks' && req.method === 'GET') return getTasks(req, res, parts[2]);
    if (parts[1] === 'projects' && parts[2] && parts[3] === 'tasks' && req.method === 'POST') return await createTask(req, res, parts[2]);
    if (parts[1] === 'tasks' && parts[2] && req.method === 'PATCH') return await updateTask(req, res, parts[2]);
    if (parts[1] === 'tasks' && parts[2] && req.method === 'DELETE') return deleteTask(req, res, parts[2]);

    send(res, 404, { error: 'Route not found' });
  } catch (err) {
    console.error(err);
    send(res, 500, { error: 'Internal server error' });
  }
});

const PORT = process.env.PORT || 3000;
server.listen(PORT, () => console.log(`TaskFlow running on http://localhost:${PORT}`));

