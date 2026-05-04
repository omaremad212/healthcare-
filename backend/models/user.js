// models/User.js
// Unified User model — stores patients, doctors, and coaches
// All 3 roles share the same collection, differentiated by "role" field

const mongoose = require('mongoose');
const bcrypt   = require('bcryptjs');

const UserSchema = new mongoose.Schema(
  {
    name: {
      type: String,
      required: [true, 'Name is required'],
      trim: true,
    },

    email: {
      type: String,
      required: [true, 'Email is required'],
      unique: true,
      lowercase: true,
      trim: true,
    },

    password: {
      type: String,
      required: [true, 'Password is required'],
      minlength: 6,
      select: false, // never return password in queries by default
    },

    // ── Role ──────────────────────────────────────────────────
    role: {
      type: String,
      enum: ['patient', 'doctor', 'coach'],
      default: 'patient',
    },

    // ── Patient-specific fields ───────────────────────────────
    age:    { type: Number },
    gender: { type: String, enum: ['Male', 'Female'] },

    // ── Doctor-specific fields ────────────────────────────────
    specialization:    { type: String },
    yearsExperience:   { type: Number },
    clinicAddress:     { type: String },

    // ── Coach-specific fields ─────────────────────────────────
    trainingType:      { type: String },
  },
  { timestamps: true }
);

// ── Hash password before save ──────────────────────────────────
UserSchema.pre('save', async function (next) {
  if (!this.isModified('password')) return next();
  const salt = await bcrypt.genSalt(10);
  this.password = await bcrypt.hash(this.password, salt);
  next();
});

// ── Instance method: compare passwords ────────────────────────
UserSchema.methods.matchPassword = async function (enteredPassword) {
  return await bcrypt.compare(enteredPassword, this.password);
};

module.exports = mongoose.model('User', UserSchema);