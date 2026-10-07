-- PostgreSQL DDL Setup for Fuel Expense Tracker
-- Execute this SQL script in Render PostgreSQL, Supabase, Neon, or your PostgreSQL database instance

CREATE EXTENSION IF NOT EXISTS "pgcrypto";

-- Create Vehicles Table
CREATE TABLE IF NOT EXISTS vehicles (
    id VARCHAR(50) PRIMARY KEY,
    name VARCHAR(100) NOT NULL,
    model VARCHAR(100) NOT NULL,
    capacity NUMERIC(10,2) NOT NULL DEFAULT 45,
    fuel_type VARCHAR(50) NOT NULL DEFAULT 'Petrol',
    username VARCHAR(100) DEFAULT 'admin',
    created_at TIMESTAMP WITH TIME ZONE DEFAULT timezone('utc'::text, now()) NOT NULL
);

-- Create Fuel Entries Table
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

-- Create Daily Runs Table
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

-- Create Saved Routes Table
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

-- Query Optimization Indexes
CREATE INDEX IF NOT EXISTS idx_fuel_entries_date ON fuel_entries(date);
CREATE INDEX IF NOT EXISTS idx_fuel_entries_username ON fuel_entries(username);
CREATE INDEX IF NOT EXISTS idx_daily_runs_date ON daily_runs(date);
CREATE INDEX IF NOT EXISTS idx_daily_runs_username ON daily_runs(username);
CREATE INDEX IF NOT EXISTS idx_vehicles_username ON vehicles(username);
