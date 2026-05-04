// routes/dashboardRoutes.js

const express = require('express');
const router  = express.Router();

const { patientDashboard, doctorDashboard, coachDashboard } = require('../controllers/dashboardController');
const { protect, authorize } = require('../middleware/auth');

router.get('/patient', protect, authorize('patient'), patientDashboard);
router.get('/doctor',  protect, authorize('doctor'),  doctorDashboard);
router.get('/coach',   protect, authorize('coach'),   coachDashboard);

module.exports = router;