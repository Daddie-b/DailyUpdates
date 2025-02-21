const mongoose = require('mongoose');

const RawMaterialSchema = new mongoose.Schema({
  name: String,
  price: Number,  // Price per unit
  inStock: Number, // Initial stock
  used: { type: Number, default: 0 },  // Amount used
  remaining: { type: Number, default: function () { return this.inStock - this.used; } },
  outOfStock: { type: Boolean, default: function () { return this.remaining <= 0; } }
});

module.exports = mongoose.model('RawMaterial', RawMaterialSchema);
