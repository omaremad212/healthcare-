// api/auth.js — login (?action=login) + register (?action=register)
// vercel.json routes /api/auth/login and /api/auth/register here.

const jwt    = require('jsonwebtoken');
const bcrypt = require('bcryptjs');
const { supabase } = require('../lib/supabase');

const generateToken = (id, role) =>
  jwt.sign({ id, role }, process.env.JWT_SECRET || 'secret123', { expiresIn: '7d' });

async function handleLogin(req, res) {
  const { email, password } = req.body;
  if (!email || !password)
    return res.status(400).json({ success: false, message: 'Email and password are required' });

  // Accept email OR username (for admin login with username 'admin')
  let users, error;
  if (String(email).includes('@')) {
    ({ data: users, error } = await supabase.from('users').select('*').eq('email', email.trim().toLowerCase()).limit(1));
  } else {
    ({ data: users, error } = await supabase.from('users').select('*').eq('username', email.trim().toLowerCase()).limit(1));
  }
  if (error) return res.status(500).json({ success: false, message: 'Database error' });
  if (!users || users.length === 0)
    return res.status(401).json({ success: false, message: 'Invalid credentials' });

  const user = users[0];
  if (!await bcrypt.compare(password, user.password))
    return res.status(401).json({ success: false, message: 'Invalid credentials' });

  return res.status(200).json({
    success: true,
    token: generateToken(user.id, user.role),
    user: { id: user.id, name: user.name, email: user.email, role: user.role },
  });
}

async function handleRegister(req, res) {
  const { name, email, password, role, age, gender, specialization, yearsExperience, clinicAddress, trainingType } = req.body;
  if (!name || !email || !password)
    return res.status(400).json({ success: false, message: 'Name, email, and password are required' });

  const trimmedName  = String(name).trim();
  const trimmedEmail = String(email).trim().toLowerCase();
  if (!/^[A-Za-zÀ-ɏء-ي\s]{2,80}$/.test(trimmedName))
    return res.status(400).json({ success: false, message: 'Name must be 2-80 letters only' });
  if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(trimmedEmail))
    return res.status(400).json({ success: false, message: 'Invalid email format' });
  if (String(password).length < 8)
    return res.status(400).json({ success: false, message: 'Password must be at least 8 characters' });
  if (!/[A-Za-z]/.test(password) || !/[0-9]/.test(password))
    return res.status(400).json({ success: false, message: 'Password must include letters and numbers' });
  if (role && !['patient', 'doctor', 'coach'].includes(role))
    return res.status(400).json({ success: false, message: 'Invalid role' });

  const { data: existing } = await supabase.from('users').select('id').eq('email', trimmedEmail).limit(1);
  if (existing && existing.length > 0)
    return res.status(400).json({ success: false, message: 'Email already registered' });

  const hashedPassword = await bcrypt.hash(password, await bcrypt.genSalt(10));
  const { data: newUser, error } = await supabase.from('users').insert({
    name: trimmedName, email: trimmedEmail, password: hashedPassword,
    role: role || 'patient',
    age:              role === 'patient' ? age            : null,
    gender:           role === 'patient' ? gender         : null,
    specialization:   role === 'doctor'  ? specialization : null,
    years_experience: (role === 'doctor' || role === 'coach') ? yearsExperience : null,
    clinic_address:   role === 'doctor'  ? clinicAddress  : null,
    training_type:    role === 'coach'   ? trainingType   : null,
    created_at: new Date().toISOString(),
  }).select().single();

  if (error) return res.status(500).json({ success: false, message: 'Failed to create user: ' + error.message });

  return res.status(201).json({
    success: true,
    token: generateToken(newUser.id, newUser.role),
    user: { id: newUser.id, name: newUser.name, email: newUser.email, role: newUser.role },
  });
}

module.exports = async function handler(req, res) {
  res.setHeader('Content-Type', 'application/json');
  if (req.method !== 'POST')
    return res.status(405).json({ success: false, message: 'Method not allowed' });
  try {
    if (req.query.action === 'login')    return await handleLogin(req, res);
    if (req.query.action === 'register') return await handleRegister(req, res);
    return res.status(400).json({ success: false, message: 'Unknown action' });
  } catch (err) {
    console.error('Auth error:', err);
    return res.status(500).json({ success: false, message: err.message });
  }
};
