import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';
import { createClient } from '@supabase/supabase-js';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

// Read .env file
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
const BUCKET_NAME = 'avatar';
const AVATAR_DIR = path.resolve(__dirname, '../public/Avatar');

async function main() {
  console.log(`Starting upload of avatars to bucket '${BUCKET_NAME}'...`);

  // Ensure bucket exists or create it
  const { data: buckets, error: getBucketsErr } = await supabase.storage.listBuckets();
  if (getBucketsErr) {
    console.warn('Warning listing buckets:', getBucketsErr.message);
  }

  const existingBucket = buckets?.find((b) => b.name === BUCKET_NAME || b.id === BUCKET_NAME);
  if (!existingBucket) {
    console.log(`Bucket '${BUCKET_NAME}' not found, attempting to create...`);
    const { error: createErr } = await supabase.storage.createBucket(BUCKET_NAME, {
      public: true,
      fileSizeLimit: 10485760, // 10MB
    });
    if (createErr) {
      console.warn(`Could not create bucket '${BUCKET_NAME}' (it may already exist or requires admin privileges):`, createErr.message);
    } else {
      console.log(`Successfully created public bucket '${BUCKET_NAME}'!`);
    }
  } else {
    console.log(`Bucket '${BUCKET_NAME}' exists!`);
  }

  const files = fs.readdirSync(AVATAR_DIR);
  const gifFiles = files.filter((f) => f.endsWith('.gif'));

  console.log(`Found ${gifFiles.length} GIF avatars in ${AVATAR_DIR}.`);

  let successCount = 0;
  let failCount = 0;

  for (const file of gifFiles) {
    const filePath = path.join(AVATAR_DIR, file);
    const fileBuffer = fs.readFileSync(filePath);

    const { data, error } = await supabase.storage
      .from(BUCKET_NAME)
      .upload(file, fileBuffer, {
        contentType: 'image/gif',
        upsert: true,
      });

    if (error) {
      console.error(`Failed to upload ${file}:`, error.message);
      failCount++;
    } else {
      console.log(`✓ Uploaded ${file} (${data.path})`);
      successCount++;
    }
  }

  console.log(`\nUpload complete! Success: ${successCount}, Failed: ${failCount}`);
}

main().catch(console.error);
