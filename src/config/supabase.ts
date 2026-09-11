import { createClient } from '@supabase/supabase-js';

const supabaseUrl = import.meta.env.VITE_SUPABASE_URL || '';
const supabaseAnonKey = import.meta.env.VITE_SUPABASE_ANON_KEY || '';

export const isSupabaseConfigured = Boolean(supabaseUrl && supabaseAnonKey);

/**
 * The project ref is the first label of the Supabase hostname. It is read back
 * out of the URL rather than written down a second time: the config guide names
 * the project and links to its dashboard, and both had gone stale against .env
 * within one project migration.
 */
export const supabaseProjectRef = supabaseUrl.split('//')[1]?.split('.')[0] ?? '';

export const supabase = isSupabaseConfigured
  ? createClient(supabaseUrl, supabaseAnonKey)
  : null;
