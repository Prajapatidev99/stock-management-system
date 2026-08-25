const express = require('express');
const { body, validationResult } = require('express-validator');
const Product = require('../models/Product');
const { protect } = require('../middleware/auth');

const router = express.Router();

// Helper to escape regex special characters
function escapeRegex(text) {
  return text.replace(/[-[\]{}()*+?.,\\^$|#\s]/g, '\\$&');
}

router.use(protect);

// ─── GET /api/products ──────────────────────────────────────────────────────────
router.get('/', async (req, res) => {
  try {
    const { search, category } = req.query;
    const filter = { isDeleted: false };

    if (search) {
      const safeSearch = escapeRegex(search);
      filter.$or = [
        { name: { $regex: safeSearch, $options: 'i' } },
        { category: { $regex: safeSearch, $options: 'i' } },
      ];
    }

    if (category) {
      filter.category = { $regex: escapeRegex(category), $options: 'i' };
    }

    const products = await Product.find(filter).sort({ createdAt: -1 });
    res.json(products);
  } catch (err) {
    res.status(500).json({ message: 'Failed to fetch products' });
  }
});

// ─── GET /api/products/:id ──────────────────────────────────────────────────────
router.get('/:id', async (req, res) => {
  try {
    const product = await Product.findOne({ _id: req.params.id, isDeleted: false });
    if (!product) return res.status(404).json({ message: 'Product not found' });
    res.json(product);
  } catch (err) {
    res.status(500).json({ message: 'Failed to fetch product' });
  }
});

// ─── POST /api/products ─────────────────────────────────────────────────────────
router.post(
  '/',
  [
    body('name').trim().notEmpty().withMessage('Product name is required'),
    body('purchase_price').isFloat({ min: 0 }).withMessage('Purchase price must be a positive number'),
    body('selling_price').isFloat({ min: 0 }).withMessage('Selling price must be a positive number'),
    body('stock').optional().isInt({ min: 0 }).withMessage('Stock must be a non-negative integer'),
    body('category').optional({ nullable: true }).trim(),
  ],
  async (req, res) => {
    try {
      const errors = validationResult(req);
      if (!errors.isEmpty()) {
        return res.status(400).json({ message: errors.array()[0].msg });
      }

      const { name, category, stock, purchase_price, selling_price } = req.body;
      const product = await Product.create({ name, category, stock: stock || 0, purchase_price, selling_price });
      res.status(201).json(product);
    } catch (err) {
      res.status(500).json({ message: 'Failed to create product' });
    }
  }
);

// ─── PUT /api/products/:id ──────────────────────────────────────────────────────
router.put(
  '/:id',
  [
    body('name').optional().trim().notEmpty().withMessage('Name cannot be empty'),
    body('purchase_price').optional().isFloat({ min: 0 }).withMessage('Purchase price must be positive'),
    body('selling_price').optional().isFloat({ min: 0 }).withMessage('Selling price must be positive'),
  ],
  async (req, res) => {
    try {
      const errors = validationResult(req);
      if (!errors.isEmpty()) {
        return res.status(400).json({ message: errors.array()[0].msg });
      }

      // Don't allow direct stock manipulation via this route (use transactions)
      const updateData = { ...req.body };
      delete updateData.stock;

      const product = await Product.findOneAndUpdate(
        { _id: req.params.id, isDeleted: false },
        { $set: updateData },
        { new: true, runValidators: true }
      );

      if (!product) return res.status(404).json({ message: 'Product not found' });
      res.json(product);
    } catch (err) {
      res.status(500).json({ message: 'Failed to update product' });
    }
  }
);

// ─── DELETE /api/products/:id (soft delete) ─────────────────────────────────────
router.delete('/:id', async (req, res) => {
  try {
    const product = await Product.findOneAndUpdate(
      { _id: req.params.id, isDeleted: false },
      { $set: { isDeleted: true } },
      { new: true }
    );

    if (!product) return res.status(404).json({ message: 'Product not found' });
    res.json({ message: 'Product deleted successfully' });
  } catch (err) {
    res.status(500).json({ message: 'Failed to delete product' });
  }
});

module.exports = router;
