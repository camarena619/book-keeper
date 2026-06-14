import { createClient } from '@supabase/supabase-js';

// Reads Vite-configured environment variables
const supabaseUrl = import.meta.env.VITE_SUPABASE_URL || '';
const supabaseAnonKey = import.meta.env.VITE_SUPABASE_ANON_KEY || '';

if (!supabaseUrl || !supabaseAnonKey) {
  console.warn(
    'Supabase environment variables (VITE_SUPABASE_URL, VITE_SUPABASE_ANON_KEY) are missing. Please configure them in your .env file.'
  );
}

export const supabase = createClient(supabaseUrl, supabaseAnonKey);
