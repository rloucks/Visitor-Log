# Visitor Check-In System

A self-hosted, iPad-friendly visitor kiosk with a full web admin panel. Visitors check in on a touch screen, hosts receive Slack notifications, and every visit is logged with optional photo capture. Designed for NIST-aligned physical access tracking.

---

## Table of Contents

1. [Features](#features)
2. [Architecture](#architecture)
3. [Requirements](#requirements)
4. [Deployment — Docker (recommended)](#deployment--docker-recommended)
5. [Deployment — Local / Development](#deployment--local--development)
6. [iPad Setup](#ipad-setup)
7. [Admin Panel Guide](#admin-panel-guide)
   - [System Status](#system-status)
   - [Visitor Log](#visitor-log)
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
- **Visitor check-in flow** — select host → enter name/company → auto-fill returning visitors → success screen
- **Slack notifications** — direct message to the host + post to a channel (via Slack webhook or n8n)
- **n8n integration** — webhook to n8n handles Slack DMs, channel posts, and Google Calendar event logging
- **Event Mode** — approved visitor list with one-tap check-in/check-out and automatic stay duration; schedulable by start/end datetime
- **Special message banner** — toggleable text overlay with full formatting controls (position, colour, size, background)
- **Visitor photo capture** — silently takes a front-camera photo after check-in and stores a thumbnail in the log (requires HTTPS)
- **Full admin panel** — visitor log with search/filter/export, employee management, admin user management, appearance editor
- **Docker deployment** — single `docker compose up -d`; auto-generates a self-signed TLS cert on first run

---

## Architecture

```
┌─────────────────────────────────────────────┐
│  Docker Container                           │
│                                             │
│  Node.js / Express (HTTPS :3000)            │
│  ├── /api/visitor/*   — kiosk endpoints     │
│  ├── /api/admin/*     — admin endpoints     │
│  ├── /uploads/        — logo & photos       │
│  └── public/          — static frontend     │
│                                             │
│  better-sqlite3 → /app/data/visitors.db     │
└─────────────────────────────────────────────┘
         │ bind mounts
┌────────┴────────────────┐
│  Host filesystem        │
│  ./data/                │  SQLite database
│  ./uploads/             │  Logo + visitor photos
│  ./certs/               │  TLS key + cert
└─────────────────────────┘
```

---

## Requirements

- **Server** — any Linux machine with Docker + Docker Compose (Fedora, Ubuntu, Debian, etc.)
- **Kiosk device** — iPad (or any touch device with a modern browser)
- **Network** — kiosk and server on the same LAN, or server reachable via HTTPS
- **Optional** — n8n instance for Slack + Google Calendar automation

---

## Deployment — Docker (recommended)

### 1. Clone the repository

```bash
git clone https://github.com/your-org/visitor-log.git
cd visitor-log
```

### 2. Configure `docker-compose.yml`

Open `docker-compose.yml` and set these two values:

```yaml
environment:
  SESSION_SECRET: "replace-with-a-long-random-string"
  SERVER_HOSTNAME: "192.168.1.55"   # ← your server's LAN IP
```

`SERVER_HOSTNAME` is embedded in the auto-generated TLS certificate's Subject Alternative Name. iOS requires this to trust a self-signed cert. Use the IP address (or hostname) that the iPad will use to reach the server.

### 3. Create host directories and start

```bash
mkdir -p data uploads certs
chmod 777 certs
docker compose up -d
```

On first boot the container generates a self-signed TLS certificate in `./certs/` and prints iPad installation instructions to the log:

```bash
docker compose logs kiosk
```

### 4. Verify

```bash
# Port should be listening
ss -tlnp | grep 443

# App should respond
curl -k https://localhost
```

Access the admin panel at `https://<server-ip>/admin.html`.  
Default credentials: **admin / admin** — change these immediately after first login.

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

The server runs on **http://localhost:3000** (no TLS in dev — camera capture requires HTTPS so photo feature is disabled on plain HTTP).

---

## iPad Setup

### Install the TLS certificate (one time)

The certificate is at `./certs/cert.pem` on the host. Get it onto the iPad by one of these methods:

**Option A — Serve it temporarily:**
```bash
cp ./certs/cert.pem ./uploads/cert.pem
```
Open `https://<server-ip>/uploads/cert.pem` in Safari on the iPad. It will prompt to install. Remove the file from uploads after.

**Option B — AirDrop** from a Mac that has access to the server.

**After copying the file to the iPad:**

1. Settings → General → VPN & Device Management → tap the downloaded profile → **Install**
2. Settings → General → About → **Certificate Trust Settings** → enable full trust for the cert

### Configure the kiosk browser

1. Open Safari and navigate to `https://<server-ip>`
2. Add to Home Screen (Share → Add to Home Screen) for a full-screen kiosk feel
3. Enable **Guided Access** (Settings → Accessibility → Guided Access) to lock the iPad to the kiosk app

---

## Admin Panel Guide

Navigate to `https://<server-ip>/admin.html` and sign in.

---

### System Status

Checks live connectivity to the server, database, and Slack webhook. Click **Run Check** to test. Use this to confirm the system is healthy after deployment or config changes.

---

### Visitor Log

Displays all check-in records. Supports:

- **Search** — filter by visitor name, company, or host
- **Date range filter** — narrow to a specific period
- **Export CSV** — downloads the currently filtered view
- **Delete** — remove individual records (also deletes the visitor's photo from disk)

**Danger Zone — Clear Log**

Permanently deletes every visitor record and all associated photos. You will be asked to confirm twice, including typing `DELETE`. Export a backup first using **Download Full Export**.

> Visitor photos (if the photo capture feature is enabled) appear as circular thumbnails next to each visitor's name. Visitors without a photo show a placeholder icon.

---

### Employees

The employee list powers the host selection dropdown on the kiosk.

**Adding employees**

Fill in Name (required), Email (optional), and Slack User ID (optional, format `U0123ABCDEF`) then click **Add**.

The Slack User ID is used by the n8n workflow to send a direct message to the host when their visitor arrives. To find a user's Slack ID: open their profile in Slack → three-dot menu → **Copy member ID**.

**Editing employees**

Click **Edit** on any row — the form fills with their current details. Make changes and click **Save Changes**. Click **Cancel** to discard.

**Importing from CSV**

CSV must have a header row with at minimum a `name` column. Optional columns: `email`, `slackUserId`.

```csv
name,email,slackUserId
Jane Smith,jane@company.com,U0123ABCDEF
John Doe,john@company.com,
```

**Exporting / clearing**

- **Export CSV** — downloads the full employee list
- **Clear All Employees** — removes every employee (double-confirmed)

---

### Admin Users

Manage who can log in to the admin panel.

- **Add Admin** — username + password (minimum any length; use something strong)
- **Delete** — removes any admin except your own account
- The first-run default account is `admin / admin` — delete or change it immediately

---

### Integrations

**n8n Webhook** *(recommended)*

Paste your n8n webhook URL. When set, all check-in events are sent here as a JSON POST. n8n handles routing to Slack DMs, channel posts, and Google Calendar. Takes priority over the direct Slack webhook.

Import `n8n-visitor-workflow.json` from this repository into your n8n instance to get a pre-built workflow.

Payload sent to n8n:
```json
{
  "firstName": "Jane",
  "lastName":  "Smith",
  "company":   "Acme Corp",
  "host":      "John Doe",
  "hostSlackId": "U0123ABCDEF"
}
```

**Slack Direct Webhook** *(fallback)*

Used only when no n8n URL is set. Posts a single message to one channel. Create an incoming webhook at `api.slack.com/apps`.

Click **Send Test Message** to verify either integration is working.

---

### Appearance

Controls everything the visitor sees on the kiosk.

#### General

Set the **Display Name** shown on the idle screen (defaults to "Visitor Check-In").

#### Kiosk Features

**Visitor Photo Capture** — when enabled, the kiosk silently takes a front-camera photo after each check-in and stores a thumbnail in the visitor log. Requires HTTPS and a one-time camera permission grant in the browser. Off by default.

#### Special Message

An optional banner displayed on the kiosk idle screen and during event check-in.

| Setting | Description |
|---|---|
| Enable | Toggle the banner on/off |
| Message | The text to display |
| Color | Text colour |
| Bold | Bold text |
| Font Size | 0.7 – 2.2 rem |
| Position | Top or bottom of screen |
| Alignment | Left / centre / right |
| Banner Background | Background colour and opacity for the banner strip |

When **Top** position is selected, any clock set to a top position is automatically pushed to the bottom to avoid overlap.

#### Clock

| Setting | Description |
|---|---|
| Visibility | Show or hide the clock on the kiosk |
| Timezone | Select from a list of common timezones |
| Time Format | 12-hour or 24-hour |
| Position on Screen | Six positions: top/bottom × left/centre/right |

#### Colors & Font

All changes apply live as you adjust them. Click **Save** to persist.

| Setting | Description |
|---|---|
| Accent & Buttons | Primary colour for buttons and highlights |
| Text Color | Body text colour |
| Card Background | Background colour of form cards |
| Card Transparency | Opacity of cards (0–100%) — lower values let the background show through |
| Page Background | Solid fallback background colour |
| Font | Choose from 25+ Google Fonts across Clean, Bold, Tech, Elegant, and Monospace categories |
| Title Weight | Font weight for headings (100–900) |
| Body Weight | Font weight for body text (100–900) |

#### Background Effect

Choose from 12 animated Vanta.js effects or a solid colour. Each effect has its own set of controls (colours, speed, density, etc.). Changes are saved per-effect so switching between effects preserves your settings for each.

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
| NONE | Solid background colour only |

#### Logo

Upload a PNG or SVG (transparent background recommended, max 5 MB). The logo appears centred on the idle screen above the tap prompt.

---

### Event Mode

Event Mode replaces the normal host-selection flow with a pre-approved visitor list. Visitors find their name and tap to check in or out. Stay duration is calculated automatically on checkout.

#### Event Settings

| Setting | Description |
|---|---|
| Event Mode toggle | Manually force event mode on regardless of schedule |
| Event Name | Displayed on the kiosk and used as the "host" in the visitor log |
| Schedule Start / End | Auto-activates event mode within this datetime window |

The schedule is checked on every kiosk page load. The manual toggle overrides the schedule (forces on even outside the window). The status line below the form shows the current state.

#### Approved Visitors

Only visitors on this list can check in during Event Mode.

**Adding manually** — enter First Name, Last Name, and optional Company, click **Add**.

**Importing via CSV** — requires `firstName` and `lastName` columns (case-insensitive). Optional: `company`.

```csv
firstName,lastName,company
Jane,Smith,Acme Corp
John,Doe,
```

**Clear All** removes the entire approved list (single confirmation).

---

## Kiosk Flow

### Normal Mode

```
Idle screen (tap anywhere)
  → Step 1: Select host from dropdown
  → Step 2: Enter First Name, Last Name, Company
             (auto-fills from previous visit if name matches)
  → Step 3: Success — host notified
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
2. **Post to Channel** — posts arrival message to `#front-desk` (or whichever channel you configure)
3. **Log to Calendar** — creates a 30-minute Google Calendar event (optional — delete this node to skip)
4. **Has Host Slack ID?** — branches on whether `hostSlackId` is present
5. **DM the Host** — sends a direct Slack message to the host if their Slack ID is known
6. **Respond OK** — returns `{ "success": true }` to the kiosk

**Setup steps after import:**

1. Activate the workflow and copy the **Production Webhook URL** from the *Visitor Arrives* node
2. Paste it into Admin → Integrations → n8n Webhook URL
3. Connect your Slack credential on the *Post to Channel* and *DM the Host* nodes
4. Update `#front-desk` in *Post to Channel* to your actual channel name
5. Connect your Google Calendar credential on the *Log to Calendar* node (or delete the node)
6. Add each employee's Slack User ID in Admin → Employees

---

## Environment Variables

| Variable | Default | Description |
|---|---|---|
| `PORT` | `3000` | Port the server listens on inside the container |
| `SESSION_SECRET` | *(required)* | Secret used to sign session cookies — use a long random string |
| `SERVER_HOSTNAME` | `localhost` | LAN IP or hostname for TLS cert SAN (Docker only) |
| `DB_PATH` | `./visitors.db` | Path to the SQLite database file |
| `NODE_ENV` | — | Set to `production` to enable secure cookies |
| `N8N_WEBHOOK_URL` | — | n8n webhook URL (overrides DB setting if set) |
| `SLACK_WEBHOOK_URL` | — | Direct Slack webhook URL fallback (overrides DB setting if set) |
