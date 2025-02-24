const express = require('express');
const router = express.Router();
const Production = require('../models/ProductionLog');
const RawMaterial = require('../models/RawMaterial');

router.get('/summary/daily', async (req, res) => {
  try {
    const { date } = req.query;
    if (!date) return res.status(400).json({ error: 'Date is required' });
    const startDate = new Date(date);
    const endDate = new Date(date);
    endDate.setDate(endDate.getDate() + 1);
    const productions = await Production.find({ date: { $gte: startDate, $lt: endDate } })
      .populate('materialsUsed.materialId', 'name price');

    let shifts = {};
    productions.forEach(prod => {
      if (!shifts[prod.shift]) {
        shifts[prod.shift] = {
          name: prod.shift,
          cakesSold: prod.production ? prod.production.standardCakes || 0 : 0,
          breadSold: prod.production ? prod.production.bread || 0 : 0,
          totalCakeValue: prod.totalValue || 0,
          flourUsed: 0,
          workerWages: 0,
          lastUpdated: prod.lastUpdated,
          allWagesPaid: prod.wagesPaid
        };
      } else {
        if (prod.production) {
          shifts[prod.shift].cakesSold += prod.production.standardCakes || 0;
          shifts[prod.shift].breadSold += prod.production.bread || 0;
        }
        if (prod.totalValue) {
          shifts[prod.shift].totalCakeValue = (shifts[prod.shift].totalCakeValue || 0) + prod.totalValue;
        }
        if (new Date(prod.lastUpdated) > new Date(shifts[prod.shift].lastUpdated)) {
          shifts[prod.shift].lastUpdated = prod.lastUpdated;
        }
        if (!prod.wagesPaid) {
          shifts[prod.shift].allWagesPaid = false;
        }
      }
      const flour = prod.materialsUsed && prod.materialsUsed.find(m => m.materialId && m.materialId.name.toLowerCase() === 'flour');
      if (flour) {
        shifts[prod.shift].flourUsed += flour.quantity;
      }
    });

    Object.keys(shifts).forEach(shiftKey => {
      shifts[shiftKey].workerWages = shifts[shiftKey].allWagesPaid ? 0 : shifts[shiftKey].flourUsed * 500;
    });

    // Group raw material usage by material name across production logs
    let dailyUsage = {};
    productions.forEach(prod => {
      if(prod.materialsUsed){
        prod.materialsUsed.forEach(item => {
          if(item.materialId && item.materialId.name){
            const name = item.materialId.name;
            dailyUsage[name] = (dailyUsage[name] || 0) + item.quantity;
          }
        });
      }
    });

    // Fetch and group current raw material details by name
    const rawMaterials = await RawMaterial.find();
    let formattedMaterials = {};
    let totalStockCost = 0;
    rawMaterials.forEach(material => {
      if(!formattedMaterials[material.name]){
        formattedMaterials[material.name] = {
          priceEntries: [{ price: material.price, inStock: material.inStock }],
          used: dailyUsage[material.name] || 0,
          initialStock: material.inStock,
          remaining: material.inStock - (dailyUsage[material.name] || 0)
        };
      } else {
        formattedMaterials[material.name].priceEntries.push({ price: material.price, inStock: material.inStock });
        formattedMaterials[material.name].initialStock += material.inStock;
        formattedMaterials[material.name].used += dailyUsage[material.name] || 0;
        formattedMaterials[material.name].remaining = formattedMaterials[material.name].initialStock - formattedMaterials[material.name].used;
      }
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

router.post('/cakes', async (req, res) => {
  try {
    const { shift, production } = req.body;
    if (!shift || !production) return res.status(400).json({ error: 'Shift and production data are required' });
    const standardCakes = production.standardCakes || 0;
    const bread = production.bread || 0;
    const totalValue = standardCakes * 45 + bread * 55;
    const newProduction = new Production({
      shift,
      production,
      totalValue
    });
    await newProduction.save();
    res.status(201).json({ message: 'Cake production logged successfully', production: newProduction });
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
});

router.post('/materials', async (req, res) => {
  try {
    const { shift, rawMaterialsUsed } = req.body;
    if (!shift || !rawMaterialsUsed) {
      return res.status(400).json({ error: 'Shift and raw materials data are required' });
    }

    // This will accumulate the distributed usage per batch.
    const productionMaterialsUsed = [];

    // Process each raw material usage entry.
    for (let item of rawMaterialsUsed) {
      // Get the selected material by its id.
      const selectedMaterial = await RawMaterial.findById(item.materialId);
      if (!selectedMaterial) {
        return res.status(404).json({ error: `Material not found for id ${item.materialId}` });
      }
      const materialName = selectedMaterial.name;
      // Find all batches for this material name (assume they should be used in order of creation).
      let batches = await RawMaterial.find({ name: materialName }).sort({ createdAt: 1 });
      
      // Compute total available currentStock across all batches.
      const totalAvailable = batches.reduce((sum, batch) => sum + batch.currentStock, 0);
      if (item.quantity > totalAvailable) {
        return res.status(400).json({
          error: `Insufficient stock for ${materialName}. Total available: ${totalAvailable}, requested: ${item.quantity}`
        });
      }

      let usageToDistribute = item.quantity;
      const allocations = []; // To store allocated usage for each batch

      // First pass: allocate proportional amounts (using floor for each).
      let totalAllocated = 0;
      for (let batch of batches) {
        // Proportional allocation:
        const share = (batch.currentStock / totalAvailable) * item.quantity;
        const allocated = Math.floor(share);
        allocations.push({ batchId: batch._id, allocated, batchCurrent: batch.currentStock });
        totalAllocated += allocated;
      }
      let remainder = item.quantity - totalAllocated;
      // Second pass: Distribute the remainder one by one to batches that still have capacity.
      for (let alloc of allocations) {
        if (remainder <= 0) break;
        // The maximum additional allocation for this batch is its remaining capacity.
        const batch = batches.find(b => b._id.equals(alloc.batchId));
        const additionalCapacity = batch.currentStock - alloc.allocated;
        if (additionalCapacity > 0) {
          const extra = Math.min(additionalCapacity, remainder);
          alloc.allocated += extra;
          remainder -= extra;
        }
      }
      // At this point, remainder should be 0.
      // Now update each batch accordingly.
      for (let alloc of allocations) {
        // Update the batch: subtract the allocated quantity from currentStock
        const batch = await RawMaterial.findById(alloc.batchId);
        batch.currentStock -= alloc.allocated;
        // Record the usage in the dailyUsage array.
        batch.dailyUsage.push({ date: new Date(), quantity: alloc.allocated });
        await batch.save();
        // Add this allocation to the production record.
        productionMaterialsUsed.push({
          materialId: batch._id,
          quantity: alloc.allocated
        });
      }
    }

    // Log production record for raw materials usage.
    const newProduction = new Production({
      shift,
      materialsUsed: productionMaterialsUsed
    });
    await newProduction.save();
    res.status(201).json({ message: 'Raw materials usage logged successfully', production: newProduction });
  } catch (error) {
    res.status(500).json({ error: `Error logging raw materials usage: ${error.message}` });
  }
});


router.post('/pay-wages', async (req, res) => {
  try {
    const { shift, date } = req.body;
    if (!shift || !date) return res.status(400).json({ error: 'Shift and date are required' });
    const startDate = new Date(date);
    const endDate = new Date(date);
    endDate.setDate(endDate.getDate() + 1);
    await Production.updateMany(
      { shift, date: { $gte: startDate, $lt: endDate } },
      { $set: { wagesPaid: true } }
    );
    res.json({ message: 'Wages have been marked as paid for this shift' });
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
});

router.post('/cakes', async (req, res) => {
  try {
    const { shift, production } = req.body;
    const newProduction = new Production({
      shift,
      production
    });
    await newProduction.save();
    res.status(201).json({ message: 'Cakes production logged successfully', production: newProduction });
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
});

router.post('/materials', async (req, res) => {
  try {
    const { shift, rawMaterialsUsed } = req.body;
    const newProduction = new Production({
      shift,
      materialsUsed: rawMaterialsUsed
    });
    await newProduction.save();
    res.status(201).json({ message: 'Raw materials usage logged successfully', production: newProduction });
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
});

router.post('/daily-reset', async (req, res) => {
  try {
    // 1. Process wage payments
    const unpaidProductions = await Production.find({ wagesPaid: false });
    
    // 2. Update flour stock
    const flour = await RawMaterial.findOne({ name: 'Flour' });
    const dailyUsage = unpaidProductions.reduce((acc, prod) => {
      const flourUsed = prod.materialsUsed.find(m => m.materialId.toString() === flour._id.toString());
      return acc + (flourUsed?.quantity || 0);
    }, 0);
    
    // Update flour stock
    flour.currentStock -= dailyUsage;
    flour.dailyUsage.push({
      date: new Date(),
      quantity: dailyUsage
    });
    await flour.save();
    
    // 3. Mark all productions as wages paid
    await Production.updateMany(
      { wagesPaid: false },
      { $set: { wagesPaid: true } }
    );

    res.json({ message: 'Daily reset completed successfully' });
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
});

router.get('/summary/daily', async (req, res) => {
  try {
    const { date } = req.query;
    if (!date) return res.status(400).json({ error: 'Date is required' });

    const startDate = new Date(date);
    const endDate = new Date(date);
    endDate.setDate(endDate.getDate() + 1);

    const productions = await Production.find({ date: { $gte: startDate, $lt: endDate } })
      .populate('materialsUsed.materialId', 'name prices');

    let totalCakes = 0, totalBread = 0, totalCakeValue = 0;
    let rawMaterialUsage = {};
    let totalStockCost = 0;

    productions.forEach(prod => {
      totalCakes += prod.production?.standardCakes || 0;
      totalBread += prod.production?.bread || 0;
      totalCakeValue += prod.totalValue || 0;

      prod.materialsUsed.forEach(item => {
        const material = item.materialId;
        if (!rawMaterialUsage[material.name]) {
          rawMaterialUsage[material.name] = { quantity: 0, cost: 0 };
        }
        rawMaterialUsage[material.name].quantity += item.quantity;

        // Find the latest price
        const latestPrice = material.prices.sort((a, b) => new Date(b.date) - new Date(a.date))[0]?.price || 0;
        rawMaterialUsage[material.name].cost += item.quantity * latestPrice;
      });
    });

    Object.values(rawMaterialUsage).forEach(item => {
      totalStockCost += item.cost;
    });

    res.json({
      totalCakes,
      totalBread,
      totalCakeValue,
      rawMaterialUsage,
      totalStockCost,
      lastUpdated: new Date()
    });
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
});

router.get('/summary/range', async (req, res) => {
  try {
    const { startDate, endDate } = req.query;
    if (!startDate || !endDate) return res.status(400).json({ error: 'Start and end dates are required' });

    const productions = await Production.find({
      date: { $gte: new Date(startDate), $lte: new Date(endDate) }
    }).populate('materialsUsed.materialId', 'name prices');

    let totalCakes = 0, totalBread = 0, totalCakeValue = 0;
    let rawMaterialUsage = {};
    let totalStockCost = 0;

    productions.forEach(prod => {
      totalCakes += prod.production?.standardCakes || 0;
      totalBread += prod.production?.bread || 0;
      totalCakeValue += prod.totalValue || 0;

      prod.materialsUsed.forEach(item => {
        const material = item.materialId;
        if (!rawMaterialUsage[material.name]) {
          rawMaterialUsage[material.name] = { quantity: 0, cost: 0 };
        }
        rawMaterialUsage[material.name].quantity += item.quantity;

        // Find the latest price
        const latestPrice = material.prices.sort((a, b) => new Date(b.date) - new Date(a.date))[0]?.price || 0;
        rawMaterialUsage[material.name].cost += item.quantity * latestPrice;
      });
    });

    Object.values(rawMaterialUsage).forEach(item => {
      totalStockCost += item.cost;
    });

    res.json({
      totalCakes,
      totalBread,
      totalCakeValue,
      rawMaterialUsage,
      totalStockCost,
      lastUpdated: new Date()
    });
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
});



module.exports = router;
