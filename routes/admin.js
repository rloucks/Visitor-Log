const express = require('express');
const bcrypt = require('bcryptjs');
const multer = require('multer');
const path = require('path');
const db = require('../db');

const router = express.Router();

// Multer — logo uploads
const storage = multer.diskStorage({
  destination: path.join(__dirname, '..', 'uploads'),
  filename: (req, file, cb) => {
    const ext = path.extname(file.originalname).toLowerCase();
    cb(null, `logo${ext}`);
  }
});

const upload = multer({
  storage,
  limits: { fileSize: 5 * 1024 * 1024 },
  fileFilter: (req, file, cb) => {
    if (file.mimetype.startsWith('image/')) cb(null, true);
    else cb(new Error('Only image files are allowed.'));
  }
});

function requireAuth(req, res, next) {
  if (req.session?.adminId) return next();
  res.status(401).json({ error: 'Unauthorized' });
}

// --- Auth ---

router.post('/login', (req, res) => {
  const { username, password } = req.body || {};
  if (!username || !password) {
    return res.status(400).json({ error: 'Username and password are required.' });
  }

  const admin = db.prepare('SELECT * FROM admins WHERE username = ?').get(username);
  if (!admin || !bcrypt.compareSync(password, admin.passwordHash)) {
    return res.status(401).json({ error: 'Invalid username or password.' });
  }

  req.session.adminId = admin.id;
  req.session.adminUsername = admin.username;
  res.json({ success: true });
});

router.post('/logout', (req, res) => {
  req.session.destroy(() => res.json({ success: true }));
});

router.get('/me', (req, res) => {
  if (req.session?.adminId) {
    res.json({ id: req.session.adminId, username: req.session.adminUsername });
  } else {
    res.status(401).json({ error: 'Not authenticated' });
  }
});

// --- Settings (semi-public — kiosk reads these for appearance) ---

const PUBLIC_SETTINGS = ['companyName', 'backgroundStyle', 'logoPath'];

router.get('/settings', (req, res) => {
  const rows = db.prepare('SELECT key, value FROM settings WHERE key IN (' +
    PUBLIC_SETTINGS.map(() => '?').join(',') + ')').all(...PUBLIC_SETTINGS);
  const settings = Object.fromEntries(rows.map(r => [r.key, r.value]));
  res.json(settings);
});

router.post('/settings', requireAuth, (req, res) => {
  const allowed = ['companyName', 'backgroundStyle'];
  const stmt = db.prepare('INSERT OR REPLACE INTO settings (key, value) VALUES (?, ?)');
  for (const key of allowed) {
    if (req.body[key] !== undefined) stmt.run(key, req.body[key]);
  }
  res.json({ success: true });
});

// --- Integrations (protected) ---

router.get('/integrations', requireAuth, (req, res) => {
  const keys = ['slackWebhookUrl', 'n8nWebhookUrl'];
  const rows = db.prepare('SELECT key, value FROM settings WHERE key IN (' +
    keys.map(() => '?').join(',') + ')').all(...keys);
  const result = Object.fromEntries(rows.map(r => [r.key, r.value || '']));
  res.json(result);
});

router.post('/integrations', requireAuth, (req, res) => {
  const allowed = ['slackWebhookUrl', 'n8nWebhookUrl'];
  const stmt = db.prepare('INSERT OR REPLACE INTO settings (key, value) VALUES (?, ?)');
  for (const key of allowed) {
    if (req.body[key] !== undefined) stmt.run(key, req.body[key] || '');
  }
  res.json({ success: true });
});

router.post('/integrations/test-slack', requireAuth, async (req, res) => {
  const row = db.prepare("SELECT value FROM settings WHERE key = 'slackWebhookUrl'").get();
  const url = row?.value || process.env.SLACK_WEBHOOK_URL;
  if (!url) return res.status(400).json({ error: 'No Slack webhook URL configured.' });
  try {
    const axios = require('axios');
    await axios.post(url, { text: ':white_check_mark: Test message from Visitor Check-In system.' });
    res.json({ success: true });
  } catch (err) {
    res.status(502).json({ error: `Slack returned an error: ${err.message}` });
  }
});

router.post('/logo', requireAuth, upload.single('logo'), (req, res) => {
  if (!req.file) return res.status(400).json({ error: 'No file uploaded.' });
  const logoPath = `/uploads/${req.file.filename}`;
  db.prepare('INSERT OR REPLACE INTO settings (key, value) VALUES (?, ?)').run('logoPath', logoPath);
  res.json({ success: true, path: logoPath });
});

// --- Health (public) ---

router.get('/health', (req, res) => {
  res.json({ server: 'OK', database: 'OK' });
});

// --- Connectivity ---

router.get('/connectivity', requireAuth, async (req, res) => {
  const result = { server: true, database: true, slack: false };
  if (process.env.SLACK_WEBHOOK_URL) {
    try {
      const axios = require('axios');
      await axios.post(process.env.SLACK_WEBHOOK_URL, {
        text: ':white_check_mark: Connectivity test from Visitor Check-In system.'
      });
      result.slack = true;
    } catch {}
  }
  res.json(result);
});

// --- Visitors ---

router.get('/visitors', requireAuth, (req, res) => {
  const { search, from, to } = req.query;
  let sql = 'SELECT * FROM visitors WHERE 1=1';
  const params = [];

  if (search) {
    sql += ' AND (firstName LIKE ? OR lastName LIKE ? OR company LIKE ? OR host LIKE ?)';
    const s = `%${search}%`;
    params.push(s, s, s, s);
  }
  if (from) { sql += ' AND checkIn >= ?'; params.push(from); }
  if (to)   { sql += ' AND checkIn <= ?'; params.push(to + ' 23:59:59'); }

  sql += ' ORDER BY checkIn DESC';
  res.json(db.prepare(sql).all(...params));
});

router.delete('/visitors/:id', requireAuth, (req, res) => {
  db.prepare('DELETE FROM visitors WHERE id = ?').run(req.params.id);
  res.json({ success: true });
});

// --- Employees ---

router.get('/employees', requireAuth, (req, res) => {
  res.json(db.prepare('SELECT * FROM employees ORDER BY name ASC').all());
});

router.post('/employees', requireAuth, (req, res) => {
  const { name, email, slackUserId } = req.body;
  if (!name?.trim()) return res.status(400).json({ error: 'Name is required.' });

  const result = db.prepare(
    'INSERT INTO employees (name, email, slackUserId) VALUES (?, ?, ?)'
  ).run(name.trim(), email?.trim() || null, slackUserId?.trim() || null);

  res.json({ success: true, id: result.lastInsertRowid });
});

router.put('/employees/:id', requireAuth, (req, res) => {
  const { name, email, slackUserId } = req.body;
  if (!name?.trim()) return res.status(400).json({ error: 'Name is required.' });

  db.prepare(
    'UPDATE employees SET name = ?, email = ?, slackUserId = ? WHERE id = ?'
  ).run(name.trim(), email?.trim() || null, slackUserId?.trim() || null, req.params.id);

  res.json({ success: true });
});

router.delete('/employees/:id', requireAuth, (req, res) => {
  db.prepare('DELETE FROM employees WHERE id = ?').run(req.params.id);
  res.json({ success: true });
});

// --- Admins ---

router.get('/admins', requireAuth, (req, res) => {
  res.json(db.prepare('SELECT id, username FROM admins ORDER BY username').all());
});

router.post('/admins', requireAuth, (req, res) => {
  const { username, password } = req.body;
  if (!username?.trim() || !password) {
    return res.status(400).json({ error: 'Username and password are required.' });
  }

  const existing = db.prepare('SELECT id FROM admins WHERE username = ?').get(username.trim());
  if (existing) return res.status(409).json({ error: 'Username already exists.' });

  const hash = bcrypt.hashSync(password, 10);
  db.prepare('INSERT INTO admins (username, passwordHash) VALUES (?, ?)').run(username.trim(), hash);
  res.json({ success: true });
});

router.delete('/admins/:id', requireAuth, (req, res) => {
  if (parseInt(req.params.id) === req.session.adminId) {
    return res.status(400).json({ error: 'You cannot delete your own account.' });
  }
  db.prepare('DELETE FROM admins WHERE id = ?').run(req.params.id);
  res.json({ success: true });
});

module.exports = router;
