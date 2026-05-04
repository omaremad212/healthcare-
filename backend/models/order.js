// models/Order.js
// Patient supplement / product orders

const mongoose = require('mongoose');

const OrderItemSchema = new mongoose.Schema({
  product:     { type: mongoose.Schema.Types.ObjectId, ref: 'Product' },
  productName: { type: String, required: true }, // snapshot name at purchase time
  price:       { type: Number, required: true },
  quantity:    { type: Number, required: true, default: 1 },
});

const OrderSchema = new mongoose.Schema(
  {
    patient: {
      type: mongoose.Schema.Types.ObjectId,
      ref: 'User',
      required: true,
    },

    items: [OrderItemSchema],

    totalAmount: { type: Number, required: true },

    paymentMethod: {
      type: String,
      enum: ['cash', 'visa'],
      required: true,
    },

    paymentStatus: {
      type: String,
      enum: ['pending', 'paid', 'failed'],
      default: 'pending',
    },

    // Delivery info
    deliveryName:    { type: String },
    deliveryPhone:   { type: String },
    deliveryAddress: { type: String },

    status: {
      type: String,
      enum: ['processing', 'shipped', 'delivered', 'cancelled'],
      default: 'processing',
    },
  },
  { timestamps: true }
);

module.exports = mongoose.model('Order', OrderSchema);