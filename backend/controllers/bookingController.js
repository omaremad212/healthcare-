// controllers/bookingController.js
// Handles appointment booking between patient ↔ doctor/coach

const Booking = require('../models/Booking');
const User    = require('../models/User');

// ── @route   POST /booking
// ── @access  Private / Patient
const createBooking = async (req, res, next) => {
  try {
    const { targetId, targetType, date, timeSlot, paymentMethod, fee, notes } = req.body;

    if (!targetId || !targetType || !date) {
      return res.status(400).json({
        success: false,
        message: 'targetId, targetType, and date are required',
      });
    }

    // Validate that the target exists and has the correct role
    const target = await User.findById(targetId);
    if (!target) {
      return res.status(404).json({ success: false, message: 'Doctor/Coach not found' });
    }
    if (target.role !== targetType) {
      return res.status(400).json({
        success: false,
        message: `Target user is not a ${targetType}`,
      });
    }

    const booking = await Booking.create({
      patient:       req.user._id,
      target:        targetId,
      targetType,
      date,
      timeSlot,
      paymentMethod: paymentMethod || 'cash',
      paymentStatus: paymentMethod === 'visa' ? 'paid' : 'pending',
      fee,
      notes,
    });

    // Populate for response
    await booking.populate('target', 'name role specialization trainingType clinicAddress');

    res.status(201).json({ success: true, data: booking });
  } catch (err) {
    next(err);
  }
};

// ── @route   GET /booking
// ── @access  Private — returns bookings based on role
const getBookings = async (req, res, next) => {
  try {
    let filter = {};

    if (req.user.role === 'patient') {
      filter.patient = req.user._id;
    } else {
      // Doctor or coach sees their own bookings
      filter.target     = req.user._id;
      filter.targetType = req.user.role;
    }

    const bookings = await Booking.find(filter)
      .sort({ createdAt: -1 })
      .populate('patient', 'name email')
      .populate('target',  'name role specialization trainingType');

    res.status(200).json({ success: true, count: bookings.length, data: bookings });
  } catch (err) {
    next(err);
  }
};

// ── @route   PATCH /booking/:id/cancel
// ── @access  Private
const cancelBooking = async (req, res, next) => {
  try {
    const booking = await Booking.findById(req.params.id);

    if (!booking) {
      return res.status(404).json({ success: false, message: 'Booking not found' });
    }

    // Only the patient who created it can cancel
    if (booking.patient.toString() !== req.user._id.toString()) {
      return res.status(403).json({ success: false, message: 'Not authorized to cancel this booking' });
    }

    booking.status = 'cancelled';
    await booking.save();

    res.status(200).json({ success: true, data: booking });
  } catch (err) {
    next(err);
  }
};

module.exports = { createBooking, getBookings, cancelBooking };