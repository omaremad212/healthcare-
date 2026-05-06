// api/plans.js - Vercel Serverless API for Plans

const jwt = require('jsonwebtoken');
const { supabase } = require('../lib/supabase');

function normalizePlan(plan) {
  if (!plan) return null;
  return {
    id: plan.id,
    userId: plan.user_id,
    type: plan.type,
    title: plan.title || 'Your Personalized Plan',
    patientName: plan.patient_name,
    summary: plan.summary,
    exercises: plan.exercises,
    dietPlan: plan.diet_plan,
    supplements: plan.supplements,
    medicines: plan.medicines,
    instructions: plan.instructions,
    followUp: plan.follow_up,
    lifestyleTips: plan.lifestyle_tips,
    workoutLocation: plan.workout_location,
    goal: plan.goal,
    createdAt: plan.created_at,
  };
}

function getUserIdFromToken(authHeader) {
  if (!authHeader || !authHeader.startsWith('Bearer ')) return null;
  try {
    const decoded = jwt.verify(authHeader.split(' ')[1], process.env.JWT_SECRET || 'secret123');
    return decoded.id;
  } catch (e) {
    return null;
  }
}

module.exports = async function handler(req, res) {
  res.setHeader('Content-Type', 'application/json');

  try {
    if (req.method !== 'GET' && req.method !== 'POST') {
      return res.status(405).json({ success: false, message: 'Method not allowed' });
    }

    const authHeader = req.headers.authorization;
    const userId = getUserIdFromToken(authHeader);

    if (!userId) {
      return res.status(401).json({ success: false, message: 'Not authorized' });
    }

    if (req.method === 'GET') {
      const type = req.query.type || 'latest';

      if (type === 'latest') {
        const planType = req.query.planType;
        let query = supabase
          .from('plans')
          .select('*')
          .eq('user_id', userId)
          .order('created_at', { ascending: false })
          .limit(1);

        if (planType) {
          query = query.eq('type', planType);
        }

        const { data: plans, error } = await query;

        if (error) {
          console.error('[plans] Supabase fetch error:', error.message);
          return res.status(500).json({ success: false, message: error.message || 'Failed to fetch plan' });
        }

        if (!plans || plans.length === 0) {
          return res.status(200).json({ success: true, data: null, message: 'No plan generated yet.' });
        }

        return res.status(200).json({ success: true, data: normalizePlan(plans[0]) });
      }

      if (type === 'history') {
        const { data: plans, error } = await supabase
          .from('plans')
          .select('*')
          .eq('user_id', userId)
          .order('created_at', { ascending: false })
          .limit(20);

        if (error) {
          console.error('[plans] Supabase history error:', error.message);
          return res.status(500).json({ success: false, message: error.message || 'Failed to fetch history' });
        }

        return res.status(200).json({ success: true, count: plans.length, data: plans.map(normalizePlan) });
      }
    }

    if (req.method === 'POST') {
      const {
        type, title, patientName, summary, exercises, dietPlan,
        supplements, medicines, instructions, followUp, lifestyleTips,
        workoutLocation, goal,
      } = req.body;

      if (!type || !title) {
        return res.status(400).json({ success: false, message: 'Type and title are required' });
      }

      const validTypes = ['treatment', 'fitness'];
      if (!validTypes.includes(type)) {
        return res.status(400).json({ success: false, message: 'Type must be either "treatment" or "fitness"' });
      }

      const { data: plan, error } = await supabase
        .from('plans')
        .insert({
          user_id: userId,
          type,
          title,
          patient_name: patientName || null,
          summary: summary || null,
          exercises: exercises ? JSON.stringify(exercises) : null,
          diet_plan: dietPlan || null,
          supplements: supplements || null,
          medicines: medicines || null,
          instructions: instructions || null,
          follow_up: followUp || null,
          lifestyle_tips: lifestyleTips || null,
          workout_location: workoutLocation || null,
          goal: goal || null,
          created_at: new Date().toISOString(),
        })
        .select()
        .single();

      if (error) {
        console.error('[plans] Supabase insert error:', error.message);
        return res.status(500).json({
          success: false,
          message: error.message || 'Database error',
          details: error.details || null,
          hint: error.hint || null,
        });
      }

      res.status(201).json({ success: true, data: plan });
    }
  } catch (err) {
    console.error('[plans] Unexpected error:', err.message);
    res.status(500).json({ success: false, message: err.message || 'Internal server error' });
  }
};
