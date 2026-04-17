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
  appearance:   loadAppearanceSettings
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
    tbody.innerHTML = '<tr><td colspan="5" style="text-align:center;color:rgba(255,255,255,0.3);padding:32px;">No visitors found.</td></tr>';
    return;
  }

  visitorData.forEach(v => {
    const tr = document.createElement('tr');
    tr.innerHTML = `
      <td>${esc(v.firstName)} ${esc(v.lastName)}</td>
      <td>${esc(v.company || '—')}</td>
      <td>${esc(v.host)}</td>
      <td>${new Date(v.checkIn).toLocaleString()}</td>
      <td><button class="btn btn-danger btn-sm" onclick="deleteVisitor(${v.id})">Delete</button></td>
    `;
    tbody.appendChild(tr);
  });
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

  const headers = ['First Name', 'Last Name', 'Company', 'Host', 'Check-In Time'];
  const rows = visitorData.map(v => [
    v.firstName, v.lastName, v.company || '', v.host,
    new Date(v.checkIn).toLocaleString()
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
// Appearance
// ============================================================
async function loadAppearanceSettings() {
  try {
    const res = await fetch('/api/admin/settings');
    const s   = await res.json();

    document.getElementById('settingCompanyName').value = s.companyName || '';
    document.getElementById('settingBg').value          = s.backgroundStyle || 'particles';

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
  const companyName     = document.getElementById('settingCompanyName').value.trim();
  const backgroundStyle = document.getElementById('settingBg').value;

  const res = await fetch('/api/admin/settings', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ companyName, backgroundStyle })
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
function esc(str) {
  return String(str ?? '')
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;');
}

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
