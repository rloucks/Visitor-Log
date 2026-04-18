// ============================================================
// Auth check on load
// ============================================================
let currentAdmin = null;

document.addEventListener('DOMContentLoaded', async () => {
  try {
    const res = await fetch('/api/admin/me');
    if (!res.ok) { window.location.href = '/login.html'; return; }
    currentAdmin = await res.json();
    document.getElementById('adminUsername').textContent = currentAdmin.username;
  } catch {
    window.location.href = '/login.html';
    return;
  }

  // Wire up sidebar nav
  document.querySelectorAll('.nav-item').forEach(btn => {
    btn.addEventListener('click', () => showSection(btn.dataset.section));
  });

  // Load section from hash or default
  const hash = location.hash.replace('#', '');
  showSection(hash || 'status');
});

async function doLogout() {
  await fetch('/api/admin/logout', { method: 'POST' });
  window.location.href = '/login.html';
}

// ============================================================
// Navigation
// ============================================================
const sectionLoaders = {
  status:       () => {},
  visitors:     loadVisitors,
  employees:    loadEmployees,
  admins:       loadAdmins,
  integrations: loadIntegrations,
  appearance:   loadAppearanceSettings,
  events:       loadEvents
};

function showSection(name) {
  if (!document.getElementById('sec-' + name)) return;

  document.querySelectorAll('.section').forEach(s => s.classList.remove('active'));
  document.querySelectorAll('.nav-item').forEach(n => n.classList.remove('active'));

  document.getElementById('sec-' + name).classList.add('active');
  document.querySelector(`.nav-item[data-section="${name}"]`)?.classList.add('active');

  location.hash = name;
  sectionLoaders[name]?.();
}

// ============================================================
// System Status
// ============================================================
async function checkConnectivity() {
  const ids = ['st-server', 'st-database', 'st-slack'];
  ids.forEach(id => {
    const el = document.getElementById(id);
    el.className = 'status-value status-unknown';
    el.textContent = '…';
  });

  try {
    const res  = await fetch('/api/admin/connectivity');
    const data = await res.json();
    const vals = [data.server, data.database, data.slack];

    ids.forEach((id, i) => {
      const el = document.getElementById(id);
      el.className = `status-value ${vals[i] ? 'status-ok' : 'status-fail'}`;
      el.textContent = vals[i] ? 'OK' : 'FAIL';
    });
  } catch {
    ids.forEach(id => {
      const el = document.getElementById(id);
      el.className = 'status-value status-fail';
      el.textContent = 'ERROR';
    });
  }
}

// ============================================================
// Visitor Log
// ============================================================
let visitorData = [];

async function loadVisitors() {
  const search = document.getElementById('visitorSearch').value.trim();
  const from   = document.getElementById('dateFrom').value;
  const to     = document.getElementById('dateTo').value;

  const p = new URLSearchParams();
  if (search) p.set('search', search);
  if (from)   p.set('from',   from);
  if (to)     p.set('to',     to);

  try {
    const res = await fetch(`/api/admin/visitors?${p}`);
    visitorData = await res.json();
    renderVisitors();
  } catch {
    showToast('Failed to load visitors.', 'error');
  }
}

function renderVisitors() {
  const tbody = document.querySelector('#visitorTable tbody');
  tbody.innerHTML = '';

  if (!visitorData.length) {
    tbody.innerHTML = '<tr><td colspan="6" style="text-align:center;color:rgba(255,255,255,0.3);padding:32px;">No visitors found.</td></tr>';
    return;
  }

  visitorData.forEach(v => {
    const stay = formatStay(v.stayHours, v.stayMinutes);
    const tr = document.createElement('tr');
    tr.innerHTML = `
      <td>${esc(v.firstName)} ${esc(v.lastName)}</td>
      <td>${esc(v.company || '—')}</td>
      <td>${esc(v.host)}</td>
      <td>${new Date(v.checkIn).toLocaleString()}</td>
      <td>${esc(stay)}</td>
      <td><button class="btn btn-danger btn-sm" onclick="deleteVisitor(${v.id})">Delete</button></td>
    `;
    tbody.appendChild(tr);
  });
}

async function clearVisitorLog() {
  const confirmed = confirm(
    'DELETE ALL VISITOR RECORDS?\n\n' +
    'This will permanently erase every entry in the log and cannot be undone.\n\n' +
    'Click OK only if you have already exported a backup.'
  );
  if (!confirmed) return;

  // Second confirmation — make them type to proceed
  const check = prompt('Type DELETE to confirm:');
  if (check?.trim().toUpperCase() !== 'DELETE') {
    showToast('Cancelled — nothing was deleted.', 'error');
    return;
  }

  const res = await fetch('/api/admin/visitors', { method: 'DELETE' });
  if (res.ok) {
    visitorData = [];
    renderVisitors();
    showToast('All visitor records deleted.');
  } else {
    showToast('Failed to clear log.', 'error');
  }
}

function exportAllCSV() {
  // Export uses current in-memory data if loaded, otherwise fetches all
  if (visitorData.length) {
    exportCSV();
    return;
  }
  // Fetch without filters then export
  fetch('/api/admin/visitors')
    .then(r => r.json())
    .then(data => {
      if (!data.length) { showToast('No records to export.', 'error'); return; }
      const headers = ['First Name', 'Last Name', 'Company', 'Host', 'Check-In Time', 'Expected Stay'];
      const rows = data.map(v => [
        v.firstName, v.lastName, v.company || '', v.host,
        new Date(v.checkIn).toLocaleString(),
        formatStay(v.stayHours, v.stayMinutes)
      ]);
      const csv = [headers, ...rows]
        .map(row => row.map(cell => `"${String(cell ?? '').replace(/"/g, '""')}"`).join(','))
        .join('\n');
      const blob = new Blob([csv], { type: 'text/csv;charset=utf-8;' });
      const url  = URL.createObjectURL(blob);
      const a    = document.createElement('a');
      a.href     = url;
      a.download = `visitors-full-${new Date().toISOString().slice(0, 10)}.csv`;
      a.click();
      URL.revokeObjectURL(url);
    })
    .catch(() => showToast('Failed to fetch records.', 'error'));
}

function clearVisitorFilters() {
  document.getElementById('visitorSearch').value = '';
  document.getElementById('dateFrom').value = '';
  document.getElementById('dateTo').value = '';
  loadVisitors();
}

async function deleteVisitor(id) {
  if (!confirm('Delete this visitor record?')) return;
  await fetch(`/api/admin/visitors/${id}`, { method: 'DELETE' });
  visitorData = visitorData.filter(v => v.id !== id);
  renderVisitors();
}

function exportCSV() {
  if (!visitorData.length) { showToast('No data to export.', 'error'); return; }

  const headers = ['First Name', 'Last Name', 'Company', 'Host', 'Check-In Time', 'Expected Stay'];
  const rows = visitorData.map(v => [
    v.firstName, v.lastName, v.company || '', v.host,
    new Date(v.checkIn).toLocaleString(),
    formatStay(v.stayHours, v.stayMinutes)
  ]);

  const csv = [headers, ...rows]
    .map(row => row.map(cell => `"${String(cell ?? '').replace(/"/g, '""')}"`).join(','))
    .join('\n');

  const blob = new Blob([csv], { type: 'text/csv;charset=utf-8;' });
  const url  = URL.createObjectURL(blob);
  const a    = document.createElement('a');
  a.href     = url;
  a.download = `visitors-${new Date().toISOString().slice(0, 10)}.csv`;
  a.click();
  URL.revokeObjectURL(url);
}

// ============================================================
// Employees
// ============================================================
async function loadEmployees() {
  try {
    const res       = await fetch('/api/admin/employees');
    const employees = await res.json();
    const tbody     = document.querySelector('#employeeTable tbody');
    tbody.innerHTML = '';

    if (!employees.length) {
      tbody.innerHTML = '<tr><td colspan="4" style="text-align:center;color:rgba(255,255,255,0.3);padding:32px;">No employees yet. Add one above.</td></tr>';
      return;
    }

    employees.forEach(emp => {
      const tr = document.createElement('tr');
      tr.innerHTML = `
        <td>${esc(emp.name)}</td>
        <td>${esc(emp.email || '—')}</td>
        <td>${esc(emp.slackUserId || '—')}</td>
        <td><button class="btn btn-danger btn-sm" onclick="deleteEmployee(${emp.id})">Delete</button></td>
      `;
      tbody.appendChild(tr);
    });
  } catch {
    showToast('Failed to load employees.', 'error');
  }
}

async function addEmployee() {
  const name        = document.getElementById('empName').value.trim();
  const email       = document.getElementById('empEmail').value.trim();
  const slackUserId = document.getElementById('empSlack').value.trim();

  if (!name) { showToast('Name is required.', 'error'); return; }

  const res = await fetch('/api/admin/employees', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ name, email, slackUserId })
  });

  if (res.ok) {
    ['empName', 'empEmail', 'empSlack'].forEach(id => document.getElementById(id).value = '');
    loadEmployees();
    showToast('Employee added.');
  } else {
    const d = await res.json();
    showToast(d.error || 'Failed to add employee.', 'error');
  }
}

async function importCSV() {
  const file = document.getElementById('csvFile').files[0];
  const resultEl = document.getElementById('csvResult');

  if (!file) { showToast('Please select a CSV file.', 'error'); return; }

  const text = await file.text();
  const lines = text.trim().split(/\r?\n/);

  if (lines.length < 2) { showToast('CSV has no data rows.', 'error'); return; }

  // Parse header to find column positions (case-insensitive)
  const header = lines[0].split(',').map(h => h.trim().toLowerCase());
  const col = name => header.indexOf(name);
  const nameIdx  = col('name');
  const emailIdx = col('email');
  const slackIdx = col('slackuserid');

  if (nameIdx === -1) { showToast('CSV must have a "name" column.', 'error'); return; }

  let added = 0, skipped = 0;
  resultEl.textContent = 'Importing…';

  for (let i = 1; i < lines.length; i++) {
    const cols = lines[i].split(',').map(c => c.trim().replace(/^"|"$/g, ''));
    const name = cols[nameIdx];
    if (!name) { skipped++; continue; }

    const res = await fetch('/api/admin/employees', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        name,
        email:       emailIdx !== -1 ? cols[emailIdx] || '' : '',
        slackUserId: slackIdx !== -1 ? cols[slackIdx] || '' : ''
      })
    });

    if (res.ok) added++; else skipped++;
  }

  document.getElementById('csvFile').value = '';
  resultEl.textContent = `Done — ${added} added, ${skipped} skipped.`;
  loadEmployees();
  showToast(`Imported ${added} employee${added !== 1 ? 's' : ''}.`);
}

async function deleteEmployee(id) {
  if (!confirm('Remove this employee?')) return;
  const res = await fetch(`/api/admin/employees/${id}`, { method: 'DELETE' });
  if (res.ok) {
    loadEmployees();
    showToast('Employee removed.');
  }
}

// ============================================================
// Admin Users
// ============================================================
async function loadAdmins() {
  try {
    const res    = await fetch('/api/admin/admins');
    const admins = await res.json();
    const tbody  = document.querySelector('#adminTable tbody');
    tbody.innerHTML = '';

    admins.forEach(a => {
      const isSelf = a.id === currentAdmin?.id;
      const tr = document.createElement('tr');
      tr.innerHTML = `
        <td>
          ${esc(a.username)}
          ${isSelf ? '<span style="font-size:0.72rem;color:rgba(255,255,255,0.35);margin-left:6px;">(you)</span>' : ''}
        </td>
        <td>
          ${!isSelf ? `<button class="btn btn-danger btn-sm" onclick="deleteAdmin(${a.id})">Delete</button>` : ''}
        </td>
      `;
      tbody.appendChild(tr);
    });
  } catch {
    showToast('Failed to load admins.', 'error');
  }
}

async function addAdmin() {
  const username = document.getElementById('newAdminUser').value.trim();
  const password = document.getElementById('newAdminPass').value;

  if (!username || !password) { showToast('Username and password are required.', 'error'); return; }

  const res = await fetch('/api/admin/admins', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ username, password })
  });

  if (res.ok) {
    document.getElementById('newAdminUser').value = '';
    document.getElementById('newAdminPass').value = '';
    loadAdmins();
    showToast('Admin added.');
  } else {
    const d = await res.json();
    showToast(d.error || 'Failed to add admin.', 'error');
  }
}

async function deleteAdmin(id) {
  if (!confirm('Delete this admin user?')) return;
  const res = await fetch(`/api/admin/admins/${id}`, { method: 'DELETE' });
  if (res.ok) {
    loadAdmins();
    showToast('Admin deleted.');
  } else {
    const d = await res.json();
    showToast(d.error, 'error');
  }
}

// ============================================================
// Integrations
// ============================================================
async function loadIntegrations() {
  try {
    const res  = await fetch('/api/admin/integrations');
    const data = await res.json();
    document.getElementById('n8nWebhookUrl').value   = data.n8nWebhookUrl   || '';
    document.getElementById('slackWebhookUrl').value = data.slackWebhookUrl || '';
  } catch {
    showToast('Failed to load integration settings.', 'error');
  }
}

async function saveIntegrations() {
  const n8nWebhookUrl   = document.getElementById('n8nWebhookUrl').value.trim();
  const slackWebhookUrl = document.getElementById('slackWebhookUrl').value.trim();
  const msgEl = document.getElementById('integrationMsg');

  const res = await fetch('/api/admin/integrations', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ n8nWebhookUrl, slackWebhookUrl })
  });

  if (res.ok) {
    showToast('Integration settings saved.');
    msgEl.style.color = 'rgba(255,255,255,0.4)';
    msgEl.textContent = '';
  } else {
    showToast('Failed to save.', 'error');
  }
}

async function testSlack() {
  const msgEl = document.getElementById('integrationMsg');
  msgEl.style.color = 'rgba(255,255,255,0.4)';
  msgEl.textContent = 'Sending…';

  // Save first so the test uses latest values
  await saveIntegrations();

  const res = await fetch('/api/admin/integrations/test-slack', { method: 'POST' });
  if (res.ok) {
    msgEl.style.color = '#4caf82';
    msgEl.textContent = 'Test message sent successfully.';
  } else {
    const d = await res.json();
    msgEl.style.color = '#e05555';
    msgEl.textContent = d.error || 'Test failed.';
  }
}

// ============================================================
// Appearance — per-effect control schemas
// ============================================================
const EFFECT_CONTROLS = {
  NET: [
    { key: 'color',           label: 'Node & Line Color',    type: 'color', def: '#ffffff' },
    { key: 'backgroundColor', label: 'Background',           type: 'color', def: '#000000' },
    { key: 'points',          label: 'Node Count',           type: 'range', min: 2,    max: 20,  step: 1,    def: 8 },
    { key: 'maxDistance',     label: 'Connection Distance',  type: 'range', min: 10,   max: 40,  step: 1,    def: 25 },
    { key: 'spacing',         label: 'Spacing',              type: 'range', min: 5,    max: 30,  step: 1,    def: 20 },
    { key: 'speed',           label: 'Speed',                type: 'range', min: 0.5,  max: 4,   step: 0.5,  def: 1.5 },
  ],
  DOTS: [
    { key: 'color',           label: 'Dot Color',            type: 'color', def: '#ffffff' },
    { key: 'color2',          label: 'Glow Color',           type: 'color', def: '#444444' },
    { key: 'backgroundColor', label: 'Background',           type: 'color', def: '#000000' },
    { key: 'size',            label: 'Dot Size',             type: 'range', min: 1,    max: 8,   step: 0.5,  def: 3 },
    { key: 'spacing',         label: 'Spacing',              type: 'range', min: 20,   max: 60,  step: 5,    def: 35 },
    { key: 'speed',           label: 'Speed',                type: 'range', min: 0.5,  max: 4,   step: 0.5,  def: 1.5 },
  ],
  WAVES: [
    { key: 'color',           label: 'Wave Color',           type: 'color', def: '#1a3a6b' },
    { key: 'backgroundColor', label: 'Background',           type: 'color', def: '#000000' },
    { key: 'waveHeight',      label: 'Wave Height',          type: 'range', min: 5,    max: 40,  step: 1,    def: 20 },
    { key: 'waveSpeed',       label: 'Wave Speed',           type: 'range', min: 0.25, max: 2,   step: 0.25, def: 1 },
    { key: 'shininess',       label: 'Shininess (0 = flat)', type: 'range', min: 0,    max: 150, step: 5,    def: 30 },
    { key: 'zoom',            label: 'Zoom',                 type: 'range', min: 0.5,  max: 2,   step: 0.1,  def: 1 },
  ],
  BIRDS: [
    { key: 'color1',          label: 'Bird Color 1',         type: 'color', def: '#ff6600' },
    { key: 'color2',          label: 'Bird Color 2',         type: 'color', def: '#0066ff' },
    { key: 'backgroundColor', label: 'Background',           type: 'color', def: '#000000' },
    { key: 'quantity',        label: 'Flock Size',           type: 'range', min: 1,    max: 5,   step: 1,    def: 3 },
    { key: 'birdSize',        label: 'Bird Size',            type: 'range', min: 0.5,  max: 3,   step: 0.25, def: 1.5 },
    { key: 'speedLimit',      label: 'Speed',                type: 'range', min: 1,    max: 10,  step: 0.5,  def: 5 },
    { key: 'separation',      label: 'Separation',           type: 'range', min: 5,    max: 100, step: 5,    def: 20 },
  ],
  RINGS: [
    { key: 'color',           label: 'Ring Color',           type: 'color', def: '#ffffff' },
    { key: 'backgroundColor', label: 'Background',           type: 'color', def: '#000000' },
    { key: 'backgroundAlpha', label: 'Background Opacity',   type: 'range', min: 0,    max: 1,   step: 0.05, def: 1 },
    { key: 'amplitudeFactor', label: 'Amplitude',            type: 'range', min: 0.1,  max: 3,   step: 0.1,  def: 1 },
    { key: 'size',            label: 'Ring Size',            type: 'range', min: 0.5,  max: 3,   step: 0.1,  def: 1 },
    { key: 'speed',           label: 'Speed',                type: 'range', min: 0.5,  max: 4,   step: 0.5,  def: 1 },
  ],
  CELLS: [
    { key: 'color1',          label: 'Cell Color 1',         type: 'color', def: '#ffffff' },
    { key: 'color2',          label: 'Cell Color 2',         type: 'color', def: '#888888' },
    { key: 'color3',          label: 'Cell Color 3',         type: 'color', def: '#444444' },
    { key: 'backgroundColor', label: 'Background',           type: 'color', def: '#000000' },
    { key: 'size',            label: 'Cell Size',            type: 'range', min: 0.5,  max: 5,   step: 0.25, def: 1.5 },
    { key: 'speed',           label: 'Speed',                type: 'range', min: 0.5,  max: 4,   step: 0.5,  def: 1.5 },
  ],
  FOG: [
    { key: 'highlightColor',  label: 'Highlight',            type: 'color', def: '#ff6633' },
    { key: 'midtoneColor',    label: 'Midtone',              type: 'color', def: '#222244' },
    { key: 'lowlightColor',   label: 'Shadow',               type: 'color', def: '#000011' },
    { key: 'backgroundColor', label: 'Background',           type: 'color', def: '#000000' },
    { key: 'blurFactor',      label: 'Blur',                 type: 'range', min: 0.1,  max: 1,   step: 0.05, def: 0.6 },
    { key: 'speed',           label: 'Speed',                type: 'range', min: 0.5,  max: 4,   step: 0.5,  def: 1.5 },
    { key: 'zoom',            label: 'Zoom',                 type: 'range', min: 0.5,  max: 2,   step: 0.1,  def: 1 },
  ],
  GLOBE: [
    { key: 'color',           label: 'Globe Color',          type: 'color', def: '#ffffff' },
    { key: 'color2',          label: 'Atmosphere Color',     type: 'color', def: '#444444' },
    { key: 'backgroundColor', label: 'Background',           type: 'color', def: '#000000' },
    { key: 'size',            label: 'Globe Size',           type: 'range', min: 0.25, max: 2,   step: 0.25, def: 1 },
    { key: 'speed',           label: 'Speed',                type: 'range', min: 0.5,  max: 4,   step: 0.5,  def: 1 },
  ],
  HALO: [
    { key: 'baseColor',       label: 'Halo Color',           type: 'color', def: '#0066ff' },
    { key: 'backgroundColor', label: 'Background',           type: 'color', def: '#000000' },
    { key: 'amplitudeFactor', label: 'Pulse Amplitude',      type: 'range', min: 0.5,  max: 3,   step: 0.1,  def: 1 },
    { key: 'size',            label: 'Halo Size',            type: 'range', min: 0.5,  max: 3,   step: 0.1,  def: 1.5 },
    { key: 'xOffset',         label: 'Horizontal Position',  type: 'range', min: -0.5, max: 0.5, step: 0.05, def: 0 },
    { key: 'yOffset',         label: 'Vertical Position',    type: 'range', min: -0.5, max: 0.5, step: 0.05, def: 0 },
  ],
  RIPPLE: [
    { key: 'color',           label: 'Ripple Color',         type: 'color', def: '#0044ff' },
    { key: 'backgroundColor', label: 'Background',           type: 'color', def: '#000000' },
    { key: 'waveHeight',      label: 'Wave Height',          type: 'range', min: 5,    max: 60,  step: 1,    def: 30 },
    { key: 'waveSpeed',       label: 'Wave Speed',           type: 'range', min: 0.25, max: 2,   step: 0.25, def: 1 },
    { key: 'zoom',            label: 'Zoom',                 type: 'range', min: 0.5,  max: 2,   step: 0.1,  def: 1 },
  ],
  CLOUDS: [
    { key: 'backgroundColor',  label: 'Ground Color',        type: 'color', def: '#111111' },
    { key: 'skyColor',         label: 'Sky Color',           type: 'color', def: '#68b8d7' },
    { key: 'cloudColor',       label: 'Cloud Color',         type: 'color', def: '#adc4c8' },
    { key: 'cloudShadowColor', label: 'Cloud Shadow',        type: 'color', def: '#183550' },
    { key: 'sunColor',         label: 'Sun Color',           type: 'color', def: '#ff9919' },
    { key: 'speed',            label: 'Speed',               type: 'range', min: 0.5,  max: 4,   step: 0.5,  def: 1 },
  ],
  NONE: [
    { key: 'backgroundColor', label: 'Background Color',     type: 'color', def: '#000000' },
  ],
};

// Holds per-effect settings loaded from server; updated on save
let vantaOptions = {};

function onEffectChange() {
  const effect = document.getElementById('settingVantaEffect').value;
  renderEffectControls(effect);
}

function renderEffectControls(effect) {
  const container = document.getElementById('vantaEffectControls');
  const controls  = EFFECT_CONTROLS[effect];
  if (!controls?.length) { container.innerHTML = ''; return; }

  const saved = vantaOptions[effect] || {};

  container.innerHTML = controls.map(c => {
    const val = saved[c.key] !== undefined ? saved[c.key] : c.def;
    const id  = `vopt_${c.key}`;

    if (c.type === 'color') {
      return `
        <div class="setting-row">
          <label class="setting-label" for="${id}">${esc(c.label)}</label>
          <input type="color" class="admin-input" id="${id}" value="${val}"
            style="max-width:60px;height:36px;padding:2px;cursor:pointer;" />
        </div>`;
    }
    return `
      <div class="setting-row">
        <label class="setting-label" for="${id}">${esc(c.label)}: <span id="${id}_lbl">${val}</span></label>
        <input type="range" class="admin-input" id="${id}"
          min="${c.min}" max="${c.max}" step="${c.step}" value="${val}"
          style="max-width:240px;padding:6px 0;cursor:pointer;"
          oninput="document.getElementById('${id}_lbl').textContent=this.value" />
      </div>`;
  }).join('');
}

function collectEffectValues(effect) {
  const controls = EFFECT_CONTROLS[effect];
  if (!controls) return {};
  const opts = {};
  for (const c of controls) {
    const el = document.getElementById(`vopt_${c.key}`);
    if (!el) continue;
    opts[c.key] = c.type === 'range' ? parseFloat(el.value) : el.value;
  }
  return opts;
}

// ============================================================
// Appearance — UI Colors & Font live preview
// ============================================================
function liveColor(cssVar, value) {
  document.documentElement.style.setProperty(cssVar, value);
}

function hexToRgba(hex, opacity) {
  const h = (hex || '#111111').replace('#', '');
  const r = parseInt(h.slice(0, 2), 16);
  const g = parseInt(h.slice(2, 4), 16);
  const b = parseInt(h.slice(4, 6), 16);
  return `rgba(${r}, ${g}, ${b}, ${opacity})`;
}

function applyLiveSurface() {
  const hex     = document.getElementById('uiSurfaceColor').value;
  const pct     = parseInt(document.getElementById('uiSurfaceOpacity').value, 10);
  const opacity = pct / 100;
  document.getElementById('surfaceOpacityLbl').textContent = `${pct}%`;
  document.documentElement.style.setProperty('--surface', hexToRgba(hex, opacity));
}

function loadGoogleFont(fontName) {
  if (!fontName || fontName === 'Roboto') return;
  const id = `gfont-${fontName.replace(/\s+/g, '-')}`;
  if (document.getElementById(id)) return;
  const link = document.createElement('link');
  link.id   = id;
  link.rel  = 'stylesheet';
  link.href = `https://fonts.googleapis.com/css2?family=${encodeURIComponent(fontName)}:wght@300;400;500&display=swap`;
  document.head.appendChild(link);
}

function liveSpecialMessage() {
  const enabled   = document.getElementById('specialMessageEnabled').checked;
  const text      = document.getElementById('specialMessage').value.trim();
  const color     = document.getElementById('specialMessageColor').value;
  const bold      = document.getElementById('specialMessageBoldCheck').checked;
  const size      = document.getElementById('specialMessageSize').value;
  const position  = document.getElementById('specialMessagePosition').value;
  const align     = document.querySelector('input[name="specialMessageAlign"]:checked')?.value || 'center';
  const bgColor   = document.getElementById('specialMessageBgColor').value;
  const bgOpacity = parseInt(document.getElementById('specialMessageBgOpacity').value, 10);

  document.getElementById('specialMessageSizeLbl').textContent    = parseFloat(size).toFixed(1);
  document.getElementById('specialMessageBgOpacityLbl').textContent = `${bgOpacity}%`;

  const bg = hexToRgba(bgColor, bgOpacity / 100);

  // Live-preview on the admin page itself
  let preview = document.getElementById('adminMsgPreview');
  if (!preview) {
    preview = document.createElement('div');
    preview.id = 'adminMsgPreview';
    preview.style.cssText = 'position:fixed;left:0;right:0;z-index:9999;padding:10px 32px;backdrop-filter:blur(16px);border-color:rgba(255,255,255,0.12);border-style:solid;pointer-events:none;';
    document.body.appendChild(preview);
  }

  if (enabled && text) {
    preview.textContent      = text;
    preview.style.color      = color;
    preview.style.fontSize   = `${size}rem`;
    preview.style.fontWeight = bold ? '700' : '400';
    preview.style.textAlign  = align;
    preview.style.background = bg;
    if (position === 'top') {
      preview.style.top = '0'; preview.style.bottom = '';
      preview.style.borderTopWidth = '0'; preview.style.borderBottomWidth = '1px';
    } else {
      preview.style.bottom = '0'; preview.style.top = '';
      preview.style.borderBottomWidth = '0'; preview.style.borderTopWidth = '1px';
    }
    preview.style.display = 'block';
  } else {
    preview.style.display = 'none';
  }
}

function liveFontWeight(which, value) {
  const cssVar = which === 'title' ? '--font-weight-title' : '--font-weight-body';
  document.getElementById(`fontWeight${which === 'title' ? 'Title' : 'Body'}Lbl`).textContent = value;
  document.documentElement.style.setProperty(cssVar, value);
}

function liveFont(fontName) {
  loadGoogleFont(fontName);
  document.documentElement.style.setProperty('--font-family', `'${fontName}', sans-serif`);
  const preview = document.getElementById('fontPreview');
  if (preview) {
    preview.style.fontFamily = `'${fontName}', sans-serif`;
    preview.textContent = `${fontName} — The quick brown fox jumps over the lazy dog.`;
  }
}

async function loadAppearanceSettings() {
  try {
    const res = await fetch('/api/admin/settings');
    const s   = await res.json();

    document.getElementById('settingCompanyName').value = s.companyName || '';

    // Special message
    document.getElementById('specialMessageEnabled').checked   = s.specialMessageEnabled === '1';
    document.getElementById('specialMessage').value            = s.specialMessage || '';
    document.getElementById('specialMessageColor').value       = s.specialMessageColor    || '#ffffff';
    document.getElementById('specialMessageBoldCheck').checked = s.specialMessageBold     === '1';
    const msgSize = s.specialMessageSize || '1';
    document.getElementById('specialMessageSize').value        = msgSize;
    document.getElementById('specialMessageSizeLbl').textContent = parseFloat(msgSize).toFixed(1);
    document.getElementById('specialMessagePosition').value    = s.specialMessagePosition || 'bottom';
    const msgAlign = s.specialMessageAlign || 'center';
    const alignEl  = document.querySelector(`input[name="specialMessageAlign"][value="${msgAlign}"]`);
    if (alignEl) alignEl.checked = true;
    document.getElementById('specialMessageBgColor').value     = s.specialMessageBgColor    || '#ffffff';
    const bgOp = s.specialMessageBgOpacity || '7';
    document.getElementById('specialMessageBgOpacity').value   = bgOp;
    document.getElementById('specialMessageBgOpacityLbl').textContent = `${bgOp}%`;
    liveSpecialMessage();

    // Clock visibility
    document.getElementById('clockEnabled').checked = s.clockEnabled !== '0';

    // Clock settings
    document.getElementById('clockTimezone').value = s.clockTimezone || 'America/New_York';
    const fmt = s.clockFormat || '12';
    const fmtEl = document.getElementById(`clockFormat${fmt}`);
    if (fmtEl) fmtEl.checked = true;
    document.getElementById('clockPosition').value = s.clockPosition || 'top-center';

    // UI colors
    if (s.uiAccentColor)  document.getElementById('uiAccentColor').value  = s.uiAccentColor;
    if (s.uiTextColor)    document.getElementById('uiTextColor').value    = s.uiTextColor;
    if (s.uiSurfaceColor) document.getElementById('uiSurfaceColor').value = s.uiSurfaceColor;
    if (s.uiBgColor)      document.getElementById('uiBgColor').value      = s.uiBgColor;

    const opacity = s.uiSurfaceOpacity !== undefined ? parseInt(s.uiSurfaceOpacity, 10) : 100;
    document.getElementById('uiSurfaceOpacity').value        = opacity;
    document.getElementById('surfaceOpacityLbl').textContent = `${opacity}%`;

    // Apply saved colors to admin page itself
    if (s.uiAccentColor)  liveColor('--accent',  s.uiAccentColor);
    if (s.uiTextColor)    liveColor('--text',    s.uiTextColor);
    if (s.uiBgColor)      liveColor('--bg',      s.uiBgColor);
    // Surface uses rgba to respect opacity
    const surfaceHex = s.uiSurfaceColor || '#111111';
    document.documentElement.style.setProperty('--surface', hexToRgba(surfaceHex, opacity / 100));

    // UI font
    const font = s.uiFont || 'Roboto';
    document.getElementById('uiFont').value = font;
    liveFont(font);

    // Font weights
    const fwTitle = s.fontWeightTitle || '300';
    const fwBody  = s.fontWeightBody  || '400';
    document.getElementById('fontWeightTitle').value    = fwTitle;
    document.getElementById('fontWeightTitleLbl').textContent = fwTitle;
    document.getElementById('fontWeightBody').value     = fwBody;
    document.getElementById('fontWeightBodyLbl').textContent  = fwBody;
    liveFontWeight('title', fwTitle);
    liveFontWeight('body',  fwBody);

    // Vanta settings
    const effect = s.vantaEffect || 'NET';
    document.getElementById('settingVantaEffect').value = effect;

    vantaOptions = s.vantaOptions ? JSON.parse(s.vantaOptions) : {};
    renderEffectControls(effect);

    const logoEl = document.getElementById('currentLogo');
    if (s.logoPath) {
      logoEl.innerHTML = `<img src="${s.logoPath}" alt="Current logo" style="max-height:80px;max-width:260px;border-radius:6px;border:1px solid rgba(255,255,255,0.1);">`;
    } else {
      logoEl.innerHTML = '<p style="font-size:0.85rem;color:rgba(255,255,255,0.3);">No logo uploaded.</p>';
    }
  } catch {
    showToast('Failed to load settings.', 'error');
  }
}

async function saveSettings() {
  const companyName    = document.getElementById('settingCompanyName').value.trim();
  const vantaEffect    = document.getElementById('settingVantaEffect').value;
  const clockTimezone  = document.getElementById('clockTimezone').value;
  const clockFormat    = document.querySelector('input[name="clockFormat"]:checked')?.value || '12';
  const clockPosition  = document.getElementById('clockPosition').value;
  const uiAccentColor    = document.getElementById('uiAccentColor').value;
  const uiTextColor      = document.getElementById('uiTextColor').value;
  const uiSurfaceColor   = document.getElementById('uiSurfaceColor').value;
  const uiBgColor        = document.getElementById('uiBgColor').value;
  const uiFont           = document.getElementById('uiFont').value;
  const uiSurfaceOpacity = document.getElementById('uiSurfaceOpacity').value;
  const fontWeightTitle      = document.getElementById('fontWeightTitle').value;
  const fontWeightBody       = document.getElementById('fontWeightBody').value;
  const specialMessageEnabled  = document.getElementById('specialMessageEnabled').checked ? '1' : '0';
  const specialMessage         = document.getElementById('specialMessage').value;
  const specialMessageColor    = document.getElementById('specialMessageColor').value;
  const specialMessageBold     = document.getElementById('specialMessageBoldCheck').checked ? '1' : '0';
  const specialMessageSize     = document.getElementById('specialMessageSize').value;
  const specialMessagePosition = document.getElementById('specialMessagePosition').value;
  const specialMessageAlign    = document.querySelector('input[name="specialMessageAlign"]:checked')?.value || 'center';
  const specialMessageBgColor  = document.getElementById('specialMessageBgColor').value;
  const specialMessageBgOpacity= document.getElementById('specialMessageBgOpacity').value;
  const clockEnabled           = document.getElementById('clockEnabled').checked ? '1' : '0';

  // Collect current effect controls into vantaOptions
  vantaOptions[vantaEffect] = collectEffectValues(vantaEffect);

  const res = await fetch('/api/admin/settings', {
    method:  'POST',
    headers: { 'Content-Type': 'application/json' },
    body:    JSON.stringify({
      companyName, vantaEffect, vantaOptions: JSON.stringify(vantaOptions),
      clockTimezone, clockFormat, clockPosition,
      uiAccentColor, uiTextColor, uiSurfaceColor, uiBgColor, uiFont, uiSurfaceOpacity,
      fontWeightTitle, fontWeightBody,
      specialMessageEnabled, specialMessage, specialMessageColor, specialMessageBold,
      specialMessageSize, specialMessagePosition, specialMessageAlign,
      specialMessageBgColor, specialMessageBgOpacity, clockEnabled
    })
  });

  if (res.ok) showToast('Settings saved.');
  else        showToast('Failed to save settings.', 'error');
}

async function uploadLogo() {
  const file = document.getElementById('logoFile').files[0];
  if (!file) { showToast('Please select a file first.', 'error'); return; }

  const form = new FormData();
  form.append('logo', file);

  const res = await fetch('/api/admin/logo', { method: 'POST', body: form });
  if (res.ok) {
    document.getElementById('logoFile').value = '';
    loadAppearanceSettings();
    showToast('Logo uploaded.');
  } else {
    const d = await res.json();
    showToast(d.error || 'Upload failed.', 'error');
  }
}

// ============================================================
// Utilities
// ============================================================
function formatStay(hours, minutes) {
  const h = parseInt(hours,   10) || 0;
  const m = parseInt(minutes, 10) || 0;
  if (h === 0 && m === 0) return '—';
  if (h === 0) return `${m}m`;
  if (m === 0) return `${h}h`;
  return `${h}h ${m}m`;
}

function esc(str) {
  return String(str ?? '')
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;');
}

// ============================================================
// Events
// ============================================================
async function loadEvents() {
  try {
    const res = await fetch('/api/admin/settings');
    const s   = await res.json();
    document.getElementById('eventModeEnabled').checked = s.eventMode === '1';
    document.getElementById('eventName').value          = s.eventName  || '';
    document.getElementById('eventStart').value         = s.eventStart || '';
    document.getElementById('eventEnd').value           = s.eventEnd   || '';
    updateScheduleStatus(s.eventStart, s.eventEnd, s.eventMode === '1');
  } catch {
    showToast('Failed to load event settings.', 'error');
  }
  loadEventVisitors();
}

function updateScheduleStatus(start, end, manualOn) {
  const el = document.getElementById('scheduleStatus');
  if (!el) return;

  if (manualOn) {
    el.style.color = 'var(--success)';
    el.textContent = '● Event mode is ON (manually enabled)';
    return;
  }
  if (!start || !end) {
    el.style.color = 'rgba(255,255,255,0.3)';
    el.textContent = 'No schedule set — use the toggle to enable manually.';
    return;
  }
  const now = new Date();
  const s   = new Date(start);
  const e   = new Date(end);
  if (now < s) {
    el.style.color = 'rgba(255,255,255,0.4)';
    el.textContent = `Scheduled — starts ${s.toLocaleString()}`;
  } else if (now > e) {
    el.style.color = 'rgba(255,255,255,0.3)';
    el.textContent = `Schedule ended ${e.toLocaleString()}`;
  } else {
    el.style.color = 'var(--success)';
    el.textContent = `● Event mode is ON (scheduled until ${e.toLocaleString()})`;
  }
}

async function saveEventSettings() {
  const eventMode  = document.getElementById('eventModeEnabled').checked ? '1' : '0';
  const eventName  = document.getElementById('eventName').value.trim();
  const eventStart = document.getElementById('eventStart').value;
  const eventEnd   = document.getElementById('eventEnd').value;

  const res = await fetch('/api/admin/settings', {
    method:  'POST',
    headers: { 'Content-Type': 'application/json' },
    body:    JSON.stringify({ eventMode, eventName, eventStart, eventEnd })
  });
  if (res.ok) {
    showToast('Event settings saved.');
    updateScheduleStatus(eventStart, eventEnd, eventMode === '1');
  } else {
    showToast('Failed to save.', 'error');
  }
}

async function clearEventSchedule() {
  document.getElementById('eventStart').value = '';
  document.getElementById('eventEnd').value   = '';
  await saveEventSettings();
}

async function loadEventVisitors() {
  try {
    const res      = await fetch('/api/admin/event-visitors');
    const visitors = await res.json();
    const tbody    = document.querySelector('#eventVisitorTable tbody');
    tbody.innerHTML = '';

    if (!visitors.length) {
      tbody.innerHTML = '<tr><td colspan="3" style="text-align:center;color:rgba(255,255,255,0.3);padding:32px;">No approved visitors yet. Add some above.</td></tr>';
      return;
    }

    visitors.forEach(v => {
      const tr = document.createElement('tr');
      tr.innerHTML = `
        <td>${esc(v.firstName)} ${esc(v.lastName)}</td>
        <td>${esc(v.company || '—')}</td>
        <td><button class="btn btn-danger btn-sm" onclick="deleteEventVisitor(${v.id})">Remove</button></td>
      `;
      tbody.appendChild(tr);
    });
  } catch {
    showToast('Failed to load event visitors.', 'error');
  }
}

async function addEventVisitor() {
  const firstName = document.getElementById('evFirstName').value.trim();
  const lastName  = document.getElementById('evLastName').value.trim();
  const company   = document.getElementById('evCompany').value.trim();

  if (!firstName || !lastName) { showToast('First and last name are required.', 'error'); return; }

  const res = await fetch('/api/admin/event-visitors', {
    method:  'POST',
    headers: { 'Content-Type': 'application/json' },
    body:    JSON.stringify({ firstName, lastName, company })
  });

  if (res.ok) {
    ['evFirstName', 'evLastName', 'evCompany'].forEach(id => document.getElementById(id).value = '');
    loadEventVisitors();
    showToast('Visitor added.');
  } else {
    const d = await res.json();
    showToast(d.error || 'Failed to add visitor.', 'error');
  }
}

async function deleteEventVisitor(id) {
  if (!confirm('Remove this visitor from the approved list?')) return;
  const res = await fetch(`/api/admin/event-visitors/${id}`, { method: 'DELETE' });
  if (res.ok) { loadEventVisitors(); showToast('Visitor removed.'); }
}

async function clearEventVisitors() {
  if (!confirm('Remove ALL approved visitors from the list? This cannot be undone.')) return;
  const res = await fetch('/api/admin/event-visitors', { method: 'DELETE' });
  if (res.ok) { loadEventVisitors(); showToast('Visitor list cleared.'); }
  else        showToast('Failed to clear list.', 'error');
}

async function importEventVisitorCSV() {
  const file     = document.getElementById('eventCsvFile').files[0];
  const resultEl = document.getElementById('eventCsvResult');
  if (!file) { showToast('Please select a CSV file.', 'error'); return; }

  const text  = await file.text();
  const lines = text.trim().split(/\r?\n/);
  if (lines.length < 2) { showToast('CSV has no data rows.', 'error'); return; }

  const header = lines[0].split(',').map(h => h.trim().toLowerCase().replace(/\s+/g, ''));
  const col    = (...names) => names.reduce((found, n) => found !== -1 ? found : header.indexOf(n), -1);
  const firstIdx   = col('firstname', 'first');
  const lastIdx    = col('lastname',  'last');
  const companyIdx = col('company');

  if (firstIdx === -1 || lastIdx === -1) {
    showToast('CSV must have "firstName" and "lastName" columns.', 'error'); return;
  }

  let added = 0, skipped = 0;
  resultEl.textContent = 'Importing…';

  for (let i = 1; i < lines.length; i++) {
    const cols      = lines[i].split(',').map(c => c.trim().replace(/^"|"$/g, ''));
    const firstName = cols[firstIdx];
    const lastName  = cols[lastIdx];
    if (!firstName || !lastName) { skipped++; continue; }

    const res = await fetch('/api/admin/event-visitors', {
      method:  'POST',
      headers: { 'Content-Type': 'application/json' },
      body:    JSON.stringify({ firstName, lastName, company: companyIdx !== -1 ? cols[companyIdx] || '' : '' })
    });
    if (res.ok) added++; else skipped++;
  }

  document.getElementById('eventCsvFile').value = '';
  resultEl.textContent = `Done — ${added} added, ${skipped} skipped.`;
  loadEventVisitors();
  showToast(`Imported ${added} visitor${added !== 1 ? 's' : ''}.`);
}

// ============================================================
// Utilities
// ============================================================
let toastTimer;
function showToast(msg, type = 'success') {
  let toast = document.getElementById('toast');
  if (!toast) {
    toast = document.createElement('div');
    toast.id = 'toast';
    document.body.appendChild(toast);
  }
  toast.textContent = msg;
  toast.className   = `toast toast-${type} show`;
  clearTimeout(toastTimer);
  toastTimer = setTimeout(() => toast.classList.remove('show'), 3000);
}
