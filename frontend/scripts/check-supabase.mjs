import path from 'node:path';
import { fileURLToPath } from 'node:url';
import nextEnv from '@next/env';
import { supabaseClient, supabaseConfig } from '../src/lib/supabase.ts';

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
nextEnv.loadEnvConfig(root);
try {
  const { url, key } = supabaseConfig();
  const settings = await fetch(`${url}/auth/v1/settings`, { headers: { apikey: key }, signal: AbortSignal.timeout(15000) });
  if (!settings.ok) throw new Error('Supabase rejected the configured project key.');
  const auth = await settings.json();
  console.log('Supabase connection: reachable; project key accepted.');
  console.log(`Public Auth signup: ${auth.disable_signup === true ? 'disabled' : 'enabled (disable in Authentication settings after admin setup)'}.`);
  const { data, error } = await supabaseClient().rpc('retail_health');
  if (error || data?.version !== 1) {
    console.log('Retail schema: not ready. Run supabase/migrations/202610260001_retail.sql in the project SQL Editor.');
    process.exitCode = 2;
  } else console.log('Retail schema: version 1 ready. Run the private admin bootstrap if this is the first setup.');
} catch {
  console.error('Supabase connection check failed. Verify SUPABASE_URL and SUPABASE_PUBLISHABLE_KEY in the local environment or Vercel settings.');
  process.exitCode = 1;
}
