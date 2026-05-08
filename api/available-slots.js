// api/available-slots.js
// Returns which time slots are already booked for a doctor on a given date.

const { supabase } = require('../lib/supabase');

module.exports = async function handler(req, res) {
  if (req.method !== 'GET') {
    return res.status(405).json({ success: false, message: 'Method not allowed' });
  }

  const { doctor_name, date } = req.query;

  if (!doctor_name || !date) {
    return res.status(400).json({ success: false, message: 'doctor_name and date are required' });
  }

  try {
    const { data: bookings, error } = await supabase
      .from('bookings')
      .select('time_slot')
      .ilike('doctor_name', doctor_name)
      .eq('date', date)
      .neq('status', 'cancelled');

    if (error) {
      return res.status(500).json({ success: false, message: error.message });
    }

    const bookedSlots = (bookings || [])
      .map(b => b.time_slot)
      .filter(Boolean);

    res.status(200).json({ success: true, bookedSlots });
  } catch (err) {
    console.error('Available slots error:', err);
    res.status(500).json({ success: false, message: err.message });
  }
};
