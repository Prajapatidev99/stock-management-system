require('dotenv').config();
const express = require('express');
const cors = require('cors');
const mongoose = require('mongoose');
const cookieParser = require('cookie-parser');
const helmet = require('helmet');
const rateLimit = require('express-rate-limit');
const cron = require('node-cron');

const authRoutes = require('./routes/auth');
const contactRoutes = require('./routes/contacts');
const productRoutes = require('./routes/products');
const transactionRoutes = require('./routes/transactions');

const app = express();

// ─── Validate Critical Environment Variables ──────────────────────────────────
const REQUIRED_ENV = ['MONGO_URI', 'JWT_SECRET'];
REQUIRED_ENV.forEach((key) => {
  if (!process.env[key]) {
    console.error(`❌ Missing required environment variable: ${key}`);
    process.exit(1);
  }
});

if (process.env.JWT_SECRET.length < 32) {
  console.warn('⚠️  JWT_SECRET is too short. Use at least 32 characters for security.');
}

// ─── Security Middleware ──────────────────────────────────────────────────────
// Helmet: sets various HTTP headers for security (XSS, MIME sniffing, clickjacking, etc.)
app.use(helmet());

// CORS: restrict to known client origin
const corsOptions = {
  origin: (origin, callback) => {
    // Allow requests with no origin (e.g. mobile apps, curl, Postman)
    if (!origin) return callback(null, true);

    const configuredClient = (process.env.CLIENT_URL || 'http://localhost:3000').trim();
    const formattedClient = configuredClient.startsWith('http') ? configuredClient : `https://${configuredClient}`;
    
    const cleanOrigin = origin.replace(/\/$/, '');
    const cleanClient = formattedClient.replace(/\/$/, '');

    // Allow exact configured origin or any Vercel deployment preview
    if (cleanOrigin === cleanClient || cleanOrigin.endsWith('.vercel.app') || process.env.NODE_ENV !== 'production') {
      return callback(null, cleanOrigin);
    }

    return callback(null, cleanClient);
  },
  credentials: true,
};

app.use(cors(corsOptions));

// Body parser with size limit to prevent payload attacks
app.use(express.json({ limit: '1mb' }));
app.use(cookieParser());

// Global rate limiter: 2000 requests per 15 minutes per IP
const globalLimiter = rateLimit({
  windowMs: 15 * 60 * 1000, // 15 minutes
  max: 2000,
  standardHeaders: true,
  legacyHeaders: false,
  message: { message: 'Too many requests. Please try again later.' },
});
app.use('/api', globalLimiter);

// ─── Routes ────────────────────────────────────────────────────────────────────
app.use('/api', authRoutes);
app.use('/api/contacts', contactRoutes);
app.use('/api/products', productRoutes);
app.use('/api/transactions', transactionRoutes);

// Health check (excluded from rate limiting above since it's after the limiter)
app.get('/health', (req, res) => res.json({ status: 'ok', timestamp: new Date() }));

// 404 handler
app.use((req, res) => {
  res.status(404).json({ message: 'Route not found' });
});

// Global error handler — never leak stack traces in production
app.use((err, req, res, next) => {
  console.error(err.stack);
  res.status(err.status || 500).json({
    message: process.env.NODE_ENV === 'production'
      ? 'Internal Server Error'
      : (err.message || 'Internal Server Error'),
  });
});

// ─── Database & Server ─────────────────────────────────────────────────────────
const PORT = process.env.PORT || 5000;

mongoose
  .connect(process.env.MONGO_URI, {
    serverSelectionTimeoutMS: 10000, // 10s timeout for initial connection
    socketTimeoutMS: 45000,         // 45s timeout for socket operations
  })
  .then(() => {
    console.log('✅ Connected to MongoDB');
    app.listen(PORT, () => {
      console.log(`🚀 Server running on http://localhost:${PORT}`);
    });

    // ─── Scheduled Daily Backup (midnight) ────────────────────────────────
    cron.schedule('0 0 * * *', async () => {
      console.log('⏰ Running scheduled daily backup...');
      try {
        const { backup } = require('./backup');
        const result = await backup();
        if (result.success) {
          console.log(`✅ Auto-backup completed: ${result.filename} (${result.records} records)`);
        } else {
          console.error(`❌ Auto-backup failed: ${result.error}`);
        }
      } catch (err) {
        console.error('❌ Auto-backup error:', err.message);
      }
    });
    console.log('📅 Daily auto-backup scheduled at midnight');
  })
  .catch((err) => {
    console.error('❌ MongoDB connection error:', err.message);
    process.exit(1);
  });
