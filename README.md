# Visitor Check-In System

A self-hosted, iPad-friendly visitor kiosk with a full web admin panel. Visitors check in on a touch screen, hosts are notified via Slack, and every visit is logged with optional photo capture. Designed for NIST-aligned physical access tracking.

---

## Table of Contents

1. [Features](#features)
2. [Architecture](#architecture)
3. [Requirements](#requirements)
4. [Deployment — Docker (recommended)](#deployment--docker-recommended)
5. [Deployment — Local / Development](#deployment--local--development)
6. [iPad Setup](#ipad-setup)
7. [Admin Panel Guide](#admin-panel-guide)
   - [System Status & Kiosk Control](#system-status--kiosk-control)
   - [Visitor Log](#visitor-log)
   - [Expected Guests](#expected-guests)
   - [Employees](#employees)
   - [Admin Users](#admin-users)
   - [Integrations](#integrations)
   - [Appearance](#appearance)
   - [Event Mode](#event-mode)
8. [Kiosk Flow](#kiosk-flow)
9. [n8n Workflow](#n8n-workflow)
10. [Environment Variables](#environment-variables)

---

## Features

- **Animated kiosk idle screen** — Vanta.js backgrounds (NET, DOTS, WAVES, BIRDS, FOG, and more), uploadable logo, fully customisable colours and fonts
- **Letter-picker host selection** — visitors browse by first initial, then tap a name — no scrolling through long dropdowns
- **Expected Guests** — pre-add visitors from the admin; they appear as one-tap buttons after the host is selected
- **Returning visitor auto-fill** — previous visit details (company, host) are recalled automatically by name
- **Slack notifications** — three delivery modes in priority order:
  1. **n8n webhook** — full automation (DMs, channel posts, Google Calendar)
  2. **Slack Bot Token** — direct DM to the host via Slack API; optionally also posts to a channel
  3. **Slack Incoming Webhook** — fallback channel post
- **Kiosk remote refresh** — broadcast a page reload to all connected iPads from the admin panel instantly
- **Daily backups** — CSV of each day's visits saved automatically at midnight; records older than 365 days are purged; optional email delivery via SMTP
- **Event Mode** — approved visitor list with one-tap check-in/check-out and automatic stay duration; schedulable by datetime window
- **Visitor photo capture** — silently takes a front-camera photo after check-in (requires HTTPS)
- **Special message banner** — toggleable text overlay with full formatting controls
- **Full admin panel** — visitor log with search/filter/export, employee management, admin user management, appearance editor
- **Docker deployment** — single `docker compose up -d`; auto-generates a self-signed TLS cert on first run

---

## Architecture

```
┌─────────────────────────────────────────────────────┐
│  Docker Container                                   │
│                                                     │
│  Node.js / Express (HTTPS :3000)                    │
│  ├── /api/visitor/*    — kiosk endpoints + SSE      │
│  ├── /api/admin/*      — admin endpoints            │
│  ├── /uploads/         — logo, photos, backups      │
│  └── public/           — static frontend            │
│                                                     │
│  better-sqlite3 → /app/data/visitors.db             │
│  node-cron      → nightly backup job                │
└─────────────────────────────────────────────────────┘
         │ bind mounts
┌────────┴────────────────────┐
│  Host filesystem            │
│  ./data/                    │  SQLite database
│  ./uploads/                 │  Logo, visitor photos, CSV backups
│  ./certs/                   │  TLS key + cert
└─────────────────────────────┘
```

---

## Requirements

- **Server** — any Linux machine with Docker + Docker Compose
- **Kiosk device** — iPad (or any touch device with a modern browser)
- **Network** — kiosk and server on the same LAN, or server reachable via HTTPS
- **Optional** — n8n instance for Slack + Google Calendar automation
- **Optional** — Slack App with Bot Token for direct host DMs

---

## Deployment — Docker (recommended)

### 1. Clone the repository

```bash
git clone https://github.com/your-org/visitor-log.git
cd visitor-log
```

### 2. Configure `docker-compose.yml`

```yaml
environment:
  SESSION_SECRET: "replace-with-a-long-random-string"
  SERVER_HOSTNAME: "192.168.1.55"   # ← your server's LAN IP
```

`SERVER_HOSTNAME` is embedded in the auto-generated TLS certificate's Subject Alternative Name. iOS requires this to trust a self-signed cert.

### 3. Create host directories and start

```bash
mkdir -p data uploads certs
chmod 777 certs
docker compose up -d
```

On first boot the container generates a self-signed TLS certificate. View the iPad setup instructions:

```bash
docker compose logs kiosk
```

### 4. Verify

```bash
ss -tlnp | grep 443
curl -k https://localhost
```

Access the admin panel at `https://<server-ip>/admin.html`.  
Default credentials: **admin / admin** — change these immediately.

### Ongoing management

```bash
docker compose up -d          # start
docker compose down           # stop
docker compose restart kiosk  # restart after config change
docker compose up -d --build  # rebuild after a code update
docker compose logs -f kiosk  # live logs
```

---

## Deployment — Local / Development

```bash
npm install
cp .env.example .env          # edit SESSION_SECRET at minimum
node server.js
```

Runs on **http://localhost:3000**. Photo capture is disabled on plain HTTP (requires HTTPS).

---

## iPad Setup

### Install the TLS certificate (one time)

The auto-generated `.mobileconfig` profile is served at `http://<server-ip>:8080/cert` — open this URL in Safari on the iPad.

Alternatively, copy the cert manually:

1. Open `https://<server-ip>/uploads/cert.pem` in Safari → it will prompt to install
2. Settings → General → VPN & Device Management → tap the profile → **Install**
3. Settings → General → About → **Certificate Trust Settings** → enable full trust

### Configure the kiosk browser

1. Open Safari and navigate to `https://<server-ip>`
2. Share → **Add to Home Screen** for a full-screen kiosk feel
3. Settings → Accessibility → **Guided Access** to lock the iPad to the app

---

## Admin Panel Guide

Navigate to `https://<server-ip>/admin.html` and sign in.

---

### System Status & Kiosk Control

**Connectivity** — checks live connectivity to the server, database, and Slack webhook.

**Kiosk Control** — shows how many kiosk screens are currently connected and provides a **Refresh Kiosk** button. Clicking it broadcasts an instant reload to every connected iPad via Server-Sent Events. Use this after making config or appearance changes without physically touching the device.

---

### Visitor Log

Displays all check-in records. Supports:

- **Search** — filter by visitor name, company, or host
- **Date range filter** — narrow to a specific period
- **Export CSV** — downloads the currently filtered view
- **Delete** — removes individual records (also deletes visitor photo from disk)

**Danger Zone — Clear Log** permanently deletes every visitor record and all associated photos. Export a backup first using **Download Full Export**.

---

### Expected Guests

Pre-add visitors you are expecting. When a visitor arrives and selects the host on the kiosk, any expected guests for that host appear as one-tap buttons — no typing needed.

**Adding an expected guest**

Fill in First Name, Last Name, optional Company, and select the employee they are visiting. Click **Add**.

**How it works on the kiosk**

1. Visitor taps idle screen → letter picker → selects the host
2. If expected guests exist for that host → their name cards appear with an **Other Guest** option
3. Tapping a name card pre-fills the check-in form and goes straight to confirm
4. After check-in, the guest is marked done and no longer appears

**Managing the list**

The Pending Guests table shows all guests (pending and checked-in). Click **Remove** to delete any entry manually.

---

### Employees

The employee list powers the host selection on the kiosk and enables Slack direct messaging.

**Adding employees**

Fill in Name (required), Email (optional), and Slack User ID (optional, format `U0123ABCDEF`) then click **Add**.

To find a Slack User ID: open the person's Slack profile → three-dot menu → **Copy member ID**.

**Importing from CSV**

CSV must have a header row with at minimum a `name` column. Optional columns: `email`, `slackUserId`.

```csv
name,email,slackUserId
Jane Smith,jane@company.com,U0123ABCDEF
John Doe,john@company.com,
```

---

### Admin Users

- **Add Admin** — username + password
- **Delete** — removes any admin except your own account
- Default `admin / admin` account should be changed or deleted immediately

---

### Integrations

Notification delivery follows this priority order — the first configured method wins (except the channel toggle, which adds a second delivery on top of the DM).

#### n8n Webhook *(highest priority)*

Paste your n8n webhook URL. All check-in events are sent here as a JSON POST — n8n handles Slack DMs, channel posts, and Google Calendar.

Click **Test n8n Connection** to send a test payload and confirm the workflow is reachable and active.

Payload:
```json
{
  "firstName": "Jane",
  "lastName":  "Smith",
  "company":   "Acme Corp",
  "host":      "John Doe",
  "hostSlackId": "U0123ABCDEF"
}
```

Import `n8n-visitor-workflow.json` from this repository. See [n8n Workflow](#n8n-workflow) for setup steps.

#### Slack Bot Token *(direct DM)*

Paste a Slack Bot Token (`xoxb-...`). When set and the host has a Slack User ID, check-in notifications are sent as a direct message to the host.

Message format:
> 👋 Hello, you have a visitor who just checked in at the door. **Jane Smith** from **Acme Corp**.

Use **Send Test DM** to pick an employee from the list and send a test message to confirm delivery.

To create a Slack app and get a bot token, import `slack-app-manifest.json` from this repository at `api.slack.com/apps` → Create New App → From a manifest.

#### Slack Channel Webhook *(channel notification)*

Paste an incoming webhook URL. This is used in two ways:

- **Fallback** — if no bot token is configured, all check-in notifications go here
- **Also notify channel** — enable the toggle to send to this channel *in addition to* the host DM when a bot token is active

Message format:
> 👋 @Richard has a visitor at the door - **Jane Smith** from **Acme Corp**. Please let them know or greet the guest.

Click **Send Test Message** to verify the webhook is working.

#### Backups & Email

Daily CSV backups run automatically at midnight.

| Setting | Description |
|---|---|
| Email Backup | Toggle automatic email delivery of the daily CSV |
| Send To | Recipient email address |
| Send From | Sender address (can match SMTP username) |
| SMTP Host / Port | Your mail server |
| SMTP Username / Password | SMTP credentials |
| TLS | Enable for port 465; leave off for port 587 (STARTTLS) |

- **Test Email** — sends a plain test message to confirm SMTP is working
- **Run Backup Now** — exports today's records immediately to `uploads/backups/` and emails if enabled

Backup files are retained indefinitely. Records in the database older than **365 days** are automatically purged each night.

---

### Appearance

Controls everything the visitor sees on the kiosk.

#### General

Set the **Display Name** shown on the idle screen.

#### Kiosk Features

**Visitor Photo Capture** — silently takes a front-camera photo after each check-in. Requires HTTPS and a one-time camera permission grant. Off by default.

#### Special Message

Optional banner on the kiosk idle screen.

| Setting | Description |
|---|---|
| Enable | Toggle on/off |
| Message | Text to display |
| Color / Bold / Size | Text formatting |
| Position | Top or bottom |
| Alignment | Left / centre / right |
| Banner Background | Colour and opacity |

#### Clock

| Setting | Description |
|---|---|
| Visibility | Show or hide |
| Timezone | Common timezone list |
| Format | 12-hour or 24-hour |
| Position | Six positions (top/bottom × left/centre/right) |

#### Colors & Font

All changes apply live. Click **Save** to persist.

| Setting | Description |
|---|---|
| Accent & Buttons | Primary colour for interactive elements |
| Text Color | Body text |
| Card Background | Form card colour |
| Card Transparency | 0–100% opacity |
| Page Background | Solid fallback colour |
| Font | 25+ Google Fonts |
| Title / Body Weight | 100–900 |

#### Background Effect

| Effect | Description |
|---|---|
| NET | Connected nodes with lines |
| DOTS | Floating particle field |
| WAVES | Animated ocean surface |
| BIRDS | Flocking bird swarm |
| RINGS | Pulsing concentric circles |
| CELLS | Organic cellular mesh |
| FOG | Volumetric colour haze |
| GLOBE | Spinning wireframe sphere |
| HALO | Glowing ring pulse |
| RIPPLE | Water ripple surface |
| CLOUDS | Sky and cloud scene |
| GRADIENT | Static multi-stop gradient |
| GRADIENT_MOVE | Animated shifting gradient |
| SNOW / LEAVES / RAIN / SAKURA / FIREFLIES | Seasonal canvas effects |
| IMAGE | Static background image |
| VIDEO | Looping background video |
| NONE | Solid colour only |

#### Logo

Upload a PNG or SVG (transparent background recommended, max 5 MB).

---

### Event Mode

Replaces the normal flow with a pre-approved visitor list. Visitors find their name and tap to check in or out. Stay duration is calculated automatically on checkout.

| Setting | Description |
|---|---|
| Event Mode toggle | Force on regardless of schedule |
| Event Name | Shown on kiosk; used as "host" in the log |
| Schedule Start / End | Auto-activates within this datetime window |

**Importing visitors via CSV** — requires `firstName` and `lastName` columns:

```csv
firstName,lastName,company
Jane,Smith,Acme Corp
John,Doe,
```

---

## Kiosk Flow

### Normal Mode

```
Idle screen (tap anywhere)
  → Step 1: Tap a letter → tap a host name
  → Step 0: If expected guests exist for that host:
              tap your name card  ──→ Step 2 (pre-filled)
              tap "Other Guest"   ──→ Step 2 (blank)
  → Step 2: Enter / confirm First Name, Last Name, Company
            (auto-fills from previous visit if name matches)
  → Step 3: Success — host notified via Slack
            (silent photo taken if feature is enabled)
  → Returns to idle after 5 seconds
```

Auto-returns to idle after **2 minutes of inactivity** at any step.

### Event Mode

```
Idle screen (tap anywhere)
  → Event visitor list (searchable)
  → Confirm check-in or check-out
  → Success screen with stay duration (on checkout)
  → Returns to idle after 5 seconds
```

---

## n8n Workflow

Import `n8n-visitor-workflow.json` into your n8n instance.

**Workflow steps:**

1. **Webhook** — receives POST from the kiosk at `/webhook/visitor-checkin`
2. **Post to Channel** — posts arrival message to `#front-desk`
3. **Log to Calendar** — creates a 30-minute Google Calendar event *(optional — delete node to skip)*
4. **Has Host Slack ID?** — branches on whether `hostSlackId` is present
5. **DM the Host** — sends a direct Slack message if the host Slack ID is known
6. **Respond OK** — returns `{ "success": true }` to the kiosk

**Setup after import:**

1. Activate the workflow and copy the **Production Webhook URL** from the *Visitor Arrives* node
2. Paste it into Admin → Integrations → n8n Webhook URL → Save
3. Click **Test n8n Connection** to confirm it's working
4. Connect your Slack credential on the *Post to Channel* and *DM the Host* nodes
5. Update `#front-desk` in *Post to Channel* to your actual channel
6. Connect Google Calendar credential on *Log to Calendar* (or delete the node)
7. Add each employee's Slack User ID under Admin → Employees

---

## Environment Variables

| Variable | Default | Description |
|---|---|---|
| `PORT` | `3000` | Port the server listens on |
| `SESSION_SECRET` | *(required)* | Secret for signing session cookies — use a long random string |
| `SERVER_HOSTNAME` | `localhost` | LAN IP or hostname for TLS cert SAN (Docker only) |
| `DB_PATH` | `./visitors.db` | Path to the SQLite database file |
| `NODE_ENV` | — | Set to `production` to enable secure cookies |
| `N8N_WEBHOOK_URL` | — | n8n webhook URL (overrides DB setting) |
| `SLACK_WEBHOOK_URL` | — | Incoming webhook fallback (overrides DB setting) |
| `SLACK_BOT_TOKEN` | — | Slack Bot Token for host DMs (overrides DB setting) |
