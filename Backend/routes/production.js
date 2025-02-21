const express = require('express');
const router = express.Router();
const Production = require('../models/ProductionLog');
const RawMaterial = require('../models/RawMaterial');

router.get('/summary/daily', async (req, res) => {
  try {
    const { date } = req.query;
    if (!date) return res.status(400).json({ error: 'Date is required' });

    // Convert the date string to a range for the entire day
    const startDate = new Date(date);
    const endDate = new Date(date);
    endDate.setDate(endDate.getDate() + 1);

    // Fetch production logs within that day
    const productions = await Production.find({
      date: { $gte: startDate, $lt: endDate }
    }).populate('materialsUsed.materialId', 'name price');

    // Instead of returning a 404 if no data is found, return an empty summary.
    if (!productions.length) {
      return res.json({
        shifts: [],
        rawMaterials: {},
        totalStockCost: 0,
        lastUpdated: new Date()
      });
    }

    let shifts = {};
    let totalFlourUsed = 0;

    productions.forEach((prod) => {
      if (!shifts[prod.shift]) {
        shifts[prod.shift] = {
          name: prod.shift,
          cakesSold: prod.production.standardCakes,
          breadSold: prod.production.bread,
          flourUsed: 0,
          workerWages: 0
        };
      }
      const flour = prod.materialsUsed.find(m => m.materialId.name.toLowerCase() === 'flour');
      if (flour) {
        shifts[prod.shift].flourUsed += flour.quantity;
        totalFlourUsed += flour.quantity;
      }
    });

    // Calculate wages for each shift
    Object.keys(shifts).forEach(shiftKey => {
      shifts[shiftKey].workerWages = shifts[shiftKey].flourUsed * 500; // ₵500 per flour bag
    });

    // Fetch raw materials & calculate total cost (price * remaining)
    const rawMaterials = await RawMaterial.find();
    let formattedMaterials = {};
    let totalStockCost = 0;

    rawMaterials.forEach(material => {
      formattedMaterials[material.name] = {
        price: material.price,
        used: material.used,
        remaining: material.remaining
      };
      totalStockCost += material.price * material.inStock;
    });

    res.json({
      shifts: Object.values(shifts),
      rawMaterials: formattedMaterials,
      totalStockCost,
      lastUpdated: new Date()
    });

  } catch (error) {
    res.status(500).json({ error: error.message });
  }
});



router.post('/', async (req, res) => {
  try {
      const { shift, production, rawMaterialsUsed } = req.body;

      // Create a new production log entry
      const newProduction = new Production({
          shift,
          production,
          materialsUsed: rawMaterialsUsed
      });

      await newProduction.save();
      res.status(201).json({ message: 'Production logged successfully', production: newProduction });
  } catch (error) {
      res.status(500).json({ error: error.message });
  }
});



module.exports = router;
