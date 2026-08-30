/**
 * Seed Script — Creates the single admin user and optionally a superadmin.
 * Run once: npm run seed
 *
 * Required env vars:
 *   ADMIN_EMAIL, ADMIN_PASSWORD
 * Optional env vars (for developer superadmin):
 *   SUPERADMIN_EMAIL, SUPERADMIN_PASSWORD
 */
require('dotenv').config();
const mongoose = require('mongoose');
const bcrypt = require('bcryptjs');
const User = require('./models/User');

async function createUser({ name, email, password, role }) {
  const existing = await User.findOne({ email });
  if (existing) {
    // If the user exists but with wrong role, fix it
    if (existing.role !== role) {
      existing.role = role;
      await existing.save();
      console.log(`🔧 Updated role for ${email} → ${role}`);
    } else {
      console.log(`ℹ️  ${role} user already exists: ${email}`);
    }
    return;
  }

  const passwordHash = await bcrypt.hash(password, 12);
  await User.create({ name, email, passwordHash, role });
  console.log(`🌱 ${role} user created: ${email}`);
}

async function seed() {
  try {
    if (process.env.NODE_ENV === 'production' && process.env.FORCE_SEED !== 'true') {
      console.error('❌ Refusing to run seed in production mode without FORCE_SEED=true.');
      process.exit(1);
    }

    await mongoose.connect(process.env.MONGO_URI);
    console.log('✅ Connected to MongoDB');

    // ── Admin user ──────────────────────────────────────────────────────────
    if (!process.env.ADMIN_EMAIL || !process.env.ADMIN_PASSWORD) {
      console.error('❌ ADMIN_EMAIL and ADMIN_PASSWORD must be set in .env');
      process.exit(1);
    }

    await createUser({
      name: 'Admin',
      email: process.env.ADMIN_EMAIL,
      password: process.env.ADMIN_PASSWORD,
      role: 'admin',
    });

    // ── SuperAdmin user (developer) ─────────────────────────────────────────
    if (process.env.SUPERADMIN_EMAIL && process.env.SUPERADMIN_PASSWORD) {
      await createUser({
        name: 'SuperAdmin',
        email: process.env.SUPERADMIN_EMAIL,
        password: process.env.SUPERADMIN_PASSWORD,
        role: 'superadmin',
      });
    } else {
      console.log('ℹ️  No SUPERADMIN_EMAIL/SUPERADMIN_PASSWORD set — skipping superadmin creation.');
    }

    console.log('\n✅ Seed complete!');
    console.log('⚠️  Change passwords after first login!\n');
    process.exit(0);
  } catch (err) {
    console.error('❌ Seed failed:', err.message);
    process.exit(1);
  }
}

seed();
