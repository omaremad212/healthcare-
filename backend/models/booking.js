// models/Booking.js
// A patient can book with a doctor or coach

const mongoose = require('mongoose');

const BookingSchema = new mongoose.Schema(
  {
    patient: {
      type: mongoose.Schema.Types.ObjectId,
      ref: 'User',
      required: true,
    },

    // The person being booked (doctor or coach)
    target: {
      type: mongoose.Schema.Types.ObjectId,
      ref: 'User',
      required: true,
    },

    targetType: {
      type: String,
      enum: ['doctor', 'coach'],
      required: true,
    },

    // Appointment details
    date: {
      type: String,
      required: [true, 'Booking date is required'],
    },

    timeSlot: {
      type: String, // e.g. "10:00 AM"
    },

    status: {
      type: String,
      enum: ['pending', 'confirmed', 'cancelled'],
      default: 'confirmed',
    },

    // Payment details
    paymentMethod: {
      type: String,
      enum: ['cash', 'visa'],
      default: 'cash',
    },

    paymentStatus: {
      type: String,
      enum: ['pending', 'paid'],
      default: 'pending',
    },

    fee: { type: Number },

    notes: { type: String },
  },
  { timestamps: true }
);

module.exports = mongoose.model('Booking', BookingSchema);