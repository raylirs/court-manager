# 🎾 Court Manager Pro (White-Label / Dedicated Instance)

Production-ready, multi-court reservation and facility management platform built with Node.js, Express, Sequelize (PostgreSQL/Supabase & SQLite), and Tailwind CSS styled with the minimalist **Forticlient Corporate Forest Green Design System**.

---

## 🌟 Key Features

1. **Customer-Facing Booking Portal**
   - Interactive date selector (7-day quick pills + calendar picker).
   - Multi-court visual cards with specs, surface types, and live pricing.
   - Real-time time-slot generator calculated from facility opening and closing hours.
   - Prevents double-booking and checks for maintenance blocks automatically.
   - Multi-slot selection with dynamic total price computation.
   - Checkout with official merchant GCash QR code, account details, reference number, and receipt screenshot upload.
   - Printable booking receipt with JetBrains Mono reference badge.
   - Booking reference & status lookup (`/lookup`).

2. **Admin Management Hub (`/admin`)**
   - **Operations Dashboard**: Real-time stats (Total bookings, revenue, active courts, pending verification).
   - **Court & Pricing Manager**: Add, edit, upload court photos, set hourly rates, and toggle court availability.
   - **Reservation Manager**: Search, filter, approve GCash payments, and cancel bookings.
   - **Court Block Scheduler**: Schedule tournament reservations, private coaching blocks, or surface maintenance for specific courts or the entire facility.
   - **Facility Hours**: Customize opening time, closing time, and slot duration (60, 90, 120 mins).
   - **GCash Payment Hub**: Upload official QR Code image and set merchant account name and mobile number with live customer preview.
   - **Meta Messenger Hub**: Connect Facebook App ID, Page ID, Page Access Token, and Admin PSIDs to receive instant push alerts on your personal Facebook profile, with a **Live Test Ping** button.
   - **Email & SMTP Hub**: Connect Gmail, Brevo, or custom SMTP to send automated booking receipts and admin alerts, with a **Live Test Email** button.

3. **Forticlient Minimalist Aesthetics**
   - Radial ambient background: `radial-gradient(circle at 50% 0%, #e2f0d9 0%, #f4f9f1 40%, #ffffff 100%)`.
   - Forest Green primary accents (`#166534`, `#287938`, `#1e5c2b`).
   - Clean, rounded white cards (`#ffffff`) with subtle slate borders (`#e2e8f0`).
   - Modern typography: `Inter` and `JetBrains Mono`.

---

## 🚀 Local Development Setup

1. **Clone / Open Workspace:**
   ```bash
   cd "C:\Users\29115629\Desktop\COURT MANAGER"
   ```

2. **Install Dependencies:**
   ```bash
   npm install
   ```

3. **Start the Application:**
   ```bash
   npm start
   ```

4. **Access the Application:**
   - Public Booking Portal: `http://localhost:3000`
   - Admin Console: `http://localhost:3000/admin`
   - Default Admin Credentials:
     - **Email:** `cpe4ryan@gmail.com`
     - **Password:** `admin123`

---

## 🌐 Deployment to GitHub, Render.com & Supabase

### 1. Push to GitHub
```bash
git init
git add .
git commit -m "Initial commit of Court Manager Pro"
git branch -M main
git remote add origin https://github.com/YOUR_USERNAME/court-manager.git
git push -u origin main
```

### 2. Create Database on Supabase
1. Go to [Supabase](https://supabase.com) and create a **New Project** (e.g. `court-manager-customer1`).
2. Go to **Project Settings** > **Database** > **Connection string** > **URI** (choose `Transaction Pooler` or `Direct connection`).
3. Copy the URI (format: `postgresql://postgres.[REF]:[PASSWORD]@aws-0-ap-southeast-1.pooler.supabase.com:6543/postgres?sslmode=require`).

### 3. Deploy on Render.com
1. Go to [Render Dashboard](https://dashboard.render.com).
2. Click **New +** > **Web Service**.
3. Connect your `court-manager` GitHub repository.
4. Set the following details:
   - **Name:** `court-manager-client1` (or your client's name)
   - **Environment:** `Node`
   - **Build Command:** `npm install`
   - **Start Command:** `npm start`
5. Under **Environment Variables**, add:
   - `DATABASE_URL` = (Your Supabase PostgreSQL Connection URI)
   - `NODE_ENV` = `production`
   - `SESSION_SECRET` = (A random string, e.g. `court_manager_prod_secret_84920`)
   - `ADMIN_EMAIL` = `cpe4ryan@gmail.com`
   - `ADMIN_PASSWORD` = `admin123`
6. Click **Deploy Web Service**! Render will build and deploy the app with automatic HTTPS.
