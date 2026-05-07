-- Healthcare Platform — Supabase Schema
-- Run in Supabase SQL Editor to create / migrate tables

-- ─────────────────────────────────────────────────────────────────
-- USERS — patients, doctors, coaches
-- ─────────────────────────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS users (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  name TEXT NOT NULL,
  username TEXT UNIQUE,
  display_name TEXT,
  email TEXT UNIQUE NOT NULL,
  password TEXT NOT NULL,
  avatar_url TEXT,
  role TEXT DEFAULT 'patient' CHECK (role IN ('patient', 'doctor', 'coach')),
  age INTEGER,
  gender TEXT CHECK (gender IN ('Male', 'Female')),
  -- Doctor / Coach pricing
  specialization TEXT,
  years_experience INTEGER,
  clinic_address TEXT,
  training_type TEXT,
  regular_rate INTEGER DEFAULT 200,         -- regular consultation fee
  emergency_rate INTEGER DEFAULT 400,        -- emergency consultation fee (≥1.5× regular)
  bio TEXT,
  created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
  updated_at TIMESTAMP WITH TIME ZONE DEFAULT NOW()
);

-- Migration helpers (in case the table already exists)
ALTER TABLE users ADD COLUMN IF NOT EXISTS username TEXT UNIQUE;
ALTER TABLE users ADD COLUMN IF NOT EXISTS display_name TEXT;
ALTER TABLE users ADD COLUMN IF NOT EXISTS avatar_url TEXT;
ALTER TABLE users ADD COLUMN IF NOT EXISTS regular_rate INTEGER DEFAULT 200;
ALTER TABLE users ADD COLUMN IF NOT EXISTS emergency_rate INTEGER DEFAULT 400;
ALTER TABLE users ADD COLUMN IF NOT EXISTS bio TEXT;
ALTER TABLE users ADD COLUMN IF NOT EXISTS updated_at TIMESTAMP WITH TIME ZONE DEFAULT NOW();

-- ─────────────────────────────────────────────────────────────────
-- CHATBOT RESULTS — flexible (medical or fitness)
-- ─────────────────────────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS chatbot_results (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id UUID REFERENCES users(id) ON DELETE CASCADE,
  flow_type TEXT,                          -- 'health' | 'fitness'
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
  assessment_json JSONB,                   -- full AI assessment
  created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW()
);
ALTER TABLE chatbot_results ADD COLUMN IF NOT EXISTS assessment_json JSONB;

-- ─────────────────────────────────────────────────────────────────
-- BOOKINGS — patient appointments (doctor or coach)
-- ─────────────────────────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS bookings (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id UUID REFERENCES users(id) ON DELETE CASCADE,
  doctor_id UUID,
  doctor_name TEXT,
  professional_role TEXT DEFAULT 'doctor', -- 'doctor' | 'coach'
  date TEXT NOT NULL,
  time_slot TEXT,
  payment_method TEXT DEFAULT 'cash',
  payment_status TEXT DEFAULT 'pending',
  fee INTEGER,
  is_emergency BOOLEAN DEFAULT false,      -- emergency booking flag
  booking_type TEXT DEFAULT 'regular',     -- 'regular' | 'emergency'
  notes TEXT,
  status TEXT DEFAULT 'confirmed',         -- pending | confirmed | completed | cancelled
  feedback_submitted BOOLEAN DEFAULT false,
  created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW()
);
ALTER TABLE bookings ADD COLUMN IF NOT EXISTS is_emergency BOOLEAN DEFAULT false;
ALTER TABLE bookings ADD COLUMN IF NOT EXISTS booking_type TEXT DEFAULT 'regular';
ALTER TABLE bookings ADD COLUMN IF NOT EXISTS professional_role TEXT DEFAULT 'doctor';
ALTER TABLE bookings ADD COLUMN IF NOT EXISTS feedback_submitted BOOLEAN DEFAULT false;

-- ─────────────────────────────────────────────────────────────────
-- FEEDBACK — ratings + reviews tied to a completed booking
-- ─────────────────────────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS feedback (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  booking_id UUID REFERENCES bookings(id) ON DELETE CASCADE,
  user_id UUID REFERENCES users(id) ON DELETE CASCADE,         -- patient
  doctor_id UUID,                                              -- target doctor/coach
  doctor_name TEXT,
  rating INTEGER NOT NULL CHECK (rating >= 1 AND rating <= 5),
  communication INTEGER CHECK (communication BETWEEN 1 AND 5),
  professionalism INTEGER CHECK (professionalism BETWEEN 1 AND 5),
  helpfulness INTEGER CHECK (helpfulness BETWEEN 1 AND 5),
  review TEXT,
  anonymous BOOLEAN DEFAULT false,
  created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW()
);

-- ─────────────────────────────────────────────────────────────────
-- PRODUCTS — supplements, devices, etc.
-- ─────────────────────────────────────────────────────────────────
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

-- ─────────────────────────────────────────────────────────────────
-- ORDERS
-- ─────────────────────────────────────────────────────────────────
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

-- ─────────────────────────────────────────────────────────────────
-- PLANS — treatment / fitness plans
-- ─────────────────────────────────────────────────────────────────
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
  workout_location TEXT,
  goal TEXT,
  created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW()
);

-- ─────────────────────────────────────────────────────────────────
-- MESSAGES — patient ↔ professional chat (post-booking)
-- ─────────────────────────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS messages (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  booking_id UUID REFERENCES bookings(id) ON DELETE CASCADE,
  patient_id UUID REFERENCES users(id) ON DELETE CASCADE,
  professional_id UUID,                    -- nullable for the seeded sample doctors
  professional_name TEXT,
  sender_role TEXT NOT NULL CHECK (sender_role IN ('patient', 'professional')),
  body TEXT NOT NULL,
  read_by_patient BOOLEAN DEFAULT false,
  read_by_professional BOOLEAN DEFAULT false,
  created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW()
);
CREATE INDEX IF NOT EXISTS messages_booking_idx ON messages(booking_id, created_at);
CREATE INDEX IF NOT EXISTS messages_patient_idx ON messages(patient_id, created_at);

-- ─────────────────────────────────────────────────────────────────
-- RLS — using service role key from API, RLS is bypassed
-- ─────────────────────────────────────────────────────────────────
ALTER TABLE users ENABLE ROW LEVEL SECURITY;
ALTER TABLE chatbot_results ENABLE ROW LEVEL SECURITY;
ALTER TABLE bookings ENABLE ROW LEVEL SECURITY;
ALTER TABLE feedback ENABLE ROW LEVEL SECURITY;
ALTER TABLE products ENABLE ROW LEVEL SECURITY;
ALTER TABLE orders ENABLE ROW LEVEL SECURITY;
ALTER TABLE plans ENABLE ROW LEVEL SECURITY;
ALTER TABLE messages ENABLE ROW LEVEL SECURITY;

-- ─────────────────────────────────────────────────────────────────
-- Default products
-- ─────────────────────────────────────────────────────────────────
INSERT INTO products (name, description, price, category, icon, in_stock) VALUES
  ('Omega-3 Fish Oil', 'High-purity EPA/DHA for heart and brain health.', 24.99, 'supplement', 'fa-capsules', true),
  ('Multivitamin Elite', '24 essential vitamins and minerals for daily support.', 19.99, 'supplement', 'fa-vial-circle-check', true),
  ('Digital Pulse Ox', 'Instant SpO2 and heart rate monitoring.', 35.00, 'device', 'fa-stethoscope', true),
  ('Smart Hydration Bottle', 'Tracks water intake and syncs with your profile.', 45.50, 'device', 'fa-bottle-water', true),
  ('Herbal Sleep Aid', 'Melatonin-free natural relaxation formula.', 15.99, 'supplement', 'fa-pills', true)
ON CONFLICT DO NOTHING;
