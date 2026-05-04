// routes/bookingRoutes.js

const express = require('express');
const router  = express.Router();

const { createBooking, getBookings, cancelBooking } = require('../controllers/bookingController');
const { protect, authorize } = require('../middleware/auth');

// Create a booking — patient only
router.post('/',                protect, authorize('patient'), createBooking);

// Get bookings — any authenticated user (filtered by role inside controller)
router.get('/',                 protect, getBookings);

// Cancel a booking — patient only
router.patch('/:id/cancel',     protect, authorize('patient'), cancelBooking);

module.exports = router;