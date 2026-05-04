// api/chatbot.js - Vercel Serverless API with Supabase

const { supabase } = require('../../lib/supabase');

function calculateHealthScore(ans) {
  let score = 0;
  if (Number(ans.sleep) < 5) score += 2;
  if (ans.water === 'no') score += 1;
  if (ans.headache === 'yes') score += 2;
  if (ans.symptoms === 'fever') score += 3;
  if (ans.temperature === 'yes') score += 2;
  if (ans.duration === 'more3') score += 2;
  if (ans.painSeverity === 'severe') score += 3;
  if (ans.breathShort === 'yes') score += 3;
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

function buildAdviceSummary(answers, status, riskLevel) {
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

// Helper to get user ID from token (simplified for demo)
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
  if (req.method !== 'POST' && req.method !== 'GET') {
    return res.status(405).json({ success: false, message: 'Method not allowed' });
  }

  const authHeader = req.headers.authorization;
  const userId = getUserIdFromToken(authHeader);
  
  if (!userId) {
    return res.status(401).json({ success: false, message: 'Not authorized' });
  }

  try {
    if (req.method === 'POST') {
      const answers = req.body;
      let healthScore = 0;
      let status = 'Stable';
      let riskLevel = 'Low';
      let bmi = null;

      if (answers.flowType === 'health') {
        healthScore = calculateHealthScore(answers);
        ({ status, riskLevel } = calculateStatus(healthScore));
      } else {
        bmi = calcBMI(answers.weight, answers.height);
        if (bmi && bmi >= 30) riskLevel = 'High';
        else if (bmi && bmi >= 25) riskLevel = 'Medium';
        else riskLevel = 'Low';
        status = 'Active';
      }

      const recommendation = determineRecommendation(answers, healthScore, bmi);
      const adviceSummary = buildAdviceSummary(answers, status, riskLevel);

      // Insert into Supabase
      const { data: result, error } = await supabase
        .from('chatbot_results')
        .insert({
          user_id: userId,
          flow_type: answers.flowType,
          sleep: answers.sleep,
          water: answers.water,
          headache: answers.headache,
          pain_severity: answers.painSeverity,
          symptoms: answers.symptoms,
          temperature: answers.temperature,
          breath_short: answers.breathShort,
          duration: answers.duration,
          health_goal: answers.healthGoal,
          fitness_goal: answers.fitnessGoal,
          train_freq: answers.trainFreq,
          location: answers.location,
          level: answers.level,
          weight: answers.weight,
          height: answers.height,
          injury: answers.injury,
          diet: answers.diet,
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
    } else {
      // GET - return history
      const { data: results, error } = await supabase
        .from('chatbot_results')
        .select('*')
        .eq('user_id', userId)
        .order('created_at', { ascending: false })
        .limit(10);

      if (error) {
        console.error('Supabase query error:', error);
        return res.status(500).json({ success: false, message: 'Failed to fetch history' });
      }

      res.status(200).json({ success: true, count: results.length, data: results });
    }
  } catch (err) {
    console.error('Chatbot error:', err);
    res.status(500).json({ success: false, message: err.message });
  }
}