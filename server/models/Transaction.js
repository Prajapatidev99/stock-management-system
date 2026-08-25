const mongoose = require('mongoose');

const transactionSchema = new mongoose.Schema(
  {
    type: {
      type: String,
      enum: ['purchase', 'sale', 'purchase_return', 'sales_return'],
      required: [true, 'Transaction type is required'],
    },
    contact_id: {
      type: mongoose.Schema.Types.ObjectId,
      ref: 'Contact',
      required: [true, 'Contact is required'],
    },
    product_id: {
      type: mongoose.Schema.Types.ObjectId,
      ref: 'Product',
      required: [true, 'Product is required'],
    },
    quantity: {
      type: Number,
      required: [true, 'Quantity is required'],
      min: [1, 'Quantity must be at least 1'],
    },
    price: {
      type: Number,
      required: [true, 'Price is required'],
      min: [0, 'Price cannot be negative'],
    },
    total_amount: {
      type: Number,
      required: true,
    },
    payment_mode: {
      type: String,
      enum: ['cash', 'online', 'credit'],
      default: 'cash',
    },
    amount_paid: {
      type: Number,
      default: 0,
      min: [0, 'Amount paid cannot be negative'],
    },
    remaining_balance: {
      type: Number,
      default: 0,
    },
    payment_status: {
      type: String,
      enum: ['paid', 'partial', 'unpaid'],
      default: 'paid',
    },
    return_ref_id: {
      type: mongoose.Schema.Types.ObjectId,
      ref: 'Transaction',
      default: null,
    },
    date: {
      type: Date,
      default: Date.now,
    },
    notes: {
      type: String,
      trim: true,
      default: null,
    },
  },
  { timestamps: true }
);

// Indexes for filtering and sorting
transactionSchema.index({ type: 1, date: -1 });
transactionSchema.index({ contact_id: 1 });
transactionSchema.index({ product_id: 1 });
transactionSchema.index({ date: -1 });

module.exports = mongoose.model('Transaction', transactionSchema);
