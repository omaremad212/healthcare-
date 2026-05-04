// api/products.js - Vercel Serverless API

global.products = global.products || [
  { _id: 'p1', name: 'Omega-3 Fish Oil', description: 'High-purity EPA/DHA for heart and brain health.', price: 24.99, icon: 'fa-capsules', inStock: true, createdAt: new Date().toISOString() },
  { _id: 'p2', name: 'Multivitamin Elite', description: '24 essential vitamins and minerals for daily support.', price: 19.99, icon: 'fa-vial-circle-check', inStock: true, createdAt: new Date().toISOString() },
  { _id: 'p3', name: 'Digital Pulse Ox', description: 'Instant SpO2 and heart rate monitoring.', price: 35.00, icon: 'fa-stethoscope', inStock: true, createdAt: new Date().toISOString() },
  { _id: 'p4', name: 'Smart Hydration Bottle', description: 'Tracks water intake and syncs with your profile.', price: 45.50, icon: 'fa-bottle-water', inStock: true, createdAt: new Date().toISOString() },
  { _id: 'p5', name: 'Herbal Sleep Aid', description: 'Melatonin-free natural relaxation formula.', price: 15.99, icon: 'fa-pills', inStock: true, createdAt: new Date().toISOString() },
];

export default async function handler(req, res) {
  if (req.method !== 'GET' && req.method !== 'POST') {
    return res.status(405).json({ success: false, message: 'Method not allowed' });
  }

  try {
    if (req.method === 'GET') {
      const products = global.products.filter(p => p.inStock);
      res.status(200).json({ success: true, count: products.length, data: products });
    } else {
      // POST - create order
      const authHeader = req.headers.authorization;
      if (!authHeader || !authHeader.startsWith('Bearer ')) {
        return res.status(401).json({ success: false, message: 'Not authorized' });
      }

      const { items, paymentMethod, deliveryName, deliveryPhone, deliveryAddress, cardName, cardNumber, cardExpiry, cardCVV } = req.body;

      if (!items || !Array.isArray(items) || items.length === 0) {
        return res.status(400).json({ success: false, message: 'Order must have at least one item' });
      }

      const orderItems = items.map(item => ({
        productName: item.productName,
        price: item.price,
        quantity: item.quantity || 1,
      }));

      const totalAmount = orderItems.reduce((sum, i) => sum + i.price * i.quantity, 0);

      let paymentStatus = 'pending';
      if (paymentMethod === 'visa') {
        if (!cardName || !cardNumber || !cardExpiry || !cardCVV) {
          return res.status(400).json({ success: false, message: 'Card details required for visa payment' });
        }
        paymentStatus = 'paid';
      }

      const order = {
        _id: 'order_' + Date.now(),
        patient: 'patient_user',
        items: orderItems,
        totalAmount,
        paymentMethod: paymentMethod || 'cash',
        paymentStatus,
        deliveryName,
        deliveryPhone,
        deliveryAddress,
        status: 'processing',
        createdAt: new Date().toISOString(),
      };

      global.orders = global.orders || [];
      global.orders.push(order);

      res.status(201).json({ success: true, data: order });
    }
  } catch (err) {
    res.status(500).json({ success: false, message: err.message });
  }
}