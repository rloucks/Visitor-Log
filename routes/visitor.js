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

  db.prepare(`
    INSERT INTO visitors (firstName, lastName, company, host)
    VALUES (?, ?, ?, ?)
  `).run(firstName.trim(), lastName.trim(), company?.trim() || null, host.trim());

  // Look up the host's Slack user ID from employees table
  const employee = db.prepare('SELECT slackUserId FROM employees WHERE LOWER(name) = LOWER(?)').get(host.trim());
  const hostSlackId = employee?.slackUserId || null;

  const payload = {
    firstName: firstName.trim(),
    lastName: lastName.trim(),
    company: company?.trim() || '',
    host: host.trim(),
    hostSlackId: hostSlackId || ''
  };

  // Prefer n8n webhook (handles Slack + Google Calendar)
  if (process.env.N8N_WEBHOOK_URL) {
    try {
      await axios.post(process.env.N8N_WEBHOOK_URL, payload);
    } catch (err) {
      console.error('n8n webhook failed:', err.message);
    }
  } else if (process.env.SLACK_WEBHOOK_URL) {
    // Fallback: direct Slack webhook if n8n not configured
    try {
      const companyStr = payload.company ? ` from *${payload.company}*` : '';
      await axios.post(process.env.SLACK_WEBHOOK_URL, {
        text: `:wave: *Visitor Check-In*\n*${payload.firstName} ${payload.lastName}*${companyStr} has arrived to see *${payload.host}*.`
      });
    } catch (err) {
      console.error('Slack notification failed:', err.message);
    }
  }

  res.json({ success: true });
});

module.exports = router;
