import express from 'express';
import cors from 'cors';
import dotenv from 'dotenv';
import pkg from 'pg';
const { Pool } = pkg;

dotenv.config();

const app = express();
const PORT = process.env.PORT || 5000;
const CORS_ORIGIN = process.env.CORS_ORIGIN || '*';

app.use(cors({ origin: CORS_ORIGIN, credentials: true }));
app.use(express.json({ limit: '10mb' }));

// PostgreSQL Connection Pool Configuration
const connectionString = process.env.DATABASE_URL;
let pool = null;

if (connectionString) {
  const isProduction = process.env.NODE_ENV === 'production' || connectionString.includes('render.com') || connectionString.includes('supabase') || connectionString.includes('neon.tech');
  pool = new Pool({
    connectionString,
    ssl: isProduction ? { rejectUnauthorized: false } : false,
    max: 10, // Optimized for free tier low connection limits
    idleTimeoutMillis: 30000, // Close idle connections automatically
    connectionTimeoutMillis: 5000 // Fast fail on connection timeout
  });

  pool.on('error', (err) => {
    console.error('Unexpected PostgreSQL pool error:', err);
  });
  console.log('🔌 Express Backend: Configured PostgreSQL Connection Pool (Render Free Tier Optimized).');
} else {
  console.warn('⚠️ Express Backend: DATABASE_URL environment variable is not set.');
}

// Auto Table Initialization Helper
const initializeDatabase = async () => {
  if (!pool) return;
  try {
    const client = await pool.connect();
    try {
      await client.query(`
        CREATE EXTENSION IF NOT EXISTS "pgcrypto";

        CREATE TABLE IF NOT EXISTS vehicles (
            id VARCHAR(50) PRIMARY KEY,
            name VARCHAR(100) NOT NULL,
            model VARCHAR(100) NOT NULL,
            capacity NUMERIC(10,2) NOT NULL DEFAULT 45,
            fuel_type VARCHAR(50) NOT NULL DEFAULT 'Petrol',
            username VARCHAR(100) DEFAULT 'admin',
            created_at TIMESTAMP WITH TIME ZONE DEFAULT timezone('utc'::text, now()) NOT NULL
        );

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
      `);
      console.log('✅ Express Backend: PostgreSQL Database tables initialized successfully.');
    } finally {
      client.release();
    }
  } catch (err) {
    console.error('❌ Express Backend: Database initialization error:', err.message);
  }
};

// ---------------- REST API ROUTES ----------------

// Health Check Endpoint
app.get('/api/health', async (req, res) => {
  let dbStatus = 'disconnected';
  if (pool) {
    try {
      const client = await pool.connect();
      await client.query('SELECT 1');
      client.release();
      dbStatus = 'connected';
    } catch {
      dbStatus = 'error';
    }
  }
  res.json({
    status: 'online',
    database: dbStatus,
    timestamp: new Date().toISOString()
  });
});

// Lightweight Keep-Alive Ping Endpoint (for Render free tier keep-alive)
app.get('/api/ping', (req, res) => {
  res.json({ status: 'ok', time: Date.now() });
});

// --- FUEL ENTRIES ---
app.get('/api/fuel-entries', async (req, res) => {
  if (!pool) return res.status(503).json({ error: 'Database connection not configured' });
  const username = (req.query.username || 'admin').toString();
  try {
    const { rows } = await pool.query(
      `SELECT id, date::text, odometer, liters::float, amount_paid::float, price_per_liter::float, notes, vehicle_id, created_at 
       FROM fuel_entries 
       WHERE username = $1 
       ORDER BY date ASC, odometer ASC`,
      [username]
    );
    res.json(rows);
  } catch (err) {
    console.error('Error fetching fuel entries:', err);
    res.status(500).json({ error: err.message });
  }
});

app.post('/api/fuel-entries', async (req, res) => {
  if (!pool) return res.status(503).json({ error: 'Database connection not configured' });
  const { date, odometer, liters, amount_paid, notes, vehicle_id, username = 'admin' } = req.body;
  try {
    const { rows } = await pool.query(
      `INSERT INTO fuel_entries (date, odometer, liters, amount_paid, notes, vehicle_id, username)
       VALUES ($1, $2, $3, $4, $5, $6, $7)
       RETURNING id, date::text, odometer, liters::float, amount_paid::float, price_per_liter::float, notes, vehicle_id, created_at`,
      [date, odometer, liters, amount_paid, notes || '', vehicle_id || 'vehicle_1', username]
    );
    res.status(201).json(rows[0]);
  } catch (err) {
    console.error('Error adding fuel entry:', err);
    res.status(500).json({ error: err.message });
  }
});

app.put('/api/fuel-entries/:id', async (req, res) => {
  if (!pool) return res.status(503).json({ error: 'Database connection not configured' });
  const { id } = req.params;
  const { date, odometer, liters, amount_paid, notes, vehicle_id } = req.body;
  try {
    const { rows } = await pool.query(
      `UPDATE fuel_entries 
       SET date = $1, odometer = $2, liters = $3, amount_paid = $4, notes = $5, vehicle_id = $6
       WHERE id = $7
       RETURNING id, date::text, odometer, liters::float, amount_paid::float, price_per_liter::float, notes, vehicle_id, created_at`,
      [date, odometer, liters, amount_paid, notes || '', vehicle_id || 'vehicle_1', id]
    );
    if (rows.length === 0) return res.status(404).json({ error: 'Entry not found' });
    res.json(rows[0]);
  } catch (err) {
    console.error('Error updating fuel entry:', err);
    res.status(500).json({ error: err.message });
  }
});

app.delete('/api/fuel-entries/:id', async (req, res) => {
  if (!pool) return res.status(503).json({ error: 'Database connection not configured' });
  const { id } = req.params;
  try {
    await pool.query('DELETE FROM fuel_entries WHERE id = $1', [id]);
    res.json({ success: true, id });
  } catch (err) {
    console.error('Error deleting fuel entry:', err);
    res.status(500).json({ error: err.message });
  }
});

// --- VEHICLES ---
app.get('/api/vehicles', async (req, res) => {
  if (!pool) return res.status(503).json({ error: 'Database connection not configured' });
  const username = (req.query.username || 'admin').toString();
  try {
    const { rows } = await pool.query(
      `SELECT id, name, model, capacity::float, fuel_type AS "fuelType", username 
       FROM vehicles 
       WHERE username = $1 
       ORDER BY created_at ASC`,
      [username]
    );
    res.json(rows);
  } catch (err) {
    console.error('Error fetching vehicles:', err);
    res.status(500).json({ error: err.message });
  }
});

app.post('/api/vehicles', async (req, res) => {
  if (!pool) return res.status(503).json({ error: 'Database connection not configured' });
  const { id, name, model, capacity, fuelType, username = 'admin' } = req.body;
  try {
    const { rows } = await pool.query(
      `INSERT INTO vehicles (id, name, model, capacity, fuel_type, username)
       VALUES ($1, $2, $3, $4, $5, $6)
       ON CONFLICT (id) DO UPDATE SET name = EXCLUDED.name, model = EXCLUDED.model, capacity = EXCLUDED.capacity, fuel_type = EXCLUDED.fuel_type
       RETURNING id, name, model, capacity::float, fuel_type AS "fuelType", username`,
      [id, name, model, capacity || 45, fuelType || 'Petrol', username]
    );
    res.status(201).json(rows[0]);
  } catch (err) {
    console.error('Error saving vehicle:', err);
    res.status(500).json({ error: err.message });
  }
});

app.delete('/api/vehicles/:id', async (req, res) => {
  if (!pool) return res.status(503).json({ error: 'Database connection not configured' });
  const { id } = req.params;
  try {
    await pool.query('DELETE FROM vehicles WHERE id = $1', [id]);
    res.json({ success: true, id });
  } catch (err) {
    console.error('Error deleting vehicle:', err);
    res.status(500).json({ error: err.message });
  }
});

// --- DAILY RUNS ---
app.get('/api/daily-runs', async (req, res) => {
  if (!pool) return res.status(503).json({ error: 'Database connection not configured' });
  const username = (req.query.username || 'admin').toString();
  try {
    const { rows } = await pool.query(
      `SELECT id, date::text, vehicle_id, mode, distance::float, estimated_liters AS "estimatedLiters", estimated_cost AS "estimatedCost", notes, category, created_at
       FROM daily_runs
       WHERE username = $1
       ORDER BY date DESC`,
      [username]
    );
    res.json(rows);
  } catch (err) {
    console.error('Error fetching daily runs:', err);
    res.status(500).json({ error: err.message });
  }
});

app.post('/api/daily-runs', async (req, res) => {
  if (!pool) return res.status(503).json({ error: 'Database connection not configured' });
  const { id, date, vehicle_id, mode, distance, estimatedLiters, estimatedCost, notes, category, username = 'admin' } = req.body;
  try {
    const runId = id || `run_${Date.now()}`;
    const { rows } = await pool.query(
      `INSERT INTO daily_runs (id, date, vehicle_id, mode, distance, estimated_liters, estimated_cost, notes, category, username)
       VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10)
       ON CONFLICT (id) DO UPDATE SET date = EXCLUDED.date, distance = EXCLUDED.distance, estimated_liters = EXCLUDED.estimated_liters, estimated_cost = EXCLUDED.estimated_cost, notes = EXCLUDED.notes
       RETURNING id, date::text, vehicle_id, mode, distance::float, estimated_liters AS "estimatedLiters", estimated_cost AS "estimatedCost", notes, category, created_at`,
      [runId, date, vehicle_id, mode, distance, estimatedLiters, estimatedCost, notes || '', category || 'General', username]
    );
    res.status(201).json(rows[0]);
  } catch (err) {
    console.error('Error saving daily run:', err);
    res.status(500).json({ error: err.message });
  }
});

app.delete('/api/daily-runs/:id', async (req, res) => {
  if (!pool) return res.status(503).json({ error: 'Database connection not configured' });
  const { id } = req.params;
  try {
    await pool.query('DELETE FROM daily_runs WHERE id = $1', [id]);
    res.json({ success: true, id });
  } catch (err) {
    console.error('Error deleting daily run:', err);
    res.status(500).json({ error: err.message });
  }
});

// --- SAVED ROUTES ---
app.get('/api/saved-routes', async (req, res) => {
  if (!pool) return res.status(503).json({ error: 'Database connection not configured' });
  const username = (req.query.username || 'admin').toString();
  try {
    const { rows } = await pool.query(
      `SELECT id, name, distance::float, is_round_trip AS "isRoundTrip", vehicle_id, category
       FROM saved_routes
       WHERE username = $1`,
      [username]
    );
    res.json(rows);
  } catch (err) {
    console.error('Error fetching saved routes:', err);
    res.status(500).json({ error: err.message });
  }
});

app.post('/api/saved-routes', async (req, res) => {
  if (!pool) return res.status(503).json({ error: 'Database connection not configured' });
  const { id, name, distance, isRoundTrip, vehicle_id, category, username = 'admin' } = req.body;
  try {
    const routeId = id || `route_${Date.now()}`;
    const { rows } = await pool.query(
      `INSERT INTO saved_routes (id, name, distance, is_round_trip, vehicle_id, category, username)
       VALUES ($1, $2, $3, $4, $5, $6, $7)
       ON CONFLICT (id) DO UPDATE SET name = EXCLUDED.name, distance = EXCLUDED.distance, is_round_trip = EXCLUDED.is_round_trip
       RETURNING id, name, distance::float, is_round_trip AS "isRoundTrip", vehicle_id, category`,
      [routeId, name, distance, isRoundTrip || false, vehicle_id, category || 'General', username]
    );
    res.status(201).json(rows[0]);
  } catch (err) {
    console.error('Error saving route:', err);
    res.status(500).json({ error: err.message });
  }
});

// Start Express Server
app.listen(PORT, () => {
  console.log(`🚀 Express PostgreSQL Server listening on port ${PORT}`);
  initializeDatabase();
});
