// api/auth/register.js - Vercel Serverless API with Supabase

const jwt = require('jsonwebtoken');
const bcrypt = require('bcryptjs');
const { supabase } = require('../../lib/supabase');

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

    // Check for existing user in Supabase
    const { data: existingUsers } = await supabase
      .from('users')
      .select('id')
      .eq('email', email)
      .limit(1);

    if (existingUsers && existingUsers.length > 0) {
      return res.status(400).json({ success: false, message: 'Email already registered' });
    }

    // Hash password
    const salt = await bcrypt.genSalt(10);
    const hashedPassword = await bcrypt.hash(password, salt);

    // Insert user into Supabase
    const { data: newUser, error } = await supabase
      .from('users')
      .insert({
        name,
        email,
        password: hashedPassword,
        role: role || 'patient',
        age: role === 'patient' ? age : null,
        gender: role === 'patient' ? gender : null,
        specialization: role === 'doctor' ? specialization : null,
        years_experience: role === 'doctor' || role === 'coach' ? yearsExperience : null,
        clinic_address: role === 'doctor' ? clinicAddress : null,
        training_type: role === 'coach' ? trainingType : null,
        created_at: new Date().toISOString()
      })
      .select()
      .single();

    if (error) {
      console.error('Supabase insert error:', error);
      return res.status(500).json({ success: false, message: 'Failed to create user: ' + error.message });
    }

    const token = generateToken(newUser.id);

    res.status(201).json({
      success: true,
      token,
      user: {
        id: newUser.id,
        name: newUser.name,
        email: newUser.email,
        role: newUser.role,
      },
    });
  } catch (err) {
    console.error('Register error:', err);
    res.status(500).json({ success: false, message: err.message });
  }
}