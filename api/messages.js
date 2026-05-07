// api/messages.js — Patient ↔ professional chat tied to a booking

const jwt = require('jsonwebtoken');
const { supabase } = require('../lib/supabase');

function getUserIdFromToken(authHeader) {
  if (!authHeader || !authHeader.startsWith('Bearer ')) return null;
  try {
    const decoded = jwt.verify(authHeader.split(' ')[1], process.env.JWT_SECRET || 'secret123');
    return decoded.id;
  } catch (e) { return null; }
}

module.exports = async function handler(req, res) {
  res.setHeader('Content-Type', 'application/json');

  const userId = getUserIdFromToken(req.headers.authorization);
  if (!userId) return res.status(401).json({ success: false, message: 'Not authorized' });

  // Confirm role of the requester
  const { data: me } = await supabase
    .from('users').select('id, name, display_name, role').eq('id', userId).single();
  if (!me) return res.status(401).json({ success: false, message: 'User not found' });

  const isProfessional = me.role === 'doctor' || me.role === 'coach';

  // ───── GET — list messages for a booking, or list threads for the user ─────
  if (req.method === 'GET') {
    const bookingId = req.query.booking_id;

    // List threads (one entry per booking the user is part of)
    if (req.query.action === 'threads') {
      let bookingsQuery = supabase
        .from('bookings')
        .select('id, doctor_id, doctor_name, professional_role, date, time_slot, status, user_id')
        .order('created_at', { ascending: false })
        .limit(50);
      if (isProfessional) {
        bookingsQuery = bookingsQuery.eq('doctor_id', userId);
      } else {
        bookingsQuery = bookingsQuery.eq('user_id', userId);
      }
      const { data: bookings, error: bErr } = await bookingsQuery;
      if (bErr) return res.status(500).json({ success: false, message: bErr.message });

      const ids = (bookings || []).map(b => b.id);
      let threadMeta = {};
      if (ids.length) {
        const { data: msgs } = await supabase
          .from('messages').select('booking_id, body, created_at, sender_role')
          .in('booking_id', ids).order('created_at', { ascending: false });
        (msgs || []).forEach(m => {
          if (!threadMeta[m.booking_id]) threadMeta[m.booking_id] = m;
        });
      }
      return res.status(200).json({
        success: true,
        data: (bookings || []).map(b => ({
          booking_id: b.id,
          doctor_name: b.doctor_name,
          professional_role: b.professional_role,
          date: b.date,
          time_slot: b.time_slot,
          last_message: threadMeta[b.id]?.body || null,
          last_message_at: threadMeta[b.id]?.created_at || null,
        })),
      });
    }

    if (!bookingId) {
      return res.status(400).json({ success: false, message: 'booking_id is required' });
    }

    // Verify the user is part of this booking
    const { data: booking } = await supabase
      .from('bookings').select('id, user_id, doctor_id, doctor_name')
      .eq('id', bookingId).single();
    if (!booking) return res.status(404).json({ success: false, message: 'Booking not found' });
    const isOwner = booking.user_id === userId;
    const isPro   = isProfessional && booking.doctor_id === userId;
    if (!isOwner && !isPro) {
      return res.status(403).json({ success: false, message: 'Not authorized for this conversation' });
    }

    const { data: messages, error } = await supabase
      .from('messages')
      .select('id, sender_role, body, created_at, professional_name')
      .eq('booking_id', bookingId)
      .order('created_at', { ascending: true })
      .limit(500);
    if (error) return res.status(500).json({ success: false, message: error.message });

    return res.status(200).json({
      success: true,
      data: messages || [],
      booking: {
        id: booking.id,
        doctor_name: booking.doctor_name,
      },
    });
  }

  // ───── POST — send a message ─────
  if (req.method === 'POST') {
    try {
      const { booking_id, body } = req.body || {};
      if (!booking_id) return res.status(400).json({ success: false, message: 'booking_id is required' });
      const trimmed = String(body || '').trim();
      if (trimmed.length < 1) return res.status(400).json({ success: false, message: 'Message cannot be empty' });
      if (trimmed.length > 2000) return res.status(400).json({ success: false, message: 'Message too long (max 2000 chars)' });

      const { data: booking } = await supabase
        .from('bookings').select('id, user_id, doctor_id, doctor_name')
        .eq('id', booking_id).single();
      if (!booking) return res.status(404).json({ success: false, message: 'Booking not found' });

      const isOwner = booking.user_id === userId;
      const isPro   = isProfessional && booking.doctor_id === userId;
      if (!isOwner && !isPro) {
        return res.status(403).json({ success: false, message: 'Not authorized for this conversation' });
      }

      const senderRole = isPro ? 'professional' : 'patient';
      const { data: msg, error } = await supabase
        .from('messages')
        .insert({
          booking_id,
          patient_id: booking.user_id,
          professional_id: booking.doctor_id || null,
          professional_name: booking.doctor_name,
          sender_role: senderRole,
          body: trimmed,
          read_by_patient: senderRole === 'patient',
          read_by_professional: senderRole === 'professional',
        })
        .select()
        .single();
      if (error) return res.status(500).json({ success: false, message: error.message });

      return res.status(201).json({ success: true, data: msg });
    } catch (err) {
      return res.status(500).json({ success: false, message: err.message });
    }
  }

  return res.status(405).json({ success: false, message: 'Method not allowed' });
};
