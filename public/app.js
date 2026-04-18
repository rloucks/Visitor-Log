// ============================================================
// State
// ============================================================
let selectedHost = '';
let inactivityTimer = null;
const INACTIVITY_MS = 120000; // 2 minutes

// ============================================================
// Init
// ============================================================
document.addEventListener('DOMContentLoaded', async () => {
  await loadSettings();
  bindInactivity();
  startClock();
});

// ============================================================
// Clock
// ============================================================
function startClock() {
  function tick() {
    const now  = new Date();
    const time = now.toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' });
    const date = now.toLocaleDateString([], { weekday: 'long', month: 'long', day: 'numeric' });
    document.getElementById('idleTime').textContent = time;
    document.getElementById('idleDate').textContent = date;
  }
  tick();
  setInterval(tick, 1000);
}

// ============================================================
// Settings & Vanta Init
// ============================================================
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

    await initVanta(
      s.vantaEffect  || 'NET',
      s.vantaColor1  || '#ffffff',
      s.vantaColor2  || '#444444',
      s.vantaBgColor || '#000000',
      s.vantaSpeed   || '1.5'
    );
  } catch {
    document.getElementById('bgContainer').style.background = '#000000';
  }
}

// ============================================================
// Vanta Background
// ============================================================

// Maps our generic settings to effect-specific Vanta params.
// Colors are passed as integers (0xRRGGBB) as Vanta expects.
const VANTA_PARAMS = {
  NET:      (c1, c2, bg, spd) => ({ color: c1, backgroundColor: bg, points: 8, maxDistance: 25, spacing: 20, speed: spd }),
  DOTS:     (c1, c2, bg, spd) => ({ color: c1, color2: c2, backgroundColor: bg, size: 3, spacing: 30, speed: spd }),
  WAVES:    (c1, c2, bg, spd) => ({ color: c1, backgroundColor: bg, waveSpeed: spd * 0.5, waveHeight: 20 }),
  BIRDS:    (c1, c2, bg, spd) => ({ color1: c1, color2: c2, backgroundColor: bg, speedLimit: Math.max(1, spd * 3), quantity: 3 }),
  RINGS:    (c1, c2, bg, spd) => ({ color: c1, backgroundColor: bg, backgroundAlpha: 1 }),
  CELLS:    (c1, c2, bg, spd) => ({ color1: c1, color2: c2, backgroundColor: bg, size: 1.5, speed: spd }),
  FOG:      (c1, c2, bg, spd) => ({ highlightColor: c1, midtoneColor: c2, lowlightColor: bg, backgroundColor: bg, speed: spd }),
  GLOBE:    (c1, c2, bg, spd) => ({ color: c1, color2: c2, backgroundColor: bg, size: 1 }),
  TOPOLOGY: (c1, c2, bg, spd) => ({ color: c1, backgroundColor: bg }),
};

function hexToInt(hex) {
  return parseInt((hex || '#000000').replace('#', ''), 16);
}

function loadScript(src) {
  return new Promise((resolve, reject) => {
    if (document.querySelector(`script[src="${src}"]`)) { resolve(); return; }
    const s = document.createElement('script');
    s.src    = src;
    s.onload  = resolve;
    s.onerror = () => reject(new Error(`Failed to load ${src}`));
    document.head.appendChild(s);
  });
}

async function initVanta(effect, color1, color2, bgColor, speed) {
  const container = document.getElementById('bgContainer');
  container.style.background = bgColor || '#000000';

  if (!effect || effect === 'NONE') return;

  const key = effect.toUpperCase();
  if (!VANTA_PARAMS[key]) return;

  try {
    // Three.js is pre-loaded in <head>; only load the Vanta effect script dynamically
    if (!window.VANTA?.[key]) {
      await loadScript(`https://cdn.jsdelivr.net/npm/vanta@0.5.24/dist/vanta.${key.toLowerCase()}.min.js`);
    }

    if (window._vantaEffect) {
      window._vantaEffect.destroy();
      window._vantaEffect = null;
    }

    const spd    = parseFloat(speed) || 1.5;
    const params = VANTA_PARAMS[key](hexToInt(color1), hexToInt(color2), hexToInt(bgColor), spd);

    window._vantaEffect = window.VANTA[key]({
      el:            container,
      mouseControls: false,
      touchControls: false,
      gyroControls:  false,
      minHeight:     window.innerHeight,
      minWidth:      window.innerWidth,
      ...params
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
