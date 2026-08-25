/**
 * Backup Script — Exports all MongoDB collections to an encrypted local JSON file.
 * 
 * Usage: npm run backup
 * 
 * Creates encrypted .enc backup files in server/backups/
 * Keeps last 30 backups, auto-rotates older ones.
 * Encryption uses AES-256-CBC with a key derived from JWT_SECRET.
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
const PaymentLog = require('./models/PaymentLog');

const BACKUPS_DIR = path.join(__dirname, 'backups');
const MAX_BACKUPS = 30;

// Derive encryption key from JWT_SECRET
function getEncryptionKey() {
  const secret = process.env.JWT_SECRET;
  if (!secret) {
    throw new Error('JWT_SECRET is required for backup encryption');
  }
  return crypto.scryptSync(secret, 'stock-mgmt-backup-salt', 32);
}

function encrypt(text) {
  const key = getEncryptionKey();
  const iv = crypto.randomBytes(16);
  const cipher = crypto.createCipheriv('aes-256-cbc', key, iv);
  let encrypted = cipher.update(text, 'utf8', 'hex');
  encrypted += cipher.final('hex');
  return iv.toString('hex') + ':' + encrypted;
}

function rotateOldBackups() {
  if (!fs.existsSync(BACKUPS_DIR)) return;

  const files = fs.readdirSync(BACKUPS_DIR)
    .filter(f => f.endsWith('.enc'))
    .map(f => ({
      name: f,
      path: path.join(BACKUPS_DIR, f),
      time: fs.statSync(path.join(BACKUPS_DIR, f)).mtime.getTime(),
    }))
    .sort((a, b) => b.time - a.time); // newest first

  if (files.length > MAX_BACKUPS) {
    const toDelete = files.slice(MAX_BACKUPS);
    toDelete.forEach(f => {
      fs.unlinkSync(f.path);
      console.log(`🗑️  Rotated old backup: ${f.name}`);
    });
  }
}

async function backup() {
  const startTime = Date.now();

  try {
    // Validate environment
    if (!process.env.MONGO_URI) {
      throw new Error('MONGO_URI is not set in .env');
    }

    console.log('🔄 Starting backup...');
    await mongoose.connect(process.env.MONGO_URI);
    console.log('✅ Connected to MongoDB');

    // Export all collections
    console.log('📦 Exporting collections...');
    const [contacts, products, transactions, users, paymentLogs] = await Promise.all([
      Contact.find({}).lean(),
      Product.find({}).lean(),
      Transaction.find({}).lean(),
      User.find({}).lean(),
      PaymentLog.find({}).lean(),
    ]);

    const backupData = {
      metadata: {
        version: '1.0',
        createdAt: new Date().toISOString(),
        hostname: require('os').hostname(),
        collections: {
          contacts: contacts.length,
          products: products.length,
          transactions: transactions.length,
          users: users.length,
          paymentLogs: paymentLogs.length,
        },
        totalDocuments: contacts.length + products.length + transactions.length + users.length + paymentLogs.length,
      },
      data: {
        contacts,
        products,
        transactions,
        users,
        paymentLogs,
      },
    };

    const jsonStr = JSON.stringify(backupData, null, 0);

    // Encrypt the backup
    console.log('🔐 Encrypting backup...');
    const encrypted = encrypt(jsonStr);

    // Ensure backups directory exists
    if (!fs.existsSync(BACKUPS_DIR)) {
      fs.mkdirSync(BACKUPS_DIR, { recursive: true });
    }

    // Write encrypted backup file
    const timestamp = new Date().toISOString().replace(/[:.]/g, '-').replace('T', '_').slice(0, 19);
    const filename = `backup_${timestamp}.enc`;
    const filepath = path.join(BACKUPS_DIR, filename);

    fs.writeFileSync(filepath, encrypted, 'utf8');

    const fileSizeKB = (fs.statSync(filepath).size / 1024).toFixed(1);
    const elapsed = ((Date.now() - startTime) / 1000).toFixed(1);

    console.log('');
    console.log('═══════════════════════════════════════════════');
    console.log('  ✅ BACKUP COMPLETED SUCCESSFULLY');
    console.log('═══════════════════════════════════════════════');
    console.log(`  📁 File:     ${filename}`);
    console.log(`  📂 Path:     ${filepath}`);
    console.log(`  💾 Size:     ${fileSizeKB} KB`);
    console.log(`  ⏱️  Time:     ${elapsed}s`);
    console.log(`  📊 Records:  ${backupData.metadata.totalDocuments} total`);
    console.log(`     ├ Contacts:     ${contacts.length}`);
    console.log(`     ├ Products:     ${products.length}`);
    console.log(`     ├ Transactions: ${transactions.length}`);
    console.log(`     └ Users:        ${users.length}`);
    console.log('═══════════════════════════════════════════════');
    console.log('');

    // Rotate old backups
    rotateOldBackups();

    await mongoose.disconnect();
    process.exit(0);
  } catch (err) {
    console.error('');
    console.error('❌ BACKUP FAILED:', err.message);
    console.error('');
    if (mongoose.connection.readyState === 1) {
      await mongoose.disconnect();
    }
    process.exit(1);
  }
}

// Export for use by auto-backup cron in index.js
module.exports = { backup: async function runBackup() {
  try {
    const Contact = require('./models/Contact');
    const Product = require('./models/Product');
    const Transaction = require('./models/Transaction');
    const User = require('./models/User');

    const [contacts, products, transactions, users] = await Promise.all([
      Contact.find({}).lean(),
      Product.find({}).lean(),
      Transaction.find({}).lean(),
      User.find({}).lean(),
    ]);

    const backupData = {
      metadata: {
        version: '1.0',
        createdAt: new Date().toISOString(),
        hostname: require('os').hostname(),
        collections: {
          contacts: contacts.length,
          products: products.length,
          transactions: transactions.length,
          users: users.length,
        },
        totalDocuments: contacts.length + products.length + transactions.length + users.length,
      },
      data: { contacts, products, transactions, users },
    };

    const jsonStr = JSON.stringify(backupData, null, 0);
    const encrypted = encrypt(jsonStr);

    if (!fs.existsSync(BACKUPS_DIR)) {
      fs.mkdirSync(BACKUPS_DIR, { recursive: true });
    }

    const timestamp = new Date().toISOString().replace(/[:.]/g, '-').replace('T', '_').slice(0, 19);
    const filename = `backup_${timestamp}.enc`;
    const filepath = path.join(BACKUPS_DIR, filename);

    fs.writeFileSync(filepath, encrypted, 'utf8');
    rotateOldBackups();

    return { success: true, filename, records: backupData.metadata.totalDocuments };
  } catch (err) {
    return { success: false, error: err.message };
  }
}};

// Run directly if called as script
if (require.main === module) {
  backup();
}
