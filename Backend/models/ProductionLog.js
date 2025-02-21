const mongoose = require('mongoose');

const ProductionSchema = new mongoose.Schema({
  date: { type: Date, default: Date.now },
  shift: { type: String, required: true }, // Shift 1 or Shift 2
  production: {
    standardCakes: { type: Number, default: 0 },
    bread: { type: Number, default: 0 }
  },
  materialsUsed: [
    {
      materialId: { type: mongoose.Schema.Types.ObjectId, ref: 'RawMaterial' },
      quantity: Number
    }
  ]
});

module.exports = mongoose.model('Production', ProductionSchema);
