const mongoose = require('mongoose');

const RawMaterialSchema = new mongoose.Schema({
  name: String,
  prices: [{
    price: Number,
    date: { type: Date, default: Date.now }
  }],
  initialStock: Number, // Set by admin
  currentStock: Number, // Calculated field
  dailyUsage: [{
    date: Date,
    quantity: Number
  }],
  lastUpdated: { type: Date, default: Date.now }
});


module.exports = mongoose.model('RawMaterial', RawMaterialSchema);
