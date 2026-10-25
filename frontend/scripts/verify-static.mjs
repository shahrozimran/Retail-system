import fs from 'node:fs';
import path from 'node:path';
import { createHash } from 'node:crypto';
import { fileURLToPath } from 'node:url';
import nextEnv from '@next/env';

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
nextEnv.loadEnvConfig(root);
let pages = 0;
const secrets = [process.env.SUPABASE_PUBLISHABLE_KEY].filter(Boolean);
function check(directory) {
  for (const entry of fs.readdirSync(directory, { withFileTypes: true })) {
    const file = path.join(directory, entry.name);
    if (entry.isDirectory()) { check(file); continue; }
    if (!/\.(html|js|json|txt)$/.test(entry.name)) continue;
    const content = fs.readFileSync(file, 'utf8');
    if (secrets.some(secret => content.includes(secret))) throw new Error('Server-only material found in static output.');
    if (!entry.name.endsWith('.html')) continue;
    pages++;
    const policy = content.match(/<meta http-equiv="Content-Security-Policy" content="([^"]+)"/i)?.[1];
    if (!policy) throw new Error('An exported page has no CSP.');
    const scriptPolicy = policy.split(';').find(part => part.trim().startsWith('script-src'));
    if (!scriptPolicy || scriptPolicy.includes('unsafe-inline') || scriptPolicy.includes('unsafe-eval')) throw new Error('Unsafe static script policy.');
    for (const match of content.matchAll(/<script\b([^>]*)>([\s\S]*?)<\/script>/gi)) {
      if (/\bsrc\s*=/i.test(match[1])) continue;
      const hash = createHash('sha256').update(match[2]).digest('base64');
      if (!scriptPolicy.includes(`'sha256-${hash}'`)) throw new Error('Inline hydration script is missing its CSP hash.');
    }
  }
}
check(path.join(root, 'out'));
if (!pages) throw new Error('No exported pages found.');
console.log(`Verified ${pages} exported HTML pages: matching script hashes, enforced CSP and no server secrets.`);
