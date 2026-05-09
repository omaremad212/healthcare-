// lib/supabase.js - Supabase client for Vercel serverless

const { createClient } = require('@supabase/supabase-js');

const supabaseUrl = process.env.SUPABASE_URL;
const supabaseServiceKey = process.env.SUPABASE_SERVICE_ROLE_KEY;

if (!supabaseUrl || !supabaseServiceKey) {
  console.error('Missing SUPABASE_URL or SUPABASE_SERVICE_ROLE_KEY environment variable');
}

// Service role client (bypasses RLS for server-side operations).
// Realtime disabled — serverless functions don't hold open WebSocket connections.
const supabase = createClient(
  supabaseUrl || 'https://placeholder.supabase.co',
  supabaseServiceKey || 'placeholder-key',
  {
    auth: { autoRefreshToken: false, persistSession: false },
    realtime: { params: { eventsPerSecond: -1 } },
    global: { headers: { 'x-client-info': 'healthcare-serverless' } },
  }
);

module.exports = { supabase };