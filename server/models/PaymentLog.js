const mongoose = require('mongoose');

const paymentLogSchema = new mongoose.Schema(
  {
    contact_id: {
      type: mongoose.Schema.Types.ObjectId,
      ref: 'Contact',
      required: true,
    },
    transaction_id: {
      type: mongoose.Schema.Types.ObjectId,
      ref: 'Transaction',
      default: null,
    },
    amount: {
      type: Number,
      required: true,
      min: [0.01, 'Payment amount must be greater than 0'],
    },
    payment_mode: {
      type: String,
      enum: ['cash', 'bank', 'online', 'cheque', 'other'],
      default: 'cash',
    },
    notes: {
      type: String,
      trim: true,
      default: null,
    },
    date: {
      type: Date,
      default: Date.now,
    },
    user_id: {
      type: mongoose.Schema.Types.ObjectId,
      ref: 'User',
      required: true,
    },
  },
  { timestamps: true }
);

paymentLogSchema.index({ user_id: 1, contact_id: 1, date: -1 });

module.exports = mongoose.model('PaymentLog', paymentLogSchema);
