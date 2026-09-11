import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';
import { createClient } from '@supabase/supabase-js';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

const envPath = path.resolve(__dirname, '../.env');
const envContent = fs.readFileSync(envPath, 'utf8');
const envVars = {};
envContent.split('\n').forEach((line) => {
  const [key, ...vals] = line.split('=');
  if (key && vals.length > 0) {
    envVars[key.trim()] = vals.join('=').trim();
  }
});

const supabaseUrl = envVars['VITE_SUPABASE_URL'];
const supabaseAnonKey = envVars['VITE_SUPABASE_ANON_KEY'];

if (!supabaseUrl || !supabaseAnonKey) {
  console.error('Supabase URL or Key missing in .env');
  process.exit(1);
}

const supabase = createClient(supabaseUrl, supabaseAnonKey);

async function main() {
  console.log('Clearing all old users and match records from Supabase...');

  const { data: users, error: err1 } = await supabase
    .from('gomoku_users')
    .delete()
    .neq('uid', '0');

  if (err1) {
    console.warn('Delete gomoku_users error:', err1.message);
  } else {
    console.log('Successfully cleared gomoku_users table!');
  }

  const { data: matches, error: err2 } = await supabase
    .from('gomoku_matches')
    .delete()
    .neq('id', 0);

  if (err2) {
    console.warn('Delete gomoku_matches error:', err2.message);
  } else {
    console.log('Successfully cleared gomoku_matches table!');
  }

  console.log('Data wipe complete!');
}

main().catch(console.error);
