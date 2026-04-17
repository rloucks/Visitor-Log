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
  initCanvas();
  bindInactivity();
});

// ============================================================
// Settings
// ============================================================
async function loadSettings() {
  try {
    const res = await fetch('/api/admin/settings');
    const s = await res.json();

    if (s.companyName) {
      document.getElementById('companyName').textContent = s.companyName;
    }

    if (s.logoPath) {
      const img = document.createElement('img');
      img.src = s.logoPath;
      img.alt = 'Logo';
      img.className = 'logo-image';
      document.getElementById('logoContainer').appendChild(img);
    }

    window._bgStyle = s.backgroundStyle || 'particles';
  } catch {
    window._bgStyle = 'particles';
  }
}

// ============================================================
// Canvas Background
// ============================================================
function initCanvas() {
  const canvas = document.getElementById('bgCanvas');
  const ctx = canvas.getContext('2d');

  function resize() {
    canvas.width  = window.innerWidth;
    canvas.height = window.innerHeight;
  }
  window.addEventListener('resize', resize);
  resize();

  if (window._bgStyle === 'waves') {
    animateWaves(canvas, ctx);
  } else if (window._bgStyle === 'particles') {
    animateParticles(canvas, ctx);
  }
  // 'none' → leave canvas blank
}

function animateParticles(canvas, ctx) {
  const count = 55;
  const particles = Array.from({ length: count }, () => ({
    x:  Math.random() * canvas.width,
    y:  Math.random() * canvas.height,
    vx: (Math.random() - 0.5) * 0.45,
    vy: (Math.random() - 0.5) * 0.45,
    r:  Math.random() * 1.8 + 0.8
  }));

  function draw() {
    ctx.clearRect(0, 0, canvas.width, canvas.height);

    for (let i = 0; i < particles.length; i++) {
      for (let j = i + 1; j < particles.length; j++) {
        const dx = particles[i].x - particles[j].x;
        const dy = particles[i].y - particles[j].y;
        const dist = Math.hypot(dx, dy);
        if (dist < 140) {
          ctx.beginPath();
          ctx.strokeStyle = `rgba(255,255,255,${0.12 * (1 - dist / 140)})`;
          ctx.lineWidth = 0.6;
          ctx.moveTo(particles[i].x, particles[i].y);
          ctx.lineTo(particles[j].x, particles[j].y);
          ctx.stroke();
        }
      }
    }

    particles.forEach(p => {
      ctx.beginPath();
      ctx.arc(p.x, p.y, p.r, 0, Math.PI * 2);
      ctx.fillStyle = 'rgba(255,255,255,0.55)';
      ctx.fill();

      p.x += p.vx;
      p.y += p.vy;
      if (p.x < 0 || p.x > canvas.width)  p.vx *= -1;
      if (p.y < 0 || p.y > canvas.height) p.vy *= -1;
    });

    requestAnimationFrame(draw);
  }
  draw();
}

function animateWaves(canvas, ctx) {
  let t = 0;
  function draw() {
    ctx.clearRect(0, 0, canvas.width, canvas.height);
    for (let layer = 3; layer >= 1; layer--) {
      ctx.beginPath();
      ctx.moveTo(0, canvas.height);
      for (let x = 0; x <= canvas.width; x += 8) {
        const y = canvas.height * 0.65
          + Math.sin(x * 0.004 + t * layer * 0.4) * 55
          + Math.sin(x * 0.009 + t * 0.25) * 28;
        ctx.lineTo(x, y);
      }
      ctx.lineTo(canvas.width, canvas.height);
      ctx.closePath();
      ctx.fillStyle = `rgba(20,20,60,${0.14 * layer})`;
      ctx.fill();
    }
    t += 0.008;
    requestAnimationFrame(draw);
  }
  draw();
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
  document.getElementById('firstName').value    = '';
  document.getElementById('lastName').value     = '';
  document.getElementById('company').value      = '';
  document.getElementById('returningBadge').classList.add('hidden');
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

  const grid = document.getElementById('employeeGrid');
  grid.innerHTML = '<p class="no-employees">Loading...</p>';

  try {
    const res = await fetch('/api/visitor/employees');
    const employees = await res.json();

    grid.innerHTML = '';

    if (!employees.length) {
      grid.innerHTML = '<p class="no-employees">No employees configured. Please contact an administrator.</p>';
      return;
    }

    employees.forEach(emp => {
      const btn = document.createElement('button');
      btn.className = 'employee-card';
      btn.textContent = emp.name;
      btn.addEventListener('click', () => selectHost(emp.name));
      grid.appendChild(btn);
    });
  } catch {
    grid.innerHTML = '<p class="no-employees">Failed to load employee list.</p>';
  }
}

function selectHost(name) {
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
  const firstName = document.getElementById('firstName').value.trim();
  const lastName  = document.getElementById('lastName').value.trim();
  const company   = document.getElementById('company').value.trim();

  if (!firstName || !lastName) {
    document.getElementById('firstName').focus();
    return;
  }

  const btn = document.getElementById('checkinBtn');
  btn.disabled = true;
  btn.textContent = 'Checking in…';

  try {
    const res = await fetch('/api/visitor/checkin', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ firstName, lastName, company, host: selectedHost })
    });

    if (!res.ok) throw new Error('Check-in failed');

    document.getElementById('successMessage').textContent =
      `${selectedHost} has been notified of your arrival.`;

    showScreen('step3');
    startCountdown();
  } catch {
    btn.disabled = false;
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

  // Reset bar then animate
  fill.style.transition = 'none';
  fill.style.width = '100%';
  requestAnimationFrame(() => requestAnimationFrame(() => {
    fill.style.transition = `width ${count}s linear`;
    fill.style.width = '0%';
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
