const express = require('express');
const { body, query, validationResult } = require('express-validator');
const Contact = require('../models/Contact');
const Transaction = require('../models/Transaction');
const { protect } = require('../middleware/auth');

const router = express.Router();

// Helper to escape regex special characters
function escapeRegex(text) {
  return text.replace(/[-[\]{}()*+?.,\\^$|#\s]/g, '\\$&');
}

// All contact routes are protected
router.use(protect);

// ─── GET /api/contacts ──────────────────────────────────────────────────────────
router.get('/', async (req, res) => {
  try {
    const { type, search } = req.query;
    const filter = { isDeleted: false, user_id: req.user._id };

    if (type && ['wholesaler', 'retailer'].includes(type)) {
      filter.type = type;
    }

    if (search) {
      const safeSearch = escapeRegex(search);
      filter.$or = [
        { name: { $regex: safeSearch, $options: 'i' } },
        { phone: { $regex: safeSearch, $options: 'i' } },
      ];
    }

    const contacts = await Contact.find(filter).sort({ createdAt: -1 });
    res.json(contacts);
  } catch (err) {
    res.status(500).json({ message: 'Failed to fetch contacts' });
  }
});

// ─── POST /api/contacts ─────────────────────────────────────────────────────────
router.post(
  '/',
  [
    body('name').trim().notEmpty().withMessage('Name is required'),
    body('type').isIn(['wholesaler', 'retailer']).withMessage('Type must be wholesaler or retailer'),
    body('phone').optional({ nullable: true }).trim(),
    body('address').optional({ nullable: true }).trim(),
  ],
  async (req, res) => {
    try {
      const errors = validationResult(req);
      if (!errors.isEmpty()) {
        return res.status(400).json({ message: errors.array()[0].msg });
      }

      const { name, type, phone, address } = req.body;

      const contact = await Contact.create({
        name,
        type,
        phone,
        address,
        user_id: req.user._id,
      });
      res.status(201).json(contact);
    } catch (err) {
      res.status(500).json({ message: 'Failed to create contact' });
    }
  }
);

// ─── PUT /api/contacts/:id ──────────────────────────────────────────────────────
router.put(
  '/:id',
  [
    body('name').optional().trim().notEmpty().withMessage('Name cannot be empty'),
    body('type').optional().isIn(['wholesaler', 'retailer']).withMessage('Invalid type'),
  ],
  async (req, res) => {
    try {
      const errors = validationResult(req);
      if (!errors.isEmpty()) {
        return res.status(400).json({ message: errors.array()[0].msg });
      }

      const contact = await Contact.findOneAndUpdate(
        { _id: req.params.id, user_id: req.user._id, isDeleted: false },
        { $set: req.body },
        { new: true, runValidators: true }
      );

      if (!contact) {
        return res.status(404).json({ message: 'Contact not found' });
      }

      res.json(contact);
    } catch (err) {
      res.status(500).json({ message: 'Failed to update contact' });
    }
  }
);

// ─── GET /api/contacts/:id/profile ─────────────────────────────────────────────
router.get('/:id/profile', async (req, res) => {
  try {
    const contact = await Contact.findOne({ _id: req.params.id, user_id: req.user._id, isDeleted: false });
    if (!contact) {
      return res.status(404).json({ message: 'Contact not found' });
    }

    const transactions = await Transaction.find({ contact_id: contact._id, user_id: req.user._id })
      .populate('product_id', 'name category sku stock price purchase_price selling_price')
      .sort({ date: -1 });

    const grossAmount = transactions
      .filter(t => t.type === 'purchase' || t.type === 'sale')
      .reduce((acc, t) => acc + (t.total_amount || 0), 0);

    const returnAmount = transactions
      .filter(t => t.type === 'purchase_return' || t.type === 'sales_return')
      .reduce((acc, t) => acc + (t.total_amount || 0), 0);

    const netAmount = Math.max(0, grossAmount - returnAmount);

    const totalQuantity = transactions
      .filter(t => t.type === 'purchase' || t.type === 'sale')
      .reduce((acc, t) => acc + (t.quantity || 0), 0);

    const transactionCount = transactions.length;

    const cashPaid = transactions.reduce((acc, t) => acc + (t.payment_mode === 'cash' ? (t.amount_paid || 0) : 0), 0);
    const onlinePaid = transactions.reduce((acc, t) => acc + (t.payment_mode === 'online' ? (t.amount_paid || 0) : 0), 0);
    const totalPaid = transactions.reduce((acc, t) => acc + (t.amount_paid || 0), 0);
    
    // Remaining balance is total net amount minus total paid
    const remainingBalance = transactions.reduce((acc, t) => acc + (t.remaining_balance || 0), 0);
    const returnCount = transactions.filter(t => t.type === 'purchase_return' || t.type === 'sales_return').length;

    // Group products traded with this contact
    const productMap = {};
    transactions.forEach((t) => {
      const pId = t.product_id?._id?.toString() || 'unknown';
      const pName = t.product_id?.name || 'Unknown Product';
      const pCategory = t.product_id?.category || 'General';

      if (!productMap[pId]) {
        productMap[pId] = {
          _id: pId,
          name: pName,
          category: pCategory,
          totalQuantity: 0,
          totalAmount: 0,
          ordersCount: 0,
        };
      }
      if (t.type === 'purchase' || t.type === 'sale') {
        productMap[pId].totalQuantity += t.quantity || 0;
        productMap[pId].totalAmount += t.total_amount || 0;
      } else {
        productMap[pId].totalAmount -= t.total_amount || 0;
      }
      productMap[pId].ordersCount += 1;
    });

    const productsBreakdown = Object.values(productMap);

    res.json({
      contact,
      stats: {
        grossAmount,
        returnAmount,
        totalAmount: netAmount,
        totalQuantity,
        transactionCount,
        cashPaid,
        onlinePaid,
        totalPaid,
        remainingBalance,
        returnCount,
      },
      productsBreakdown,
      transactions,
    });
  } catch (err) {
    console.error('Contact profile error:', err);
    res.status(500).json({ message: 'Failed to fetch contact profile' });
  }
});

// ─── DELETE /api/contacts/:id (soft delete) ─────────────────────────────────────
router.delete('/:id', async (req, res) => {
  try {
    const contact = await Contact.findOne({ _id: req.params.id, user_id: req.user._id, isDeleted: false });
    if (!contact) {
      return res.status(404).json({ message: 'Contact not found' });
    }

    // Check for unpaid balance
    const unpaidTxs = await Transaction.find({
      contact_id: contact._id,
      user_id: req.user._id,
      remaining_balance: { $gt: 0 },
    });

    const unpaidBalance = unpaidTxs.reduce((sum, tx) => sum + (tx.remaining_balance || 0), 0);

    if (unpaidBalance > 0) {
      return res.status(400).json({
        message: `Cannot delete contact "${contact.name}". Outstanding balance of ₹${unpaidBalance.toFixed(2)} exists. Please settle the balance before deleting.`,
      });
    }

    contact.isDeleted = true;
    await contact.save();

    res.json({ message: 'Contact deleted successfully' });
  } catch (err) {
    res.status(500).json({ message: 'Failed to delete contact' });
  }
});

module.exports = router;
