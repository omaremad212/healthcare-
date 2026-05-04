// models/Product.js
// Supplement / health product listing

const mongoose = require('mongoose');

const ProductSchema = new mongoose.Schema(
  {
    name:        { type: String, required: true, trim: true },
    description: { type: String },
    price:       { type: Number, required: true },
    category:    { type: String, default: 'supplement' },
    icon:        { type: String, default: 'fa-capsules' }, // FontAwesome class
    inStock:     { type: Boolean, default: true },
  },
  { timestamps: true }
);

module.exports = mongoose.model('Product', ProductSchema);