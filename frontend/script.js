'use strict';

// ══════════════════════════════════════════════════════════════
//  HealthCare — Frontend Application
// ══════════════════════════════════════════════════════════════

// ── State ──────────────────────────────────────────────────────
let currentUser      = null;
let conversationMessages = [];
let currentAssessment = null;
let chatMode         = null; // 'medical' | 'fitness'
let cart             = [];
let currentPayDoc    = '';
let currentPayPrice  = 0;
let currentPaySlot   = '';
let currentPayDocId  = null;
let currentPayIsEmergency = false;
let selectedSlots    = {};   // cardId -> { date, time }
let currentPayDate   = '';
let authMode         = 'login';
let currentFeedbackRating = 0;
let usernameCheckTimer = null;
let emergencyDataLoaded = false;
let pendingDelivery = null;             // multi-step shop checkout
let pendingReferralSpecialty = null;    // assessment-modal → book-doctor handoff
let chatSessions = [];                  // [{id, title, mode, messages, assessment, assessmentType, createdAt, updatedAt}]
let currentSessionId = null;

(function init() {
  const stored = localStorage.getItem('hc_user');
  const token  = localStorage.getItem('hc_token');
  if (stored && token) {
    try { currentUser = JSON.parse(stored); } catch (e) { /* ignore */ }
  }
  document.addEventListener('DOMContentLoaded', onDOMReady);
})();

function onDOMReady() {
  if (currentUser) applyLoggedInUI();
  initStatsCounter();
  loadChatSessions();
  renderChatHistorySidebar();
  // Restore the view from the URL hash so refresh keeps you where you were.
  routeFromHash();
  window.addEventListener('hashchange', routeFromHash);
}

// ── Chat Sessions (history) ────────────────────────────────────
function loadChatSessions() {
  try {
    chatSessions = JSON.parse(localStorage.getItem(userKey('chat_sessions')) || '[]');
  } catch (e) { chatSessions = []; }
}

function saveChatSessions() {
  // Keep the most recent 30, scoped to the logged-in user
  const trimmed = chatSessions.slice(0, 30);
  localStorage.setItem(userKey('chat_sessions'), JSON.stringify(trimmed));
}

function createNewChatSession(mode) {
  const id = 'cs_' + Date.now() + '_' + Math.random().toString(36).slice(2, 7);
  const session = {
    id,
    title: mode === 'fitness' ? 'New Fitness Chat' : 'New Medical Chat',
    mode,
    messages: [],
    assessment: null,
    assessmentType: null,
    createdAt: Date.now(),
    updatedAt: Date.now(),
  };
  chatSessions.unshift(session);
  currentSessionId = id;
  saveChatSessions();
  renderChatHistorySidebar();
  return session;
}

function getCurrentSession() {
  return chatSessions.find(s => s.id === currentSessionId) || null;
}

function updateCurrentSession(patch) {
  const s = getCurrentSession();
  if (!s) return;
  Object.assign(s, patch, { updatedAt: Date.now() });
  saveChatSessions();
  renderChatHistorySidebar();
}

function appendMessageToSession(role, content) {
  const s = getCurrentSession();
  if (!s) return;
  s.messages.push({ role, content });
  // Auto-title from first user message
  if (role === 'user' && (s.title.startsWith('New ') || !s.title)) {
    s.title = content.slice(0, 48) + (content.length > 48 ? '…' : '');
  }
  s.updatedAt = Date.now();
  saveChatSessions();
  renderChatHistorySidebar();
}

function renderChatHistorySidebar() {
  const wrap = document.getElementById('sidebarHistoryWrap');
  const list = document.getElementById('chatHistoryList');
  if (!wrap || !list) return;
  if (!chatSessions.length) {
    wrap.style.display = 'none';
    return;
  }
  wrap.style.display = 'flex';
  list.innerHTML = chatSessions.map(s => {
    const active = s.id === currentSessionId ? 'active' : '';
    const isFit = s.mode === 'fitness';
    const icon  = isFit ? 'fa-dumbbell' : 'fa-stethoscope';
    const date  = new Date(s.updatedAt).toLocaleDateString();
    const meta  = `${ucFirst(s.mode || 'chat')} · ${date}`;
    return `
      <button class="sidebar-history-item ${active}" onclick="loadChatSession('${s.id}')">
        <div class="shi-icon ${isFit ? 'fitness' : ''}"><i class="fa-solid ${icon}"></i></div>
        <div class="shi-body">
          <div class="shi-title">${escHtml(s.title || 'Untitled chat')}</div>
          <div class="shi-meta">${escHtml(meta)}</div>
        </div>
        <span class="shi-delete" onclick="event.stopPropagation();deleteChatSession('${s.id}')" title="Delete">
          <i class="fa-solid fa-trash"></i>
        </span>
      </button>`;
  }).join('');
}

function loadChatSession(id) {
  const s = chatSessions.find(x => x.id === id);
  if (!s) return;
  currentSessionId = id;
  chatMode = s.mode;
  conversationMessages = s.messages.map(m => ({ ...m }));
  currentAssessment = s.assessment ? { ...s.assessment, type: s.assessmentType } : null;

  showView('chat');

  // Hide welcome, show input area
  const welcome = document.getElementById('chatWelcome');
  if (welcome) welcome.style.display = 'none';
  const inputArea = document.getElementById('chatInputArea');
  if (inputArea) inputArea.style.display = 'block';

  // Update sidebar label
  const label = document.getElementById('sidebarModeLabel');
  if (label) label.textContent = s.mode === 'fitness' ? 'Fitness Coach AI' : 'Medical AI';

  // Render messages
  const container = document.getElementById('chatMessages');
  if (container) {
    container.innerHTML = '';
    s.messages.forEach(m => appendChatMessage(m.role === 'assistant' ? 'bot' : m.role, m.content));
    if (s.assessment) showAssessmentReadyBanner(s.assessmentType);
  }

  renderChatHistorySidebar();
}

function deleteChatSession(id) {
  chatSessions = chatSessions.filter(s => s.id !== id);
  if (currentSessionId === id) {
    currentSessionId = null;
    conversationMessages = [];
    chatMode = null;
    currentAssessment = null;
    resetChatUI();
  }
  saveChatSessions();
  renderChatHistorySidebar();
}

function clearAllChatSessions() {
  if (!confirm('Delete all saved chats? This cannot be undone.')) return;
  chatSessions = [];
  currentSessionId = null;
  saveChatSessions();
  renderChatHistorySidebar();
  resetChatUI();
}

function startNewChatSession() {
  currentSessionId = null;
  conversationMessages = [];
  chatMode = null;
  currentAssessment = null;
  resetChatUI();
  renderChatHistorySidebar();
}

// ── Hash Routing ───────────────────────────────────────────────
const PROTECTED_ROUTES = ['chat','dashboard','bookings','profile','admin'];

function routeFromHash() {
  const raw = (location.hash || '').replace(/^#\/?/, '').trim();
  if (!raw) return;
  if (PROTECTED_ROUTES.includes(raw) && !currentUser) {
    sessionStorage.setItem('hc_intended_route', raw);
    openModal('login');
    return;
  }
  switch (raw) {
    case 'chat':         showView('chat'); break;
    case 'dashboard':    handleDashboardNav(); break;
    case 'shop':         showShop(); break;
    case 'book-doctor':
    case 'book':         showBookDoctor(); break;
    case 'bookings':     showMyBookings(); break;
    case 'profile':      showProfilePage(); break;
    case 'admin':        showAdminDashboard(); break;
    case 'home':
    default:             goHome();
  }
}

function syncHashFor(viewId) {
  const map = {
    'landing': '',
    'chat': '#chat',
    'dashboard': '#dashboard',
    'professional-dashboard': '#dashboard',
    'shop': '#shop',
    'book-doctor': '#book-doctor',
    'bookings': '#bookings',
    'profile': '#profile',
    'admin': '#admin',
  };
  const desired = map[viewId];
  if (desired === undefined) return;
  if (location.hash === desired || (desired === '' && !location.hash)) return;
  history.replaceState(null, '', desired || location.pathname + location.search);
}

// ── Validators ─────────────────────────────────────────────────
// Shared rules. Mirror the same checks server-side.
const Validators = {
  required: v => (v && String(v).trim().length > 0) || 'This field is required',
  email: v => /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(String(v).trim()) || 'Enter a valid email address',
  // Phone: exactly 11 digits (Egyptian format), digits only
  phone: v => /^[0-9]{11}$/.test(String(v).replace(/\s+/g, '')) || 'Phone must be exactly 11 digits',
  // Password: min 8, must include letter and digit
  password: v => {
    const s = String(v);
    if (s.length < 8) return 'Password must be at least 8 characters';
    if (!/[A-Za-z]/.test(s) || !/[0-9]/.test(s)) return 'Password must include letters and numbers';
    return true;
  },
  // Name: 2-80 letters and spaces (supports Latin, Arabic)
  name: v => /^[A-Za-zÀ-ɏء-ي\s]{2,80}$/.test(String(v).trim()) || 'Name must be 2–80 letters only',
  username: v => /^[a-zA-Z0-9_]{3,20}$/.test(String(v).trim()) || 'Username must be 3–20 letters, numbers, or underscores',
  // Address: ≥ 15 chars and not all whitespace/repeated
  address: v => {
    const s = String(v).trim();
    if (s.length < 15) return 'Address must be at least 15 characters';
    if (/^(.)\1+$/.test(s.replace(/\s/g, ''))) return 'Please enter a real address';
    return true;
  },
  positiveInt: (min, max) => v => {
    const n = parseInt(v, 10);
    if (isNaN(n)) return 'Enter a valid number';
    if (n < min) return `Must be at least ${min}`;
    if (n > max) return `Must be at most ${max}`;
    return true;
  },
  cardNumber: v => /^[0-9]{13,19}$/.test(String(v).replace(/\s+/g, '')) || 'Card number must be 13–19 digits',
  cardExpiry: v => {
    const s = String(v).trim();
    if (!/^(0[1-9]|1[0-2])\/[0-9]{2}$/.test(s)) return 'Expiry must be MM/YY';
    const [mm, yy] = s.split('/').map(Number);
    const now = new Date();
    const expDate = new Date(2000 + yy, mm - 1, 1);
    expDate.setMonth(expDate.getMonth() + 1);
    if (expDate <= now) return 'Card has expired';
    return true;
  },
  cardCvv: v => /^[0-9]{3,4}$/.test(String(v).trim()) || 'CVV must be 3 or 4 digits',
  futureDate: v => {
    const d = new Date(v);
    if (isNaN(d.getTime())) return 'Pick a valid date';
    const today = new Date(); today.setHours(0,0,0,0);
    if (d < today) return 'Date cannot be in the past';
    return true;
  },
  rating: v => {
    const n = Number(v);
    return (n >= 1 && n <= 5) || 'Pick a rating from 1 to 5';
  },
};

function showFieldError(inputEl, msg) {
  if (!inputEl) return;
  let err = inputEl.nextElementSibling;
  if (!err || !err.classList.contains('field-error-msg')) {
    err = document.createElement('div');
    err.className = 'field-error-msg';
    inputEl.parentNode.insertBefore(err, inputEl.nextSibling);
  }
  err.textContent = msg || '';
  err.style.display = msg ? 'block' : 'none';
  inputEl.classList.toggle('field-invalid', !!msg);
  inputEl.classList.toggle('field-valid',   !msg);
}

function clearFieldError(inputEl) { showFieldError(inputEl, ''); inputEl.classList.remove('field-valid', 'field-invalid'); }

// Validate a single field. spec: { id, rules: [fn], optional: bool }
function validateField(spec) {
  const el = document.getElementById(spec.id);
  if (!el) return true;
  const v = (el.value || '').trim();
  if (!v) {
    if (spec.optional) { clearFieldError(el); return true; }
    showFieldError(el, 'This field is required');
    return false;
  }
  for (const rule of (spec.rules || [])) {
    const result = rule(v);
    if (result !== true) { showFieldError(el, result); return false; }
  }
  showFieldError(el, '');
  return true;
}

// Validate a list of specs; returns true if all pass.
function validateAll(specs) {
  let ok = true;
  for (const s of specs) {
    if (!validateField(s)) ok = false;
  }
  return ok;
}

// ── API Helper ─────────────────────────────────────────────────
async function apiCall(method, path, body = null) {
  const headers = { 'Content-Type': 'application/json' };
  const token = localStorage.getItem('hc_token');
  if (token) headers['Authorization'] = `Bearer ${token}`;
  const opts = { method, headers };
  if (body) opts.body = JSON.stringify(body);
  const url = `${window.location.origin}/api${path.startsWith('/') ? path : '/' + path}`;
  try {
    const res  = await fetch(url, opts);
    const data = await res.json();
    return { ok: res.ok, status: res.status, data };
  } catch (err) {
    console.error('API error:', err);
    return { ok: false, status: 0, data: { message: 'Network error: ' + err.message } };
  }
}

// ── View Routing ───────────────────────────────────────────────
const ALL_VIEWS = [
  'landing-view','chat-view','dashboard-view','shop-view',
  'book-doctor-view','bookings-view','profile-view','professional-dashboard',
  'admin-view'
];

function showView(id) {
  ALL_VIEWS.forEach(v => {
    const el = document.getElementById(v);
    if (el) el.style.display = 'none';
  });
  const target = document.getElementById(id + '-view') || document.getElementById(id);
  if (target) { target.style.display = 'block'; window.scrollTo(0, 0); }
  closeMobileNav();
  syncHashFor(id);
}

function goHome() { showView('landing'); }

function handleDashboardNav() {
  if (!currentUser) { openModal('login'); return; }
  if (currentUser.role === 'doctor' || currentUser.role === 'coach') {
    buildProfessionalDashboard();
    showView('professional-dashboard');
  } else {
    showView('dashboard');
    renderDashboardPage();
  }
  closeMobileNav();
}

function startChat() {
  if (!currentUser) { openModal('login'); return; }
  showView('chat');
}

function showShop() {
  showView('shop');
  loadProducts();
}

function showBookCoach() {
  if (!currentUser) { openModal('login'); return; }
  const role = currentUser?.role;
  if (role === 'doctor' || role === 'coach') {
    showToast('Booking is for patients only.', 'info');
    return;
  }
  showView('book-doctor');
  const titleEl = document.getElementById('bookViewTitle');
  const subEl   = document.getElementById('bookViewSubtitle');
  if (titleEl) titleEl.textContent = 'Book a Fitness Coach';
  if (subEl)   subEl.textContent   = 'Choose a certified coach for 1-on-1 sessions';
  currentPayIsEmergency = false;
  buildSpecGrid();
  setTimeout(() => selectSpec('Fitness Coaching'), 30);
}

function showBookDoctor(isEmergency) {
  if (!currentUser) { openModal('login'); return; }
  const role = currentUser?.role;
  if (role === 'doctor' || role === 'coach') {
    showToast('Booking is for patients only.', 'info');
    return;
  }
  showView('book-doctor');
  const titleEl = document.getElementById('bookViewTitle');
  const subEl   = document.getElementById('bookViewSubtitle');
  if (isEmergency) {
    if (titleEl) titleEl.textContent = 'Emergency Booking';
    if (subEl)   subEl.textContent   = 'Priority appointments — available within the hour';
    currentPayIsEmergency = true;
  } else {
    if (titleEl) titleEl.textContent = 'Book a Specialist';
    if (subEl)   subEl.textContent   = 'Choose a specialist and find your appointment slot';
    currentPayIsEmergency = false;
  }
  buildSpecGrid();
}

function showMyBookings() {
  if (!currentUser) { openModal('login'); return; }
  showView('bookings');
  loadMyBookings();
}

function showProfilePage() {
  if (!currentUser) { openModal('login'); return; }
  showView('profile');
  loadProfileData();
}

// ── Auth UI ────────────────────────────────────────────────────
function openModal(mode) {
  authMode = mode;
  const isLogin = mode === 'login';
  document.getElementById('authModal').style.display = 'flex';
  document.getElementById('modalTitle').textContent     = isLogin ? 'Welcome Back' : 'Create Account';
  document.getElementById('modalSubtitle').textContent  = isLogin
    ? 'Sign in to your HealthCare account'
    : 'Join thousands who trust HealthCare';
  document.getElementById('nameField').style.display    = isLogin ? 'none' : 'block';
  document.getElementById('roleField').style.display    = isLogin ? 'none' : 'block';
  document.getElementById('authBtnText').textContent    = isLogin ? 'Sign In' : 'Create Account';
  document.getElementById('authSwitchText').textContent = isLogin ? "Don't have an account?" : 'Already have an account?';
  document.getElementById('authSwitchBtn').textContent  = isLogin ? 'Create one' : 'Sign in';
  toggleRoleFields();
  hideAuthError();
  if (!isLogin) {
    document.getElementById('patientFields').style.display = 'block';
    document.getElementById('doctorFields').style.display  = 'none';
    document.getElementById('coachFields').style.display   = 'none';
  } else {
    document.getElementById('patientFields').style.display = 'none';
    document.getElementById('doctorFields').style.display  = 'none';
    document.getElementById('coachFields').style.display   = 'none';
  }
}

function closeAuthModal() {
  document.getElementById('authModal').style.display = 'none';
  setAuthLoading(false);
}

function toggleAuthMode() { openModal(authMode === 'login' ? 'register' : 'login'); }

function toggleRoleFields() {
  const role = document.getElementById('authRole')?.value || 'patient';
  setDisplay('doctorFields', role === 'doctor'  ? 'block' : 'none');
  setDisplay('coachFields',  role === 'coach'   ? 'block' : 'none');
  setDisplay('patientFields',role === 'patient' ? 'block' : 'none');
}

function showAuthError(msg) {
  const el = document.getElementById('authError');
  if (el) { el.textContent = msg; el.style.display = 'block'; }
}
function hideAuthError() {
  const el = document.getElementById('authError');
  if (el) el.style.display = 'none';
}
function setAuthLoading(loading) {
  const btn  = document.getElementById('authSubmitBtn');
  const txt  = document.getElementById('authBtnText');
  const spin = document.getElementById('authBtnSpinner');
  if (btn)  btn.disabled = loading;
  if (txt)  txt.style.display  = loading ? 'none'         : 'inline';
  if (spin) spin.style.display = loading ? 'inline-block' : 'none';
}

async function handleAuth(event) {
  event.preventDefault();
  hideAuthError();

  const isLogin = authMode === 'login';
  const role    = document.getElementById('authRole')?.value || 'patient';

  // Build a strict spec for the active form.
  const specs = [
    { id: 'authEmail', rules: [Validators.email] },
    { id: 'authPass',  rules: [Validators.password] },
  ];
  if (!isLogin) {
    specs.push({ id: 'authName', rules: [Validators.name] });
    if (role === 'patient') {
      specs.push({ id: 'patientAge', optional: true, rules: [Validators.positiveInt(1, 120)] });
    } else if (role === 'doctor') {
      specs.push({ id: 'docSpec',   rules: [v => v.length >= 2 || 'Specialization is required'] });
      specs.push({ id: 'docExp',    rules: [Validators.positiveInt(0, 80)] });
      specs.push({ id: 'docClinic', rules: [Validators.address] });
    } else if (role === 'coach') {
      specs.push({ id: 'coachType', rules: [v => v.length >= 2 || 'Training type is required'] });
      specs.push({ id: 'coachExp',  rules: [Validators.positiveInt(0, 80)] });
    }
  }
  if (!validateAll(specs)) { showAuthError('Please correct the highlighted fields.'); return; }

  setAuthLoading(true);
  const email = document.getElementById('authEmail').value.trim();
  const pass  = document.getElementById('authPass').value;

  let result;
  if (isLogin) {
    result = await apiCall('POST', '/auth/login', { email, password: pass });
  } else {
    const name = document.getElementById('authName').value.trim();
    const extra = {};
    if (role === 'patient') {
      extra.age    = document.getElementById('patientAge')?.value || null;
      extra.gender = document.getElementById('patientGender')?.value || null;
    } else if (role === 'doctor') {
      extra.specialization  = document.getElementById('docSpec')?.value.trim();
      extra.yearsExperience = document.getElementById('docExp')?.value || null;
      extra.clinicAddress   = document.getElementById('docClinic')?.value.trim();
    } else if (role === 'coach') {
      extra.trainingType    = document.getElementById('coachType')?.value.trim();
      extra.yearsExperience = document.getElementById('coachExp')?.value || null;
    }
    result = await apiCall('POST', '/auth/register', { name, email, password: pass, role, ...extra });
  }

  setAuthLoading(false);

  if (!result.ok) {
    showAuthError(result.data?.message || 'Authentication failed. Please try again.');
    return;
  }

  const { token, user } = result.data;
  localStorage.setItem('hc_token', token);
  localStorage.setItem('hc_user', JSON.stringify({ ...user, auth: true }));
  currentUser = { ...user, auth: true };

  // Reload per-user storage now that we know who's logged in.
  // (sessions/results were potentially loaded under "anon" namespace at boot)
  loadChatSessions();
  renderChatHistorySidebar();

  closeAuthModal();
  applyLoggedInUI();

  if (currentUser.role === 'doctor' || currentUser.role === 'coach') {
    buildProfessionalDashboard();
    showView('professional-dashboard');
  } else {
    showView('chat');
  }
}

function applyLoggedInUI() {
  const displayName = currentUser?.display_name || currentUser?.name || 'User';
  const initial     = displayName.charAt(0).toUpperCase();
  const role        = currentUser?.role || 'patient';

  setDisplay('navLogin',  'none');
  setDisplay('navSignup', 'none');
  setDisplay('userMenu',  'block');

  setEl('userAvatar',     initial);
  setEl('userName',       displayName);
  setEl('dropdownAvatar', initial);
  setEl('menuName',       displayName);
  setEl('menuEmail',      currentUser?.email || '');

  showEl('navDash');
  showEl('mobileNavDash');
  showEl('menuProfileItem');
  showEl('menuBookingsItem');
  showEl('navBookings');
  showEl('mobileNavBookings');

  if (role === 'patient') {
    showEl('navShop');
    showEl('navChat');
    showEl('menuShopItem');
    showEl('menuChatItem');
    showEl('mobileNavShop');
    showEl('mobileNavChat');
    // Ensure booking links visible for patients
    const bookEl   = document.getElementById('navBookDoctor');
    const mBookEl  = document.getElementById('mobileNavBook');
    const heroBook = document.getElementById('heroBookBtn');
    const ctaBook  = document.getElementById('ctaBookBtn');
    const dashBook = document.getElementById('dashBookBtn');
    const newBook  = document.getElementById('newBookingBtn');
    if (bookEl)   bookEl.style.display   = '';
    if (mBookEl)  mBookEl.style.display  = '';
    if (heroBook) heroBook.style.display = '';
    if (ctaBook)  ctaBook.style.display  = '';
    if (dashBook) dashBook.style.display = '';
    if (newBook)  newBook.style.display  = '';
  } else {
    // Doctors and coaches don't see patient booking UI
    setDisplay('navBookDoctor', 'none');
    setDisplay('mobileNavBook', 'none');
    setDisplay('heroBookBtn',   'none');
    setDisplay('ctaBookBtn',    'none');
    setDisplay('dashBookBtn',   'none');
    setDisplay('newBookingBtn', 'none');
  }

  setDisplay('mobileNavAuth', 'none');
}

function logout() {
  // Wipe ALL user-scoped state before navigating away.
  // Anything prefixed with hc_ is treated as our app's data and cleared.
  try {
    Object.keys(localStorage).forEach(k => {
      if (k.startsWith('hc_')) localStorage.removeItem(k);
    });
    Object.keys(sessionStorage).forEach(k => {
      if (k.startsWith('hc_')) sessionStorage.removeItem(k);
    });
  } catch (e) { /* ignore quota errors */ }

  // Reset all in-memory state
  currentUser = null;
  conversationMessages = [];
  currentAssessment = null;
  chatMode = null;
  cart = [];
  chatSessions = [];
  currentSessionId = null;
  selectedSlots = {};
  pendingDelivery = null;
  pendingReferralSpecialty = null;
  currentPayDoc = '';
  currentPayPrice = 0;
  currentPaySlot = '';
  currentPayDocId = null;
  currentPayIsEmergency = false;

  // Force a hard reload to drop any cached DOM state and route home
  location.hash = '';
  window.location.reload();
}

// Per-user storage helpers — keyed by user id so different users on the
// same browser cannot see each other's chats, history, or carts.
function userKey(suffix) {
  const uid = currentUser?.id || 'anon';
  return `hc_${suffix}_${uid}`;
}

// ── User Dropdown ──────────────────────────────────────────────
function toggleUserDropdown() {
  const dd      = document.getElementById('userDropdown');
  const trigger = document.getElementById('userMenuTrigger');
  const isOpen  = dd.classList.contains('open');
  dd.classList.toggle('open', !isOpen);
  trigger.setAttribute('aria-expanded', String(!isOpen));
  if (!isOpen) document.addEventListener('click', closeUserDropdownOutside, { once: true });
}
function closeUserDropdown() {
  const dd = document.getElementById('userDropdown');
  const t  = document.getElementById('userMenuTrigger');
  if (dd) dd.classList.remove('open');
  if (t)  t.setAttribute('aria-expanded', 'false');
}
function closeUserDropdownOutside(e) {
  const menu = document.getElementById('userMenu');
  if (menu && !menu.contains(e.target)) closeUserDropdown();
}

// ── Mobile Nav ─────────────────────────────────────────────────
function toggleMobileNav() {
  const nav  = document.getElementById('mobileNav');
  const icon = document.getElementById('hamburgerIcon');
  const isOpen = nav.classList.contains('open');
  nav.classList.toggle('open', !isOpen);
  if (icon) icon.className = isOpen ? 'fa-solid fa-bars' : 'fa-solid fa-xmark';
}
function closeMobileNav() {
  const nav  = document.getElementById('mobileNav');
  const icon = document.getElementById('hamburgerIcon');
  if (nav)  nav.classList.remove('open');
  if (icon) icon.className = 'fa-solid fa-bars';
}

// ── Chat Sidebar ───────────────────────────────────────────────
function toggleChatSidebar() {
  const sidebar = document.getElementById('chatSidebar');
  if (!sidebar) return;
  sidebar.classList.toggle('collapsed');
  sidebar.classList.toggle('mobile-open');
}

// ── Modal Helpers ──────────────────────────────────────────────
function handleOverlayClick(e, modalId) {
  if (e.target.id !== modalId) return;
  if (modalId === 'authModal')       closeAuthModal();
  if (modalId === 'paymentModal')    closePaymentModal();
  if (modalId === 'emergencyModal')  closeEmergencyModal();
  if (modalId === 'feedbackModal')   closeFeedbackModal();
  if (modalId === 'assessmentModal') closeAssessmentModal();
}

// ── FAQ ────────────────────────────────────────────────────────
function toggleFaq(btn) {
  const item = btn.closest('.faq-item');
  const isOpen = item.classList.contains('open');
  document.querySelectorAll('.faq-item.open').forEach(i => i.classList.remove('open'));
  if (!isOpen) item.classList.add('open');
}

// ── Stats Counter Animation ────────────────────────────────────
function initStatsCounter() {
  const observer = new IntersectionObserver(entries => {
    entries.forEach(entry => {
      if (!entry.isIntersecting) return;
      entry.target.querySelectorAll('.stat-number[data-target]').forEach(el => {
        const target = parseInt(el.dataset.target, 10);
        const suffix = el.dataset.suffix || '';
        let current  = 0;
        const step   = Math.ceil(target / 60);
        const interval = setInterval(() => {
          current = Math.min(current + step, target);
          el.textContent = current.toLocaleString() + suffix;
          if (current >= target) clearInterval(interval);
        }, 25);
      });
      observer.unobserve(entry.target);
    });
  }, { threshold: 0.3 });

  const statsSection = document.querySelector('.stats-section');
  if (statsSection) observer.observe(statsSection);
}

// ── Emergency Modal ────────────────────────────────────────────
function openEmergencyModal() {
  document.getElementById('emergencyModal').style.display = 'flex';
  if (!emergencyDataLoaded) loadEmergencyData();
}
function closeEmergencyModal() {
  document.getElementById('emergencyModal').style.display = 'none';
}

function switchEmgTab(tab, btn) {
  ['hotlines','hospitals','firstaid'].forEach(t => {
    setDisplay(`emgTab${ucFirst(t)}`, t === tab ? 'block' : 'none');
  });
  document.querySelectorAll('.emg-tab').forEach(b => b.classList.remove('active'));
  if (btn) btn.classList.add('active');
}

async function loadEmergencyData() {
  const result = await apiCall('GET', '/emergency');
  if (!result.ok || !result.data?.data) {
    document.getElementById('hotlinesList').innerHTML = '<p style="color:var(--text-muted)">Unable to load emergency data.</p>';
    return;
  }
  emergencyDataLoaded = true;
  const { hotlines, hospitals, firstAid } = result.data.data;
  renderHotlines(hotlines || []);
  renderHospitals(hospitals || []);
  renderFirstAid(firstAid || []);
}

function renderHotlines(hotlines) {
  const container = document.getElementById('hotlinesList');
  if (!container) return;
  container.innerHTML = hotlines.map(h => `
    <div class="hotline-item">
      <div class="hotline-icon icon-red"><i class="fa-solid ${h.icon || 'fa-phone'}"></i></div>
      <div class="hotline-info">
        <div class="hotline-name">${escHtml(h.name)}</div>
        <div class="hotline-desc">${escHtml(h.description)}</div>
      </div>
      <div>
        <div class="hotline-number">${escHtml(h.number)}</div>
        <a href="tel:${escHtml(h.number)}" class="hotline-call-btn">
          <i class="fa-solid fa-phone"></i> Call
        </a>
      </div>
    </div>`).join('');
}

function renderHospitals(hospitals) {
  const container = document.getElementById('hospitalsList');
  if (!container) return;
  container.innerHTML = hospitals.map(h => `
    <div class="hospital-item">
      <div class="hospital-info">
        <div class="hospital-name">${escHtml(h.name)}</div>
        <div class="hospital-address"><i class="fa-solid fa-location-dot"></i> ${escHtml(h.address)}</div>
        <div class="hospital-distance"><i class="fa-solid fa-route"></i> ${escHtml(h.distance)}</div>
      </div>
      <div class="hospital-contact">
        <a href="tel:${escHtml(h.phone)}" class="hospital-phone-btn">
          <i class="fa-solid fa-phone"></i> ${escHtml(h.phone)}
        </a>
        ${h.open24h ? '<div class="hospital-open"><i class="fa-solid fa-clock"></i> Open 24/7</div>' : ''}
      </div>
    </div>`).join('');
}

function renderFirstAid(guides) {
  const container = document.getElementById('firstAidList');
  if (!container) return;
  const sevColor = { critical: 'icon-red', high: 'icon-orange' };
  container.innerHTML = guides.map((g, i) => `
    <div class="first-aid-item" id="fa-item-${i}">
      <button class="first-aid-header" onclick="toggleFirstAid(${i})">
        <div class="first-aid-title-row">
          <i class="fa-solid ${g.icon || 'fa-kit-medical'} first-aid-icon"></i>
          <span class="first-aid-name">${escHtml(g.title)}</span>
          <span class="badge ${g.severity === 'critical' ? 'badge-red' : 'badge-yellow'}">${g.severity || ''}</span>
        </div>
        <i class="fa-solid fa-chevron-down faq-icon"></i>
      </button>
      <div class="first-aid-steps">
        <ol>${(g.steps || []).map(s => `<li>${escHtml(s)}</li>`).join('')}</ol>
      </div>
    </div>`).join('');
}

function toggleFirstAid(i) {
  const item = document.getElementById('fa-item-' + i);
  if (item) item.classList.toggle('open');
}

// ── Chat Engine ────────────────────────────────────────────────
function selectChatMode(mode) {
  chatMode = mode;
  conversationMessages = [];

  // Create a new chat session for history
  createNewChatSession(mode);

  // Hide welcome
  const welcome = document.getElementById('chatWelcome');
  if (welcome) welcome.style.display = 'none';

  // Show input area
  const inputArea = document.getElementById('chatInputArea');
  if (inputArea) inputArea.style.display = 'block';

  // Update sidebar label and tips
  const label = document.getElementById('sidebarModeLabel');
  const tips  = document.getElementById('sidebarTips');
  if (mode === 'medical') {
    if (label) label.textContent = 'Medical AI';
    if (tips) tips.innerHTML = `
      <p class="sidebar-tip"><i class="fa-solid fa-stethoscope"></i> Describe your symptoms naturally</p>
      <p class="sidebar-tip"><i class="fa-solid fa-brain"></i> AI asks smart follow-up questions</p>
      <p class="sidebar-tip"><i class="fa-solid fa-file-medical"></i> Receive a personalized assessment</p>
      <p class="sidebar-tip"><i class="fa-solid fa-pills"></i> Medication guidance with dosages</p>`;
    // Update chat placeholder
    const input = document.getElementById('chatInput');
    if (input) input.placeholder = 'Describe your symptoms or health concern…';
  } else {
    if (label) label.textContent = 'Fitness Coach AI';
    if (tips) tips.innerHTML = `
      <p class="sidebar-tip"><i class="fa-solid fa-dumbbell"></i> Share your fitness goal</p>
      <p class="sidebar-tip"><i class="fa-solid fa-location-dot"></i> Home, gym, or outdoor</p>
      <p class="sidebar-tip"><i class="fa-solid fa-calendar-days"></i> Get a weekly workout plan</p>
      <p class="sidebar-tip"><i class="fa-solid fa-apple-whole"></i> Nutrition & supplement tips</p>`;
    const input = document.getElementById('chatInput');
    if (input) input.placeholder = 'Tell me your fitness goal and current level…';
  }

  // Send initial greeting
  const greeting = mode === 'medical'
    ? "Hi! I'm your HealthCare AI doctor assistant. What health concerns have you been experiencing? Tell me as much as you feel comfortable sharing."
    : "Hi! I'm your HealthCare fitness coach AI. Let's build you a personalized plan! First — what's your main fitness goal? (e.g. weight loss, muscle gain, endurance, flexibility, general fitness)";

  appendChatMessage('bot', greeting);
  conversationMessages.push({ role: 'assistant', content: greeting });
  appendMessageToSession('assistant', greeting);

  const input = document.getElementById('chatInput');
  if (input) input.focus();
}

async function sendChatMessage() {
  const input = document.getElementById('chatInput');
  if (!input) return;
  const text = input.value.trim();
  if (!text) return;

  if (!currentUser) { openModal('login'); return; }
  if (!chatMode) {
    showToast('Please choose Doctor AI or Coach AI first.', 'warning');
    return;
  }

  input.value = '';
  autoResizeTextarea(input);

  appendChatMessage('user', text);
  conversationMessages.push({ role: 'user', content: text });
  appendMessageToSession('user', text);

  const sendBtn = document.getElementById('chatSendBtn');
  if (input)   input.disabled   = true;
  if (sendBtn) sendBtn.disabled = true;
  showTypingIndicator(true);

  const result = await apiCall('POST', '/chat', { messages: conversationMessages, mode: chatMode });

  showTypingIndicator(false);
  if (input)   input.disabled   = false;
  if (sendBtn) sendBtn.disabled = false;
  if (input)   input.focus();

  if (!result.ok) {
    const errMsg = result.data?.message || 'Something went wrong. Please try again.';
    appendChatMessage('bot', errMsg);
    conversationMessages.push({ role: 'assistant', content: errMsg });
    return;
  }

  const { message, assessment, assessmentType, isComplete } = result.data;

  if (message) {
    appendChatMessage('bot', message);
    conversationMessages.push({ role: 'assistant', content: message });
    appendMessageToSession('assistant', message);
  }

  if (isComplete && assessment) {
    currentAssessment = { ...assessment, type: assessmentType };
    updateCurrentSession({ assessment, assessmentType });
    const results = JSON.parse(localStorage.getItem(userKey('chatbot_results')) || '[]');
    results.unshift({ assessment: currentAssessment, savedAt: new Date().toISOString() });
    localStorage.setItem(userKey('chatbot_results'), JSON.stringify(results.slice(0, 20)));
    setTimeout(() => {
      // Auto-popup the assessment modal for medical results, plus banner so user can reopen
      if (assessmentType === 'medical') openAssessmentModal(currentAssessment);
      showAssessmentReadyBanner(assessmentType);
    }, 500);
  }
}

function appendChatMessage(role, text) {
  const container = document.getElementById('chatMessages');
  if (!container) return;

  const msgEl = document.createElement('div');
  msgEl.className = `chat-message ${role}`;

  const avatar = document.createElement('div');
  avatar.className = 'msg-avatar';
  if (role === 'bot') {
    avatar.innerHTML = '<i class="fa-solid fa-robot"></i>';
  } else {
    avatar.textContent = (currentUser?.display_name || currentUser?.name || 'U').charAt(0).toUpperCase();
  }

  const bubble = document.createElement('div');
  bubble.className = 'msg-bubble';
  bubble.textContent = text;

  msgEl.appendChild(avatar);
  msgEl.appendChild(bubble);
  container.appendChild(msgEl);
  container.scrollTop = container.scrollHeight;
}

function showAssessmentReadyBanner(type) {
  const container = document.getElementById('chatMessages');
  if (!container) return;

  const isFitness = type === 'fitness';
  const banner = document.createElement('div');
  banner.className = 'view-assessment-banner';
  banner.innerHTML = `
    <div>
      <strong>${isFitness ? 'Your fitness plan is ready!' : 'Your health assessment is ready!'}</strong>
      <p>HealthCare AI has prepared your personalized ${isFitness ? 'fitness plan' : 'health assessment'}.</p>
    </div>
    <button class="btn btn-primary" onclick="viewAssessment()">
      <i class="fa-solid fa-${isFitness ? 'dumbbell' : 'file-medical'}"></i>
      View ${isFitness ? 'Fitness Plan' : 'Assessment'}
    </button>`;
  container.appendChild(banner);
  container.scrollTop = container.scrollHeight;
}

function viewAssessment() {
  if (!currentAssessment) return;
  showView('dashboard');
  if (currentAssessment.type === 'fitness') {
    renderFitnessAssessment(currentAssessment);
  } else {
    renderAssessmentDashboard(currentAssessment);
  }
}

function showTypingIndicator(show) {
  const el = document.getElementById('chatTyping');
  if (el) el.style.display = show ? 'flex' : 'none';
}

function resetChat() {
  startNewChatSession();
}

function resetChatUI() {
  conversationMessages = [];
  currentAssessment    = null;
  chatMode             = null;

  const container = document.getElementById('chatMessages');
  if (container) {
    container.innerHTML = '';
    // Restore welcome with mode choice
    const welcome = document.createElement('div');
    welcome.id        = 'chatWelcome';
    welcome.className = 'chat-welcome';
    welcome.innerHTML = `
      <div class="welcome-icon"><i class="fa-solid fa-comments-medical"></i></div>
      <h2>How can we help you today?</h2>
      <p>Choose what kind of help you're looking for to get started.</p>
      <div class="chat-mode-choice">
        <button class="chat-mode-btn" onclick="selectChatMode('medical')">
          <div class="chat-mode-icon icon-blue"><i class="fa-solid fa-stethoscope"></i></div>
          <div class="chat-mode-info">
            <strong>Talk to a Doctor AI</strong>
            <small>Describe symptoms, get a health assessment &amp; medication guidance</small>
          </div>
          <i class="fa-solid fa-arrow-right chat-mode-arrow"></i>
        </button>
        <button class="chat-mode-btn" onclick="selectChatMode('fitness')">
          <div class="chat-mode-icon icon-orange"><i class="fa-solid fa-dumbbell"></i></div>
          <div class="chat-mode-info">
            <strong>Talk to a Coach AI</strong>
            <small>Get a personalized fitness plan &amp; nutrition guidance</small>
          </div>
          <i class="fa-solid fa-arrow-right chat-mode-arrow"></i>
        </button>
      </div>`;
    container.appendChild(welcome);
  }

  // Reset sidebar label
  const label = document.getElementById('sidebarModeLabel');
  if (label) label.textContent = 'Health Assistant';

  // Hide input area until mode chosen
  const inputArea = document.getElementById('chatInputArea');
  if (inputArea) inputArea.style.display = 'none';
}

function handleChatKeydown(e) {
  if (e.key === 'Enter' && !e.shiftKey) { e.preventDefault(); sendChatMessage(); }
}

function autoResizeTextarea(el) {
  el.style.height = 'auto';
  el.style.height = Math.min(el.scrollHeight, 140) + 'px';
}

// ── Dashboard Rendering ────────────────────────────────────────
function renderDashboardPage() {
  const content = document.getElementById('dashboardContent');
  if (!content) return;

  if (currentAssessment) {
    if (currentAssessment.type === 'fitness') {
      renderFitnessAssessment(currentAssessment);
    } else {
      renderAssessmentDashboard(currentAssessment);
    }
  } else {
    content.innerHTML = `
      <div style="text-align:center; padding:60px 20px; color:var(--text-muted);">
        <div style="font-size:3rem; margin-bottom:16px;">💬</div>
        <h3 style="color:var(--text-primary); margin-bottom:10px;">No assessment yet</h3>
        <p style="margin-bottom:24px;">Start a health chat to get your personalized assessment.</p>
        <button class="btn btn-primary" onclick="showView('chat')">
          <i class="fa-solid fa-comments-medical"></i> Start Health Chat
        </button>
      </div>`;
  }
  loadLocalHistory();
  loadDashboardBookings();
  loadDashboardOrders();
}

function renderAssessmentDashboard(a) {
  const content = document.getElementById('dashboardContent');
  if (!content || !a) return;

  setEl('dashTitle',    'Your Health Assessment');
  setEl('dashSubtitle', 'Based on your conversation with HealthCare AI');

  const needsSpecialist = !!a.specialistNeeded
    || (a.severity || '').toLowerCase() === 'severe'
    || (a.urgency || '').toLowerCase() === 'immediate';
  const referralSpec = a.specialistNeeded || (needsSpecialist ? 'General Medicine' : null);
  if (referralSpec) pendingReferralSpecialty = referralSpec;
  const medsHeading = needsSpecialist ? 'Symptomatic Relief Until You See a Doctor' : 'Recommended Medications';
  const referralHTML = needsSpecialist ? `
    <div class="assessment-referral" style="margin-bottom:20px">
      <div class="referral-icon"><i class="fa-solid fa-user-doctor"></i></div>
      <div class="referral-body">
        <strong>This needs a specialist</strong>
        <p>Based on your assessment, see a ${escHtml(referralSpec)} specialist in person. The medications below are for symptom relief only.</p>
      </div>
      <button class="btn btn-primary" onclick="bookFromAssessment()">
        <i class="fa-solid fa-calendar-plus"></i> Book Now
      </button>
    </div>` : '';

  const severityBadge = { mild: '<span class="badge badge-green"><i class="fa-solid fa-circle-check"></i> Mild</span>', moderate: '<span class="badge badge-yellow"><i class="fa-solid fa-circle-exclamation"></i> Moderate</span>', severe: '<span class="badge badge-red"><i class="fa-solid fa-triangle-exclamation"></i> Severe</span>' }[a.severity] || '<span class="badge badge-gray">Unknown</span>';
  const urgencyClass = { routine: 'urgency-routine', soon: 'urgency-soon', immediate: 'urgency-immediate' }[a.urgency] || 'urgency-routine';
  const urgencyIcon  = { routine: 'fa-clock', soon: 'fa-calendar', immediate: 'fa-siren-on' }[a.urgency] || 'fa-clock';
  const urgencyText  = a.urgencyText || { routine: 'No rush — routine follow-up', soon: 'See a doctor within 2–3 days', immediate: 'Seek medical care today' }[a.urgency] || a.urgency;

  let medsHTML = '';
  if (a.medications && a.medications.length > 0) {
    medsHTML = a.medications.map(med => `
      <div class="med-card">
        <div class="med-card-header">
          <div class="med-name">${escHtml(med.name)}</div>
          <span class="med-type-tag ${med.type === 'otc' ? 'med-otc' : 'med-rx'}">
            ${med.type === 'otc' ? 'Over-the-counter' : 'Prescription needed'}
          </span>
        </div>
        <div class="med-detail"><i class="fa-solid fa-flask"></i><span><strong>Dosage:</strong> ${escHtml(med.dosage || '—')}</span></div>
        <div class="med-detail"><i class="fa-regular fa-clock"></i><span><strong>Frequency:</strong> ${escHtml(med.frequency || '—')}</span></div>
        <div class="med-detail"><i class="fa-solid fa-calendar-days"></i><span><strong>Duration:</strong> ${escHtml(med.duration || '—')}</span></div>
        ${med.instructions ? `<div class="med-instructions"><i class="fa-solid fa-circle-info"></i>${escHtml(med.instructions)}</div>` : ''}
      </div>`).join('');
  } else {
    medsHTML = '<p style="color:var(--text-muted); font-size:0.9rem;">No specific medications recommended. Focus on home remedies and rest.</p>';
  }

  const remediesHTML  = buildTipList(a.homeRemedies, 'icon-teal',  'fa-solid fa-leaf');
  const lifestyleHTML = buildTipList(a.lifestyle,    'icon-green', 'fa-solid fa-heart');

  let warningsHTML = '';
  if (a.warnings && a.warnings.length > 0) {
    warningsHTML = `
      <div class="dash-section" style="border-color:var(--danger-border); background:var(--danger-light);">
        <div class="dash-section-header">
          <div class="dash-section-icon icon-red"><i class="fa-solid fa-triangle-exclamation"></i></div>
          <h3 style="color:var(--danger)">Warning Signs to Watch For</h3>
        </div>
        <div class="warning-list">
          ${a.warnings.map(w => `<div class="warning-item"><i class="fa-solid fa-circle-exclamation"></i><span>${escHtml(w)}</span></div>`).join('')}
        </div>
      </div>`;
  }

  content.innerHTML = `
    ${referralHTML}
    <div class="condition-card">
      <div class="condition-header">
        <div class="condition-name-row">
          <div class="condition-name">${escHtml(a.condition || 'Health Assessment')}</div>
          ${severityBadge}
        </div>
        <div class="urgency-badge ${urgencyClass}">
          <i class="fa-solid ${urgencyIcon}"></i> ${escHtml(urgencyText)}
        </div>
      </div>
      <p class="condition-overview">${escHtml(a.overview || '')}</p>
    </div>
    <div class="dashboard-sections">
      ${renderTreatmentPlanSection(a)}
      <div class="dash-section">
        <div class="dash-section-header">
          <div class="dash-section-icon icon-blue"><i class="fa-solid fa-pills"></i></div>
          <h3>${medsHeading}</h3>
        </div>
        <div class="medications-grid">${medsHTML}</div>
      </div>
      ${a.homeRemedies && a.homeRemedies.length ? `
      <div class="dash-section">
        <div class="dash-section-header">
          <div class="dash-section-icon icon-teal"><i class="fa-solid fa-leaf"></i></div>
          <h3>Home Remedies</h3>
        </div>
        <div class="tip-list">${remediesHTML}</div>
      </div>` : ''}
      ${a.lifestyle && a.lifestyle.length ? `
      <div class="dash-section">
        <div class="dash-section-header">
          <div class="dash-section-icon icon-green"><i class="fa-solid fa-heart"></i></div>
          <h3>Lifestyle Recommendations</h3>
        </div>
        <div class="tip-list">${lifestyleHTML}</div>
      </div>` : ''}
      ${warningsHTML}
      ${a.followUp ? `<div class="followup-card"><i class="fa-solid fa-calendar-check"></i><span>${escHtml(a.followUp)}</span></div>` : ''}
      <div class="book-cta-card">
        <h3>${needsSpecialist ? `See a ${escHtml(referralSpec)} specialist` : 'Want to speak with a real doctor?'}</h3>
        <p>${needsSpecialist ? 'Skip the search — go straight to vetted specialists in this field.' : 'Our specialists are available for consultation across 10+ fields.'}</p>
        <button class="btn btn-white btn-lg" onclick="${needsSpecialist ? 'bookFromAssessment()' : 'showBookDoctor()'}">
          <i class="fa-solid fa-calendar-plus"></i> Book an Appointment
        </button>
      </div>
    </div>`;
}

function renderTreatmentPlanSection(a) {
  const steps = [];

  // Step 1: Medications (if any)
  if (a.medications && a.medications.length) {
    const medList = a.medications.map(m =>
      `<li><strong>${escHtml(m.name)}</strong> — ${escHtml(m.dosage || '')} ${escHtml(m.frequency || '')}${m.duration ? ' for ' + escHtml(m.duration) : ''}</li>`
    ).join('');
    steps.push({
      icon: 'fa-pills',
      title: 'Start Medication',
      desc: 'Begin the recommended medications as soon as possible.',
      list: medList,
      timing: 'Today',
    });
  }

  // Step 2: Home remedies & rest
  if (a.homeRemedies && a.homeRemedies.length) {
    const remList = a.homeRemedies.map(r => `<li>${escHtml(r)}</li>`).join('');
    steps.push({
      icon: 'fa-leaf',
      title: 'Apply Home Remedies & Rest',
      desc: 'Support your recovery with these self-care steps.',
      list: remList,
      timing: 'Daily, throughout recovery',
    });
  }

  // Step 3: Lifestyle adjustments
  if (a.lifestyle && a.lifestyle.length) {
    const lsList = a.lifestyle.map(l => `<li>${escHtml(l)}</li>`).join('');
    steps.push({
      icon: 'fa-heart',
      title: 'Lifestyle Adjustments',
      desc: 'Make these changes to speed up recovery and prevent recurrence.',
      list: lsList,
      timing: 'Ongoing',
    });
  }

  // Step 4: Monitor for warning signs
  if (a.warnings && a.warnings.length) {
    const wList = a.warnings.map(w => `<li>${escHtml(w)}</li>`).join('');
    steps.push({
      icon: 'fa-triangle-exclamation',
      title: 'Monitor & Watch For Warning Signs',
      desc: 'Seek medical care immediately if any of these occur.',
      list: wList,
      timing: 'Throughout recovery',
    });
  }

  // Step 5: Follow-up
  steps.push({
    icon: 'fa-calendar-check',
    title: 'Follow-Up',
    desc: a.followUp || 'If symptoms persist beyond a week or worsen, book an in-person consultation with a specialist.',
    list: '',
    timing: a.urgency === 'immediate' ? 'Today' : a.urgency === 'soon' ? 'Within 2–3 days' : 'Within 1 week if no improvement',
  });

  if (!steps.length) return '';

  const stepsHTML = steps.map((s, i) => `
    <div class="treatment-step">
      <div class="treatment-step-num">${i + 1}</div>
      <div class="treatment-step-body">
        <div class="treatment-step-title"><i class="fa-solid ${s.icon}"></i> ${escHtml(s.title)}</div>
        <div class="treatment-step-desc">${escHtml(s.desc)}</div>
        ${s.list ? `<ul class="treatment-step-list">${s.list}</ul>` : ''}
        <div class="treatment-step-desc" style="margin-top:6px"><strong>When:</strong> ${escHtml(s.timing)}</div>
      </div>
    </div>`).join('');

  return `
    <div class="dash-section">
      <div class="dash-section-header">
        <div class="dash-section-icon icon-blue"><i class="fa-solid fa-clipboard-list"></i></div>
        <h3>Your Treatment Plan</h3>
      </div>
      <p style="color:var(--text-muted);font-size:0.9rem;margin-bottom:14px">
        Follow these steps in order for the best recovery.
      </p>
      <div class="treatment-plan">${stepsHTML}</div>
    </div>`;
}

async function loadDashboardBookings() {
  const section = document.getElementById('bookingsSection');
  const list    = document.getElementById('bookingsList');
  if (!section || !list) return;

  const result = await apiCall('GET', '/booking');
  if (!result.ok || !Array.isArray(result.data?.data) || result.data.data.length === 0) {
    section.style.display = 'none';
    return;
  }

  list.innerHTML = result.data.data.slice(0, 10).map(b => {
    const date = b.date ? new Date(b.date).toLocaleDateString() : 'TBD';
    const slot = b.time_slot ? ` · ${escHtml(b.time_slot)}` : '';
    const status = (b.status || 'confirmed').toLowerCase();
    const statusBadge = { confirmed: 'badge-green', cancelled: 'badge-red', completed: 'badge-gray' }[status] || 'badge-gray';
    const payTag = b.payment_status === 'paid'
      ? '<span class="badge badge-green">Paid</span>'
      : `<span class="badge badge-gray">${escHtml(b.payment_method || 'Cash')}</span>`;
    return `
      <div class="dash-item-card">
        <div class="dash-item-icon icon-blue"><i class="fa-solid fa-user-doctor"></i></div>
        <div class="dash-item-body">
          <strong>${escHtml(b.doctor_name || 'Doctor Appointment')}</strong>
          <div class="dash-item-meta">${date}${slot}${b.fee ? ` · EGP ${b.fee}` : ''}</div>
        </div>
        <div class="dash-item-tags">
          <span class="badge ${statusBadge}">${ucFirst(status)}</span>
          ${payTag}
        </div>
      </div>`;
  }).join('');
  section.style.display = 'block';
}

async function loadDashboardOrders() {
  const section = document.getElementById('ordersSection');
  const list    = document.getElementById('ordersList');
  if (!section || !list) return;

  const result = await apiCall('GET', '/orders');
  if (!result.ok || !Array.isArray(result.data?.data) || result.data.data.length === 0) {
    section.style.display = 'none';
    return;
  }

  list.innerHTML = result.data.data.slice(0, 10).map(o => {
    const date = o.created_at ? new Date(o.created_at).toLocaleDateString() : '';
    const items = Array.isArray(o.items) ? o.items : [];
    const itemNames = items.length
      ? items.map(i => `${escHtml(i.product_name || i.name || 'Item')} ×${i.quantity || 1}`).join(', ')
      : (o.product_name ? escHtml(o.product_name) : 'Order');
    const total = o.total_amount || o.total_price || o.total || 0;
    const status = (o.status || 'processing').toLowerCase();
    const statusBadge = { processing: 'badge-yellow', shipped: 'badge-blue', delivered: 'badge-green', cancelled: 'badge-red' }[status] || 'badge-gray';
    const payTag = o.payment_status === 'paid'
      ? '<span class="badge badge-green">Paid</span>'
      : `<span class="badge badge-gray">${escHtml(o.payment_method || 'Cash')}</span>`;
    return `
      <div class="dash-item-card">
        <div class="dash-item-icon icon-green"><i class="fa-solid fa-bag-shopping"></i></div>
        <div class="dash-item-body">
          <strong>${itemNames}</strong>
          <div class="dash-item-meta">${date} · $${Number(total).toFixed(2)}</div>
        </div>
        <div class="dash-item-tags">
          <span class="badge ${statusBadge}">${ucFirst(status)}</span>
          ${payTag}
        </div>
      </div>`;
  }).join('');
  section.style.display = 'block';
}

function renderFitnessAssessment(a) {
  const content = document.getElementById('dashboardContent');
  if (!content || !a) return;

  setEl('dashTitle',    'Your Fitness Plan');
  setEl('dashSubtitle', 'Personalized by HealthCare Coach AI');

  const levelBadge = { beginner: 'badge-green', intermediate: 'badge-yellow', advanced: 'badge-red' }[a.level] || 'badge-gray';
  const locIcon    = { home: 'fa-house', gym: 'fa-dumbbell', outdoor: 'fa-tree' }[a.location] || 'fa-location-dot';

  const weeklyHTML = (a.weeklyPlan || []).map((day, i) => `
    <div class="fitness-plan-day">
      <div class="fitness-day-header">
        <div>
          <div class="fitness-day-name">${escHtml(day.day)}</div>
          <div class="fitness-day-focus">${escHtml(day.focus)} · ${escHtml(day.duration || '')} · ${escHtml(day.intensity || '')}</div>
        </div>
        <i class="fa-solid fa-chevron-down faq-icon" id="fit-chevron-${i}"></i>
      </div>
      <div class="fitness-exercises" id="fit-day-${i}" style="display:block">
        ${(day.exercises || []).map(ex => `
          <div class="fitness-exercise">
            <div>
              <div class="exercise-name">${escHtml(ex.name)}</div>
              <div class="exercise-details">${ex.notes ? escHtml(ex.notes) : ''}</div>
            </div>
            <div class="exercise-sets">${ex.sets} × ${escHtml(ex.reps)}<br><small style="font-weight:400;color:var(--text-muted)">Rest: ${escHtml(ex.rest || '60s')}</small></div>
          </div>`).join('')}
      </div>
    </div>`).join('');

  const nutritionHTML = buildTipList(a.nutritionTips || [], 'icon-green', 'fa-solid fa-apple-whole');
  const lifestyleHTML = buildTipList(a.lifestyle || [],    'icon-blue',  'fa-solid fa-heart');
  const suppList      = (a.supplements || []).map(s => `<span class="badge badge-purple" style="margin:3px">${escHtml(s)}</span>`).join('');

  let warningsHTML = '';
  if (a.warnings && a.warnings.length) {
    warningsHTML = `
      <div class="dash-section" style="border-color:var(--warning-border); background:var(--warning-light);">
        <div class="dash-section-header">
          <div class="dash-section-icon icon-orange"><i class="fa-solid fa-triangle-exclamation"></i></div>
          <h3 style="color:#92400e">Important Notes</h3>
        </div>
        <div class="tip-list">${buildTipList(a.warnings, 'icon-orange', 'fa-solid fa-circle-exclamation')}</div>
      </div>`;
  }

  content.innerHTML = `
    <div class="condition-card">
      <div class="condition-header">
        <div class="condition-name-row">
          <div class="condition-name">${escHtml(a.goal || 'Fitness Plan')}</div>
          <span class="badge ${levelBadge}">${ucFirst(a.level || 'beginner')}</span>
          <span class="badge badge-blue"><i class="fa-solid ${locIcon}"></i> ${ucFirst(a.location || 'home')}</span>
        </div>
      </div>
      <p class="condition-overview">${escHtml(a.overview || '')}</p>
    </div>
    <div class="dashboard-sections">
      <div class="dash-section">
        <div class="dash-section-header">
          <div class="dash-section-icon icon-orange"><i class="fa-solid fa-calendar-days"></i></div>
          <h3>Weekly Workout Plan</h3>
        </div>
        <div style="display:flex;flex-direction:column;gap:10px">${weeklyHTML}</div>
      </div>
      ${nutritionHTML ? `
      <div class="dash-section">
        <div class="dash-section-header">
          <div class="dash-section-icon icon-green"><i class="fa-solid fa-apple-whole"></i></div>
          <h3>Nutrition Tips</h3>
        </div>
        <div class="tip-list">${nutritionHTML}</div>
      </div>` : ''}
      ${suppList ? `
      <div class="dash-section">
        <div class="dash-section-header">
          <div class="dash-section-icon icon-purple"><i class="fa-solid fa-pills"></i></div>
          <h3>Optional Supplements</h3>
        </div>
        <div style="display:flex;flex-wrap:wrap;gap:6px">${suppList}</div>
      </div>` : ''}
      ${lifestyleHTML ? `
      <div class="dash-section">
        <div class="dash-section-header">
          <div class="dash-section-icon icon-blue"><i class="fa-solid fa-heart"></i></div>
          <h3>Lifestyle Tips</h3>
        </div>
        <div class="tip-list">${lifestyleHTML}</div>
      </div>` : ''}
      ${warningsHTML}
      ${a.coachNote ? `<div class="followup-card"><i class="fa-solid fa-person-running"></i><span>${escHtml(a.coachNote)}</span></div>` : ''}
      ${a.location === 'gym' ? renderGymPickerSection() : ''}
      <div class="book-cta-card">
        <h3>Want to work with a real fitness coach?</h3>
        <p>Our certified coaches are available for 1-on-1 training sessions.</p>
        <button class="btn btn-white btn-lg" onclick="showBookCoach()">
          <i class="fa-solid fa-calendar-plus"></i> Book a Coach
        </button>
      </div>
    </div>`;
}

// ── Gyms ────────────────────────────────────────────────────────
const GYMS_DATA = [
  { name: 'Gold\'s Gym',         location: 'New Cairo',          phone: '+20 100 111 2222', monthly: 1200, rating: 4.7 },
  { name: 'Fitness First',       location: 'Maadi, Cairo',       phone: '+20 122 333 4444', monthly: 1500, rating: 4.8 },
  { name: 'Smart Gym',           location: 'Heliopolis, Cairo',  phone: '+20 111 555 6666', monthly: 800,  rating: 4.5 },
  { name: 'PowerHouse Gym',      location: 'Nasr City, Cairo',   phone: '+20 100 777 8888', monthly: 950,  rating: 4.6 },
  { name: 'California Gym',      location: 'Zamalek, Cairo',     phone: '+20 122 999 0000', monthly: 1100, rating: 4.7 },
  { name: 'Oxygen Fitness Club', location: '6th October City',   phone: '+20 111 222 3333', monthly: 700,  rating: 4.4 },
];

function renderGymPickerSection() {
  const today = new Date().toISOString().split('T')[0];
  const maxDateStr = (() => {
    const d = new Date(); d.setDate(d.getDate() + 60);
    return d.toISOString().split('T')[0];
  })();
  const cards = GYMS_DATA.map((g, idx) => {
    const stars = '★'.repeat(Math.floor(g.rating)) + '☆'.repeat(5 - Math.floor(g.rating));
    const cardId = 'gym-' + idx;
    const labelName = 'Gym: ' + g.name;
    return `
      <div class="gym-card" id="${cardId}">
        <div class="gym-card-header">
          <div class="gym-icon"><i class="fa-solid fa-dumbbell"></i></div>
          <div>
            <div class="gym-name">${escHtml(g.name)}</div>
            <div class="gym-loc"><i class="fa-solid fa-location-dot"></i> ${escHtml(g.location)}</div>
          </div>
        </div>
        <div class="gym-meta">
          <span>${stars} ${g.rating}</span>
          <span class="gym-price">EGP ${g.monthly}/mo</span>
        </div>

        <div class="booking-step-label">
          <span class="booking-step-num">1</span>
          <i class="fa-regular fa-calendar"></i> Choose a start date
        </div>
        <input type="date" class="form-input booking-date-input"
          id="date-${cardId}"
          min="${today}" max="${maxDateStr}"
          onchange="onBookingDateChange('${cardId}', this.value)">

        <div class="booking-step-label">
          <span class="booking-step-num">2</span>
          <i class="fa-regular fa-clock"></i> Choose a time
        </div>
        <div class="slots-row" id="slots-${cardId}">
          ${DOCTOR_SLOTS.map(s => `<button class="slot-btn" disabled onclick="selectSlot(this,'${cardId}')">${s}</button>`).join('')}
        </div>
        <div class="slot-selected-text" id="slot-${cardId}"></div>

        <div class="gym-actions">
          <button class="btn btn-primary" id="bookBtn-${cardId}" disabled
            onclick="openPayment('${escHtml(labelName)}',${g.monthly},'${cardId}','gym')">
            <i class="fa-solid fa-calendar-check"></i> Book Membership
          </button>
          <button class="btn btn-outline btn-sm" onclick="window.open('tel:${escHtml(g.phone)}')">
            <i class="fa-solid fa-phone"></i> Call
          </button>
        </div>
      </div>`;
  }).join('');
  return `
    <div class="dash-section">
      <div class="dash-section-header">
        <div class="dash-section-icon icon-orange"><i class="fa-solid fa-dumbbell"></i></div>
        <h3>Pick a Gym Near You</h3>
      </div>
      <p style="color:var(--text-muted);font-size:0.9rem;margin-bottom:14px">
        Since you chose to train at a gym, here are recommended gyms in your area.
      </p>
      <div class="gym-grid">${cards}</div>
    </div>`;
}

function buildTipList(items, iconBg, iconClass) {
  if (!items || !items.length) return '';
  return items.map(item => `
    <div class="tip-item">
      <div class="tip-bullet ${iconBg}"><i class="${iconClass}"></i></div>
      <span>${escHtml(item)}</span>
    </div>`).join('');
}

function loadLocalHistory() {
  const stored = JSON.parse(localStorage.getItem(userKey('chatbot_results')) || '[]');
  if (!stored.length) return;
  const section = document.getElementById('historySection');
  const list    = document.getElementById('historyList');
  if (!section || !list) return;
  list.innerHTML = stored.slice(0, 5).map((r, i) => {
    const a    = r.assessment;
    if (!a) return '';
    const date = r.savedAt ? new Date(r.savedAt).toLocaleDateString() : 'Unknown date';
    const sev  = a.severity || 'mild';
    const type = a.type || 'medical';
    const bc   = { mild:'badge-green', moderate:'badge-yellow', severe:'badge-red' }[sev] || 'badge-gray';
    return `
      <div class="history-item" role="button" tabindex="0" onclick="openHistoryAssessment(${i})" onkeydown="if(event.key==='Enter')openHistoryAssessment(${i})" style="cursor:pointer">
        <div>
          <strong>${escHtml(a.condition || a.goal || 'Assessment')}</strong>
          <div style="font-size:0.8rem;color:var(--text-muted);margin-top:3px;">${date} · ${type}</div>
        </div>
        <span class="badge ${bc}">${ucFirst(sev)}</span>
      </div>`;
  }).join('');
  if (list.innerHTML.trim()) section.style.display = 'block';
}

function openHistoryAssessment(idx) {
  const stored = JSON.parse(localStorage.getItem(userKey('chatbot_results')) || '[]');
  const r = stored[idx];
  if (!r || !r.assessment) return;
  currentAssessment = r.assessment;
  showView('dashboard');
  if (currentAssessment.type === 'fitness') {
    renderFitnessAssessment(currentAssessment);
  } else {
    renderAssessmentDashboard(currentAssessment);
  }
  window.scrollTo({ top: 0, behavior: 'smooth' });
}

// ── My Bookings ────────────────────────────────────────────────
async function loadMyBookings() {
  const content = document.getElementById('bookingsContent');
  if (!content) return;
  content.innerHTML = '<div class="loading-state"><i class="fa-solid fa-spinner fa-spin"></i><p>Loading…</p></div>';

  const result = await apiCall('GET', '/booking');
  if (!result.ok) {
    content.innerHTML = '<div class="loading-state"><i class="fa-solid fa-triangle-exclamation"></i><p>Failed to load bookings.</p></div>';
    return;
  }

  const bookings = result.data?.data || [];
  if (!bookings.length) {
    content.innerHTML = `
      <div class="bookings-empty">
        <i class="fa-solid fa-calendar-xmark"></i>
        <p>No bookings yet</p>
        <button class="btn btn-primary" onclick="showBookDoctor()">
          <i class="fa-solid fa-calendar-plus"></i> Book an Appointment
        </button>
      </div>`;
    return;
  }

  content.innerHTML = `<div style="display:flex;flex-direction:column;gap:16px">${bookings.map(b => buildBookingCardHTML(b)).join('')}</div>`;
}

function buildBookingCardHTML(b) {
  const isEmg    = b.booking_type === 'emergency';
  const statusCls = { confirmed:'status-confirmed', pending:'status-pending', completed:'status-completed', cancelled:'status-cancelled' }[b.status] || 'status-pending';
  const date     = b.date ? new Date(b.date).toLocaleDateString('en-US', { weekday:'short', month:'short', day:'numeric' }) : b.date;
  const canCancel = b.status === 'confirmed' || b.status === 'pending';
  const canReview = b.status === 'completed' && !b.feedback_submitted;

  return `
    <div class="booking-card ${isEmg ? 'emergency-booking' : ''} ${b.status === 'cancelled' ? 'cancelled' : ''}">
      <div class="booking-left">
        <div class="booking-doctor">
          <i class="fa-solid fa-user-doctor" style="color:var(--primary);margin-right:6px"></i>
          ${escHtml(b.doctor_name || 'Doctor')}
          ${isEmg ? '<span class="booking-type-badge"><i class="fa-solid fa-bolt"></i> Emergency</span>' : ''}
        </div>
        <div class="booking-meta">
          <span><i class="fa-solid fa-calendar"></i> ${escHtml(date)}</span>
          ${b.time_slot ? `<span><i class="fa-regular fa-clock"></i> ${escHtml(b.time_slot)}</span>` : ''}
          ${b.fee ? `<span><i class="fa-solid fa-money-bill"></i> EGP ${b.fee}</span>` : ''}
          ${b.payment_method ? `<span><i class="fa-solid fa-wallet"></i> ${ucFirst(b.payment_method)}</span>` : ''}
        </div>
      </div>
      <div class="booking-right">
        <span class="booking-status ${statusCls}">${ucFirst(b.status || 'pending')}</span>
        <div class="booking-actions">
          ${b.status !== 'cancelled' ? `<button class="btn btn-primary btn-sm" onclick="openProChat('${b.id}','${escHtml(b.doctor_name || 'Doctor')}','${b.professional_role || 'doctor'}')"><i class="fa-solid fa-comments"></i> Chat with your ${(b.professional_role === 'coach') ? 'Coach' : 'Doctor'}</button>` : ''}
          ${canCancel ? `<button class="btn btn-outline btn-sm" onclick="cancelBooking('${b.id}')"><i class="fa-solid fa-xmark"></i> Cancel</button>` : ''}
          ${canReview ? `<button class="btn btn-outline btn-sm" onclick="openFeedbackModal('${b.id}','${escHtml(b.doctor_name || '')}','${b.doctor_id || ''}')"><i class="fa-solid fa-star"></i> Review</button>` : ''}
        </div>
      </div>
    </div>`;
}

// ── Chat with your Doctor / Coach ─────────────────────────────
let _proChatBookingId = null;
let _proChatPollTimer = null;
let _proChatLastCount = 0;

async function openProChat(bookingId, professionalName, role) {
  if (!currentUser) { openModal('login'); return; }
  _proChatBookingId = bookingId;
  setEl('proChatName', professionalName || 'Professional');
  setEl('proChatRole', role === 'coach' ? 'Coach' : 'Doctor');
  document.getElementById('proChatBody').innerHTML = '<div class="pro-chat-empty"><i class="fa-solid fa-spinner fa-spin"></i> Loading…</div>';
  document.getElementById('proChatModal').style.display = 'flex';
  document.getElementById('proChatInput').value = '';
  await loadProChatMessages(true);
  // Poll every 5s while modal is open
  if (_proChatPollTimer) clearInterval(_proChatPollTimer);
  _proChatPollTimer = setInterval(loadProChatMessages, 5000);
}

function closeProChat() {
  document.getElementById('proChatModal').style.display = 'none';
  if (_proChatPollTimer) { clearInterval(_proChatPollTimer); _proChatPollTimer = null; }
  _proChatBookingId = null;
  _proChatLastCount = 0;
}

async function loadProChatMessages(scrollToEnd) {
  if (!_proChatBookingId) return;
  const result = await apiCall('GET', `/messages?booking_id=${encodeURIComponent(_proChatBookingId)}`);
  if (!result.ok) {
    document.getElementById('proChatBody').innerHTML = `<div class="pro-chat-empty">${escHtml(result.data?.message || 'Failed to load messages')}</div>`;
    return;
  }
  const msgs = result.data?.data || [];
  const body = document.getElementById('proChatBody');
  if (!msgs.length) {
    body.innerHTML = '<div class="pro-chat-empty">Ask your doctor for advice or follow-up guidance about your visit.</div>';
    return;
  }
  // Only re-render if message count changed
  if (msgs.length === _proChatLastCount) return;
  _proChatLastCount = msgs.length;

  body.innerHTML = msgs.map(m => {
    const mine = (currentUser?.role === 'doctor' || currentUser?.role === 'coach')
      ? m.sender_role === 'professional'
      : m.sender_role === 'patient';
    const time = new Date(m.created_at).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' });
    return `
      <div class="pro-msg ${mine ? 'mine' : 'theirs'}">
        <div class="pro-msg-bubble">${renderChatBody(m.body)}</div>
        <div class="pro-msg-time">${time}</div>
      </div>`;
  }).join('');
  if (scrollToEnd || true) body.scrollTop = body.scrollHeight;
}

// Light markdown for chat bubbles: bold, bullet lists, line breaks. Escapes first.
function renderChatBody(raw) {
  let s = escHtml(String(raw || ''));
  s = s.replace(/\*\*([^*\n]+)\*\*/g, '<strong>$1</strong>');
  const lines = s.split('\n');
  let html = '';
  let inList = false;
  for (const line of lines) {
    const m = line.match(/^\s*[-•]\s+(.*)$/);
    if (m) {
      if (!inList) { html += '<ul class="pro-msg-list">'; inList = true; }
      html += `<li>${m[1]}</li>`;
    } else {
      if (inList) { html += '</ul>'; inList = false; }
      html += line + '<br>';
    }
  }
  if (inList) html += '</ul>';
  return html.replace(/(<br>)+$/, '');
}

async function sendProChatMessage() {
  const input = document.getElementById('proChatInput');
  if (!input || !_proChatBookingId) return;
  const text = input.value.trim();
  if (!text) return;
  if (text.length > 2000) { showToast('Message too long', 'warning'); return; }

  input.value = '';
  autoResizeTextarea(input);

  const result = await apiCall('POST', '/messages', { booking_id: _proChatBookingId, body: text });
  if (!result.ok) {
    showToast(result.data?.message || 'Failed to send', 'error');
    input.value = text;
    return;
  }
  // Force a refresh
  _proChatLastCount = 0;
  await loadProChatMessages(true);
}

async function cancelBooking(id) {
  if (!confirm('Cancel this booking?')) return;
  const result = await apiCall('PATCH', `/booking?id=${id}`);
  if (result.ok) {
    showToast('Booking cancelled.', 'success');
    loadMyBookings();
  } else {
    showToast(result.data?.message || 'Failed to cancel.', 'error');
  }
}

// ── Feedback / Ratings ─────────────────────────────────────────
function openFeedbackModal(bookingId, doctorName, doctorId) {
  currentFeedbackRating = 0;
  document.getElementById('fbBookingId').value = bookingId || '';
  document.getElementById('fbDoctorId').value  = doctorId  || '';
  document.getElementById('feedbackDoctorName').textContent = doctorName || 'Doctor';
  document.getElementById('fbReview').value    = '';
  document.getElementById('fbAnonymous').checked = false;
  document.getElementById('fbCommunication').value = '';
  document.getElementById('fbProfessionalism').value = '';
  setDisplay('feedbackErr', 'none');
  renderStars(0);
  document.getElementById('feedbackModal').style.display = 'flex';
}

function closeFeedbackModal() {
  document.getElementById('feedbackModal').style.display = 'none';
}

function setRating(val) {
  currentFeedbackRating = val;
  renderStars(val);
  const labels = ['', 'Poor', 'Fair', 'Good', 'Very Good', 'Excellent'];
  setEl('starLabel', labels[val] || 'Tap to rate');
}

function renderStars(active) {
  document.querySelectorAll('#starRating .star-btn').forEach((btn, i) => {
    const filled = i < active;
    btn.innerHTML = filled ? '<i class="fa-solid fa-star"></i>' : '<i class="fa-regular fa-star"></i>';
    btn.classList.toggle('active', filled);
  });
}

async function submitFeedback() {
  const bookingId = document.getElementById('fbBookingId').value;
  const doctorId  = document.getElementById('fbDoctorId').value;
  const review    = document.getElementById('fbReview').value.trim();
  const anonymous = document.getElementById('fbAnonymous').checked;
  const communication   = document.getElementById('fbCommunication').value || null;
  const professionalism = document.getElementById('fbProfessionalism').value || null;

  const errEl = document.getElementById('feedbackErr');
  setDisplay('feedbackErr', 'none');

  if (!currentFeedbackRating) {
    errEl.textContent = 'Please select a rating.';
    errEl.style.display = 'block';
    return;
  }

  setEl('fbSubmitTxt', '');
  setDisplay('fbSubmitSpinner', 'inline-block');

  const result = await apiCall('POST', '/feedback', {
    booking_id: bookingId || null,
    doctor_id:  doctorId  || null,
    rating:     currentFeedbackRating,
    communication,
    professionalism,
    review:     review || null,
    anonymous,
  });

  setDisplay('fbSubmitSpinner', 'none');
  setEl('fbSubmitTxt', 'Submit Review');

  if (result.ok) {
    closeFeedbackModal();
    showToast('Thank you for your review!', 'success');
    loadMyBookings();
  } else {
    errEl.textContent = result.data?.message || 'Failed to submit. Please try again.';
    errEl.style.display = 'block';
  }
}

// ── Profile Page ───────────────────────────────────────────────
async function loadProfileData() {
  const result = await apiCall('GET', '/profile');
  if (!result.ok) {
    showToast('Failed to load profile.', 'error');
    return;
  }
  const u = result.data?.data || {};

  const displayName = u.display_name || u.name || '';
  const initial     = displayName.charAt(0).toUpperCase();
  const role        = u.role || 'patient';

  // Avatar section
  const avatarEl = document.getElementById('profileAvatarDisplay');
  if (avatarEl) {
    if (u.avatar_url) {
      avatarEl.innerHTML = `<img src="${escHtml(u.avatar_url)}" alt="Avatar" onerror="this.parentElement.textContent='${initial}'" style="width:100%;height:100%;object-fit:cover;border-radius:50%">`;
    } else {
      avatarEl.textContent = initial;
    }
  }
  setEl('profileDisplayNameShow', displayName || u.name || '');
  setEl('profileEmailShow',       u.email || '');
  setEl('profileRoleBadge',       ucFirst(role));

  // Form fields
  setVal('profileDisplayName', u.display_name || '');
  setVal('profileName',        u.name         || '');
  setVal('profileUsername',    u.username      || '');
  setVal('profileEmail',       u.email         || '');
  setVal('profileAvatar',      u.avatar_url    || '');
  setVal('profileBio',         u.bio           || '');
  setVal('profileAge',         u.age           || '');
  setVal('profileGender',      u.gender        || '');

  // Pro fields
  if (role === 'doctor' || role === 'coach') {
    setDisplay('profFields', 'block');
    const specLabel  = document.getElementById('profSpecLabel');
    const addrLabel  = document.getElementById('profAddressLabel');
    if (specLabel)  specLabel.textContent  = role === 'doctor' ? 'Specialization' : 'Training Type';
    if (addrLabel)  addrLabel.textContent  = role === 'doctor' ? 'Clinic Address' : 'Training Location';
    setVal('profSpecialization', u.specialization  || u.training_type || '');
    setVal('profYearsExp',       u.years_experience || '');
    setVal('profRegRate',        u.regular_rate     || '');
    setVal('profEmgRate',        u.emergency_rate   || '');
    setVal('profAddress',        u.clinic_address   || '');
  }
}

async function saveProfile() {
  // Validate
  const specs = [
    { id: 'profileDisplayName', optional: true, rules: [v => v.length >= 2 || 'Display name must be at least 2 characters'] },
    { id: 'profileName',        optional: true, rules: [Validators.name] },
    { id: 'profileUsername',    optional: true, rules: [Validators.username] },
    { id: 'profileEmail',       optional: true, rules: [Validators.email] },
    { id: 'profileAge',         optional: true, rules: [Validators.positiveInt(1, 120)] },
  ];
  if (currentUser?.role === 'doctor' || currentUser?.role === 'coach') {
    specs.push({ id: 'profYearsExp', optional: true, rules: [Validators.positiveInt(0, 80)] });
    specs.push({ id: 'profRegRate',  optional: true, rules: [Validators.positiveInt(0, 100000)] });
    specs.push({ id: 'profEmgRate',  optional: true, rules: [Validators.positiveInt(0, 200000)] });
  }
  if (!validateAll(specs)) {
    const errEl = document.getElementById('profileErr');
    if (errEl) { errEl.textContent = 'Please correct the highlighted fields.'; errEl.style.display = 'block'; }
    return;
  }

  const updates = {};
  const dName = getVal('profileDisplayName').trim();
  const name  = getVal('profileName').trim();
  const uname = getVal('profileUsername').trim().toLowerCase();
  const email = getVal('profileEmail').trim();
  const avatar= getVal('profileAvatar').trim();
  const bio   = getVal('profileBio').trim();
  const age   = getVal('profileAge');
  const gender= getVal('profileGender');

  if (dName)  updates.display_name = dName;
  if (name)   updates.name         = name;
  if (uname)  updates.username     = uname;
  if (email)  updates.email        = email;
  if (avatar) updates.avatar_url   = avatar;
  if (bio)    updates.bio          = bio;
  if (age)    updates.age          = age;
  if (gender) updates.gender       = gender;

  const role = currentUser?.role;
  if (role === 'doctor' || role === 'coach') {
    const spec   = getVal('profSpecialization');
    const exp    = getVal('profYearsExp');
    const regR   = getVal('profRegRate');
    const emgR   = getVal('profEmgRate');
    const addr   = getVal('profAddress');
    if (spec) updates[role === 'doctor' ? 'specialization' : 'training_type'] = spec;
    if (exp)  updates.years_experience = exp;
    if (regR) updates.regular_rate     = regR;
    if (emgR) updates.emergency_rate   = emgR;
    if (addr) updates[role === 'doctor' ? 'clinic_address' : 'clinic_address'] = addr;
  }

  const msgEl = document.getElementById('profileMsg');
  const errEl = document.getElementById('profileErr');
  setDisplay('profileMsg', 'none');
  setDisplay('profileErr', 'none');
  setEl('profileSaveTxt', '');
  setDisplay('profileSaveSpinner', 'inline-block');

  const result = await apiCall('PUT', '/profile', updates);

  setDisplay('profileSaveSpinner', 'none');
  setEl('profileSaveTxt', 'Save Changes');

  if (result.ok) {
    const u = result.data?.data;
    if (u) {
      currentUser = { ...currentUser, ...u };
      localStorage.setItem('hc_user', JSON.stringify(currentUser));
      applyLoggedInUI();
    }
    msgEl.textContent    = 'Profile updated successfully!';
    msgEl.style.display  = 'block';
    setTimeout(() => setDisplay('profileMsg', 'none'), 3000);
  } else {
    errEl.textContent   = result.data?.message || 'Update failed. Please try again.';
    errEl.style.display = 'block';
  }
}

async function changePassword() {
  const cur  = getVal('currentPwd');
  const nw   = getVal('newPwd');
  const conf = getVal('confirmPwd');

  const errEl = document.getElementById('securityErr');
  const msgEl = document.getElementById('securityMsg');
  setDisplay('securityErr', 'none');
  setDisplay('securityMsg', 'none');

  if (!cur || !nw || !conf) { errEl.textContent = 'Please fill in all fields.'; errEl.style.display = 'block'; return; }
  const pwdResult = Validators.password(nw);
  if (pwdResult !== true) { errEl.textContent = pwdResult; errEl.style.display = 'block'; return; }
  if (nw !== conf)          { errEl.textContent = 'Passwords do not match.'; errEl.style.display = 'block'; return; }

  setEl('pwdSaveTxt', '');
  setDisplay('pwdSaveSpinner', 'inline-block');

  const result = await apiCall('PUT', '/profile', { current_password: cur, new_password: nw });

  setDisplay('pwdSaveSpinner', 'none');
  setEl('pwdSaveTxt', 'Change Password');

  if (result.ok) {
    msgEl.textContent   = 'Password changed successfully!';
    msgEl.style.display = 'block';
    setVal('currentPwd', '');
    setVal('newPwd', '');
    setVal('confirmPwd', '');
    setTimeout(() => setDisplay('securityMsg', 'none'), 3000);
  } else {
    errEl.textContent   = result.data?.message || 'Failed to change password.';
    errEl.style.display = 'block';
  }
}

function switchProfileTab(tab, btn) {
  setDisplay('profileTabInfo',     tab === 'info'     ? 'block' : 'none');
  setDisplay('profileTabSecurity', tab === 'security' ? 'block' : 'none');
  document.querySelectorAll('.profile-tab').forEach(b => b.classList.remove('active'));
  if (btn) btn.classList.add('active');
}

function debounceCheckUsername(value) {
  clearTimeout(usernameCheckTimer);
  const statusEl = document.getElementById('usernameStatus');
  if (!value || value.length < 3) {
    if (statusEl) { statusEl.textContent = ''; statusEl.className = 'username-status'; }
    return;
  }
  if (statusEl) { statusEl.textContent = 'Checking…'; statusEl.className = 'username-status checking'; }
  usernameCheckTimer = setTimeout(() => checkUsername(value), 600);
}

async function checkUsername(value) {
  const statusEl = document.getElementById('usernameStatus');
  const result   = await apiCall('GET', `/profile?action=check-username&username=${encodeURIComponent(value)}`);
  if (!statusEl) return;
  if (result.ok) {
    const avail = result.data?.available;
    statusEl.textContent  = avail ? '✓ Available' : '✗ Taken';
    statusEl.className    = 'username-status ' + (avail ? 'available' : 'taken');
  } else {
    statusEl.textContent  = '';
    statusEl.className    = 'username-status';
  }
}

function previewAvatar(url) {
  const avatarEl = document.getElementById('profileAvatarDisplay');
  if (!avatarEl) return;
  if (url && url.startsWith('http')) {
    avatarEl.innerHTML = `<img src="${escHtml(url)}" alt="Avatar" onerror="this.parentElement.textContent='${(currentUser?.display_name || currentUser?.name || 'U').charAt(0).toUpperCase()}'" style="width:100%;height:100%;object-fit:cover;border-radius:50%">`;
  }
}

// ── Products / Shop ────────────────────────────────────────────
async function loadProducts() {
  const grid = document.getElementById('shopGrid');
  if (!grid) return;

  grid.innerHTML = '<div class="loading-state"><i class="fa-solid fa-spinner fa-spin"></i><p>Loading products…</p></div>';
  const result = await apiCall('GET', '/products');
  if (!result.ok || !result.data?.data) {
    grid.innerHTML = '<div class="loading-state"><i class="fa-solid fa-box-open"></i><p>Unable to load products.</p></div>';
    return;
  }
  grid.innerHTML = result.data.data.map(p => {
    const pid = escHtml(p.id || p.name);
    const safeCardId = 'pcard-' + (p.id || p.name).replace(/[^a-zA-Z0-9]/g, '_');
    return `
    <div class="product-card" id="${safeCardId}">
      <div class="product-icon"><i class="fa-solid ${p.icon || 'fa-capsules'}"></i></div>
      <div class="product-name">${escHtml(p.name)}</div>
      <div class="product-desc">${escHtml(p.description || '')}</div>
      <div class="product-price">$${Number(p.price).toFixed(2)}</div>
      <div class="product-cart-area" id="cart-area-${safeCardId}">
        <button class="btn btn-primary product-add-btn" onclick="addToCartQty('${pid}','${escHtml(p.name)}',${p.price},'${safeCardId}')">
          <i class="fa-solid fa-cart-plus"></i> Add to Cart
        </button>
      </div>
    </div>`;
  }).join('');
}


async function deleteProduct(id, name) {
  if (!currentUser) { openModal('login'); return; }
  if (!confirm(`Remove "${name}" from the shop?`)) return;
  const result = await apiCall('DELETE', `/products?id=${encodeURIComponent(id)}`);
  if (!result.ok) {
    showToast(result.data?.message || 'Failed to remove product', 'error');
    return;
  }
  showToast(`${name} removed`, 'success');
  loadProducts();
}

function addToCart(productId, name, price) {
  const existing = cart.find(i => i.productId === productId);
  if (existing) existing.qty++;
  else cart.push({ productId, name, price: Number(price), qty: 1 });
  updateCartDisplay();
}

function addToCartQty(productId, name, price, cardId) {
  const existing = cart.find(i => i.productId === productId);
  if (!existing) {
    cart.push({ productId, name, price: Number(price), qty: 1, cardId });
  } else {
    existing.qty++;
  }
  updateCartDisplay();
  renderProductCartArea(productId, name, price, cardId);
  showToast(`${name} added to cart`);
}

function changeProductQty(productId, delta, name, price, cardId) {
  const item = cart.find(i => i.productId === productId);
  if (!item) return;
  item.qty += delta;
  if (item.qty <= 0) {
    cart = cart.filter(i => i.productId !== productId);
    renderProductCartArea(productId, name, price, cardId, 0);
  } else {
    renderProductCartArea(productId, name, price, cardId, item.qty);
  }
  updateCartDisplay();
}

function renderProductCartArea(productId, name, price, cardId, qty) {
  const area = document.getElementById('cart-area-' + cardId);
  if (!area) return;
  const currentQty = qty !== undefined ? qty : (cart.find(i => i.productId === productId)?.qty || 0);
  if (currentQty === 0) {
    area.innerHTML = `
      <button class="btn btn-primary product-add-btn" onclick="addToCartQty('${escHtml(productId)}','${escHtml(name)}',${price},'${cardId}')">
        <i class="fa-solid fa-cart-plus"></i> Add to Cart
      </button>`;
  } else {
    area.innerHTML = `
      <div class="product-qty-control">
        <button class="qty-btn qty-minus" onclick="changeProductQty('${escHtml(productId)}',-1,'${escHtml(name)}',${price},'${cardId}')">
          <i class="fa-solid fa-minus"></i>
        </button>
        <span class="qty-value">${currentQty}</span>
        <button class="qty-btn qty-plus" onclick="changeProductQty('${escHtml(productId)}',1,'${escHtml(name)}',${price},'${cardId}')">
          <i class="fa-solid fa-plus"></i>
        </button>
      </div>`;
  }
}

function updateCartDisplay() {
  const indicator = document.getElementById('cartIndicator');
  if (!indicator) return;
  if (!cart.length) { indicator.style.display = 'none'; return; }
  indicator.style.display = 'flex';
  const totalItems = cart.reduce((s, i) => s + i.qty, 0);
  const totalPrice = cart.reduce((s, i) => s + i.price * i.qty, 0);
  setEl('cartCount', totalItems);
  setEl('cartTotalDisplay', '$' + totalPrice.toFixed(2));
}

function openCheckout() {
  if (!cart.length) return;
  const total      = cart.reduce((s, i) => s + i.price * i.qty, 0);
  currentPayDoc    = 'Shop Order';
  currentPayPrice  = total.toFixed(2);
  currentPaySlot   = '';
  pendingDelivery  = null;

  resetPaymentModal();
  renderOrderSummaryStep();
  goToCheckoutStep('pay-step-summary');
  document.getElementById('paymentModal').style.display = 'flex';
}

// Backwards-compat for any old links — routes through new flow.
function confirmDelivery() { deliveryContinue(); }

// ── Doctor Booking ─────────────────────────────────────────────
const SPECIALIZATIONS = [
  { name:'Cardiology & Critical Care', icon:'fa-solid fa-heart-pulse'   },
  { name:'General Medicine',           icon:'fa-solid fa-user-doctor'   },
  { name:'Internal Medicine',          icon:'fa-solid fa-stethoscope'   },
  { name:'Neurology',                  icon:'fa-solid fa-brain'         },
  { name:'Pulmonology',                icon:'fa-solid fa-lungs'         },
  { name:'Emergency Medicine',         icon:'fa-solid fa-truck-medical' },
  { name:'Dermatology',                icon:'fa-solid fa-hand-dots'     },
  { name:'Orthopedics',                icon:'fa-solid fa-bone'          },
  { name:'Pediatrics',                 icon:'fa-solid fa-baby'          },
  { name:'Ophthalmology',              icon:'fa-solid fa-eye'           },
  { name:'Fitness Coaching',           icon:'fa-solid fa-dumbbell'      },
];

const DOCTORS_DATA = [
  { name:'Dr. Ramy Fouad',    spec:'Cardiology & Critical Care', price:280, rating:4.7, location:'Maadi, Cairo',       phone:'+20 111 234 5670', role:'doctor' },
  { name:'Dr. Dina Saad',     spec:'Cardiology & Critical Care', price:320, rating:4.8, location:'New Cairo',           phone:'+20 122 345 6781', role:'doctor' },
  { name:'Dr. Sara Hossam',   spec:'General Medicine',           price:150, rating:4.7, location:'Maadi, Cairo',       phone:'+20 111 333 5678', role:'doctor' },
  { name:'Dr. Amr Youssef',   spec:'General Medicine',           price:130, rating:4.5, location:'Heliopolis, Cairo',  phone:'+20 100 444 6789', role:'doctor' },
  { name:'Dr. Ahmed Nabil',   spec:'Internal Medicine',          price:200, rating:4.6, location:'Heliopolis, Cairo',  phone:'+20 122 444 9900', role:'doctor' },
  { name:'Dr. Hossam Refaat', spec:'Internal Medicine',          price:220, rating:4.8, location:'Downtown, Cairo',    phone:'+20 100 556 1234', role:'doctor' },
  { name:'Dr. Nour El-Din',   spec:'Neurology',                  price:350, rating:4.8, location:'New Cairo',           phone:'+20 100 777 1122', role:'doctor' },
  { name:'Dr. Tarek Mansour', spec:'Neurology',                  price:330, rating:4.7, location:'Nasr City, Cairo',   phone:'+20 111 888 2233', role:'doctor' },
  { name:'Dr. Mona Tarek',    spec:'Pulmonology',                price:250, rating:4.5, location:'6th October City',   phone:'+20 112 888 3344', role:'doctor' },
  { name:'Dr. Sherif Hamdy',  spec:'Pulmonology',                price:270, rating:4.7, location:'New Cairo',           phone:'+20 100 112 4455', role:'doctor' },
  { name:'Dr. Karim Samir',   spec:'Emergency Medicine',         price:180, rating:4.7, location:'Downtown, Cairo',    phone:'+20 100 999 5566', role:'doctor' },
  { name:'Dr. Noha Saber',    spec:'Emergency Medicine',         price:200, rating:4.8, location:'Maadi, Cairo',       phone:'+20 100 445 7788', role:'doctor' },
  { name:'Dr. Hana Fahmy',    spec:'Dermatology',                price:220, rating:4.6, location:'Zamalek, Cairo',     phone:'+20 111 000 7788', role:'doctor' },
  { name:'Dr. Mira Adel',     spec:'Dermatology',                price:240, rating:4.8, location:'New Cairo',           phone:'+20 122 556 8899', role:'doctor' },
  { name:'Dr. Omar Saleh',    spec:'Orthopedics',                price:280, rating:4.8, location:'Nasr City, Cairo',   phone:'+20 122 111 8899', role:'doctor' },
  { name:'Dr. Islam Khairy',  spec:'Orthopedics',                price:300, rating:4.7, location:'Heliopolis, Cairo',  phone:'+20 111 778 0011', role:'doctor' },
  { name:'Dr. Rana Mostafa',  spec:'Pediatrics',                 price:160, rating:4.9, location:'Maadi, Cairo',       phone:'+20 100 222 9900', role:'doctor' },
  { name:'Dr. Farah Mahmoud', spec:'Pediatrics',                 price:170, rating:4.8, location:'Zamalek, Cairo',     phone:'+20 111 101 3344', role:'doctor' },
  { name:'Dr. Sameh Adel',    spec:'Ophthalmology',              price:200, rating:4.5, location:'Heliopolis, Cairo',  phone:'+20 111 333 0011', role:'doctor' },
  { name:'Dr. Ghada Tawfik',  spec:'Ophthalmology',              price:220, rating:4.7, location:'Nasr City, Cairo',   phone:'+20 100 212 4455', role:'doctor' },
  { name:'Coach Ahmed Ramzy', spec:'Fitness Coaching',           price:150, rating:4.8, location:'New Cairo',           phone:'+20 100 500 1234', role:'coach'  },
  { name:'Coach Lina Hassan', spec:'Fitness Coaching',           price:120, rating:4.7, location:'Maadi, Cairo',       phone:'+20 111 600 5678', role:'coach'  },
];

const DOCTOR_SLOTS = ['9:00 AM','10:00 AM','11:30 AM','1:00 PM','3:00 PM','5:00 PM'];

function buildSpecGrid() {
  const grid = document.getElementById('specGrid');
  if (!grid) return;
  grid.innerHTML = SPECIALIZATIONS.map(s => `
    <div class="spec-card" onclick="selectSpec('${escHtml(s.name)}')">
      <i class="${s.icon}"></i>
      ${escHtml(s.name)}
    </div>`).join('');
  setDisplay('spec-section',    'block');
  setDisplay('doctors-section', 'none');
}

function selectSpec(specName) {
  setDisplay('spec-section',    'none');
  setDisplay('doctors-section', 'block');
  setEl('specTitle', specName + ' Specialists');
  const grid = document.getElementById('doctorsGrid');
  if (!grid) return;
  const docs = DOCTORS_DATA.filter(d => d.spec === specName);
  if (!docs.length) {
    grid.innerHTML = '<p style="color:var(--text-muted);grid-column:1/-1">No specialists found for this category.</p>';
    return;
  }
  grid.innerHTML = docs.map(doc => buildDoctorCardHTML(doc)).join('');
}

function buildDoctorCardHTML(doc) {
  const cardId = 'doc-' + doc.name.replace(/[\s.']/g, '');
  const stars  = '★'.repeat(Math.floor(doc.rating)) + '☆'.repeat(5 - Math.floor(doc.rating));
  const price  = currentPayIsEmergency ? Math.round(doc.price * 1.75) : doc.price;
  const today  = new Date().toISOString().split('T')[0];
  const maxDateStr = (() => {
    const d = new Date(); d.setDate(d.getDate() + 60);
    return d.toISOString().split('T')[0];
  })();

  return `
    <div class="doctor-card" id="${cardId}">
      <div class="doctor-card-header">
        <div class="doctor-avatar"><i class="fa-solid ${doc.role === 'coach' ? 'fa-dumbbell' : 'fa-user-doctor'}"></i></div>
        <div>
          <div class="doctor-name">${escHtml(doc.name)}</div>
          <div class="doctor-spec">${escHtml(doc.spec)}</div>
        </div>
      </div>
      <div class="doctor-meta">
        <span><i class="fa-solid fa-location-dot" style="margin-right:5px;color:var(--text-muted)"></i>${escHtml(doc.location)}</span>
        <span class="doctor-price">
          EGP ${price}
          ${currentPayIsEmergency ? '<span style="font-size:0.72rem;font-weight:700;color:var(--danger);margin-left:4px">EMERGENCY</span>' : ''}
        </span>
      </div>
      <div class="doctor-rating">${stars} <span>${doc.rating} / 5</span></div>

      <div class="booking-step-label">
        <span class="booking-step-num">1</span>
        <i class="fa-regular fa-calendar"></i> Choose a date
      </div>
      <input type="date" class="form-input booking-date-input"
        id="date-${cardId}"
        min="${today}" max="${maxDateStr}"
        onchange="onBookingDateChange('${cardId}', this.value)">

      <div class="booking-step-label">
        <span class="booking-step-num">2</span>
        <i class="fa-regular fa-clock"></i> Choose a time
      </div>
      <div class="slots-row" id="slots-${cardId}">
        ${DOCTOR_SLOTS.map(s => `<button class="slot-btn" disabled onclick="selectSlot(this,'${cardId}')">${s}</button>`).join('')}
      </div>
      <div class="slot-selected-text" id="slot-${cardId}"></div>

      <div class="doctor-actions">
        <button class="btn ${currentPayIsEmergency ? 'btn-emergency' : 'btn-primary'}" id="bookBtn-${cardId}" disabled
          onclick="openPayment('${escHtml(doc.name)}',${price},'${cardId}','${doc.role || 'doctor'}')">
          <i class="fa-solid fa-calendar-check"></i>
          ${currentPayIsEmergency ? 'Emergency Book' : 'Book Now'}
        </button>
        <button class="btn btn-outline" onclick="window.open('tel:${escHtml(doc.phone)}')">
          <i class="fa-solid fa-phone"></i> Call
        </button>
      </div>
    </div>`;
}

async function onBookingDateChange(cardId, date) {
  if (!date) return;
  const d = new Date(date);
  const today = new Date(); today.setHours(0,0,0,0);
  if (d < today) {
    showToast('Date cannot be in the past', 'warning');
    document.getElementById('date-' + cardId).value = '';
    return;
  }
  selectedSlots[cardId] = { date, time: selectedSlots[cardId]?.time || '' };

  // Clear previous slot selection
  document.querySelectorAll(`#slots-${cardId} .slot-btn`).forEach(b => {
    b.disabled = true;
    b.classList.remove('selected', 'slot-booked');
    b.title = '';
  });

  // Find the doctor name from this card's heading
  const card = document.getElementById(cardId);
  const docName = card?.querySelector('.doctor-name')?.textContent?.trim() || '';

  // Fetch booked slots for this doctor+date
  let bookedSlots = [];
  if (docName) {
    const res = await apiCall('GET', `/available-slots?doctor_name=${encodeURIComponent(docName)}&date=${encodeURIComponent(date)}`);
    if (res.ok) bookedSlots = res.data?.bookedSlots || [];
  }

  // Enable available slots, mark booked ones
  document.querySelectorAll(`#slots-${cardId} .slot-btn`).forEach(b => {
    const slotTime = b.textContent.trim();
    if (bookedSlots.includes(slotTime)) {
      b.disabled = true;
      b.classList.add('slot-booked');
      b.title = 'Already booked';
    } else {
      b.disabled = false;
    }
  });

  updateBookingButton(cardId);
}

function selectSlot(btn, cardId) {
  if (btn.disabled) return;
  document.querySelectorAll(`#slots-${cardId} .slot-btn`).forEach(b => b.classList.remove('selected'));
  btn.classList.add('selected');
  const time = btn.textContent.trim();
  selectedSlots[cardId] = { date: selectedSlots[cardId]?.date || '', time };
  const label = document.getElementById('slot-' + cardId);
  const dateStr = selectedSlots[cardId].date
    ? new Date(selectedSlots[cardId].date).toLocaleDateString(undefined, { weekday: 'short', month: 'short', day: 'numeric' })
    : '';
  if (label) label.textContent = dateStr ? `✓ ${dateStr} at ${time}` : `✓ ${time}`;
  updateBookingButton(cardId);
}

function updateBookingButton(cardId) {
  const sel = selectedSlots[cardId];
  const btn = document.getElementById('bookBtn-' + cardId);
  if (!btn) return;
  btn.disabled = !(sel && sel.date && sel.time);
}

function resetSpecSelection() {
  setDisplay('spec-section',    'block');
  setDisplay('doctors-section', 'none');
}

// ── Payment ────────────────────────────────────────────────────
function openPayment(docName, price, cardId, profRole) {
  const sel = selectedSlots[cardId];
  if (!sel || !sel.date || !sel.time) {
    showToast('Please select both a date and a time first.', 'warning');
    return;
  }
  if (!currentUser) { openModal('login'); return; }

  // Gym memberships are never emergency bookings.
  if (profRole === 'gym') currentPayIsEmergency = false;

  currentPayDoc    = docName;
  currentPayPrice  = price;
  currentPaySlot   = sel.time;
  currentPayDate   = sel.date;
  currentPayDocId  = null;

  resetPaymentModal();
  document.getElementById('payDocInfo').textContent  = `${docName} · EGP ${price}`;
  const dateStr = new Date(sel.date).toLocaleDateString(undefined, { weekday: 'long', month: 'long', day: 'numeric' });
  document.getElementById('paySlotInfo').textContent = `📅 ${dateStr} at ${sel.time}`;

  const emgBadge = document.getElementById('payEmergencyBadge');
  if (emgBadge) emgBadge.style.display = currentPayIsEmergency ? 'inline-flex' : 'none';

  setDisplay('pay-step-1', 'block');
  document.getElementById('paymentModal').style.display = 'flex';
}

function closePaymentModal() {
  document.getElementById('paymentModal').style.display = 'none';
  resetPaymentModal();
}

function resetPaymentModal() {
  ['pay-step-summary','pay-step-1','pay-step-delivery','pay-step-shop-pay',
   'pay-step-visa','pay-step-cash','pay-step-success']
    .forEach(id => setDisplay(id, 'none'));
}

async function selectPayment(method) {
  const isShop = currentPayDoc === 'Shop Order';

  if (!isShop) {
    const bookingData = {
      doctor_name:       currentPayDoc,
      date:              currentPayDate || new Date().toISOString().split('T')[0],
      time_slot:         currentPaySlot,
      payment_method:    method,
      fee:               parseInt(currentPayPrice) || 0,
      booking_type:      currentPayIsEmergency ? 'emergency' : 'regular',
    };
    if (currentPayDocId) bookingData.doctor_id = currentPayDocId;

    const result = await apiCall('POST', '/booking', bookingData);
    if (!result.ok) {
      showToast(result.data?.message || 'Booking failed. Please try again.', 'error');
      return;
    }
  }

  setDisplay('pay-step-1', 'none');

  if (method === 'cash') {
    document.getElementById('cashConfirmText').textContent = isShop
      ? `Your order is confirmed. Total: $${currentPayPrice}.`
      : `Appointment with ${currentPayDoc} confirmed for ${currentPayDate ? new Date(currentPayDate).toLocaleDateString() : 'today'} at ${currentPaySlot}. Total: EGP ${currentPayPrice}.`;
    setDisplay('pay-step-cash', 'block');
    if (isShop) { cart = []; updateCartDisplay(); }
  } else {
    document.getElementById('visaAmountText').textContent = isShop ? `Total: $${currentPayPrice}` : `Total: EGP ${currentPayPrice}`;
    setDisplay('pay-step-visa', 'block');
  }
}

async function processVisaPayment() {
  const ok = validateAll([
    { id: 'visaCard',   rules: [Validators.cardNumber] },
    { id: 'visaExpiry', rules: [Validators.cardExpiry] },
    { id: 'visaCvv',    rules: [Validators.cardCvv] },
    { id: 'visaName',   rules: [Validators.name] },
  ]);
  if (!ok) { showToast('Please correct the card details.', 'warning'); return; }

  // For shop orders, place the order now (after card details).
  if (currentPayDoc === 'Shop Order') {
    const result = await placeShopOrder('visa');
    if (!result.ok) { showToast(result.message, 'error'); return; }
    cart = [];
    updateCartDisplay();
  }

  setDisplay('pay-step-visa', 'none');
  setEl('successText', currentPayDoc === 'Shop Order'
    ? `Payment of $${currentPayPrice} confirmed. Your order is on its way!`
    : `Payment of EGP ${currentPayPrice} confirmed. Appointment with ${currentPayDoc} at ${currentPaySlot}.`);
  setDisplay('pay-step-success', 'block');
}

function formatCardNumber(el) {
  let v = el.value.replace(/\D/g,'').substring(0,16);
  el.value = v.match(/.{1,4}/g)?.join(' ') || v;
}
function formatExpiry(el) {
  let v = el.value.replace(/\D/g,'');
  if (v.length >= 2) v = v.substring(0,2) + '/' + v.substring(2,4);
  el.value = v;
}

// ── Professional Dashboard ──────────────────────────────────────
const COACH_CLIENTS = [
  { name:'Omar Rayan',  goal:'Muscle Gain',  level:'High',   diet:'Healthy', bmi:22.4, bmiLabel:'Normal',     bmiColor:'var(--primary)',   location:'Gym'  },
  { name:'Layla Amer',  goal:'Fat Loss',     level:'Medium', diet:'Average', bmi:27.8, bmiLabel:'Overweight', bmiColor:'var(--warning)',   location:'Home' },
  { name:'Mike Ross',   goal:'Fat Loss',     level:'Low',    diet:'Poor',    bmi:31.2, bmiLabel:'Obese',      bmiColor:'var(--danger)',    location:'Gym'  },
  { name:'Dina Tarek',  goal:'General',      level:'Medium', diet:'Healthy', bmi:21.0, bmiLabel:'Normal',     bmiColor:'var(--secondary)', location:'Home' },
];

function buildProfessionalDashboard() {
  const isDoctor = currentUser?.role === 'doctor';
  const name     = currentUser?.name || 'Professional';
  setEl('profDashTitle',    isDoctor ? `Dr. ${name}'s Panel`    : `Coach ${name}'s Panel`);
  setEl('profDashSubtitle', isDoctor ? 'Patient records and appointments.' : 'Client fitness management console.');
  setEl('profStatLabel',    isDoctor ? 'Total Patients'         : 'Total Clients');
  setEl('profStatCount',    isDoctor ? '3'                      : '4');
  setEl('profStatBookings', isDoctor ? '8'                      : '12');
  setEl('profStatCritical', isDoctor ? '1'                      : '0');
  setDisplay('doctor-panel', isDoctor ? 'block' : 'none');
  setDisplay('coach-panel',  isDoctor ? 'none'  : 'block');
  if (isDoctor) buildPatientTable();
  else buildCoachClients();
}

function buildPatientTable() {
  const tbody = document.getElementById('patientTableBody');
  if (!tbody) return;
  const patients = [
    { name:'Ahmed Salem', sync:'2 mins ago',  status:'Critical', activity:'Low',      btn:'View Vitals'  },
    { name:'Sara Hassan', sync:'1 hour ago',  status:'Stable',   activity:'Moderate', btn:'View History' },
    { name:'John Doe',    sync:'5 hours ago', status:'Stable',   activity:'High',     btn:'View History' },
  ];
  tbody.innerHTML = patients.map(p => {
    const bc = p.status === 'Critical' ? 'badge-red' : 'badge-green';
    return `<tr>
      <td><strong>${escHtml(p.name)}</strong></td>
      <td style="color:var(--text-muted)">${escHtml(p.sync)}</td>
      <td><span class="badge ${bc}">${escHtml(p.status)}</span></td>
      <td>${escHtml(p.activity)}</td>
      <td><button class="btn btn-outline btn-sm" onclick="showToast('Feature coming soon','info')">${escHtml(p.btn)}</button></td>
    </tr>`;
  }).join('');
}

function buildCoachClients() {
  const grid = document.getElementById('coachClientsGrid');
  if (!grid) return;
  grid.innerHTML = COACH_CLIENTS.map(c => `
    <div class="client-card">
      <div class="client-name">${escHtml(c.name)}</div>
      <div class="client-detail"><span>Goal</span><span>${escHtml(c.goal)}</span></div>
      <div class="client-detail"><span>Activity</span><span>${escHtml(c.level)}</span></div>
      <div class="client-detail"><span>Diet</span><span>${escHtml(c.diet)}</span></div>
      <div class="client-detail"><span>BMI</span><span style="color:${c.bmiColor};font-weight:700">${c.bmi} — ${escHtml(c.bmiLabel)}</span></div>
      <div class="client-detail"><span>Location</span><span>${escHtml(c.location)}</span></div>
    </div>`).join('');
}

// ── Admin Dashboard ───────────────────────────────────────────
function showAdminDashboard() {
  if (!currentUser) { openModal('login'); return; }
  showView('admin');
  loadAdminData();
}

async function loadAdminData() {
  const setKpi = (id, val) => { const el = document.getElementById(id); if (el) el.textContent = val; };
  setKpi('kpiUsers',    '…');
  setKpi('kpiBookings', '…');
  setKpi('kpiOrders',   '…');
  setKpi('kpiRevenue',  '…');

  const result = await apiCall('GET', '/admin');
  if (!result.ok) {
    showToast('Failed to load admin data', 'error');
    return;
  }
  const d = result.data?.data;
  if (!d) return;

  const { stats, roleBreakdown, statusBreakdown, recentUsers, recentBookings, recentOrders } = d;

  setKpi('kpiUsers',    stats.totalUsers);
  setKpi('kpiBookings', stats.totalBookings);
  setKpi('kpiOrders',   stats.totalOrders);
  setKpi('kpiRevenue',  '$' + Number(stats.totalRevenue || 0).toFixed(2));

  // Role breakdown bars
  const roleEl = document.getElementById('adminRoleBreakdown');
  if (roleEl) {
    const total = Math.max(stats.totalUsers, 1);
    const roleColors = { patient: '#8b5cf6', doctor: '#2563eb', coach: '#10b981' };
    roleEl.innerHTML = Object.entries(roleBreakdown || {}).map(([role, count]) => `
      <div class="admin-role-row">
        <span class="admin-role-label">${ucFirst(role)}</span>
        <div class="admin-role-bar-wrap">
          <div class="admin-role-bar" style="width:${Math.round((count/total)*100)}%;background:${roleColors[role]||'#94a3b8'}"></div>
        </div>
        <span class="admin-role-count">${count}</span>
      </div>`).join('');
  }

  // Status breakdown bars
  const statusEl = document.getElementById('adminStatusBreakdown');
  if (statusEl) {
    const total = Math.max(stats.totalBookings, 1);
    const statusColors = { confirmed:'#10b981', pending:'#f59e0b', cancelled:'#ef4444', completed:'#2563eb' };
    statusEl.innerHTML = Object.entries(statusBreakdown || {}).map(([status, count]) => `
      <div class="admin-role-row">
        <span class="admin-role-label">${ucFirst(status)}</span>
        <div class="admin-role-bar-wrap">
          <div class="admin-role-bar" style="width:${Math.round((count/total)*100)}%;background:${statusColors[status]||'#94a3b8'}"></div>
        </div>
        <span class="admin-role-count">${count}</span>
      </div>`).join('');
  }

  // Recent users table
  const usersTable = document.getElementById('adminUsersTable');
  if (usersTable) {
    usersTable.innerHTML = (recentUsers || []).map(u => `
      <tr>
        <td><strong>${escHtml(u.name || '—')}</strong></td>
        <td style="color:var(--text-muted)">${escHtml(u.email || '—')}</td>
        <td><span class="admin-badge admin-badge-${u.role || 'patient'}">${ucFirst(u.role || 'patient')}</span></td>
        <td style="color:var(--text-muted)">${u.created_at ? new Date(u.created_at).toLocaleDateString() : '—'}</td>
      </tr>`).join('') || '<tr><td colspan="4" style="color:var(--text-muted);text-align:center">No users yet</td></tr>';
  }

  // Recent bookings table
  const bookingsTable = document.getElementById('adminBookingsTable');
  if (bookingsTable) {
    bookingsTable.innerHTML = (recentBookings || []).map(b => `
      <tr>
        <td><strong>${escHtml(b.doctor_name || '—')}</strong></td>
        <td>${b.date ? new Date(b.date).toLocaleDateString() : '—'}</td>
        <td style="color:var(--text-muted)">${escHtml(b.time_slot || '—')}</td>
        <td><span class="admin-badge admin-badge-${b.status || 'pending'}">${ucFirst(b.status || 'pending')}</span></td>
        <td>${b.fee ? 'EGP ' + b.fee : '—'}</td>
      </tr>`).join('') || '<tr><td colspan="5" style="color:var(--text-muted);text-align:center">No bookings yet</td></tr>';
  }

  // Recent orders table
  const ordersTable = document.getElementById('adminOrdersTable');
  if (ordersTable) {
    ordersTable.innerHTML = (recentOrders || []).map(o => `
      <tr>
        <td style="color:var(--text-muted);font-size:0.75rem">${escHtml((o.id || '').substring(0, 8))}…</td>
        <td><strong>$${Number(o.total_amount || 0).toFixed(2)}</strong></td>
        <td>${ucFirst(escHtml(o.payment_method || '—'))}</td>
        <td><span class="admin-badge admin-badge-${o.payment_status || 'pending'}">${ucFirst(o.payment_status || 'pending')}</span></td>
        <td style="color:var(--text-muted)">${o.created_at ? new Date(o.created_at).toLocaleDateString() : '—'}</td>
      </tr>`).join('') || '<tr><td colspan="5" style="color:var(--text-muted);text-align:center">No orders yet</td></tr>';
  }
}

// ── Toast Notifications ────────────────────────────────────────
function showToast(msg, type = 'success') {
  const colors = { success:'#10b981', error:'#ef4444', warning:'#f59e0b', info:'#2563eb' };
  const toast  = document.createElement('div');
  toast.style.cssText = `
    position:fixed;bottom:24px;right:24px;z-index:9999;
    background:${colors[type]||colors.success};color:white;
    padding:12px 20px;border-radius:10px;font-size:0.875rem;
    font-weight:500;font-family:inherit;box-shadow:0 8px 24px rgba(0,0,0,0.15);
    max-width:320px;animation:fadeInUp 0.2s ease;`;
  toast.textContent = msg;
  document.body.appendChild(toast);
  setTimeout(() => toast.remove(), 3500);
}

// ── Utility ────────────────────────────────────────────────────
function escHtml(str) {
  if (!str && str !== 0) return '';
  return String(str)
    .replace(/&/g,'&amp;')
    .replace(/</g,'&lt;')
    .replace(/>/g,'&gt;')
    .replace(/"/g,'&quot;')
    .replace(/'/g,'&#39;');
}
function setEl(id, text) { const el = document.getElementById(id); if (el) el.textContent = text; }
function showEl(id)      { const el = document.getElementById(id); if (el) el.style.display = ''; }
function setDisplay(id, v) { const el = document.getElementById(id); if (el) el.style.display = v; }
function getVal(id)      { return document.getElementById(id)?.value || ''; }
function setVal(id, v)   { const el = document.getElementById(id); if (el) el.value = v; }
function ucFirst(s)      { if (!s) return ''; return s.charAt(0).toUpperCase() + s.slice(1); }

// ── Assessment Result Modal (auto-popup on consult complete) ──
function openAssessmentModal(assessment) {
  if (!assessment) return;
  const modal = document.getElementById('assessmentModal');
  if (!modal) return;

  document.getElementById('assessmentTitle').textContent = assessment.condition || 'Health Assessment';
  document.getElementById('assessmentOverview').textContent = assessment.overview || '';

  const referralBanner = document.getElementById('assessmentReferral');
  const referralText   = document.getElementById('assessmentReferralText');
  const medsHeading    = document.querySelector('#assessmentMedsSection h3');
  const needsSpecialist = !!assessment.specialistNeeded
    || (assessment.severity || '').toLowerCase() === 'severe'
    || (assessment.urgency || '').toLowerCase() === 'immediate';

  if (needsSpecialist) {
    const specialty = assessment.specialistNeeded || 'General Medicine';
    pendingReferralSpecialty = specialty;
    referralBanner.style.display = 'flex';
    referralText.textContent = `Based on what you've described, you should see a ${specialty} specialist in person. We'll route you straight to available doctors.`;
    if (medsHeading) medsHeading.innerHTML = '<i class="fa-solid fa-pills"></i> Symptomatic Relief Until You See a Doctor';
  } else {
    pendingReferralSpecialty = null;
    referralBanner.style.display = 'none';
    if (medsHeading) medsHeading.innerHTML = '<i class="fa-solid fa-pills"></i> Prescribed Medications';
  }

  const severityEl = document.getElementById('assessmentSeverity');
  const sev = (assessment.severity || 'mild').toLowerCase();
  severityEl.textContent = `Severity: ${sev.charAt(0).toUpperCase() + sev.slice(1)}`;
  severityEl.className = `assessment-badge severity-${sev}`;

  const urgencyEl = document.getElementById('assessmentUrgency');
  const urg = (assessment.urgency || 'routine').toLowerCase();
  urgencyEl.textContent = assessment.urgencyText || `Urgency: ${urg.charAt(0).toUpperCase() + urg.slice(1)}`;
  urgencyEl.className = `assessment-badge urgency-${urg}`;

  const medsWrap = document.getElementById('assessmentMeds');
  const medsSection = document.getElementById('assessmentMedsSection');
  medsWrap.innerHTML = '';
  if (assessment.medications && assessment.medications.length) {
    medsSection.style.display = '';
    assessment.medications.forEach(m => {
      const card = document.createElement('div');
      card.className = 'med-card ' + (m.type === 'prescription' ? 'med-rx' : 'med-otc');
      card.innerHTML = `
        <div class="med-card-head">
          <strong>${escHtml(m.name || '')}</strong>
          <span class="med-tag">${m.type === 'prescription' ? 'Prescription' : 'Over-the-counter'}</span>
        </div>
        <div class="med-grid">
          ${m.dosage    ? `<div><span>Dosage</span><strong>${escHtml(m.dosage)}</strong></div>` : ''}
          ${m.frequency ? `<div><span>Frequency</span><strong>${escHtml(m.frequency)}</strong></div>` : ''}
          ${m.duration  ? `<div><span>Duration</span><strong>${escHtml(m.duration)}</strong></div>` : ''}
        </div>
        ${m.instructions ? `<p class="med-notes">${escHtml(m.instructions)}</p>` : ''}`;
      medsWrap.appendChild(card);
    });
  } else {
    medsSection.style.display = 'none';
  }

  fillList('assessmentRemedies',  assessment.homeRemedies, 'assessmentRemediesSection');
  fillList('assessmentLifestyle', assessment.lifestyle,    'assessmentLifestyleSection');
  fillList('assessmentWarnings',  assessment.warnings,     'assessmentWarningsSection');

  const followUp        = document.getElementById('assessmentFollowUp');
  const followUpSection = document.getElementById('assessmentFollowUpSection');
  if (assessment.followUp) {
    followUp.textContent = assessment.followUp;
    followUpSection.style.display = '';
  } else {
    followUpSection.style.display = 'none';
  }

  modal.style.display = 'flex';
  document.body.style.overflow = 'hidden';
}

function closeAssessmentModal() {
  const modal = document.getElementById('assessmentModal');
  if (modal) modal.style.display = 'none';
  document.body.style.overflow = '';
}

function fillList(listId, items, sectionId) {
  const ul      = document.getElementById(listId);
  const section = document.getElementById(sectionId);
  if (!ul) return;
  ul.innerHTML = '';
  if (items && items.length) {
    items.forEach(item => {
      const li = document.createElement('li');
      li.textContent = item;
      ul.appendChild(li);
    });
    if (section) section.style.display = '';
  } else if (section) {
    section.style.display = 'none';
  }
}

function bookFromAssessment() {
  closeAssessmentModal();
  showBookDoctor();
  if (pendingReferralSpecialty) {
    setTimeout(() => {
      const match = SPECIALIZATIONS.find(s => s.name === pendingReferralSpecialty);
      if (match) selectSpec(match.name);
    }, 50);
  }
}

// ── Multi-step shop checkout ──────────────────────────────────
function goToCheckoutStep(stepId) {
  resetPaymentModal();
  setDisplay(stepId, 'block');
}

function renderOrderSummaryStep() {
  const list = document.getElementById('orderSummaryList');
  if (!list) return;
  list.innerHTML = '';
  cart.forEach(item => {
    const row = document.createElement('div');
    row.className = 'order-summary-row';
    row.innerHTML = `
      <div class="osr-main">
        <strong>${escHtml(item.name)}</strong>
        <span>$${item.price.toFixed(2)} × ${item.qty}</span>
      </div>
      <div class="osr-price">$${(item.price * item.qty).toFixed(2)}</div>`;
    list.appendChild(row);
  });
  const subtotal = cart.reduce((s, i) => s + i.price * i.qty, 0);
  setEl('orderSubtotal',   '$' + subtotal.toFixed(2));
  setEl('orderGrandTotal', '$' + subtotal.toFixed(2));
}

function summaryContinue() {
  if (!cart.length) { showToast('Your cart is empty', 'warning'); return; }
  goToCheckoutStep('pay-step-delivery');
}

function deliveryContinue() {
  const ok = validateAll([
    { id: 'deliveryName',    rules: [Validators.name] },
    { id: 'deliveryPhone',   rules: [Validators.phone] },
    { id: 'deliveryAddress', rules: [Validators.address] },
  ]);
  if (!ok) { showToast('Please correct the highlighted fields.', 'warning'); return; }

  const name    = getVal('deliveryName').trim();
  const phone   = getVal('deliveryPhone').trim();
  const address = getVal('deliveryAddress').trim();
  const notes   = getVal('deliveryNotes').trim();
  pendingDelivery = { name, phone, address, notes };
  setEl('shopPayTotal', `Total: $${(parseFloat(currentPayPrice) || 0).toFixed(2)}`);
  goToCheckoutStep('pay-step-shop-pay');
}

async function selectShopPayment(method) {
  if (method === 'cash') {
    const result = await placeShopOrder('cash');
    if (!result.ok) { showToast(result.message, 'error'); return; }
    cart = [];
    updateCartDisplay();
    setEl('cashConfirmText', `Your order has been placed! We'll deliver to ${pendingDelivery?.address || 'your address'}. Total: $${currentPayPrice}.`);
    goToCheckoutStep('pay-step-cash');
  } else {
    setEl('visaAmountText', `Total: $${currentPayPrice}`);
    goToCheckoutStep('pay-step-visa');
  }
}

async function placeShopOrder(paymentMethod) {
  if (!pendingDelivery) return { ok: false, message: 'Missing delivery info' };
  const payload = {
    items: cart.map(i => ({ productId: i.productId, productName: i.name, price: i.price, quantity: i.qty })),
    paymentMethod,
    deliveryName:    pendingDelivery.name,
    deliveryPhone:   pendingDelivery.phone,
    deliveryAddress: pendingDelivery.address + (pendingDelivery.notes ? ` — ${pendingDelivery.notes}` : ''),
  };
  const result = await apiCall('POST', '/orders', payload);
  if (!result.ok) return { ok: false, message: result.data?.message || 'Order failed. Please try again.' };
  return { ok: true, data: result.data };
}
