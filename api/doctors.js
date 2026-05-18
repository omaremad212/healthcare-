// api/doctors.js — GET /api/doctors?specialty=<name>
// Returns registered doctors/coaches filtered by specialization.

const { supabase } = require('../lib/supabase');

module.exports = async function handler(req, res) {
  res.setHeader('Content-Type', 'application/json');
  if (req.method !== 'GET')
    return res.status(405).json({ success: false, message: 'Method not allowed' });

  try {
    const { specialty } = req.query;

    let query = supabase
      .from('users')
      .select('id, name, role, specialization, training_type, clinic_address, regular_rate, emergency_rate, bio, years_experience')
      .in('role', ['doctor', 'coach']);

    if (specialty) {
      if (specialty === 'Fitness Coaching') {
        query = query.eq('role', 'coach');
      } else {
        query = query.eq('role', 'doctor').ilike('specialization', specialty);
      }
    }

    const { data: professionals, error } = await query.order('name');
    if (error) return res.status(500).json({ success: false, message: 'Database error' });

    const list = professionals || [];

    // Compute average ratings from feedback
    let ratings = {};
    if (list.length > 0) {
      const ids = list.map(p => p.id);
      const { data: feedbackRows } = await supabase
        .from('feedback')
        .select('doctor_id, rating')
        .in('doctor_id', ids);

      if (feedbackRows && feedbackRows.length > 0) {
        const groups = {};
        feedbackRows.forEach(f => {
          if (!groups[f.doctor_id]) groups[f.doctor_id] = [];
          groups[f.doctor_id].push(f.rating);
        });
        Object.entries(groups).forEach(([id, arr]) => {
          ratings[id] = Math.round((arr.reduce((s, r) => s + r, 0) / arr.length) * 10) / 10;
        });
      }
    }

    const result = list.map(p => ({
      id:              p.id,
      name:            p.name,
      spec:            p.role === 'coach' ? (p.training_type || 'Fitness Coaching') : (p.specialization || ''),
      price:           p.regular_rate   || 200,
      emergency_price: p.emergency_rate || 400,
      rating:          ratings[p.id] ?? null,
      location:        p.clinic_address || '',
      role:            p.role,
      bio:             p.bio || '',
      years_experience: p.years_experience || null,
    }));

    return res.status(200).json({ success: true, data: result });
  } catch (err) {
    console.error('Doctors API error:', err);
    return res.status(500).json({ success: false, message: err.message });
  }
};
