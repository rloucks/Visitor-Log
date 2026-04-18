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
  await loadSettings(); // starts clock internally after syncing
  bindInactivity();
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

    if (s.logoPath) {
      const img = document.createElement('img');
      img.src       = s.logoPath;
      img.alt       = 'Logo';
      img.className = 'logo-image';
      document.getElementById('logoContainer').appendChild(img);
    }

    // UI theme
    applyTheme(s);

    // Clock settings
    clockSettings.timezone = s.clockTimezone || 'America/New_York';
    clockSettings.format   = s.clockFormat   || '12';
    clockSettings.position = s.clockPosition || 'top-center';
    applyClockPosition(clockSettings.position);

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
// Step 1 — Select Host
// ============================================================
async function startCheckin() {
  showScreen('step1');
  resetInactivityTimer();

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

    document.getElementById('successMessage').textContent =
      `${selectedHost} has been notified of your arrival.`;

    showScreen('step3');
    startCountdown();
  } catch {
    btn.disabled    = false;
    btn.textContent = 'Check In';
    alert('Check-in failed. Please try again or contact reception.');
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
