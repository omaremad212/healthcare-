// server.js
// Main Express server — registers all routes and middleware

require('dotenv').config();

const express      = require('express');
const cors         = require('cors');
const connectDB    = require('./config/db');
const errorHandler = require('./middleware/errorHandler');

// ── Connect to MongoDB ─────────────────────────────────────────
connectDB();

const app = express();

// ── Core Middleware ────────────────────────────────────────────
app.use(cors());                         // Allow all origins (tighten in production)
app.use(express.json());                 // Parse JSON bodies
app.use(express.urlencoded({ extended: true }));

// ── API Routes ────────────────────────────────────────────────
app.use('/auth',      require('./routes/authRoutes'));
app.use('/chatbot',   require('./routes/chatbotRoutes'));
app.use('/booking',   require('./routes/bookingRoutes'));
app.use('/patient',   require('./routes/dashboardRoutes'));
app.use('/doctor',    require('./routes/dashboardRoutes'));
app.use('/coach',     require('./routes/dashboardRoutes'));
app.use('/',          require('./routes/shopRoutes'));    // /products, /orders

// ── Health Check ──────────────────────────────────────────────
app.get('/health', (req, res) => {
  res.status(200).json({ success: true, message: 'Healthcare API is running 🚀' });
});

// ── 404 Handler ───────────────────────────────────────────────
app.use((req, res) => {
  res.status(404).json({ success: false, message: `Route ${req.originalUrl} not found` });
});

// ── Global Error Handler ──────────────────────────────────────
app.use(errorHandler);

// ── Start Server ──────────────────────────────────────────────
const PORT = process.env.PORT || 5000;
app.listen(PORT, () => {
  console.log(`🚀 Server running on http://localhost:${PORT}`);
  console.log(`📋 API Endpoints:`);
  console.log(`   POST   /auth/register`);
  console.log(`   POST   /auth/login`);
  console.log(`   GET    /auth/me`);
  console.log(`   POST   /chatbot`);
  console.log(`   GET    /chatbot/history`);
  console.log(`   GET    /patient/dashboard`);
  console.log(`   GET    /doctor/dashboard`);
  console.log(`   GET    /coach/dashboard`);
  console.log(`   POST   /booking`);
  console.log(`   GET    /booking`);
  console.log(`   PATCH  /booking/:id/cancel`);
  console.log(`   GET    /products`);
  console.log(`   POST   /orders`);
  console.log(`   GET    /orders`);
});

module.exports = app;