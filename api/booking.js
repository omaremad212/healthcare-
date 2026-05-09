// api/booking.js - Vercel Serverless API with Supabase
// Handles: GET/POST/PATCH /api/booking
//          GET /api/available-slots  (routed here as ?action=available-slots)

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

  // ── Available-slots (no auth needed) ──────────────────────────
  if (req.query.action === 'available-slots') {
    if (req.method !== 'GET')
      return res.status(405).json({ success: false, message: 'Method not allowed' });
    const { doctor_name, date } = req.query;
    if (!doctor_name || !date)
      return res.status(400).json({ success: false, message: 'doctor_name and date are required' });
    try {
      const { data: rows, error } = await supabase
        .from('bookings').select('time_slot')
        .ilike('doctor_name', doctor_name).eq('date', date).neq('status', 'cancelled');
      if (error) return res.status(500).json({ success: false, message: error.message });
      const bookedSlots = (rows || []).map(r => r.time_slot).filter(Boolean);
      return res.status(200).json({ success: true, bookedSlots });
    } catch (err) {
      return res.status(500).json({ success: false, message: err.message });
    }
  }

  // ── Booking CRUD ───────────────────────────────────────────────
  if (req.method !== 'GET' && req.method !== 'POST' && req.method !== 'PATCH')
    return res.status(405).json({ success: false, message: 'Method not allowed' });

  const userId = getUserIdFromToken(req.headers.authorization);
  if (!userId) return res.status(401).json({ success: false, message: 'Not authorized' });

  try {
    if (req.method === 'POST') {
      const { doctor_id, doctor_name, date, time_slot, payment_method, fee, notes, booking_type } = req.body;
      if (!date) return res.status(400).json({ success: false, message: 'Date is required' });

      const bookingDate = new Date(date);
      if (isNaN(bookingDate.getTime()))
        return res.status(400).json({ success: false, message: 'Invalid date format' });
      const today = new Date(); today.setHours(0, 0, 0, 0);
      if (bookingDate < today)
        return res.status(400).json({ success: false, message: 'Booking date cannot be in the past' });
      if (payment_method && !['cash', 'visa', 'card'].includes(payment_method))
        return res.status(400).json({ success: false, message: 'Invalid payment method' });
      if (booking_type && !['regular', 'emergency'].includes(booking_type))
        return res.status(400).json({ success: false, message: 'Invalid booking type' });

      const isEmergency = booking_type === 'emergency';
      let resolvedFee = fee;
      if (resolvedFee === undefined || resolvedFee === null) {
        if (doctor_id) {
          const { data: doc } = await supabase.from('users')
            .select('regular_rate, emergency_rate').eq('id', doctor_id).single();
          if (doc) resolvedFee = isEmergency ? (doc.emergency_rate || 400) : (doc.regular_rate || 200);
        }
        resolvedFee = resolvedFee || (isEmergency ? 400 : 200);
      }

      const { data: booking, error } = await supabase.from('bookings').insert({
        user_id: userId, doctor_id: doctor_id || null,
        doctor_name: doctor_name || 'Doctor', date,
        time_slot: time_slot || null,
        payment_method: payment_method || 'cash',
        payment_status: payment_method === 'visa' ? 'paid' : 'pending',
        fee: resolvedFee, booking_type: booking_type || 'regular',
        notes: notes || null, status: 'confirmed',
        created_at: new Date().toISOString(),
      }).select().single();

      if (error) {
        console.error('[booking] insert error:', error.message);
        return res.status(500).json({ success: false, message: error.message || 'Database insert failed' });
      }
      return res.status(201).json({ success: true, data: booking });

    } else if (req.method === 'GET') {
      const { data: bookings, error } = await supabase.from('bookings').select('*')
        .eq('user_id', userId).order('created_at', { ascending: false }).limit(20);
      if (error) return res.status(500).json({ success: false, message: 'Failed to fetch bookings' });
      return res.status(200).json({ success: true, count: bookings.length, data: bookings });

    } else if (req.method === 'PATCH') {
      const { id } = req.query;
      const { data: booking, error } = await supabase.from('bookings')
        .update({ status: 'cancelled' }).eq('id', id).eq('user_id', userId).select().single();
      if (error) return res.status(404).json({ success: false, message: 'Booking not found' });
      return res.status(200).json({ success: true, data: booking });
    }
  } catch (err) {
    console.error('[booking] error:', err);
    return res.status(500).json({ success: false, message: err.message });
  }
};
