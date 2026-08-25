const mongoose = require('mongoose');

const contactSchema = new mongoose.Schema(
  {
    name: {
      type: String,
      required: [true, 'Contact name is required'],
      trim: true,
    },
    type: {
      type: String,
      enum: ['wholesaler', 'retailer'],
      required: [true, 'Contact type is required'],
    },
    phone: {
      type: String,
      trim: true,
      default: null,
    },
    address: {
      type: String,
      trim: true,
      default: null,
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

// Indexes for efficient querying
contactSchema.index({ user_id: 1, type: 1, isDeleted: 1 });
contactSchema.index({ user_id: 1, name: 'text' });

module.exports = mongoose.model('Contact', contactSchema);
