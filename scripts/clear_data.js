/**
 * Wipes every user and match row. Irreversible, so it needs --yes.
 *
 *   node scripts/clear_data.js --yes
 */
import { createClient } from '@supabase/supabase-js';
import { loadEnv, require_, requireConfirmation } from './_env.js';

requireConfirmation('this deletes every row in gomoku_users and gomoku_matches');

const env = loadEnv();
const supabaseUrl = require_(env, 'VITE_SUPABASE_URL');
const supabaseAnonKey = require_(env, 'VITE_SUPABASE_ANON_KEY');

const supabase = createClient(supabaseUrl, supabaseAnonKey);

async function main() {
  console.log('Clearing all users and match records...');

  const { error: usersError } = await supabase.from('gomoku_users').delete().neq('uid', '0');
  console.log(usersError ? `gomoku_users failed: ${usersError.message}` : 'gomoku_users cleared');

  const { error: matchesError } = await supabase.from('gomoku_matches').delete().neq('id', '0');
  console.log(matchesError ? `gomoku_matches failed: ${matchesError.message}` : 'gomoku_matches cleared');
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
