const Database = require('better-sqlite3');
const bcrypt = require('bcryptjs');

const db = new Database('visitors.db');

db.pragma('journal_mode = WAL');

db.prepare(`
  CREATE TABLE IF NOT EXISTS visitors (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    firstName TEXT NOT NULL,
    lastName TEXT NOT NULL,
    company TEXT,
    host TEXT NOT NULL,
    checkIn DATETIME DEFAULT CURRENT_TIMESTAMP
  )
`).run();

db.prepare(`
  CREATE TABLE IF NOT EXISTS employees (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    name TEXT NOT NULL,
    email TEXT,
    slackUserId TEXT
  )
`).run();

db.prepare(`
  CREATE TABLE IF NOT EXISTS admins (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    username TEXT UNIQUE NOT NULL,
    passwordHash TEXT NOT NULL
  )
`).run();

db.prepare(`
  CREATE TABLE IF NOT EXISTS settings (
    key TEXT PRIMARY KEY,
    value TEXT
  )
`).run();

// Default settings
const defaults = {
  companyName: 'Visitor Check-In',
  backgroundStyle: 'particles',
  logoPath: '',
  slackWebhookUrl: '',
  n8nWebhookUrl: ''
};

const upsertSetting = db.prepare(`INSERT OR IGNORE INTO settings (key, value) VALUES (?, ?)`);
for (const [key, value] of Object.entries(defaults)) {
  upsertSetting.run(key, value);
}

// Create default admin if none exist
const adminCount = db.prepare('SELECT COUNT(*) as count FROM admins').get();
if (adminCount.count === 0) {
  const hash = bcrypt.hashSync('admin', 10);
  db.prepare('INSERT INTO admins (username, passwordHash) VALUES (?, ?)').run('admin', hash);
  console.log('\x1b[33m[!] Default admin created — username: admin / password: admin. Change this password immediately!\x1b[0m');
}

module.exports = db;
