// controllers/dashboardController.js
// Returns relevant data for each user role's dashboard

const User           = require('../models/User');
const ChatbotResult  = require('../models/ChatbotResult');
const Booking        = require('../models/Booking');
const Order          = require('../models/Order');

// ── @route   GET /patient/dashboard
// ── @access  Private / Patient
const patientDashboard = async (req, res, next) => {
  try {
    const patientId = req.user._id;

    // Latest chatbot result
    const latestResult = await ChatbotResult.findOne({ patient: patientId })
      .sort({ createdAt: -1 });

    // All chatbot results (last 5)
    const chatbotHistory = await ChatbotResult.find({ patient: patientId })
      .sort({ createdAt: -1 })
      .limit(5)
      .select('status riskLevel recommendation healthScore bmi createdAt');

    // Bookings
    const bookings = await Booking.find({ patient: patientId })
      .sort({ createdAt: -1 })
      .populate('target', 'name role specialization trainingType');

    // Orders
    const orders = await Order.find({ patient: patientId })
      .sort({ createdAt: -1 });

    res.status(200).json({
      success: true,
      data: {
        profile:         req.user,
        latestResult,
        chatbotHistory,
        bookings,
        orders,
        stats: {
          totalBookings:  bookings.length,
          totalOrders:    orders.length,
          assessments:    chatbotHistory.length,
        },
      },
    });
  } catch (err) {
    next(err);
  }
};

// ── @route   GET /doctor/dashboard
// ── @access  Private / Doctor
const doctorDashboard = async (req, res, next) => {
  try {
    const doctorId = req.user._id;

    // All bookings with this doctor
    const bookings = await Booking.find({ target: doctorId, targetType: 'doctor' })
      .sort({ createdAt: -1 })
      .populate('patient', 'name email age gender');

    // Unique patient IDs
    const patientIds = [...new Set(bookings.map(b => b.patient?._id?.toString()))].filter(Boolean);

    // Get latest chatbot result for each patient (to show health data)
    const patientHealthData = await Promise.all(
      patientIds.map(async (pid) => {
        const result = await ChatbotResult.findOne({ patient: pid })
          .sort({ createdAt: -1 })
          .select('status riskLevel healthScore recommendation createdAt');
        return { patientId: pid, latestAssessment: result };
      })
    );

    res.status(200).json({
      success: true,
      data: {
        profile:           req.user,
        bookings,
        patientHealthData,
        stats: {
          totalPatients:  patientIds.length,
          totalBookings:  bookings.length,
          pendingBookings: bookings.filter(b => b.status === 'pending').length,
        },
      },
    });
  } catch (err) {
    next(err);
  }
};

// ── @route   GET /coach/dashboard
// ── @access  Private / Coach
const coachDashboard = async (req, res, next) => {
  try {
    const coachId = req.user._id;

    // All bookings with this coach
    const bookings = await Booking.find({ target: coachId, targetType: 'coach' })
      .sort({ createdAt: -1 })
      .populate('patient', 'name email age gender');

    // Unique client IDs
    const clientIds = [...new Set(bookings.map(b => b.patient?._id?.toString()))].filter(Boolean);

    // Get fitness chatbot results for each client
    const clientFitnessData = await Promise.all(
      clientIds.map(async (cid) => {
        const result = await ChatbotResult.findOne({ patient: cid, 'answers.flowType': 'fitness' })
          .sort({ createdAt: -1 })
          .select('status riskLevel bmi answers.fitnessGoal answers.level answers.diet createdAt');
        return { clientId: cid, latestAssessment: result };
      })
    );

    res.status(200).json({
      success: true,
      data: {
        profile:          req.user,
        bookings,
        clientFitnessData,
        stats: {
          totalClients:   clientIds.length,
          totalBookings:  bookings.length,
          activeThisWeek: bookings.filter(b => {
            const weekAgo = new Date(Date.now() - 7 * 24 * 60 * 60 * 1000);
            return new Date(b.createdAt) > weekAgo;
          }).length,
        },
      },
    });
  } catch (err) {
    next(err);
  }
};

module.exports = { patientDashboard, doctorDashboard, coachDashboard };