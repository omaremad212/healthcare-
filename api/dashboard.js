// api/dashboard.js - Vercel Serverless API with Supabase
// Routes: GET /api/dashboard
//         GET /api/admin  →  rewritten to ?action=admin

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

async function handleAdmin(res) {
  const [
    { count: totalUsers },
    { count: totalBookings },
    { count: totalOrders },
    { count: totalProducts },
    { data: recentBookings },
    { data: recentOrders },
    { data: recentUsers },
    { data: bookingsByStatus },
  ] = await Promise.all([
    supabase.from('users').select('*', { count: 'exact', head: true }),
    supabase.from('bookings').select('*', { count: 'exact', head: true }),
    supabase.from('orders').select('*', { count: 'exact', head: true }),
    supabase.from('products').select('*', { count: 'exact', head: true }),
    supabase.from('bookings')
      .select('id, doctor_name, date, time_slot, status, fee, booking_type, created_at, professional_role')
      .order('created_at', { ascending: false }).limit(10),
    supabase.from('orders')
      .select('id, total_amount, payment_method, payment_status, status, created_at')
      .order('created_at', { ascending: false }).limit(10),
    supabase.from('users')
      .select('id, name, email, role, created_at')
      .order('created_at', { ascending: false }).limit(10),
    supabase.from('bookings').select('status'),
  ]);

  const statusBreakdown = { confirmed: 0, pending: 0, cancelled: 0, completed: 0 };
  (bookingsByStatus || []).forEach(b => {
    const s = b.status || 'pending';
    statusBreakdown[s] = (statusBreakdown[s] || 0) + 1;
  });

  const { data: paidOrders } = await supabase
    .from('orders').select('total_amount').eq('payment_status', 'paid');
  const totalRevenue = (paidOrders || []).reduce((sum, o) => sum + (o.total_amount || 0), 0);

  const { data: userRoles } = await supabase.from('users').select('role');
  const roleBreakdown = { patient: 0, doctor: 0, coach: 0 };
  (userRoles || []).forEach(u => {
    const r = u.role || 'patient';
    roleBreakdown[r] = (roleBreakdown[r] || 0) + 1;
  });

  return res.status(200).json({
    success: true,
    data: {
      stats: {
        totalUsers:    totalUsers    || 0,
        totalBookings: totalBookings || 0,
        totalOrders:   totalOrders   || 0,
        totalProducts: totalProducts || 0,
        totalRevenue,
      },
      roleBreakdown,
      statusBreakdown,
      recentBookings: recentBookings || [],
      recentOrders:   recentOrders   || [],
      recentUsers:    recentUsers    || [],
    },
  });
}

module.exports = async function handler(req, res) {
  res.setHeader('Content-Type', 'application/json');

  if (req.method !== 'GET') {
    return res.status(405).json({ success: false, message: 'Method not allowed' });
  }

  const userId = getUserIdFromToken(req.headers.authorization);
  if (!userId) {
    return res.status(401).json({ success: false, message: 'Not authorized' });
  }

  try {
    // Admin sub-route
    if (req.query.action === 'admin') {
      return await handleAdmin(res);
    }

    // Regular dashboard
    const { data: users, error: userError } = await supabase
      .from('users').select('*').eq('id', userId).limit(1);

    if (userError || !users || users.length === 0) {
      return res.status(404).json({ success: false, message: 'User not found' });
    }

    const user = users[0];

    const { data: results } = await supabase
      .from('chatbot_results').select('*')
      .eq('user_id', userId).order('created_at', { ascending: false }).limit(1);

    const latestResult = results && results.length > 0 ? results[0] : null;

    const { data: history } = await supabase
      .from('chatbot_results')
      .select('id, status, risk_level, recommendation, health_score, bmi, created_at')
      .eq('user_id', userId).order('created_at', { ascending: false }).limit(5);

    const { data: bookings } = await supabase
      .from('bookings').select('*')
      .eq('user_id', userId).order('created_at', { ascending: false }).limit(10);

    const { data: orders } = await supabase
      .from('orders').select('*')
      .eq('user_id', userId).order('created_at', { ascending: false }).limit(10);

    return res.status(200).json({
      success: true,
      data: {
        profile: user,
        latestResult,
        chatbotHistory: history || [],
        bookings: bookings || [],
        orders: orders || [],
        stats: {
          totalBookings: bookings ? bookings.length : 0,
          totalOrders:   orders   ? orders.length   : 0,
          assessments:   history  ? history.length   : 0,
        },
      },
    });
  } catch (err) {
    console.error('Dashboard error:', err);
    return res.status(500).json({ success: false, message: err.message });
  }
};
