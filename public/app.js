// State
let userToken = sessionStorage.getItem('ovro_user_token') || null;
let userSubdomain = sessionStorage.getItem('ovro_user_subdomain') || null;
let adminToken = sessionStorage.getItem('ovro_admin_token') || null;
let currentSearchedSub = '';
let adminRecords = [];

// DOM Views
const viewPublic = document.getElementById('view-public');
const viewUser = document.getElementById('view-user');
const viewAdmin = document.getElementById('view-admin');

// Modals
const modalUserLogin = document.getElementById('modal-user-login');
const modalAdminLogin = document.getElementById('modal-admin-login');
const navLoginBtn = document.getElementById('nav-login-btn');
const navBrand = document.getElementById('nav-brand');
const closeUserModal = document.getElementById('close-user-modal');
const closeAdminModal = document.getElementById('close-admin-modal');

// Public Search & Claim
const searchForm = document.getElementById('search-form');
const searchInput = document.getElementById('search-input');
const searchBtn = document.getElementById('search-btn');
const availabilityResult = document.getElementById('availability-result');
const resultStatusHeader = document.getElementById('result-status-header');
const claimForm = document.getElementById('claim-form');
const claimPin = document.getElementById('claim-pin');
const claimSubmitBtn = document.getElementById('claim-submit-btn');
const claimFeedback = document.getElementById('claim-feedback');

// User Login Form
const userLoginForm = document.getElementById('user-login-form');
const loginSubdomain = document.getElementById('login-subdomain');
const loginPin = document.getElementById('login-pin');
const userLoginSubmitBtn = document.getElementById('user-login-submit-btn');
const userLoginFeedback = document.getElementById('user-login-feedback');

// User Dashboard
const userDomainTitle = document.getElementById('user-domain-title');
const userLogoutBtn = document.getElementById('user-logout-btn');
const userAddRecordForm = document.getElementById('user-add-record-form');
const uRecType = document.getElementById('u-rec-type');
const uRecPrefix = document.getElementById('u-rec-prefix');
const uRecContent = document.getElementById('u-rec-content');
const uRecProxy = document.getElementById('u-rec-proxy');
const uRecSubmitBtn = document.getElementById('u-rec-submit-btn');
const uRecFeedback = document.getElementById('u-rec-feedback');
const userRecordsTbody = document.getElementById('user-records-tbody');
const userRecordsCount = document.getElementById('user-records-count');
const userRefreshBtn = document.getElementById('user-refresh-btn');

// Admin Panel
const adminLoginForm = document.getElementById('admin-login-form');
const adminPassword = document.getElementById('admin-password');
const adminLoginSubmitBtn = document.getElementById('admin-login-submit-btn');
const adminLoginFeedback = document.getElementById('admin-login-feedback');
const adminLogoutBtn = document.getElementById('admin-logout-btn');
const adminRecordsTbody = document.getElementById('admin-records-tbody');
const adminRecordsCount = document.getElementById('admin-records-count');
const adminRefreshBtn = document.getElementById('admin-refresh-btn');
const adminSearch = document.getElementById('admin-search');

// Router / View Switcher
function switchView(viewName) {
  viewPublic.classList.add('is-hidden');
  viewUser.classList.add('is-hidden');
  viewAdmin.classList.add('is-hidden');

  if (viewName === 'user' && userToken && userSubdomain) {
    viewUser.classList.remove('is-hidden');
    userDomainTitle.textContent = `${userSubdomain}.ovro.me`;
    loadUserRecords();
  } else if (viewName === 'admin' && adminToken) {
    viewAdmin.classList.remove('is-hidden');
    loadAdminRecords();
  } else {
    viewPublic.classList.remove('is-hidden');
  }
}

// Check initial session & URL route
const isPathAdmin = window.location.pathname.startsWith('/admin') || window.location.hash === '#admin';

if (adminToken) {
  switchView('admin');
} else if (isPathAdmin) {
  modalAdminLogin.classList.remove('is-hidden');
  adminPassword.focus();
} else if (userToken && userSubdomain) {
  switchView('user');
} else {
  switchView('public');
}

// Navigation Events
navBrand.addEventListener('click', (e) => {
  e.preventDefault();
  if (userToken) {
    switchView('user');
  } else if (adminToken) {
    switchView('admin');
  } else {
    switchView('public');
  }
});

navLoginBtn.addEventListener('click', () => {
  modalUserLogin.classList.remove('is-hidden');
  loginSubdomain.focus();
});

closeUserModal.addEventListener('click', () => modalUserLogin.classList.add('is-hidden'));
closeAdminModal.addEventListener('click', () => modalAdminLogin.classList.add('is-hidden'));

[modalUserLogin, modalAdminLogin].forEach(modal => {
  modal.querySelector('.modal-backdrop').addEventListener('click', () => {
    modal.classList.add('is-hidden');
  });
});

window.addEventListener('keydown', (e) => {
  if (e.key === 'Escape') {
    modalUserLogin.classList.add('is-hidden');
    modalAdminLogin.classList.add('is-hidden');
  }
});

// 1. Search Availability Handler
searchForm.addEventListener('submit', async (e) => {
  e.preventDefault();
  const sub = searchInput.value.trim().toLowerCase();
  if (!sub) return;

  currentSearchedSub = sub;
  setLoading(searchBtn, true);
  availabilityResult.classList.add('is-hidden');
  claimForm.classList.add('is-hidden');
  hideFeedback(claimFeedback);

  try {
    const res = await fetch(`/api/check/${encodeURIComponent(sub)}`);
    const data = await res.json();

    availabilityResult.classList.remove('is-hidden');

    if (data.available) {
      resultStatusHeader.className = 'result-status is-available';
      resultStatusHeader.innerHTML = `✓ <strong>${escapeHtml(data.fullDomain)}</strong> is available!`;
      claimForm.classList.remove('is-hidden');
      claimPin.value = '';
      claimPin.focus();
    } else {
      if (data.reason?.includes('reserved')) {
        resultStatusHeader.className = 'result-status is-reserved';
        resultStatusHeader.innerHTML = `⚠️ <strong>${escapeHtml(sub)}.ovro.me</strong> is reserved for core infrastructure.`;
      } else {
        resultStatusHeader.className = 'result-status is-taken';
        resultStatusHeader.innerHTML = `✕ <strong>${escapeHtml(sub)}.ovro.me</strong> is already registered. <a href="#" id="claim-login-trigger" style="color: var(--color-brand); text-decoration: underline; margin-left: 8px;">Manage it</a>`;
        
        document.getElementById('claim-login-trigger')?.addEventListener('click', (ev) => {
          ev.preventDefault();
          modalUserLogin.classList.remove('is-hidden');
          loginSubdomain.value = sub;
          loginPin.focus();
        });
      }
    }
  } catch (err) {
    availabilityResult.classList.remove('is-hidden');
    resultStatusHeader.className = 'result-status is-taken';
    resultStatusHeader.textContent = `Error: ${err.message}`;
  } finally {
    setLoading(searchBtn, false);
  }
});

// 2. Claim Subdomain Handler
claimForm.addEventListener('submit', async (e) => {
  e.preventDefault();
  const pin = claimPin.value;
  if (!currentSearchedSub || !pin) return;

  setLoading(claimSubmitBtn, true);
  hideFeedback(claimFeedback);

  try {
    const res = await fetch('/api/claim', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ subdomain: currentSearchedSub, pin }),
    });
    const data = await res.json();

    if (!res.ok) {
      throw new Error(data.error || 'Failed to claim');
    }

    userToken = data.token;
    userSubdomain = data.subdomain;
    sessionStorage.setItem('ovro_user_token', userToken);
    sessionStorage.setItem('ovro_user_subdomain', userSubdomain);

    showFeedback(claimFeedback, `Claimed successfully! Redirecting...`, 'success');
    setTimeout(() => {
      switchView('user');
    }, 800);
  } catch (err) {
    showFeedback(claimFeedback, err.message, 'error');
  } finally {
    setLoading(claimSubmitBtn, false);
  }
});

// 3. User Login Handler
userLoginForm.addEventListener('submit', async (e) => {
  e.preventDefault();
  const sub = loginSubdomain.value.trim().toLowerCase();
  const pin = loginPin.value;

  if (!sub || !pin) return;

  setLoading(userLoginSubmitBtn, true);
  hideFeedback(userLoginFeedback);

  try {
    const res = await fetch('/api/login-subdomain', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ subdomain: sub, pin }),
    });
    const data = await res.json();

    if (!res.ok) {
      throw new Error(data.error || 'Authentication failed');
    }

    userToken = data.token;
    userSubdomain = data.subdomain;
    sessionStorage.setItem('ovro_user_token', userToken);
    sessionStorage.setItem('ovro_user_subdomain', userSubdomain);

    modalUserLogin.classList.add('is-hidden');
    switchView('user');
  } catch (err) {
    showFeedback(userLoginFeedback, err.message, 'error');
  } finally {
    setLoading(userLoginSubmitBtn, false);
  }
});

// User Logout
userLogoutBtn.addEventListener('click', () => {
  userToken = null;
  userSubdomain = null;
  sessionStorage.removeItem('ovro_user_token');
  sessionStorage.removeItem('ovro_user_subdomain');
  switchView('public');
});

// 4. Load User Records
async function loadUserRecords() {
  if (!userToken) return;
  userRecordsCount.textContent = 'Syncing records...';

  try {
    const res = await fetch('/api/user/records', {
      headers: { 'Authorization': `Bearer ${userToken}` }
    });
    const data = await res.json();

    if (!res.ok) {
      if (res.status === 401) {
        userLogoutBtn.click();
        return;
      }
      throw new Error(data.error || 'Failed to fetch records');
    }

    renderUserRecords(data.records || []);
  } catch (err) {
    userRecordsTbody.innerHTML = `<tr><td colspan="5" class="table-empty" style="color: var(--color-error);">Error: ${escapeHtml(err.message)}</td></tr>`;
    userRecordsCount.textContent = 'Sync failed';
  }
}

function renderUserRecords(records) {
  userRecordsCount.textContent = `${records.length} record${records.length === 1 ? '' : 's'} configured`;

  if (records.length === 0) {
    userRecordsTbody.innerHTML = `<tr><td colspan="5" class="table-empty">No DNS records yet. Add an A or CNAME record above.</td></tr>`;
    return;
  }

  userRecordsTbody.innerHTML = records.map(rec => {
    const proxyPill = rec.proxied
      ? '<span class="proxy-pill is-proxied">● Proxied</span>'
      : '<span class="proxy-pill is-dns-only">○ DNS only</span>';

    return `
      <tr>
        <td><span class="type-badge type-${escapeHtml(rec.type)}">${escapeHtml(rec.type)}</span></td>
        <td><span class="record-name">${escapeHtml(rec.name)}</span></td>
        <td><span class="record-content">${escapeHtml(rec.content)}</span></td>
        <td>${proxyPill}</td>
        <td style="text-align: right;">
          <button type="button" class="btn-danger-sm delete-user-record" data-id="${escapeHtml(rec.id)}">Delete</button>
        </td>
      </tr>
    `;
  }).join('');
}

// User Refresh
userRefreshBtn.addEventListener('click', loadUserRecords);

// User Delete Record
userRecordsTbody.addEventListener('click', async (e) => {
  const btn = e.target.closest('.delete-user-record');
  if (!btn) return;
  const id = btn.getAttribute('data-id');

  if (!confirm('Are you sure you want to delete this DNS record?')) return;
  btn.disabled = true;
  btn.textContent = '...';

  try {
    const res = await fetch(`/api/user/records/${id}`, {
      method: 'DELETE',
      headers: { 'Authorization': `Bearer ${userToken}` },
    });
    const data = await res.json();
    if (!res.ok) throw new Error(data.error || 'Delete failed');
    await loadUserRecords();
  } catch (err) {
    alert(`Delete error: ${err.message}`);
    btn.disabled = false;
    btn.textContent = 'Delete';
  }
});

// User Add Record
userAddRecordForm.addEventListener('submit', async (e) => {
  e.preventDefault();
  const type = uRecType.value;
  const prefix = uRecPrefix.value.trim();
  const content = uRecContent.value.trim();
  const proxied = uRecProxy.value === 'true';

  if (!content) return;

  setLoading(uRecSubmitBtn, true);
  hideFeedback(uRecFeedback);

  try {
    const res = await fetch('/api/user/records', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'Authorization': `Bearer ${userToken}`,
      },
      body: JSON.stringify({ type, prefix, content, proxied }),
    });
    const data = await res.json();

    if (!res.ok) {
      throw new Error(data.error || 'Failed to add record');
    }

    showFeedback(uRecFeedback, `Record created: ${data.record.name} (${data.record.type})`, 'success');
    uRecContent.value = '';
    await loadUserRecords();
  } catch (err) {
    showFeedback(uRecFeedback, err.message, 'error');
  } finally {
    setLoading(uRecSubmitBtn, false);
  }
});

// 5. Admin Login Handler
adminLoginForm.addEventListener('submit', async (e) => {
  e.preventDefault();
  const pwd = adminPassword.value;
  if (!pwd) return;

  setLoading(adminLoginSubmitBtn, true);
  hideFeedback(adminLoginFeedback);

  try {
    const res = await fetch('/api/admin/login', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ password: pwd }),
    });
    const data = await res.json();

    if (!res.ok) {
      throw new Error(data.error || 'Invalid password');
    }

    adminToken = data.token;
    sessionStorage.setItem('ovro_admin_token', adminToken);
    modalAdminLogin.classList.add('is-hidden');
    switchView('admin');
  } catch (err) {
    showFeedback(adminLoginFeedback, err.message, 'error');
  } finally {
    setLoading(adminLoginSubmitBtn, false);
  }
});

// Admin Logout
adminLogoutBtn.addEventListener('click', () => {
  adminToken = null;
  sessionStorage.removeItem('ovro_admin_token');
  switchView('public');
});

// 6. Admin Records
async function loadAdminRecords() {
  if (!adminToken) return;
  adminRecordsCount.textContent = 'Syncing full zone...';

  try {
    const res = await fetch('/api/admin/records', {
      headers: { 'Authorization': `Bearer ${adminToken}` },
    });
    const data = await res.json();

    if (!res.ok) {
      if (res.status === 403 || res.status === 401) {
        adminLogoutBtn.click();
        return;
      }
      throw new Error(data.error || 'Failed to fetch admin records');
    }

    adminRecords = data.records || [];
    renderAdminRecords(adminRecords);
  } catch (err) {
    adminRecordsTbody.innerHTML = `<tr><td colspan="5" class="table-empty" style="color: var(--color-error);">Error: ${escapeHtml(err.message)}</td></tr>`;
    adminRecordsCount.textContent = 'Sync error';
  }
}

function renderAdminRecords(records) {
  adminRecordsCount.textContent = `${records.length} total zone records`;

  if (records.length === 0) {
    adminRecordsTbody.innerHTML = `<tr><td colspan="5" class="table-empty">No records in zone.</td></tr>`;
    return;
  }

  adminRecordsTbody.innerHTML = records.map(rec => {
    const proxyPill = rec.proxied
      ? '<span class="proxy-pill is-proxied">● Proxied</span>'
      : '<span class="proxy-pill is-dns-only">○ DNS only</span>';

    return `
      <tr>
        <td><span class="type-badge type-${escapeHtml(rec.type)}">${escapeHtml(rec.type)}</span></td>
        <td><span class="record-name">${escapeHtml(rec.name)}</span></td>
        <td><span class="record-content">${escapeHtml(rec.content)}</span></td>
        <td>${proxyPill}</td>
        <td style="text-align: right;">
          <button type="button" class="btn-danger-sm delete-admin-record" data-id="${escapeHtml(rec.id)}">Delete</button>
        </td>
      </tr>
    `;
  }).join('');
}

// Admin Search
adminSearch.addEventListener('input', (e) => {
  const query = e.target.value.toLowerCase().trim();
  if (!query) {
    renderAdminRecords(adminRecords);
    return;
  }
  const filtered = adminRecords.filter(r =>
    r.name.toLowerCase().includes(query) ||
    r.content.toLowerCase().includes(query) ||
    r.type.toLowerCase().includes(query)
  );
  renderAdminRecords(filtered);
});

// Admin Refresh
adminRefreshBtn.addEventListener('click', loadAdminRecords);

// Admin Delete Record
adminRecordsTbody.addEventListener('click', async (e) => {
  const btn = e.target.closest('.delete-admin-record');
  if (!btn) return;
  const id = btn.getAttribute('data-id');

  if (!confirm(`ADMIN OVERRIDE: Delete this record permanently from Cloudflare?`)) return;
  btn.disabled = true;
  btn.textContent = '...';

  try {
    const res = await fetch(`/api/admin/records/${id}`, {
      method: 'DELETE',
      headers: { 'Authorization': `Bearer ${adminToken}` },
    });
    const data = await res.json();
    if (!res.ok) throw new Error(data.error || 'Delete failed');
    await loadAdminRecords();
  } catch (err) {
    alert(`Admin delete error: ${err.message}`);
    btn.disabled = false;
    btn.textContent = 'Delete';
  }
});

// Helpers
function setLoading(btn, isLoading) {
  if (isLoading) {
    btn.classList.add('is-loading');
    btn.disabled = true;
  } else {
    btn.classList.remove('is-loading');
    btn.disabled = false;
  }
}

function showFeedback(el, msg, type) {
  el.textContent = msg;
  el.className = `feedback-msg is-${type}`;
}

function hideFeedback(el) {
  el.className = 'feedback-msg';
  el.textContent = '';
}

function escapeHtml(str) {
  if (!str) return '';
  return String(str)
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&#039;');
}
