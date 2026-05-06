// api/profile.js — User profile management

const jwt = require('jsonwebtoken');
const bcrypt = require('bcryptjs');
const { supabase } = require('../lib/supabase');

const USERNAME_RE = /^[a-zA-Z0-9_]{3,20}$/;

function getUserIdFromToken(authHeader) {
  if (!authHeader || !authHeader.startsWith('Bearer ')) return null;
  try {
    const decoded = jwt.verify(authHeader.split(' ')[1], process.env.JWT_SECRET || 'secret123');
    return decoded.id;
  } catch (e) {
    return null;
  }
}

module.exports = async function handler(req, res) {
  res.setHeader('Content-Type', 'application/json');

  const userId = getUserIdFromToken(req.headers.authorization);

  // ───── Username availability check (public-ish but auth required) ─────
  if (req.method === 'GET' && req.query.action === 'check-username') {
    const u = (req.query.username || '').trim().toLowerCase();
    if (!u) return res.status(400).json({ available: false, message: 'Username is required' });
    if (!USERNAME_RE.test(u)) return res.status(200).json({ available: false, message: 'Use 3-20 letters, numbers, underscores' });

    const { data: existing } = await supabase
      .from('users')
      .select('id')
      .eq('username', u)
      .limit(1);

    const taken = existing && existing.length > 0 && existing[0].id !== userId;
    return res.status(200).json({ available: !taken, message: taken ? 'Username is taken' : 'Available' });
  }

  if (!userId) {
    return res.status(401).json({ success: false, message: 'Not authorized' });
  }

  // ───── GET — fetch full profile ─────
  if (req.method === 'GET') {
    const { data: user, error } = await supabase
      .from('users')
      .select('id, name, username, display_name, email, avatar_url, role, age, gender, specialization, years_experience, clinic_address, training_type, regular_rate, emergency_rate, bio, created_at')
      .eq('id', userId)
      .single();

    if (error || !user) return res.status(404).json({ success: false, message: 'User not found' });
    return res.status(200).json({ success: true, data: user });
  }

  // ───── PUT — update profile ─────
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

      // Username (with validation)
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

      if (typeof display_name === 'string') updates.display_name = display_name.trim().slice(0, 80);
      if (typeof name === 'string' && name.trim()) updates.name = name.trim().slice(0, 80);
      if (typeof avatar_url === 'string') updates.avatar_url = avatar_url.slice(0, 5000);
      if (typeof bio === 'string') updates.bio = bio.slice(0, 500);
      if (age !== undefined && age !== null && age !== '') updates.age = parseInt(age, 10);
      if (gender) updates.gender = gender;
      if (specialization !== undefined) updates.specialization = specialization;
      if (clinic_address !== undefined) updates.clinic_address = clinic_address;
      if (training_type !== undefined) updates.training_type = training_type;
      if (years_experience !== undefined && years_experience !== '') updates.years_experience = parseInt(years_experience, 10);
      if (regular_rate !== undefined && regular_rate !== '') updates.regular_rate = parseInt(regular_rate, 10);
      if (emergency_rate !== undefined && emergency_rate !== '') updates.emergency_rate = parseInt(emergency_rate, 10);

      // Email change (basic — production would verify)
      if (typeof email === 'string' && email.trim()) {
        const newEmail = email.trim().toLowerCase();
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
        if (String(new_password).length < 6) {
          return res.status(400).json({ success: false, message: 'New password must be at least 6 characters' });
        }
        const { data: u } = await supabase.from('users').select('password').eq('id', userId).single();
        const ok = await bcrypt.compare(current_password, u.password);
        if (!ok) return res.status(400).json({ success: false, message: 'Current password is incorrect' });
        updates.password = await bcrypt.hash(new_password, 10);
      }

      const { data: updated, error: updateError } = await supabase
        .from('users')
        .update(updates)
        .eq('id', userId)
        .select('id, name, username, display_name, email, avatar_url, role, age, gender, specialization, years_experience, clinic_address, training_type, regular_rate, emergency_rate, bio')
        .single();

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
