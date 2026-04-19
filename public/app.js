// ============================================================
// State
// ============================================================
let selectedHost   = '';
let inactivityTimer = null;
const INACTIVITY_MS = 120000; // 2 minutes

// Clock state — populated from settings before startClock() runs
const clockSettings = { timezone: 'America/New_York', format: '12', position: 'top-center' };
let   timeServerOffset = 0; // ms difference between API server time and local Date.now()

// ============================================================
// Init
// ============================================================
document.addEventListener('DOMContentLoaded', async () => {
  await loadSettings(); // starts clock, reads photoCapture setting
  bindInactivity();
  // initCamera() is called inside loadSettings() only when photoCapture === '1'
});

// ============================================================
// Clock
// ============================================================

// Fetch accurate time from time.now API and store the offset vs local clock
async function syncTimeFromAPI(timezone) {
  try {
    const url = `https://time.now/developer/api/timezone/${timezone.replace('/', '/')}`;
    const res  = await fetch(url);
    const data = await res.json();
    const serverMs = new Date(data.datetime).getTime();
    timeServerOffset = serverMs - Date.now();
  } catch {
    timeServerOffset = 0; // fall back to local clock silently
  }
}

function applyClockPosition(position) {
  const clock = document.querySelector('.kiosk-clock');
  if (!clock) return;
  clock.style.top       = '';
  clock.style.bottom    = '';
  clock.style.left      = '';
  clock.style.right     = '';
  clock.style.transform = '';
  switch (position) {
    case 'top-left':
      clock.style.top  = '28px'; clock.style.left = '32px'; break;
    case 'top-right':
      clock.style.top  = '28px'; clock.style.right = '32px'; break;
    case 'bottom-left':
      clock.style.bottom = '28px'; clock.style.left = '32px'; break;
    case 'bottom-center':
      clock.style.bottom    = '28px';
      clock.style.left      = '50%';
      clock.style.transform = 'translateX(-50%)'; break;
    case 'bottom-right':
      clock.style.bottom = '28px'; clock.style.right = '32px'; break;
    default: // top-center
      clock.style.top       = '28px';
      clock.style.left      = '50%';
      clock.style.transform = 'translateX(-50%)';
  }
}

function startClock() {
  function tick() {
    const now = new Date(Date.now() + timeServerOffset);
    const tz  = clockSettings.timezone;
    const h12 = clockSettings.format !== '24';

    const time = now.toLocaleTimeString('en-US', {
      timeZone: tz, hour: '2-digit', minute: '2-digit', hour12: h12
    });
    const date = now.toLocaleDateString('en-US', {
      timeZone: tz, weekday: 'long', month: 'long', day: 'numeric'
    });

    document.getElementById('idleTime').textContent = time;
    document.getElementById('idleDate').textContent = date;
  }
  tick();
  setInterval(tick, 1000);
  // Re-sync with API every 10 minutes to stay accurate
  setInterval(() => syncTimeFromAPI(clockSettings.timezone), 10 * 60 * 1000);
}

// ============================================================
// Settings & Vanta Init
// ============================================================

// Fallback defaults used when no saved options exist for an effect
const VANTA_DEFAULTS = {
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
};

async function loadSettings() {
  try {
    const res = await fetch('/api/admin/settings');
    const s   = await res.json();

    if (s.companyName) {
      document.getElementById('companyName').textContent = s.companyName;
    }

    // Special message banner
    const msgEl  = document.getElementById('kioskMessage');
    const msgOn  = s.specialMessageEnabled === '1' && s.specialMessage?.trim();
    const msgPos = s.specialMessagePosition || 'bottom';
    if (msgOn) {
      msgEl.textContent      = s.specialMessage.trim();
      msgEl.style.color      = s.specialMessageColor    || '#ffffff';
      msgEl.style.fontSize   = `${s.specialMessageSize  || '1'}rem`;
      msgEl.style.fontWeight = s.specialMessageBold === '1' ? '700' : '400';
      msgEl.style.textAlign  = s.specialMessageAlign    || 'center';
      msgEl.style.background = hexToRgba(s.specialMessageBgColor || '#ffffff', (parseInt(s.specialMessageBgOpacity, 10) || 7) / 100);
      msgEl.classList.remove('msg-top', 'msg-bottom');
      msgEl.classList.add(`msg-${msgPos}`);
      msgEl.classList.remove('hidden');
    } else {
      msgEl.classList.add('hidden');
    }

    if (s.logoPath) {
      const img = document.createElement('img');
      img.src       = s.logoPath;
      img.alt       = 'Logo';
      img.className = 'logo-image';
      document.getElementById('logoContainer').appendChild(img);
    }

    // UI theme
    applyTheme(s);

    // Clock visibility
    const clockEl = document.querySelector('.kiosk-clock');
    if (s.clockEnabled === '0') {
      clockEl.classList.add('hidden');
    } else {
      clockEl.classList.remove('hidden');
    }

    // Clock settings
    clockSettings.timezone = s.clockTimezone || 'America/New_York';
    clockSettings.format   = s.clockFormat   || '12';
    clockSettings.position = s.clockPosition || 'top-center';

    // If the special message banner is at the top, push a top-anchored clock to the bottom
    let effectiveClockPos = clockSettings.position;
    if (msgOn && msgPos === 'top' && effectiveClockPos.startsWith('top-')) {
      effectiveClockPos = effectiveClockPos.replace('top-', 'bottom-');
    }
    applyClockPosition(effectiveClockPos);

    // Photo capture
    if (s.photoCapture === '1') initCamera();

    // Vanta background
    const effect  = s.vantaEffect || 'NET';
    const allOpts = s.vantaOptions ? JSON.parse(s.vantaOptions) : {};
    await initVanta(effect, allOpts[effect] || VANTA_DEFAULTS[effect] || VANTA_DEFAULTS.NET);
  } catch {
    document.getElementById('bgContainer').style.background = '#000000';
  }

  // Always start the clock — sync first for accuracy, fall back to local if API unreachable
  await syncTimeFromAPI(clockSettings.timezone);
  startClock();
}

// ============================================================
// UI Theme
// ============================================================
function hexToRgba(hex, opacity) {
  const h = (hex || '#111111').replace('#', '');
  const r = parseInt(h.slice(0, 2), 16);
  const g = parseInt(h.slice(2, 4), 16);
  const b = parseInt(h.slice(4, 6), 16);
  return `rgba(${r}, ${g}, ${b}, ${opacity})`;
}

function applyTheme(s) {
  const root = document.documentElement;
  if (s.uiAccentColor) root.style.setProperty('--accent', s.uiAccentColor);
  if (s.uiTextColor)   root.style.setProperty('--text',   s.uiTextColor);
  if (s.uiBgColor)     root.style.setProperty('--bg',     s.uiBgColor);

  const surfaceHex = s.uiSurfaceColor || '#111111';
  const opacity    = s.uiSurfaceOpacity !== undefined ? parseInt(s.uiSurfaceOpacity, 10) / 100 : 1;
  root.style.setProperty('--surface', hexToRgba(surfaceHex, opacity));

  if (s.fontWeightTitle) root.style.setProperty('--font-weight-title', s.fontWeightTitle);
  if (s.fontWeightBody)  root.style.setProperty('--font-weight-body',  s.fontWeightBody);

  const font = s.uiFont || 'Roboto';
  if (font !== 'Roboto') {
    const link = document.createElement('link');
    link.rel  = 'stylesheet';
    link.href = `https://fonts.googleapis.com/css2?family=${encodeURIComponent(font)}:wght@300;400;500&display=swap`;
    document.head.appendChild(link);
  }
  root.style.setProperty('--font-family', `'${font}', sans-serif`);
}

// ============================================================
// Vanta Background
// ============================================================

function hexToInt(hex) {
  return parseInt((hex || '#000000').replace('#', ''), 16);
}

// Convert any hex string values in an options object to integers for Vanta
function processVantaOpts(opts) {
  const hexRe = /^#[0-9a-fA-F]{6}$/;
  const out   = {};
  for (const [k, v] of Object.entries(opts)) {
    out[k] = (typeof v === 'string' && hexRe.test(v)) ? hexToInt(v) : v;
  }
  return out;
}

function loadScript(src) {
  return new Promise((resolve, reject) => {
    if (document.querySelector(`script[src="${src}"]`)) { resolve(); return; }
    const s   = document.createElement('script');
    s.src     = src;
    s.onload  = resolve;
    s.onerror = () => reject(new Error(`Failed to load ${src}`));
    document.head.appendChild(s);
  });
}

async function initVanta(effect, opts) {
  const container = document.getElementById('bgContainer');
  container.style.background = opts.backgroundColor || '#000000';

  if (!effect || effect === 'NONE') return;

  const key = effect.toUpperCase();

  try {
    if (!window.VANTA?.[key]) {
      await loadScript(`https://cdn.jsdelivr.net/npm/vanta@0.5.24/dist/vanta.${key.toLowerCase()}.min.js`);
    }

    try { window._vantaEffect?.destroy(); } catch {}
    window._vantaEffect = null;

    window._vantaEffect = window.VANTA[key]({
      THREE,
      el:            container,
      mouseControls: false,
      touchControls: false,
      gyroControls:  false,
      minHeight:     window.innerHeight,
      minWidth:      window.innerWidth,
      ...processVantaOpts(opts)
    });
  } catch (err) {
    console.warn('Vanta init failed:', err.message);
  }
}

// ============================================================
// Screen Navigation
// ============================================================
function showScreen(id) {
  document.querySelectorAll('.screen').forEach(s => s.classList.remove('active'));
  document.getElementById(id).classList.add('active');
}

function goIdle() {
  selectedHost = '';
  document.getElementById('firstName').value = '';
  document.getElementById('lastName').value  = '';
  document.getElementById('company').value   = '';
  document.getElementById('returningBadge').classList.add('hidden');

  // Always re-enable the check-in button so it's never stuck disabled
  const btn = document.getElementById('checkinBtn');
  btn.disabled    = false;
  btn.textContent = 'Check In';

  // Reset stay selects
  document.getElementById('stayHours').value   = '0';
  document.getElementById('stayMinutes').value = '0';

  showScreen('idle');
  clearInactivityTimer();
}

// ============================================================
// Inactivity Timeout
// ============================================================
function bindInactivity() {
  ['touchstart', 'click', 'keydown'].forEach(evt =>
    document.addEventListener(evt, resetInactivityTimer)
  );
}

function resetInactivityTimer() {
  clearInactivityTimer();
  inactivityTimer = setTimeout(goIdle, INACTIVITY_MS);
}

function clearInactivityTimer() {
  if (inactivityTimer) clearTimeout(inactivityTimer);
}

// ============================================================
// Step 1 — Select Host  (or route to Event Mode)
// ============================================================
async function startCheckin() {
  resetInactivityTimer();

  // Check if event mode is active
  try {
    const res  = await fetch('/api/visitor/event');
    const data = await res.json();
    if (data.eventMode) {
      loadEventScreen(data);
      return;
    }
  } catch {}

  // Normal mode
  showScreen('step1');
  const select = document.getElementById('employeeSelect');
  select.innerHTML = '<option value="">Loading…</option>';

  try {
    const res       = await fetch('/api/visitor/employees');
    const employees = await res.json();

    select.innerHTML = '<option value="">— Select an employee —</option>';

    if (!employees.length) {
      select.innerHTML = '<option value="" disabled>No employees configured</option>';
      return;
    }

    employees.forEach(emp => {
      const opt = document.createElement('option');
      opt.value       = emp.name;
      opt.textContent = emp.name;
      select.appendChild(opt);
    });
  } catch {
    select.innerHTML = '<option value="" disabled>Failed to load employees</option>';
  }
}

// ============================================================
// Event Mode
// ============================================================
let eventVisitors          = [];
let selectedEventVisitor   = null;

function htmlEsc(str) {
  return String(str ?? '')
    .replace(/&/g, '&amp;').replace(/</g, '&lt;')
    .replace(/>/g, '&gt;').replace(/"/g, '&quot;');
}

function loadEventScreen(data) {
  document.getElementById('eventTitle').textContent = data.eventName || 'Event Check-In';
  eventVisitors = data.visitors || [];
  document.getElementById('eventSearch').value = '';
  renderEventVisitors(eventVisitors);
  showScreen('event-step1');
}

function filterEventVisitors() {
  const q = document.getElementById('eventSearch').value.toLowerCase().trim();
  const filtered = q
    ? eventVisitors.filter(v =>
        `${v.firstName} ${v.lastName}`.toLowerCase().includes(q) ||
        (v.company || '').toLowerCase().includes(q))
    : eventVisitors;
  renderEventVisitors(filtered);
}

function renderEventVisitors(list) {
  const container = document.getElementById('eventVisitorList');
  if (!list.length) {
    container.innerHTML = '<p style="text-align:center;color:rgba(255,255,255,0.3);padding:24px 0;">No visitors found.</p>';
    return;
  }

  container.innerHTML = '';
  list.forEach(v => {
    const item = document.createElement('div');
    item.className = `event-visitor-item${v.checkedIn ? ' checked-in' : ''}`;

    const info = document.createElement('div');
    info.className = 'event-visitor-info';

    const name = document.createElement('div');
    name.className   = 'event-visitor-name';
    name.textContent = `${v.firstName} ${v.lastName}`;
    info.appendChild(name);

    if (v.company) {
      const company = document.createElement('div');
      company.className   = 'event-visitor-company';
      company.textContent = v.company;
      info.appendChild(company);
    }

    const status = document.createElement('div');
    status.className   = `event-visitor-status ${v.checkedIn ? 'status-in' : 'status-out'}`;
    status.textContent = v.checkedIn ? 'Checked In ✓' : 'Not Yet In';

    item.appendChild(info);
    item.appendChild(status);
    item.addEventListener('click', () => selectEventVisitor(v));
    container.appendChild(item);
  });
}

function selectEventVisitor(v) {
  selectedEventVisitor = v;
  resetInactivityTimer();

  const fullName = `${v.firstName} ${v.lastName}`;
  document.getElementById('eventVisitorName').textContent = fullName;

  if (v.checkedIn) {
    document.getElementById('eventActionTitle').textContent  = 'Check Out';
    document.getElementById('eventActionDetail').textContent = 'Your visit duration will be recorded automatically.';
    document.getElementById('eventActionBtn').textContent    = 'Check Out';
  } else {
    document.getElementById('eventActionTitle').textContent  = 'Check In';
    document.getElementById('eventActionDetail').textContent = 'Tap confirm to register your arrival.';
    document.getElementById('eventActionBtn').textContent    = 'Check In';
  }

  document.getElementById('eventActionBtn').disabled = false;
  showScreen('event-step2');
}

async function submitEventAction() {
  if (!selectedEventVisitor) return;

  const btn = document.getElementById('eventActionBtn');
  btn.disabled = true;

  try {
    if (selectedEventVisitor.checkedIn) {
      const res = await fetch('/api/visitor/event-checkout', {
        method:  'POST',
        headers: { 'Content-Type': 'application/json' },
        body:    JSON.stringify({ visitorRecordId: selectedEventVisitor.visitorRecordId })
      });
      if (!res.ok) throw new Error('Checkout failed');
      const data = await res.json();
      document.getElementById('step3Title').textContent    = 'See you next time!';
      document.getElementById('successMessage').textContent =
        `Thanks ${selectedEventVisitor.firstName}! You were here for ${fmtEventStay(data.stayHours, data.stayMinutes)}.`;
    } else {
      const res = await fetch('/api/visitor/event-checkin', {
        method:  'POST',
        headers: { 'Content-Type': 'application/json' },
        body:    JSON.stringify({ eventVisitorId: selectedEventVisitor.id })
      });
      if (!res.ok) throw new Error('Check-in failed');
      const data = await res.json();
      document.getElementById('step3Title').textContent    = 'You\'re checked in!';
      document.getElementById('successMessage').textContent =
        `Welcome, ${selectedEventVisitor.firstName}! Enjoy the event.`;
      captureAndUploadPhoto(data.visitorRecordId);
    }

    showScreen('step3');
    startCountdown();
  } catch {
    btn.disabled = false;
    alert('Something went wrong. Please try again.');
  }
}

function fmtEventStay(h, m) {
  h = h || 0; m = m || 0;
  if (h === 0 && m === 0) return 'a short time';
  if (h === 0) return `${m} minute${m !== 1 ? 's' : ''}`;
  if (m === 0) return `${h} hour${h !== 1 ? 's' : ''}`;
  return `${h}h ${m}m`;
}

function confirmHost() {
  const select = document.getElementById('employeeSelect');
  const name   = select.value;
  if (!name) return;
  selectedHost = name;
  document.getElementById('hostDisplay').textContent = name;
  showScreen('step2');
  document.getElementById('firstName').focus();
  resetInactivityTimer();
}

// ============================================================
// Step 2 — Visitor Details & Autofill
// ============================================================
let autofillTimer = null;

function onNameInput() {
  clearTimeout(autofillTimer);
  autofillTimer = setTimeout(tryAutofill, 550);
}

async function tryAutofill() {
  const first = document.getElementById('firstName').value.trim();
  const last  = document.getElementById('lastName').value.trim();
  if (!first || !last) return;

  try {
    const res  = await fetch(`/api/visitor/returning?firstName=${encodeURIComponent(first)}&lastName=${encodeURIComponent(last)}`);
    const data = await res.json();

    if (data) {
      if (data.company) document.getElementById('company').value = data.company;
      document.getElementById('returningBadge').classList.remove('hidden');
    } else {
      document.getElementById('returningBadge').classList.add('hidden');
    }
  } catch {}
}

// ============================================================
// Step 2 — Submit
// ============================================================
async function submitForm() {
  const firstName   = document.getElementById('firstName').value.trim();
  const lastName    = document.getElementById('lastName').value.trim();
  const company     = document.getElementById('company').value.trim();
  const stayHours   = parseInt(document.getElementById('stayHours').value,   10) || 0;
  const stayMinutes = parseInt(document.getElementById('stayMinutes').value, 10) || 0;

  if (!firstName || !lastName) {
    document.getElementById('firstName').focus();
    return;
  }

  const btn = document.getElementById('checkinBtn');
  btn.disabled    = true;
  btn.textContent = 'Checking in…';

  try {
    const res = await fetch('/api/visitor/checkin', {
      method:  'POST',
      headers: { 'Content-Type': 'application/json' },
      body:    JSON.stringify({ firstName, lastName, company, host: selectedHost, stayHours, stayMinutes })
    });

    if (!res.ok) throw new Error('Check-in failed');
    const data = await res.json();

    document.getElementById('step3Title').textContent     = 'You\'re checked in!';
    document.getElementById('successMessage').textContent =
      `${selectedHost} has been notified of your arrival.`;

    showScreen('step3');
    startCountdown();
    captureAndUploadPhoto(data.visitorId);
  } catch {
    btn.disabled    = false;
    btn.textContent = 'Check In';
    alert('Check-in failed. Please try again or contact reception.');
  }
}

// ============================================================
// Camera — silent photo capture after check-in
// ============================================================
let cameraStream = null;

async function initCamera() {
  if (!navigator.mediaDevices?.getUserMedia) return;
  try {
    cameraStream = await navigator.mediaDevices.getUserMedia({
      video: { facingMode: 'user', width: { ideal: 640 }, height: { ideal: 480 } },
      audio: false
    });
    const video = document.getElementById('kioskCamera');
    video.srcObject = cameraStream;
    await video.play();
  } catch {
    cameraStream = null; // Camera unavailable — silently skip
  }
}

async function captureAndUploadPhoto(visitorId) {
  if (!cameraStream || !visitorId) return;
  try {
    const video  = document.getElementById('kioskCamera');
    const canvas = document.getElementById('kioskPhotoCanvas');
    canvas.width  = 320;
    canvas.height = 240;
    canvas.getContext('2d').drawImage(video, 0, 0, 320, 240);

    const blob = await new Promise(resolve => canvas.toBlob(resolve, 'image/jpeg', 0.80));
    if (!blob) return;

    const form = new FormData();
    form.append('visitorId', String(visitorId));
    form.append('photo', blob, 'photo.jpg');

    fetch('/api/visitor/photo', { method: 'POST', body: form }).catch(() => {});
  } catch {
    // Silent failure — photo capture is best-effort
  }
}

// ============================================================
// Step 3 — Countdown
// ============================================================
function startCountdown() {
  clearInactivityTimer();

  let count = 5;
  const countEl = document.getElementById('countdown');
  const fill    = document.getElementById('countdownFill');

  countEl.textContent = count;
  fill.style.transition = 'none';
  fill.style.width      = '100%';
  requestAnimationFrame(() => requestAnimationFrame(() => {
    fill.style.transition = `width ${count}s linear`;
    fill.style.width      = '0%';
  }));

  const interval = setInterval(() => {
    count--;
    countEl.textContent = count;
    if (count <= 0) {
      clearInterval(interval);
      goIdle();
    }
  }, 1000);
}
