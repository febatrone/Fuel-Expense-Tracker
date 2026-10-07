# Deployment Guide: Netlify (Frontend) + Render & PostgreSQL (Backend)

This guide provides step-by-step instructions for deploying your **Fuel Expense Tracker** with:
- **Frontend**: Vite + React deployed on **Netlify**
- **Backend**: Express REST API server deployed on **Render**
- **Database**: **PostgreSQL** database hosted on Render (or Supabase / Neon)

---

## 🛠️ System Architecture

```
┌────────────────────────────────┐         REST API Call         ┌────────────────────────────────┐
│        Netlify Frontend        │ ────────────────────────────> │         Render Backend         │
│   (Vite + React SPA Bundle)    │  (VITE_API_URL / HTTPS CORS)  │     (Express REST API Node)    │
└────────────────────────────────┘                               └───────────────┬────────────────┘
                                                                                 │ PostgreSQL Pool
                                                                                 ▼
                                                                 ┌────────────────────────────────┐
                                                                 │      PostgreSQL Database       │
                                                                 │ (Vehicles, Fuel, Daily Runs)   │
                                                                 └────────────────────────────────┘
```

---

## 1. PostgreSQL Database Initialization & DDL

If you create a PostgreSQL instance on **Render** (or use Supabase / Neon / Aiven), run the following SQL script from [`server/schema.sql`](file:///C:/Users/janu2/Desktop/Fuel-Expense-Tracker/server/schema.sql) in your database query editor:

```sql
CREATE EXTENSION IF NOT EXISTS "pgcrypto";

-- Vehicles Table
CREATE TABLE IF NOT EXISTS vehicles (
    id VARCHAR(50) PRIMARY KEY,
    name VARCHAR(100) NOT NULL,
    model VARCHAR(100) NOT NULL,
    capacity NUMERIC(10,2) NOT NULL DEFAULT 45,
    fuel_type VARCHAR(50) NOT NULL DEFAULT 'Petrol',
    username VARCHAR(100) DEFAULT 'admin',
    created_at TIMESTAMP WITH TIME ZONE DEFAULT timezone('utc'::text, now()) NOT NULL
);

-- Fuel Entries Table
CREATE TABLE IF NOT EXISTS fuel_entries (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    date DATE NOT NULL,
    odometer INTEGER NOT NULL,
    liters NUMERIC(10,2) NOT NULL CHECK (liters > 0),
    amount_paid NUMERIC(10,2) NOT NULL CHECK (amount_paid > 0),
    price_per_liter NUMERIC(10,3) GENERATED ALWAYS AS (amount_paid / liters) STORED,
    notes TEXT,
    vehicle_id VARCHAR(50) DEFAULT 'vehicle_1',
    username VARCHAR(100) DEFAULT 'admin',
    created_at TIMESTAMP WITH TIME ZONE DEFAULT timezone('utc'::text, now()) NOT NULL
);

-- Daily Runs Table
CREATE TABLE IF NOT EXISTS daily_runs (
    id VARCHAR(50) PRIMARY KEY,
    date DATE NOT NULL,
    vehicle_id VARCHAR(50) NOT NULL,
    mode VARCHAR(50) NOT NULL,
    distance NUMERIC(10,2) NOT NULL,
    estimated_liters NUMERIC(10,2) NOT NULL,
    estimated_cost NUMERIC(10,2) NOT NULL,
    notes TEXT,
    category VARCHAR(100),
    username VARCHAR(100) DEFAULT 'admin',
    created_at TIMESTAMP WITH TIME ZONE DEFAULT timezone('utc'::text, now()) NOT NULL
);

-- Saved Routes Table
CREATE TABLE IF NOT EXISTS saved_routes (
    id VARCHAR(50) PRIMARY KEY,
    name VARCHAR(200) NOT NULL,
    distance NUMERIC(10,2) NOT NULL,
    is_round_trip BOOLEAN NOT NULL DEFAULT false,
    vehicle_id VARCHAR(50) NOT NULL,
    category VARCHAR(100),
    username VARCHAR(100) DEFAULT 'admin',
    created_at TIMESTAMP WITH TIME ZONE DEFAULT timezone('utc'::text, now()) NOT NULL
);

-- Performance Indexes
CREATE INDEX IF NOT EXISTS idx_fuel_entries_date ON fuel_entries(date);
CREATE INDEX IF NOT EXISTS idx_fuel_entries_username ON fuel_entries(username);
CREATE INDEX IF NOT EXISTS idx_daily_runs_date ON daily_runs(date);
```

> **Note:** The Express server in `server/index.js` also contains automatic table initialization on startup if `DATABASE_URL` is set!

---

## 2. Deploying Backend REST API on Render

### Option A: Automatic Deploy via Blueprint (`render.yaml`)
1. Push your repository to your private or public GitHub repository.
2. Log in to [Render Dashboard](https://dashboard.render.com/).
3. Click **New +** > **Blueprint**.
4. Connect your GitHub repository. Render will automatically detect [`render.yaml`](file:///C:/Users/janu2/Desktop/Fuel-Expense-Tracker/render.yaml) and provision:
   - **PostgreSQL Database** (`fuel-expense-db`)
   - **Express Web Service** (`fuel-expense-tracker-api`)

### Option B: Manual Web Service & PostgreSQL Setup
1. On Render, click **New +** > **PostgreSQL**.
   - **Name**: `fuel-expense-db`
   - **Region**: Oregon (or your preferred location)
   - Copy the **Internal Database URL** or **External Database URL**.
2. Click **New +** > **Web Service**.
   - Connect your GitHub repo.
   - **Build Command**: `npm install`
   - **Start Command**: `npm run start:server`
   - **Environment Variables**:
     - `PORT`: `10000`
     - `NODE_ENV`: `production`
     - `DATABASE_URL`: (Paste your Render PostgreSQL connection string)
     - `CORS_ORIGIN`: (Your Netlify site URL, e.g. `https://your-site.netlify.app`)

Once deployed, note down your Render Web Service URL (e.g. `https://fuel-expense-tracker-api.onrender.com`).

---

## 3. Deploying Frontend on Netlify

1. Log in to [Netlify Dashboard](https://app.netlify.com/).
2. Click **Add new site** > **Import from an existing project** > **GitHub**.
3. Select your repository.
4. Set Build Settings:
   - **Build command**: `npm run build`
   - **Publish directory**: `dist`
5. Go to **Site Configuration** > **Environment Variables** and add:
   - `VITE_API_URL`: `https://fuel-expense-tracker-api.onrender.com` (Your Render REST API URL)
   - `VITE_ADMIN_USERNAME`: `admin` (or your preferred admin username)
   - `VITE_ADMIN_PASSWORD_HASH`: (Hashed admin password)
6. Click **Deploy Site**.

---

## 4. Git Push Instructions (Manual Step)

As per your request, code changes have been created locally and **NOT** automatically pushed to GitHub.

When you are ready to push these changes to GitHub:

```bash
# Navigate to project folder
cd C:\Users\janu2\Desktop\Fuel-Expense-Tracker

# Check status of changed files
git status

# Stage all files
git add .

# Commit changes
git commit -m "feat: added Express PostgreSQL backend for Render, Netlify setup, and PDF summary report exports"

# Push to your remote repository
git push origin main
```

---

## 📄 Key Features & Free Tier Optimizations

1. ⚡ **Render Free Tier Cold-Start Mitigation**:
   - **Background Keep-Alive**: The frontend automatically sends a lightweight ping to `/api/ping` every 5 minutes to prevent the free tier service from going to sleep while active.
   - **Fetch Timeout & Cache Fallback**: API calls use a 10-second timeout (`fetchWithTimeout`). If Render takes time to wake up, the app seamlessly uses local cached data without freezing the UI.
   - **Connection Pool Limits**: PostgreSQL pool size is capped at `max: 10` with automatic idle timeout (`idleTimeoutMillis: 30000`) to prevent reaching free tier connection limits.

2. 🚀 **Netlify Free Tier Bandwidth & Performance**:
   - **Vendor Code-Splitting**: Split React, Recharts, Lucide, and Motion into separate vendor chunks (`vite.config.ts`), dropping build time to 5.6s and enabling aggressive browser caching.
   - **Immutable Caching Headers**: Added `Cache-Control: public, max-age=31536000, immutable` in `netlify.toml` for `/assets/*` to reduce bandwidth usage.

3. 📄 **Printable PDF Summary Report Generator**: Full summary stats, mileage analysis, and formatted printable table.
4. 📊 **CSV & JSON Data Backup/Export**: Excel-compatible UTF-8 BOM CSV exports and JSON backups.
5. ⚙️ **Multi-Vehicle Garage Management**: Full support for unlimited vehicle profiles.
6. 🛡️ **Offline & Hybrid Fallback**: Automatically uses local storage if offline or server disconnected.

