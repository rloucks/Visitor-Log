const express = require('express');
const bcrypt = require('bcryptjs');
const sse = require('../lib/sse');
const multer = require('multer');
const path = require('path');
const fs = require('fs');
const db = require('../db');

// photoPath is stored as "/uploads/photos/visitor-1.jpg" — resolve from project root
function deleteVisitorPhoto(photoPath) {
  if (!photoPath) return;
  try {
    const file = path.join(__dirname, '..', photoPath);
    if (fs.existsSync(file)) fs.unlinkSync(file);
  } catch {}
}

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

const PUBLIC_SETTINGS = ['companyName', 'logoPath', 'vantaEffect', 'vantaOptions', 'clockTimezone', 'clockFormat', 'clockPosition', 'uiAccentColor', 'uiTextColor', 'uiSurfaceColor', 'uiSurfaceOpacity', 'uiBgColor', 'uiFont', 'fontWeightTitle', 'fontWeightBody', 'eventMode', 'eventName', 'eventStart', 'eventEnd', 'specialMessageEnabled', 'specialMessage', 'specialMessageSize', 'specialMessageColor', 'specialMessageBgColor', 'specialMessageBgOpacity', 'specialMessagePosition', 'specialMessageAlign', 'specialMessageBold', 'clockEnabled', 'photoCapture'];

router.get('/settings', (req, res) => {
  const rows = db.prepare('SELECT key, value FROM settings WHERE key IN (' +
    PUBLIC_SETTINGS.map(() => '?').join(',') + ')').all(...PUBLIC_SETTINGS);
  const settings = Object.fromEntries(rows.map(r => [r.key, r.value]));
  res.json(settings);
});

router.post('/settings', requireAuth, (req, res) => {
  const allowed = ['companyName', 'vantaEffect', 'vantaOptions', 'clockTimezone', 'clockFormat', 'clockPosition', 'uiAccentColor', 'uiTextColor', 'uiSurfaceColor', 'uiSurfaceOpacity', 'uiBgColor', 'uiFont', 'fontWeightTitle', 'fontWeightBody', 'eventMode', 'eventName', 'eventStart', 'eventEnd', 'specialMessageEnabled', 'specialMessage', 'specialMessageSize', 'specialMessageColor', 'specialMessageBgColor', 'specialMessageBgOpacity', 'specialMessagePosition', 'specialMessageAlign', 'specialMessageBold', 'clockEnabled', 'photoCapture'];
  const stmt = db.prepare('INSERT OR REPLACE INTO settings (key, value) VALUES (?, ?)');
  for (const key of allowed) {
    if (req.body[key] !== undefined) stmt.run(key, req.body[key]);
  }
  res.json({ success: true });
});

// --- Integrations (protected) ---

const INTEGRATION_KEYS = [
  'slackWebhookUrl', 'n8nWebhookUrl', 'slackBotToken', 'slackChannelEnabled',
  'backupEmailEnabled', 'backupEmailTo', 'backupEmailFrom',
  'smtpHost', 'smtpPort', 'smtpUser', 'smtpPass', 'smtpSecure'
];

router.get('/integrations', requireAuth, (req, res) => {
  const rows = db.prepare('SELECT key, value FROM settings WHERE key IN (' +
    INTEGRATION_KEYS.map(() => '?').join(',') + ')').all(...INTEGRATION_KEYS);
  const result = Object.fromEntries(rows.map(r => [r.key, r.value || '']));
  res.json(result);
});

router.post('/integrations', requireAuth, (req, res) => {
  const stmt = db.prepare('INSERT OR REPLACE INTO settings (key, value) VALUES (?, ?)');
  for (const key of INTEGRATION_KEYS) {
    if (req.body[key] !== undefined) stmt.run(key, req.body[key] || '');
  }
  res.json({ success: true });
});

router.post('/integrations/run-backup', requireAuth, async (req, res) => {
  try {
    const { runBackupForDate, sendEmail } = require('../lib/scheduler');
    const dateStr = new Date().toISOString().slice(0, 10);
    const result  = await runBackupForDate(dateStr);
    if (!result) return res.json({ success: true, message: 'No visitors today — nothing to back up.' });

    const emailEnabled = db.prepare("SELECT value FROM settings WHERE key = 'backupEmailEnabled'").get()?.value === '1';
    if (emailEnabled) {
      await sendEmail(result.filepath, result.filename, dateStr, result.count);
    }
    res.json({ success: true, message: `Backed up ${result.count} record(s) to ${result.filename}.${emailEnabled ? ' Email sent.' : ''}` });
  } catch (err) {
    res.status(502).json({ error: err.message });
  }
});

router.post('/integrations/test-email', requireAuth, async (req, res) => {
  const row   = db.prepare("SELECT value FROM settings WHERE key = 'backupEmailTo'").get();
  const emailTo = row?.value;
  if (!emailTo) return res.status(400).json({ error: 'No recipient email configured.' });
  try {
    const nodemailer = require('nodemailer');
    const getSetting = key => db.prepare('SELECT value FROM settings WHERE key = ?').get(key)?.value || '';
    const transporter = nodemailer.createTransport({
      host:   getSetting('smtpHost'),
      port:   parseInt(getSetting('smtpPort') || '587', 10),
      secure: getSetting('smtpSecure') === '1',
      auth:   getSetting('smtpUser') ? { user: getSetting('smtpUser'), pass: getSetting('smtpPass') } : undefined
    });
    await transporter.sendMail({
      from:    getSetting('backupEmailFrom') || getSetting('smtpUser'),
      to:      emailTo,
      subject: 'Visitor Log — Email Test',
      text:    'Your email notifications for Visitor Log backups are working correctly.'
    });
    res.json({ success: true });
  } catch (err) {
    res.status(502).json({ error: err.message });
  }
});

router.post('/integrations/test-slack-dm', requireAuth, async (req, res) => {
  const { employeeId } = req.body;
  if (!employeeId) return res.status(400).json({ error: 'employeeId required.' });

  const emp = db.prepare('SELECT name, slackUserId FROM employees WHERE id = ?').get(employeeId);
  if (!emp)              return res.status(404).json({ error: 'Employee not found.' });
  if (!emp.slackUserId)  return res.status(400).json({ error: `${emp.name} has no Slack User ID set.` });

  const row = db.prepare("SELECT value FROM settings WHERE key = 'slackBotToken'").get();
  const token = row?.value || process.env.SLACK_BOT_TOKEN;
  if (!token) return res.status(400).json({ error: 'No Slack Bot Token configured.' });

  try {
    const axios = require('axios');
    const result = await axios.post('https://slack.com/api/chat.postMessage', {
      channel: emp.slackUserId,
      text:    `:white_check_mark: Test message from Visitor Log — your Slack DM notifications are working!`
    }, { headers: { Authorization: `Bearer ${token}` } });

    if (!result.data.ok) {
      return res.status(502).json({ error: `Slack error: ${result.data.error}` });
    }
    res.json({ success: true });
  } catch (err) {
    res.status(502).json({ error: `Slack returned an error: ${err.message}` });
  }
});

router.post('/integrations/test-n8n', requireAuth, async (req, res) => {
  const row = db.prepare("SELECT value FROM settings WHERE key = 'n8nWebhookUrl'").get();
  const url = row?.value || process.env.N8N_WEBHOOK_URL;
  if (!url) return res.status(400).json({ error: 'No n8n webhook URL configured.' });
  try {
    const axios = require('axios');
    const https = require('https');
    // NOTE: rejectUnauthorized disabled temporarily — cert expired, pending renewal
    await axios.post(url, {
      firstName: 'Test',
      lastName:  'Visitor',
      company:   'Admin Panel',
      host:      'Test Host',
      hostSlackId: ''
    }, { httpsAgent: new https.Agent({ rejectUnauthorized: false }) });
    res.json({ success: true });
  } catch (err) {
    res.status(502).json({ error: `n8n returned an error: ${err.message}` });
  }
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

// --- Kiosk remote control ---

router.get('/kiosk/status', requireAuth, (req, res) => {
  res.json({ connected: sse.clientCount() });
});

router.post('/kiosk/refresh', requireAuth, (req, res) => {
  sse.broadcast('refresh', {});
  res.json({ success: true, sent: sse.clientCount() });
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
  const row = db.prepare('SELECT photoPath FROM visitors WHERE id = ?').get(req.params.id);
  deleteVisitorPhoto(row?.photoPath);
  db.prepare('DELETE FROM visitors WHERE id = ?').run(req.params.id);
  res.json({ success: true });
});

router.delete('/visitors', requireAuth, (req, res) => {
  const rows = db.prepare('SELECT photoPath FROM visitors WHERE photoPath IS NOT NULL').all();
  rows.forEach(r => deleteVisitorPhoto(r.photoPath));
  db.prepare('DELETE FROM visitors').run();
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

router.delete('/employees', requireAuth, (req, res) => {
  db.prepare('DELETE FROM employees').run();
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

// --- Event Visitors ---

router.get('/event-visitors', requireAuth, (req, res) => {
  res.json(db.prepare('SELECT * FROM event_visitors ORDER BY lastName ASC, firstName ASC').all());
});

router.post('/event-visitors', requireAuth, (req, res) => {
  const { firstName, lastName, company } = req.body;
  if (!firstName?.trim() || !lastName?.trim()) {
    return res.status(400).json({ error: 'First and last name are required.' });
  }
  const result = db.prepare(
    'INSERT INTO event_visitors (firstName, lastName, company) VALUES (?, ?, ?)'
  ).run(firstName.trim(), lastName.trim(), company?.trim() || null);
  res.json({ success: true, id: result.lastInsertRowid });
});

router.delete('/event-visitors/:id', requireAuth, (req, res) => {
  db.prepare('DELETE FROM event_visitors WHERE id = ?').run(req.params.id);
  res.json({ success: true });
});

router.delete('/event-visitors', requireAuth, (req, res) => {
  db.prepare('DELETE FROM event_visitors').run();
  res.json({ success: true });
});

// --- Expected Guests ---

router.get('/expected-guests', requireAuth, (req, res) => {
  res.json(db.prepare('SELECT * FROM expected_guests ORDER BY createdAt ASC').all());
});

router.post('/expected-guests', requireAuth, (req, res) => {
  const { firstName, lastName, company, host } = req.body;
  if (!firstName?.trim() || !lastName?.trim() || !host?.trim()) {
    return res.status(400).json({ error: 'First name, last name, and host are required.' });
  }
  const result = db.prepare(
    'INSERT INTO expected_guests (firstName, lastName, company, host) VALUES (?, ?, ?, ?)'
  ).run(firstName.trim(), lastName.trim(), company?.trim() || null, host.trim());
  res.json({ success: true, id: result.lastInsertRowid });
});

router.delete('/expected-guests/:id', requireAuth, (req, res) => {
  db.prepare('DELETE FROM expected_guests WHERE id = ?').run(req.params.id);
  res.json({ success: true });
});

router.delete('/expected-guests', requireAuth, (req, res) => {
  db.prepare('DELETE FROM expected_guests').run();
  res.json({ success: true });
});

module.exports = router;
