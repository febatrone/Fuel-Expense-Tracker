# Netlify & Supabase Deployment & Custom Domain Guide

Follow this guide to deploy your unified fuel tracking console to Netlify, sync it securely with Supabase, and configure your own custom domain.

---

## 1. Supabase Database Initialization
1. Sign in to your [Supabase Dashboard](https://supabase.com/) and create a new project.
2. Go to the **SQL Editor** tab in the sidebar.
3. Click **New Query**, paste the table setup DDL definitions, and click **Run**:
   ```sql
   -- Create the vehicles table
   CREATE TABLE public.vehicles (
       id VARCHAR(50) PRIMARY KEY,
       name VARCHAR(100) NOT NULL,
       model VARCHAR(100) NOT NULL,
       capacity NUMERIC(10,2) NOT NULL DEFAULT 45,
       fuel_type VARCHAR(50) NOT NULL DEFAULT 'Petrol',
       created_at TIMESTAMP WITH TIME ZONE DEFAULT timezone('utc'::text, now()) NOT NULL
   );

   -- Create the fuel_entries table
   CREATE TABLE public.fuel_entries (
       id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
       date DATE NOT NULL,
       odometer INTEGER NOT NULL,
       liters NUMERIC(10,2) NOT NULL CHECK (liters > 0),
       amount_paid NUMERIC(10,2) NOT NULL CHECK (amount_paid > 0),
       price_per_liter NUMERIC(10,3) GENERATED ALWAYS AS (amount_paid / liters) STORED,
       notes TEXT,
       created_at TIMESTAMP WITH TIME ZONE DEFAULT timezone('utc'::text, now()) NOT NULL
   );

   -- Create the daily_runs table
   CREATE TABLE public.daily_runs (
       id VARCHAR(50) PRIMARY KEY,
       date DATE NOT NULL,
       vehicle_id VARCHAR(50) NOT NULL,
       mode VARCHAR(50) NOT NULL,
       distance NUMERIC(10,2) NOT NULL,
       estimated_liters NUMERIC(10,2) NOT NULL,
       estimated_cost NUMERIC(10,2) NOT NULL,
       notes TEXT,
       category VARCHAR(100),
       created_at TIMESTAMP WITH TIME ZONE DEFAULT timezone('utc'::text, now()) NOT NULL
   );

   -- Create the saved_routes table
   CREATE TABLE public.saved_routes (
       id VARCHAR(50) PRIMARY KEY,
       name VARCHAR(200) NOT NULL,
       distance NUMERIC(10,2) NOT NULL,
       is_round_trip BOOLEAN NOT NULL DEFAULT false,
       vehicle_id VARCHAR(50) NOT NULL,
       category VARCHAR(100),
       created_at TIMESTAMP WITH TIME ZONE DEFAULT timezone('utc'::text, now()) NOT NULL
   );

   -- Enable Row-Level Security (RLS) on all tables
   ALTER TABLE public.vehicles ENABLE ROW LEVEL SECURITY;
   ALTER TABLE public.fuel_entries ENABLE ROW LEVEL SECURITY;
   ALTER TABLE public.daily_runs ENABLE ROW LEVEL SECURITY;
   ALTER TABLE public.saved_routes ENABLE ROW LEVEL SECURITY;

   -- Create all-access public RLS policies
   CREATE POLICY "Enable read/write for all on vehicles" ON public.vehicles FOR ALL USING (true) WITH CHECK (true);
   CREATE POLICY "Enable read/write for all on fuel_entries" ON public.fuel_entries FOR ALL USING (true) WITH CHECK (true);
   CREATE POLICY "Enable read/write for all on daily_runs" ON public.daily_runs FOR ALL USING (true) WITH CHECK (true);
   CREATE POLICY "Enable read/write for all on saved_routes" ON public.saved_routes FOR ALL USING (true) WITH CHECK (true);
   ```
4. Navigate to **Project Settings** > **API** and copy your **Project URL** and **anon/public API key**.

---

## 2. GitHub Push
Push your repository to GitHub:
```bash
git init
git add .
git commit -m "feat: consolidated dashboard switcher, purpose tab, and cloud sync"
git branch -M main
git remote add origin https://github.com/your-username/your-repo-name.git
git push -u origin main
```

---

## 3. Netlify Deployment & Envs Configuration
1. Sign in to your [Netlify Dashboard](https://www.netlify.com/).
2. Click **Add new site** > **Import from Git** > **GitHub** and select your repository.
3. Ensure the configurations are set as:
   - **Build command**: `npm run build`
   - **Publish directory**: `dist`
4. Navigate to **Site Configuration** > **Environment Variables** and add:
   - `VITE_SUPABASE_URL`: (Your Supabase Project URL)
   - `VITE_SUPABASE_ANON_KEY`: (Your Supabase anon key)
   - `VITE_ADMIN_USERNAME`: (Your admin username)
   - `VITE_ADMIN_PASSWORD_HASH`: (Your hashed password from the System settings tab)
5. Click **Trigger deploy**.

---

## 4. Custom Domain Setup
1. In Netlify, go to **Site Configuration** > **Domain Management**.
2. Click **Add custom domain** and enter your domain name.
3. Log in to your domain registrar's DNS panel (e.g. GoDaddy, Namecheap, Cloudflare) and append:
   - **For subdomains (e.g. `tracker.yourdomain.com`):**
     - Type: `CNAME`
     - Host/Name: `tracker`
     - Value: `your-site-name.netlify.app`
   - **For apex domains (e.g. `yourdomain.com`):**
     - Type: `A`
     - Host/Name: `@`
     - Value: `75.101.122.121`
     - Type: `CNAME`
     - Host/Name: `www`
     - Value: `your-site-name.netlify.app`
4. Go back to Netlify domain manager, verify DNS status, and provision Let's Encrypt SSL certificate.
