// api/dashboard.js - Vercel Serverless API with Supabase

const jwt = require('jsonwebtoken');
const { supabase } = require('../lib/supabase');

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
  if (req.method !== 'GET') {
    return res.status(405).json({ success: false, message: 'Method not allowed' });
  }

  const authHeader = req.headers.authorization;
  const userId = getUserIdFromToken(authHeader);

  if (!userId) {
    return res.status(401).json({ success: false, message: 'Not authorized' });
  }

  try {
    const { data: users, error: userError } = await supabase
      .from('users')
      .select('*')
      .eq('id', userId)
      .limit(1);

    if (userError || !users || users.length === 0) {
      return res.status(404).json({ success: false, message: 'User not found' });
    }

    const user = users[0];

    const { data: results } = await supabase
      .from('chatbot_results')
      .select('*')
      .eq('user_id', userId)
      .order('created_at', { ascending: false })
      .limit(1);

    const latestResult = results && results.length > 0 ? results[0] : null;

    const { data: history } = await supabase
      .from('chatbot_results')
      .select('id, status, risk_level, recommendation, health_score, bmi, created_at')
      .eq('user_id', userId)
      .order('created_at', { ascending: false })
      .limit(5);

    const { data: bookings } = await supabase
      .from('bookings')
      .select('*')
      .eq('user_id', userId)
      .order('created_at', { ascending: false })
      .limit(10);

    const { data: orders } = await supabase
      .from('orders')
      .select('*')
      .eq('user_id', userId)
      .order('created_at', { ascending: false })
      .limit(10);

    res.status(200).json({
      success: true,
      data: {
        profile: user,
        latestResult,
        chatbotHistory: history || [],
        bookings: bookings || [],
        orders: orders || [],
        stats: {
          totalBookings: bookings ? bookings.length : 0,
          totalOrders: orders ? orders.length : 0,
          assessments: history ? history.length : 0,
        },
      },
    });
  } catch (err) {
    console.error('Dashboard error:', err);
    res.status(500).json({ success: false, message: err.message });
  }
};
