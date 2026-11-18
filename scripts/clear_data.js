/**
 * Wipes every user and match row. Irreversible, so it needs --yes.
 *
 *   node scripts/clear_data.js --yes
 *
 * Needs SUPABASE_SERVICE_ROLE_KEY (in .env or the environment): since row level
 * security, the anon key may not delete these rows.
 */
import { createClient } from '@supabase/supabase-js';
import { loadEnv, require_, requireConfirmation } from './_env.js';

const env = loadEnv();
const supabaseUrl = require_(env, 'VITE_SUPABASE_URL');
const serviceRoleKey = require_(
  env,
  'SUPABASE_SERVICE_ROLE_KEY',
  'Add the service role key (Supabase dashboard > Project Settings > API) to .env; the anon key has no right to delete.',
);

// The project, never the key, so the person can tell which database this hits.
console.log(`Project: ${new URL(supabaseUrl).host}`);
requireConfirmation('this deletes every row in gomoku_users and gomoku_matches of the project above');

const supabase = createClient(supabaseUrl, serviceRoleKey, {
  auth: { persistSession: false, autoRefreshToken: false },
});

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
