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

  // ───── Username availability check — username column not yet in live DB ─────
  if (req.method === 'GET' && req.query.action === 'check-username') {
    return res.status(200).json({ available: true, message: 'Available' });
  }

  if (!userId) {
    return res.status(401).json({ success: false, message: 'Not authorized' });
  }

  // ───── GET — fetch full profile ─────
  if (req.method === 'GET') {
    const { data: user, error } = await supabase
      .from('users')
      .select('id, name, email, role, created_at')
      .eq('id', userId)
      .single();

    if (error || !user) return res.status(404).json({ success: false, message: 'User not found' });
    // Expose name as display_name so the frontend field maps correctly
    return res.status(200).json({ success: true, data: { ...user, display_name: user.name, username: '' } });
  }

  // ───── PUT — update profile ─────
  if (req.method === 'PUT' || req.method === 'POST') {
    try {
      const {
        display_name, name, email,
        current_password, new_password,
      } = req.body || {};

      const updates = {};

      // display_name maps to the existing 'name' column
      const newName = (display_name || name || '').trim().slice(0, 80);
      if (newName) updates.name = newName;

      // Email change
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

      if (!Object.keys(updates).length) {
        return res.status(200).json({ success: true, message: 'Nothing to update' });
      }

      const { data: updated, error: updateError } = await supabase
        .from('users')
        .update(updates)
        .eq('id', userId)
        .select('id, name, email, role')
        .single();

      if (updateError) {
        console.error('Profile update error:', updateError);
        return res.status(500).json({ success: false, message: 'Failed to update profile: ' + updateError.message });
      }

      return res.status(200).json({
        success: true,
        data: { ...updated, display_name: updated.name },
        message: 'Profile updated successfully',
      });
    } catch (err) {
      console.error('Profile error:', err);
      return res.status(500).json({ success: false, message: err.message });
    }
  }

  return res.status(405).json({ success: false, message: 'Method not allowed' });
};
