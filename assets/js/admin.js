'use strict';

/* ===============================
   Config
   =============================== */

const ENV =  location.hostname === 'localhost' ? 'local' :  'prod';

const CFG = {
  local: { redirectBase: 'http://localhost:5500',
           apiBase: 'https://enqh5c880l.execute-api.eu-west-3.amazonaws.com' },
  prod:  { redirectBase: 'https://daburgger.com',
           apiBase: 'https://enqh5c880l.execute-api.eu-west-3.amazonaws.com' }
};

// Use everywhere
const API_BASE = CFG[ENV].apiBase;

const COGNITO = {
  region: 'eu-west-3',
  userPoolId: 'eu-west-3_P0V42WXDq',
  clientId: '4dagm7pusbsvmpevv7pntgpg7l',
  domain: 'https://eu-west-3p0v42wxdq.auth.eu-west-3.amazoncognito.com',
  scopes: ['openid','email','profile'],
  tokenTypeForApi: 'access_token'
};


/* ===============================
   DOM
   =============================== */
const refreshBtn  = document.getElementById('refreshBtn');
const tbody       = document.getElementById('burgersTbody');
const tableWrap   = document.getElementById('tableWrap');
const emptyState  = document.getElementById('emptyState');
const addForm     = document.getElementById('addBurgerForm');

const loadingEl   = document.getElementById('loading');
const loadingText = document.getElementById('loadingText');
const toastEl     = document.getElementById('toast');

const adminGate    = document.getElementById('adminGate');
const adminContent = document.getElementById('adminContent');
const loginBtn     = document.getElementById('loginBtn');
const logoutBtn    = document.getElementById('logoutBtn');
const authStatus   = document.getElementById('authStatus');

/* ===============================
   Auth helpers (Hosted UI)
   =============================== */
const STORAGE_KEY = 'dab_auth_tokens'; // stores { id_token, access_token, expires_at, email, name, groups }

function buildLoginUrl() {
  const base = location.origin; // http://localhost:5500 or https://daburgger.com
  const p = new URLSearchParams({
    client_id: COGNITO.clientId,
    redirect_uri: `${base}/admin.html`,
    response_type: 'token',
    scope: COGNITO.scopes.join(' ')
  });
  return `${COGNITO.domain}/login?${p.toString()}`;
}

function buildLogoutUrl() {
  const base = location.origin;
  const p = new URLSearchParams({
    client_id: COGNITO.clientId,
    logout_uri: `${base}/index.html`,
    response_type: 'token'
  });
  return `${COGNITO.domain}/logout?${p.toString()}`;
}


// parse hash fragment returned by Hosted UI (#id_token=...&access_token=...&expires_in=3600&token_type=Bearer)
function parseHashTokens() {
  if (!location.hash || location.hash.length < 2) return null;
  const params = new URLSearchParams(location.hash.substring(1));
  const id_token = params.get('id_token') || '';
  const access_token = params.get('access_token') || '';
  const expires_in = parseInt(params.get('expires_in') || '0', 10);
  if (!id_token && !access_token) return null;

  const now = Math.floor(Date.now() / 1000);
  const expires_at = now + (isFinite(expires_in) ? expires_in : 3600);

  // decode JWT payload (no signature check here; API Gateway will do that)
  function decodePayload(jwt) {
    try {
      const payload = jwt.split('.')[1] || '';
      const json = atob(payload.replace(/-/g, '+').replace(/_/g, '/'));
      return JSON.parse(decodeURIComponent(escape(json)));
    } catch { return {}; }
  }

  const idClaims = id_token ? decodePayload(id_token) : {};
  const atClaims = access_token ? decodePayload(access_token) : {};

  // prefer name/email from id token if present
  const email = idClaims.email || atClaims.email || '';
  const name  = idClaims.name  || atClaims.username || '';
  const groups = idClaims['cognito:groups'] || atClaims['cognito:groups'] || [];

  return { id_token, access_token, expires_at, email, name, groups };
}

function saveTokens(tokens) {
  window.localStorage.setItem(STORAGE_KEY, JSON.stringify(tokens));
}
function getTokens() {
  try { return JSON.parse(window.localStorage.getItem(STORAGE_KEY) || 'null'); }
  catch { return null; }
}
function clearTokens() {
  window.localStorage.removeItem(STORAGE_KEY);
}

function isExpired(tokens) {
  if (!tokens?.expires_at) return true;
  // add a small safety margin
  return (Math.floor(Date.now() / 1000) + 30) >= tokens.expires_at;
}

function isAdmin(tokens) {
  const groups = tokens?.groups || [];
  return Array.isArray(groups) && groups.includes('admins');
}

function requireAuthForAdminUI() {
  const tokens = getTokens();
  const authed = tokens && !isExpired(tokens);
  const admin  = authed && isAdmin(tokens);

  loginBtn.hidden  = authed;
  logoutBtn.hidden = !authed;

  if (authed) {
    const who = tokens.email || tokens.name || 'Signed in';
    authStatus.textContent = admin ? `✅ ${who} (admin)` : `⚠️ ${who} (no admin rights)`;
  } else {
    authStatus.textContent = 'You are logged out.';
  }

  // Only show admin tools if user is authed AND in admins group
  adminContent.hidden = !(authed && admin);
  adminGate.hidden    = (authed && admin);

  return authed && admin;
}

/* ===============================
   Wire login/logout
   =============================== */
function beginLogin() {
  // clear hash to avoid loops, then redirect
  location.assign(buildLoginUrl());
}
function beginLogout() {
  clearTokens();
  // Hard redirect through Cognito logout (also clears hosted session)
  location.assign(buildLogoutUrl());
}

/* ===============================
   API helpers
   =============================== */
function getAuthHeaders() {
  const headers = {};
  const tokens = getTokens();
  if (tokens && !isExpired(tokens)) {
    const token = COGNITO.tokenTypeForApi === 'access_token' ? tokens.access_token : tokens.id_token;
    if (token) headers['Authorization'] = `Bearer ${token}`;
  }
  return headers;
}

async function apiFetch(path, { method = 'GET', body = null, headers = {} } = {}) {
  const url = `${API_BASE}${path}`;
  const mergedHeaders = {
    'Content-Type': 'application/json',
    ...getAuthHeaders(),
    ...headers,
  };
  const options = { method, headers: mergedHeaders };
  if (body !== null) options.body = typeof body === 'string' ? body : JSON.stringify(body);

  const res = await fetch(url, options);
  const text = await res.text();
  let data;
  try { data = JSON.parse(text); } catch { data = text; }

  if (!res.ok) {
    const message = (data && (data.message || data.error)) || `Request failed (${res.status})`;
    const error = new Error(message);
    error.status = res.status;
    error.data = data;
    throw error;
  }
  return data;
}

/* ===============================
   UI helpers
   =============================== */
function showLoading(show, message = 'Loading…') {
  loadingText.textContent = message;
  loadingEl.setAttribute('aria-hidden', show ? 'false' : 'true');
  tableWrap.setAttribute('aria-busy', show ? 'true' : 'false');
}

let toastTimeout;
function showToast(msg, type = 'info') {
  toastEl.textContent = msg;
  toastEl.hidden = false;
  toastEl.style.borderColor =
    type === 'error' ? 'rgba(255, 107, 107, .35)' :
    type === 'success' ? 'rgba(46, 204, 113, .4)' :
    'rgba(255,255,255,.12)';
  clearTimeout(toastTimeout);
  toastTimeout = setTimeout(() => { toastEl.hidden = true; }, 3000);
}

/* ===============================
   Data normalize/render
   =============================== */
function normalizeBurgers(data) {
  if (data && typeof data === 'object' && 'body' in data) {
    const body = typeof data.body === 'string' ? JSON.parse(data.body || 'null') : data.body;
    data = body;
  }
  if (typeof data === 'string') { try { data = JSON.parse(data); } catch {} }
  if (Array.isArray(data)) return data;
  if (Array.isArray(data?.items)) return data.items;
  return [];
}

async function fetchBurgers() {
  showLoading(true, 'Fetching burgers…');
  try {
    const raw = await apiFetch('/burgers');
    const burgers = normalizeBurgers(raw);
    renderBurgers(burgers);
    showToast('Loaded burgers', 'success');
  } catch (err) {
    console.error('GET /burgers failed:', err);
    emptyState.hidden = false;
    showToast(`Failed to load: ${err.message}`, 'error');
  } finally {
    showLoading(false);
  }
}

function renderBurgers(burgers) {
  tbody.innerHTML = '';
  if (!burgers || burgers.length === 0) { emptyState.hidden = false; return; }
  emptyState.hidden = true;

  burgers.forEach(b => {
    const tr = document.createElement('tr');
    tr.innerHTML = `
      <td>${escapeHtml(b.restaurant || '')}</td>
      <td>${escapeHtml(b.location || '')}</td>
      <td>${escapeHtml(b.burgerName || '')}</td>
      <td>${escapeHtml(b.burgerType || '')}</td>
      <td>${escapeHtml(String(b.rating ?? ''))}</td>
      <td>${escapeHtml(b.date || '')}</td>
      <td>${b.instagram ? `<a href="${escapeHtml(b.instagram)}" target="_blank">📸</a>` : ''}</td>
      <td>${b.maps ? `<a href="${escapeHtml(b.maps)}" target="_blank">📍</a>` : ''}</td>
      <td><button class="btn" data-action="delete" data-id="${encodeURIComponent(String(b.id))}">Delete</button></td>
    `;
    tbody.appendChild(tr);
  });
}

/* ===============================
   Add & Delete (protected)
   =============================== */
async function handleAddBurger(event) {
  event.preventDefault();
  if (!requireAuthForAdminUI()) {
    showToast('You must be an admin to add.', 'error');
    return;
  }
  const form = event.currentTarget;
  const fd = new FormData(form);

  const payload = {
    restaurant:  (fd.get('restaurant')  || '').toString().trim(),
    location:    (fd.get('location')    || '').toString().trim(),
    burgerName:  (fd.get('burgerName')  || '').toString().trim(),
    burgerType:  (fd.get('burgerType')  || '').toString().trim(),
    rating:      Number(fd.get('rating')),
    date:        (fd.get('date')        || '').toString().trim(),
    instagram:   (fd.get('instagram')   || '').toString().trim(),
    maps:        (fd.get('maps')        || '').toString().trim(),
  };

  const requiredKeys = ['restaurant','location','burgerName','burgerType','rating','date','instagram','maps'];
  const missing = requiredKeys.filter(k => payload[k] === '' || payload[k] == null || (k === 'rating' && !Number.isFinite(payload.rating)));
  if (missing.length) { showToast('Please fill required fields.', 'error'); return; }
  if (payload.rating < 1 || payload.rating > 5) { showToast('Rating must be between 1 and 5.', 'error'); return; }
  const allowedTypes = ['normal', 'smash'];
  if (!allowedTypes.includes(payload.burgerType.toLowerCase())) { showToast('Burger type must be "normal" or "smash".', 'error'); return; }

  showLoading(true, 'Adding burger…');
  try {
    await apiFetch('/burgers', { method: 'POST', body: payload });
    showToast('Burger added!', 'success');
    form.reset();
    await fetchBurgers();
  } catch (err) {
    console.error('POST /burgers failed:', err);
    showToast(`Add failed: ${err.message}`, 'error');
  } finally {
    showLoading(false);
  }
}

async function deleteBurger(id) {
  if (!id) return;
  if (!requireAuthForAdminUI()) { showToast('You must be an admin to delete.', 'error'); return; }

  const confirmDelete = confirm('Delete this burger? This cannot be undone.');
  if (!confirmDelete) return;

  showLoading(true, 'Deleting burger…');
  try {
    await apiFetch(`/burgers/${encodeURIComponent(id)}`, { method: 'DELETE' });
    showToast('Burger deleted', 'success');
    await fetchBurgers();
  } catch (err) {
    console.error('DELETE /burgers/{id} failed:', err);
    showToast(`Delete failed: ${err.message}`, 'error');
  } finally {
    showLoading(false);
  }
}

/* ===============================
   Utilities
   =============================== */
function escapeHtml(str) {
  return String(str)
    .replaceAll('&', '&amp;')
    .replaceAll('<', '&lt;')
    .replaceAll('>', '&gt;')
    .replaceAll('"', '&quot;')
    .replaceAll("'", '&#039;');
}

/* ===============================
   Init & Events
   =============================== */
function init() {
  // Handle Hosted UI redirect (if present)
  const tokensFromHash = parseHashTokens();
  if (tokensFromHash) {
    saveTokens(tokensFromHash);
    // Clean the hash so refresh/copy URLs look nice
    history.replaceState(null, '', location.pathname + location.search);
  }

  // Update UI based on tokens
  requireAuthForAdminUI();

  // Bind top buttons
  loginBtn.addEventListener('click', beginLogin);
  logoutBtn.addEventListener('click', beginLogout);

  // Fetch public list (GET is open)
  fetchBurgers();

  // Other events
  refreshBtn.addEventListener('click', () => fetchBurgers());
  addForm.addEventListener('submit', handleAddBurger);
  tbody.addEventListener('click', (e) => {
    const btn = e.target.closest('button[data-action="delete"]');
    if (!btn) return;
    const id = decodeURIComponent(btn.getAttribute('data-id') || '');
    if (id) deleteBurger(id);
  });
}

document.addEventListener('DOMContentLoaded', init);
