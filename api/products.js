// api/products.js - Vercel Serverless API with Supabase

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

// Default products if database is empty
const defaultProducts = [
  { name: 'Omega-3 Fish Oil', description: 'High-purity EPA/DHA for heart and brain health.', price: 24.99, icon: 'fa-capsules', category: 'supplement', in_stock: true },
  { name: 'Multivitamin Elite', description: '24 essential vitamins and minerals for daily support.', price: 19.99, icon: 'fa-vial-circle-check', category: 'supplement', in_stock: true },
  { name: 'Digital Pulse Ox', description: 'Instant SpO2 and heart rate monitoring.', price: 35.00, icon: 'fa-stethoscope', category: 'device', in_stock: true },
  { name: 'Smart Hydration Bottle', description: 'Tracks water intake and syncs with your profile.', price: 45.50, icon: 'fa-bottle-water', category: 'device', in_stock: true },
  { name: 'Herbal Sleep Aid', description: 'Melatonin-free natural relaxation formula.', price: 15.99, icon: 'fa-pills', category: 'supplement', in_stock: true },
];

export default async function handler(req, res) {
  if (req.method !== 'GET' && req.method !== 'POST') {
    return res.status(405).json({ success: false, message: 'Method not allowed' });
  }

  try {
    if (req.method === 'GET') {
      // Fetch products from Supabase
      let { data: products, error } = await supabase
        .from('products')
        .select('*')
        .eq('in_stock', true);

      if (error) {
        console.error('Supabase query error:', error);
      }

      // If no products in DB, return defaults (for first-time setup)
      if (!products || products.length === 0) {
        // Optionally seed the database
        products = defaultProducts.map(p => ({ ...p, created_at: new Date().toISOString() }));
      }

      res.status(200).json({ success: true, count: products.length, data: products });
    } 
    else if (req.method === 'POST') {
      // Require auth for orders
      const authHeader = req.headers.authorization;
      const userId = getUserIdFromToken(authHeader);
      
      if (!userId) {
        return res.status(401).json({ success: false, message: 'Not authorized' });
      }

      const { items, payment_method, delivery_name, delivery_phone, delivery_address, card_name, card_number, card_expiry, card_cvv } = req.body;

      if (!items || !Array.isArray(items) || items.length === 0) {
        return res.status(400).json({ success: false, message: 'Order must have at least one item' });
      }

      // Calculate total
      const totalAmount = items.reduce((sum, i) => sum + (i.price * (i.quantity || 1)), 0);

      // Process payment (mock)
      let paymentStatus = 'pending';
      if (payment_method === 'visa') {
        if (!card_name || !card_number || !card_expiry || !card_cvv) {
          return res.status(400).json({ success: false, message: 'Card details required for visa payment' });
        }
        paymentStatus = 'paid';
      }

      // Insert order into Supabase
      const { data: order, error } = await supabase
        .from('orders')
        .insert({
          user_id: userId,
          items: items.map(item => ({
            product_name: item.productName,
            price: item.price,
            quantity: item.quantity || 1
          })),
          total_amount: totalAmount,
          payment_method: payment_method || 'cash',
          payment_status: paymentStatus,
          delivery_name: delivery_name || null,
          delivery_phone: delivery_phone || null,
          delivery_address: delivery_address || null,
          status: 'processing',
          created_at: new Date().toISOString()
        })
        .select()
        .single();

      if (error) {
        console.error('Supabase insert error:', error);
        return res.status(500).json({ success: false, message: 'Failed to create order: ' + error.message });
      }

      res.status(201).json({ success: true, data: order });
    }
  } catch (err) {
    console.error('Products error:', err);
    res.status(500).json({ success: false, message: err.message });
  }
}