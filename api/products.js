// api/products.js - Vercel Serverless API with Supabase

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

const defaultProducts = [
  { name: 'Omega-3 Fish Oil', description: 'High-purity EPA/DHA for heart and brain health.', price: 24.99, icon: 'fa-capsules', category: 'supplement', in_stock: true },
  { name: 'Multivitamin Elite', description: '24 essential vitamins and minerals for daily support.', price: 19.99, icon: 'fa-vial-circle-check', category: 'supplement', in_stock: true },
  { name: 'Digital Pulse Ox', description: 'Instant SpO2 and heart rate monitoring.', price: 35.00, icon: 'fa-stethoscope', category: 'device', in_stock: true },
  { name: 'Smart Hydration Bottle', description: 'Tracks water intake and syncs with your profile.', price: 45.50, icon: 'fa-bottle-water', category: 'device', in_stock: true },
  { name: 'Herbal Sleep Aid', description: 'Melatonin-free natural relaxation formula.', price: 15.99, icon: 'fa-pills', category: 'supplement', in_stock: true },
];

module.exports = async function handler(req, res) {
  if (req.method !== 'GET' && req.method !== 'POST' && req.method !== 'DELETE') {
    return res.status(405).json({ success: false, message: 'Method not allowed' });
  }

  try {
    if (req.method === 'GET') {
      const authHeader = req.headers.authorization;
      const userId = getUserIdFromToken(authHeader);
      const type = req.query.type || 'products';

      if (type === 'orders' && userId) {
        const { data: orders, error } = await supabase
          .from('orders')
          .select('*')
          .eq('user_id', userId)
          .order('created_at', { ascending: false })
          .limit(20);

        if (error) {
          return res.status(500).json({ success: false, message: 'Failed to fetch orders: ' + error.message });
        }

        return res.status(200).json({ success: true, count: orders?.length || 0, data: orders || [] });
      }

      let { data: products, error } = await supabase
        .from('products')
        .select('*')
        .eq('in_stock', true);

      if (error) {
        console.error('Supabase query error:', error);
      }

      if (!products || products.length === 0) {
        products = defaultProducts.map(p => ({ ...p, created_at: new Date().toISOString() }));
      }

      res.status(200).json({ success: true, count: products.length, data: products });
    } else if (req.method === 'DELETE') {
      const userId = getUserIdFromToken(req.headers.authorization);
      if (!userId) {
        return res.status(401).json({ success: false, message: 'Not authorized' });
      }
      const { id } = req.query;
      if (!id) {
        return res.status(400).json({ success: false, message: 'Product id is required' });
      }
      const { error } = await supabase.from('products').delete().eq('id', id);
      if (error) {
        return res.status(500).json({ success: false, message: error.message });
      }
      return res.status(200).json({ success: true });
    } else if (req.method === 'POST') {
      const authHeader = req.headers.authorization;
      const userId = getUserIdFromToken(authHeader);

      if (!userId) {
        return res.status(401).json({ success: false, message: 'Not authorized - invalid token' });
      }

      const body = req.body || {};

      // Distinguish "add product" from "place order" by the presence of items[].
      if (!body.items && body.name) {
        const name = String(body.name || '').trim();
        const description = String(body.description || '').trim();
        const priceNum = Number(body.price);
        const category = String(body.category || 'supplement').trim();
        const icon = String(body.icon || 'fa-capsules').trim();

        if (name.length < 2 || name.length > 100) {
          return res.status(400).json({ success: false, message: 'Name must be 2–100 characters' });
        }
        if (description.length > 500) {
          return res.status(400).json({ success: false, message: 'Description too long (max 500 chars)' });
        }
        if (!Number.isFinite(priceNum) || priceNum <= 0 || priceNum > 100000) {
          return res.status(400).json({ success: false, message: 'Price must be a positive number' });
        }

        const { data: product, error } = await supabase
          .from('products')
          .insert({
            name,
            description: description || null,
            price: priceNum,
            category,
            icon,
            in_stock: true,
            created_at: new Date().toISOString(),
          })
          .select()
          .single();

        if (error) {
          return res.status(500).json({ success: false, message: error.message });
        }
        return res.status(201).json({ success: true, data: product });
      }

      const { items, payment_method, delivery_name, delivery_phone, delivery_address, card_name, card_number, card_expiry, card_cvv } = body;

      if (!items || !Array.isArray(items) || items.length === 0) {
        return res.status(400).json({ success: false, message: 'Order must have at least one item' });
      }

      const totalAmount = items.reduce((sum, i) => sum + (i.price * (i.quantity || 1)), 0);

      let paymentStatus = 'pending';
      if (payment_method === 'visa') {
        if (!card_name || !card_number || !card_expiry || !card_cvv) {
          return res.status(400).json({ success: false, message: 'Card details required for visa payment' });
        }
        paymentStatus = 'paid';
      }

      const { data: order, error } = await supabase
        .from('orders')
        .insert({
          user_id: userId,
          items: items.map(item => ({
            product_name: item.productName,
            price: item.price,
            quantity: item.quantity || 1,
          })),
          total_amount: totalAmount,
          payment_method: payment_method || 'cash',
          payment_status: paymentStatus,
          delivery_name: delivery_name || null,
          delivery_phone: delivery_phone || null,
          delivery_address: delivery_address || null,
          status: 'processing',
          created_at: new Date().toISOString(),
        })
        .select()
        .single();

      if (error) {
        console.error('[products] Supabase insert error:', error.message);
        return res.status(500).json({
          success: false,
          message: error.message || 'Database insert failed',
          details: error.details || null,
          hint: error.hint || null,
        });
      }

      res.status(201).json({ success: true, data: order });
    }
  } catch (err) {
    console.error('Products error:', err);
    // For GET requests, return default products as fallback so the shop always works
    if (req.method === 'GET' && !req.query.type) {
      const fallback = defaultProducts.map(p => ({ ...p, created_at: new Date().toISOString() }));
      return res.status(200).json({ success: true, count: fallback.length, data: fallback });
    }
    res.status(500).json({ success: false, message: err.message });
  }
};
