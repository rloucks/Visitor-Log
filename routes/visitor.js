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

  if (process.env.SLACK_WEBHOOK_URL) {
    try {
      const companyStr = company?.trim() ? ` from *${company.trim()}*` : '';
      await axios.post(process.env.SLACK_WEBHOOK_URL, {
        text: `:wave: *Visitor Check-In*\n*${firstName.trim()} ${lastName.trim()}*${companyStr} has arrived to see *${host.trim()}*.`
      });
    } catch (err) {
      console.error('Slack notification failed:', err.message);
    }
  }

  res.json({ success: true });
});

module.exports = router;
