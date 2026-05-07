// api/profile.js — User profile management

const jwt = require('jsonwebtoken');
const bcrypt = require('bcryptjs');
const { supabase } = require('../lib/supabase');

const USERNAME_RE = /^[a-zA-Z0-9_]{3,20}$/;
const EMAIL_RE = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
const NAME_RE = /^[A-Za-zÀ-ɏ؀-ۿ ]{2,80}$/;

function getUserIdFromToken(authHeader) {
  if (!authHeader || !authHeader.startsWith('Bearer ')) return null;
  try {
    const decoded = jwt.verify(authHeader.split(' ')[1], process.env.JWT_SECRET || 'secret123');
    return decoded.id;
  } catch (e) {
    return null;
  }
}

const PROFILE_COLS = 'id, name, username, display_name, email, avatar_url, role, age, gender, specialization, years_experience, clinic_address, training_type, regular_rate, emergency_rate, bio, created_at';

module.exports = async function handler(req, res) {
  res.setHeader('Content-Type', 'application/json');

  const userId = getUserIdFromToken(req.headers.authorization);

  // ───── Username availability check ─────
  if (req.method === 'GET' && req.query.action === 'check-username') {
    const u = (req.query.username || '').trim().toLowerCase();
    if (!u) return res.status(400).json({ available: false, message: 'Username is required' });
    if (!USERNAME_RE.test(u)) return res.status(200).json({ available: false, message: 'Use 3-20 letters, numbers, underscores' });

    const { data: existing } = await supabase
      .from('users').select('id').eq('username', u).limit(1);

    const taken = existing && existing.length > 0 && existing[0].id !== userId;
    return res.status(200).json({ available: !taken, message: taken ? 'Username is taken' : 'Available' });
  }

  if (!userId) {
    return res.status(401).json({ success: false, message: 'Not authorized' });
  }

  // ───── GET — fetch full profile ─────
  if (req.method === 'GET') {
    const { data: user, error } = await supabase
      .from('users').select(PROFILE_COLS).eq('id', userId).single();
    if (error || !user) return res.status(404).json({ success: false, message: 'User not found' });
    return res.status(200).json({ success: true, data: user });
  }

  // ───── PUT/POST — update profile ─────
  if (req.method === 'PUT' || req.method === 'POST') {
    try {
      const {
        username, display_name, name, email,
        avatar_url, age, gender, bio,
        specialization, clinic_address, training_type,
        years_experience, regular_rate, emergency_rate,
        current_password, new_password,
      } = req.body || {};

      const updates = { updated_at: new Date().toISOString() };

      // Username
      if (typeof username === 'string') {
        const u = username.trim().toLowerCase();
        if (u && !USERNAME_RE.test(u)) {
          return res.status(400).json({ success: false, message: 'Username must be 3-20 letters, numbers or underscores' });
        }
        if (u) {
          const { data: existing } = await supabase
            .from('users').select('id').eq('username', u).limit(1);
          if (existing && existing.length > 0 && existing[0].id !== userId) {
            return res.status(409).json({ success: false, message: 'Username is already taken' });
          }
          updates.username = u;
        } else {
          updates.username = null;
        }
      }

      // Display name + name
      if (typeof display_name === 'string') {
        const d = display_name.trim();
        if (d && d.length < 2) return res.status(400).json({ success: false, message: 'Display name must be at least 2 characters' });
        updates.display_name = d.slice(0, 80);
      }
      if (typeof name === 'string' && name.trim()) {
        const n = name.trim();
        if (!NAME_RE.test(n)) return res.status(400).json({ success: false, message: 'Name must be 2-80 letters and spaces only' });
        updates.name = n.slice(0, 80);
      }

      if (typeof avatar_url === 'string') updates.avatar_url = avatar_url.slice(0, 5000);
      if (typeof bio === 'string') updates.bio = bio.slice(0, 500);

      // Numeric fields with range guards
      if (age !== undefined && age !== null && age !== '') {
        const n = parseInt(age, 10);
        if (isNaN(n) || n < 1 || n > 120) return res.status(400).json({ success: false, message: 'Age must be 1-120' });
        updates.age = n;
      }
      if (gender) {
        if (!['Male', 'Female'].includes(gender)) return res.status(400).json({ success: false, message: 'Invalid gender' });
        updates.gender = gender;
      }
      if (specialization !== undefined) updates.specialization = String(specialization).slice(0, 200);
      if (clinic_address !== undefined) updates.clinic_address = String(clinic_address).slice(0, 500);
      if (training_type !== undefined) updates.training_type = String(training_type).slice(0, 200);
      if (years_experience !== undefined && years_experience !== '') {
        const n = parseInt(years_experience, 10);
        if (isNaN(n) || n < 0 || n > 80) return res.status(400).json({ success: false, message: 'Years of experience must be 0-80' });
        updates.years_experience = n;
      }
      if (regular_rate !== undefined && regular_rate !== '') {
        const n = parseInt(regular_rate, 10);
        if (isNaN(n) || n < 0 || n > 100000) return res.status(400).json({ success: false, message: 'Invalid regular rate' });
        updates.regular_rate = n;
      }
      if (emergency_rate !== undefined && emergency_rate !== '') {
        const n = parseInt(emergency_rate, 10);
        if (isNaN(n) || n < 0 || n > 200000) return res.status(400).json({ success: false, message: 'Invalid emergency rate' });
        updates.emergency_rate = n;
      }

      // Email change
      if (typeof email === 'string' && email.trim()) {
        const newEmail = email.trim().toLowerCase();
        if (!EMAIL_RE.test(newEmail)) return res.status(400).json({ success: false, message: 'Invalid email format' });
        const { data: existing } = await supabase
          .from('users').select('id').eq('email', newEmail).limit(1);
        if (existing && existing.length > 0 && existing[0].id !== userId) {
          return res.status(409).json({ success: false, message: 'Email is already in use' });
        }
        updates.email = newEmail;
      }

      // Password change
      if (new_password) {
        if (!current_password) {
          return res.status(400).json({ success: false, message: 'Current password required to change password' });
        }
        if (String(new_password).length < 8) {
          return res.status(400).json({ success: false, message: 'New password must be at least 8 characters' });
        }
        if (!/[A-Za-z]/.test(new_password) || !/[0-9]/.test(new_password)) {
          return res.status(400).json({ success: false, message: 'Password must include letters and numbers' });
        }
        const { data: u } = await supabase.from('users').select('password').eq('id', userId).single();
        const ok = await bcrypt.compare(current_password, u.password);
        if (!ok) return res.status(400).json({ success: false, message: 'Current password is incorrect' });
        updates.password = await bcrypt.hash(new_password, 10);
      }

      const { data: updated, error: updateError } = await supabase
        .from('users').update(updates).eq('id', userId).select(PROFILE_COLS).single();

      if (updateError) {
        console.error('Profile update error:', updateError);
        return res.status(500).json({ success: false, message: 'Failed to update profile: ' + updateError.message });
      }

      return res.status(200).json({ success: true, data: updated, message: 'Profile updated successfully' });
    } catch (err) {
      console.error('Profile error:', err);
      return res.status(500).json({ success: false, message: err.message });
    }
  }

  return res.status(405).json({ success: false, message: 'Method not allowed' });
};
