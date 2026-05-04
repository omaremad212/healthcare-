// api/booking.js - Vercel Serverless API

global.bookings = global.bookings || [];

export default async function handler(req, res) {
  if (req.method !== 'GET' && req.method !== 'POST' && req.method !== 'PATCH') {
    return res.status(405).json({ success: false, message: 'Method not allowed' });
  }

  const authHeader = req.headers.authorization;
  if (!authHeader || !authHeader.startsWith('Bearer ')) {
    return res.status(401).json({ success: false, message: 'Not authorized' });
  }

  try {
    if (req.method === 'POST') {
      const { targetId, targetType, date, timeSlot, paymentMethod, fee, notes, doctorName } = req.body;

      if (!date) {
        return res.status(400).json({ success: false, message: 'Date is required' });
      }

      const booking = {
        _id: 'booking_' + Date.now(),
        patient: 'patient_user',
        target: targetId || 'doctor',
        targetType: targetType || 'doctor',
        date,
        timeSlot,
        paymentMethod: paymentMethod || 'cash',
        paymentStatus: paymentMethod === 'visa' ? 'paid' : 'pending',
        fee,
        notes: notes || `Booked with ${doctorName || 'Doctor'}`,
        status: 'confirmed',
        createdAt: new Date().toISOString(),
      };

      global.bookings.push(booking);

      res.status(201).json({ success: true, data: booking });
    } 
    else if (req.method === 'GET') {
      const bookings = global.bookings.slice(-20).reverse();
      res.status(200).json({ success: true, count: bookings.length, data: bookings });
    }
    else if (req.method === 'PATCH') {
      const { id } = req.query;
      const booking = global.bookings.find(b => b._id === id);
      if (!booking) {
        return res.status(404).json({ success: false, message: 'Booking not found' });
      }
      booking.status = 'cancelled';
      res.status(200).json({ success: true, data: booking });
    }
  } catch (err) {
    res.status(500).json({ success: false, message: err.message });
  }
}