// api/admin.js - Admin Dashboard — aggregate platform statistics

const jwt = require('jsonwebtoken');
const { supabase } = require('../lib/supabase');

function getUserFromToken(authHeader) {
  if (!authHeader || !authHeader.startsWith('Bearer ')) return null;
  try {
    return jwt.verify(authHeader.split(' ')[1], process.env.JWT_SECRET || 'secret123');
  } catch (e) {
    return null;
  }
}

module.exports = async function handler(req, res) {
  if (req.method !== 'GET') {
    return res.status(405).json({ success: false, message: 'Method not allowed' });
  }

  const user = getUserFromToken(req.headers.authorization);
  if (!user) {
    return res.status(401).json({ success: false, message: 'Not authorized' });
  }

  try {
    // Aggregate stats
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

      // Recent 10 bookings
      supabase.from('bookings')
        .select('id, doctor_name, date, time_slot, status, fee, booking_type, created_at, professional_role')
        .order('created_at', { ascending: false })
        .limit(10),

      // Recent 10 orders
      supabase.from('orders')
        .select('id, total_amount, payment_method, payment_status, status, created_at')
        .order('created_at', { ascending: false })
        .limit(10),

      // Recent 10 users (no passwords)
      supabase.from('users')
        .select('id, name, email, role, created_at')
        .order('created_at', { ascending: false })
        .limit(10),

      // Bookings grouped by status
      supabase.from('bookings')
        .select('status'),
    ]);

    // Compute status breakdown
    const statusBreakdown = { confirmed: 0, pending: 0, cancelled: 0, completed: 0 };
    (bookingsByStatus || []).forEach(b => {
      const s = b.status || 'pending';
      statusBreakdown[s] = (statusBreakdown[s] || 0) + 1;
    });

    // Revenue from paid orders
    const { data: paidOrders } = await supabase
      .from('orders')
      .select('total_amount')
      .eq('payment_status', 'paid');

    const totalRevenue = (paidOrders || []).reduce((sum, o) => sum + (o.total_amount || 0), 0);

    // Role breakdown
    const { data: userRoles } = await supabase.from('users').select('role');
    const roleBreakdown = { patient: 0, doctor: 0, coach: 0 };
    (userRoles || []).forEach(u => {
      const r = u.role || 'patient';
      roleBreakdown[r] = (roleBreakdown[r] || 0) + 1;
    });

    res.status(200).json({
      success: true,
      data: {
        stats: {
          totalUsers:    totalUsers    || 0,
          totalBookings: totalBookings || 0,
          totalOrders:   totalOrders   || 0,
          totalProducts: totalProducts || 0,
          totalRevenue:  totalRevenue,
        },
        roleBreakdown,
        statusBreakdown,
        recentBookings: recentBookings || [],
        recentOrders:   recentOrders   || [],
        recentUsers:    recentUsers    || [],
      },
    });
  } catch (err) {
    console.error('Admin dashboard error:', err);
    res.status(500).json({ success: false, message: err.message });
  }
};
