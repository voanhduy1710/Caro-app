import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';

const __dirname = path.dirname(fileURLToPath(import.meta.url));

/**
 * Reads .env into a plain object without ever writing secrets into source.
 * Values already present in process.env win, so CI can inject them.
 */
export const loadEnv = () => {
  const vars = {};
  const envPath = path.resolve(__dirname, '../.env');
  if (fs.existsSync(envPath)) {
    for (const line of fs.readFileSync(envPath, 'utf8').split('\n')) {
      const trimmed = line.trim();
      if (!trimmed || trimmed.startsWith('#')) continue;
      const [key, ...rest] = trimmed.split('=');
      if (key && rest.length) vars[key.trim()] = rest.join('=').trim();
    }
  }
  return { ...vars, ...process.env };
};

/** Fails loudly instead of running against a half-configured project. */
export const require_ = (env, name, hint) => {
  const value = env[name];
  if (!value) {
    console.error(`Missing ${name}.${hint ? ' ' + hint : ''}`);
    process.exit(1);
  }
  return value;
};

/** Destructive scripts must be asked for explicitly. */
export const requireConfirmation = (description) => {
  if (!process.argv.includes('--yes')) {
    console.error(`Refusing to run: ${description}`);
    console.error('Re-run with --yes if that is really what you want.');
    process.exit(1);
  }
};
