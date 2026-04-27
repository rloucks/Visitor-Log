const cron       = require('node-cron');
const nodemailer  = require('nodemailer');
const path        = require('path');
const fs          = require('fs');
const db          = require('../db');

const backupsDir = path.join(__dirname, '..', 'uploads', 'backups');
if (!fs.existsSync(backupsDir)) fs.mkdirSync(backupsDir, { recursive: true });

function getSetting(key) {
  return db.prepare('SELECT value FROM settings WHERE key = ?').get(key)?.value || '';
}

function toCsvField(val) {
  return `"${String(val ?? '').replace(/"/g, '""')}"`;
}

function buildCsv(visitors) {
  const headers = ['ID', 'First Name', 'Last Name', 'Company', 'Host', 'Check In', 'Check Out', 'Stay Hours', 'Stay Minutes'];
  const rows = visitors.map(v => [
    v.id,
    toCsvField(v.firstName),
    toCsvField(v.lastName),
    toCsvField(v.company || ''),
    toCsvField(v.host),
    v.checkIn   || '',
    v.checkOut  || '',
    v.stayHours   ?? 0,
    v.stayMinutes ?? 0
  ].join(','));
  return [headers.join(','), ...rows].join('\n');
}

async function sendEmail(filepath, filename, dateStr, count) {
  const smtpHost   = getSetting('smtpHost');
  const smtpPort   = parseInt(getSetting('smtpPort') || '587', 10);
  const smtpUser   = getSetting('smtpUser');
  const smtpPass   = getSetting('smtpPass');
  const smtpSecure = getSetting('smtpSecure') === '1';
  const emailTo    = getSetting('backupEmailTo');
  const emailFrom  = getSetting('backupEmailFrom') || smtpUser;

  if (!smtpHost || !emailTo) {
    console.error('[Backup] Email enabled but SMTP host or recipient not configured.');
    return;
  }

  const transporter = nodemailer.createTransport({
    host:   smtpHost,
    port:   smtpPort,
    secure: smtpSecure,
    auth:   smtpUser ? { user: smtpUser, pass: smtpPass } : undefined
  });

  await transporter.sendMail({
    from:        emailFrom,
    to:          emailTo,
    subject:     `Visitor Log Backup — ${dateStr}`,
    text:        `Attached is the visitor log for ${dateStr}.\n\n${count} visitor(s) checked in.`,
    attachments: [{ filename, path: filepath }]
  });

  console.log(`[Backup] Email sent to ${emailTo}.`);
}

// Run backup for a specific date string (YYYY-MM-DD).
// Returns { filename, filepath, count } or null if no records.
async function runBackupForDate(dateStr) {
  const visitors = db.prepare(
    `SELECT * FROM visitors WHERE date(checkIn) = ? ORDER BY checkIn ASC`
  ).all(dateStr);

  if (!visitors.length) {
    console.log(`[Backup] No visitors on ${dateStr}, skipping.`);
    return null;
  }

  const csv      = buildCsv(visitors);
  const filename = `visitors-${dateStr}.csv`;
  const filepath = path.join(backupsDir, filename);
  fs.writeFileSync(filepath, csv);
  console.log(`[Backup] Saved ${filename} (${visitors.length} records).`);
  return { filename, filepath, count: visitors.length };
}

// Full nightly job: purge old records, backup yesterday, email if enabled.
async function runNightlyJob() {
  // 1. Delete visitor records older than 365 days
  const cutoff = new Date();
  cutoff.setDate(cutoff.getDate() - 365);
  const cutoffStr = cutoff.toISOString().slice(0, 10);
  const { changes } = db.prepare(`DELETE FROM visitors WHERE date(checkIn) < ?`).run(cutoffStr);
  if (changes > 0) console.log(`[Backup] Purged ${changes} record(s) older than 365 days.`);

  // 1b. Remove expired multi-day expected guests (repeatUntil has passed)
  const { changes: egChanges } = db.prepare(
    `DELETE FROM expected_guests WHERE repeatUntil IS NOT NULL AND date(repeatUntil) < date('now')`
  ).run();
  if (egChanges > 0) console.log(`[Backup] Removed ${egChanges} expired expected guest(s).`);

  // 2. Backup yesterday
  const yesterday = new Date();
  yesterday.setDate(yesterday.getDate() - 1);
  const dateStr = yesterday.toISOString().slice(0, 10);

  const result = await runBackupForDate(dateStr);
  if (!result) return;

  // 3. Email if enabled
  if (getSetting('backupEmailEnabled') === '1') {
    try {
      await sendEmail(result.filepath, result.filename, dateStr, result.count);
    } catch (err) {
      console.error('[Backup] Email failed:', err.message);
    }
  }
}

function start() {
  cron.schedule('0 0 * * *', () => {
    console.log('[Backup] Running nightly job…');
    runNightlyJob().catch(err => console.error('[Backup] Nightly job error:', err.message));
  });
  console.log('[Backup] Scheduler started — nightly job runs at midnight.');
}

module.exports = { start, runNightlyJob, runBackupForDate, sendEmail };
