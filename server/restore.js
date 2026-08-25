/**
 * Restore Script — Decrypts and restores a backup file to MongoDB.
 * 
 * Usage: npm run restore -- <backup-filename> --confirm
 * 
 * Example: npm run restore -- backup_2026-08-24_12-00-00.enc --confirm
 * 
 * ⚠️  WARNING: This REPLACES all existing data in the database.
 * The --confirm flag is REQUIRED to prevent accidental data loss.
 * A pre-restore backup is created automatically before restoring.
 */
require('dotenv').config();
const mongoose = require('mongoose');
const crypto = require('crypto');
const fs = require('fs');
const path = require('path');

// Models
const Contact = require('./models/Contact');
const Product = require('./models/Product');
const Transaction = require('./models/Transaction');
const User = require('./models/User');

const BACKUPS_DIR = path.join(__dirname, 'backups');

// Derive encryption key from JWT_SECRET
function getEncryptionKey() {
  const secret = process.env.JWT_SECRET;
  if (!secret) {
    throw new Error('JWT_SECRET is required for backup decryption');
  }
  return crypto.scryptSync(secret, 'stock-mgmt-backup-salt', 32);
}

function decrypt(encryptedText) {
  const key = getEncryptionKey();
  const [ivHex, encrypted] = encryptedText.split(':');
  if (!ivHex || !encrypted) {
    throw new Error('Invalid backup file format');
  }
  const iv = Buffer.from(ivHex, 'hex');
  const decipher = crypto.createDecipheriv('aes-256-cbc', key, iv);
  let decrypted = decipher.update(encrypted, 'hex', 'utf8');
  decrypted += decipher.final('utf8');
  return decrypted;
}

async function restore() {
  const args = process.argv.slice(2);
  const backupFile = args.find(a => !a.startsWith('--'));
  const confirmed = args.includes('--confirm');

  // Validate arguments
  if (!backupFile) {
    console.error('');
    console.error('❌ Usage: npm run restore -- <backup-filename> --confirm');
    console.error('');
    console.error('Available backups:');
    if (fs.existsSync(BACKUPS_DIR)) {
      const files = fs.readdirSync(BACKUPS_DIR)
        .filter(f => f.endsWith('.enc'))
        .sort()
        .reverse();
      if (files.length === 0) {
        console.error('  (none found)');
      } else {
        files.forEach(f => {
          const stats = fs.statSync(path.join(BACKUPS_DIR, f));
          const sizeKB = (stats.size / 1024).toFixed(1);
          console.error(`  📁 ${f}  (${sizeKB} KB)`);
        });
      }
    } else {
      console.error('  (backups directory not found)');
    }
    console.error('');
    process.exit(1);
  }

  if (!confirmed) {
    console.error('');
    console.error('⚠️  WARNING: Restoring a backup will REPLACE ALL existing data in the database!');
    console.error('');
    console.error('To confirm, add the --confirm flag:');
    console.error(`  npm run restore -- ${backupFile} --confirm`);
    console.error('');
    process.exit(1);
  }

  // Resolve backup file path
  let filepath = backupFile;
  if (!path.isAbsolute(filepath)) {
    filepath = path.join(BACKUPS_DIR, filepath);
  }

  if (!fs.existsSync(filepath)) {
    console.error(`❌ Backup file not found: ${filepath}`);
    process.exit(1);
  }

  try {
    console.log('🔄 Starting restore...');
    console.log(`📁 Backup file: ${path.basename(filepath)}`);

    // Read and decrypt
    console.log('🔐 Decrypting backup...');
    const encryptedContent = fs.readFileSync(filepath, 'utf8');
    const jsonStr = decrypt(encryptedContent);
    const backupData = JSON.parse(jsonStr);

    // Validate backup structure
    if (!backupData.metadata || !backupData.data) {
      throw new Error('Invalid backup file structure');
    }

    console.log('');
    console.log('📊 Backup contents:');
    console.log(`   Created:      ${backupData.metadata.createdAt}`);
    console.log(`   Contacts:     ${backupData.data.contacts?.length || 0}`);
    console.log(`   Products:     ${backupData.data.products?.length || 0}`);
    console.log(`   Transactions: ${backupData.data.transactions?.length || 0}`);
    console.log(`   Users:        ${backupData.data.users?.length || 0}`);
    console.log('');

    // Connect to database
    await mongoose.connect(process.env.MONGO_URI);
    console.log('✅ Connected to MongoDB');

    // Create a pre-restore backup
    console.log('💾 Creating pre-restore safety backup...');
    const { backup: runBackup } = require('./backup');
    const preResult = await runBackup();
    if (preResult.success) {
      console.log(`   ✅ Safety backup saved: ${preResult.filename}`);
    } else {
      console.log(`   ⚠️  Safety backup failed: ${preResult.error} (continuing anyway)`);
    }

    // Use a session for atomic restore
    const session = await mongoose.startSession();
    session.startTransaction();

    try {
      console.log('🗄️  Clearing existing data...');

      await Promise.all([
        Contact.deleteMany({}, { session }),
        Product.deleteMany({}, { session }),
        Transaction.deleteMany({}, { session }),
        User.deleteMany({}, { session }),
      ]);

      console.log('📥 Inserting backup data...');

      const results = {};
      if (backupData.data.contacts?.length > 0) {
        await Contact.insertMany(backupData.data.contacts, { session });
        results.contacts = backupData.data.contacts.length;
      }
      if (backupData.data.products?.length > 0) {
        await Product.insertMany(backupData.data.products, { session });
        results.products = backupData.data.products.length;
      }
      if (backupData.data.transactions?.length > 0) {
        await Transaction.insertMany(backupData.data.transactions, { session });
        results.transactions = backupData.data.transactions.length;
      }
      if (backupData.data.users?.length > 0) {
        await User.insertMany(backupData.data.users, { session });
        results.users = backupData.data.users.length;
      }

      await session.commitTransaction();

      console.log('');
      console.log('═══════════════════════════════════════════════');
      console.log('  ✅ RESTORE COMPLETED SUCCESSFULLY');
      console.log('═══════════════════════════════════════════════');
      console.log(`  📊 Restored:`);
      console.log(`     ├ Contacts:     ${results.contacts || 0}`);
      console.log(`     ├ Products:     ${results.products || 0}`);
      console.log(`     ├ Transactions: ${results.transactions || 0}`);
      console.log(`     └ Users:        ${results.users || 0}`);
      console.log('═══════════════════════════════════════════════');
      console.log('');

    } catch (insertErr) {
      await session.abortTransaction();
      throw new Error(`Restore failed during data insertion: ${insertErr.message}`);
    } finally {
      session.endSession();
    }

    await mongoose.disconnect();
    process.exit(0);
  } catch (err) {
    console.error('');
    console.error('❌ RESTORE FAILED:', err.message);
    console.error('');
    console.error('Your existing data has NOT been modified.');
    console.error('');
    if (mongoose.connection.readyState === 1) {
      await mongoose.disconnect();
    }
    process.exit(1);
  }
}

restore();
