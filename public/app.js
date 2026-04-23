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
  connectSSE();
  // initCamera() is called inside loadSettings() only when photoCapture === '1'
});

// ============================================================
// Server-Sent Events — remote commands from admin panel
// ============================================================
function connectSSE() {
  const es = new EventSource('/api/visitor/events');
  es.addEventListener('refresh', () => window.location.reload());
  es.onerror = () => {
    es.close();
    // Reconnect after 5 s if the connection drops
    setTimeout(connectSSE, 5000);
  };
}

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
  // Vanta 3D
  NET:           { color: '#ffffff', backgroundColor: '#000000', points: 8,   maxDistance: 25,  spacing: 20, speed: 1.5 },
  DOTS:          { color: '#ffffff', color2: '#444444', backgroundColor: '#000000', size: 3, spacing: 35, speed: 1.5 },
  WAVES:         { color: '#1a3a6b', backgroundColor: '#000000', waveHeight: 20, waveSpeed: 1, shininess: 30, zoom: 1 },
  BIRDS:         { color1: '#ff6600', color2: '#0066ff', backgroundColor: '#000000', quantity: 3, birdSize: 1.5, speedLimit: 5, separation: 20 },
  RINGS:         { color: '#ffffff', backgroundColor: '#000000', backgroundAlpha: 1, amplitudeFactor: 1, size: 1, speed: 1 },
  CELLS:         { color1: '#ffffff', color2: '#888888', color3: '#444444', backgroundColor: '#000000', size: 1.5, speed: 1.5 },
  FOG:           { highlightColor: '#ff6633', midtoneColor: '#222244', lowlightColor: '#000011', backgroundColor: '#000000', blurFactor: 0.6, speed: 1.5, zoom: 1 },
  GLOBE:         { color: '#ffffff', color2: '#444444', backgroundColor: '#000000', size: 1, speed: 1 },
  HALO:          { baseColor: '#0066ff', backgroundColor: '#000000', amplitudeFactor: 1, size: 1.5, xOffset: 0, yOffset: 0 },
  RIPPLE:        { color: '#0044ff', backgroundColor: '#000000', waveHeight: 30, waveSpeed: 1, zoom: 1 },
  CLOUDS:        { backgroundColor: '#111111', skyColor: '#68b8d7', cloudColor: '#adc4c8', cloudShadowColor: '#183550', sunColor: '#ff9919', speed: 1 },
  NONE:          { backgroundColor: '#000000' },
  // Gradients
  GRADIENT:      { color1: '#1a1a2e', color2: '#0f3460', color3: '#16213e', angle: 135 },
  GRADIENT_MOVE: { color1: '#1a1a2e', color2: '#0f3460', color3: '#e94560', speed: 8 },
  // Custom media
  IMAGE:         { imageUrl: '', fit: 'cover', backgroundColor: '#000000', overlayOpacity: 0 },
  VIDEO:         { videoUrl: '', backgroundColor: '#000000', opacity: 1 },
  // Seasonal
  SNOW:          { backgroundColor: '#000011', color: '#ffffff', count: 80, speed: 1.5, size: 5 },
  LEAVES:        { backgroundColor: '#1a0a00', count: 40, speed: 1, wind: 1 },
  RAIN:          { backgroundColor: '#050510', color: '#4488aa', count: 150, speed: 15, wind: 10 },
  SAKURA:        { backgroundColor: '#0d0010', count: 30, speed: 0.8, wind: 1.5 },
  FIREFLIES:     { backgroundColor: '#001005', color: '#aaff44', count: 40, speed: 0.8 },
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
    await initVanta(effect, allOpts[effect] || VANTA_DEFAULTS[effect] || {});
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
// Background — Vanta, Gradients, Canvas Particles, Media
// ============================================================

function hexToInt(hex) {
  return parseInt((hex || '#000000').replace('#', ''), 16);
}

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

// Holds cleanup function for non-Vanta effects
let _customBg = null;

// Create a full-screen canvas inside container; returns { canvas, ctx, cleanup }
function _makeCanvas(container) {
  const c = document.createElement('canvas');
  c.style.cssText = 'position:absolute;top:0;left:0;width:100%;height:100%;pointer-events:none;';
  c.width = innerWidth; c.height = innerHeight;
  container.appendChild(c);
  const onResize = () => { c.width = innerWidth; c.height = innerHeight; };
  window.addEventListener('resize', onResize);
  return {
    canvas: c,
    ctx: c.getContext('2d'),
    cleanup: () => { window.removeEventListener('resize', onResize); c.remove(); },
  };
}

// Simple rAF loop; returns a stop() function
function _raf(tick) {
  let id;
  (function run() { tick(); id = requestAnimationFrame(run); })();
  return () => cancelAnimationFrame(id);
}

async function initVanta(effect, opts) {
  const container = document.getElementById('bgContainer');

  // Tear down previous effect
  try { window._vantaEffect?.destroy(); } catch {}
  window._vantaEffect = null;
  if (_customBg) { _customBg(); _customBg = null; }
  container.innerHTML = '';
  for (const p of ['background','backgroundImage','backgroundSize','backgroundPosition',
                    'backgroundRepeat','animation','opacity']) {
    container.style[p] = '';
  }

  const key = (effect || 'NONE').toUpperCase();

  // ── None ────────────────────────────────────────────────────
  if (key === 'NONE') {
    container.style.background = opts.backgroundColor || '#000000';
    return;
  }

  // ── Static image ────────────────────────────────────────────
  if (key === 'IMAGE') {
    container.style.background = opts.backgroundColor || '#000000';
    if (opts.imageUrl) {
      container.style.backgroundImage  = `url('${opts.imageUrl}')`;
      container.style.backgroundSize   = opts.fit || 'cover';
      container.style.backgroundPosition = 'center center';
      container.style.backgroundRepeat  = 'no-repeat';
    }
    if (+opts.overlayOpacity > 0) {
      const ov = document.createElement('div');
      ov.style.cssText = `position:absolute;inset:0;background:rgba(0,0,0,${+opts.overlayOpacity/100});pointer-events:none;`;
      container.appendChild(ov);
    }
    return;
  }

  // ── Video loop ───────────────────────────────────────────────
  if (key === 'VIDEO') {
    container.style.background = opts.backgroundColor || '#000000';
    if (opts.videoUrl) {
      const vid = document.createElement('video');
      vid.src         = opts.videoUrl;
      vid.autoplay    = true;
      vid.loop        = true;
      vid.muted       = true;
      vid.playsInline = true;
      vid.style.cssText = `position:absolute;top:0;left:0;width:100%;height:100%;object-fit:cover;opacity:${opts.opacity ?? 1};`;
      container.appendChild(vid);
      vid.play().catch(() => {});
      _customBg = () => { vid.pause(); vid.src = ''; };
    }
    return;
  }

  // ── Static gradient ──────────────────────────────────────────
  if (key === 'GRADIENT') {
    const stops = [opts.color1 || '#1a1a2e', opts.color2 || '#0f3460'];
    if (opts.color3) stops.push(opts.color3);
    container.style.background = `linear-gradient(${opts.angle ?? 135}deg, ${stops.join(', ')})`;
    return;
  }

  // ── Animated gradient ────────────────────────────────────────
  if (key === 'GRADIENT_MOVE') {
    const c1 = opts.color1 || '#1a1a2e';
    const c2 = opts.color2 || '#0f3460';
    const c3 = opts.color3 || '#e94560';
    container.style.background     = `linear-gradient(-45deg, ${c1}, ${c2}, ${c3}, ${c1})`;
    container.style.backgroundSize = '400% 400%';
    container.style.animation      = `kiosk-gradient-move ${opts.speed ?? 8}s ease infinite`;
    return;
  }

  // ── Canvas / seasonal effects ────────────────────────────────
  const canvasEffects = { SNOW: _runSnow, LEAVES: _runLeaves, RAIN: _runRain,
                          SAKURA: _runSakura, FIREFLIES: _runFireflies };
  if (canvasEffects[key]) {
    container.style.background = opts.backgroundColor || '#000000';
    _customBg = canvasEffects[key](container, opts);
    return;
  }

  // ── Vanta 3D effects ─────────────────────────────────────────
  container.style.background = opts.backgroundColor || '#000000';
  try {
    if (!window.VANTA?.[key]) {
      await loadScript(`https://cdn.jsdelivr.net/npm/vanta@0.5.24/dist/vanta.${key.toLowerCase()}.min.js`);
    }
    window._vantaEffect = window.VANTA[key]({
      THREE,
      el:            container,
      mouseControls: false,
      touchControls: false,
      gyroControls:  false,
      minHeight:     window.innerHeight,
      minWidth:      window.innerWidth,
      ...processVantaOpts(opts),
    });
  } catch (err) {
    console.warn('Vanta init failed:', err.message);
  }
}

// ── Snow ─────────────────────────────────────────────────────
function _runSnow(container, opts) {
  const { canvas, ctx, cleanup } = _makeCanvas(container);
  const count   = +opts.count || 80;
  const speed   = +opts.speed || 1.5;
  const maxSize = +opts.size  || 5;
  const color   = opts.color  || '#ffffff';
  const flakes  = Array.from({ length: count }, () => ({
    x:         Math.random() * canvas.width,
    y:         Math.random() * canvas.height,
    r:         Math.random() * maxSize + 1,
    vy:        (Math.random() * 0.5 + 0.5) * speed,
    sway:      Math.random() * Math.PI * 2,
    swaySpeed: Math.random() * 0.02 + 0.005,
    alpha:     Math.random() * 0.5 + 0.5,
  }));
  const stop = _raf(() => {
    ctx.clearRect(0, 0, canvas.width, canvas.height);
    ctx.fillStyle = color;
    for (const f of flakes) {
      f.sway += f.swaySpeed;
      f.x    += Math.sin(f.sway) * 0.5;
      f.y    += f.vy;
      if (f.y > canvas.height + f.r) { f.y = -f.r; f.x = Math.random() * canvas.width; }
      if (f.x < -f.r) f.x = canvas.width + f.r;
      if (f.x > canvas.width + f.r) f.x = -f.r;
      ctx.globalAlpha = f.alpha;
      ctx.beginPath(); ctx.arc(f.x, f.y, f.r, 0, Math.PI * 2); ctx.fill();
    }
    ctx.globalAlpha = 1;
  });
  return () => { stop(); cleanup(); };
}

// ── Autumn leaves ────────────────────────────────────────────
function _runLeaves(container, opts) {
  const { canvas, ctx, cleanup } = _makeCanvas(container);
  const count  = +opts.count || 40;
  const speed  = +opts.speed || 1;
  const wind   = +opts.wind  || 1;
  const colors = ['#c0392b','#e67e22','#f39c12','#d4ac0d','#a04000','#8b4513'];
  function mkLeaf() {
    return {
      x: Math.random() * canvas.width, y: -20,
      r: Math.random() * 12 + 8,
      angle: Math.random() * Math.PI * 2,
      spin: (Math.random() - 0.5) * 0.05,
      vx: (Math.random() - 0.3) * wind * 1.5,
      vy: (Math.random() * 0.5 + 0.5) * speed * 1.2,
      sway: Math.random() * Math.PI * 2,
      swaySpeed: Math.random() * 0.015 + 0.005,
      color: colors[Math.floor(Math.random() * colors.length)],
      alpha: Math.random() * 0.4 + 0.6,
    };
  }
  const leaves = Array.from({ length: count }, () => { const l = mkLeaf(); l.y = Math.random() * canvas.height; return l; });
  const stop = _raf(() => {
    ctx.clearRect(0, 0, canvas.width, canvas.height);
    for (const l of leaves) {
      l.sway += l.swaySpeed; l.x += l.vx + Math.sin(l.sway) * wind * 0.8; l.y += l.vy; l.angle += l.spin;
      if (l.y > canvas.height + 20) Object.assign(l, mkLeaf());
      ctx.save(); ctx.translate(l.x, l.y); ctx.rotate(l.angle);
      ctx.globalAlpha = l.alpha; ctx.fillStyle = l.color;
      const s = l.r;
      ctx.beginPath();
      ctx.moveTo(0, -s);
      ctx.bezierCurveTo(s * 0.8, -s * 0.4, s * 0.8, s * 0.4, 0, s);
      ctx.bezierCurveTo(-s * 0.8, s * 0.4, -s * 0.8, -s * 0.4, 0, -s);
      ctx.fill(); ctx.restore();
    }
    ctx.globalAlpha = 1;
  });
  return () => { stop(); cleanup(); };
}

// ── Rain ─────────────────────────────────────────────────────
function _runRain(container, opts) {
  const { canvas, ctx, cleanup } = _makeCanvas(container);
  const count   = +opts.count || 150;
  const speed   = +opts.speed || 15;
  const windDeg = +opts.wind  || 10;
  const color   = opts.color  || '#4488aa';
  const windRad = windDeg * Math.PI / 180;
  const vx = Math.sin(windRad) * speed;
  const vy = Math.cos(windRad) * speed;
  const lenFactor = 0.07;
  const drops = Array.from({ length: count }, () => ({
    x: Math.random() * canvas.width,
    y: Math.random() * canvas.height,
    alpha: Math.random() * 0.4 + 0.15,
  }));
  const stop = _raf(() => {
    ctx.clearRect(0, 0, canvas.width, canvas.height);
    ctx.strokeStyle = color; ctx.lineWidth = 1;
    for (const d of drops) {
      ctx.globalAlpha = d.alpha;
      ctx.beginPath(); ctx.moveTo(d.x, d.y); ctx.lineTo(d.x - vx * lenFactor * speed, d.y - vy * lenFactor * speed); ctx.stroke();
      d.x += vx; d.y += vy;
      if (d.y > canvas.height + 10) { d.y = -10; d.x = Math.random() * (canvas.width + 100) - 50; }
      if (d.x > canvas.width + 10) d.x = -10;
      if (d.x < -10) d.x = canvas.width + 10;
    }
    ctx.globalAlpha = 1;
  });
  return () => { stop(); cleanup(); };
}

// ── Cherry blossoms ──────────────────────────────────────────
function _runSakura(container, opts) {
  const { canvas, ctx, cleanup } = _makeCanvas(container);
  const count = +opts.count || 30;
  const speed = +opts.speed || 0.8;
  const drift = +opts.wind  || 1.5;
  function mkPetal() {
    return {
      x: Math.random() * canvas.width, y: -10,
      r: Math.random() * 6 + 4,
      angle: Math.random() * Math.PI * 2,
      spin: (Math.random() - 0.5) * 0.03,
      vx: (Math.random() - 0.5) * drift * 2,
      vy: (Math.random() * 0.4 + 0.3) * speed,
      sway: Math.random() * Math.PI * 2,
      swaySpeed: Math.random() * 0.02 + 0.005,
      hue: 330 + Math.random() * 20,
      sat: 60 + Math.random() * 30,
      lit: 80 + Math.random() * 15,
      alpha: Math.random() * 0.5 + 0.5,
    };
  }
  const petals = Array.from({ length: count }, () => { const p = mkPetal(); p.y = Math.random() * canvas.height; return p; });
  const stop = _raf(() => {
    ctx.clearRect(0, 0, canvas.width, canvas.height);
    for (const p of petals) {
      p.sway += p.swaySpeed; p.x += p.vx + Math.sin(p.sway) * drift * 0.5; p.y += p.vy; p.angle += p.spin;
      if (p.y > canvas.height + 20) Object.assign(p, mkPetal());
      ctx.save(); ctx.translate(p.x, p.y); ctx.rotate(p.angle);
      ctx.globalAlpha = p.alpha;
      ctx.fillStyle = `hsl(${p.hue},${p.sat}%,${p.lit}%)`;
      ctx.beginPath(); ctx.ellipse(0, -p.r * 0.5, p.r * 0.5, p.r, 0, 0, Math.PI * 2); ctx.fill();
      ctx.restore();
    }
    ctx.globalAlpha = 1;
  });
  return () => { stop(); cleanup(); };
}

// ── Fireflies ────────────────────────────────────────────────
function _runFireflies(container, opts) {
  const { canvas, ctx, cleanup } = _makeCanvas(container);
  const count = +opts.count || 40;
  const speed = +opts.speed || 0.8;
  const color = opts.color  || '#aaff44';
  const cr = parseInt(color.slice(1, 3), 16);
  const cg = parseInt(color.slice(3, 5), 16);
  const cb = parseInt(color.slice(5, 7), 16);
  const flies = Array.from({ length: count }, () => ({
    x: Math.random() * canvas.width,
    y: Math.random() * canvas.height,
    vx: (Math.random() - 0.5) * speed,
    vy: (Math.random() - 0.5) * speed,
    phase: Math.random() * Math.PI * 2,
    pulseSpeed: Math.random() * 0.03 + 0.01,
    r: Math.random() * 2.5 + 1,
  }));
  const stop = _raf(() => {
    ctx.clearRect(0, 0, canvas.width, canvas.height);
    for (const f of flies) {
      f.phase += f.pulseSpeed;
      f.x += f.vx + (Math.random() - 0.5) * 0.3;
      f.y += f.vy + (Math.random() - 0.5) * 0.3;
      if (f.x < 0) f.x = canvas.width; if (f.x > canvas.width) f.x = 0;
      if (f.y < 0) f.y = canvas.height; if (f.y > canvas.height) f.y = 0;
      const pulse = (Math.sin(f.phase) + 1) / 2;
      const alpha = 0.3 + pulse * 0.7;
      const gr = f.r * (1 + pulse * 2);
      const grad = ctx.createRadialGradient(f.x, f.y, 0, f.x, f.y, gr * 4);
      grad.addColorStop(0, `rgba(${cr},${cg},${cb},${alpha})`);
      grad.addColorStop(1, `rgba(${cr},${cg},${cb},0)`);
      ctx.fillStyle = grad; ctx.beginPath(); ctx.arc(f.x, f.y, gr * 4, 0, Math.PI * 2); ctx.fill();
      ctx.fillStyle = `rgba(${cr},${cg},${cb},${alpha})`; ctx.beginPath(); ctx.arc(f.x, f.y, f.r, 0, Math.PI * 2); ctx.fill();
    }
  });
  return () => { stop(); cleanup(); };
}

// ============================================================
// Screen Navigation
// ============================================================
function showScreen(id) {
  document.querySelectorAll('.screen').forEach(s => s.classList.remove('active'));
  document.getElementById(id).classList.add('active');
}

function goIdle() {
  selectedHost    = '';
  expectedGuestId = null;
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
// Step 0 / Step 1 — Expected Guests → Letter Picker
// ============================================================
let allEmployees    = [];
let expectedGuestId = null;

async function startCheckin() {
  resetInactivityTimer();

  // Check if event mode is active
  try {
    const res  = await fetch('/api/visitor/event');
    const data = await res.json();
    if (data.eventMode) { loadEventScreen(data); return; }
  } catch {}

  // Go straight to letter picker
  await showLetterPickerScreen();
}

function showExpectedGuests(guests) {
  const container = document.getElementById('expectedGuestList');
  container.innerHTML = '';
  guests.forEach(g => {
    const btn = document.createElement('button');
    btn.className = 'btn-expected-guest';
    btn.innerHTML =
      `<span class="eg-name">${htmlEsc(g.firstName)} ${htmlEsc(g.lastName)}</span>` +
      (g.company ? `<span class="eg-detail">${htmlEsc(g.company)}</span>` : '') +
      `<span class="eg-detail">Here for ${htmlEsc(g.host)}</span>`;
    btn.addEventListener('click', () => selectExpectedGuest(g));
    container.appendChild(btn);
  });
  showScreen('step0');
  resetInactivityTimer();
}

function goToVisitorDetails() {
  document.getElementById('hostDisplay').textContent = selectedHost;
  document.getElementById('returningBadge').classList.add('hidden');
  showScreen('step2');
  document.getElementById('firstName').focus();
  resetInactivityTimer();
}

function selectExpectedGuest(g) {
  expectedGuestId = g.id;
  document.getElementById('firstName').value = g.firstName;
  document.getElementById('lastName').value  = g.lastName;
  document.getElementById('company').value   = g.company || '';
  goToVisitorDetails();
}

async function showLetterPickerScreen() {
  expectedGuestId = null;
  showScreen('step1');
  document.getElementById('letterPicker').innerHTML = '';
  document.getElementById('employeeList').innerHTML = '';

  try {
    const res    = await fetch('/api/visitor/employees');
    allEmployees = await res.json();
    if (!allEmployees.length) {
      document.getElementById('letterPicker').innerHTML =
        '<p style="color:rgba(255,255,255,0.4);text-align:center;">No employees configured.</p>';
      return;
    }
    buildLetterPicker();
  } catch {
    document.getElementById('letterPicker').innerHTML =
      '<p style="color:rgba(255,255,255,0.4);text-align:center;">Failed to load employees.</p>';
  }
}

function buildLetterPicker() {
  const letters   = [...new Set(allEmployees.map(e => e.name[0].toUpperCase()))].sort();
  const container = document.getElementById('letterPicker');
  container.innerHTML = '';
  letters.forEach(letter => {
    const btn = document.createElement('button');
    btn.className   = 'btn-letter';
    btn.textContent = letter;
    btn.addEventListener('click', () => selectLetter(letter, btn));
    container.appendChild(btn);
  });
}

function selectLetter(letter, activeBtn) {
  resetInactivityTimer();

  // Highlight active letter
  document.querySelectorAll('.btn-letter').forEach(b => b.classList.remove('active'));
  activeBtn.classList.add('active');

  // Show matching employees
  const filtered  = allEmployees.filter(e => e.name[0].toUpperCase() === letter);
  const container = document.getElementById('employeeList');
  container.innerHTML = '';
  filtered.forEach(emp => {
    const btn = document.createElement('button');
    btn.className   = 'btn-employee';
    btn.textContent = emp.name;
    btn.addEventListener('click', () => selectEmployee(emp.name));
    container.appendChild(btn);
  });
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

async function selectEmployee(name) {
  selectedHost = name;
  resetInactivityTimer();

  // Check for expected guests for this specific host
  try {
    const res    = await fetch(`/api/visitor/expected-guests?host=${encodeURIComponent(name)}`);
    const guests = await res.json();
    if (guests.length > 0) {
      showExpectedGuests(guests);
      return;
    }
  } catch {}

  // No expected guests — go straight to visitor details
  goToVisitorDetails();
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
      body:    JSON.stringify({ firstName, lastName, company, host: selectedHost, stayHours, stayMinutes, expectedGuestId })
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
    video.load(); // ensure browser starts decoding frames
    await video.play().catch(() => {}); // play() rejection is non-fatal
  } catch {
    cameraStream = null; // Camera unavailable or permission denied — silently skip
  }
}

async function captureAndUploadPhoto(visitorId) {
  if (!cameraStream || !visitorId) return;
  try {
    const video = document.getElementById('kioskCamera');

    // Wait up to 3 s for the video to have live frame data
    if (video.readyState < 2 || video.videoWidth === 0) {
      await new Promise(resolve => {
        const onReady = () => { video.removeEventListener('canplay', onReady); resolve(); };
        video.addEventListener('canplay', onReady);
        setTimeout(resolve, 3000); // give up after 3 s rather than hang
      });
    }

    if (video.videoWidth === 0) return; // still no frame — skip

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
