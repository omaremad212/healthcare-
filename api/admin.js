// api/admin.js — Full admin API (role=admin required on all routes except /seed)
const jwt    = require('jsonwebtoken');
const bcrypt = require('bcryptjs');
const { supabase } = require('../lib/supabase');

function decodeToken(authHeader) {
  if (!authHeader?.startsWith('Bearer ')) return null;
  try {
    return jwt.verify(authHeader.split(' ')[1], process.env.JWT_SECRET || 'secret123');
  } catch { return null; }
}

function adminOnly(req, res) {
  const decoded = decodeToken(req.headers.authorization);
  if (!decoded) {
    res.status(401).json({ success: false, message: 'Not authorized' });
    return null;
  }
  if (decoded.role !== 'admin') {
    res.status(403).json({ success: false, message: 'Admin access required' });
    return null;
  }
  return decoded;
}

// ─── One-time admin seed ─────────────────────────────────────────────────────
async function handleSeed(req, res) {
  if (req.method !== 'POST') return res.status(405).json({ success: false, message: 'POST required' });

  const { data: existing } = await supabase.from('users').select('id').eq('username', 'admin').limit(1);
  if (existing && existing.length > 0)
    return res.status(200).json({ success: true, message: 'Admin already exists', alreadyExists: true });

  const hashed = await bcrypt.hash('admin123', 10);
  const { data, error } = await supabase.from('users').insert({
    name: 'Platform Admin',
    username: 'admin',
    email: 'admin@healthcare.local',
    password: hashed,
    role: 'admin',
    created_at: new Date().toISOString(),
  }).select('id, name, email, role').single();

  if (error) return res.status(500).json({ success: false, message: error.message });
  return res.status(201).json({ success: true, message: 'Admin created', data });
}

// ─── Stats / Overview ────────────────────────────────────────────────────────
async function handleStats(res) {
  const [
    { data: users },
    { data: bookings },
    { data: orders },
    { count: msgCount },
    { count: fbCount },
    { data: recentBookings },
    { data: recentUsers },
    { data: recentOrders },
  ] = await Promise.all([
    supabase.from('users').select('role'),
    supabase.from('bookings').select('booking_type, payment_status, fee, status, created_at'),
    supabase.from('orders').select('total_amount, payment_status, created_at'),
    supabase.from('messages').select('id', { count: 'exact', head: true }),
    supabase.from('feedback').select('id', { count: 'exact', head: true }),
    supabase.from('bookings').select('id, doctor_name, date, time_slot, status, booking_type, fee, created_at').order('created_at', { ascending: false }).limit(8),
    supabase.from('users').select('id, name, email, role, created_at').order('created_at', { ascending: false }).limit(8),
    supabase.from('orders').select('id, total_amount, payment_status, status, created_at').order('created_at', { ascending: false }).limit(8),
  ]);

  const roleBreakdown = { patient: 0, doctor: 0, coach: 0, admin: 0 };
  (users || []).forEach(u => { const r = u.role || 'patient'; roleBreakdown[r] = (roleBreakdown[r] || 0) + 1; });

  const statusBreakdown = { pending: 0, confirmed: 0, completed: 0, cancelled: 0 };
  (bookings || []).forEach(b => { const s = b.status || 'pending'; statusBreakdown[s] = (statusBreakdown[s] || 0) + 1; });

  const bookingRevenue = (bookings || []).filter(b => b.payment_status === 'paid').reduce((s, b) => s + (b.fee || 0), 0);
  const orderRevenue   = (orders   || []).filter(o => o.payment_status === 'paid').reduce((s, o) => s + (o.total_amount || 0), 0);

  const now = new Date();
  const months = Array.from({ length: 6 }, (_, i) => {
    const d = new Date(now.getFullYear(), now.getMonth() - (5 - i), 1);
    return { label: d.toLocaleDateString('en', { month: 'short', year: '2-digit' }), year: d.getFullYear(), month: d.getMonth() + 1, bookings: 0, orders: 0 };
  });
  (bookings || []).forEach(b => {
    const d = new Date(b.created_at);
    const slot = months.find(m => m.year === d.getFullYear() && m.month === d.getMonth() + 1);
    if (slot) slot.bookings++;
  });
  (orders || []).forEach(o => {
    const d = new Date(o.created_at);
    const slot = months.find(m => m.year === d.getFullYear() && m.month === d.getMonth() + 1);
    if (slot) slot.orders++;
  });

  return res.status(200).json({
    success: true,
    data: {
      totals: {
        users: (users || []).length,
        bookings: (bookings || []).length,
        emergencyBookings: (bookings || []).filter(b => b.booking_type === 'emergency').length,
        orders: (orders || []).length,
        messages: msgCount || 0,
        feedback: fbCount || 0,
        revenue: bookingRevenue + orderRevenue,
      },
      roleBreakdown, statusBreakdown, months,
      recentBookings: recentBookings || [],
      recentUsers:    recentUsers    || [],
      recentOrders:   recentOrders   || [],
    },
  });
}

// ─── Users ───────────────────────────────────────────────────────────────────
async function handleUsers(req, res) {
  if (req.method === 'GET') {
    const role   = req.query.role   || '';
    const search = req.query.search || '';
    let q = supabase.from('users')
      .select('id, name, username, email, role, age, gender, specialization, training_type, years_experience, regular_rate, emergency_rate, created_at, phone')
      .order('created_at', { ascending: false })
      .limit(300);
    if (role && role !== 'all') q = q.eq('role', role);
    if (search) q = q.or(`name.ilike.%${search}%,email.ilike.%${search}%,username.ilike.%${search}%`);

    const { data, error } = await q;
    if (error) return res.status(500).json({ success: false, message: error.message });

    const ids = (data || []).map(u => u.id);
    let bkCounts = {};
    if (ids.length) {
      const { data: bk } = await supabase.from('bookings').select('user_id').in('user_id', ids);
      (bk || []).forEach(b => { bkCounts[b.user_id] = (bkCounts[b.user_id] || 0) + 1; });
    }
    return res.status(200).json({ success: true, data: (data || []).map(u => ({ ...u, booking_count: bkCounts[u.id] || 0 })) });
  }

  if (req.method === 'PUT') {
    const { id, name, email, role } = req.body || {};
    if (!id) return res.status(400).json({ success: false, message: 'User id required' });
    const updates = {};
    if (name  !== undefined) updates.name  = name;
    if (email !== undefined) updates.email = email;
    if (role  !== undefined) updates.role  = role;
    const { error } = await supabase.from('users').update(updates).eq('id', id);
    if (error) return res.status(500).json({ success: false, message: error.message });
    return res.status(200).json({ success: true });
  }

  if (req.method === 'DELETE') {
    const id = req.query.id;
    if (!id) return res.status(400).json({ success: false, message: 'User id required' });
    const { error } = await supabase.from('users').delete().eq('id', id);
    if (error) return res.status(500).json({ success: false, message: error.message });
    return res.status(200).json({ success: true });
  }

  return res.status(405).json({ success: false, message: 'Method not allowed' });
}

// ─── Bookings ────────────────────────────────────────────────────────────────
async function handleBookings(req, res) {
  if (req.method === 'GET') {
    const status = req.query.status || '';
    const type   = req.query.type   || '';
    const search = req.query.search || '';

    let q = supabase.from('bookings').select('*').order('created_at', { ascending: false }).limit(500);
    if (status && status !== 'all') q = q.eq('status', status);
    if (type   && type   !== 'all') q = q.eq('booking_type', type);
    if (search) q = q.ilike('doctor_name', `%${search}%`);

    const { data, error } = await q;
    if (error) return res.status(500).json({ success: false, message: error.message });

    const userIds = [...new Set((data || []).map(b => b.user_id).filter(Boolean))];
    let userMap = {};
    if (userIds.length) {
      const { data: users } = await supabase.from('users').select('id, name, email').in('id', userIds);
      (users || []).forEach(u => { userMap[u.id] = { name: u.name, email: u.email }; });
    }

    return res.status(200).json({ success: true, data: (data || []).map(b => ({ ...b, patient: userMap[b.user_id] || null })) });
  }

  if (req.method === 'PUT') {
    const { id, status } = req.body || {};
    if (!id || !status) return res.status(400).json({ success: false, message: 'id and status required' });
    const { error } = await supabase.from('bookings').update({ status }).eq('id', id);
    if (error) return res.status(500).json({ success: false, message: error.message });
    return res.status(200).json({ success: true });
  }

  return res.status(405).json({ success: false, message: 'Method not allowed' });
}

// ─── Messages / Chats ────────────────────────────────────────────────────────
async function handleMessages(req, res) {
  if (req.method !== 'GET') return res.status(405).json({ success: false, message: 'Method not allowed' });

  const bookingId = req.query.booking_id;

  if (bookingId) {
    const { data, error } = await supabase.from('messages').select('*').eq('booking_id', bookingId).order('created_at', { ascending: true });
    if (error) return res.status(500).json({ success: false, message: error.message });
    return res.status(200).json({ success: true, data: data || [] });
  }

  const { data: bookings, error } = await supabase.from('bookings')
    .select('id, doctor_name, date, user_id')
    .order('created_at', { ascending: false })
    .limit(300);
  if (error) return res.status(500).json({ success: false, message: error.message });

  const ids = (bookings || []).map(b => b.id);
  let msgMeta = {};
  if (ids.length) {
    const { data: msgs } = await supabase.from('messages')
      .select('booking_id, body, created_at')
      .in('booking_id', ids)
      .order('created_at', { ascending: false });
    (msgs || []).forEach(m => {
      if (!msgMeta[m.booking_id]) msgMeta[m.booking_id] = { last: m.body, at: m.created_at, count: 0 };
      msgMeta[m.booking_id].count++;
    });
  }

  const userIds = [...new Set((bookings || []).map(b => b.user_id).filter(Boolean))];
  let userMap = {};
  if (userIds.length) {
    const { data: users } = await supabase.from('users').select('id, name').in('id', userIds);
    (users || []).forEach(u => { userMap[u.id] = u.name; });
  }

  return res.status(200).json({
    success: true,
    data: (bookings || [])
      .filter(b => msgMeta[b.id])
      .map(b => ({
        booking_id:      b.id,
        patient_name:    userMap[b.user_id] || 'Unknown',
        doctor_name:     b.doctor_name,
        date:            b.date,
        message_count:   msgMeta[b.id].count,
        last_message:    msgMeta[b.id].last,
        last_message_at: msgMeta[b.id].at,
      })),
  });
}

// ─── Plans ───────────────────────────────────────────────────────────────────
async function handlePlans(req, res) {
  if (req.method !== 'GET') return res.status(405).json({ success: false, message: 'Method not allowed' });

  const { data, error } = await supabase.from('plans')
    .select('*')
    .order('created_at', { ascending: false })
    .limit(300);

  if (error) {
    // plans table might not exist yet
    return res.status(200).json({ success: true, data: [], note: 'No plans table found' });
  }

  const userIds = [...new Set((data || []).map(p => p.user_id).filter(Boolean))];
  let userMap = {};
  if (userIds.length) {
    const { data: users } = await supabase.from('users').select('id, name').in('id', userIds);
    (users || []).forEach(u => { userMap[u.id] = u.name; });
  }

  return res.status(200).json({
    success: true,
    data: (data || []).map(p => ({ ...p, patient_name: userMap[p.user_id] || 'Unknown' })),
  });
}

// ─── Orders ──────────────────────────────────────────────────────────────────
async function handleOrders(req, res) {
  if (req.method === 'GET') {
    const { data, error } = await supabase.from('orders').select('*').order('created_at', { ascending: false }).limit(500);
    if (error) return res.status(500).json({ success: false, message: error.message });

    const userIds = [...new Set((data || []).map(o => o.user_id).filter(Boolean))];
    let userMap = {};
    if (userIds.length) {
      const { data: users } = await supabase.from('users').select('id, name, email').in('id', userIds);
      (users || []).forEach(u => { userMap[u.id] = { name: u.name, email: u.email }; });
    }

    return res.status(200).json({ success: true, data: (data || []).map(o => ({ ...o, user: userMap[o.user_id] || null })) });
  }

  if (req.method === 'PUT') {
    const { id, status } = req.body || {};
    if (!id) return res.status(400).json({ success: false, message: 'Order id required' });
    const { error } = await supabase.from('orders').update({ status }).eq('id', id);
    if (error) return res.status(500).json({ success: false, message: error.message });
    return res.status(200).json({ success: true });
  }

  return res.status(405).json({ success: false, message: 'Method not allowed' });
}

// ─── Feedback ────────────────────────────────────────────────────────────────
async function handleFeedback(req, res) {
  if (req.method === 'GET') {
    const minRating = req.query.min_rating ? parseInt(req.query.min_rating) : null;
    let q = supabase.from('feedback')
      .select('id, rating, review, anonymous, created_at, doctor_name, doctor_id, user_id, communication, professionalism, helpfulness')
      .order('created_at', { ascending: false })
      .limit(500);
    if (minRating) q = q.gte('rating', minRating);

    const { data, error } = await q;
    if (error) return res.status(500).json({ success: false, message: error.message });

    const userIds = [...new Set((data || []).map(f => f.user_id).filter(Boolean))];
    let userMap = {};
    if (userIds.length) {
      const { data: users } = await supabase.from('users').select('id, name').in('id', userIds);
      (users || []).forEach(u => { userMap[u.id] = u.name; });
    }

    return res.status(200).json({
      success: true,
      data: (data || []).map(f => ({
        ...f,
        reviewer_name: f.anonymous ? 'Anonymous' : (userMap[f.user_id] || 'Patient'),
      })),
    });
  }

  if (req.method === 'DELETE') {
    const id = req.query.id;
    if (!id) return res.status(400).json({ success: false, message: 'Feedback id required' });
    const { error } = await supabase.from('feedback').delete().eq('id', id);
    if (error) return res.status(500).json({ success: false, message: error.message });
    return res.status(200).json({ success: true });
  }

  return res.status(405).json({ success: false, message: 'Method not allowed' });
}

// ─── Products ────────────────────────────────────────────────────────────────
async function handleProducts(req, res) {
  if (req.method === 'GET') {
    const { data, error } = await supabase.from('products').select('*').order('created_at', { ascending: false });
    if (error) return res.status(500).json({ success: false, message: error.message });
    return res.status(200).json({ success: true, data: data || [] });
  }
  if (req.method === 'POST') {
    const { name, description, price, category, icon } = req.body || {};
    if (!name || !price) return res.status(400).json({ success: false, message: 'Name and price required' });
    const { data, error } = await supabase.from('products')
      .insert({ name, description, price: Number(price), category: category || 'supplement', icon: icon || 'fa-capsules', in_stock: true, created_at: new Date().toISOString() })
      .select().single();
    if (error) return res.status(500).json({ success: false, message: error.message });
    return res.status(201).json({ success: true, data });
  }
  if (req.method === 'PUT') {
    const { id, name, description, price, category, in_stock } = req.body || {};
    if (!id) return res.status(400).json({ success: false, message: 'Product id required' });
    const updates = {};
    if (name        !== undefined) updates.name        = name;
    if (description !== undefined) updates.description = description;
    if (price       !== undefined) updates.price       = Number(price);
    if (category    !== undefined) updates.category    = category;
    if (in_stock    !== undefined) updates.in_stock    = in_stock;
    const { error } = await supabase.from('products').update(updates).eq('id', id);
    if (error) return res.status(500).json({ success: false, message: error.message });
    return res.status(200).json({ success: true });
  }
  if (req.method === 'DELETE') {
    const id = req.query.id;
    if (!id) return res.status(400).json({ success: false, message: 'Product id required' });
    const { error } = await supabase.from('products').delete().eq('id', id);
    if (error) return res.status(500).json({ success: false, message: error.message });
    return res.status(200).json({ success: true });
  }
  return res.status(405).json({ success: false, message: 'Method not allowed' });
}

// ─── Professionals ───────────────────────────────────────────────────────────
async function handleProfessionals(req, res) {
  if (req.method === 'GET') {
    const { data, error } = await supabase.from('users')
      .select('id, name, email, role, specialization, training_type, years_experience, regular_rate, emergency_rate, clinic_address, bio, created_at')
      .in('role', ['doctor', 'coach'])
      .order('created_at', { ascending: false });
    if (error) return res.status(500).json({ success: false, message: error.message });

    const ids = (data || []).map(p => p.id);
    let bkMap = {}, rtMap = {};
    if (ids.length) {
      const { data: bk } = await supabase.from('bookings').select('doctor_id, fee, payment_status').in('doctor_id', ids);
      (bk || []).forEach(b => {
        if (!bkMap[b.doctor_id]) bkMap[b.doctor_id] = { count: 0, earnings: 0 };
        bkMap[b.doctor_id].count++;
        if (b.payment_status === 'paid') bkMap[b.doctor_id].earnings += (b.fee || 0);
      });
      const { data: fb } = await supabase.from('feedback').select('doctor_id, rating').in('doctor_id', ids);
      const rRaw = {};
      (fb || []).forEach(f => { if (!rRaw[f.doctor_id]) rRaw[f.doctor_id] = []; rRaw[f.doctor_id].push(f.rating); });
      Object.entries(rRaw).forEach(([id, arr]) => { rtMap[id] = arr.reduce((a, b) => a + b, 0) / arr.length; });
    }

    return res.status(200).json({
      success: true,
      data: (data || []).map(p => ({
        ...p,
        total_bookings: bkMap[p.id]?.count    || 0,
        total_earnings: bkMap[p.id]?.earnings || 0,
        avg_rating:     rtMap[p.id] ? Number(rtMap[p.id].toFixed(2)) : null,
      })),
    });
  }

  if (req.method === 'PUT') {
    const { id, role, specialization, regular_rate, emergency_rate, bio } = req.body || {};
    if (!id) return res.status(400).json({ success: false, message: 'id required' });
    const updates = {};
    if (role          !== undefined) updates.role          = role;
    if (specialization!== undefined) updates.specialization= specialization;
    if (regular_rate  !== undefined) updates.regular_rate  = regular_rate;
    if (emergency_rate!== undefined) updates.emergency_rate= emergency_rate;
    if (bio           !== undefined) updates.bio           = bio;
    const { error } = await supabase.from('users').update(updates).eq('id', id);
    if (error) return res.status(500).json({ success: false, message: error.message });
    return res.status(200).json({ success: true });
  }

  return res.status(405).json({ success: false, message: 'Method not allowed' });
}

// ─── Admin password change ───────────────────────────────────────────────────
async function handlePassword(req, res, admin) {
  if (req.method !== 'PUT') return res.status(405).json({ success: false, message: 'PUT required' });
  const { current_password, new_password } = req.body || {};
  if (!current_password || !new_password) return res.status(400).json({ success: false, message: 'Both passwords required' });
  if (String(new_password).length < 8) return res.status(400).json({ success: false, message: 'New password must be at least 8 characters' });

  const { data: user } = await supabase.from('users').select('password').eq('id', admin.id).single();
  if (!user) return res.status(404).json({ success: false, message: 'Admin user not found' });
  if (!await bcrypt.compare(current_password, user.password))
    return res.status(400).json({ success: false, message: 'Current password is incorrect' });

  const hashed = await bcrypt.hash(new_password, 10);
  const { error } = await supabase.from('users').update({ password: hashed }).eq('id', admin.id);
  if (error) return res.status(500).json({ success: false, message: error.message });
  return res.status(200).json({ success: true, message: 'Password changed successfully' });
}

// ─── Main handler ────────────────────────────────────────────────────────────
module.exports = async function handler(req, res) {
  res.setHeader('Content-Type', 'application/json');
  try {
    const section = req.query.section || 'stats';

    if (section === 'seed') return await handleSeed(req, res);

    const admin = adminOnly(req, res);
    if (!admin) return;

    if (section === 'stats')         return await handleStats(res);
    if (section === 'users')         return await handleUsers(req, res);
    if (section === 'bookings')      return await handleBookings(req, res);
    if (section === 'messages')      return await handleMessages(req, res);
    if (section === 'plans')         return await handlePlans(req, res);
    if (section === 'orders')        return await handleOrders(req, res);
    if (section === 'feedback')      return await handleFeedback(req, res);
    if (section === 'products')      return await handleProducts(req, res);
    if (section === 'professionals') return await handleProfessionals(req, res);
    if (section === 'password')      return await handlePassword(req, res, admin);

    return res.status(400).json({ success: false, message: 'Unknown section: ' + section });
  } catch (err) {
    console.error('[admin] Unhandled error:', err.message, '\n', err.stack);
    if (!res.headersSent) res.status(500).json({ success: false, message: err.message || 'Internal server error' });
  }
};
