// api/orders.js - Vercel Serverless API for Orders with Supabase

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
  res.setHeader('Content-Type', 'application/json');

  if (req.method !== 'GET' && req.method !== 'POST') {
    return res.status(405).json({ success: false, message: 'Method not allowed' });
  }

  try {
    const authHeader = req.headers.authorization;
    const userId = getUserIdFromToken(authHeader);

    if (!userId) {
      return res.status(401).json({ success: false, message: 'Not authorized - invalid token' });
    }

    if (req.method === 'GET') {
      const { data: orders, error } = await supabase
        .from('orders')
        .select('*')
        .eq('user_id', userId)
        .order('created_at', { ascending: false })
        .limit(50);

      if (error) {
        console.error('[orders] Query error:', error.message);
        return res.status(500).json({ success: false, message: 'Failed to fetch orders: ' + error.message });
      }

      return res.status(200).json({ success: true, count: orders?.length || 0, data: orders || [] });
    }

    if (req.method === 'POST') {
      const { items, paymentMethod, deliveryName, deliveryPhone, deliveryAddress } = req.body;

      if (!items || !Array.isArray(items) || items.length === 0) {
        return res.status(400).json({ success: false, message: 'Order must have at least one item' });
      }

      const totalAmount = items.reduce((sum, i) => sum + (i.price * (i.quantity || 1)), 0);

      const { data: order, error } = await supabase
        .from('orders')
        .insert({
          user_id: userId,
          items: items.map(item => ({
            product_name: item.productName || item.name,
            price: item.price,
            quantity: item.quantity || 1,
          })),
          total_amount: totalAmount,
          payment_method: paymentMethod || 'cash',
          payment_status: 'pending',
          delivery_name: deliveryName || null,
          delivery_phone: deliveryPhone || null,
          delivery_address: deliveryAddress || null,
          status: 'processing',
          created_at: new Date().toISOString(),
        })
        .select()
        .single();

      if (error) {
        console.error('[orders] Insert error:', error.message);
        return res.status(500).json({ success: false, message: error.message });
      }

      return res.status(201).json({ success: true, data: order });
    }
  } catch (err) {
    console.error('[orders] Error:', err.message);
    return res.status(500).json({ success: false, message: err.message });
  }
};
