/**
 * One-Time Migration Script:
 * Assigns any unassigned existing documents in MongoDB (products, contacts, transactions, paymentlogs)
 * to the primary Admin user so no orphaned records leak across multi-tenant accounts.
 *
 * Usage: node server/migrate.js
 */
require('dotenv').config();
const mongoose = require('mongoose');
const User = require('./models/User');
const Product = require('./models/Product');
const Contact = require('./models/Contact');
const Transaction = require('./models/Transaction');
const PaymentLog = require('./models/PaymentLog');

async function migrate() {
  try {
    await mongoose.connect(process.env.MONGO_URI);
    console.log('✅ Connected to MongoDB');

    // 1. Find primary user
    const primaryUser = await User.findOne({ email: process.env.ADMIN_EMAIL }) || await User.findOne().sort({ createdAt: 1 });

    if (!primaryUser) {
      console.log('⚠️ No users found in database. Nothing to migrate.');
      process.exit(0);
    }

    console.log(`📌 Migrating unassigned documents to user: ${primaryUser.email} (${primaryUser._id})`);

    const unassignedFilter = { $or: [{ user_id: { $exists: false } }, { user_id: null }] };

    const [pRes, cRes, tRes, lRes] = await Promise.all([
      Product.updateMany(unassignedFilter, { $set: { user_id: primaryUser._id } }),
      Contact.updateMany(unassignedFilter, { $set: { user_id: primaryUser._id } }),
      Transaction.updateMany(unassignedFilter, { $set: { user_id: primaryUser._id } }),
      PaymentLog.updateMany(unassignedFilter, { $set: { user_id: primaryUser._id } }),
    ]);

    console.log(`✅ Migration complete!`);
    console.log(`   - Products updated:     ${pRes.modifiedCount}`);
    console.log(`   - Contacts updated:     ${cRes.modifiedCount}`);
    console.log(`   - Transactions updated: ${tRes.modifiedCount}`);
    console.log(`   - Payment logs updated: ${lRes.modifiedCount}`);

    process.exit(0);
  } catch (err) {
    console.error('❌ Migration failed:', err.message);
    process.exit(1);
  }
}

migrate();
