// api/dashboard.js - Vercel Serverless API with Supabase

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
  if (req.method !== 'GET') {
    return res.status(405).json({ success: false, message: 'Method not allowed' });
  }

  const authHeader = req.headers.authorization;
  const userId = getUserIdFromToken(authHeader);
  
  if (!userId) {
    return res.status(401).json({ success: false, message: 'Not authorized' });
  }

  try {
    // Fetch user profile
    const { data: users, error: userError } = await supabase
      .from('users')
      .select('*')
      .eq('id', userId)
      .limit(1);

    if (userError || !users || users.length === 0) {
      return res.status(404).json({ success: false, message: 'User not found' });
    }

    const user = users[0];

    // Fetch latest chatbot result
    const { data: results, error: resultsError } = await supabase
      .from('chatbot_results')
      .select('*')
      .eq('user_id', userId)
      .order('created_at', { ascending: false })
      .limit(1);

    const latestResult = results && results.length > 0 ? results[0] : null;

    // Fetch chatbot history
    const { data: history, error: historyError } = await supabase
      .from('chatbot_results')
      .select('id, status, risk_level, recommendation, health_score, bmi, created_at')
      .eq('user_id', userId)
      .order('created_at', { ascending: false })
      .limit(5);

    // Fetch bookings
    const { data: bookings, error: bookingsError } = await supabase
      .from('bookings')
      .select('*')
      .eq('user_id', userId)
      .order('created_at', { ascending: false })
      .limit(10);

    // Fetch orders
    const { data: orders, error: ordersError } = await supabase
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
          assessments: history ? history.length : 0
        }
      }
    });
  } catch (err) {
    console.error('Dashboard error:', err);
    res.status(500).json({ success: false, message: err.message });
  }
}