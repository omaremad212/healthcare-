// api/booking.js - Vercel Serverless API with Supabase

const { supabase } = require('../lib/supabase');

// Helper to get user ID from token
function getUserIdFromToken(authHeader) {
  if (!authHeader || !authHeader.startsWith('Bearer ')) return null;
  try {
    const jwt = require('jsonwebtoken');
    const decoded = jwt.verify(authHeader.split(' ')[1], process.env.JWT_SECRET || 'secret123');
    return decoded.id;
  } catch (e) {
    return null;
  }
}

export default async function handler(req, res) {
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
      console.log('[booking] ===== POST /api/booking CALLED =====');
      console.log('[booking] POST body:', JSON.stringify(req.body, null, 2));
      console.log('[booking] User ID from token:', userId);
      
      const { doctor_id, doctor_name, date, time_slot, payment_method, fee, notes } = req.body;

      if (!date) {
        return res.status(400).json({ success: false, message: 'Date is required' });
      }

      if (!userId) {
        console.error('[booking] No userId from token');
        return res.status(401).json({ success: false, message: 'Not authorized - invalid token' });
      }

      const insertPayload = {
        user_id: userId,
        doctor_id: doctor_id || null,
        doctor_name: doctor_name || 'Doctor',
        date: date,
        time_slot: time_slot || null,
        payment_method: payment_method || 'cash',
        payment_status: payment_method === 'visa' ? 'paid' : 'pending',
        fee: fee || 0,
        notes: notes || null,
        status: 'confirmed',
        created_at: new Date().toISOString()
      };
      
      console.log('[booking] Insert payload:', JSON.stringify(insertPayload, null, 2));

      const { data: booking, error } = await supabase
        .from('bookings')
        .insert(insertPayload)
        .select()
        .single();

      if (error) {
        console.error('[booking] Supabase insert error:', error.message, error.details, error.hint);
        return res.status(500).json({ 
          success: false, 
          message: error.message || 'Database insert failed',
          details: error.details || null,
          hint: error.hint || null
        });
      }

      console.log('[booking] Created:', JSON.stringify(booking, null, 2));
      res.status(201).json({ success: true, data: booking });
    } 
    else if (req.method === 'GET') {
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
    }
    else if (req.method === 'PATCH') {
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
}