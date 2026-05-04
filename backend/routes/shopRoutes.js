// routes/shopRoutes.js

const express = require('express');
const router  = express.Router();

const { getProducts, placeOrder, getMyOrders } = require('../controllers/shopController');
const { protect, authorize } = require('../middleware/auth');

// Products — public
router.get('/products', getProducts);

// Orders — patient only
router.post('/orders',   protect, authorize('patient'), placeOrder);
router.get('/orders',    protect, authorize('patient'), getMyOrders);

module.exports = router;