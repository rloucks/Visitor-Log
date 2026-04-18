const express = require('express');
const axios = require('axios');
const db = require('../db');

const router = express.Router();

// Employee list for the kiosk dropdown
router.get('/employees', (req, res) => {
  const employees = db.prepare('SELECT id, name FROM employees ORDER BY name ASC').all();
  res.json(employees);
});

// Returning visitor autofill — looks up last visit by name
router.get('/returning', (req, res) => {
  const { firstName, lastName } = req.query;
  if (!firstName?.trim() || !lastName?.trim()) return res.json(null);

  const visitor = db.prepare(`
    SELECT firstName, lastName, company, host
    FROM visitors
    WHERE LOWER(firstName) = LOWER(?) AND LOWER(lastName) = LOWER(?)
    ORDER BY checkIn DESC
    LIMIT 1
  `).get(firstName.trim(), lastName.trim());

  res.json(visitor || null);
});

// Check-in
router.post('/checkin', async (req, res) => {
  const { firstName, lastName, company, host } = req.body;

  if (!firstName?.trim() || !lastName?.trim() || !host?.trim()) {
    return res.status(400).json({ error: 'First name, last name, and host are required.' });
  }

  const stayHours   = parseInt(req.body.stayHours,   10) || 0;
  const stayMinutes = parseInt(req.body.stayMinutes,  10) || 0;

  db.prepare(`
    INSERT INTO visitors (firstName, lastName, company, host, stayHours, stayMinutes)
    VALUES (?, ?, ?, ?, ?, ?)
  `).run(firstName.trim(), lastName.trim(), company?.trim() || null, host.trim(), stayHours, stayMinutes);

  // Look up the host's Slack user ID from employees table
  const employee = db.prepare('SELECT slackUserId FROM employees WHERE LOWER(name) = LOWER(?)').get(host.trim());
  const hostSlackId = employee?.slackUserId || '';

  const payload = {
    firstName: firstName.trim(),
    lastName:  lastName.trim(),
    company:   company?.trim() || '',
    host:      host.trim(),
    hostSlackId
  };

  // Read webhook URLs from DB settings, fall back to env vars
  const getSetting = key => db.prepare('SELECT value FROM settings WHERE key = ?').get(key)?.value || '';
  const n8nUrl   = getSetting('n8nWebhookUrl')   || process.env.N8N_WEBHOOK_URL   || '';
  const slackUrl = getSetting('slackWebhookUrl') || process.env.SLACK_WEBHOOK_URL || '';

  if (n8nUrl) {
    try {
      await axios.post(n8nUrl, payload);
    } catch (err) {
      console.error('n8n webhook failed:', err.message);
    }
  } else if (slackUrl) {
    try {
      const companyStr = payload.company ? ` from *${payload.company}*` : '';
      await axios.post(slackUrl, {
        text: `:wave: *Visitor Check-In*\n*${payload.firstName} ${payload.lastName}*${companyStr} has arrived to see *${payload.host}*.`
      });
    } catch (err) {
      console.error('Slack notification failed:', err.message);
    }
  }

  res.json({ success: true });
});

// Event mode — visitor list with live check-in status
router.get('/event', (req, res) => {
  const getSetting = key => db.prepare('SELECT value FROM settings WHERE key = ?').get(key)?.value || '';
  if (getSetting('eventMode') !== '1') return res.json({ eventMode: false });

  const eventName = getSetting('eventName') || 'Event';
  const visitors  = db.prepare('SELECT * FROM event_visitors ORDER BY lastName ASC, firstName ASC').all();
  const today     = new Date().toISOString().slice(0, 10);

  const activeCheckins = db.prepare(`
    SELECT id, firstName, lastName FROM visitors
    WHERE host = ? AND date(checkIn) = ? AND checkOut IS NULL
  `).all(eventName, today);

  const checkinMap = {};
  for (const ci of activeCheckins) {
    checkinMap[`${ci.firstName.toLowerCase()}|${ci.lastName.toLowerCase()}`] = ci.id;
  }

  const result = visitors.map(v => {
    const key = `${v.firstName.toLowerCase()}|${v.lastName.toLowerCase()}`;
    return { ...v, checkedIn: key in checkinMap, visitorRecordId: checkinMap[key] || null };
  });

  res.json({ eventMode: true, eventName, visitors: result });
});

// Event check-in
router.post('/event-checkin', (req, res) => {
  const { eventVisitorId } = req.body;
  if (!eventVisitorId) return res.status(400).json({ error: 'eventVisitorId required.' });

  const getSetting = key => db.prepare('SELECT value FROM settings WHERE key = ?').get(key)?.value || '';
  const eventName  = getSetting('eventName') || 'Event';
  const ev         = db.prepare('SELECT * FROM event_visitors WHERE id = ?').get(eventVisitorId);
  if (!ev) return res.status(404).json({ error: 'Visitor not found.' });

  const today    = new Date().toISOString().slice(0, 10);
  const existing = db.prepare(`
    SELECT id FROM visitors
    WHERE firstName = ? AND lastName = ? AND host = ? AND date(checkIn) = ? AND checkOut IS NULL
  `).get(ev.firstName, ev.lastName, eventName, today);

  if (existing) return res.status(409).json({ error: 'Already checked in.' });

  const result = db.prepare(`
    INSERT INTO visitors (firstName, lastName, company, host, stayHours, stayMinutes)
    VALUES (?, ?, ?, ?, 0, 0)
  `).run(ev.firstName, ev.lastName, ev.company || null, eventName);

  res.json({ success: true, visitorRecordId: result.lastInsertRowid });
});

// Event check-out
router.post('/event-checkout', (req, res) => {
  const { visitorRecordId } = req.body;
  if (!visitorRecordId) return res.status(400).json({ error: 'visitorRecordId required.' });

  const record = db.prepare('SELECT * FROM visitors WHERE id = ? AND checkOut IS NULL').get(visitorRecordId);
  if (!record) return res.status(404).json({ error: 'Active check-in not found.' });

  const now          = new Date();
  const checkOutISO  = now.toISOString().replace('T', ' ').slice(0, 19);
  const diffMs       = now.getTime() - new Date(record.checkIn).getTime();
  const totalMinutes = Math.round(diffMs / 60000);
  const stayHours    = Math.floor(totalMinutes / 60);
  const stayMinutes  = totalMinutes % 60;

  db.prepare('UPDATE visitors SET checkOut = ?, stayHours = ?, stayMinutes = ? WHERE id = ?')
    .run(checkOutISO, stayHours, stayMinutes, visitorRecordId);

  res.json({ success: true, stayHours, stayMinutes });
});

module.exports = router;
