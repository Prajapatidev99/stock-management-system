const mongoose = require('mongoose');

const productSchema = new mongoose.Schema(
  {
    name: {
      type: String,
      required: [true, 'Product name is required'],
      trim: true,
    },
    category: {
      type: String,
      trim: true,
      default: null,
    },
    stock: {
      type: Number,
      default: 0,
      min: [0, 'Stock cannot be negative'],
    },
    purchase_price: {
      type: Number,
      required: [true, 'Purchase price is required'],
      min: [0, 'Purchase price cannot be negative'],
    },
    selling_price: {
      type: Number,
      required: [true, 'Selling price is required'],
      min: [0, 'Selling price cannot be negative'],
    },
    isDeleted: {
      type: Boolean,
      default: false,
    },
    user_id: {
      type: mongoose.Schema.Types.ObjectId,
      ref: 'User',
      required: [true, 'User ID is required'],
    },
  },
  { timestamps: true }
);

// Virtual for profit margin
productSchema.virtual('profit_margin').get(function () {
  if (this.purchase_price === 0) return 0;
  return (((this.selling_price - this.purchase_price) / this.purchase_price) * 100).toFixed(2);
});

productSchema.index({ user_id: 1, name: 'text', category: 'text' });
productSchema.index({ user_id: 1, isDeleted: 1 });

module.exports = mongoose.model('Product', productSchema);
