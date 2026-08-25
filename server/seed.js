/**
 * Seed Script — Creates the single admin user.
 * Run once: npm run seed
 */
require('dotenv').config();
const mongoose = require('mongoose');
const bcrypt = require('bcryptjs');
const User = require('./models/User');

async function seed() {
  try {
    await mongoose.connect(process.env.MONGO_URI);
    console.log('✅ Connected to MongoDB');

    const existingUser = await User.findOne({ email: process.env.ADMIN_EMAIL });
    if (existingUser) {
      console.log(`ℹ️  Admin user already exists: ${process.env.ADMIN_EMAIL}`);
      process.exit(0);
    }

    const passwordHash = await bcrypt.hash(process.env.ADMIN_PASSWORD, 12);
    await User.create({
      name: 'Admin',
      email: process.env.ADMIN_EMAIL,
      passwordHash,
    });

    console.log('🌱 Admin user created successfully!');
    console.log(`   Email:    ${process.env.ADMIN_EMAIL}`);
    console.log(`   Password: ${process.env.ADMIN_PASSWORD}`);
    console.log('\n⚠️  Change the password after first login!');
    process.exit(0);
  } catch (err) {
    console.error('❌ Seed failed:', err.message);
    process.exit(1);
  }
}

seed();
