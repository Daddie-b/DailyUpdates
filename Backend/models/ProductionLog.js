const mongoose = require('mongoose');

const ProductionSchema = new mongoose.Schema({
  date: { type: Date, default: Date.now },
  lastUpdated: { type: Date, default: Date.now },
  shift: { type: String, required: true },
  production: {
    standardCakes: { type: Number, default: 0 },
    bread: { type: Number, default: 0 }
  },
  totalValue: { type: Number, default: 0 },
  materialsUsed: [
    {
      materialId: { type: mongoose.Schema.Types.ObjectId, ref: 'RawMaterial' },
      quantity: Number
    }
  ],
  wagesPaid: { type: Boolean, default: false }
});

// Update lastUpdated before saving
ProductionSchema.pre('save', function(next) {
  this.lastUpdated = new Date();
  next();
});

module.exports = mongoose.model('Production', ProductionSchema);
