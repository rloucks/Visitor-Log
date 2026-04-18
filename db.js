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

db.prepare(`
  CREATE TABLE IF NOT EXISTS event_visitors (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    firstName TEXT NOT NULL,
    lastName TEXT NOT NULL,
    company TEXT
  )
`).run();

// Default per-effect Vanta options (stored as JSON string)
const defaultVantaOptions = JSON.stringify({
  NET:    { color: '#ffffff', backgroundColor: '#000000', points: 8,   maxDistance: 25,  spacing: 20, speed: 1.5 },
  DOTS:   { color: '#ffffff', color2: '#444444', backgroundColor: '#000000', size: 3, spacing: 35, speed: 1.5 },
  WAVES:  { color: '#1a3a6b', backgroundColor: '#000000', waveHeight: 20, waveSpeed: 1, shininess: 30, zoom: 1 },
  BIRDS:  { color1: '#ff6600', color2: '#0066ff', backgroundColor: '#000000', quantity: 3, birdSize: 1.5, speedLimit: 5, separation: 20 },
  RINGS:  { color: '#ffffff', backgroundColor: '#000000', backgroundAlpha: 1, amplitudeFactor: 1, size: 1, speed: 1 },
  CELLS:  { color1: '#ffffff', color2: '#888888', color3: '#444444', backgroundColor: '#000000', size: 1.5, speed: 1.5 },
  FOG:    { highlightColor: '#ff6633', midtoneColor: '#222244', lowlightColor: '#000011', backgroundColor: '#000000', blurFactor: 0.6, speed: 1.5, zoom: 1 },
  GLOBE:  { color: '#ffffff', color2: '#444444', backgroundColor: '#000000', size: 1, speed: 1 },
  HALO:   { baseColor: '#0066ff', backgroundColor: '#000000', amplitudeFactor: 1, size: 1.5, xOffset: 0, yOffset: 0 },
  RIPPLE: { color: '#0044ff', backgroundColor: '#000000', waveHeight: 30, waveSpeed: 1, zoom: 1 },
  CLOUDS: { backgroundColor: '#111111', skyColor: '#68b8d7', cloudColor: '#adc4c8', cloudShadowColor: '#183550', sunColor: '#ff9919', speed: 1 },
  NONE:   { backgroundColor: '#000000' },
});

// Default settings
const defaults = {
  companyName:      'Visitor Check-In',
  logoPath:         '',
  slackWebhookUrl:  '',
  n8nWebhookUrl:    '',
  vantaEffect:      'NET',
  vantaOptions:     defaultVantaOptions,
  clockTimezone:    'America/New_York',
  clockFormat:      '12',
  clockPosition:    'top-center',
  uiAccentColor:    '#ffffff',
  uiTextColor:      '#ffffff',
  uiSurfaceColor:   '#111111',
  uiSurfaceOpacity: '100',
  uiBgColor:        '#000000',
  uiFont:           'Roboto',
  fontWeightTitle:  '300',
  fontWeightBody:   '400',
  eventMode:        '0',
  eventName:        'Event',
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

// Migrations — safe to run on every start
try { db.prepare('ALTER TABLE visitors ADD COLUMN stayHours INTEGER NOT NULL DEFAULT 0').run(); } catch {}
try { db.prepare('ALTER TABLE visitors ADD COLUMN stayMinutes INTEGER NOT NULL DEFAULT 0').run(); } catch {}
try { db.prepare('ALTER TABLE visitors ADD COLUMN checkOut DATETIME').run(); } catch {}

module.exports = db;
