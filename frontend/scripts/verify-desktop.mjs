import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import assert from 'node:assert/strict';
import nextEnv from '@next/env';

const frontend = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
nextEnv.loadEnvConfig(frontend);
const desktop = path.join(frontend, '../desktop');
const config = JSON.parse(fs.readFileSync(path.join(desktop, 'src-tauri/tauri.conf.json'), 'utf8'));
const capability = JSON.parse(fs.readFileSync(path.join(desktop, 'src-tauri/capabilities/main.json'), 'utf8'));
assert.deepEqual(capability.permissions, ['allow-retail-request', 'allow-save-invoice', 'allow-print-invoice', 'allow-check-updates', 'allow-install-update']);
assert.deepEqual(capability.windows, ['main']);
assert.ok(config.app.security.csp.includes("object-src 'none'"));
assert.ok(config.app.security.csp.split(';').find(s => s.trim().startsWith('connect-src')).includes("'self'"), 'Static client routing requires local asset requests.');
assert.ok(!config.app.security.csp.split(';').find(s => s.trim().startsWith('script-src')).includes('unsafe-inline'));
assert.ok(!config.app.security.csp.includes('unsafe-eval'));
const forbidden = [process.env.SUPABASE_URL, process.env.SUPABASE_PUBLISHABLE_KEY].filter(Boolean);
let pages = 0;
let bridge = false;
function scan(folder) {
  for (const entry of fs.readdirSync(folder, { withFileTypes: true })) {
    const file = path.join(folder, entry.name);
    if (entry.isDirectory()) { scan(file); continue; }
    if (!/\.(html|js|json|txt)$/.test(entry.name)) continue;
    const body = fs.readFileSync(file, 'utf8');
    assert.ok(!forbidden.some(value => body.includes(value)), 'Server configuration leaked into desktop assets.');
    if (entry.name.endsWith('.html')) pages++;
    if (entry.name.endsWith('.js') && body.includes('retail_request')) bridge = true;
  }
}
scan(path.join(desktop, 'dist'));
assert.ok(pages >= 9 && bridge, 'Desktop routes or native request bridge are missing.');
console.log(`Verified ${pages} desktop pages, native bridge, restricted capabilities, CSP and no bundled server configuration.`);
