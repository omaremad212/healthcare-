// api/orders.js - Vercel Serverless API for Orders with Supabase

const { supabase } = require('../../lib/supabase');

// Helper to get user ID from token
function getUserIdFromToken(authHeader) {
  if (!authHeader || !authHeader.startsWith('Bearer ')) return null;
  try {
    const jwt = require('jsonwebtoken');
    const decoded = jwt.verify(authHeader.split(' ')[1], process.env.JWT_SECRET || 'secret123');
    return decoded.id;
  } catch (e) {
    console.error('[orders] JWT decode error:', e.message);
    return null;
  }
}

export default async function handler(req, res) {
  res.setHeader('Content-Type', 'application/json');

  if (req.method !== 'GET' && req.method !== 'POST') {
    return res.status(405).json({ success: false, message: 'Method not allowed' });
  }

  try {
    const authHeader = req.headers.authorization;
    const userId = getUserIdFromToken(authHeader);
    
    console.log('[orders] Request:', req.method, 'userId:', userId);
    
    if (!userId) {
      return res.status(401).json({ success: false, message: 'Not authorized - invalid token' });
    }

    // GET - fetch user's orders
    if (req.method === 'GET') {
      console.log('[orders] GET /api/orders for user:', userId);
      
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
      
      console.log('[orders] Found', orders?.length || 0, 'orders');
      return res.status(200).json({ success: true, count: orders?.length || 0, data: orders || [] });
    }

    // POST - create new order
    if (req.method === 'POST') {
      console.log('[orders] POST /api/orders called');
      console.log('[orders] Body:', JSON.stringify(req.body, null, 2));
      
      const { items, paymentMethod, deliveryName, deliveryPhone, deliveryAddress } = req.body;

      if (!items || !Array.isArray(items) || items.length === 0) {
        return res.status(400).json({ success: false, message: 'Order must have at least one item' });
      }

      // Calculate totals
      const totalAmount = items.reduce((sum, i) => sum + (i.price * (i.quantity || 1)), 0);

      // Insert one order row per item (Supabase doesn't support JSON in orders table based on user requirements)
      // Map to required columns: user_id, product_id, quantity, total, created_at
      const insertPromises = items.map(async (item) => {
        // Validate product_id - if not valid UUID, store as null
        let productId = item.productId || null;
        if (productId) {
          // Check if it's a valid UUID format
          const uuidRegex = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
          if (!uuidRegex.test(productId)) {
            console.log('[orders] Invalid product_id, storing as null');
            productId = null;
          }
        }

        const orderPayload = {
          user_id: userId,
          product_id: productId,
          quantity: item.quantity || 1,
          total: item.price * (item.quantity || 1),
          created_at: new Date().toISOString()
        };

        console.log('[orders] Inserting:', JSON.stringify(orderPayload, null, 2));

        const { data: order, error } = await supabase
          .from('orders')
          .insert(orderPayload)
          .select()
          .single();

        if (error) {
          console.error('[orders] Insert error:', error.message);
          throw error;
        }

        return order;
      });

      const results = await Promise.all(insertPromises);
      console.log('[orders] Created', results.length, 'orders');

      return res.status(201).json({ success: true, data: results });
    }
  } catch (err) {
    console.error('[orders] Error:', err.message);
    return res.status(500).json({ success: false, message: err.message });
  }
}