// api/chatbot.js - Vercel Serverless API with Supabase

const { supabase } = require('../../lib/supabase');

function calculateHealthScore(ans) {
  let score = 0;
  if (ans && Number(ans.sleep) < 5) score += 2;
  if (ans && ans.water === 'no') score += 1;
  if (ans && ans.headache === 'yes') score += 2;
  if (ans && ans.symptoms === 'fever') score += 3;
  if (ans && ans.temperature === 'yes') score += 2;
  if (ans && ans.duration === 'more3') score += 2;
  if (ans && ans.painSeverity === 'severe') score += 3;
  if (ans && ans.breathShort === 'yes') score += 3;
  return score;
}

function calculateStatus(score) {
  if (score <= 2) return { status: 'Stable', riskLevel: 'Low' };
  if (score <= 5) return { status: 'Moderate', riskLevel: 'Medium' };
  return { status: 'Critical', riskLevel: 'High' };
}

function calcBMI(weight, height) {
  if (!weight || !height || height === 0) return null;
  const hm = height / 100;
  return parseFloat((weight / (hm * hm)).toFixed(1));
}

function determineRecommendation(answers, score, bmi) {
  if (!answers) return 'none';
  
  let needsDoctor = false;
  let needsCoach = false;

  if (answers.flowType === 'health') {
    if (score >= 6) needsDoctor = true;
    if (answers.breathShort === 'yes') needsDoctor = true;
    if (answers.temperature === 'yes') needsDoctor = true;
    if (answers.duration === 'more3') needsDoctor = true;
    if (score > 2 && score <= 5) needsCoach = true;
  } else {
    if (bmi && bmi >= 30) needsDoctor = true;
    if (bmi && bmi < 18.5) needsCoach = true;
    if (answers.fitnessGoal) needsCoach = true;
    if (answers.injury === 'yes') needsDoctor = true;
  }

  if (needsDoctor && needsCoach) return 'both';
  if (needsDoctor) return 'doctor';
  if (needsCoach) return 'coach';
  return 'none';
}

function buildAdviceSummary(answers, status) {
  if (!answers) return 'No advice available';
  
  const tips = [];
  if (Number(answers.sleep) < 5) tips.push('Improve your sleep — aim for 7-8 hours.');
  if (answers.water === 'no') tips.push('Drink at least 2 litres of water daily.');
  if (answers.headache === 'yes') tips.push('Monitor headache and reduce stress.');
  if (answers.temperature === 'yes') tips.push('You may have a fever — seek medical care.');
  if (answers.breathShort === 'yes') tips.push('Shortness of breath is serious — see a doctor promptly.');
  if (answers.duration === 'more3') tips.push('Symptoms lasting 3+ days need a doctor\'s assessment.');
  if (answers.diet === 'poor') tips.push('Improve your diet — nutrition is 70% of the result.');
  if (answers.injury === 'yes') tips.push('Consult a physiotherapist about your injury.');
  if (status === 'Critical') tips.unshift('⚠️ Immediate medical consultation is strongly recommended.');
  if (tips.length === 0) tips.push('Your health indicators look good — keep up the great work!');
  return tips.join(' | ');
}

function getUserIdFromToken(authHeader) {
  if (!authHeader || !authHeader.startsWith('Bearer ')) return null;
  try {
    const jwt = require('jsonwebtoken');
    const decoded = jwt.verify(authHeader.split(' ')[1], process.env.JWT_SECRET || 'secret123');
    return decoded.id;
  } catch (e) {
    return null;
  }
}

export default async function handler(req, res) {
  try {
    // GET - return health/status response
    if (req.method === 'GET') {
      return res.status(200).json({ 
        success: true, 
        message: 'Chatbot API is running',
        endpoints: {
          GET: 'Returns this status message',
          POST: 'Submit health/fitness assessment answers'
        }
      });
    }

    // POST - handle assessment
    if (req.method !== 'POST') {
      return res.status(405).json({ success: false, message: 'Method not allowed' });
    }

    const authHeader = req.headers.authorization;
    const userId = getUserIdFromToken(authHeader);
    
    if (!userId) {
      return res.status(401).json({ success: false, message: 'Not authorized - no valid token' });
    }

    // Validate request body
    const answers = req.body;
    if (!answers || typeof answers !== 'object') {
      return res.status(400).json({ success: false, message: 'Invalid request body - expected object' });
    }

    let healthScore = 0;
    let status = 'Stable';
    let riskLevel = 'Low';
    let bmi = null;

    if (answers.flowType === 'health') {
      healthScore = calculateHealthScore(answers);
      const result = calculateStatus(healthScore);
      status = result.status;
      riskLevel = result.riskLevel;
    } else {
      bmi = calcBMI(answers.weight, answers.height);
      if (bmi && bmi >= 30) riskLevel = 'High';
      else if (bmi && bmi >= 25) riskLevel = 'Medium';
      else riskLevel = 'Low';
      status = 'Active';
    }

    const recommendation = determineRecommendation(answers, healthScore, bmi);
    const adviceSummary = buildAdviceSummary(answers, status);

    // Insert into Supabase - match exact column names from schema
    const { data: result, error } = await supabase
      .from('chatbot_results')
      .insert({
        user_id: userId,
        flow_type: answers.flowType || null,
        sleep: answers.sleep || null,
        water: answers.water || null,
        headache: answers.headache || null,
        pain_severity: answers.painSeverity || null,
        symptoms: answers.symptoms || null,
        temperature: answers.temperature || null,
        breath_short: answers.breathShort || null,
        duration: answers.duration || null,
        health_goal: answers.healthGoal || null,
        fitness_goal: answers.fitnessGoal || null,
        train_freq: answers.trainFreq || null,
        location: answers.location || null,
        level: answers.level || null,
        weight: answers.weight || null,
        height: answers.height || null,
        injury: answers.injury || null,
        diet: answers.diet || null,
        health_score: healthScore,
        status: status,
        risk_level: riskLevel,
        bmi: bmi,
        recommendation: recommendation,
        advice_summary: adviceSummary,
        created_at: new Date().toISOString()
      })
      .select()
      .single();

    if (error) {
      console.error('Supabase insert error:', error);
      return res.status(500).json({ success: false, message: 'Failed to save result: ' + error.message });
    }

    res.status(200).json({
      success: true,
      data: {
        healthScore,
        status,
        riskLevel,
        bmi,
        recommendation,
        adviceSummary,
        resultId: result.id,
      },
    });

  } catch (err) {
    console.error('Chatbot error:', err);
    return res.status(500).json({ success: false, message: err.message || 'Internal server error' });
  }
}