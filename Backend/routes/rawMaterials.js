const express = require('express');
const router = express.Router();
const RawMaterial = require('../models/RawMaterial');

/**
 * GET /api/raw-materials
 * Return all raw material documents.
 * For each document, compute:
 *  - used = initialStock - currentStock
 *  - remaining = currentStock
 */
router.get('/', async (req, res) => {
  try {
    const materials = await RawMaterial.find();
    const updatedMaterials = materials.map(material => {
      // Calculate used and remaining based on stored values.
      const used = material.initialStock - material.currentStock;
      const remaining = material.currentStock;
      return {
        ...material.toObject(),
        used,
        remaining
      };
    });
    res.json(updatedMaterials);
  } catch (err) {
    res.status(500).json({ message: err.message });
  }
});

/**
 * POST /api/raw-materials
 * Create a new raw material entry or update an existing batch if any price matches.
 * Process:
 *   1. Parse the incoming values.
 *   2. Look for an existing document with the same name whose prices array contains an entry with the new price.
 *   3. If found, update that document by increasing its initialStock and currentStock.
 *   4. Otherwise, create a new document.
 */
router.post('/', async (req, res) => {
  const { name, price, inStock } = req.body;
  const parsedPrice = parseFloat(price);
  const parsedStock = parseInt(inStock);

  try {
    // Look for an existing record for this material name that has ANY price equal to parsedPrice.
    const existing = await RawMaterial.findOne({ 
      name, 
      "prices.price": parsedPrice 
    });

    if (existing) {
      // If found, update this document.
      existing.initialStock += parsedStock;
      existing.currentStock += parsedStock;
      existing.lastUpdated = new Date();
      // (Optionally, you could also update the date on the matching price entry, or leave it as is.)
      const updatedMaterial = await existing.save();
      return res.status(200).json(updatedMaterial);
    }
    
    // Otherwise, create a new document.
    const newMaterial = new RawMaterial({
      name,
      prices: [{ price: parsedPrice, date: new Date() }],
      initialStock: parsedStock,
      currentStock: parsedStock
    });
    const savedMaterial = await newMaterial.save();
    res.status(201).json(savedMaterial);
  } catch (err) {
    res.status(400).json({ message: err.message });
  }
});

/**
 * PUT /api/raw-materials/:id
 * Update a raw material entry.
 */
router.put('/:id', async (req, res) => {
  try {
    const updatedMaterial = await RawMaterial.findByIdAndUpdate(
      req.params.id,
      req.body,
      { new: true }
    );
    res.json(updatedMaterial);
  } catch (err) {
    res.status(400).json({ message: err.message });
  }
});

module.exports = router;
