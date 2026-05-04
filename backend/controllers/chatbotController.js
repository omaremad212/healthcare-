// controllers/chatbotController.js
// Processes patient chatbot answers, computes health score,
// determines recommendation (doctor | coach | both | none),
// and saves result to DB.
//
// Only accessible by patients (enforced in routes via authorize middleware).

const ChatbotResult = require('../models/ChatbotResult');

// ── Helpers ────────────────────────────────────────────────────

/** Compute a simple health risk score from answers */
function calculateHealthScore(ans) {
  let score = 0;
  if (Number(ans.sleep) < 5)          score += 2;
  if (ans.water       === 'no')        score += 1;
  if (ans.headache    === 'yes')       score += 2;
  if (ans.symptoms    === 'fever')     score += 3;
  if (ans.temperature === 'yes')       score += 2;
  if (ans.duration    === 'more3')     score += 2;
  if (ans.painSeverity === 'severe')   score += 3;
  if (ans.breathShort  === 'yes')      score += 3;
  return score;
}

/** Map score to status and risk level */
function calculateStatus(score) {
  if (score <= 2) return { status: 'Stable',   riskLevel: 'Low'    };
  if (score <= 5) return { status: 'Moderate',  riskLevel: 'Medium' };
  return            { status: 'Critical',  riskLevel: 'High'   };
}

/** Calculate BMI */
function calcBMI(weight, height) {
  if (!weight || !height || height === 0) return null;
  const hm = height / 100;
  return parseFloat((weight / (hm * hm)).toFixed(1));
}

/**
 * Core recommendation logic (IF-based):
 * - Health flow  → high score → doctor
 * - Fitness flow → bmi issue or injury → coach
 * - Both flags   → both
 */
function determineRecommendation(answers, score, bmi) {
  let needsDoctor = false;
  let needsCoach  = false;

  if (answers.flowType === 'health') {
    if (score >= 6)                        needsDoctor = true; // Critical
    if (answers.breathShort === 'yes')     needsDoctor = true;
    if (answers.temperature === 'yes')     needsDoctor = true;
    if (answers.duration    === 'more3')   needsDoctor = true;
    if (score > 2 && score <= 5)           needsCoach  = true; // Moderate → lifestyle coaching helps
  } else {
    // fitness flow
    if (bmi && bmi >= 30)                  needsDoctor = true; // obese — medical supervision
    if (bmi && bmi < 18.5)                needsCoach  = true;
    if (answers.fitnessGoal)               needsCoach  = true;
    if (answers.injury === 'yes')          needsDoctor = true;
  }

  if (needsDoctor && needsCoach) return 'both';
  if (needsDoctor)               return 'doctor';
  if (needsCoach)                return 'coach';
  return 'none';
}

/** Build a human-readable advice summary */
function buildAdviceSummary(answers, status, riskLevel, recommendation) {
  const tips = [];
  if (Number(answers.sleep) < 5)        tips.push('Improve your sleep — aim for 7-8 hours.');
  if (answers.water === 'no')           tips.push('Drink at least 2 litres of water daily.');
  if (answers.headache === 'yes')       tips.push('Monitor headache and reduce stress.');
  if (answers.temperature === 'yes')    tips.push('You may have a fever — seek medical care.');
  if (answers.breathShort === 'yes')    tips.push('Shortness of breath is serious — see a doctor promptly.');
  if (answers.duration === 'more3')     tips.push('Symptoms lasting 3+ days need a doctor\'s assessment.');
  if (answers.diet === 'poor')          tips.push('Improve your diet — nutrition is 70% of the result.');
  if (answers.injury === 'yes')         tips.push('Consult a physiotherapist about your injury.');
  if (status === 'Critical')            tips.unshift('⚠️ Immediate medical consultation is strongly recommended.');
  if (tips.length === 0)                tips.push('Your health indicators look good — keep up the great work!');
  return tips.join(' | ');
}

// ── @route   POST /chatbot
// ── @access  Private / Patient only
const runChatbot = async (req, res, next) => {
  try {
    const answers = req.body; // full answers object from frontend

    let healthScore   = 0;
    let status        = 'Stable';
    let riskLevel     = 'Low';
    let bmi           = null;

    if (answers.flowType === 'health') {
      healthScore = calculateHealthScore(answers);
      ({ status, riskLevel } = calculateStatus(healthScore));
    } else {
      // fitness flow: compute BMI
      bmi = calcBMI(answers.weight, answers.height);
      if (bmi && bmi >= 30)   riskLevel = 'High';
      else if (bmi && bmi >= 25) riskLevel = 'Medium';
      else                    riskLevel = 'Low';
      status = 'Active';
    }

    const recommendation = determineRecommendation(answers, healthScore, bmi);
    const adviceSummary  = buildAdviceSummary(answers, status, riskLevel, recommendation);

    // Save result to database
    const result = await ChatbotResult.create({
      patient: req.user._id,
      answers,
      healthScore,
      status,
      riskLevel,
      bmi,
      recommendation,
      adviceSummary,
    });

    res.status(200).json({
      success: true,
      data: {
        healthScore,
        status,
        riskLevel,
        bmi,
        recommendation,
        adviceSummary,
        resultId: result._id,
      },
    });
  } catch (err) {
    next(err);
  }
};

// ── @route   GET /chatbot/history
// ── @access  Private / Patient only
const getChatbotHistory = async (req, res, next) => {
  try {
    const results = await ChatbotResult.find({ patient: req.user._id })
      .sort({ createdAt: -1 })
      .limit(10);

    res.status(200).json({ success: true, count: results.length, data: results });
  } catch (err) {
    next(err);
  }
};

module.exports = { runChatbot, getChatbotHistory };