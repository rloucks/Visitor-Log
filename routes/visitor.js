const express = require('express');
const axios = require('axios');
const https = require('https');
const multer = require('multer');
const path = require('path');
const fs = require('fs');
const db = require('../db');
const sse = require('../lib/sse');

const router = express.Router();

// Photo upload — memory storage so we can name the file after the visitor ID
const photoUpload = multer({
  storage: multer.memoryStorage(),
  limits: { fileSize: 2 * 1024 * 1024 }
});

const photosDir = path.join(__dirname, '..', 'uploads', 'photos');
if (!fs.existsSync(photosDir)) fs.mkdirSync(photosDir, { recursive: true });

// Server-Sent Events — kiosk listens here for remote commands (e.g. refresh)
router.get('/events', (req, res) => {
  res.setHeader('Content-Type',  'text/event-stream');
  res.setHeader('Cache-Control', 'no-cache');
  res.setHeader('Connection',    'keep-alive');
  res.flushHeaders();

  // Initial heartbeat so the browser doesn't time out immediately
  res.write(':connected\n\n');

  sse.addClient(res);

  // Keep-alive ping every 25 s (iOS Safari closes idle SSE after ~30 s)
  const ping = setInterval(() => { try { res.write(':ping\n\n'); } catch {} }, 25000);

  req.on('close', () => {
    clearInterval(ping);
    sse.removeClient(res);
  });
});

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

// Expected guests — show guests not yet checked in today; multi-day repeats re-appear each day
router.get('/expected-guests', (req, res) => {
  const { host } = req.query;
  // Show a guest if:
  //   (a) they haven't checked in yet, OR they're a repeat guest who checked in on a previous day
  //   AND (b) they're still within their repeat window (repeatUntil null = single-day)
  const sql = `
    SELECT * FROM expected_guests
    WHERE (
      checkedIn = 0
      OR (repeatUntil IS NOT NULL AND date(lastCheckedInDate) < date('now'))
    )
    AND (repeatUntil IS NULL OR date(repeatUntil) >= date('now'))
    ${host ? "AND LOWER(host) = LOWER(?)" : ""}
    ORDER BY createdAt ASC
  `;
  const guests = host
    ? db.prepare(sql).all(host)
    : db.prepare(sql).all();
  res.json(guests);
});

// Check-in
router.post('/checkin', async (req, res) => {
  const { firstName, lastName, company, host, expectedGuestId } = req.body;

  if (!firstName?.trim() || !lastName?.trim() || !host?.trim()) {
    return res.status(400).json({ error: 'First name, last name, and host are required.' });
  }

  const stayHours   = parseInt(req.body.stayHours,   10) || 0;
  const stayMinutes = parseInt(req.body.stayMinutes,  10) || 0;

  const insertResult = db.prepare(`
    INSERT INTO visitors (firstName, lastName, company, host, stayHours, stayMinutes)
    VALUES (?, ?, ?, ?, ?, ?)
  `).run(firstName.trim(), lastName.trim(), company?.trim() || null, host.trim(), stayHours, stayMinutes);

  // Mark expected guest as checked in (track date for multi-day repeat logic)
  if (expectedGuestId) {
    const today = new Date().toISOString().slice(0, 10);
    db.prepare('UPDATE expected_guests SET checkedIn = 1, lastCheckedInDate = ? WHERE id = ?').run(today, expectedGuestId);
  }

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

  // Read all integration settings
  const getSetting = key => db.prepare('SELECT value FROM settings WHERE key = ?').get(key)?.value || '';
  const n8nUrl          = getSetting('n8nWebhookUrl')       || process.env.N8N_WEBHOOK_URL    || '';
  const slackUrl        = getSetting('slackWebhookUrl')     || process.env.SLACK_WEBHOOK_URL  || '';
  const botToken        = getSetting('slackBotToken')       || process.env.SLACK_BOT_TOKEN    || '';
  const teamsUrl        = getSetting('teamsWebhookUrl')     || process.env.TEAMS_WEBHOOK_URL  || '';
  const telegramToken   = getSetting('telegramBotToken')    || process.env.TELEGRAM_BOT_TOKEN || '';
  const telegramChatId  = getSetting('telegramChatId')      || process.env.TELEGRAM_CHAT_ID   || '';
  const googleChatUrl   = getSetting('googleChatWebhookUrl')|| process.env.GOOGLE_CHAT_URL    || '';
  const customUrl       = getSetting('customWebhookUrl')    || '';
  const customBody      = getSetting('customWebhookBody')   || '';

  // Message variants
  const companyStr  = payload.company ? ` from *${payload.company}*` : '';
  const companyHtml = payload.company ? ` from **${payload.company}**` : '';
  const hostMention = payload.hostSlackId ? `<@${payload.hostSlackId}>` : `*${payload.host}*`;
  const channelMsg  = `:wave: ${hostMention} has a visitor at the door - *${payload.firstName} ${payload.lastName}*${companyStr}. Please let them know or greet the guest.`;
  const dmMsg       = `:wave: Hello, you have a visitor who just checked in at the door. *${payload.firstName} ${payload.lastName}*${companyStr}.`;
  const plainMsg    = `👋 ${payload.host} has a visitor at the door — ${payload.firstName} ${payload.lastName}${payload.company ? ' from ' + payload.company : ''}. Please let them know or greet the guest.`;

  // n8n takes full control when configured
  if (n8nUrl) {
    // NOTE: rejectUnauthorized disabled temporarily — cert expired, pending renewal
    await axios.post(n8nUrl, payload, { httpsAgent: new https.Agent({ rejectUnauthorized: false }) })
      .catch(err => console.error('n8n webhook failed:', err.message));
  } else {
    // Fire all configured direct integrations in parallel
    const sends = [];

    // Slack — DM host, optionally also channel
    if (botToken && payload.hostSlackId) {
      sends.push(
        axios.post('https://slack.com/api/chat.postMessage',
          { channel: payload.hostSlackId, text: dmMsg },
          { headers: { Authorization: `Bearer ${botToken}` } }
        ).catch(err => console.error('Slack DM failed:', err.message))
      );
      if (getSetting('slackChannelEnabled') === '1' && slackUrl) {
        sends.push(
          axios.post(slackUrl, { text: channelMsg })
            .catch(err => console.error('Slack channel failed:', err.message))
        );
      }
    } else if (slackUrl) {
      sends.push(
        axios.post(slackUrl, { text: channelMsg })
          .catch(err => console.error('Slack notification failed:', err.message))
      );
    }

    // Microsoft Teams
    if (teamsUrl) {
      const teamsBody = {
        type: 'message',
        attachments: [{
          contentType: 'application/vnd.microsoft.card.adaptive',
          content: {
            $schema: 'http://adaptivecards.io/schemas/adaptive-card.json',
            type: 'AdaptiveCard',
            version: '1.2',
            body: [{
              type: 'TextBlock',
              text: `👋 **${payload.firstName} ${payload.lastName}**${payload.company ? ' from **' + payload.company + '**' : ''} has arrived to see **${payload.host}**.`,
              wrap: true
            }]
          }
        }]
      };
      sends.push(
        axios.post(teamsUrl, teamsBody)
          .catch(err => console.error('Teams notification failed:', err.message))
      );
    }

    // Telegram
    if (telegramToken && telegramChatId) {
      const telegramText = `👋 *Visitor Check\\-In*\n*${payload.firstName} ${payload.lastName}*${payload.company ? ' from _' + payload.company + '_' : ''} has arrived to see *${payload.host}*\\.`;
      sends.push(
        axios.post(`https://api.telegram.org/bot${telegramToken}/sendMessage`, {
          chat_id:    telegramChatId,
          text:       telegramText,
          parse_mode: 'MarkdownV2'
        }).catch(err => console.error('Telegram notification failed:', err.message))
      );
    }

    // Google Chat
    if (googleChatUrl) {
      sends.push(
        axios.post(googleChatUrl, { text: plainMsg })
          .catch(err => console.error('Google Chat notification failed:', err.message))
      );
    }

    // Custom JSON webhook
    if (customUrl && customBody) {
      try {
        const interpolated = customBody.replace(/\{\{(\w+)\}\}/g, (_, k) => payload[k] ?? '');
        sends.push(
          axios.post(customUrl, JSON.parse(interpolated), {
            headers: { 'Content-Type': 'application/json' }
          }).catch(err => console.error('Custom webhook failed:', err.message))
        );
      } catch (err) {
        console.error('Custom webhook body is invalid JSON:', err.message);
      }
    }

    await Promise.all(sends);
  }

  res.json({ success: true, visitorId: insertResult.lastInsertRowid });
});

// Photo capture — uploaded from kiosk after check-in completes
router.post('/photo', photoUpload.single('photo'), (req, res) => {
  const visitorId = parseInt(req.body.visitorId, 10);
  if (!visitorId || !req.file) return res.status(400).json({ error: 'Missing data.' });

  const filename  = `visitor-${visitorId}.jpg`;
  const filepath  = path.join(photosDir, filename);
  fs.writeFileSync(filepath, req.file.buffer);

  const photoPath = `/uploads/photos/${filename}`;
  db.prepare('UPDATE visitors SET photoPath = ? WHERE id = ?').run(photoPath, visitorId);
  res.json({ success: true, photoPath });
});

// Event mode — visitor list with live check-in status
router.get('/event', (req, res) => {
  const getSetting = key => db.prepare('SELECT value FROM settings WHERE key = ?').get(key)?.value || '';

  const manualOn   = getSetting('eventMode') === '1';
  const eventStart = getSetting('eventStart');
  const eventEnd   = getSetting('eventEnd');

  let scheduledOn = false;
  if (eventStart && eventEnd) {
    const now = new Date();
    scheduledOn = now >= new Date(eventStart) && now <= new Date(eventEnd);
  }

  if (!manualOn && !scheduledOn) return res.json({ eventMode: false });

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
