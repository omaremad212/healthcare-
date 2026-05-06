'use strict';

// ══════════════════════════════════════════════════════════════
//  HealthCare — Frontend Application
// ══════════════════════════════════════════════════════════════

// ── State ──────────────────────────────────────────────────────
let currentUser = null;
let conversationMessages = []; // { role: 'user'|'assistant', content: string }
let currentAssessment = null;
let cart = [];
let currentPayDoc = '';
let currentPayPrice = 0;
let currentPaySlot = '';
let selectedSlots = {};
let authMode = 'login'; // 'login' | 'register'

// Restore session from localStorage
(function init() {
  const stored = localStorage.getItem('hc_user');
  const token = localStorage.getItem('hc_token');
  if (stored && token) {
    try { currentUser = JSON.parse(stored); } catch (e) { /* ignore */ }
  }
  document.addEventListener('DOMContentLoaded', onDOMReady);
})();

// ── DOM Ready ──────────────────────────────────────────────────
function onDOMReady() {
  if (currentUser) {
    applyLoggedInUI();
  }
}

// ── API Helper ─────────────────────────────────────────────────
async function apiCall(method, path, body = null) {
  const headers = { 'Content-Type': 'application/json' };
  const token = localStorage.getItem('hc_token');
  if (token) headers['Authorization'] = `Bearer ${token}`;

  const opts = { method, headers };
  if (body) opts.body = JSON.stringify(body);

  const apiPath = path.startsWith('/') ? path : '/' + path;
  const url = `${window.location.origin}/api${apiPath}`;

  try {
    const res = await fetch(url, opts);
    const data = await res.json();
    return { ok: res.ok, status: res.status, data };
  } catch (err) {
    console.error('API error:', err);
    return { ok: false, status: 0, data: { message: 'Network error: ' + err.message } };
  }
}

// ── View Routing ───────────────────────────────────────────────
function showView(id) {
  const views = ['landing-view', 'chat-view', 'dashboard-view',
                 'shop-view', 'book-doctor-view', 'professional-dashboard'];
  views.forEach(v => {
    const el = document.getElementById(v);
    if (el) el.style.display = 'none';
  });
  const target = document.getElementById(id + '-view') || document.getElementById(id);
  if (target) {
    target.style.display = 'block';
    window.scrollTo(0, 0);
  }
  closeMobileNav();
}

function goHome() {
  showView('landing');
}

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
  if (!currentUser) {
    openModal('login');
    return;
  }
  showView('chat');
  if (conversationMessages.length === 0) {
    document.getElementById('chatWelcome').style.display = 'flex';
  }
}

function showShop() {
  showView('shop');
  loadProducts();
}

function showBookDoctor() {
  showView('book-doctor');
  buildSpecGrid();
}

// ── Auth UI ────────────────────────────────────────────────────
function openModal(mode) {
  authMode = mode;
  const isLogin = mode === 'login';
  document.getElementById('authModal').style.display = 'flex';
  document.getElementById('modalTitle').textContent = isLogin ? 'Welcome Back' : 'Create Account';
  document.getElementById('modalSubtitle').textContent = isLogin
    ? 'Sign in to your HealthCare account'
    : 'Join thousands who trust HealthCare';
  document.getElementById('nameField').style.display = isLogin ? 'none' : 'block';
  document.getElementById('roleField').style.display = isLogin ? 'none' : 'block';
  document.getElementById('authSubmitBtn').querySelector('#authBtnText').textContent = isLogin ? 'Sign In' : 'Create Account';
  document.getElementById('authSwitchText').textContent = isLogin ? "Don't have an account?" : 'Already have an account?';
  document.getElementById('authSwitchBtn').textContent = isLogin ? 'Create one' : 'Sign in';
  toggleRoleFields();
  hideAuthError();

  // Hide/show patient fields by default in register
  if (!isLogin) {
    document.getElementById('patientFields').style.display = 'block';
    document.getElementById('doctorFields').style.display = 'none';
    document.getElementById('coachFields').style.display = 'none';
  } else {
    document.getElementById('patientFields').style.display = 'none';
    document.getElementById('doctorFields').style.display = 'none';
    document.getElementById('coachFields').style.display = 'none';
  }
}

function closeAuthModal() {
  document.getElementById('authModal').style.display = 'none';
  setAuthLoading(false);
}

function toggleAuthMode() {
  openModal(authMode === 'login' ? 'register' : 'login');
}

function toggleRoleFields() {
  const role = document.getElementById('authRole')?.value || 'patient';
  const d = document.getElementById('doctorFields');
  const c = document.getElementById('coachFields');
  const p = document.getElementById('patientFields');
  if (d) d.style.display = role === 'doctor'  ? 'block' : 'none';
  if (c) c.style.display = role === 'coach'   ? 'block' : 'none';
  if (p) p.style.display = role === 'patient' ? 'block' : 'none';
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
  const btn = document.getElementById('authSubmitBtn');
  const txt = document.getElementById('authBtnText');
  const spin = document.getElementById('authBtnSpinner');
  if (btn) btn.disabled = loading;
  if (txt) txt.style.display = loading ? 'none' : 'inline';
  if (spin) spin.style.display = loading ? 'inline-block' : 'none';
}

async function handleAuth(event) {
  event.preventDefault();
  hideAuthError();
  setAuthLoading(true);

  const email = document.getElementById('authEmail').value.trim();
  const pass  = document.getElementById('authPass').value;
  const isLogin = authMode === 'login';

  if (!email || !pass) {
    showAuthError('Please fill in all required fields.');
    setAuthLoading(false);
    return;
  }
  if (pass.length < 6) {
    showAuthError('Password must be at least 6 characters.');
    setAuthLoading(false);
    return;
  }

  let result;
  if (isLogin) {
    result = await apiCall('POST', '/auth/login', { email, password: pass });
  } else {
    const name = document.getElementById('authName').value.trim();
    const role = document.getElementById('authRole')?.value || 'patient';
    if (!name) { showAuthError('Please enter your name.'); setAuthLoading(false); return; }
    const extra = {};
    if (role === 'patient') {
      extra.age    = document.getElementById('patientAge')?.value || null;
      extra.gender = document.getElementById('patientGender')?.value || null;
    } else if (role === 'doctor') {
      extra.specialization  = document.getElementById('docSpec')?.value || null;
      extra.yearsExperience = document.getElementById('docExp')?.value || null;
      extra.clinicAddress   = document.getElementById('docClinic')?.value || null;
    } else if (role === 'coach') {
      extra.trainingType    = document.getElementById('coachType')?.value || null;
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

  closeAuthModal();
  applyLoggedInUI();

  if (currentUser.role === 'doctor' || currentUser.role === 'coach') {
    buildProfessionalDashboard();
    showView('professional-dashboard');
  } else {
    showView('chat');
    if (conversationMessages.length === 0) {
      document.getElementById('chatWelcome').style.display = 'flex';
    }
  }
}

function applyLoggedInUI() {
  const name = currentUser?.name || 'User';
  const initial = name.charAt(0).toUpperCase();

  // Hide auth buttons, show user menu
  const navLogin  = document.getElementById('navLogin');
  const navSignup = document.getElementById('navSignup');
  if (navLogin)  navLogin.style.display  = 'none';
  if (navSignup) navSignup.style.display = 'none';
  const userMenu = document.getElementById('userMenu');
  if (userMenu) userMenu.style.display = 'block';

  // Populate user info
  setEl('userAvatar',      initial);
  setEl('userName',        name);
  setEl('dropdownAvatar',  initial);
  setEl('dropdownName',    name);
  setEl('menuEmail',       currentUser.email || '');

  // Show role-specific nav items
  if (currentUser.role === 'patient') {
    showEl('navShop');
    showEl('navChat');
    showEl('navDash');
    showEl('menuShopItem');
    showEl('menuChatItem');
    showEl('mobileNavShop');
    showEl('mobileNavChat');
    showEl('mobileNavDash');
  } else {
    showEl('navDash');
    showEl('mobileNavDash');
  }

  // Hide mobile auth buttons
  const mobileNavAuth = document.getElementById('mobileNavAuth');
  if (mobileNavAuth) mobileNavAuth.style.display = 'none';
}

function logout() {
  localStorage.removeItem('hc_token');
  localStorage.removeItem('hc_user');
  localStorage.removeItem('hc_chatbot_results');
  currentUser = null;
  conversationMessages = [];
  currentAssessment = null;
  window.location.reload();
}

// ── User Dropdown ──────────────────────────────────────────────
function toggleUserDropdown() {
  const dd = document.getElementById('userDropdown');
  const trigger = document.getElementById('userMenuTrigger');
  const isOpen = dd.classList.contains('open');
  dd.classList.toggle('open', !isOpen);
  trigger.setAttribute('aria-expanded', String(!isOpen));
  if (!isOpen) {
    document.addEventListener('click', closeUserDropdownOutside, { once: true });
  }
}
function closeUserDropdown() {
  const dd = document.getElementById('userDropdown');
  const trigger = document.getElementById('userMenuTrigger');
  if (dd) dd.classList.remove('open');
  if (trigger) trigger.setAttribute('aria-expanded', 'false');
}
function closeUserDropdownOutside(e) {
  const menu = document.getElementById('userMenu');
  if (menu && !menu.contains(e.target)) closeUserDropdown();
}

// ── Mobile Nav ─────────────────────────────────────────────────
function toggleMobileNav() {
  const nav = document.getElementById('mobileNav');
  const icon = document.getElementById('hamburgerIcon');
  const isOpen = nav.classList.contains('open');
  nav.classList.toggle('open', !isOpen);
  if (icon) icon.className = isOpen ? 'fa-solid fa-bars' : 'fa-solid fa-xmark';
}
function closeMobileNav() {
  const nav = document.getElementById('mobileNav');
  const icon = document.getElementById('hamburgerIcon');
  if (nav) nav.classList.remove('open');
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
  if (e.target.id === modalId) {
    if (modalId === 'authModal') closeAuthModal();
    if (modalId === 'paymentModal') closePaymentModal();
  }
}

// ── Chat Engine ────────────────────────────────────────────────
function quickStart(text) {
  const input = document.getElementById('chatInput');
  if (input) input.value = text;
  sendChatMessage();
}

async function sendChatMessage() {
  const input = document.getElementById('chatInput');
  if (!input) return;
  const text = input.value.trim();
  if (!text) return;

  if (!currentUser) {
    openModal('login');
    return;
  }

  input.value = '';
  autoResizeTextarea(input);

  // Hide welcome screen
  const welcome = document.getElementById('chatWelcome');
  if (welcome) welcome.style.display = 'none';

  // Add user message to UI and conversation
  appendChatMessage('user', text);
  conversationMessages.push({ role: 'user', content: text });

  // Disable input while waiting
  const sendBtn = document.getElementById('chatSendBtn');
  if (input) input.disabled = true;
  if (sendBtn) sendBtn.disabled = true;
  showTypingIndicator(true);

  const result = await apiCall('POST', '/chat', { messages: conversationMessages });

  showTypingIndicator(false);
  if (input) input.disabled = false;
  if (sendBtn) sendBtn.disabled = false;
  if (input) input.focus();

  if (!result.ok) {
    const errMsg = result.data?.message || 'Something went wrong. Please try again.';
    appendChatMessage('bot', errMsg);
    conversationMessages.push({ role: 'assistant', content: errMsg });
    return;
  }

  const { message, assessment, isComplete } = result.data;

  if (message) {
    appendChatMessage('bot', message);
    conversationMessages.push({ role: 'assistant', content: message });
  }

  if (isComplete && assessment) {
    currentAssessment = assessment;
    // Store for the dashboard
    const results = JSON.parse(localStorage.getItem('hc_chatbot_results') || '[]');
    results.unshift({ assessment, savedAt: new Date().toISOString() });
    localStorage.setItem('hc_chatbot_results', JSON.stringify(results.slice(0, 20)));

    // Auto-pop the assessment modal, plus leave a banner so it can be reopened
    setTimeout(() => {
      openAssessmentModal(assessment);
      showAssessmentReadyBanner();
    }, 500);
  }
}

function openAssessmentModal(assessment) {
  if (!assessment) return;
  const modal = document.getElementById('assessmentModal');
  if (!modal) return;

  document.getElementById('assessmentTitle').textContent = assessment.condition || 'Health Assessment';
  document.getElementById('assessmentOverview').textContent = assessment.overview || '';

  const severityEl = document.getElementById('assessmentSeverity');
  const sev = (assessment.severity || 'mild').toLowerCase();
  severityEl.textContent = `Severity: ${sev.charAt(0).toUpperCase() + sev.slice(1)}`;
  severityEl.className = `assessment-badge severity-${sev}`;

  const urgencyEl = document.getElementById('assessmentUrgency');
  const urg = (assessment.urgency || 'routine').toLowerCase();
  urgencyEl.textContent = assessment.urgencyText || `Urgency: ${urg.charAt(0).toUpperCase() + urg.slice(1)}`;
  urgencyEl.className = `assessment-badge urgency-${urg}`;

  // Medications
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
          <strong>${escapeHTML(m.name || '')}</strong>
          <span class="med-tag">${m.type === 'prescription' ? 'Prescription' : 'Over-the-counter'}</span>
        </div>
        <div class="med-grid">
          ${m.dosage ? `<div><span>Dosage</span><strong>${escapeHTML(m.dosage)}</strong></div>` : ''}
          ${m.frequency ? `<div><span>Frequency</span><strong>${escapeHTML(m.frequency)}</strong></div>` : ''}
          ${m.duration ? `<div><span>Duration</span><strong>${escapeHTML(m.duration)}</strong></div>` : ''}
        </div>
        ${m.instructions ? `<p class="med-notes">${escapeHTML(m.instructions)}</p>` : ''}
      `;
      medsWrap.appendChild(card);
    });
  } else {
    medsSection.style.display = 'none';
  }

  fillList('assessmentRemedies', assessment.homeRemedies, 'assessmentRemediesSection');
  fillList('assessmentLifestyle', assessment.lifestyle, 'assessmentLifestyleSection');
  fillList('assessmentWarnings', assessment.warnings, 'assessmentWarningsSection');

  const followUp = document.getElementById('assessmentFollowUp');
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
  const ul = document.getElementById(listId);
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

function escapeHTML(str) {
  return String(str).replace(/[&<>"']/g, c => (
    { '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]
  ));
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
    avatar.textContent = (currentUser?.name || 'U').charAt(0).toUpperCase();
  }

  const bubble = document.createElement('div');
  bubble.className = 'msg-bubble';
  bubble.textContent = text;

  msgEl.appendChild(avatar);
  msgEl.appendChild(bubble);
  container.appendChild(msgEl);
  container.scrollTop = container.scrollHeight;
}

function showAssessmentReadyBanner() {
  const container = document.getElementById('chatMessages');
  if (!container) return;

  const banner = document.createElement('div');
  banner.className = 'view-assessment-banner';
  banner.innerHTML = `
    <div>
      <strong>Your health assessment is ready</strong>
      <p>HealthCare has gathered enough information to provide a personalized assessment.</p>
    </div>
    <button class="btn btn-primary" onclick="viewAssessment()">
      <i class="fa-solid fa-file-medical"></i> View Assessment
    </button>`;
  container.appendChild(banner);
  container.scrollTop = container.scrollHeight;
}

function viewAssessment() {
  if (!currentAssessment) return;
  openAssessmentModal(currentAssessment);
}

function showTypingIndicator(show) {
  const el = document.getElementById('chatTyping');
  if (el) el.style.display = show ? 'flex' : 'none';
}

function resetChat() {
  conversationMessages = [];
  currentAssessment = null;
  const container = document.getElementById('chatMessages');
  if (container) {
    container.innerHTML = '';
    // Re-add welcome state
    const welcome = document.createElement('div');
    welcome.id = 'chatWelcome';
    welcome.className = 'chat-welcome';
    welcome.innerHTML = `
      <div class="welcome-icon"><i class="fa-solid fa-comments-medical"></i></div>
      <h2>What's on your mind?</h2>
      <p>Describe your symptoms, how you're feeling, or any health concern. I'll ask follow-up questions to understand your situation fully.</p>
      <div class="quick-starts">
        <button class="quick-start-btn" onclick="quickStart('I have a headache and feel tired')">
          <i class="fa-solid fa-head-side-virus"></i> Headache &amp; fatigue
        </button>
        <button class="quick-start-btn" onclick="quickStart('I have a sore throat and runny nose')">
          <i class="fa-solid fa-virus"></i> Cold symptoms
        </button>
        <button class="quick-start-btn" onclick="quickStart('I have stomach pain and nausea')">
          <i class="fa-solid fa-stomach"></i> Stomach issues
        </button>
        <button class="quick-start-btn" onclick="quickStart('I have back pain that won\\'t go away')">
          <i class="fa-solid fa-person-rays"></i> Back pain
        </button>
      </div>`;
    container.appendChild(welcome);
  }
}

function handleChatKeydown(e) {
  if (e.key === 'Enter' && !e.shiftKey) {
    e.preventDefault();
    sendChatMessage();
  }
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
    renderAssessmentDashboard(currentAssessment);
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

  // Load history from localStorage
  loadLocalHistory();
}

function renderAssessmentDashboard(a) {
  const content = document.getElementById('dashboardContent');
  if (!content || !a) return;

  const severityBadge = {
    mild:     '<span class="badge badge-green"><i class="fa-solid fa-circle-check"></i> Mild</span>',
    moderate: '<span class="badge badge-yellow"><i class="fa-solid fa-circle-exclamation"></i> Moderate</span>',
    severe:   '<span class="badge badge-red"><i class="fa-solid fa-triangle-exclamation"></i> Severe</span>',
  }[a.severity] || '<span class="badge badge-gray">Unknown</span>';

  const urgencyClass = { routine: 'urgency-routine', soon: 'urgency-soon', immediate: 'urgency-immediate' }[a.urgency] || 'urgency-routine';
  const urgencyIcon = { routine: 'fa-clock', soon: 'fa-calendar', immediate: 'fa-siren-on' }[a.urgency] || 'fa-clock';
  const urgencyText = a.urgencyText || { routine: 'No rush — routine follow-up', soon: 'See a doctor within 2–3 days', immediate: 'Seek medical care today' }[a.urgency] || a.urgency;

  // Medications HTML
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

  // Home remedies HTML
  const remediesHTML = buildTipList(a.homeRemedies, 'icon-teal', 'fa-solid fa-leaf');

  // Lifestyle HTML
  const lifestyleHTML = buildTipList(a.lifestyle, 'icon-green', 'fa-solid fa-heart');

  // Warnings HTML
  let warningsHTML = '';
  if (a.warnings && a.warnings.length > 0) {
    warningsHTML = `
      <div class="dash-section warning-section">
        <div class="dash-section">
          <div class="dash-section-header">
            <div class="dash-section-icon icon-red"><i class="fa-solid fa-triangle-exclamation"></i></div>
            <h3>Warning Signs to Watch For</h3>
          </div>
          <div class="warning-list">
            ${a.warnings.map(w => `
              <div class="warning-item">
                <i class="fa-solid fa-circle-exclamation"></i>
                <span>${escHtml(w)}</span>
              </div>`).join('')}
          </div>
        </div>
      </div>`;
  }

  content.innerHTML = `
    <!-- Condition Overview -->
    <div class="condition-card">
      <div class="condition-header">
        <div class="condition-name-row">
          <div class="condition-name">${escHtml(a.condition || 'Health Assessment')}</div>
          ${severityBadge}
        </div>
        <div class="urgency-badge ${urgencyClass}">
          <i class="fa-solid ${urgencyIcon}"></i>
          ${escHtml(urgencyText)}
        </div>
      </div>
      <p class="condition-overview">${escHtml(a.overview || '')}</p>
    </div>

    <div class="dashboard-sections">
      <!-- Medications -->
      <div class="dash-section">
        <div class="dash-section-header">
          <div class="dash-section-icon icon-blue"><i class="fa-solid fa-pills"></i></div>
          <h3>Recommended Medications</h3>
        </div>
        <div class="medications-grid">${medsHTML}</div>
      </div>

      <!-- Home Remedies -->
      ${a.homeRemedies && a.homeRemedies.length > 0 ? `
      <div class="dash-section">
        <div class="dash-section-header">
          <div class="dash-section-icon icon-teal"><i class="fa-solid fa-leaf"></i></div>
          <h3>Home Remedies</h3>
        </div>
        <div class="tip-list">${remediesHTML}</div>
      </div>` : ''}

      <!-- Lifestyle Tips -->
      ${a.lifestyle && a.lifestyle.length > 0 ? `
      <div class="dash-section">
        <div class="dash-section-header">
          <div class="dash-section-icon icon-green"><i class="fa-solid fa-heart"></i></div>
          <h3>Lifestyle Recommendations</h3>
        </div>
        <div class="tip-list">${lifestyleHTML}</div>
      </div>` : ''}

      <!-- Warnings -->
      ${warningsHTML}

      <!-- Follow Up -->
      ${a.followUp ? `
      <div class="followup-card">
        <i class="fa-solid fa-calendar-check"></i>
        <span>${escHtml(a.followUp)}</span>
      </div>` : ''}

      <!-- Book Doctor CTA -->
      <div class="book-cta-card">
        <h3>Want to speak with a real doctor?</h3>
        <p>Our specialists are available for consultation across 10+ fields.</p>
        <button class="btn btn-white btn-lg" onclick="showBookDoctor()">
          <i class="fa-solid fa-calendar-plus"></i> Book an Appointment
        </button>
      </div>
    </div>`;
}

function buildTipList(items, iconBg, iconClass) {
  if (!items || items.length === 0) return '';
  return items.map(item => `
    <div class="tip-item">
      <div class="tip-bullet ${iconBg}"><i class="${iconClass}"></i></div>
      <span>${escHtml(item)}</span>
    </div>`).join('');
}

function loadLocalHistory() {
  const stored = JSON.parse(localStorage.getItem('hc_chatbot_results') || '[]');
  if (stored.length === 0) return;

  const section = document.getElementById('historySection');
  const list = document.getElementById('historyList');
  if (!section || !list) return;

  list.innerHTML = stored.slice(0, 5).map(r => {
    const a = r.assessment;
    if (!a) return '';
    const date = r.savedAt ? new Date(r.savedAt).toLocaleDateString() : 'Unknown date';
    const sev = a.severity || 'mild';
    const badgeCls = { mild: 'badge-green', moderate: 'badge-yellow', severe: 'badge-red' }[sev] || 'badge-gray';
    return `
      <div class="history-item">
        <div>
          <strong>${escHtml(a.condition || 'Health Assessment')}</strong>
          <div style="font-size:0.8rem; color:var(--text-muted); margin-top:3px;">${date}</div>
        </div>
        <span class="badge ${badgeCls}">${ucFirst(sev)}</span>
      </div>`;
  }).join('');

  if (list.innerHTML.trim()) section.style.display = 'block';
}

// ── Products / Shop ────────────────────────────────────────────
async function loadProducts() {
  const grid = document.getElementById('shopGrid');
  if (!grid) return;

  grid.innerHTML = '<div class="loading-state"><i class="fa-solid fa-spinner fa-spin"></i><p>Loading products…</p></div>';

  const result = await apiCall('GET', '/products');
  if (!result.ok || !result.data?.data) {
    grid.innerHTML = '<div class="loading-state"><i class="fa-solid fa-box-open"></i><p>Unable to load products. Please try again.</p></div>';
    return;
  }

  const products = result.data.data;
  grid.innerHTML = products.map(p => `
    <div class="product-card">
      <div class="product-icon">
        <i class="fa-solid ${p.icon || 'fa-capsules'}"></i>
      </div>
      <div class="product-name">${escHtml(p.name)}</div>
      <div class="product-desc">${escHtml(p.description || '')}</div>
      <div class="product-price">$${Number(p.price).toFixed(2)}</div>
      <button class="btn btn-primary" onclick="addToCart('${escHtml(p.id || p.name)}','${escHtml(p.name)}',${p.price})">
        <i class="fa-solid fa-cart-plus"></i> Add to Cart
      </button>
    </div>`).join('');
}

function addToCart(productId, name, price) {
  const existing = cart.find(i => i.productId === productId);
  if (existing) {
    existing.qty++;
  } else {
    cart.push({ productId, name, price: Number(price), qty: 1 });
  }
  updateCartDisplay();

  // Brief visual feedback
  showToast(`${name} added to cart`);
}

function updateCartDisplay() {
  const indicator = document.getElementById('cartIndicator');
  const count = document.getElementById('cartCount');
  const total = document.getElementById('cartTotalDisplay');
  if (!indicator) return;

  if (cart.length === 0) {
    indicator.style.display = 'none';
    return;
  }
  indicator.style.display = 'flex';
  const totalItems = cart.reduce((s, i) => s + i.qty, 0);
  const totalPrice = cart.reduce((s, i) => s + i.price * i.qty, 0);
  if (count) count.textContent = totalItems;
  if (total) total.textContent = '$' + totalPrice.toFixed(2);
}

function openCheckout() {
  if (cart.length === 0) return;
  const total = cart.reduce((s, i) => s + i.price * i.qty, 0);
  currentPayDoc = 'Shop Order';
  currentPayPrice = total.toFixed(2);
  currentPaySlot = '';

  resetPaymentModal();
  const el = document.getElementById('pay-step-delivery');
  if (el) el.style.display = 'block';
  document.getElementById('paymentModal').style.display = 'flex';
}

async function confirmDelivery() {
  const name    = document.getElementById('deliveryName')?.value.trim();
  const phone   = document.getElementById('deliveryPhone')?.value.trim();
  const address = document.getElementById('deliveryAddress')?.value.trim();
  if (!name || !phone || !address) { showToast('Please fill in all delivery fields.', 'warning'); return; }

  const payload = {
    items: cart.map(i => ({ productId: i.productId, productName: i.name, price: i.price, quantity: i.qty })),
    paymentMethod: 'cash',
    deliveryName: name,
    deliveryPhone: phone,
    deliveryAddress: address,
  };

  const result = await apiCall('POST', '/orders', payload);

  if (result.ok) {
    cart = [];
    updateCartDisplay();
    document.getElementById('pay-step-delivery').style.display = 'none';
    const cashStep = document.getElementById('pay-step-cash');
    if (cashStep) {
      document.getElementById('cashConfirmText').textContent = `Your order has been placed! We'll deliver to ${address}.`;
      cashStep.style.display = 'block';
    }
  } else {
    showToast(result.data?.message || 'Order failed. Please try again.', 'error');
  }
}

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
];

const DOCTORS_DATA = [
  { name:'Dr. Ramy Fouad',    spec:'Cardiology & Critical Care', price:280, rating:4.7, location:'Maadi, Cairo',       phone:'+20 111 234 5670' },
  { name:'Dr. Dina Saad',     spec:'Cardiology & Critical Care', price:320, rating:4.8, location:'New Cairo',           phone:'+20 122 345 6781' },
  { name:'Dr. Sara Hossam',   spec:'General Medicine',           price:150, rating:4.7, location:'Maadi, Cairo',       phone:'+20 111 333 5678' },
  { name:'Dr. Amr Youssef',   spec:'General Medicine',           price:130, rating:4.5, location:'Heliopolis, Cairo',  phone:'+20 100 444 6789' },
  { name:'Dr. Ahmed Nabil',   spec:'Internal Medicine',          price:200, rating:4.6, location:'Heliopolis, Cairo',  phone:'+20 122 444 9900' },
  { name:'Dr. Hossam Refaat', spec:'Internal Medicine',          price:220, rating:4.8, location:'Downtown, Cairo',    phone:'+20 100 556 1234' },
  { name:'Dr. Nour El-Din',   spec:'Neurology',                  price:350, rating:4.8, location:'New Cairo',           phone:'+20 100 777 1122' },
  { name:'Dr. Tarek Mansour', spec:'Neurology',                  price:330, rating:4.7, location:'Nasr City, Cairo',   phone:'+20 111 888 2233' },
  { name:'Dr. Mona Tarek',    spec:'Pulmonology',                price:250, rating:4.5, location:'6th October City',   phone:'+20 112 888 3344' },
  { name:'Dr. Sherif Hamdy',  spec:'Pulmonology',                price:270, rating:4.7, location:'New Cairo',           phone:'+20 100 112 4455' },
  { name:'Dr. Karim Samir',   spec:'Emergency Medicine',         price:180, rating:4.7, location:'Downtown, Cairo',    phone:'+20 100 999 5566' },
  { name:'Dr. Noha Saber',    spec:'Emergency Medicine',         price:200, rating:4.8, location:'Maadi, Cairo',       phone:'+20 100 445 7788' },
  { name:'Dr. Hana Fahmy',    spec:'Dermatology',                price:220, rating:4.6, location:'Zamalek, Cairo',     phone:'+20 111 000 7788' },
  { name:'Dr. Mira Adel',     spec:'Dermatology',                price:240, rating:4.8, location:'New Cairo',           phone:'+20 122 556 8899' },
  { name:'Dr. Omar Saleh',    spec:'Orthopedics',                price:280, rating:4.8, location:'Nasr City, Cairo',   phone:'+20 122 111 8899' },
  { name:'Dr. Islam Khairy',  spec:'Orthopedics',                price:300, rating:4.7, location:'Heliopolis, Cairo',  phone:'+20 111 778 0011' },
  { name:'Dr. Rana Mostafa',  spec:'Pediatrics',                 price:160, rating:4.9, location:'Maadi, Cairo',       phone:'+20 100 222 9900' },
  { name:'Dr. Farah Mahmoud', spec:'Pediatrics',                 price:170, rating:4.8, location:'Zamalek, Cairo',     phone:'+20 111 101 3344' },
  { name:'Dr. Sameh Adel',    spec:'Ophthalmology',              price:200, rating:4.5, location:'Heliopolis, Cairo',  phone:'+20 111 333 0011' },
  { name:'Dr. Ghada Tawfik',  spec:'Ophthalmology',              price:220, rating:4.7, location:'Nasr City, Cairo',   phone:'+20 100 212 4455' },
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
}

function selectSpec(specName) {
  document.getElementById('spec-section').style.display   = 'none';
  document.getElementById('doctors-section').style.display = 'block';
  document.getElementById('specTitle').textContent = specName + ' Specialists';
  const grid = document.getElementById('doctorsGrid');
  if (!grid) return;

  const docs = DOCTORS_DATA.filter(d => d.spec === specName);
  if (docs.length === 0) {
    grid.innerHTML = '<p style="color:var(--text-muted); grid-column:1/-1;">No doctors found for this specialization.</p>';
    return;
  }
  grid.innerHTML = docs.map(doc => buildDoctorCardHTML(doc)).join('');
}

function buildDoctorCardHTML(doc) {
  const cardId = 'doc-' + doc.name.replace(/[\s.']/g, '');
  const stars  = '★'.repeat(Math.floor(doc.rating)) + '☆'.repeat(5 - Math.floor(doc.rating));
  const slots  = DOCTOR_SLOTS.map(s =>
    `<button class="slot-btn" onclick="selectSlot(this,'${cardId}')">${s}</button>`
  ).join('');

  return `
    <div class="doctor-card" id="${cardId}">
      <div class="doctor-card-header">
        <div class="doctor-avatar"><i class="fa-solid fa-user-doctor"></i></div>
        <div>
          <div class="doctor-name">${escHtml(doc.name)}</div>
          <div class="doctor-spec">${escHtml(doc.spec)}</div>
        </div>
      </div>
      <div class="doctor-meta">
        <span><i class="fa-solid fa-location-dot" style="margin-right:5px; color:var(--text-muted);"></i>${escHtml(doc.location)}</span>
        <span class="doctor-price">EGP ${doc.price}</span>
      </div>
      <div class="doctor-rating">
        ${stars} <span>${doc.rating} / 5</span>
      </div>
      <div style="font-size:0.8rem; font-weight:600; color:var(--text-muted); margin-bottom:8px;">
        <i class="fa-regular fa-clock" style="margin-right:4px;"></i>Available Slots
      </div>
      <div class="slots-row">${slots}</div>
      <div class="slot-selected-text" id="slot-${cardId}"></div>
      <div class="doctor-actions">
        <button class="btn btn-primary" onclick="openPayment('${escHtml(doc.name)}',${doc.price},'${cardId}')">
          <i class="fa-solid fa-calendar-check"></i> Book Now
        </button>
        <button class="btn btn-outline" onclick="window.open('tel:${escHtml(doc.phone)}')">
          <i class="fa-solid fa-phone"></i> Call
        </button>
      </div>
    </div>`;
}

function selectSlot(btn, cardId) {
  document.querySelectorAll(`#${cardId} .slot-btn`).forEach(b => b.classList.remove('selected'));
  btn.classList.add('selected');
  selectedSlots[cardId] = btn.textContent.trim();
  const label = document.getElementById('slot-' + cardId);
  if (label) label.textContent = '✓ ' + selectedSlots[cardId];
}

function resetSpecSelection() {
  document.getElementById('spec-section').style.display    = 'block';
  document.getElementById('doctors-section').style.display = 'none';
}

// ── Payment ────────────────────────────────────────────────────
function openPayment(docName, price, cardId) {
  const slot = selectedSlots[cardId];
  if (!slot) { showToast('Please select a time slot first.', 'warning'); return; }
  if (!currentUser) { openModal('login'); return; }

  currentPayDoc   = docName;
  currentPayPrice = price;
  currentPaySlot  = slot;

  resetPaymentModal();
  document.getElementById('payDocInfo').textContent  = `${docName} · EGP ${price}`;
  document.getElementById('paySlotInfo').textContent = `📅 Today at ${slot}`;
  document.getElementById('pay-step-1').style.display = 'block';
  document.getElementById('paymentModal').style.display = 'flex';
}

function closePaymentModal() {
  document.getElementById('paymentModal').style.display = 'none';
  resetPaymentModal();
}

function resetPaymentModal() {
  ['pay-step-1','pay-step-delivery','pay-step-visa','pay-step-cash','pay-step-success']
    .forEach(id => {
      const el = document.getElementById(id);
      if (el) el.style.display = 'none';
    });
}

async function selectPayment(method) {
  const isShop = currentPayDoc === 'Shop Order';

  if (!isShop) {
    const bookingData = {
      doctor_name: currentPayDoc,
      date: new Date().toISOString().split('T')[0],
      time_slot: currentPaySlot,
      payment_method: method,
      fee: parseInt(currentPayPrice) || 0,
    };
    const result = await apiCall('POST', '/booking', bookingData);
    if (!result.ok) {
      showToast(result.data?.message || 'Booking failed. Please try again.', 'error');
      return;
    }
  }

  document.getElementById('pay-step-1').style.display = 'none';

  if (method === 'cash') {
    const cashStep = document.getElementById('pay-step-cash');
    if (cashStep) {
      document.getElementById('cashConfirmText').textContent = isShop
        ? `Your order has been confirmed. Total: $${currentPayPrice}.`
        : `Appointment with ${currentPayDoc} confirmed for today at ${currentPaySlot}. Total: EGP ${currentPayPrice}.`;
      cashStep.style.display = 'block';
    }
    if (isShop) { cart = []; updateCartDisplay(); }
  } else {
    document.getElementById('visaAmountText').textContent = isShop
      ? `Total: $${currentPayPrice}`
      : `Total: EGP ${currentPayPrice}`;
    document.getElementById('pay-step-visa').style.display = 'block';
  }
}

function processVisaPayment() {
  const card    = document.getElementById('visaCard')?.value.replace(/\s/g,'');
  const expiry  = document.getElementById('visaExpiry')?.value;
  const cvv     = document.getElementById('visaCvv')?.value;
  const name    = document.getElementById('visaName')?.value.trim();

  if (!card || card.length < 13 || !expiry || !cvv || !name) {
    showToast('Please fill in all card details.', 'warning');
    return;
  }

  document.getElementById('pay-step-visa').style.display = 'none';
  const successStep = document.getElementById('pay-step-success');
  if (successStep) {
    document.getElementById('successText').textContent = currentPayDoc === 'Shop Order'
      ? `Payment of $${currentPayPrice} confirmed. Your order is on its way!`
      : `Payment of EGP ${currentPayPrice} confirmed. Appointment with ${currentPayDoc} at ${currentPaySlot}.`;
    successStep.style.display = 'block';
  }
  if (currentPayDoc === 'Shop Order') { cart = []; updateCartDisplay(); }
}

function formatCardNumber(el) {
  let v = el.value.replace(/\D/g, '').substring(0, 16);
  el.value = v.match(/.{1,4}/g)?.join(' ') || v;
}
function formatExpiry(el) {
  let v = el.value.replace(/\D/g, '');
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
  const name = currentUser?.name || 'Professional';

  setEl('profDashTitle', isDoctor ? `Dr. ${name}'s Panel` : `Coach ${name}'s Panel`);
  setEl('profDashSubtitle', isDoctor
    ? 'Overview of your patients and their latest health data.'
    : 'Fitness management console — client training and lifestyle overview.');
  setEl('profStatLabel', isDoctor ? 'Total Patients' : 'Total Clients');
  setEl('profStatCount', isDoctor ? '3' : '4');
  setEl('profStatBookings', isDoctor ? '8' : '12');

  document.getElementById('doctor-panel').style.display = isDoctor ? 'block' : 'none';
  document.getElementById('coach-panel').style.display  = isDoctor ? 'none'  : 'block';

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
    const isCritical = p.status === 'Critical';
    const badgeCls = isCritical ? 'badge-red' : 'badge-green';
    return `
      <tr>
        <td><strong>${escHtml(p.name)}</strong></td>
        <td style="color:var(--text-muted)">${escHtml(p.sync)}</td>
        <td><span class="badge ${badgeCls}">${escHtml(p.status)}</span></td>
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
      <div class="client-detail"><span>Activity Level</span><span>${escHtml(c.level)}</span></div>
      <div class="client-detail"><span>Diet</span><span>${escHtml(c.diet)}</span></div>
      <div class="client-detail"><span>BMI</span><span style="color:${c.bmiColor}; font-weight:700;">${c.bmi} — ${escHtml(c.bmiLabel)}</span></div>
      <div class="client-detail"><span>Location</span><span>${escHtml(c.location)}</span></div>
    </div>`).join('');
}

// ── Toast Notifications ────────────────────────────────────────
function showToast(msg, type = 'success') {
  const id = 'toast-' + Date.now();
  const colors = { success: '#10b981', error: '#ef4444', warning: '#f59e0b', info: '#2563eb' };
  const toast = document.createElement('div');
  toast.id = id;
  toast.style.cssText = `
    position: fixed; bottom: 24px; right: 24px; z-index: 9999;
    background: ${colors[type] || colors.success}; color: white;
    padding: 12px 20px; border-radius: 10px; font-size: 0.875rem;
    font-weight: 500; font-family: inherit; box-shadow: 0 8px 24px rgba(0,0,0,0.15);
    max-width: 320px; animation: fadeInUp 0.2s ease;
  `;
  toast.textContent = msg;
  document.body.appendChild(toast);
  setTimeout(() => toast.remove(), 3500);
}

// ── Utility ────────────────────────────────────────────────────
function escHtml(str) {
  if (!str) return '';
  return String(str)
    .replace(/&/g,'&amp;')
    .replace(/</g,'&lt;')
    .replace(/>/g,'&gt;')
    .replace(/"/g,'&quot;')
    .replace(/'/g,'&#39;');
}

function setEl(id, text) {
  const el = document.getElementById(id);
  if (el) el.textContent = text;
}

function showEl(id) {
  const el = document.getElementById(id);
  if (el) el.style.display = '';
}

function ucFirst(s) {
  if (!s) return '';
  return s.charAt(0).toUpperCase() + s.slice(1);
}
