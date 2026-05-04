// controllers/shopController.js
// Product listing + order placement with cash/visa payment support

const Product = require('../models/Product');
const Order   = require('../models/Order');

// ── PRODUCTS ───────────────────────────────────────────────────

// @route   GET /products
// @access  Public
const getProducts = async (req, res, next) => {
  try {
    const products = await Product.find({ inStock: true });

    // If DB is empty, seed with default products
    if (products.length === 0) {
      const defaults = [
        { name: 'Omega-3 Fish Oil',       description: 'High-purity EPA/DHA for heart and brain health.',             price: 24.99, icon: 'fa-capsules'          },
        { name: 'Multivitamin Elite',      description: '24 essential vitamins and minerals for daily support.',        price: 19.99, icon: 'fa-vial-circle-check'  },
        { name: 'Digital Pulse Ox',        description: 'Instant SpO2 and heart rate monitoring.',                     price: 35.00, icon: 'fa-stethoscope'        },
        { name: 'Smart Hydration Bottle',  description: 'Tracks water intake and syncs with your profile.',            price: 45.50, icon: 'fa-bottle-water'       },
        { name: 'Herbal Sleep Aid',        description: 'Melatonin-free natural relaxation formula.',                  price: 15.99, icon: 'fa-pills'              },
      ];
      const created = await Product.insertMany(defaults);
      return res.status(200).json({ success: true, count: created.length, data: created });
    }

    res.status(200).json({ success: true, count: products.length, data: products });
  } catch (err) {
    next(err);
  }
};

// ── ORDERS ─────────────────────────────────────────────────────

// @route   POST /orders
// @access  Private / Patient
const placeOrder = async (req, res, next) => {
  try {
    const {
      items,            // [{ productId, productName, price, quantity }]
      paymentMethod,    // 'cash' | 'visa'
      deliveryName,
      deliveryPhone,
      deliveryAddress,
      // Visa mock fields (just logged, not actually charged)
      cardName, cardNumber, cardExpiry, cardCVV,
    } = req.body;

    if (!items || !Array.isArray(items) || items.length === 0) {
      return res.status(400).json({ success: false, message: 'Order must have at least one item' });
    }
    if (!paymentMethod) {
      return res.status(400).json({ success: false, message: 'Payment method is required (cash or visa)' });
    }

    // Build order items
    const orderItems = items.map(item => ({
      product:     item.productId || undefined,
      productName: item.productName,
      price:       item.price,
      quantity:    item.quantity || 1,
    }));

    const totalAmount = orderItems.reduce((sum, i) => sum + i.price * i.quantity, 0);

    // Mock visa processing — in production this would hit a payment gateway
    let paymentStatus = 'pending';
    if (paymentMethod === 'visa') {
      // Validate card fields are present (mock)
      if (!cardName || !cardNumber || !cardExpiry || !cardCVV) {
        return res.status(400).json({ success: false, message: 'Card details required for visa payment' });
      }
      paymentStatus = 'paid'; // mock: always succeeds if fields are present
    }

    const order = await Order.create({
      patient: req.user._id,
      items:   orderItems,
      totalAmount,
      paymentMethod,
      paymentStatus,
      deliveryName,
      deliveryPhone,
      deliveryAddress,
    });

    res.status(201).json({ success: true, data: order });
  } catch (err) {
    next(err);
  }
};

// @route   GET /orders
// @access  Private / Patient
const getMyOrders = async (req, res, next) => {
  try {
    const orders = await Order.find({ patient: req.user._id }).sort({ createdAt: -1 });
    res.status(200).json({ success: true, count: orders.length, data: orders });
  } catch (err) {
    next(err);
  }
};

module.exports = { getProducts, placeOrder, getMyOrders };