const express = require('express');
const { body, query, validationResult } = require('express-validator');
const mongoose = require('mongoose');
const Transaction = require('../models/Transaction');
const Product = require('../models/Product');
const Contact = require('../models/Contact');
const PaymentLog = require('../models/PaymentLog');
const { protect } = require('../middleware/auth');

const router = express.Router();

router.use(protect);

// ─── Helper: validate ObjectId ──────────────────────────────────────────────────
const isValidId = (id) => mongoose.Types.ObjectId.isValid(id);

// Helper to escape regex special characters
function escapeRegex(text) {
  return text.replace(/[-[\]{}()*+?.,\\^$|#\s]/g, '\\$&');
}

// ─── Helper: Build user filter (superadmin sees all, admin sees own) ─────────────
function userFilter(user) {
  if (user.role === 'superadmin') return {};
  return { user_id: user._id };
}

// ─── POST /api/transactions/purchase ────────────────────────────────────────────
router.post(
  '/purchase',
  [
    body('quantity').isInt({ min: 1 }).withMessage('Quantity must be at least 1'),
    body('price').isFloat({ min: 0 }).withMessage('Price must be a positive number'),
    body('date').optional().isISO8601().withMessage('Invalid date format'),
    body('notes').optional({ nullable: true }).trim().isLength({ max: 500 }).withMessage('Notes cannot exceed 500 characters'),
  ],
  async (req, res) => {
    const session = await mongoose.startSession();
    session.startTransaction();

    try {
      const errors = validationResult(req);
      if (!errors.isEmpty()) {
        await session.abortTransaction();
        return res.status(400).json({ message: errors.array()[0].msg });
      }

      const {
        contact_id,
        wholesaler_name,
        contact_name,
        product_id,
        product_name,
        selling_price,
        category,
        quantity: reqQty,
        price: reqPrice,
        date,
        notes,
      } = req.body;

      const quantity = parseInt(reqQty, 10);
      const price = parseFloat(reqPrice);

      // 1. Resolve Wholesaler Contact
      let contactObj = null;

      if (contact_id && isValidId(contact_id)) {
        contactObj = await Contact.findOne({ _id: contact_id, user_id: req.user._id, isDeleted: false }).session(session);
      }

      const wName = (wholesaler_name || contact_name || '').trim();
      if (!contactObj && wName) {
        contactObj = await Contact.findOne({
          name: { $regex: new RegExp(`^${escapeRegex(wName)}$`, 'i') },
          user_id: req.user._id,
          isDeleted: false,
        }).session(session);

        if (!contactObj) {
          const [createdContact] = await Contact.create(
            [{ name: wName, type: 'wholesaler', user_id: req.user._id }],
            { session }
          );
          contactObj = createdContact;
        }
      }

      if (!contactObj) {
        await session.abortTransaction();
        return res.status(400).json({ message: 'Please select or type a wholesaler name' });
      }

      // 2. Resolve Product & Update / Add Stock
      let productObj = null;

      if (product_id && isValidId(product_id)) {
        productObj = await Product.findOne({ _id: product_id, user_id: req.user._id, isDeleted: false }).session(session);
      }

      const pName = (product_name || '').trim();
      if (!productObj && pName) {
        productObj = await Product.findOne({
          name: { $regex: new RegExp(`^${escapeRegex(pName)}$`, 'i') },
          user_id: req.user._id,
          isDeleted: false,
        }).session(session);
      }

      if (productObj) {
        // Existing product: increase stock and update prices
        const updateData = {
          $inc: { stock: quantity },
          purchase_price: price,
        };
        if (selling_price && parseFloat(selling_price) > 0) {
          updateData.selling_price = parseFloat(selling_price);
        }
        await Product.findByIdAndUpdate(productObj._id, updateData, { session });
      } else if (pName) {
        // New product: create directly during purchase with initial stock = quantity!
        const selPrice = selling_price && parseFloat(selling_price) > 0
          ? parseFloat(selling_price)
          : parseFloat((price * 1.25).toFixed(2));

        const [newProduct] = await Product.create(
          [
            {
              name: pName,
              category: category || null,
              stock: quantity,
              purchase_price: price,
              selling_price: selPrice,
              user_id: req.user._id,
            },
          ],
          { session }
        );
        productObj = newProduct;
      } else {
        await session.abortTransaction();
        return res.status(400).json({ message: 'Please select or type a product name' });
      }

      const total_amount = parseFloat((quantity * price).toFixed(2));

      // Calculate Payment Breakdown
      const payment_mode = ['cash', 'online', 'credit'].includes(req.body.payment_mode) ? req.body.payment_mode : 'cash';
      let amount_paid = req.body.amount_paid !== undefined && req.body.amount_paid !== '' ? parseFloat(req.body.amount_paid) : (payment_mode === 'credit' ? 0 : total_amount);
      if (isNaN(amount_paid) || amount_paid < 0) amount_paid = 0;
      if (amount_paid > total_amount) amount_paid = total_amount;

      const remaining_balance = parseFloat((total_amount - amount_paid).toFixed(2));
      let payment_status = 'paid';
      if (remaining_balance === total_amount) payment_status = 'unpaid';
      else if (remaining_balance > 0) payment_status = 'partial';

      // 3. Create Transaction Record
      const [transaction] = await Transaction.create(
        [
          {
            type: 'purchase',
            contact_id: contactObj._id,
            product_id: productObj._id,
            quantity,
            price,
            total_amount,
            payment_mode,
            amount_paid,
            remaining_balance,
            payment_status,
            date: date || new Date(),
            notes,
            user_id: req.user._id,
          },
        ],
        { session }
      );

      if (amount_paid > 0) {
        await PaymentLog.create(
          [
            {
              contact_id: contactObj._id,
              transaction_id: transaction._id,
              amount: amount_paid,
              payment_mode: ['cash', 'bank', 'online', 'cheque'].includes(payment_mode) ? payment_mode : 'cash',
              notes: notes ? `Upfront purchase payment: ${notes}` : `Upfront payment for purchase`,
              date: date || new Date(),
              user_id: req.user._id,
            },
          ],
          { session }
        );
      }

      await session.commitTransaction();

      const populated = await Transaction.findById(transaction._id)
        .populate('contact_id', 'name type')
        .populate('product_id', 'name category stock purchase_price selling_price');

      res.status(201).json(populated);
    } catch (err) {
      await session.abortTransaction();
      console.error('Purchase error:', err);
      res.status(500).json({ message: 'Failed to record purchase' });
    } finally {
      session.endSession();
    }
  }
);

// ─── POST /api/transactions/sale ─────────────────────────────────────────────────
router.post(
  '/sale',
  [
    body('quantity').isInt({ min: 1 }).withMessage('Quantity must be at least 1'),
    body('price').isFloat({ min: 0 }).withMessage('Price must be a positive number'),
    body('date').optional().isISO8601().withMessage('Invalid date format'),
    body('notes').optional({ nullable: true }).trim().isLength({ max: 500 }).withMessage('Notes cannot exceed 500 characters'),
  ],
  async (req, res) => {
    const session = await mongoose.startSession();
    session.startTransaction();

    try {
      const errors = validationResult(req);
      if (!errors.isEmpty()) {
        await session.abortTransaction();
        return res.status(400).json({ message: errors.array()[0].msg });
      }

      const {
        contact_id,
        retailer_name,
        contact_name,
        product_id,
        product_name,
        quantity: reqQty,
        price: reqPrice,
        date,
        notes,
      } = req.body;

      const quantity = parseInt(reqQty, 10);
      const price = parseFloat(reqPrice);

      // 1. Resolve Retailer Contact
      let contactObj = null;
      if (contact_id && isValidId(contact_id)) {
        contactObj = await Contact.findOne({ _id: contact_id, user_id: req.user._id, isDeleted: false }).session(session);
      }

      const rName = (retailer_name || contact_name || '').trim();
      if (!contactObj && rName) {
        contactObj = await Contact.findOne({
          name: { $regex: new RegExp(`^${escapeRegex(rName)}$`, 'i') },
          user_id: req.user._id,
          isDeleted: false,
        }).session(session);

        if (!contactObj) {
          const [createdContact] = await Contact.create(
            [{ name: rName, type: 'retailer', user_id: req.user._id }],
            { session }
          );
          contactObj = createdContact;
        }
      }

      if (!contactObj) {
        await session.abortTransaction();
        return res.status(400).json({ message: 'Please select or type a retailer/customer name' });
      }

      // 2. Resolve Product and check available stock
      let productObj = null;
      if (product_id && isValidId(product_id)) {
        productObj = await Product.findOne({ _id: product_id, user_id: req.user._id, isDeleted: false }).session(session);
      }

      const pName = (product_name || '').trim();
      if (!productObj && pName) {
        productObj = await Product.findOne({
          name: { $regex: new RegExp(`^${escapeRegex(pName)}$`, 'i') },
          user_id: req.user._id,
          isDeleted: false,
        }).session(session);
      }

      if (!productObj) {
        if (pName) {
          // Auto-create product on the fly during sale
          const purchasePrice = req.body.purchase_price && parseFloat(req.body.purchase_price) > 0
            ? parseFloat(req.body.purchase_price)
            : parseFloat((price * 0.8).toFixed(2));

          const [newProduct] = await Product.create(
            [
              {
                name: pName,
                category: req.body.category || null,
                stock: quantity, // Initialize with quantity so net stock becomes 0 after sale
                purchase_price: purchasePrice,
                selling_price: price,
                user_id: req.user._id,
              },
            ],
            { session }
          );
          productObj = newProduct;
        } else {
          await session.abortTransaction();
          return res.status(404).json({ message: 'Product not found. Please select or type a product name.' });
        }
      }

      if (productObj.stock < quantity) {
        // Auto-replenish stock to match sale quantity so sale is never blocked
        await Product.findByIdAndUpdate(
          productObj._id,
          { $set: { stock: quantity } },
          { session }
        );
        productObj.stock = quantity;
      }

      const total_amount = parseFloat((quantity * price).toFixed(2));

      // Calculate Payment Breakdown
      const payment_mode = ['cash', 'online', 'credit'].includes(req.body.payment_mode) ? req.body.payment_mode : 'cash';
      let amount_paid = req.body.amount_paid !== undefined && req.body.amount_paid !== '' ? parseFloat(req.body.amount_paid) : (payment_mode === 'credit' ? 0 : total_amount);
      if (isNaN(amount_paid) || amount_paid < 0) amount_paid = 0;
      if (amount_paid > total_amount) amount_paid = total_amount;

      const remaining_balance = parseFloat((total_amount - amount_paid).toFixed(2));
      let payment_status = 'paid';
      if (remaining_balance === total_amount) payment_status = 'unpaid';
      else if (remaining_balance > 0) payment_status = 'partial';

      // 3. Decrease Stock
      await Product.findByIdAndUpdate(
        productObj._id,
        { $inc: { stock: -quantity } },
        { session }
      );

      // 4. Create Sale Record
      const [transaction] = await Transaction.create(
        [
          {
            type: 'sale',
            contact_id: contactObj._id,
            product_id: productObj._id,
            quantity,
            price,
            total_amount,
            payment_mode,
            amount_paid,
            remaining_balance,
            payment_status,
            date: date || new Date(),
            notes,
            user_id: req.user._id,
          },
        ],
        { session }
      );

      if (amount_paid > 0) {
        await PaymentLog.create(
          [
            {
              contact_id: contactObj._id,
              transaction_id: transaction._id,
              amount: amount_paid,
              payment_mode: ['cash', 'bank', 'online', 'cheque'].includes(payment_mode) ? payment_mode : 'cash',
              notes: notes ? `Upfront sale payment: ${notes}` : `Upfront payment for sale`,
              date: date || new Date(),
              user_id: req.user._id,
            },
          ],
          { session }
        );
      }

      await session.commitTransaction();

      const populated = await Transaction.findById(transaction._id)
        .populate('contact_id', 'name type')
        .populate('product_id', 'name category stock purchase_price selling_price');

      res.status(201).json(populated);
    } catch (err) {
      await session.abortTransaction();
      console.error('Sale error:', err);
      res.status(500).json({ message: 'Failed to record sale' });
    } finally {
      session.endSession();
    }
  }
);

// ─── POST /api/transactions/purchase-return ──────────────────────────────────────
router.post('/purchase-return', async (req, res) => {
  const session = await mongoose.startSession();
  session.startTransaction();

  try {
    const { contact_id, product_id, quantity: reqQty, price: reqPrice, notes, date } = req.body;
    const quantity = parseInt(reqQty, 10);
    const price = parseFloat(reqPrice);

    if (!quantity || quantity < 1 || isNaN(price) || price < 0) {
      await session.abortTransaction();
      return res.status(400).json({ message: 'Invalid quantity or price for purchase return' });
    }

    const contact = await Contact.findOne({ _id: contact_id, user_id: req.user._id, isDeleted: false }).session(session);
    if (!contact) {
      await session.abortTransaction();
      return res.status(404).json({ message: 'Wholesaler contact not found' });
    }

    const product = await Product.findOne({ _id: product_id, user_id: req.user._id, isDeleted: false }).session(session);
    if (!product) {
      await session.abortTransaction();
      return res.status(404).json({ message: 'Product not found' });
    }

    if (product.stock < quantity) {
      await session.abortTransaction();
      return res.status(400).json({
        message: `Cannot return ${quantity} units. Current stock is only ${product.stock} units.`,
      });
    }

    const total_amount = parseFloat((quantity * price).toFixed(2));
    const payment_mode = ['cash', 'online', 'credit'].includes(req.body.payment_mode) ? req.body.payment_mode : 'cash';

    // Decrease stock for returned items
    await Product.findByIdAndUpdate(product._id, { $inc: { stock: -quantity } }, { session });

    // Deduct return amount from contact's existing unpaid transactions' remaining_balance
    let returnAmountLeft = total_amount;
    const unpaidTxs = await Transaction.find({
      contact_id: contact._id,
      user_id: req.user._id,
      type: 'purchase',
      remaining_balance: { $gt: 0 },
    }).sort({ date: 1 }).session(session);

    for (const tx of unpaidTxs) {
      if (returnAmountLeft <= 0) break;
      const deduct = Math.min(returnAmountLeft, tx.remaining_balance);
      tx.remaining_balance = parseFloat((tx.remaining_balance - deduct).toFixed(2));
      if (tx.remaining_balance === 0) tx.payment_status = 'paid';
      else tx.payment_status = 'partial';
      await tx.save({ session });
      returnAmountLeft -= deduct;
    }

    // Remaining balance for return record itself is 0 as it reduces overall contact debt
    const [transaction] = await Transaction.create(
      [
        {
          type: 'purchase_return',
          contact_id: contact._id,
          product_id: product._id,
          quantity,
          price,
          total_amount,
          payment_mode,
          amount_paid: total_amount,
          remaining_balance: 0,
          payment_status: 'paid',
          date: date || new Date(),
          notes: notes || 'Purchase Return to Wholesaler',
          user_id: req.user._id,
        },
      ],
      { session }
    );

    await session.commitTransaction();

    const populated = await Transaction.findById(transaction._id)
      .populate('contact_id', 'name type')
      .populate('product_id', 'name category stock');

    res.status(201).json(populated);
  } catch (err) {
    await session.abortTransaction();
    console.error('Purchase return error:', err);
    res.status(500).json({ message: 'Failed to record purchase return' });
  } finally {
    session.endSession();
  }
});

// ─── POST /api/transactions/sales-return ────────────────-------------------------
router.post('/sales-return', async (req, res) => {
  const session = await mongoose.startSession();
  session.startTransaction();

  try {
    const { contact_id, product_id, quantity: reqQty, price: reqPrice, notes, date } = req.body;
    const quantity = parseInt(reqQty, 10);
    const price = parseFloat(reqPrice);

    if (!quantity || quantity < 1 || isNaN(price) || price < 0) {
      await session.abortTransaction();
      return res.status(400).json({ message: 'Invalid quantity or price for sales return' });
    }

    const contact = await Contact.findOne({ _id: contact_id, user_id: req.user._id, isDeleted: false }).session(session);
    if (!contact) {
      await session.abortTransaction();
      return res.status(404).json({ message: 'Retailer contact not found' });
    }

    const product = await Product.findOne({ _id: product_id, user_id: req.user._id, isDeleted: false }).session(session);
    if (!product) {
      await session.abortTransaction();
      return res.status(404).json({ message: 'Product not found' });
    }

    const total_amount = parseFloat((quantity * price).toFixed(2));
    const payment_mode = ['cash', 'online', 'credit'].includes(req.body.payment_mode) ? req.body.payment_mode : 'cash';

    // Increase stock back for returned sales items
    await Product.findByIdAndUpdate(product._id, { $inc: { stock: quantity } }, { session });

    // Deduct return amount from customer's existing unpaid transactions' remaining_balance
    let returnAmountLeft = total_amount;
    const unpaidTxs = await Transaction.find({
      contact_id: contact._id,
      user_id: req.user._id,
      type: 'sale',
      remaining_balance: { $gt: 0 },
    }).sort({ date: 1 }).session(session);

    for (const tx of unpaidTxs) {
      if (returnAmountLeft <= 0) break;
      const deduct = Math.min(returnAmountLeft, tx.remaining_balance);
      tx.remaining_balance = parseFloat((tx.remaining_balance - deduct).toFixed(2));
      if (tx.remaining_balance === 0) tx.payment_status = 'paid';
      else tx.payment_status = 'partial';
      await tx.save({ session });
      returnAmountLeft -= deduct;
    }

    const [transaction] = await Transaction.create(
      [
        {
          type: 'sales_return',
          contact_id: contact._id,
          product_id: product._id,
          quantity,
          price,
          total_amount,
          payment_mode,
          amount_paid: total_amount,
          remaining_balance: 0,
          payment_status: 'paid',
          date: date || new Date(),
          notes: notes || 'Sales Return from Retailer/Customer',
          user_id: req.user._id,
        },
      ],
      { session }
    );

    await session.commitTransaction();

    const populated = await Transaction.findById(transaction._id)
      .populate('contact_id', 'name type')
      .populate('product_id', 'name category stock');

    res.status(201).json(populated);
  } catch (err) {
    await session.abortTransaction();
    console.error('Sales return error:', err);
    res.status(500).json({ message: 'Failed to record sales return' });
  } finally {
    session.endSession();
  }
});

// ─── GET /api/transactions ───────────────────────────────────────────────────────
router.get('/', async (req, res) => {
  try {
    const { type, contact_id, product_id, from, to, search, page = 1, limit = 50 } = req.query;

    const filter = { ...userFilter(req.user) };

    if (type && ['purchase', 'sale', 'purchase_return', 'sales_return'].includes(type)) {
      filter.type = type;
    }

    if (contact_id && isValidId(contact_id)) {
      filter.contact_id = contact_id;
    }

    if (product_id && isValidId(product_id)) {
      filter.product_id = product_id;
    }

    if (from || to) {
      filter.date = {};
      if (from) filter.date.$gte = new Date(from);
      if (to) {
        const toDate = new Date(to);
        toDate.setHours(23, 59, 59, 999);
        filter.date.$lte = toDate;
      }
    }

    const skip = (parseInt(page) - 1) * parseInt(limit);

    const [transactions, total] = await Promise.all([
      Transaction.find(filter)
        .populate('contact_id', 'name type')
        .populate('product_id', 'name category')
        .sort({ date: -1 })
        .skip(skip)
        .limit(parseInt(limit)),
      Transaction.countDocuments(filter),
    ]);

    res.json({
      transactions,
      total,
      page: parseInt(page),
      pages: Math.ceil(total / parseInt(limit)),
    });
  } catch (err) {
    console.error('Transaction fetch error:', err);
    res.status(500).json({ message: 'Failed to fetch transactions' });
  }
});

// ─── GET /api/transactions/summary ──────────────────────────────────────────────
router.get('/summary', async (req, res) => {
  try {
    const isSuperAdmin = req.user.role === 'superadmin';
    // For aggregation pipelines: superadmin matches all, admin matches by userId
    const userMatchStage = isSuperAdmin ? {} : { user_id: new mongoose.Types.ObjectId(req.user._id) };
    const productMatchStage = isSuperAdmin ? { isDeleted: false } : { user_id: new mongoose.Types.ObjectId(req.user._id), isDeleted: false };

    const [purchaseAgg, purchaseReturnAgg, saleAgg, salesReturnAgg, productStats, lowStockProducts] = await Promise.all([
      Transaction.aggregate([
        { $match: { ...userMatchStage, type: 'purchase' } },
        { $group: { _id: null, total: { $sum: '$total_amount' }, count: { $sum: 1 } } },
      ]),
      Transaction.aggregate([
        { $match: { ...userMatchStage, type: 'purchase_return' } },
        { $group: { _id: null, total: { $sum: '$total_amount' }, count: { $sum: 1 } } },
      ]),
      Transaction.aggregate([
        { $match: { ...userMatchStage, type: 'sale' } },
        { $group: { _id: null, total: { $sum: '$total_amount' }, count: { $sum: 1 } } },
      ]),
      Transaction.aggregate([
        { $match: { ...userMatchStage, type: 'sales_return' } },
        { $group: { _id: null, total: { $sum: '$total_amount' }, count: { $sum: 1 } } },
      ]),
      Product.aggregate([
        { $match: productMatchStage },
        {
          $group: {
            _id: null,
            totalProducts: { $sum: 1 },
            totalStock: { $sum: '$stock' },
          },
        },
      ]),
      Product.find({ ...productMatchStage, stock: { $lt: 10 } })
        .select('name category stock purchase_price selling_price')
        .sort({ stock: 1 }),
    ]);

    const grossPurchases = purchaseAgg[0]?.total || 0;
    const purchaseReturns = purchaseReturnAgg[0]?.total || 0;
    const totalPurchases = Math.max(0, grossPurchases - purchaseReturns);

    const grossSales = saleAgg[0]?.total || 0;
    const salesReturns = salesReturnAgg[0]?.total || 0;
    const totalSales = Math.max(0, grossSales - salesReturns);

    const profit = totalSales - totalPurchases;

    res.json({
      totalProducts: productStats[0]?.totalProducts || 0,
      totalStock: productStats[0]?.totalStock || 0,
      totalPurchases,
      totalSales,
      profit,
      purchaseCount: (purchaseAgg[0]?.count || 0) + (purchaseReturnAgg[0]?.count || 0),
      saleCount: (saleAgg[0]?.count || 0) + (salesReturnAgg[0]?.count || 0),
      lowStockProducts,
    });
  } catch (err) {
    console.error('Summary error:', err);
    res.status(500).json({ message: 'Failed to fetch summary' });
  }
});

// ─── GET /api/transactions/chart ─────────────────────────────────────────────────
router.get('/chart', async (req, res) => {
  try {
    const { months = 6 } = req.query;
    const fromDate = new Date();
    fromDate.setMonth(fromDate.getMonth() - parseInt(months));

    const userMatchStage = req.user.role === 'superadmin'
      ? { date: { $gte: fromDate } }
      : { user_id: new mongoose.Types.ObjectId(req.user._id), date: { $gte: fromDate } };
    const data = await Transaction.aggregate([
      { $match: userMatchStage },
      {
        $group: {
          _id: {
            year: { $year: '$date' },
            month: { $month: '$date' },
            type: '$type',
          },
          total: { $sum: '$total_amount' },
        },
      },
      { $sort: { '_id.year': 1, '_id.month': 1 } },
    ]);

    res.json(data);
  } catch (err) {
    res.status(500).json({ message: 'Failed to fetch chart data' });
  }
});

// ─── POST /api/transactions/pay-balance ──────────────────────────────────────────
router.post(
  '/pay-balance',
  [
    body('contact_id').notEmpty().withMessage('Contact is required'),
    body('amount').isFloat({ gt: 0 }).withMessage('Payment amount must be greater than 0'),
    body('payment_mode').optional().isIn(['cash', 'online', 'bank', 'cheque', 'other']).withMessage('Invalid payment mode'),
    body('notes').optional({ nullable: true }).trim().isLength({ max: 500 }).withMessage('Notes cannot exceed 500 characters'),
  ],
  async (req, res) => {
    const errors = validationResult(req);
    if (!errors.isEmpty()) {
      return res.status(400).json({ message: errors.array()[0].msg });
    }

    const session = await mongoose.startSession();
    session.startTransaction();

    try {
      const { contact_id, amount: reqAmt, payment_mode, notes } = req.body;
      let amountToPay = parseFloat(reqAmt);

    const contact = await Contact.findOne({ _id: contact_id, user_id: req.user._id, isDeleted: false }).session(session);
    if (!contact) {
      await session.abortTransaction();
      return res.status(404).json({ message: 'Contact not found' });
    }

    // Find unpaid or partially paid transactions for this contact (oldest first)
    const unpaidTxs = await Transaction.find({
      contact_id: contact._id,
      user_id: req.user._id,
      remaining_balance: { $gt: 0 },
    }).sort({ date: 1 }).session(session);

    let totalPaidNow = 0;
    const mode = ['cash', 'online'].includes(payment_mode) ? payment_mode : 'cash';

    for (const tx of unpaidTxs) {
      if (amountToPay <= 0) break;

      const paymentForTx = Math.min(amountToPay, tx.remaining_balance);
      tx.remaining_balance = parseFloat((tx.remaining_balance - paymentForTx).toFixed(2));
      tx.amount_paid = parseFloat((tx.amount_paid + paymentForTx).toFixed(2));
      tx.payment_mode = mode;
      tx.payment_status = tx.remaining_balance === 0 ? 'paid' : 'partial';
      if (notes) tx.notes = tx.notes ? `${tx.notes} | Paid ₹${paymentForTx}: ${notes}` : `Paid ₹${paymentForTx}: ${notes}`;

      await tx.save({ session });
      amountToPay -= paymentForTx;
      totalPaidNow += paymentForTx;
    }

    if (totalPaidNow > 0) {
      await PaymentLog.create(
        [
          {
            contact_id: contact._id,
            amount: totalPaidNow,
            payment_mode: mode,
            notes: notes ? `Balance payment: ${notes}` : 'Outstanding balance settlement',
            date: new Date(),
            user_id: req.user._id,
          },
        ],
        { session }
      );
    }

    await session.commitTransaction();

    res.json({
      message: `Successfully paid ₹${totalPaidNow.toFixed(2)} towards ${contact.name}'s outstanding balance!`,
      totalPaidNow,
      contact_id: contact._id,
    });
  } catch (err) {
    await session.abortTransaction();
    console.error('Pay balance error:', err);
    res.status(500).json({ message: 'Failed to record payment' });
  } finally {
    session.endSession();
  }
});

// ─── GET /api/transactions/dues ──────────────────────────────────────────────────
router.get('/dues', async (req, res) => {
  try {
    const unpaidTxs = await Transaction.find({ ...userFilter(req.user), remaining_balance: { $gt: 0 } })
      .populate('contact_id', 'name type phone address isDeleted')
      .populate('product_id', 'name');

    const contactMap = {};

    unpaidTxs.forEach((tx) => {
      if (!tx.contact_id || tx.contact_id.isDeleted) return;

      const cId = tx.contact_id._id.toString();
      if (!contactMap[cId]) {
        contactMap[cId] = {
          contact: tx.contact_id,
          totalDue: 0,
          transactionCount: 0,
          oldestDate: tx.date,
          transactions: [],
        };
      }

      contactMap[cId].totalDue += tx.remaining_balance || 0;
      contactMap[cId].transactionCount += 1;
      if (new Date(tx.date) < new Date(contactMap[cId].oldestDate)) {
        contactMap[cId].oldestDate = tx.date;
      }
      contactMap[cId].transactions.push({
        _id: tx._id,
        type: tx.type,
        total_amount: tx.total_amount,
        amount_paid: tx.amount_paid,
        remaining_balance: tx.remaining_balance,
        date: tx.date,
        productName: tx.product_id?.name || 'N/A',
      });
    });

    const wholesalers = [];
    const retailers = [];

    Object.values(contactMap).forEach((item) => {
      item.totalDue = parseFloat(item.totalDue.toFixed(2));
      if (item.contact.type === 'wholesaler') {
        wholesalers.push(item);
      } else {
        retailers.push(item);
      }
    });

    const totalPayable = wholesalers.reduce((sum, item) => sum + item.totalDue, 0);
    const totalReceivable = retailers.reduce((sum, item) => sum + item.totalDue, 0);

    res.json({
      totalPayable: parseFloat(totalPayable.toFixed(2)),
      totalReceivable: parseFloat(totalReceivable.toFixed(2)),
      wholesalers,
      retailers,
    });
  } catch (err) {
    console.error('Fetch dues error:', err);
    res.status(500).json({ message: 'Failed to fetch dues' });
  }
});

// ─── GET /api/transactions/payment-logs ──────────────────────────────────────────
router.get('/payment-logs', async (req, res) => {
  try {
    const { contact_id, limit = 50 } = req.query;
    const filter = { ...userFilter(req.user) };
    if (contact_id && isValidId(contact_id)) {
      filter.contact_id = contact_id;
    }

    const logs = await PaymentLog.find(filter)
      .populate('contact_id', 'name type')
      .populate('transaction_id', 'type total_amount')
      .sort({ date: -1 })
      .limit(parseInt(limit, 10));

    res.json(logs);
  } catch (err) {
    console.error('Payment logs error:', err);
    res.status(500).json({ message: 'Failed to fetch payment logs' });
  }
});

// ─── DELETE /api/transactions/:id (void/delete transaction) ─────────────────────
router.delete('/:id', async (req, res) => {
  if (!isValidId(req.params.id)) {
    return res.status(400).json({ message: 'Invalid transaction ID' });
  }

  const session = await mongoose.startSession();
  session.startTransaction();

  try {
    const txFilter = { _id: req.params.id, ...userFilter(req.user) };
    const tx = await Transaction.findOne(txFilter).session(session);
    if (!tx) {
      await session.abortTransaction();
      return res.status(404).json({ message: 'Transaction not found' });
    }

    const productFilter = req.user.role === 'superadmin'
      ? { _id: tx.product_id }
      : { _id: tx.product_id, user_id: req.user._id };
    const product = await Product.findOne(productFilter).session(session);

    if (product) {
      if (tx.type === 'purchase') {
        if (product.stock < tx.quantity) {
          await session.abortTransaction();
          return res.status(400).json({
            message: `Cannot void purchase: Current product stock (${product.stock}) is less than purchase quantity (${tx.quantity}).`,
          });
        }
        product.stock -= tx.quantity;
        await product.save({ session });
      } else if (tx.type === 'sale') {
        product.stock += tx.quantity;
        await product.save({ session });
      } else if (tx.type === 'purchase_return') {
        product.stock += tx.quantity;
        await product.save({ session });
      } else if (tx.type === 'sales_return') {
        if (product.stock < tx.quantity) {
          await session.abortTransaction();
          return res.status(400).json({
            message: `Cannot void sales return: Current product stock (${product.stock}) is less than return quantity (${tx.quantity}).`,
          });
        }
        product.stock -= tx.quantity;
        await product.save({ session });
      }
    }

    // Remove payment logs associated with this transaction
    await PaymentLog.deleteMany({ transaction_id: tx._id, user_id: req.user._id }, { session });

    // Delete transaction
    await Transaction.findByIdAndDelete(tx._id, { session });

    await session.commitTransaction();

    res.json({ message: 'Transaction voided and inventory reversed successfully!' });
  } catch (err) {
    await session.abortTransaction();
    console.error('Delete transaction error:', err);
    res.status(500).json({ message: 'Failed to delete transaction' });
  } finally {
    session.endSession();
  }
});

module.exports = router;
