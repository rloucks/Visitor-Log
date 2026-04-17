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

  const animMap = {
    particles: animateParticles,
    waves:     animateWaves,
    matrix:    animateMatrix,
    radar:     animateRadar,
    starfield: animateStarfield,
    circuit:   animateCircuit,
    hexgrid:   animateHexGrid
  };

  const fn = animMap[window._bgStyle];
  if (fn) fn(canvas, ctx);
}

// --- Particles ---
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

// --- Waves ---
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

// --- Matrix Rain ---
function animateMatrix(canvas, ctx) {
  const fontSize = 14;
  const cols = Math.floor(canvas.width / fontSize);
  const drops = Array(cols).fill(0).map(() => Math.random() * -canvas.height / fontSize);
  const chars = 'ABCDEFGHIJKLMNOPQRSTUVWXYZ0123456789@#$%&*<>/\\|+=';

  function draw() {
    ctx.fillStyle = 'rgba(0,0,0,0.06)';
    ctx.fillRect(0, 0, canvas.width, canvas.height);
    ctx.font = `${fontSize}px monospace`;

    drops.forEach((y, i) => {
      const char = chars[Math.floor(Math.random() * chars.length)];
      // Bright lead character
      ctx.fillStyle = '#aaffaa';
      ctx.fillText(char, i * fontSize, y * fontSize);
      // Dim trail
      ctx.fillStyle = `rgba(0,200,60,0.7)`;
      ctx.fillText(chars[Math.floor(Math.random() * chars.length)], i * fontSize, (y - 1) * fontSize);

      if (y * fontSize > canvas.height && Math.random() > 0.975) {
        drops[i] = 0;
      }
      drops[i] += 0.5;
    });

    setTimeout(() => requestAnimationFrame(draw), 40);
  }
  draw();
}

// --- Radar Sweep ---
function animateRadar(canvas, ctx) {
  let angle = 0;
  const blips = Array.from({ length: 7 }, () => ({
    a: Math.random() * Math.PI * 2,
    d: Math.random() * 0.75 + 0.15,
    age: Math.floor(Math.random() * 100)
  }));

  function draw() {
    ctx.clearRect(0, 0, canvas.width, canvas.height);
    const cx = canvas.width / 2;
    const cy = canvas.height / 2;
    const r  = Math.min(cx, cy) * 0.72;

    // Sweep trail
    for (let i = 24; i >= 0; i--) {
      const a = angle - i * 0.07;
      ctx.beginPath();
      ctx.moveTo(cx, cy);
      ctx.arc(cx, cy, r, a - 0.07, a);
      ctx.closePath();
      ctx.fillStyle = `rgba(0,255,70,${0.012 * (24 - i)})`;
      ctx.fill();
    }

    // Rings
    ctx.lineWidth = 1;
    ctx.strokeStyle = 'rgba(0,255,70,0.18)';
    for (let i = 1; i <= 4; i++) {
      ctx.beginPath();
      ctx.arc(cx, cy, r * i / 4, 0, Math.PI * 2);
      ctx.stroke();
    }

    // Crosshairs
    ctx.beginPath();
    ctx.moveTo(cx - r, cy); ctx.lineTo(cx + r, cy);
    ctx.moveTo(cx, cy - r); ctx.lineTo(cx, cy + r);
    ctx.stroke();

    // Outer ring
    ctx.beginPath();
    ctx.arc(cx, cy, r, 0, Math.PI * 2);
    ctx.strokeStyle = 'rgba(0,255,70,0.45)';
    ctx.lineWidth = 2;
    ctx.stroke();

    // Sweep line
    ctx.beginPath();
    ctx.moveTo(cx, cy);
    ctx.lineTo(cx + Math.cos(angle) * r, cy + Math.sin(angle) * r);
    ctx.strokeStyle = 'rgba(0,255,70,0.9)';
    ctx.lineWidth = 2;
    ctx.stroke();

    // Blips
    blips.forEach(b => {
      b.age++;
      const diff = ((b.a - angle) % (Math.PI * 2) + Math.PI * 2) % (Math.PI * 2);
      if (diff < 0.15) b.age = 0;
      if (b.age > 160) { b.a = Math.random() * Math.PI * 2; b.d = Math.random() * 0.75 + 0.15; b.age = 80; }

      const alpha = Math.max(0, 1 - b.age / 160);
      if (alpha > 0.05) {
        const bx = cx + Math.cos(b.a) * r * b.d;
        const by = cy + Math.sin(b.a) * r * b.d;
        ctx.beginPath();
        ctx.arc(bx, by, 3, 0, Math.PI * 2);
        ctx.fillStyle = `rgba(0,255,70,${alpha})`;
        ctx.fill();
        ctx.beginPath();
        ctx.arc(bx, by, 7, 0, Math.PI * 2);
        ctx.fillStyle = `rgba(0,255,70,${alpha * 0.25})`;
        ctx.fill();
      }
    });

    angle += 0.018;
    requestAnimationFrame(draw);
  }
  draw();
}

// --- Starfield (warp) ---
function animateStarfield(canvas, ctx) {
  const stars = Array.from({ length: 180 }, () => ({
    x: (Math.random() - 0.5) * canvas.width * 2,
    y: (Math.random() - 0.5) * canvas.height * 2,
    z: Math.random() * canvas.width
  }));

  function draw() {
    ctx.fillStyle = 'rgba(0,0,0,0.25)';
    ctx.fillRect(0, 0, canvas.width, canvas.height);

    const cx = canvas.width / 2;
    const cy = canvas.height / 2;

    stars.forEach(s => {
      s.z -= 4;
      if (s.z <= 0) {
        s.x = (Math.random() - 0.5) * canvas.width * 2;
        s.y = (Math.random() - 0.5) * canvas.height * 2;
        s.z = canvas.width;
      }

      const sx = (s.x / s.z) * canvas.width + cx;
      const sy = (s.y / s.z) * canvas.height + cy;
      const r   = Math.max(0.4, (1 - s.z / canvas.width) * 2.5);
      const alpha = 1 - s.z / canvas.width;

      ctx.beginPath();
      ctx.arc(sx, sy, r, 0, Math.PI * 2);
      ctx.fillStyle = `rgba(255,255,255,${alpha})`;
      ctx.fill();
    });

    requestAnimationFrame(draw);
  }
  draw();
}

// --- Circuit Board ---
function animateCircuit(canvas, ctx) {
  const nodeCount = 22;
  const nodes = Array.from({ length: nodeCount }, () => ({
    x: Math.random() * canvas.width,
    y: Math.random() * canvas.height,
    phase: Math.random() * Math.PI * 2
  }));

  const edges = [];
  nodes.forEach((a, i) => {
    nodes.slice(i + 1).forEach((b, j) => {
      if (Math.hypot(a.x - b.x, a.y - b.y) < 220) {
        edges.push({ a, b, progress: 0, speed: 0.003 + Math.random() * 0.004, active: Math.random() > 0.3 });
      }
    });
  });

  let t = 0;
  function draw() {
    ctx.clearRect(0, 0, canvas.width, canvas.height);

    edges.forEach(e => {
      if (e.active) e.progress = Math.min(1, e.progress + e.speed);
      const ex = e.a.x + (e.b.x - e.a.x) * e.progress;
      const ey = e.a.y + (e.b.y - e.a.y) * e.progress;

      ctx.beginPath();
      ctx.moveTo(e.a.x, e.a.y);
      ctx.lineTo(ex, ey);
      ctx.strokeStyle = `rgba(0,180,255,${0.25 * e.progress})`;
      ctx.lineWidth = 0.8;
      ctx.stroke();

      // Travelling pulse
      if (e.progress === 1) {
        const pulse = (Math.sin(t * 3 + e.a.x * 0.01) + 1) / 2;
        const px = e.a.x + (e.b.x - e.a.x) * pulse;
        const py = e.a.y + (e.b.y - e.a.y) * pulse;
        ctx.beginPath();
        ctx.arc(px, py, 2, 0, Math.PI * 2);
        ctx.fillStyle = 'rgba(0,220,255,0.8)';
        ctx.fill();
      }
    });

    nodes.forEach(n => {
      n.phase += 0.025;
      const alpha = 0.35 + 0.3 * Math.sin(n.phase);
      ctx.beginPath();
      ctx.arc(n.x, n.y, 3.5, 0, Math.PI * 2);
      ctx.fillStyle = `rgba(0,200,255,${alpha})`;
      ctx.fill();

      ctx.beginPath();
      ctx.arc(n.x, n.y, 7, 0, Math.PI * 2);
      ctx.fillStyle = `rgba(0,200,255,${alpha * 0.2})`;
      ctx.fill();
    });

    t += 0.012;
    requestAnimationFrame(draw);
  }
  draw();
}

// --- Hex Grid (Military HUD) ---
function animateHexGrid(canvas, ctx) {
  let t = 0;
  const size = 36;
  const colW = size * 1.5;
  const rowH = size * Math.sqrt(3);

  function hexPoint(cx, cy, i) {
    const a = (Math.PI / 3) * i - Math.PI / 6;
    return [cx + size * Math.cos(a), cy + size * Math.sin(a)];
  }

  function drawHex(cx, cy, alpha) {
    ctx.beginPath();
    for (let i = 0; i < 6; i++) {
      const [x, y] = hexPoint(cx, cy, i);
      i === 0 ? ctx.moveTo(x, y) : ctx.lineTo(x, y);
    }
    ctx.closePath();
    ctx.strokeStyle = `rgba(0,180,255,${alpha})`;
    ctx.lineWidth = 0.7;
    ctx.stroke();
  }

  function draw() {
    ctx.clearRect(0, 0, canvas.width, canvas.height);

    const cols = Math.ceil(canvas.width / colW) + 2;
    const rows = Math.ceil(canvas.height / rowH) + 2;

    for (let col = -1; col < cols; col++) {
      for (let row = -1; row < rows; row++) {
        const cx = col * colW;
        const cy = row * rowH + (col % 2 === 0 ? 0 : rowH / 2);
        const dist = Math.hypot(cx - canvas.width / 2, cy - canvas.height / 2);
        const wave = Math.sin(dist * 0.008 - t * 1.5) * 0.5 + 0.5;
        const alpha = 0.04 + wave * 0.14;
        drawHex(cx, cy, alpha);
      }
    }

    // Horizontal scan line
    const scanY = ((t * 40) % (canvas.height + 40)) - 20;
    const grad = ctx.createLinearGradient(0, scanY - 20, 0, scanY + 20);
    grad.addColorStop(0,   'rgba(0,180,255,0)');
    grad.addColorStop(0.5, 'rgba(0,180,255,0.06)');
    grad.addColorStop(1,   'rgba(0,180,255,0)');
    ctx.fillStyle = grad;
    ctx.fillRect(0, scanY - 20, canvas.width, 40);

    t += 0.012;
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

  const select = document.getElementById('employeeSelect');
  select.innerHTML = '<option value="">Loading…</option>';

  try {
    const res = await fetch('/api/visitor/employees');
    const employees = await res.json();

    select.innerHTML = '<option value="">— Select an employee —</option>';

    if (!employees.length) {
      select.innerHTML = '<option value="" disabled>No employees configured</option>';
      return;
    }

    employees.forEach(emp => {
      const opt = document.createElement('option');
      opt.value = emp.name;
      opt.textContent = emp.name;
      select.appendChild(opt);
    });
  } catch {
    select.innerHTML = '<option value="" disabled>Failed to load employees</option>';
  }
}

function confirmHost() {
  const select = document.getElementById('employeeSelect');
  const name = select.value;
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
