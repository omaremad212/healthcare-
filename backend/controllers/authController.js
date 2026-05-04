// controllers/authController.js
// Handles user registration and login

const jwt  = require('jsonwebtoken');
const User = require('../models/User');

// ── Generate JWT ───────────────────────────────────────────────
const generateToken = (userId) => {
  return jwt.sign({ id: userId }, process.env.JWT_SECRET, {
    expiresIn: process.env.JWT_EXPIRE || '7d',
  });
};

// ── @route   POST /auth/register
// ── @access  Public
const register = async (req, res, next) => {
  try {
    const {
      name, email, password, role,
      age, gender,                        // patient
      specialization, yearsExperience, clinicAddress, // doctor
      trainingType,                       // coach
    } = req.body;

    // Basic validation
    if (!name || !email || !password) {
      return res.status(400).json({ success: false, message: 'Name, email, and password are required' });
    }

    // Check for duplicate email
    const existing = await User.findOne({ email });
    if (existing) {
      return res.status(400).json({ success: false, message: 'Email already registered' });
    }

    // Build user object
    const userData = { name, email, password, role: role || 'patient' };

    if (userData.role === 'patient') {
      userData.age    = age;
      userData.gender = gender;
    } else if (userData.role === 'doctor') {
      userData.specialization  = specialization;
      userData.yearsExperience = yearsExperience;
      userData.clinicAddress   = clinicAddress;
    } else if (userData.role === 'coach') {
      userData.trainingType    = trainingType;
      userData.yearsExperience = yearsExperience;
    }

    const user  = await User.create(userData);
    const token = generateToken(user._id);

    res.status(201).json({
      success: true,
      token,
      user: {
        id:   user._id,
        name: user.name,
        email: user.email,
        role: user.role,
      },
    });
  } catch (err) {
    next(err);
  }
};

// ── @route   POST /auth/login
// ── @access  Public
const login = async (req, res, next) => {
  try {
    const { email, password } = req.body;

    if (!email || !password) {
      return res.status(400).json({ success: false, message: 'Email and password are required' });
    }

    // Include password field explicitly (it's excluded by default via select:false)
    const user = await User.findOne({ email }).select('+password');
    if (!user) {
      return res.status(401).json({ success: false, message: 'Invalid credentials' });
    }

    const isMatch = await user.matchPassword(password);
    if (!isMatch) {
      return res.status(401).json({ success: false, message: 'Invalid credentials' });
    }

    const token = generateToken(user._id);

    res.status(200).json({
      success: true,
      token,
      user: {
        id:    user._id,
        name:  user.name,
        email: user.email,
        role:  user.role,
      },
    });
  } catch (err) {
    next(err);
  }
};

// ── @route   GET /auth/me
// ── @access  Private
const getMe = async (req, res) => {
  res.status(200).json({ success: true, user: req.user });
};

module.exports = { register, login, getMe };