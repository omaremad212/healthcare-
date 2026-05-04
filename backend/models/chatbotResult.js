// models/ChatbotResult.js
// Stores chatbot assessment results for patients

const mongoose = require('mongoose');

const ChatbotResultSchema = new mongoose.Schema(
  {
    patient: {
      type: mongoose.Schema.Types.ObjectId,
      ref: 'User',
      required: true,
    },

    // The answers the patient submitted
    answers: {
      flowType:     { type: String }, // 'health' | 'fitness'
      sleep:        { type: Number },
      water:        { type: String },
      headache:     { type: String },
      painSeverity: { type: String },
      symptoms:     { type: String },
      temperature:  { type: String },
      breathShort:  { type: String },
      duration:     { type: String },
      healthGoal:   { type: String },
      fitnessGoal:  { type: String },
      trainFreq:    { type: String },
      location:     { type: String },
      level:        { type: String },
      weight:       { type: Number },
      height:       { type: Number },
      injury:       { type: String },
      diet:         { type: String },
    },

    // Computed results
    healthScore:  { type: Number },
    status:       { type: String }, // 'Stable' | 'Moderate' | 'Critical'
    riskLevel:    { type: String }, // 'Low' | 'Medium' | 'High'
    bmi:          { type: Number },

    // Chatbot recommendation: 'doctor' | 'coach' | 'both' | 'none'
    recommendation: {
      type: String,
      enum: ['doctor', 'coach', 'both', 'none'],
      required: true,
    },

    adviceSummary: { type: String },
  },
  { timestamps: true }
);

module.exports = mongoose.model('ChatbotResult', ChatbotResultSchema);