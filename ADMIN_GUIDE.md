# Visitor Check-In — Administrator Guide

This guide covers everything needed to manage and configure the Visitor Check-In system through the admin panel.

---

## Table of Contents

1. [Logging In](#1-logging-in)
2. [System Status](#2-system-status)
3. [Visitor Log](#3-visitor-log)
4. [Expected Guests](#4-expected-guests)
5. [Employees](#5-employees)
6. [Admin Users](#6-admin-users)
7. [Integrations](#7-integrations)
   - [n8n Webhook](#71-n8n-webhook)
   - [Slack Bot Token](#72-slack-bot-token-direct-dm)
   - [Slack Channel Webhook](#73-slack-channel-webhook)
   - [Microsoft Teams](#74-microsoft-teams)
   - [Telegram](#75-telegram)
   - [Google Chat](#76-google-chat)
   - [Custom JSON Webhook](#77-custom-json-webhook)
   - [Backups & Email](#78-backups--email)
8. [Settings](#8-settings)
   - [Identity](#81-identity)
   - [Appearance](#82-appearance)
   - [Clock](#83-clock)
   - [Message Banner](#84-message-banner)
   - [Features](#85-features)
9. [Event Mode](#9-event-mode)

---

## 1. Logging In

Open the admin panel in any browser:

```
https://your-server-address/admin.html
```

Enter your admin username and password, then click **Sign In**.

> *[Screenshot: Login screen with username and password fields]*

If you have forgotten your password, a server administrator can reset it from the command line — see the README for instructions.

---

## 2. System Status

The **System Status** section is the default landing page of the admin panel.

> *[Screenshot: System Status section showing connectivity grid and Kiosk Control card]*

### Connectivity Check

Click **Run Check** to test the connection between the server, the database, and Slack (if configured via environment variable). Status indicators show:

| Indicator | Meaning |
|---|---|
| **OK** (green) | Service is reachable |
| **FAIL** (red) | Service is unreachable or returned an error |
| **—** | Check has not been run yet |

> *[Screenshot: Connectivity grid with OK/FAIL indicators]*

### Kiosk Control

The **Kiosk Control** card shows how many kiosk screens are currently connected. Click **Refresh Kiosk** to force all connected screens to reload immediately — useful after changing settings or when the kiosk needs to be reset remotely.

> *[Screenshot: Kiosk Control card showing connected count and Refresh button]*

The connected count updates automatically every 10 seconds.

---

## 3. Visitor Log

The **Visitor Log** section displays every check-in recorded by the system.

> *[Screenshot: Visitor Log table with search and filter controls]*

### Searching and Filtering

| Control | Function |
|---|---|
| Search box | Filter by visitor name, company, or host |
| From / To date pickers | Restrict results to a date range |
| **Clear** button | Remove all active filters |

### Exporting

Click **Export CSV** to download the currently visible records as a spreadsheet.

Click **Download Full Export** (in the Danger Zone) to export every record regardless of active filters.

### Visitor Photos

If photo capture is enabled, a small thumbnail appears next to each visitor's name. Click the thumbnail to enlarge it.

> *[Screenshot: Visitor table row with photo thumbnail and enlarged lightbox view]*

### Deleting Records

- Click **Delete** on a row to remove a single record.
- Use **Clear All Records** in the Danger Zone to wipe the entire log. You will be asked to confirm twice and type `DELETE` before anything is erased.

> *[Screenshot: Danger Zone card with export and clear buttons]*

---

## 4. Expected Guests

Expected Guests lets you pre-register visitors before they arrive. When a pre-registered visitor checks in, their name appears as a one-tap button on the kiosk — no typing required.

> *[Screenshot: Expected Guests section with add form and pending guests table]*

### Adding an Expected Guest

Fill in the form at the top of the section:

| Field | Required? | Notes |
|---|---|---|
| First Name | Yes | |
| Last Name | Yes | |
| Company | No | |
| Visiting | Yes | Select the employee they are visiting from the dropdown |
| Repeat Until | No | See below |

Click **Add** to save.

> *[Screenshot: Add Expected Guest form with all fields filled in]*

### Repeat Until — Multi-Day Visits

Leave **Repeat Until** blank for a one-time visit. The guest will appear on the kiosk until they check in, then automatically disappear.

Set a **Repeat Until** date for visitors who will be on-site across multiple days — contractors, consultants, or conference attendees, for example. The guest will reappear on the kiosk each morning and disappear again once they check in for that day. They are automatically removed from the system the morning after the repeat date passes.

> *[Screenshot: Repeat Until date picker with a future date selected]*

### Guest Status

The Pending Guests table shows the current state of each expected guest:

| Status | Meaning |
|---|---|
| **Pending** | Has not yet checked in today |
| **Pending (Repeat)** | Multi-day guest — checked in on a previous day, will reappear today |
| **Checked In Today ✓** | Has checked in today (multi-day guest) |
| **Checked In ✓** | Has checked in (single-day guest — will not reappear) |
| **Expired** | Repeat window has passed |

Click **Remove** to delete an expected guest entry at any time.

> *[Screenshot: Pending Guests table showing a mix of statuses]*

---

## 5. Employees

The **Employees** section manages the list of people visitors can select as their host.

> *[Screenshot: Employees section with add form and employee table]*

### Adding an Employee

Fill in the form and click **Add**:

| Field | Required? | Notes |
|---|---|---|
| Full Name | Yes | Displayed on the kiosk exactly as entered |
| Email | No | For reference only — not currently used for notifications |
| Slack User ID | No | Required for direct Slack DM notifications — see [Slack Bot Token](#72-slack-bot-token-direct-dm) |

### Editing an Employee

Click **Edit** on any row to load their details back into the form. Make your changes and click **Save Changes**. Click **Cancel** to discard.

### Finding a Slack User ID

In Slack, click on the person's profile → click the **⋯** (More) menu → **Copy member ID**. The ID starts with `U`, for example `U0123456789`.

> *[Screenshot: Slack profile dialog with "Copy member ID" option highlighted]*

### Importing from CSV

Prepare a CSV file with this header row (order does not matter):

```
name,email,slackUserId
```

Click **Import** to add all rows. Rows that are missing a name are skipped.

### Exporting

Click **Export CSV** to download the full employee list.

### Removing Employees

- Click **Delete** on a row to remove a single employee.
- Use **Clear All Employees** in the Danger Zone to remove everyone. You will be asked to confirm twice and type `DELETE`.

---

## 6. Admin Users

The **Admin Users** section manages who can access the admin panel.

> *[Screenshot: Admin Users section with add form and user table]*

### Adding an Admin

Enter a username and password, then click **Add Admin**. Passwords are stored as secure hashed values — they are never stored in plain text.

### Removing an Admin

Click **Delete** next to any admin user. You cannot delete your own account.

> **Important:** There must always be at least one admin account. Do not delete all accounts or you will be locked out.

### Changing a Password

There is no in-panel password change UI. To reset a password, delete the account and create a new one with the same username and the new password.

---

## 7. Integrations

The **Integrations** section controls how the system notifies hosts when a visitor checks in.

### Notification Priority

Notifications follow this order. **n8n takes full control when configured.** Without n8n, all other configured integrations fire simultaneously:

```
n8n (exclusive)
  └─ OR ─── Slack DM (+ optional channel)
         ── Microsoft Teams
         ── Telegram
         ── Google Chat
         ── Custom JSON Webhook
```

Each integration has a **Save** button and a **Test** button. Always click **Save** before testing.

> *[Screenshot: Integrations section showing the list of integration cards]*

---

### 7.1 n8n Webhook

> *[Screenshot: n8n Webhook card with URL field and Test button]*

Paste your n8n webhook URL and click **Save**. When this is set, all check-in events are sent exclusively to n8n — no other integration will fire.

The payload sent to n8n:

```json
{
  "firstName": "Jane",
  "lastName": "Smith",
  "company": "Acme Corp",
  "host": "Richard Loucks",
  "hostSlackId": "U0123456789"
}
```

Click **Test n8n Connection** to send a test payload.

---

### 7.2 Slack Bot Token (Direct DM)

> *[Screenshot: Slack Bot Token card with token field and employee test selector]*

When set, the system sends a direct message to the host on Slack when their visitor arrives. The host's **Slack User ID** must be set on their employee record (see [Employees](#5-employees)).

**To get a Bot Token:**
1. Go to [api.slack.com/apps](https://api.slack.com/apps) and create a new app using the manifest file included in this project (`slack-app-manifest.json`)
2. Under **OAuth & Permissions**, install the app to your workspace
3. Copy the **Bot User OAuth Token** (starts with `xoxb-`)

**To test:** Select an employee from the dropdown and click **Send Test DM**. That employee must have a Slack User ID set.

---

### 7.3 Slack Channel Webhook

> *[Screenshot: Slack Channel Webhook card with URL field and channel toggle]*

Paste a Slack Incoming Webhook URL to post visitor arrivals to a channel.

The **Also Notify Channel** toggle controls whether the channel post fires in addition to the DM when a Bot Token is active. Without a Bot Token, the channel webhook is the only Slack delivery method.

Click **Send Test Message** to verify the webhook.

---

### 7.4 Microsoft Teams

> *[Screenshot: Teams card with Incoming Webhook URL field]*

Paste a Teams Incoming Webhook URL to post visitor arrivals as an Adaptive Card in a Teams channel.

**To create a Teams webhook:**
1. Open the channel → click **⋯** → **Connectors**
2. Find **Incoming Webhook** → **Configure**
3. Give it a name (e.g. "Visitor Log") and click **Create**
4. Copy the URL and paste it here

Click **Send Test Message** to verify.

---

### 7.5 Telegram

> *[Screenshot: Telegram card with Bot Token and Chat ID fields]*

Send visitor notifications to a Telegram chat, group, or channel.

**Setup:**
1. Message `@BotFather` in Telegram → send `/newbot` → follow the prompts → copy the token
2. Add your bot to the target chat or group
3. To find the Chat ID, open `https://api.telegram.org/bot<YOUR_TOKEN>/getUpdates` in a browser after sending a message to the chat. Look for `"chat":{"id":...}` in the response

Click **Send Test Message** to verify.

---

### 7.6 Google Chat

> *[Screenshot: Google Chat card with Incoming Webhook URL field]*

Post visitor arrivals to a Google Chat space.

**To create a Google Chat webhook:**
1. Open the Space → click the space name at the top → **Apps & integrations**
2. Click **Webhooks** → **Add webhook**
3. Give it a name and click **Save** → copy the URL

Click **Send Test Message** to verify.

---

### 7.7 Custom JSON Webhook

> *[Screenshot: Custom JSON Webhook card with URL and body textarea]*

POST a fully custom JSON payload to any HTTP endpoint on every check-in.

Use `{{placeholder}}` tokens in the JSON body to inject visitor data:

| Token | Value |
|---|---|
| `{{firstName}}` | Visitor's first name |
| `{{lastName}}` | Visitor's last name |
| `{{company}}` | Visitor's company |
| `{{host}}` | Host's full name |
| `{{hostSlackId}}` | Host's Slack User ID |

**Example body:**

```json
{
  "text": "{{firstName}} {{lastName}} from {{company}} has arrived to see {{host}}",
  "visitor_id": "{{firstName}}_{{lastName}}"
}
```

Click **Send Test Payload** to fire a test request using dummy values.

---

### 7.8 Backups & Email

> *[Screenshot: Backups & Email card with toggle, email fields, and SMTP section]*

Every night at midnight the system automatically:
1. Exports the previous day's visitor records to a CSV file stored on the server (`uploads/backups/`)
2. Purges any visitor records older than 365 days
3. Emails the CSV if the **Email Backup** toggle is on

**Configuration:**

| Field | Description |
|---|---|
| Email Backup toggle | Enable/disable the nightly email |
| Send To | Recipient email address |
| Send From | Sender email address |
| SMTP Host | Your mail server hostname |
| SMTP Port | Usually `587` (STARTTLS) or `465` (TLS) |
| Username | SMTP login username |
| Password | SMTP login password |
| Use TLS | Check if using port 465 |

Click **Save**, then **Test Email** to confirm delivery. Click **Run Backup Now** to trigger a manual backup for today's records immediately.

---

## 8. Settings

The **Settings** section controls the appearance and behaviour of the kiosk screen.

> *[Screenshot: Settings section with tab bar showing Identity, Appearance, Clock, Message Banner, Features]*

### 8.1 Identity

> *[Screenshot: Identity tab with company name field and logo upload]*

| Setting | Description |
|---|---|
| Display Name | Shown on the kiosk screen and in email subjects |
| Logo | Upload a PNG or SVG (transparent background recommended, max 5 MB) |

Click **Save** after making changes.

---

### 8.2 Appearance

> *[Screenshot: Appearance tab showing color pickers, font selector, and background effect dropdown]*

**Colors**

| Setting | Affects |
|---|---|
| Accent & Buttons | Button colour, highlight colour |
| Text | All body text on the kiosk |
| Card | Background colour of form cards |
| Background | Page background colour |

The **Card Transparency** slider controls how opaque the form cards are — useful when using a background effect.

**Font**

Select from a curated list of Google Fonts. The preview updates live. Use the **Title Weight** and **Body Weight** sliders to fine-tune the typography.

**Background Effect**

Choose from animated 3D effects (Net, Dots, Waves, Birds, etc.), gradients, seasonal effects (Snow, Rain, Sakura, etc.), a static image, a looping video, or a plain solid colour. Each effect has its own configuration controls that appear below the selector.

Click **Save** to persist all appearance settings.

---

### 8.3 Clock

> *[Screenshot: Clock tab with timezone, format, and position controls]*

| Setting | Options |
|---|---|
| Visibility | Show or hide the clock on the kiosk |
| Timezone | Pick from a list of worldwide timezones |
| Format | 12-hour (3:30 PM) or 24-hour (15:30) |
| Position | Top or bottom, left / center / right |

---

### 8.4 Message Banner

> *[Screenshot: Message Banner tab with message text, style controls, and preview]*

An optional banner displayed at the top or bottom of the idle kiosk screen.

| Setting | Description |
|---|---|
| Enabled toggle | Show or hide the banner |
| Message | The text to display |
| Color | Text colour |
| Bold | Bold text on/off |
| Size | Font size in rem (0.7 – 2.2) |
| Position | Top or bottom of the screen |
| Alignment | Left, centre, or right |
| Background Color / Opacity | Subtle backdrop behind the text |

Changes preview live in the admin panel itself. Click **Save** to apply to the kiosk.

---

### 8.5 Features

> *[Screenshot: Features tab with Visitor Photo toggle]*

| Setting | Description |
|---|---|
| Visitor Photo | Silently captures a photo from the kiosk camera after each check-in. Requires HTTPS and camera permission granted on the kiosk device. |

---

## 9. Event Mode

Event Mode replaces the normal check-in flow with a pre-approved visitor list — useful for conferences, open days, or any controlled-access event.

> *[Screenshot: Event Mode section showing settings card and Approved Visitors table]*

### Enabling Event Mode

Toggle **Enable on kiosk** to turn Event Mode on immediately regardless of any schedule.

### Scheduling

Set a **Start** and **End** date/time to have Event Mode activate and deactivate automatically within that window. The toggle above overrides the schedule (forces it on).

> *[Screenshot: Event Settings card with name, start/end datetime pickers, and status line]*

The schedule status line below the date pickers shows the current state:
- `● Event mode is ON` — currently active
- `Scheduled — starts [date]` — upcoming
- `Schedule ended [date]` — window has closed

### Managing Approved Visitors

Only visitors on the approved list can check in during Event Mode.

**Add individually:** Enter first name, last name, and optional company, then click **Add**.

**Import from CSV:** Prepare a file with at minimum `firstName` and `lastName` columns (a `company` column is optional). Click **Import CSV**.

> *[Screenshot: Approved Visitors card with add form, import controls, and visitor table]*

During Event Mode, the kiosk shows all approved visitors as buttons. Tapping a name checks that person in; tapping again checks them out. Check-in/out timestamps are recorded in the Visitor Log.

Click **Clear All** to remove every approved visitor from the list (does not affect the Visitor Log).

---

## Quick Reference — Notification Troubleshooting

| Symptom | Check |
|---|---|
| No notifications at all | Is the server running? Go to System Status → Run Check |
| n8n not receiving events | Is the n8n URL set in Integrations → n8n Webhook? Test it. Check n8n container is running. |
| Slack DM not arriving | Does the employee have a Slack User ID set? Is the Bot Token correct? Use Send Test DM. |
| Slack channel not posting | Is the channel webhook URL correct? Is "Also Notify Channel" toggled on? |
| Teams/Telegram/Google Chat silent | Is n8n configured? If so, it takes priority — disable n8n URL or handle routing inside n8n. |
| SSL / certificate error | If your n8n or other service has an expired certificate, renew it. A temporary workaround is noted in the README. |
| Email not sending | Use Test Email after saving SMTP settings. Check spam folder. Verify port and TLS setting. |
| Kiosk not refreshing | Use Kiosk Control → Refresh Kiosk. Check that the kiosk browser is online. |
