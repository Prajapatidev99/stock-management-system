# Stock Management System (Multi-Tenant Full-Stack App)

An enterprise-grade, multi-tenant inventory, sales, purchases, contacts, and dues management web application built with **Next.js 14**, **Node.js / Express**, and **MongoDB Atlas**.

---

## 🌐 Live URLs & Links

* **Frontend Web Application (Vercel)**:  
  👉 [https://stock-management-system-six-lyart.vercel.app](https://stock-management-system-six-lyart.vercel.app)

* **Backend API (Render)**:  
  👉 [https://stock-management-system-pgc7.onrender.com](https://stock-management-system-pgc7.onrender.com)

* **GitHub Repository**:  
  👉 [https://github.com/Prajapatidev99/stock-management-system](https://github.com/Prajapatidev99/stock-management-system)

---

## ✨ Features

- **Multi-Tenancy (Strict Data Isolation)**: Every registered shop owner/user gets an isolated workspace. Users only see and manage their own products, contacts, sales, and analytics.
- **User Registration & Authentication**: Built-in `/register` and `/login` with JWT authentication and secure bcrypt password hashing.
- **Inventory Management**: Product stock tracking, profit margins, low stock alerts, and automated stock adjustments.
- **Sales & Purchases**: Real-time sales recording, customer returns (stock in), purchases (stock out), and auto-creation of missing products on demand.
- **Wholesaler & Retailer Contacts**: Detailed customer profiles, order breakdowns, gross/net amounts, and debt settlement logging.
- **Dues & Balance Tracking**: Track outstanding customer receivables and wholesaler payables with upfront and partial balance payment logging.
- **Automated Backup & Local Encryption**: Automated daily backups at midnight and CLI tool to export/restore AES-256 encrypted local backup files.

---

## 🔒 Data Backup & Local Copies

The system provides dual-layer data protection:

### 1. Automated Daily Backups
The backend server runs an automated background cron job every night at midnight (`0 0 * * *`) that exports all MongoDB collections (`products`, `contacts`, `transactions`, `users`, `paymentlogs`) to an **AES-256 encrypted file** in `server/backups/`. Up to 30 backups are retained automatically.

### 2. Manual Backup (CLI)
To manually generate a local encrypted backup copy of your database at any time:
```bash
# Navigate to the server folder or run from root
npm run backup
```
* **Storage Location**: `server/backups/backup_YYYY-MM-DD_HH-mm-ss.enc`
* **Encryption**: Uses AES-256-CBC with an encryption key derived from your `JWT_SECRET`.

### 3. Data Restore (CLI)
To restore a local encrypted backup to MongoDB:
```bash
npm run restore -- backup_2026-08-25_12-00-00.enc --confirm
```
*(Note: A pre-restore safety backup is created automatically before any restore operation).*

---

## 🛠️ Project Structure

```
stock-management-system/
├── client/                 # Next.js 14 Frontend Application
│   ├── src/
│   │   ├── app/            # App Router (Dashboard, Login, Register, Sales, Purchases, Contacts, Products, Dues)
│   │   ├── components/     # UI Components (Sidebar, TopNav, Modal, StatCard)
│   │   ├── context/        # Auth & Layout Context Providers
│   │   └── lib/            # Axios API Instance & PDF Invoice Generator
│   └── vercel.json         # Vercel Deployment Configuration
├── server/                 # Express Node.js Backend API
│   ├── models/             # Mongoose Schemas (User, Product, Contact, Transaction, PaymentLog)
│   ├── routes/             # Express API Routes (auth, products, contacts, transactions)
│   ├── middleware/         # JWT Protection & CORS Config
│   ├── backup.js           # AES-256 Database Backup Engine
│   ├── restore.js          # AES-256 Database Restore Engine
│   ├── migrate.js          # Multi-Tenant Data Migration Script
│   └── backups/            # Local Encrypted Backup Storage Directory (.enc)
├── package.json            # Root Scripts
└── README.md               # Documentation
```

---


## 📦 Deployment Instructions

1. **Backend (Render)**:
   - Connect GitHub repository `Prajapatidev99/stock-management-system`.
   - Set **Root Directory**: `server`
   - Build Command: `npm install`
   - Start Command: `npm start`
   - Set Environment Variables: `MONGO_URI`, `JWT_SECRET`, `CLIENT_URL`.

2. **Frontend (Vercel)**:
   - Import GitHub repository.
   - Set **Root Directory**: `client`
   - Framework Preset: `Next.js`
   

---

## 📄 License
ISC License
