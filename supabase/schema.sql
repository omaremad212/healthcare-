-- Supabase Database Schema for Healthcare Platform
-- Run this in Supabase SQL Editor to create tables

-- Users table (patients, doctors, coaches)
CREATE TABLE IF NOT EXISTS users (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  name TEXT NOT NULL,
  email TEXT UNIQUE NOT NULL,
  password TEXT NOT NULL,
  role TEXT DEFAULT 'patient' CHECK (role IN ('patient', 'doctor', 'coach')),
  age INTEGER,
  gender TEXT CHECK (gender IN ('Male', 'Female')),
  specialization TEXT,
  years_experience INTEGER,
  clinic_address TEXT,
  training_type TEXT,
  created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW()
);

-- Chatbot results table
CREATE TABLE IF NOT EXISTS chatbot_results (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id UUID REFERENCES users(id) ON DELETE CASCADE,
  flow_type TEXT,
  sleep INTEGER,
  water TEXT,
  headache TEXT,
  pain_severity TEXT,
  symptoms TEXT,
  temperature TEXT,
  breath_short TEXT,
  duration TEXT,
  health_goal TEXT,
  fitness_goal TEXT,
  train_freq TEXT,
  location TEXT,
  level TEXT,
  weight INTEGER,
  height INTEGER,
  injury TEXT,
  diet TEXT,
  health_score INTEGER,
  status TEXT,
  risk_level TEXT,
  bmi NUMERIC,
  recommendation TEXT,
  advice_summary TEXT,
  created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW()
);

-- Bookings table
CREATE TABLE IF NOT EXISTS bookings (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id UUID REFERENCES users(id) ON DELETE CASCADE,
  doctor_id UUID,
  doctor_name TEXT,
  date TEXT NOT NULL,
  time_slot TEXT,
  payment_method TEXT DEFAULT 'cash',
  payment_status TEXT DEFAULT 'pending',
  fee INTEGER,
  notes TEXT,
  status TEXT DEFAULT 'confirmed',
  created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW()
);

-- Products table
CREATE TABLE IF NOT EXISTS products (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  name TEXT NOT NULL,
  description TEXT,
  price NUMERIC NOT NULL,
  category TEXT DEFAULT 'supplement',
  icon TEXT DEFAULT 'fa-capsules',
  in_stock BOOLEAN DEFAULT true,
  created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW()
);

-- Orders table
CREATE TABLE IF NOT EXISTS orders (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id UUID REFERENCES users(id) ON DELETE CASCADE,
  items JSONB NOT NULL,
  total_amount NUMERIC NOT NULL,
  payment_method TEXT NOT NULL,
  payment_status TEXT DEFAULT 'pending',
  delivery_name TEXT,
  delivery_phone TEXT,
  delivery_address TEXT,
  status TEXT DEFAULT 'processing',
  created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW()
);

-- Enable Row Level Security (RLS)
ALTER TABLE users ENABLE ROW LEVEL SECURITY;
ALTER TABLE chatbot_results ENABLE ROW LEVEL SECURITY;
ALTER TABLE bookings ENABLE ROW LEVEL SECURITY;
ALTER TABLE products ENABLE ROW LEVEL SECURITY;
ALTER TABLE orders ENABLE ROW LEVEL SECURITY;

-- Create policies for service role access
-- Note: For serverless API, we'll use service role key which bypasses RLS

-- Plans table (treatment and fitness plans)
CREATE TABLE IF NOT EXISTS plans (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id UUID REFERENCES users(id) ON DELETE CASCADE,
  type TEXT NOT NULL CHECK (type IN ('treatment', 'fitness')),
  title TEXT NOT NULL,
  patient_name TEXT,
  summary TEXT,
  exercises JSONB,
  diet_plan TEXT,
  supplements TEXT,
  medicines TEXT,
  instructions TEXT,
  follow_up TEXT,
  lifestyle_tips TEXT,
  created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW()
);

-- Enable RLS
ALTER TABLE plans ENABLE ROW LEVEL SECURITY;

-- Insert default products
INSERT INTO products (name, description, price, category, icon, in_stock) VALUES
  ('Omega-3 Fish Oil', 'High-purity EPA/DHA for heart and brain health.', 24.99, 'supplement', 'fa-capsules', true),
  ('Multivitamin Elite', '24 essential vitamins and minerals for daily support.', 19.99, 'supplement', 'fa-vial-circle-check', true),
  ('Digital Pulse Ox', 'Instant SpO2 and heart rate monitoring.', 35.00, 'device', 'fa-stethoscope', true),
  ('Smart Hydration Bottle', 'Tracks water intake and syncs with your profile.', 45.50, 'device', 'fa-bottle-water', true),
  ('Herbal Sleep Aid', 'Melatonin-free natural relaxation formula.', 15.99, 'supplement', 'fa-pills', true)
ON CONFLICT DO NOTHING;