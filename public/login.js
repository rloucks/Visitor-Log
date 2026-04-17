document.addEventListener('DOMContentLoaded', async () => {
  // Redirect if already authenticated
  try {
    const res = await fetch('/api/admin/me');
    if (res.ok) {
      window.location.href = '/admin.html';
      return;
    }
  } catch {}
});

document.addEventListener('keydown', e => {
  if (e.key === 'Enter') doLogin();
});

async function doLogin() {
  const username = document.getElementById('username').value.trim();
  const password = document.getElementById('password').value;
  const errorEl  = document.getElementById('loginError');
  const btn      = document.getElementById('loginBtn');

  errorEl.textContent = '';

  if (!username || !password) {
    errorEl.textContent = 'Please enter your username and password.';
    return;
  }

  btn.disabled = true;
  btn.textContent = 'Signing in…';

  try {
    const res  = await fetch('/api/admin/login', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ username, password })
    });
    const data = await res.json();

    if (res.ok) {
      window.location.href = '/admin.html';
    } else {
      errorEl.textContent = data.error || 'Login failed.';
      btn.disabled = false;
      btn.textContent = 'Sign In';
      document.getElementById('password').value = '';
      document.getElementById('password').focus();
    }
  } catch {
    errorEl.textContent = 'Network error. Please try again.';
    btn.disabled = false;
    btn.textContent = 'Sign In';
  }
}
