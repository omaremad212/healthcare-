// api/plans.js - Vercel Serverless API for Plans

const { supabase } = require('../../lib/supabase');

// Helper to get user ID from token
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
  if (req.method !== 'GET' && req.method !== 'POST') {
    return res.status(405).json({ success: false, message: 'Method not allowed' });
  }

  const authHeader = req.headers.authorization;
  const userId = getUserIdFromToken(authHeader);
  
  if (!userId) {
    return res.status(401).json({ success: false, message: 'Not authorized' });
  }

  try {
    // GET /api/plans?type=latest|history
    if (req.method === 'GET') {
      const type = req.query.type || 'latest';
      
      if (type === 'latest') {
        // Get latest plan (treatment or fitness based on query param)
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
          console.error('Supabase query error:', error);
          return res.status(500).json({ success: false, message: 'Failed to fetch plan' });
        }
        
        if (!plans || plans.length === 0) {
          return res.status(200).json({ success: true, data: null });
        }
        
        return res.status(200).json({ success: true, data: plans[0] });
      } 
      else if (type === 'history') {
        const { data: plans, error } = await supabase
          .from('plans')
          .select('*')
          .eq('user_id', userId)
          .order('created_at', { ascending: false })
          .limit(20);
        
        if (error) {
          console.error('Supabase query error:', error);
          return res.status(500).json({ success: false, message: 'Failed to fetch history' });
        }
        
        return res.status(200).json({ success: true, count: plans.length, data: plans });
      }
    }
    
    // POST /api/plans - Create new plan
    if (req.method === 'POST') {
      const { 
        type, title, patientName, summary, exercises, dietPlan, 
        supplements, medicines, instructions, followUp, lifestyleTips,
        workoutLocation, goal
      } = req.body;

      if (!type || !title) {
        return res.status(400).json({ success: false, message: 'Type and title are required' });
      }

      const insertPayload = {
        user_id: userId,
        type: type,
        title: title,
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
        created_at: new Date().toISOString()
      };

      console.log('[plans] Insert payload:', JSON.stringify(insertPayload, null, 2));

      const { data: plan, error } = await supabase
        .from('plans')
        .insert(insertPayload)
        .select()
        .single();

      if (error) {
        console.error('[plans] Supabase insert error details:', JSON.stringify(error, null, 2));
        return res.status(500).json({ success: false, message: error.message, details: error });
      }

      res.status(201).json({ success: true, data: plan });
    }
  } catch (err) {
    console.error('Plans error:', err);
    res.status(500).json({ success: false, message: err.message });
  }
}