// api/booking.js - Vercel Serverless API with Supabase

const jwt = require('jsonwebtoken');
const { supabase } = require('../lib/supabase');

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
  if (req.method !== 'GET' && req.method !== 'POST' && req.method !== 'PATCH') {
    return res.status(405).json({ success: false, message: 'Method not allowed' });
  }

  const authHeader = req.headers.authorization;
  const userId = getUserIdFromToken(authHeader);

  if (!userId) {
    return res.status(401).json({ success: false, message: 'Not authorized' });
  }

  try {
    if (req.method === 'POST') {
      const {
        doctor_id, doctor_name, date, time_slot,
        payment_method, fee, notes,
        is_emergency, professional_role,
      } = req.body;

      if (!date) {
        return res.status(400).json({ success: false, message: 'Date is required' });
      }

      // Determine fee: if not provided, look up doctor's rates
      let resolvedFee = fee;
      if (resolvedFee === undefined || resolvedFee === null) {
        if (doctor_id) {
          const { data: doc } = await supabase
            .from('users').select('regular_rate, emergency_rate').eq('id', doctor_id).single();
          if (doc) {
            resolvedFee = is_emergency ? (doc.emergency_rate || 400) : (doc.regular_rate || 200);
          }
        }
        resolvedFee = resolvedFee || (is_emergency ? 400 : 200);
      }

      const bookingType = is_emergency ? 'emergency' : 'regular';

      const { data: booking, error } = await supabase
        .from('bookings')
        .insert({
          user_id: userId,
          doctor_id: doctor_id || null,
          doctor_name: doctor_name || 'Doctor',
          professional_role: professional_role || 'doctor',
          date: date,
          time_slot: time_slot || null,
          payment_method: payment_method || 'cash',
          payment_status: payment_method === 'visa' ? 'paid' : 'pending',
          fee: resolvedFee,
          is_emergency: !!is_emergency,
          booking_type: bookingType,
          notes: notes || null,
          status: 'confirmed',
          created_at: new Date().toISOString(),
        })
        .select()
        .single();

      if (error) {
        console.error('[booking] Supabase insert error:', error.message);
        return res.status(500).json({
          success: false,
          message: error.message || 'Database insert failed',
          details: error.details || null,
          hint: error.hint || null,
        });
      }

      res.status(201).json({ success: true, data: booking });
    } else if (req.method === 'GET') {
      const { data: bookings, error } = await supabase
        .from('bookings')
        .select('*')
        .eq('user_id', userId)
        .order('created_at', { ascending: false })
        .limit(20);

      if (error) {
        console.error('Supabase query error:', error);
        return res.status(500).json({ success: false, message: 'Failed to fetch bookings' });
      }

      res.status(200).json({ success: true, count: bookings.length, data: bookings });
    } else if (req.method === 'PATCH') {
      const { id } = req.query;

      const { data: booking, error } = await supabase
        .from('bookings')
        .update({ status: 'cancelled' })
        .eq('id', id)
        .eq('user_id', userId)
        .select()
        .single();

      if (error) {
        console.error('Supabase update error:', error);
        return res.status(404).json({ success: false, message: 'Booking not found' });
      }

      res.status(200).json({ success: true, data: booking });
    }
  } catch (err) {
    console.error('Booking error:', err);
    res.status(500).json({ success: false, message: err.message });
  }
};
