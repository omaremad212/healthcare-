// api/feedback.js — Patient ratings/reviews tied to completed bookings

const jwt = require('jsonwebtoken');
const { supabase } = require('../lib/supabase');

const PROFANITY = ['fuck', 'shit', 'bitch', 'asshole']; // basic — extend as needed

function getUserIdFromToken(authHeader) {
  if (!authHeader || !authHeader.startsWith('Bearer ')) return null;
  try {
    const decoded = jwt.verify(authHeader.split(' ')[1], process.env.JWT_SECRET || 'secret123');
    return decoded.id;
  } catch (e) {
    return null;
  }
}

function containsProfanity(text) {
  if (!text) return false;
  const lower = String(text).toLowerCase();
  return PROFANITY.some(w => lower.includes(w));
}

module.exports = async function handler(req, res) {
  res.setHeader('Content-Type', 'application/json');

  // GET — list feedback for a doctor (public)
  if (req.method === 'GET') {
    const doctorId = req.query.doctorId;
    const doctorName = req.query.doctorName;

    let query = supabase
      .from('feedback')
      .select('id, rating, communication, professionalism, helpfulness, review, anonymous, created_at, doctor_id, doctor_name, user_id')
      .order('created_at', { ascending: false })
      .limit(50);

    if (doctorId) query = query.eq('doctor_id', doctorId);
    else if (doctorName) query = query.eq('doctor_name', doctorName);

    const { data: rows, error } = await query;
    if (error) {
      console.error('Feedback fetch error:', error);
      return res.status(500).json({ success: false, message: error.message });
    }

    // Compute aggregate
    const ratings = (rows || []).map(r => r.rating).filter(Boolean);
    const avg = ratings.length ? ratings.reduce((a, b) => a + b, 0) / ratings.length : 0;

    // Look up patient names if not anonymous
    const userIds = [...new Set((rows || []).filter(r => !r.anonymous).map(r => r.user_id).filter(Boolean))];
    let userMap = {};
    if (userIds.length) {
      const { data: users } = await supabase.from('users').select('id, name, display_name').in('id', userIds);
      (users || []).forEach(u => { userMap[u.id] = u.display_name || u.name; });
    }

    const enriched = (rows || []).map(r => ({
      ...r,
      reviewer_name: r.anonymous ? 'Anonymous' : (userMap[r.user_id] || 'Patient'),
      user_id: undefined,
    }));

    return res.status(200).json({
      success: true,
      data: enriched,
      summary: { count: ratings.length, average: Number(avg.toFixed(2)) },
    });
  }

  // POST — submit feedback (auth required, must own booking)
  const userId = getUserIdFromToken(req.headers.authorization);
  if (!userId) return res.status(401).json({ success: false, message: 'Not authorized' });

  if (req.method === 'POST') {
    try {
      const {
        booking_id, doctor_id, doctor_name,
        rating, communication, professionalism, helpfulness,
        review, anonymous,
      } = req.body || {};

      if (!rating || rating < 1 || rating > 5) {
        return res.status(400).json({ success: false, message: 'Rating must be between 1 and 5' });
      }

      if (containsProfanity(review)) {
        return res.status(400).json({ success: false, message: 'Please remove inappropriate language from your review' });
      }

      // Verify booking belongs to user (if booking_id provided)
      let verifiedDoctorName = doctor_name;
      if (booking_id) {
        const { data: booking } = await supabase
          .from('bookings').select('id, user_id, doctor_name, doctor_id, status, feedback_submitted')
          .eq('id', booking_id)
          .single();
        if (!booking || booking.user_id !== userId) {
          return res.status(403).json({ success: false, message: 'You can only review your own bookings' });
        }
        if (booking.feedback_submitted) {
          return res.status(409).json({ success: false, message: 'You already submitted feedback for this booking' });
        }
        verifiedDoctorName = booking.doctor_name;
      }

      const insert = {
        booking_id: booking_id || null,
        user_id: userId,
        doctor_id: doctor_id || null,
        doctor_name: verifiedDoctorName || null,
        rating: parseInt(rating, 10),
        communication: communication ? parseInt(communication, 10) : null,
        professionalism: professionalism ? parseInt(professionalism, 10) : null,
        helpfulness: helpfulness ? parseInt(helpfulness, 10) : null,
        review: review ? String(review).slice(0, 1000) : null,
        anonymous: !!anonymous,
        created_at: new Date().toISOString(),
      };

      const { data: created, error } = await supabase
        .from('feedback').insert(insert).select().single();

      if (error) {
        console.error('Feedback insert error:', error);
        return res.status(500).json({ success: false, message: error.message });
      }

      // Mark booking as feedback-submitted
      if (booking_id) {
        await supabase.from('bookings').update({ feedback_submitted: true }).eq('id', booking_id);
      }

      return res.status(201).json({ success: true, data: created });
    } catch (err) {
      console.error('Feedback error:', err);
      return res.status(500).json({ success: false, message: err.message });
    }
  }

  return res.status(405).json({ success: false, message: 'Method not allowed' });
};
