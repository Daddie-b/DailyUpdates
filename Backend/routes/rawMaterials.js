// routes/rawMaterials.js
const express = require('express');
const router = express.Router();
const RawMaterial = require('../models/RawMaterial');

// GET all raw materials
router.get('/', async (req, res) => {
  try {
    const materials = await RawMaterial.find();
    res.json(materials);
  } catch (err) {
    res.status(500).json({ message: err.message });
  }
});

// POST a new raw material (admin only)
router.post('/', async (req, res) => {
  const { name, price, inStock, outOfStock, remaining } = req.body;
  const material = new RawMaterial({ name, price, inStock, outOfStock, remaining });
  try {
    const newMaterial = await material.save();
    res.status(201).json(newMaterial);
  } catch (err) {
    res.status(400).json({ message: err.message });
  }
});

// PUT update a raw material entry (if needed)
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
