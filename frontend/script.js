/* ============================================================
   script.js — HealthCare Platform
   Refactored from inline JS.
   Now connects to the Node.js/Express backend API.
   ============================================================ */

'use strict';

// ── API Configuration ──────────────────────────────────────
const API_BASE = ''; // Empty for same-origin (Vercel) - uses /api/* paths

/** Generic API helper — automatically attaches JWT if present */
async function apiCall(method, path, body = null) {
  const headers = { 'Content-Type': 'application/json' };
  const token = localStorage.getItem('hc_token');
  if (token) headers['Authorization'] = `Bearer ${token}`;

  const opts = { method, headers };
  if (body) opts.body = JSON.stringify(body);

  // Build URL - path should be like "/auth/login" -> becomes "/api/auth/login"
  const apiPath = path.startsWith('/') ? path : '/' + path;
  const fullUrl = `${window.location.origin}/api${apiPath}`;
  
  console.log(`API Call: ${method} ${fullUrl}`, body ? 'with body' : '');

  try {
    const res = await fetch(fullUrl, opts);
    console.log(`Response status: ${res.status}`);
    
    const data = await res.json();
    console.log(`Response data:`, data);
    
    return { ok: res.ok, status: res.status, data };
  } catch (err) {
    console.error('API error:', err);
    return { ok: false, status: 0, data: { message: 'Network error: ' + err.message } };
  }
}

// ── State ──────────────────────────────────────────────────
let currentUser   = JSON.parse(localStorage.getItem('hc_user') || 'null') || { name: '', auth: false, role: '' };
let currentStep   = 0;
let flowType      = '';
let chatSubFlow   = '';
let freeInputTarget = '';
let pendingAction   = '';
let answers = {
  sleep: 0, headache: '', water: '', symptoms: '',
  healthGoal: '', duration: '', painSeverity: '',
  temperature: '', breathShort: '',
  fitnessGoal: '', trainFreq: '', location: '', level: '',
  weight: 0, height: 0, injury: '', diet: '', flowType: ''
};

// Restore session if token exists
if (currentUser.auth) {
  document.addEventListener('DOMContentLoaded', restoreSession);
}

function restoreSession() {
  if (!currentUser.auth) return;
  document.getElementById('navSignup').style.display = 'none';
  document.getElementById('navLogin').style.display  = 'none';
  document.getElementById('userProfile').style.display = 'flex';
  document.getElementById('userName').innerText         = currentUser.name;
  document.getElementById('avatarLetter').innerText     = currentUser.name[0];
  document.getElementById('menuDisplayName').innerText  = currentUser.name;
  document.getElementById('menuDisplayEmail').innerText = currentUser.email || '';
  document.getElementById('chat-stream').innerHTML      = '';
  if (currentUser.role === 'patient') {
    document.getElementById('nav-shop-link').style.display = 'block';
    document.getElementById('menuShopItem').style.display  = 'flex';
  }
  // Hide logged-out CTA section
  updateLandingSectionsVisibility();
}

// ── Health Score Helpers (mirrors backend logic) ───────────
function calculateScore(ans) {
  let score = 0;
  if (Number(ans.sleep) < 5)        score += 2;
  if (ans.water === 'no')            score += 1;
  if (ans.headache === 'yes')        score += 2;
  if (ans.symptoms === 'fever')      score += 3;
  if (ans.temperature === 'yes')     score += 2;
  if (ans.duration === 'more3')      score += 2;
  if (ans.painSeverity === 'severe') score += 3;
  if (ans.breathShort === 'yes')     score += 3;
  return score;
}

function calculateStatus(score) {
  if (score <= 2) return { status: 'Stable',   risk: 'Low'    };
  if (score <= 5) return { status: 'Moderate',  risk: 'Medium' };
  return            { status: 'Critical',  risk: 'High'   };
}

function generateAdvice(ans, status) {
  const tips = [];
  if (Number(ans.sleep) < 5)        tips.push('Improve your sleep schedule — aim for 7–8 hours nightly.');
  if (ans.water === 'no')           tips.push('Drink more water daily — at least 2 litres.');
  if (ans.headache === 'yes')       tips.push('Monitor your headache and try to reduce stress levels.');
  if (ans.symptoms === 'fever' || ans.temperature === 'yes') tips.push('You may need medical attention for your fever.');
  if (ans.duration === 'more3')     tips.push('Symptoms lasting more than 3 days — consider consulting a doctor.');
  if (ans.breathShort === 'yes')    tips.push('Shortness of breath is a serious symptom. Seek medical care promptly.');
  if (ans.painSeverity === 'severe')tips.push('Severe pain should not be ignored — speak with a healthcare professional.');
  if (status === 'Stable' && tips.length === 0) {
    tips.push('Your condition looks good. Keep up your healthy habits.');
    tips.push('Schedule a routine check-up to stay on top of your health.');
  }
  if (status === 'Critical') tips.unshift('⚠️ Immediate medical consultation is required.');
  return tips;
}

function calcBMI(weight, height) {
  if (!weight || !height || height === 0) return null;
  const hm = height / 100;
  return (weight / (hm * hm)).toFixed(1);
}

function bmiCategory(bmi) {
  if (bmi < 18.5) return { label: 'Underweight', color: 'var(--secondary)' };
  if (bmi < 25)   return { label: 'Normal',       color: 'var(--success)'  };
  if (bmi < 30)   return { label: 'Overweight',   color: 'var(--warning)'  };
  return            { label: 'Obese',         color: 'var(--danger)'   };
}

// ── Auth Helpers ────────────────────────────────────────────
function openModal(mode) {
  document.getElementById('authModal').style.display = 'flex';
  document.getElementById('authContent').style.display = 'block';
  document.getElementById('bookingContent').style.display = 'none';
  document.getElementById('nameField').style.display = mode === 'login' ? 'none' : 'block';
  document.getElementById('modalTitle').innerText = mode === 'login' ? 'Welcome Back' : 'Create Account';
  document.getElementById('authSubmitBtn').innerText = mode === 'login' ? 'Login' : 'Sign Up';
}

function openBookingModal() {
  document.getElementById('authModal').style.display = 'flex';
  document.getElementById('authContent').style.display = 'none';
  document.getElementById('bookingContent').style.display = 'block';
}

async function confirmBooking() {
  const date = document.getElementById('bookDate').value;
  const time = document.getElementById('bookTime').value;
  if (!date || !time) { alert('Please select a date and time.'); return; }

  const bookings = getStoredBookings();
  bookings.push({ doctor: 'Dr. Essam Mark', date, time, savedAt: new Date().toISOString() });
  saveStoredBookings(bookings);
  alert(`Appointment Confirmed with Dr. Essam Mark for ${date} at ${time}.`);
  closeModal();
}

function closeModal() { document.getElementById('authModal').style.display = 'none'; }
function toggleProfileMenu() { document.getElementById('profileMenu').classList.toggle('active'); }

function logout() {
  localStorage.removeItem('hc_token');
  localStorage.removeItem('hc_user');
  window.location.reload();
}

function toggleRoleFields() {
  const role = document.getElementById('authRole').value;
  document.getElementById('doctorFields').style.display  = role === 'doctor'  ? 'block' : 'none';
  document.getElementById('coachFields').style.display   = role === 'coach'   ? 'block' : 'none';
  document.getElementById('patientFields').style.display = role === 'patient' ? 'block' : 'none';
}

/** Called by the auth form submit handler */
async function handleAuth(event) {
  event.preventDefault();

  const nameInp  = document.getElementById('authName').value;
  const emailInp = document.getElementById('authEmail').value;
  const passInp  = document.getElementById('authPass').value;
  const isLogin  = document.getElementById('nameField').style.display === 'none';
  const role     = document.getElementById('authRole').value || 'patient';

  let result;

  if (isLogin) {
    result = await apiCall('POST', '/auth/login', { email: emailInp, password: passInp });
  } else {
    // Gather extra fields
    const extra = {};
    if (role === 'patient') {
      extra.age    = document.getElementById('patientAge')?.value;
      extra.gender = document.getElementById('patientGender')?.value;
    } else if (role === 'doctor') {
      extra.specialization  = document.getElementById('docSpec')?.value;
      extra.yearsExperience = document.getElementById('docExp')?.value;
      extra.clinicAddress   = document.getElementById('docClinic')?.value;
    } else if (role === 'coach') {
      extra.trainingType    = document.getElementById('coachType')?.value;
      extra.yearsExperience = document.getElementById('coachExp')?.value;
    }
    result = await apiCall('POST', '/auth/register', {
      name: nameInp, email: emailInp, password: passInp, role, ...extra,
    });
  }

  console.log('Auth result:', result);
  
  if (!result.ok) {
    const errorMsg = result.data?.message || result.data?.error || 'Authentication failed';
    console.error('Auth error:', errorMsg);
    alert('Error: ' + errorMsg);
    return;
  }

  // Persist token and user info
  const { token, user } = result.data;
  localStorage.setItem('hc_token', token);
  localStorage.setItem('hc_user', JSON.stringify({ ...user, auth: true }));

  currentUser = { ...user, auth: true };

  // Update UI
  closeModal();
  document.getElementById('navSignup').style.display   = 'none';
  document.getElementById('navLogin').style.display    = 'none';
  document.getElementById('userProfile').style.display = 'flex';
  document.getElementById('userName').innerText         = currentUser.name;
  document.getElementById('avatarLetter').innerText     = currentUser.name[0];
  document.getElementById('menuDisplayName').innerText  = currentUser.name;
  document.getElementById('menuDisplayEmail').innerText = emailInp;
  document.getElementById('chat-stream').innerHTML      = '';

  // Load latest plan for the user
  loadLatestPlan();
  
  // Hide landing sections after login
  updateLandingSectionsVisibility();

  if (currentUser.role === 'doctor' || currentUser.role === 'coach') {
    showProfessionalDashboard();
  } else {
    document.getElementById('nav-shop-link').style.display = 'block';
    document.getElementById('menuShopItem').style.display  = 'flex';
    if (pendingAction === 'bookDoctor') {
      pendingAction = '';
      hideAllViews();
      document.getElementById('book-doctor-view').style.display = 'block';
      buildSpecGrid();
      window.scrollTo(0, 0);
    } else {
      askNextQuestion();
    }
  }
}

// ── View Routing ────────────────────────────────────────────
function hideAllViews() {
  ['home-view', 'dashboard-view', 'professional-dashboard', 'shop-view', 'book-doctor-view']
    .forEach(id => { document.getElementById(id).style.display = 'none'; });
}

function showHome() {
  hideAllViews();
  document.getElementById('home-view').style.display = 'block';
  window.scrollTo(0, 0);
}

function showDashboard() {
  hideAllViews();
  document.getElementById('dashboard-view').style.display = 'block';
  ['stat-card-status', 'stat-card-score', 'stat-card-risk'].forEach(id => {
    document.getElementById(id)?.classList.remove('hide-on-skip');
  });
  window.scrollTo(0, 0);
}

function showShop() {
  hideAllViews();
  document.getElementById('shop-view').style.display = 'block';
  loadProducts();
  window.scrollTo(0, 0);
}

function showBookDoctor() {
  if (!currentUser.auth) {
    openModal('login');
    pendingAction = 'bookDoctor';
    return;
  }
  hideAllViews();
  document.getElementById('book-doctor-view').style.display = 'block';
  buildSpecGrid();
  window.scrollTo(0, 0);
}

function showProfessionalDashboard() {
  hideAllViews();
  document.getElementById('professional-dashboard').style.display = 'block';
  const isDoctor = currentUser.role === 'doctor';
  document.getElementById('prof-dash-title').innerText = isDoctor
    ? `Doctor's Panel: Dr. ${currentUser.name}`
    : `Coach's Panel: Coach ${currentUser.name}`;
  document.getElementById('prof-dash-subtitle').innerText = isDoctor
    ? 'Overview of your assigned members and their latest health data.'
    : 'Fitness management console – client training & lifestyle overview';
  document.getElementById('nav-dash-link').style.display = 'block';

  if (isDoctor) {
    document.getElementById('doctor-view-section').style.display = 'block';
    document.getElementById('coach-view-section').style.display  = 'none';
    document.getElementById('prof-stat-label').innerText = 'Total Patients';
    document.getElementById('list-title').innerText = 'Patient Medical Records';
    populateProfessionalTable();
  } else {
    document.getElementById('doctor-view-section').style.display = 'none';
    document.getElementById('coach-view-section').style.display  = 'block';
    setTimeout(() => buildCoachClientCards(), 0);
  }
  window.scrollTo(0, 0);
}

// ── Coach Client Data ────────────────────────────────────────
const COACH_CLIENTS = [
  { name: 'Omar Rayan',  goal: 'Muscle Gain',    level: 'High',   diet: 'Healthy',  bmi: 22.4, bmiCat: 'Normal',     bmiColor: 'var(--primary)', location: 'Gym'  },
  { name: 'Layla Amer',  goal: 'Fat Loss',       level: 'Medium', diet: 'Average',  bmi: 27.8, bmiCat: 'Overweight', bmiColor: 'var(--warning)', location: 'Home' },
  { name: 'Mike Ross',   goal: 'Fat Loss',       level: 'Low',    diet: 'Poor',     bmi: 31.2, bmiCat: 'Obese',      bmiColor: 'var(--danger)',  location: 'Gym'  },
  { name: 'Dina Tarek',  goal: 'General',        level: 'Medium', diet: 'Healthy',  bmi: 21.0, bmiCat: 'Normal',     bmiColor: 'var(--primary)', location: 'Home' }
];

function buildCoachClientCards() {
  const grid = document.getElementById('coach-client-grid');
  grid.innerHTML = '';
  COACH_CLIENTS.forEach(client => {
    const locIcon = client.location === 'Gym'
      ? `<i class="fa-solid fa-dumbbell" style="color:var(--warning);"></i>`
      : `<i class="fa-solid fa-house" style="color:var(--text-muted);"></i>`;
    const card = document.createElement('div');
    card.style.cssText = 'background:white; border:1px solid var(--glass-border); border-radius:20px; padding:22px; transition:0.3s;';
    card.onmouseenter = () => card.style.transform = 'translateY(-5px)';
    card.onmouseleave = () => card.style.transform = 'translateY(0)';
    card.innerHTML = `
      <h4 style="font-size:1.05rem; font-weight:800; margin-bottom:16px;">${client.name}</h4>
      <div style="display:flex; justify-content:space-between; margin-bottom:10px; font-size:0.88rem;">
        <span style="color:var(--text-muted); font-weight:600;">Fitness Goal</span>
        <span style="font-weight:700;">${client.goal}</span>
      </div>
      <div style="display:flex; justify-content:space-between; margin-bottom:10px; font-size:0.88rem;">
        <span style="color:var(--text-muted); font-weight:600;">Activity Level</span>
        <span style="font-weight:700;">${client.level}</span>
      </div>
      <div style="display:flex; justify-content:space-between; margin-bottom:10px; font-size:0.88rem;">
        <span style="color:var(--text-muted); font-weight:600;">Diet</span>
        <span style="font-weight:700;">${client.diet}</span>
      </div>
      <div style="display:flex; justify-content:space-between; margin-bottom:10px; font-size:0.88rem;">
        <span style="color:var(--text-muted); font-weight:600;">BMI</span>
        <span style="font-weight:800; color:${client.bmiColor};">${client.bmi} — ${client.bmiCat}</span>
      </div>
      <div style="display:flex; justify-content:space-between; margin-bottom:18px; font-size:0.88rem;">
        <span style="color:var(--text-muted); font-weight:600;">Location</span>
        <span style="font-weight:700; display:flex; align-items:center; gap:5px;">${locIcon} ${client.location}</span>
      </div>
      <button class="btn-glow" style="width:100%; justify-content:center; padding:10px;"
        onclick="alert('Training plan for ${client.name}:\\nGoal: ${client.goal}\\nLevel: ${client.level}\\nDiet: ${client.diet}\\nLocation: ${client.location}')">
        View Training Plan
      </button>`;
    grid.appendChild(card);
  });
}

function populateProfessionalTable() {
  const tableBody = document.getElementById('managementTableBody');
  const data = currentUser.role === 'doctor' ? [
    { name: 'Ahmed Salem', sync: '2 mins ago',  status: 'Critical', activity: 'Low',      btn: 'View Vitals'   },
    { name: 'Sara Hassan', sync: '1 hour ago',  status: 'Stable',   activity: 'Moderate', btn: 'View History'  },
    { name: 'John Doe',    sync: '5 hours ago', status: 'Stable',   activity: 'High',     btn: 'View History'  }
  ] : [
    { name: 'Omar Rayan', sync: 'Just now',   status: 'Active',   activity: 'High Intensity', btn: 'View Plan'      },
    { name: 'Layla Amer', sync: '3 hours ago',status: 'Resting',  activity: 'Moderate',       btn: 'View Diet'      },
    { name: 'Mike Ross',  sync: 'Yesterday',  status: 'Inactive', activity: 'None',            btn: 'Send Reminder'  }
  ];
  tableBody.innerHTML = data.map(item => `
    <tr>
      <td style="font-weight:600;">${item.name}</td>
      <td style="color:var(--text-muted); font-size:0.85rem;">${item.sync}</td>
      <td><span class="badge ${item.status === 'Critical' || item.status === 'Inactive' ? 'badge-warning' : 'badge-success'}">${item.status}</span></td>
      <td>${item.activity}</td>
      <td><button class="btn-glow" style="padding:5px 12px; font-size:0.8rem;">${item.btn}</button></td>
    </tr>`).join('');
}

function handleDashboardNavigation() {
  if (currentUser.role === 'doctor' || currentUser.role === 'coach') showProfessionalDashboard();
  else showDashboard();
}

function toggleChat() {
  const chat = document.getElementById('chat-ui');
  const stream = document.getElementById('chat-stream');
  
  // Show/hide chat
  chat.style.display = (chat.style.display === 'flex') ? 'none' : 'flex';
  
  // If chat is now visible, has messages, and user is logged in - start conversation
  if (chat.style.display === 'flex' && currentUser.auth && stream.children.length === 0) {
    currentStep = 0;
    flowType = '';
    chatSubFlow = '';
    askNextQuestion();
  }
}

// ── Products — load from API ────────────────────────────────
async function loadProducts() {
  const grid = document.getElementById('shopGrid');
  const result = await apiCall('GET', '/products');
  if (!result.ok || !result.data.data) return; // fall back to static HTML

  const products = result.data.data;
  if (products.length === 0) return;

  grid.innerHTML = '';
  products.forEach(p => {
    const card = document.createElement('div');
    card.className = 'product-card';
    card.innerHTML = `
      <i class="fa-solid ${p.icon || 'fa-capsules'}" style="font-size:3rem; color:var(--primary); margin-bottom:15px;"></i>
      <h3>${p.name}</h3>
      <p style="font-size:0.85rem; color:var(--text-muted);">${p.description || ''}</p>
      <div class="price-tag">$${p.price.toFixed(2)}</div>
      <button class="btn-glow" onclick="addToCart(this,'${p.name}',${p.price},'${p._id}')" style="width:100%;">
        <i class="fa-solid fa-cart-plus"></i> Add to Cart
      </button>`;
    grid.appendChild(card);
  });
}

// ── Free-text Input ─────────────────────────────────────────
function showFreeInput(targetKey, placeholder) {
  freeInputTarget = targetKey;
  const row = document.getElementById('chat-input-row');
  const inp = document.getElementById('chat-free-input');
  inp.placeholder = placeholder || 'Enter value…';
  inp.value = '';
  row.style.display = 'flex';
  inp.focus();
}

function hideFreeInput() {
  freeInputTarget = '';
  document.getElementById('chat-input-row').style.display = 'none';
}

function submitFreeInput() {
  const val = document.getElementById('chat-free-input').value.trim();
  if (!val) return;
  hideFreeInput();
  handleUserAnswer(Number(val), val);
}

document.addEventListener('DOMContentLoaded', () => {
  document.getElementById('chat-free-input').addEventListener('keydown', e => {
    if (e.key === 'Enter') submitFreeInput();
  });
});

// ── Chatbot Flow ────────────────────────────────────────────
function askNextQuestion() {
  if (currentStep === 0) {
    appendMsg('bot', `Hello ${currentUser.name}! What do you need today?`, [
      { label: 'Doctor / Health help', val: 'health',  icon: 'fa-solid fa-user-doctor' },
      { label: 'Coach / Fitness',      val: 'fitness', icon: 'fa-solid fa-dumbbell'    }
    ]);
    return;
  }

  if (flowType === 'health') {
    if (currentStep === 1) {
      appendMsg('bot', 'Would you like to continue with health questions, or book a doctor right away?', [
        { label: 'Continue questions', val: 'questions', icon: 'fa-solid fa-clipboard-question' },
        { label: 'Book a doctor now',  val: 'book',      icon: 'fa-solid fa-calendar-plus'      }
      ]);
      return;
    }
    if (chatSubFlow === 'book') {
      if (currentStep === 2) {
        appendMsg('bot', 'Great! Which specialization do you need?');
        const specOptBox = document.createElement('div');
        specOptBox.style.cssText = 'display:flex; flex-wrap:wrap; gap:8px; margin:5px 0 15px;';
        SPECIALIZATIONS.forEach(spec => {
          const btn = document.createElement('button');
          btn.className = 'opt-btn';
          btn.innerHTML = `<i class="${spec.icon}"></i> ${spec.name}`;
          btn.onclick = () => { specOptBox.remove(); appendMsg('user', spec.name); showSpecDoctorsInChat(spec.name); };
          specOptBox.appendChild(btn);
        });
        document.getElementById('chat-stream').appendChild(specOptBox);
        document.getElementById('chat-stream').scrollTop = 9999;
      }
      return;
    }
    switch (currentStep) {
      case 2:  appendMsg('bot', 'How many hours did you sleep last night?', [{ label:'4-5 hours',val:4,icon:'fa-solid fa-moon'},{label:'7-8 hours',val:8,icon:'fa-solid fa-bed'}]); break;
      case 3:  appendMsg('bot', 'Did you drink 2L of water today?', [{label:'Yes',val:'yes',icon:'fa-solid fa-glass-water'},{label:'No',val:'no',icon:'fa-solid fa-droplet-slash'}]); break;
      case 4:  appendMsg('bot', 'Do you have any headache or pain right now?', [{label:'Yes',val:'yes',icon:'fa-solid fa-head-side-virus'},{label:'No',val:'no',icon:'fa-solid fa-smile'}]); break;
      case 5:
        if (answers.headache === 'no') { currentStep = 6; askNextQuestion(); return; }
        appendMsg('bot', 'How would you rate your pain severity?', [{label:'Mild',val:'mild',icon:'fa-solid fa-face-smile'},{label:'Moderate',val:'moderate',icon:'fa-solid fa-face-meh'},{label:'Severe',val:'severe',icon:'fa-solid fa-face-frown'}]); break;
      case 6:  appendMsg('bot', 'Are you experiencing any other symptoms?', [{label:'Yes',val:'yes',icon:'fa-solid fa-head-side-virus'},{label:'No',val:'no',icon:'fa-solid fa-check'}]); break;
      case 7:
        if (answers.symptoms === 'no') { currentStep = 9; askNextQuestion(); return; }
        appendMsg('bot', 'Do you have a high temperature / fever?', [{label:'Yes',val:'yes',icon:'fa-solid fa-temperature-high'},{label:'No',val:'no',icon:'fa-solid fa-temperature-low'}]); break;
      case 8:  appendMsg('bot', 'Are you experiencing shortness of breath?', [{label:'Yes',val:'yes',icon:'fa-solid fa-lungs-virus'},{label:'No',val:'no',icon:'fa-solid fa-lungs'}]); break;
      case 9:
        if (answers.headache === 'no' && answers.symptoms === 'no') { currentStep = 10; askNextQuestion(); return; }
        appendMsg('bot', 'How long have you had these symptoms?', [{label:'1 day',val:'1day',icon:'fa-solid fa-clock'},{label:'2–3 days',val:'2-3',icon:'fa-solid fa-calendar'},{label:'More than 3 days',val:'more3',icon:'fa-solid fa-calendar-days'}]); break;
      case 10: appendMsg('bot', 'What is your main goal from health tracking?', [{label:'Better Sleep',val:'sleep',icon:'fa-solid fa-zzz'},{label:'Stress Mgmt',val:'stress',icon:'fa-solid fa-brain'}]); break;
      default: finalize(); break;
    }
    return;
  }

  if (flowType === 'fitness') {
    if (currentStep === 1) {
      appendMsg('bot', 'Would you like to answer fitness questions, or skip to your assessment?', [
        { label: 'Answer questions',   val: 'questions', icon: 'fa-solid fa-clipboard-question' },
        { label: 'Skip to Assessment', val: 'skip',      icon: 'fa-solid fa-forward'             }
      ]);
      return;
    }
    if (chatSubFlow === 'skip') {
      if (currentStep === 2) {
        appendMsg('bot', 'Where would you like to train?', [
          { label: 'Home', val: 'home', icon: 'fa-solid fa-house'    },
          { label: 'Gym',  val: 'gym',  icon: 'fa-solid fa-building' }
        ]);
      } else if (currentStep === 3) {
        // NEW: Ask what to train after location
        appendMsg('bot', 'What do you want to train?', [
          { label: 'Full Body',    val: 'fullbody',    icon: 'fa-solid fa-person' },
          { label: 'Upper Body',  val: 'upper',       icon: 'fa-solid fa-dumbbell' },
          { label: 'Lower Body',  val: 'lower',       icon: 'fa-solid fa-leg' },
          { label: 'Abs',         val: 'abs',          icon: 'fa-solid fa-burst' },
          { label: 'Weight Loss',val: 'fatloss',      icon: 'fa-solid fa-fire' },
          { label: 'Muscle Gain', val: 'muscle',       icon: 'fa-solid fa-arm-flex' }
        ]);
      } else if (currentStep === 4) {
        // Generate workout and diet plan
        generateFitnessPlanWithDetails();
      }
      return;
    }
    // Regular questions flow (simplified)
    switch (currentStep) {
      case 2: appendMsg('bot', 'What is your primary fitness goal?', [{label:'Muscle Gain',val:'muscle',icon:'fa-solid fa-weight-hanging'},{label:'Fat Loss',val:'fat',icon:'fa-solid fa-fire'},{label:'General Fitness',val:'general',icon:'fa-solid fa-heart'}]); break;
      case 3: appendMsg('bot', 'Where do you prefer to train?', [{label:'Home',val:'home',icon:'fa-solid fa-house'},{label:'Gym',val:'gym',icon:'fa-solid fa-building'}]); break;
      case 4: 
        // NEW: Ask what to train after location
        appendMsg('bot', 'What do you want to train?', [
          { label: 'Full Body',    val: 'fullbody',    icon: 'fa-solid fa-person' },
          { label: 'Upper Body',  val: 'upper',       icon: 'fa-solid fa-dumbbell' },
          { label: 'Lower Body',  val: 'lower',       icon: 'fa-solid fa-leg' },
          { label: 'Abs',         val: 'abs',          icon: 'fa-solid fa-burst' },
          { label: 'Weight Loss',val: 'fatloss',      icon: 'fa-solid fa-fire' },
          { label: 'Muscle Gain', val: 'muscle',       icon: 'fa-solid fa-arm-flex' }
        ]); 
        break;
      case 5: appendMsg('bot', 'Please enter your current weight (kg):'); showFreeInput('weight', 'Weight in kg…'); break;
      case 6: appendMsg('bot', 'Please enter your height (cm):'); showFreeInput('height', 'Height in cm…'); break;
      case 7: appendMsg('bot', 'Do you have any existing injuries?', [{label:'Yes',val:'yes',icon:'fa-solid fa-person-falling'},{label:'No',val:'no',icon:'fa-solid fa-person-running'}]); break;
      case 8: appendMsg('bot', 'How would you describe your current diet?', [{label:'Healthy',val:'healthy',icon:'fa-solid fa-apple-whole'},{label:'Average',val:'average',icon:'fa-solid fa-utensils'},{label:'Poor',val:'poor',icon:'fa-solid fa-burger'}]); break;
      default: finalize(); break;
    }
  }
}

function setSkipDashboard(location) {
  document.getElementById('nav-dash-link').style.display = 'block';
  document.getElementById('dash-title').innerText = currentUser.name + "'s Fitness Profile";
  document.getElementById('val-status').innerText = 'Active';
  document.getElementById('val-status').style.color = 'var(--primary)';
  document.getElementById('status-icon').style.color = 'var(--primary)';
  document.getElementById('val-plan').innerText = location === 'gym'
    ? 'Plan: Head to the gym and start your training journey!'
    : 'Plan: Train at home with a professional coach!';
  document.getElementById('rec-title').innerText = 'Fitness Recommendations';
  document.getElementById('val-score').innerText = 'N/A';
  document.getElementById('val-risk').innerText = 'Low';
  document.getElementById('val-risk').style.background = '#e0fbf6';
  document.getElementById('val-risk').style.color = 'var(--success)';
  ['stat-card-status','stat-card-score','stat-card-risk'].forEach(id => {
    document.getElementById(id)?.classList.add('hide-on-skip');
  });
  if (location === 'gym') injectGymDashSection();
  else injectHomeDashSection();
}

// ── Append Message ──────────────────────────────────────────
function appendMsg(sender, text, options = []) {
  const stream = document.getElementById('chat-stream');
  const msgDiv = document.createElement('div');
  msgDiv.style.cssText = sender === 'bot'
    ? 'background:#f0f4f8; padding:12px; border-radius:0 15px 15px 15px; margin-bottom:10px; align-self:flex-start; font-size:0.9rem;'
    : 'background:var(--primary); color:white; padding:12px; border-radius:15px; align-self:flex-end; margin-bottom:10px; font-size:0.9rem; margin-left:auto; width:fit-content;';
  msgDiv.innerText = text;
  stream.appendChild(msgDiv);
  if (options.length > 0) {
    const optBox = document.createElement('div');
    optBox.style.cssText = 'display:flex; gap:8px; margin:5px 0 15px; flex-wrap:wrap;';
    options.forEach(opt => {
      const btn = document.createElement('button');
      btn.className = 'opt-btn';
      btn.innerHTML = `<i class="${opt.icon}"></i> ${opt.label}`;
      btn.onclick = () => { optBox.remove(); handleUserAnswer(opt.val, opt.label); };
      optBox.appendChild(btn);
    });
    stream.appendChild(optBox);
  }
  stream.scrollTop = stream.scrollHeight;
}

// ── Handle User Answer ──────────────────────────────────────
function handleUserAnswer(val, label) {
  appendMsg('user', label);
  hideFreeInput();

  if (currentStep === 0) { flowType = val; chatSubFlow = ''; currentStep++; setTimeout(askNextQuestion, 600); return; }
  if (currentStep === 1) {
    if (val === 'questions') chatSubFlow = 'questions';
    else if (val === 'book') chatSubFlow = 'book';
    else if (val === 'skip') chatSubFlow = 'skip';
    currentStep++; setTimeout(askNextQuestion, 600); return;
  }

  if (flowType === 'health' && chatSubFlow !== 'book') {
    if (currentStep === 2)  answers.sleep        = val;
    if (currentStep === 3)  answers.water        = val;
    if (currentStep === 4)  answers.headache     = val;
    if (currentStep === 5)  answers.painSeverity = val;
    if (currentStep === 6)  answers.symptoms     = val;
    if (currentStep === 7)  answers.temperature  = val;
    if (currentStep === 8)  answers.breathShort  = val;
    if (currentStep === 9)  answers.duration     = val;
    if (currentStep === 10) answers.healthGoal   = val;
  }
  if (flowType === 'fitness' && chatSubFlow === 'questions') {
    if (currentStep === 2) answers.fitnessGoal = val;
    if (currentStep === 3) answers.trainFreq   = val;
    if (currentStep === 4) answers.location    = val;
    if (currentStep === 5) answers.level       = val;
    if (currentStep === 6) answers.weight      = Number(val);
    if (currentStep === 7) answers.height      = Number(val);
    if (currentStep === 8) answers.injury      = val;
    if (currentStep === 9) answers.diet        = val;
  }
  if (flowType === 'fitness' && chatSubFlow === 'skip') {
    if (currentStep === 2) answers.location = val;
  }

  currentStep++;
  setTimeout(askNextQuestion, 600);
}

// ── Gym / Coach Data ────────────────────────────────────────
const GYM_DATA = [
  { name: 'Fitness Pro Gym',       address: 'Nasr City, Cairo',    rating: 4.6, phone: '+20 100 123 4567', mapsQuery: 'Fitness+Pro+Gym+Nasr+City+Cairo'       },
  { name: 'Iron House Gym',        address: 'Maadi, Cairo',         rating: 4.4, phone: '+20 111 987 6543', mapsQuery: 'Iron+House+Gym+Maadi+Cairo'             },
  { name: 'Peak Performance Hub',  address: 'New Cairo, Cairo',     rating: 4.8, phone: '+20 100 200 3344', mapsQuery: 'Peak+Performance+Hub+New+Cairo'         },
  { name: 'PowerZone Fitness',     address: 'Heliopolis, Cairo',    rating: 4.3, phone: '+20 122 456 7890', mapsQuery: 'PowerZone+Fitness+Heliopolis+Cairo'     },
  { name: 'EliteFit Center',       address: '6th of October City',  rating: 4.7, phone: '+20 100 555 8899', mapsQuery: 'EliteFit+Center+6th+October+Cairo'      }
];

const HOME_COACHES = [
  { name: 'Coach Khaled', spec: 'HIIT & Fat Loss',         rating: 4.8, price: 'EGP 200/session', phone: '+20 100 111 2233' },
  { name: 'Coach Mariam', spec: 'Yoga & Flexibility',      rating: 4.7, price: 'EGP 180/session', phone: '+20 111 222 3344' },
  { name: 'Coach Tamer',  spec: 'Strength & Calisthenics', rating: 4.9, price: 'EGP 250/session', phone: '+20 122 333 4455' },
  { name: 'Coach Nadia',  spec: 'Pilates & Core',          rating: 4.6, price: 'EGP 160/session', phone: '+20 100 444 5566' }
];

function buildStars(rating) {
  return '★'.repeat(Math.floor(rating)) + '☆'.repeat(5 - Math.floor(rating));
}

function buildGymCardEl(gym) {
  const card = document.createElement('div');
  card.className = 'gym-card';
  card.innerHTML = `
    <div class="gym-card-name"><i class="fa-solid fa-dumbbell"></i>${gym.name}</div>
    <div class="gym-card-address"><i class="fa-solid fa-location-dot"></i>${gym.address}</div>
    <div class="gym-card-address" style="margin-top:4px;">
      <i class="fa-solid fa-phone" style="color:var(--primary);"></i>
      <span style="color:var(--primary); font-weight:700;">${gym.phone}</span>
    </div>
    <div class="gym-rating-row" style="margin-top:10px;">
      <span class="gym-stars">${buildStars(gym.rating)}</span>
      <span class="gym-rating-num">${gym.rating} / 5</span>
    </div>
    <div class="gym-contact-note"><i class="fa-solid fa-circle-info"></i>You can contact this gym now</div>
    <div class="gym-card-actions">
      <button class="gym-btn-contact" onclick="window.open('tel:${gym.phone}')">
        <i class="fa-solid fa-phone"></i> Contact Gym
      </button>
      <button class="gym-btn-location" onclick="window.open('https://maps.google.com/?q=${gym.mapsQuery}','_blank')">
        <i class="fa-solid fa-map-location-dot"></i> View Location
      </button>
    </div>`;
  return card;
}

function showGymCardsInChat() {
  const stream = document.getElementById('chat-stream');
  const header = document.createElement('div');
  header.className = 'gym-match-header';
  header.innerHTML = '<i class="fa-solid fa-location-dot"></i> Best gym matches for you';
  stream.appendChild(header);
  [GYM_DATA[2], GYM_DATA[0], GYM_DATA[4]].forEach(gym => stream.appendChild(buildGymCardEl(gym)));
  stream.scrollTop = stream.scrollHeight;
}

function showHomeCoachesInChat() {
  const stream = document.getElementById('chat-stream');
  const header = document.createElement('div');
  header.className = 'gym-match-header';
  header.style.cssText += 'background:linear-gradient(135deg,#2ec4b618,#00d4ff18); border-color:#2ec4b655; color:var(--success);';
  header.innerHTML = '<i class="fa-solid fa-house"></i> Home coaches available for you';
  stream.appendChild(header);
  HOME_COACHES.forEach(coach => {
    const card = document.createElement('div');
    card.className = 'gym-card';
    card.innerHTML = `
      <div class="gym-card-name"><i class="fa-solid fa-person-running" style="color:var(--success);"></i>${coach.name}</div>
      <div class="gym-card-address"><i class="fa-solid fa-bullseye" style="color:var(--warning);"></i>${coach.spec}</div>
      <div class="gym-rating-row" style="margin-top:8px;">
        <span class="gym-stars">${buildStars(coach.rating)}</span>
        <span class="gym-rating-num">${coach.rating} / 5</span>
      </div>
      <div style="font-weight:800; color:var(--primary); font-size:0.88rem; margin-bottom:10px;">${coach.price}</div>
      <div class="gym-card-actions">
        <button class="gym-btn-contact" onclick="window.open('tel:${coach.phone}')">
          <i class="fa-solid fa-phone"></i> Contact Coach
        </button>
        <button class="gym-btn-location" style="border-color:var(--success); color:var(--success);"
          onclick="alert('WhatsApp: ${coach.phone}')">
          <i class="fa-brands fa-whatsapp"></i> WhatsApp
        </button>
      </div>`;
    stream.appendChild(card);
  });
  stream.scrollTop = stream.scrollHeight;
}

function showSpecDoctorsInChat(specName) {
  const stream = document.getElementById('chat-stream');
  const filtered = DOCTORS_DATA.filter(d => d.spec === specName);
  const header = document.createElement('div');
  header.className = 'gym-match-header';
  header.innerHTML = `<i class="fa-solid fa-user-doctor"></i> Doctors for ${specName}`;
  stream.appendChild(header);
  if (filtered.length === 0) {
    const noDoc = document.createElement('div');
    noDoc.style.cssText = 'background:#f0f4f8; padding:12px; border-radius:12px; font-size:0.85rem; color:var(--text-muted); margin-bottom:10px;';
    noDoc.innerText = 'No doctors found for this specialization.';
    stream.appendChild(noDoc);
  }
  filtered.slice(0,3).forEach(doc => {
    const mini = document.createElement('div');
    mini.className = 'gym-card';
    const cardId = 'chat-doc-' + doc.name.replace(/[\s.]/g,'');
    mini.id = cardId;
    const slotsHTML = DOCTOR_SLOTS.map(s => `<button class="slot-btn" onclick="selectSlot(this,'${cardId}')">${s}</button>`).join('');
    mini.innerHTML = `
      <div class="gym-card-name"><i class="fa-solid fa-user-doctor"></i>${doc.name}</div>
      <div class="gym-card-address"><i class="fa-solid fa-stethoscope" style="color:var(--secondary);"></i>${doc.spec}</div>
      <div class="gym-card-address"><i class="fa-solid fa-location-dot"></i>${doc.location}</div>
      <div class="gym-rating-row" style="margin-top:8px;">
        <span class="gym-stars">${buildStars(doc.rating)}</span>
        <span class="gym-rating-num">${doc.rating} / 5</span>
      </div>
      <div style="font-weight:800; color:var(--primary); font-size:0.9rem; margin-bottom:10px;">EGP ${doc.price}</div>
      <div style="font-size:0.82rem; font-weight:700; color:var(--text-muted); margin-bottom:6px;"><i class="fa-regular fa-clock" style="margin-right:4px;"></i>Available Slots</div>
      <div class="slots-row">${slotsHTML}</div>
      <div id="selected-slot-${cardId}" style="font-size:0.8rem; color:var(--primary); font-weight:700; min-height:16px; margin-bottom:8px;"></div>
      <div class="gym-card-actions">
        <button class="gym-btn-contact" onclick="openPayment('${doc.name}',${doc.price},'${cardId}')">
          <i class="fa-solid fa-calendar-check"></i> Book Now
        </button>
        <button class="gym-btn-location" onclick="window.open('tel:${doc.phone}')">
          <i class="fa-solid fa-phone"></i> Call
        </button>
      </div>`;
    stream.appendChild(mini);
  });
  const viewAllBtn = document.createElement('button');
  viewAllBtn.className = 'view-analysis-btn';
  viewAllBtn.innerHTML = `<i class="fa-solid fa-user-doctor"></i> View All ${specName} Doctors`;
  viewAllBtn.onclick = () => { toggleChat(); showBookDoctorWithSpec(specName); };
  stream.appendChild(viewAllBtn);
  stream.scrollTop = stream.scrollHeight;
}

function showBookDoctorWithSpec(specName) {
  hideAllViews();
  document.getElementById('book-doctor-view').style.display = 'block';
  buildSpecGrid();
  selectSpec(specName);
  window.scrollTo(0, 0);
}

function injectGymDashSection() {
  document.getElementById('gym-dash-section')?.remove();
  document.getElementById('home-coaches-dash-section')?.remove();
  const section = document.createElement('div');
  section.id = 'gym-dash-section';
  section.className = 'gym-section-dash';
  section.innerHTML = '<h4><i class="fa-solid fa-location-dot"></i> Recommended Gyms Near You</h4><div class="gym-cards-grid" id="gym-cards-grid"></div>';
  document.querySelector('#dashboard-view .dashboard-grid').appendChild(section);
  const grid = document.getElementById('gym-cards-grid');
  [GYM_DATA[2], GYM_DATA[0], GYM_DATA[4]].forEach(gym => grid.appendChild(buildGymCardEl(gym)));
}

function injectHomeDashSection() {
  document.getElementById('home-coaches-dash-section')?.remove();
  document.getElementById('gym-dash-section')?.remove();
  const section = document.createElement('div');
  section.id = 'home-coaches-dash-section';
  section.className = 'coach-home-section';
  section.innerHTML = '<h4><i class="fa-solid fa-house"></i> Home Training Coaches</h4><div class="coaches-grid" id="coaches-grid"></div>';
  document.querySelector('#dashboard-view .dashboard-grid').appendChild(section);
  const grid = document.getElementById('coaches-grid');
  HOME_COACHES.forEach(coach => {
    const card = document.createElement('div');
    card.className = 'coach-card';
    card.innerHTML = `
      <div class="coach-avatar"><i class="fa-solid fa-person-running"></i></div>
      <div class="coach-name">${coach.name}</div>
      <div class="coach-spec">${coach.spec}</div>
      <div class="coach-stars">${buildStars(coach.rating)} <span style="font-size:0.8rem; font-weight:700;">${coach.rating}/5</span></div>
      <div class="coach-price">${coach.price}</div>
      <button class="coach-contact-btn" onclick="window.open('tel:${coach.phone}')">
        <i class="fa-solid fa-phone"></i> Contact Coach
      </button>`;
    grid.appendChild(card);
  });
}

// ── Doctors Data ────────────────────────────────────────────
const DOCTORS_DATA = [
  { name:'Dr. Ramy Fouad',     spec:'Cardiology & Critical Care', price:280, rating:4.7, location:'Maadi, Cairo',      phone:'+20 111 234 5670' },
  { name:'Dr. Dina Saad',      spec:'Cardiology & Critical Care', price:320, rating:4.8, location:'New Cairo',          phone:'+20 122 345 6781' },
  { name:'Dr. Sara Hossam',    spec:'General Medicine',            price:150, rating:4.7, location:'Maadi, Cairo',      phone:'+20 111 333 5678' },
  { name:'Dr. Amr Youssef',    spec:'General Medicine',            price:130, rating:4.5, location:'Heliopolis, Cairo', phone:'+20 100 444 6789' },
  { name:'Dr. Ahmed Nabil',    spec:'Internal Medicine',           price:200, rating:4.6, location:'Heliopolis, Cairo', phone:'+20 122 444 9900' },
  { name:'Dr. Hossam Refaat',  spec:'Internal Medicine',           price:220, rating:4.8, location:'Downtown, Cairo',   phone:'+20 100 556 1234' },
  { name:'Dr. Nour El-Din',    spec:'Neurology',                   price:350, rating:4.8, location:'New Cairo',          phone:'+20 100 777 1122' },
  { name:'Dr. Tarek Mansour',  spec:'Neurology',                   price:330, rating:4.7, location:'Nasr City, Cairo',  phone:'+20 111 888 2233' },
  { name:'Dr. Mona Tarek',     spec:'Pulmonology',                 price:250, rating:4.5, location:'6th October City',  phone:'+20 112 888 3344' },
  { name:'Dr. Sherif Hamdy',   spec:'Pulmonology',                 price:270, rating:4.7, location:'New Cairo',          phone:'+20 100 112 4455' },
  { name:'Dr. Karim Samir',    spec:'Emergency Medicine',          price:180, rating:4.7, location:'Downtown, Cairo',   phone:'+20 100 999 5566' },
  { name:'Dr. Noha Saber',     spec:'Emergency Medicine',          price:200, rating:4.8, location:'Maadi, Cairo',      phone:'+20 100 445 7788' },
  { name:'Dr. Hana Fahmy',     spec:'Dermatology',                 price:220, rating:4.6, location:'Zamalek, Cairo',    phone:'+20 111 000 7788' },
  { name:'Dr. Mira Adel',      spec:'Dermatology',                 price:240, rating:4.8, location:'New Cairo',          phone:'+20 122 556 8899' },
  { name:'Dr. Omar Saleh',     spec:'Orthopedics',                 price:280, rating:4.8, location:'Nasr City, Cairo',  phone:'+20 122 111 8899' },
  { name:'Dr. Islam Khairy',   spec:'Orthopedics',                 price:300, rating:4.7, location:'Heliopolis, Cairo', phone:'+20 111 778 0011' },
  { name:'Dr. Rana Mostafa',   spec:'Pediatrics',                  price:160, rating:4.9, location:'Maadi, Cairo',      phone:'+20 100 222 9900' },
  { name:'Dr. Farah Mahmoud',  spec:'Pediatrics',                  price:170, rating:4.8, location:'Zamalek, Cairo',    phone:'+20 111 101 3344' },
  { name:'Dr. Sameh Adel',     spec:'Ophthalmology',               price:200, rating:4.5, location:'Heliopolis, Cairo', phone:'+20 111 333 0011' },
  { name:'Dr. Ghada Tawfik',   spec:'Ophthalmology',               price:220, rating:4.7, location:'Nasr City, Cairo',  phone:'+20 100 212 4455' },
];

const DOCTOR_SLOTS = ['9:00 AM','10:00 AM','11:30 AM','1:00 PM','3:00 PM','5:00 PM'];
let selectedSlots = {};

function selectSlot(btn, cardId) {
  document.querySelectorAll(`#${cardId} .slot-btn`).forEach(b => b.classList.remove('selected'));
  btn.classList.add('selected');
  selectedSlots[cardId] = btn.innerText;
  const label = document.getElementById('selected-slot-' + cardId);
  if (label) label.innerText = '✓ Selected: ' + btn.innerText;
}

function buildDoctorCard(doc) {
  const cardId = 'doc-' + doc.name.replace(/[\s.]/g,'');
  const card = document.createElement('div');
  card.id = cardId;
  card.style.cssText = 'background:white; border:1px solid var(--glass-border); border-radius:20px; padding:22px; transition:0.3s; box-shadow:0 4px 18px rgba(0,119,255,0.06);';
  card.onmouseenter = () => card.style.transform = 'translateY(-5px)';
  card.onmouseleave = () => card.style.transform = 'translateY(0)';
  const slotsHTML = DOCTOR_SLOTS.map(s => `<button class="slot-btn" onclick="selectSlot(this,'${cardId}')">${s}</button>`).join('');
  card.innerHTML = `
    <div style="display:flex; align-items:center; gap:12px; margin-bottom:14px;">
      <div style="width:48px; height:48px; background:linear-gradient(135deg,var(--primary),var(--secondary)); border-radius:50%; display:flex; align-items:center; justify-content:center; flex-shrink:0;">
        <i class="fa-solid fa-user-doctor" style="color:white; font-size:1.2rem;"></i>
      </div>
      <div>
        <div style="font-weight:800; font-size:1rem;">${doc.name}</div>
        <div style="font-size:0.8rem; color:var(--text-muted);">${doc.spec}</div>
      </div>
    </div>
    <div style="display:flex; justify-content:space-between; margin-bottom:10px; font-size:0.88rem;">
      <span style="color:var(--text-muted); font-weight:600;"><i class="fa-solid fa-tag" style="margin-right:5px;"></i>Fee</span>
      <span style="font-weight:800; color:var(--primary);">EGP ${doc.price}</span>
    </div>
    <div style="display:flex; justify-content:space-between; margin-bottom:10px; font-size:0.88rem;">
      <span style="color:var(--text-muted); font-weight:600;"><i class="fa-solid fa-location-dot" style="margin-right:5px;"></i>Location</span>
      <span style="font-weight:700;">${doc.location}</span>
    </div>
    <div style="display:flex; align-items:center; gap:8px; margin-bottom:14px;">
      <span style="color:#f4b400;">${buildStars(doc.rating)}</span>
      <span style="font-size:0.85rem; font-weight:700; background:#fff8e1; color:#b8860b; padding:2px 10px; border-radius:20px;">${doc.rating} / 5</span>
    </div>
    <div style="margin-bottom:14px;">
      <div style="font-size:0.85rem; font-weight:700; color:var(--text-muted); margin-bottom:8px;">
        <i class="fa-regular fa-clock" style="margin-right:5px;"></i>Available Slots — Today
      </div>
      <div class="slots-row">${slotsHTML}</div>
      <div id="selected-slot-${cardId}" style="font-size:0.82rem; color:var(--primary); font-weight:700; min-height:18px;"></div>
    </div>
    <div style="display:flex; gap:8px;">
      <button class="btn-glow" style="flex:1; justify-content:center; padding:10px; font-size:0.85rem;"
        onclick="openPayment('${doc.name}', ${doc.price}, '${cardId}')">
        <i class="fa-solid fa-calendar-check"></i> Book Now
      </button>
      <button class="gym-btn-location" style="flex:1; font-size:0.85rem;" onclick="window.open('tel:${doc.phone}')">
        <i class="fa-solid fa-phone"></i> Call
      </button>
    </div>`;
  return card;
}

// ── Specializations ─────────────────────────────────────────
const SPECIALIZATIONS = [
  { name:'Cardiology & Critical Care', icon:'fa-solid fa-heart-pulse'    },
  { name:'General Medicine',            icon:'fa-solid fa-user-doctor'    },
  { name:'Internal Medicine',           icon:'fa-solid fa-stethoscope'    },
  { name:'Neurology',                   icon:'fa-solid fa-brain'          },
  { name:'Pulmonology',                 icon:'fa-solid fa-lungs'          },
  { name:'Emergency Medicine',          icon:'fa-solid fa-truck-medical'  },
  { name:'Dermatology',                 icon:'fa-solid fa-hand-dots'      },
  { name:'Orthopedics',                 icon:'fa-solid fa-bone'           },
  { name:'Pediatrics',                  icon:'fa-solid fa-baby'           },
  { name:'Ophthalmology',               icon:'fa-solid fa-eye'            }
];

function buildSpecGrid() {
  const grid = document.getElementById('specGrid');
  grid.innerHTML = '';
  SPECIALIZATIONS.forEach(spec => {
    const card = document.createElement('div');
    card.className = 'spec-card';
    card.innerHTML = `<i class="${spec.icon}"></i>${spec.name}`;
    card.onclick = () => selectSpec(spec.name);
    grid.appendChild(card);
  });
}

function selectSpec(specName) {
  document.getElementById('spec-selector-section').style.display = 'none';
  document.getElementById('spec-doctors-section').style.display  = 'block';
  document.getElementById('spec-doctors-title').innerText = `${specName} Doctors`;
  const grid = document.getElementById('bookDoctorsGrid');
  grid.innerHTML = '';
  const docs = DOCTORS_DATA.filter(d => d.spec === specName);
  if (docs.length === 0) {
    grid.innerHTML = '<p style="color:var(--text-muted); text-align:center; padding:20px;">No doctors found for this specialization.</p>';
  } else {
    docs.forEach(doc => grid.appendChild(buildDoctorCard(doc)));
  }
}

function resetSpecSelection() {
  document.getElementById('spec-selector-section').style.display = 'block';
  document.getElementById('spec-doctors-section').style.display  = 'none';
}

// ── Payment Flow ────────────────────────────────────────────
let currentPayDoc = '', currentPayPrice = 0, currentPaySlot = '';

function openPayment(docName, price, cardId) {
  const slot = selectedSlots[cardId] || null;
  if (!slot) { alert('Please select an available time slot first.'); return; }
  currentPayDoc = docName; currentPayPrice = price; currentPaySlot = slot;
  ['pay-step-delivery','pay-step-cash','pay-step-visa','pay-step-success'].forEach(id => {
    document.getElementById(id).style.display = 'none';
  });
  document.getElementById('pay-step-1').style.display     = 'block';
  document.getElementById('pay-doc-info').innerText  = `${docName} • EGP ${price}`;
  document.getElementById('pay-slot-info').innerText = `📅 Appointment: Today at ${slot}`;
  document.getElementById('paymentOverlay').style.display = 'flex';
}

function closePayment() { document.getElementById('paymentOverlay').style.display = 'none'; }

async function selectPayment(method) {
  const isShop = currentPayDoc === 'Shop Order';

  if (!isShop && currentPayDoc && currentPaySlot) {
    // Try to save booking to API
    const result = await apiCall('POST', '/booking', {
      targetId:      null, // no DB doctor ID in frontend-only static data
      targetType:    'doctor',
      date:          'Today',
      timeSlot:      currentPaySlot,
      paymentMethod: method,
      fee:           currentPayPrice,
      notes:         `Booked with ${currentPayDoc}`,
    });
    // Also save locally as fallback
    const bookings = getStoredBookings();
    bookings.push({ doctor: currentPayDoc, date: 'Today', time: currentPaySlot, price: currentPayPrice, method, savedAt: new Date().toISOString() });
    saveStoredBookings(bookings);
  }

  document.getElementById('pay-step-1').style.display = 'none';
  if (method === 'cash') {
    document.getElementById('cash-confirm-text').innerText = isShop
      ? `Your order is confirmed. Total: $${currentPayPrice}.`
      : `Appointment with ${currentPayDoc} confirmed for today at ${currentPaySlot}. Total: EGP ${currentPayPrice}.`;
    document.getElementById('pay-step-cash').style.display = 'block';
    if (isShop) { cart = []; updateCartBar(); }
  } else {
    document.getElementById('visa-amount-text').innerText = isShop ? `Total: $${currentPayPrice}` : `Total: EGP ${currentPayPrice}`;
    document.getElementById('pay-step-visa').style.display = 'block';
  }
}

function formatCard(inp) {
  let v = inp.value.replace(/\D/g,'').substring(0,16);
  inp.value = v.replace(/(.{4})/g,'$1 ').trim();
}
function formatExpiry(inp) {
  let v = inp.value.replace(/\D/g,'').substring(0,4);
  if (v.length >= 3) v = v.substring(0,2) + ' / ' + v.substring(2);
  inp.value = v;
}

async function submitVisa() {
  const name   = document.getElementById('visa-name').value.trim();
  const number = document.getElementById('visa-number').value.trim();
  const expiry = document.getElementById('visa-expiry').value.trim();
  const cvv    = document.getElementById('visa-cvv').value.trim();
  if (!name || number.replace(/\s/g,'').length < 16 || expiry.length < 7 || cvv.length < 3) {
    alert('Please fill in all card details correctly.'); return;
  }

  if (currentPayDoc === 'Shop Order') {
    // Save order via API
    await apiCall('POST', '/orders', {
      items: cart.map(i => ({ productName: i.name, price: i.price, quantity: i.qty })),
      paymentMethod: 'visa',
      cardName: name, cardNumber: number, cardExpiry: expiry, cardCVV: cvv,
    });
    const orders = getStoredOrders();
    cart.forEach(item => orders.push({ name: item.name, price: item.price, qty: item.qty, savedAt: new Date().toISOString() }));
    saveStoredOrders(orders);
    cart = []; updateCartBar();
  }

  document.getElementById('pay-step-visa').style.display = 'none';
  document.getElementById('visa-confirm-text').innerText = currentPayDoc === 'Shop Order'
    ? `Payment of $${currentPayPrice} confirmed. Your order is on its way!`
    : `Payment of EGP ${currentPayPrice} confirmed. Appointment with ${currentPayDoc} at ${currentPaySlot}.`;
  document.getElementById('pay-step-success').style.display = 'block';
}

function showDoctorsSection() {
  const section = document.getElementById('doctors-section');
  const grid    = document.getElementById('doctors-grid');
  section.style.display = 'block';
  grid.innerHTML = '';
  DOCTORS_DATA.forEach(doc => grid.appendChild(buildDoctorCard(doc)));
}

// ── Finalize Chatbot ─────────────────────────────────────────
async function finalize() {
  appendMsg('bot', 'Processing your responses…');
  setTimeout(async () => {
    let plan = '';
    answers.flowType = flowType;

    if (flowType === 'health') {
      const score  = calculateScore(answers);
      const result = calculateStatus(score);
      const adviceList = generateAdvice(answers, result.status);

      if (result.status === 'Critical')       plan = 'Alert: High risk detected. Immediate intervention needed.';
      else if (result.status === 'Moderate')  plan = 'Caution: Some symptoms detected. Monitor closely and rest well.';
      else                                    plan = 'Excellent! Your vitals are stable.';

      const colorMap = { Stable:'var(--success)', Moderate:'var(--warning)', Critical:'var(--danger)' };
      const color = colorMap[result.status];
      document.getElementById('val-status').innerText    = result.status;
      document.getElementById('val-status').style.color  = color;
      document.getElementById('status-icon').style.color = color;
      document.getElementById('val-plan').innerText      = plan;
      document.getElementById('rec-title').innerText     = 'Medical Recommendations';
      const scoreEl = document.getElementById('val-score');
      scoreEl.innerText   = score;
      scoreEl.style.color = color;
      document.getElementById('score-subtext').innerText = 'Lower is better';
      const riskEl = document.getElementById('val-risk');
      riskEl.innerText = result.risk;
      const rs = { Low:['#e0fbf6','var(--success)'], Medium:['#fff4e5','var(--warning)'], High:['#fff0f0','var(--danger)'] };
      riskEl.style.background = rs[result.risk][0];
      riskEl.style.color      = rs[result.risk][1];
      document.getElementById('val-advice').innerHTML = adviceList.map(t => `<li><i class="fa-solid fa-circle-check"></i> ${t}</li>`).join('');
      if (result.status === 'Critical') showDoctorsSection();
      else document.getElementById('doctors-section').style.display = 'none';

      // Save to API
      await apiCall('POST', '/chatbot', answers);

    } else {
      // Fitness
      if (answers.fitnessGoal === 'muscle')
        plan = `Plan: High-protein intake and ${answers.location === 'gym' ? 'heavy lifting' : 'bodyweight strength'} 4×/week.`;
      else if (answers.fitnessGoal === 'fat')
        plan = `Plan: Calorie deficit and high-intensity training ${answers.trainFreq} times weekly.`;
      else
        plan = `Plan: Balanced approach with flexibility and moderate cardio.`;

      if (answers.diet === 'poor') plan += ' ⚠️ Improve your diet — nutrition is 70% of the result.';
      if (answers.injury === 'yes') plan += ' 🩹 Modify exercises around your injury.';

      document.getElementById('val-status').innerText    = 'Active';
      document.getElementById('val-status').style.color  = 'var(--primary)';
      document.getElementById('status-icon').style.color = 'var(--primary)';
      document.getElementById('val-plan').innerText      = plan;
      document.getElementById('rec-title').innerText     = 'Fitness Recommendations';

      const bmi    = calcBMI(answers.weight, answers.height);
      const bmiCat = bmi ? bmiCategory(Number(bmi)) : null;
      const scoreEl = document.getElementById('val-score');
      if (bmi) { scoreEl.innerText = bmi; scoreEl.style.color = bmiCat.color; }
      else      { scoreEl.innerText = 'N/A'; scoreEl.style.color = 'var(--text-muted)'; }

      const riskEl = document.getElementById('val-risk');
      let rL = 'Low', rB = '#e0fbf6', rC = 'var(--success)';
      if (bmiCat?.label === 'Overweight') { rL = 'Medium'; rB = '#fff4e5'; rC = 'var(--warning)'; }
      if (bmiCat?.label === 'Obese')      { rL = 'High';   rB = '#fff0f0'; rC = 'var(--danger)';  }
      if (bmiCat?.label === 'Underweight'){ rL = 'Medium'; rB = '#fff4e5'; rC = 'var(--warning)'; }
      riskEl.innerText = rL; riskEl.style.background = rB; riskEl.style.color = rC;

      const fitnessAdvice = [];
      if (bmiCat?.label === 'Obese')       fitnessAdvice.push('⚠️ BMI indicates obesity. Focus on consistent cardio and calorie deficit.');
      if (bmiCat?.label === 'Overweight')  fitnessAdvice.push('BMI is above normal. Gradual weight loss recommended.');
      if (bmiCat?.label === 'Underweight') fitnessAdvice.push('BMI is low — prioritise nutrition and increase caloric intake.');
      if (answers.diet === 'poor')    fitnessAdvice.push('Improve your diet quality.');
      if (answers.injury === 'yes')   fitnessAdvice.push('Consult a physiotherapist about your injury.');
      if (fitnessAdvice.length === 0) fitnessAdvice.push('Great fitness habits! Keep up consistency.');
      document.getElementById('val-advice').innerHTML = fitnessAdvice.map(t => `<li><i class="fa-solid fa-circle-check"></i> ${t}</li>`).join('');
      document.getElementById('doctors-section').style.display = 'none';
      if (answers.location === 'gym')  injectGymDashSection();
      else if (answers.location === 'home') injectHomeDashSection();

      await apiCall('POST', '/chatbot', answers);
    }

    document.getElementById('nav-dash-link').style.display = 'block';
    document.getElementById('dash-title').innerText = `${currentUser.name}'s Health Profile`;

    const stream = document.getElementById('chat-stream');
    const vBtn = document.createElement('button');
    vBtn.className = 'view-analysis-btn';
    vBtn.innerHTML = '<i class="fa-solid fa-chart-line"></i> View Full Dashboard';
    vBtn.onclick = () => { toggleChat(); showDashboard(); };
    stream.appendChild(vBtn);
    stream.scrollTop = stream.scrollHeight;
  }, 1000);
}

// ── Shop Cart ────────────────────────────────────────────────
let cart = [];

function addToCart(btn, name, price, productId) {
  const existing = cart.find(i => i.name === name);
  if (existing) { existing.qty++; }
  else {
    cart.push({ name, price, qty: 1, productId });
    const orders = getStoredOrders();
    orders.push({ name, price, qty: 1, savedAt: new Date().toISOString() });
    saveStoredOrders(orders);
    btn.innerHTML = '<i class="fa-solid fa-circle-check"></i> Added ✓';
    btn.style.background = 'var(--success)';
    setTimeout(() => { btn.innerHTML = '<i class="fa-solid fa-cart-plus"></i> Add More'; btn.style.background = ''; }, 1200);
  }
  updateCartBar();
}

function updateCartBar() {
  const bar   = document.getElementById('cart-bar');
  const total = cart.reduce((s, i) => s + i.price * i.qty, 0);
  const count = cart.reduce((s, i) => s + i.qty, 0);
  document.getElementById('cart-count-text').innerText = `${count} item${count !== 1 ? 's' : ''} in cart`;
  document.getElementById('cart-total-text').innerText = `— Total: $${total.toFixed(2)}`;
  bar.style.display = count > 0 ? 'flex' : 'none';
}

function openShopPayment() {
  if (cart.length === 0) return;
  const total = cart.reduce((s, i) => s + i.price * i.qty, 0);
  currentPayDoc   = 'Shop Order';
  currentPayPrice = total.toFixed(2);
  currentPaySlot  = cart.map(i => `${i.name} x${i.qty}`).join(', ');
  ['pay-step-1','pay-step-cash','pay-step-visa','pay-step-success'].forEach(id => {
    document.getElementById(id).style.display = 'none';
  });
  document.getElementById('pay-step-delivery').style.display = 'block';
  ['delivery-name','delivery-phone','delivery-address'].forEach(id => {
    document.getElementById(id).value = '';
  });
  document.getElementById('paymentOverlay').style.display = 'flex';
}

function submitDelivery() {
  const name    = document.getElementById('delivery-name').value.trim();
  const phone   = document.getElementById('delivery-phone').value.trim();
  const address = document.getElementById('delivery-address').value.trim();
  if (!name || !phone || !address) { alert('Please fill in all delivery details.'); return; }
  document.getElementById('pay-step-delivery').style.display = 'none';
  document.getElementById('pay-step-1').style.display        = 'block';
  document.getElementById('pay-doc-info').innerText  = `Order: ${cart.map(i => i.name).join(', ')}`;
  document.getElementById('pay-slot-info').innerText = `📦 Deliver to: ${address} • Total: $${currentPayPrice}`;
}

// ── Storage Helpers ──────────────────────────────────────────
function getStoredBookings() { try { return JSON.parse(localStorage.getItem('hc_bookings') || '[]'); } catch { return []; } }
function saveStoredBookings(arr) { localStorage.setItem('hc_bookings', JSON.stringify(arr)); }
function getStoredOrders() { try { return JSON.parse(localStorage.getItem('hc_orders') || '[]'); } catch { return []; } }
function saveStoredOrders(arr) { localStorage.setItem('hc_orders', JSON.stringify(arr)); }

// ── My Bookings UI ───────────────────────────────────────────
function openMyBookings() {
  document.getElementById('profileMenu').classList.remove('active');
  const bookings = getStoredBookings();
  const list = document.getElementById('myBookingsList');
  list.innerHTML = '';
  if (bookings.length === 0) {
    list.innerHTML = '<div class="records-empty"><i class="fa-solid fa-calendar-xmark"></i>No bookings yet.</div>';
  } else {
    bookings.slice().reverse().forEach(b => {
      const d = new Date(b.savedAt);
      const when = isNaN(d) ? '' : d.toLocaleDateString('en-EG', { day:'numeric', month:'short', year:'numeric' });
      const item = document.createElement('div');
      item.className = 'record-item';
      item.innerHTML = `
        <div class="record-item-icon"><i class="fa-solid fa-user-doctor"></i></div>
        <div class="record-item-body">
          <div class="record-item-title">${b.doctor || 'Doctor'}</div>
          <div class="record-item-meta"><i class="fa-regular fa-calendar" style="margin-right:4px;"></i>${b.date || '—'} &nbsp; <i class="fa-regular fa-clock" style="margin-right:4px;"></i>${b.time || '—'}</div>
          ${b.price ? `<div class="record-item-meta" style="margin-top:3px;"><i class="fa-solid fa-tag" style="margin-right:4px;"></i>EGP ${b.price} · ${b.method || 'cash'}</div>` : ''}
          <div class="record-item-meta" style="margin-top:3px; font-size:0.75rem; opacity:0.7;">${when}</div>
        </div>`;
      list.appendChild(item);
    });
  }
  document.getElementById('myBookingsOverlay').classList.add('active');
}
function closeMyBookings() { document.getElementById('myBookingsOverlay').classList.remove('active'); }
function clearMyBookings() {
  if (confirm('Clear all saved bookings?')) {
    saveStoredBookings([]);
    document.getElementById('myBookingsList').innerHTML = '<div class="records-empty"><i class="fa-solid fa-calendar-xmark"></i>No bookings yet.</div>';
  }
}

// ── My Orders UI ─────────────────────────────────────────────
function openMyOrders() {
  document.getElementById('profileMenu').classList.remove('active');
  const orders = getStoredOrders();
  const list = document.getElementById('myOrdersList');
  list.innerHTML = '';
  if (orders.length === 0) {
    list.innerHTML = '<div class="records-empty"><i class="fa-solid fa-box-open"></i>No orders yet.</div>';
  } else {
    const grouped = {};
    orders.forEach(o => {
      if (!grouped[o.name]) grouped[o.name] = { ...o, qty: 0 };
      grouped[o.name].qty += (o.qty || 1);
    });
    Object.values(grouped).forEach(o => {
      const d = new Date(o.savedAt);
      const when = isNaN(d) ? '' : d.toLocaleDateString('en-EG', { day:'numeric', month:'short', year:'numeric' });
      const item = document.createElement('div');
      item.className = 'record-item';
      item.innerHTML = `
        <div class="record-item-icon" style="background:var(--success);"><i class="fa-solid fa-capsules"></i></div>
        <div class="record-item-body">
          <div class="record-item-title">${o.name}</div>
          <div class="record-item-meta"><i class="fa-solid fa-hashtag" style="margin-right:4px;"></i>Qty: ${o.qty}</div>
          <div class="record-item-price" style="margin-top:4px;">$${(o.price * o.qty).toFixed(2)}</div>
          <div class="record-item-meta" style="margin-top:2px; font-size:0.75rem; opacity:0.7;">${when}</div>
        </div>`;
      list.appendChild(item);
    });
  }
  document.getElementById('myOrdersOverlay').classList.add('active');
}
function closeMyOrders() { document.getElementById('myOrdersOverlay').classList.remove('active'); }
function clearMyOrders() {
  if (confirm('Clear all saved orders?')) {
    saveStoredOrders([]);
    document.getElementById('myOrdersList').innerHTML = '<div class="records-empty"><i class="fa-solid fa-box-open"></i>No orders yet.</div>';
  }
}

// ── Close overlays on outside click ─────────────────────────
document.addEventListener('DOMContentLoaded', () => {
  document.getElementById('myBookingsOverlay').addEventListener('click', function(e) { if (e.target === this) closeMyBookings(); });
  document.getElementById('myOrdersOverlay').addEventListener('click',  function(e) { if (e.target === this) closeMyOrders(); });
  document.getElementById('planModal').addEventListener('click', function(e) { if (e.target === this) closePlanModal(); });
  
  // Initialize landing sections visibility based on login
  updateLandingSectionsVisibility();
});

// ── Landing Sections Visibility ─────────────────────────────
function updateLandingSectionsVisibility() {
  // Keep home page visible, only hide the logged-out CTA section
  const ctaSection = document.getElementById('cta-section-logged-out');
  if (!ctaSection) return;
  
  if (currentUser.auth) {
    ctaSection.style.display = 'none';
  } else {
    ctaSection.style.display = 'block';
  }
}

// ── Testimonial Carousel ───────────────────────────────────
let currentTestimonial = 0;
const testimonialCards = 10;

function nextTestimonial() {
  const carousel = document.getElementById('testimonial-carousel');
  if (!carousel) return;
  currentTestimonial = (currentTestimonial + 1) % testimonialCards;
  carousel.style.transform = `translateX(-${currentTestimonial * 380}px)`;
}

function prevTestimonial() {
  const carousel = document.getElementById('testimonial-carousel');
  if (!carousel) return;
  currentTestimonial = (currentTestimonial - 1 + testimonialCards) % testimonialCards;
  carousel.style.transform = `translateX(-${currentTestimonial * 380}px)`;
}

// ── Plans Functions ─────────────────────────────────────────
let currentPlan = null;

async function loadLatestPlan() {
  if (!currentUser.auth) return;
  
  const result = await apiCall('GET', '/plans?type=latest');
  if (result.ok && result.data) {
    currentPlan = result.data;
    showPlanInMenu(result.data);
  } else {
    hidePlanInMenu();
  }
}

function showPlanInMenu(plan) {
  const planSection = document.getElementById('menuPlanSection');
  const planCard = document.getElementById('menuPlanCard');
  
  if (planSection && planCard) {
    planSection.style.display = 'block';
    document.getElementById('menuPlanTitle').innerText = plan.title;
    document.getElementById('menuPlanSummary').innerText = plan.summary || 'Your personalized plan is ready';
  }
}

function hidePlanInMenu() {
  const planSection = document.getElementById('menuPlanSection');
  if (planSection) planSection.style.display = 'none';
}

function openPlanModal() {
  if (!currentPlan) return;
  
  document.getElementById('profileMenu').classList.remove('active');
  const modal = document.getElementById('planModal');
  modal.style.display = 'flex';
  
  // Fill plan details
  document.getElementById('planModalTitle').innerText = currentPlan.type === 'treatment' ? '🏥 Treatment Plan' : '💪 Fitness Plan';
  document.getElementById('planTitle').innerText = currentPlan.title;
  document.getElementById('planPatientName').innerText = currentPlan.patient_name || currentUser.name;
  document.getElementById('planSummary').innerText = currentPlan.summary || 'No summary available';
  
  // Exercises
  let exercisesHtml = '';
  if (currentPlan.exercises) {
    try {
      const exercises = typeof currentPlan.exercises === 'string' ? JSON.parse(currentPlan.exercises) : currentPlan.exercises;
      exercises.forEach(ex => {
        exercisesHtml += `<li><strong>${ex.name}</strong>: ${ex.sets}x${ex.reps} - ${ex.rest}</li>`;
      });
    } catch(e) {
      exercisesHtml = currentPlan.exercises;
    }
  }
  document.getElementById('planExercises').innerHTML = exercisesHtml || '<li>No exercises specified</li>';
  
  document.getElementById('planDiet').innerText = currentPlan.diet_plan || 'No diet plan specified';
  document.getElementById('planSupplements').innerText = currentPlan.supplements || 'No supplements specified';
  document.getElementById('planMedicines').innerText = currentPlan.medicines || 'No medicines specified';
  document.getElementById('planInstructions').innerText = currentPlan.instructions || 'No special instructions';
  document.getElementById('planFollowUp').innerText = currentPlan.follow_up || 'No follow-up specified';
  document.getElementById('planLifestyle').innerText = currentPlan.lifestyle_tips || 'No lifestyle tips specified';
}

function closePlanModal() {
  document.getElementById('planModal').style.display = 'none';
}

// Generate Treatment Plan after doctor booking
async function generateTreatmentPlan(doctorName, patientName) {
  const planData = {
    type: 'treatment',
    title: `Treatment Plan - ${doctorName}`,
    patientName: patientName,
    summary: 'Prescribed treatment plan based on your consultation',
    medicines: '• Paracetamol 500mg - 1 tablet 3 times daily\n• Vitamin C 1000mg - 1 tablet daily\n• Follow prescribed dosage as directed',
    instructions: '• Complete full course of medicines\n• Rest for 2-3 days\n• Avoid heavy physical activity\n• Stay hydrated\n• Take medicines after meals',
    followUp: 'Follow-up appointment in 1 week or if symptoms worsen',
    lifestyleTips: '• Get 7-8 hours of sleep\n• Eat healthy, balanced meals\n• Avoid stress\n• Exercise lightly after recovery'
  };
  
const result = await apiCall('POST', '/plans', planData);
  if (result.ok && result.data) {
    currentPlan = result.data;
    showPlanInMenu(result.data);
  }
}

// Generate Detailed Weekly Workout Plan with Diet (NEW)
async function generateFitnessPlanWithDetails() {
  const location = answers.location || 'home';
  const trainGoal = answers.trainGoal || 'general';
  const userName = currentUser.name || 'User';
  
  // Show typing animation
  const stream = document.getElementById('chat-stream');
  const typingMsg = document.createElement('div');
  typingMsg.id = 'typing-indicator';
  typingMsg.style.cssText = 'background:#f0f4f8; padding:12px; border-radius:0 15px 15px 15px; margin-bottom:10px; font-size:0.9rem; color:var(--text-muted);';
  typingMsg.innerHTML = '<i class="fa-solid fa-robot fa-fade"></i> Generating your personalized weekly plan...';
  stream.appendChild(typingMsg);
  stream.scrollTop = stream.scrollHeight;
  
  setTimeout(async () => {
    // Remove typing indicator
    const typingEl = document.getElementById('typing-indicator');
    if (typingEl) typingEl.remove();
    
    // Generate Weekly Workout Plan
    const weeklyPlan = generateWeeklyWorkoutPlan(location, trainGoal);
    const dietPlan = generateDietPlan(trainGoal);
    
    // Display Workout Plan Card
    const workoutCard = document.createElement('div');
    workoutCard.style.cssText = 'background:white; border:2px solid var(--primary); border-radius:16px; padding:20px; margin:10px 0; text-align:left;';
    workoutCard.innerHTML = `
      <h4 style="font-size:1.1rem; font-weight:800; color:var(--primary); margin-bottom:15px;">🏋️ Your Weekly Workout Plan</h4>
      <div style="font-size:0.85rem; color:var(--text-muted); margin-bottom:15px;">Training Location: ${location === 'gym' ? '🏋️ Gym' : '🏠 Home'} | Focus: ${trainGoal}</div>
      ${weeklyPlan.map((day, i) => `
        <div style="margin-bottom:12px; padding:10px; background:var(--bg-light); border-radius:10px;">
          <div style="font-weight:700; color:var(--text-main); font-size:0.9rem;">Day ${i+1}: ${day.day}</div>
          <div style="font-size:0.8rem; color:var(--text-muted); margin-top:4px;">${day.exercises.join(', ')}</div>
        </div>
      `).join('')}
    `;
    stream.appendChild(workoutCard);
    
    // Display Diet Plan Card
    const dietCard = document.createElement('div');
    dietCard.style.cssText = 'background:white; border:2px solid var(--success); border-radius:16px; padding:20px; margin:10px 0; text-align:left;';
    dietCard.innerHTML = `
      <h4 style="font-size:1.1rem; font-weight:800; color:var(--success); margin-bottom:15px;">🥗 Your Daily Diet Plan</h4>
      <div style="font-size:0.85rem; color:var(--text-muted); margin-bottom:15px;">Goal: ${trainGoal === 'muscle' ? '💪 Muscle Gain' : trainGoal === 'fatloss' ? '🔥 Weight Loss' : '⚖️ General Fitness'}</div>
      <div style="margin-bottom:10px;"><strong>🌅 Breakfast:</strong><div style="font-size:0.85rem; color:var(--text-muted);">${dietPlan.breakfast}</div></div>
      <div style="margin-bottom:10px;"><strong>☀️ Lunch:</strong><div style="font-size:0.85rem; color:var(--text-muted);">${dietPlan.lunch}</div></div>
      <div style="margin-bottom:10px;"><strong>🌙 Dinner:</strong><div style="font-size:0.85rem; color:var(--text-muted);">${dietPlan.dinner}</div></div>
      <div style="margin-bottom:10px;"><strong>🍎 Snacks:</strong><div style="font-size:0.85rem; color:var(--text-muted);">${dietPlan.snacks}</div></div>
    `;
    stream.appendChild(dietCard);
    
    // Save to Supabase
    const planData = {
      type: 'fitness',
      title: `Weekly ${trainGoal === 'muscle' ? 'Muscle' : trainGoal === 'fatloss' ? 'Weight Loss' : 'Fitness'} Plan - ${location === 'gym' ? 'Gym' : 'Home'}`,
      patientName: userName,
      summary: `Your personalized weekly workout and diet plan for ${trainGoal} goal`,
      exercises: weeklyPlan,
      dietPlan: `Breakfast: ${dietPlan.breakfast}\nLunch: ${dietPlan.lunch}\nDinner: ${dietPlan.dinner}\nSnacks: ${dietPlan.snacks}`,
      supplements: trainGoal === 'muscle' ? '• Whey Protein\n• Creatine 5g\n• Multivitamin' : trainGoal === 'fatloss' ? '• L-Carnitine\n• Fat Burner\n• Electrolytes' : '• Multivitamin\n• Fish Oil',
      instructions: '• Follow the weekly schedule\n• Rest on rest days\n• Stay hydrated\n• Track your progress',
      followUp: 'Weekly progress check-in',
      lifestyleTips: '• Sleep 7-8 hours\n• Consistency is key\n• Progressive overload'
    };
    
    const result = await apiCall('POST', '/plans', planData);
    if (result.ok && result.data) {
      currentPlan = result.data;
      showPlanInMenu(result.data);
    }
    
    // Add Go to Dashboard button
    const goBtn = document.createElement('button');
    goBtn.className = 'view-analysis-btn';
    goBtn.style.background = 'linear-gradient(45deg,#2ec4b6,#00d4ff)';
    goBtn.style.marginTop = '15px';
    goBtn.innerHTML = '<i class="fa-solid fa-chart-line"></i> View Full Dashboard';
    goBtn.onclick = () => {
      setSkipDashboard(location);
      toggleChat(); showDashboard();
    };
    stream.appendChild(goBtn);
    stream.scrollTop = stream.scrollHeight;
  }, 1500);
}

function generateWeeklyWorkoutPlan(location, goal) {
  const isGym = location === 'gym';
  
  const gymExercises = {
    fullbody: ['Bench Press', 'Lat Pulldown', 'Squats', 'Shoulder Press', 'Rows'],
    upper: ['Bench Press', 'Pull-ups', 'Shoulder Press', 'Dumbbell Curls', 'Tricep Dips'],
    lower: ['Leg Press', 'Deadlifts', 'Lunges', 'Calf Raises', 'Leg Curls'],
    abs: ['Cable Crunches', 'Hanging Leg Raises', 'Plank', 'Russian Twists', 'Ab Roller'],
    fatloss: ['Treadmill', 'Rowing Machine', 'Jump Rope', 'Battle Ropes', 'Burpees'],
    muscle: ['Bench Press', 'Deadlifts', 'Squats', 'Pull-ups', 'Overhead Press']
  };
  
  const homeExercises = {
    fullbody: ['Push-ups', 'Squats', 'Lunges', 'Plank', 'Mountain Climbers'],
    upper: ['Push-ups', 'Diamond Push-ups', 'Pike Push-ups', 'Tricep Dips', 'Superman'],
    lower: ['Squats', 'Lunges', 'Jump Squats', 'Calf Raises', 'Glute Bridges'],
    abs: ['Plank', 'Crunches', 'Leg Raises', 'Bicycle Crunches', 'V-Ups'],
    fatloss: ['Jumping Jacks', 'Burpees', 'Mountain Climbers', 'High Knees', 'Jump Rope'],
    muscle: ['Push-ups', 'Squats', 'Lunges', 'Plank', 'Burpees']
  };
  
  const exercises = isGym ? gymExercises[goal] : homeExercises[goal];
  
  return [
    { day: exercises[0] || 'Upper Body', exercises: isGym ? ['Bench Press 4x12', 'Lat Pulldown 3x12', 'Shoulder Press 3x10'] : ['Push-ups 4x15', 'Diamond Push-ups 3x12', 'Pike Push-ups 3x10'] },
    { day: 'Cardio / HIIT', exercises: isGym ? ['Treadmill 20min', 'Rowing 15min', 'Cycling 15min'] : ['Jump Rope 15min', 'Burpees 3x10', 'High Knees 3x30s'] },
    { day: 'Rest', exercises: ['Light stretching', 'Yoga', 'Walk'] },
    { day: exercises[2] || 'Lower Body', exercises: isGym ? ['Squats 4x10', 'Deadlifts 3x10', 'Leg Press 3x12'] : ['Squats 4x20', 'Lunges 3x12', 'Jump Squats 3x10'] },
    { day: exercises[3] || 'Abs / Core', exercises: isGym ? ['Cable Crunches 4x15', 'Hanging Leg Raises 3x12', 'Plank 3x60s'] : ['Plank 4x60s', 'Crunches 4x20', 'Leg Raises 3x15'] },
    { day: 'Light Cardio', exercises: isGym ? ['Elliptical 20min', 'Stair Climber 15min'] : ['Jogging 20min', 'Jump Rope 10min'] },
    { day: 'Rest', exercises: ['Active recovery', 'Stretching', 'Foam rolling'] }
  ];
}

function generateDietPlan(goal) {
  if (goal === 'muscle') {
    return {
      breakfast: '3 eggs + 2 slices whole grain bread + avocado',
      lunch: '200g grilled chicken + 1 cup rice + vegetables + olive oil',
      dinner: '200g salmon + sweet potato + salad',
      snacks: 'Protein shake / Greek yogurt / Nuts / Banana'
    };
  } else if (goal === 'fatloss') {
    return {
      breakfast: '2 egg whites + oatmeal + berries',
      lunch: '150g grilled chicken + large salad + minimal dressing',
      dinner: 'White fish + steamed vegetables + quinoa',
      snacks: 'Apple / Celery sticks / Protein bar / Green tea'
    };
  } else {
    return {
      breakfast: '2 eggs + whole grain toast + fruit',
      lunch: 'Grilled chicken/rice + mixed vegetables',
      dinner: 'Lean protein + salad + small portion carbs',
      snacks: 'Fruits / Nuts / Yogurt'
    };
  }
}

// Generate Fitness Plan after gym/home booking
async function generateFitnessPlan(userName, location, fitnessGoal) {
  const focusAreas = {
    muscle: ['Chest', 'Back', 'Shoulders', 'Arms'],
    fat: ['Cardio', 'HIIT', 'Core'],
    general: ['Full Body', 'Core', 'Cardio']
  };
  
  const exercises = location === 'gym' 
    ? [
        { name: 'Bench Press', sets: '4', reps: '10-12', rest: '90s' },
        { name: 'Lat Pulldown', sets: '3', reps: '12', rest: '60s' },
        { name: 'Shoulder Press', sets: '3', reps: '10', rest: '60s' },
        { name: 'Leg Press', sets: '4', reps: '12', rest: '90s' },
        { name: 'Cable Curls', sets: '3', reps: '12', rest: '45s' }
      ]
    : [
        { name: 'Push-ups', sets: '4', reps: '15', rest: '60s' },
        { name: 'Squats', sets: '4', reps: '20', rest: '60s' },
        { name: 'Plank', sets: '3', reps: '45s', rest: '30s' },
        { name: 'Lunges', sets: '3', reps: '12 each', rest: '60s' },
        { name: 'Burpees', sets: '3', reps: '10', rest: '45s' }
      ];
  
  const dietPlan = fitnessGoal === 'muscle' 
    ? '• High protein diet (1.6-2g per kg bodyweight)\n• Chicken, fish, eggs, legumes\n• Complex carbs: rice, oats, potatoes\n• Healthy fats: nuts, avocado'
    : fitnessGoal === 'fat'
    ? '• Calorie deficit diet\n• Lean proteins: chicken breast, fish\n• High fiber vegetables\n• Limit carbs, avoid sugar\n• Small frequent meals'
    : '• Balanced diet\n• Moderate protein\n• Whole grains, fruits, vegetables\n• Stay hydrated';
  
  const planData = {
    type: 'fitness',
    title: `Fitness Plan - ${location === 'gym' ? 'Gym' : 'Home'} Training`,
    patientName: userName,
    summary: `Your personalized ${location} training plan for ${fitnessGoal} goal`,
    exercises: exercises,
    dietPlan: dietPlan,
    supplements: '• Protein powder (optional)\n• Creatine 5g daily\n• Multivitamin\n• Fish Oil',
    instructions: location === 'gym' 
      ? '• Warm up 5-10 mins before starting\n• Rest 60-90s between heavy exercises\n• Stay hydrated throughout\n• Cool down stretch after workout'
      : '• Clear space for exercises\n• Use proper form over weight\n• Rest 45-60s between exercises\n• Stay consistent',
    followUp: 'Weekly progress check-in',
    lifestyleTips: '• Sleep 7-8 hours\n• Track your meals\n• Consistency is key\n• Listen to your body'
  };
  
  const result = await apiCall('POST', '/plans', planData);
  if (result.ok && result.data) {
    currentPlan = result.data;
    showPlanInMenu(result.data);
  }
}