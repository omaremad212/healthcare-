// api/auth/register.js - Vercel Serverless API

const jwt = require('jsonwebtoken');
const bcrypt = require('bcryptjs');

// In-memory store for Vercel (resets on cold start)
global.users = global.users || [];

const generateToken = (userId) => {
  return jwt.sign({ id: userId }, process.env.JWT_SECRET || 'secret123', {
    expiresIn: '7d',
  });
};

export default async function handler(req, res) {
  if (req.method !== 'POST') {
    return res.status(405).json({ success: false, message: 'Method not allowed' });
  }

  try {
    const { name, email, password, role, age, gender, specialization, yearsExperience, clinicAddress, trainingType } = req.body;

    if (!name || !email || !password) {
      return res.status(400).json({ success: false, message: 'Name, email, and password are required' });
    }

    // Check for duplicate email
    const existing = global.users.find(u => u.email === email);
    if (existing) {
      return res.status(400).json({ success: false, message: 'Email already registered' });
    }

    // Hash password
    const salt = await bcrypt.genSalt(10);
    const hashedPassword = await bcrypt.hash(password, salt);

    // Build user object
    const user = {
      _id: 'user_' + Date.now(),
      name,
      email,
      password: hashedPassword,
      role: role || 'patient',
      age: role === 'patient' ? age : undefined,
      gender: role === 'patient' ? gender : undefined,
      specialization: role === 'doctor' ? specialization : undefined,
      yearsExperience: role === 'doctor' || role === 'coach' ? yearsExperience : undefined,
      clinicAddress: role === 'doctor' ? clinicAddress : undefined,
      trainingType: role === 'coach' ? trainingType : undefined,
      createdAt: new Date().toISOString(),
    };

    global.users.push(user);
    const token = generateToken(user._id);

    res.status(201).json({
      success: true,
      token,
      user: {
        id: user._id,
        name: user.name,
        email: user.email,
        role: user.role,
      },
    });
  } catch (err) {
    res.status(500).json({ success: false, message: err.message });
  }
}