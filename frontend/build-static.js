import { execFileSync } from 'node:child_process';
import { createHash } from 'node:crypto';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { createRequire } from 'node:module';
import nextEnv from '@next/env';
const __dirname = path.dirname(fileURLToPath(import.meta.url));
const nodeRequire = createRequire(import.meta.url);

async function build() {
  const desktop = process.argv.includes('--desktop');
  const { staticCsp } = await import('./security-headers.mjs');
  nextEnv.loadEnvConfig(__dirname);
  const origin = process.env.NEXT_PUBLIC_API_ORIGIN || '';
  if (!origin || !/^https:\/\/[^/?#]+$/.test(origin)) throw new Error('Set NEXT_PUBLIC_API_ORIGIN to the hosted HTTPS Next server before a native build.');
  const moves = [['src/app/api', 'src/api-temp'], ['src/proxy.ts', 'src/proxy.disabled']];
  const moved = [];
  try {
    for (const [source, temporary] of moves) {
      const from = path.join(__dirname, source), to = path.join(__dirname, temporary);
      if (fs.existsSync(to)) throw new Error(`Temporary build path already exists: ${temporary}`);
      if (fs.existsSync(from)) { fs.renameSync(from, to); moved.push([from, to]); }
    }
    execFileSync(process.execPath, [nodeRequire.resolve('next/dist/bin/next'), 'build'], {
      cwd: __dirname, stdio: 'inherit', env: { ...process.env, CAPACITOR_BUILD: '1', NEXT_PUBLIC_APP_PLATFORM: desktop ? 'desktop' : 'android', NEXT_PUBLIC_DESKTOP_VERSION: desktop ? JSON.parse(fs.readFileSync(path.resolve(__dirname, '../desktop/src-tauri/tauri.conf.json'), 'utf8')).version : '' },
    });
    function secure(directory) {
      for (const entry of fs.readdirSync(directory, { withFileTypes: true })) {
        const file = path.join(directory, entry.name);
        if (entry.isDirectory()) secure(file);
        else if (entry.name.endsWith('.html')) {
          let html = fs.readFileSync(file, 'utf8');
          const hashes = [];
          for (const match of html.matchAll(/<script\b([^>]*)>([\s\S]*?)<\/script>/gi)) {
            if (!/\bsrc\s*=/i.test(match[1])) hashes.push(`'sha256-${createHash('sha256').update(match[2]).digest('base64')}'`);
          }
          const policy = staticCsp([...new Set(hashes)], origin).replace(/&/g, '&amp;').replace(/"/g, '&quot;');
          html = html.replace(/<head>/i, `<head><meta http-equiv="Content-Security-Policy" content="${policy}"><meta name="referrer" content="no-referrer">`);
          fs.writeFileSync(file, html);
        }
      }
    }
    if (desktop) {
      // Tauri adds its own IPC policy and hashes the bundled hydration scripts.
      // Android's separate meta policy would block Tauri's injected IPC bridge.
      const output = path.resolve(__dirname, '../desktop/dist');
      if (path.relative(path.resolve(__dirname, '..'), output) !== path.join('desktop', 'dist')) throw new Error('Invalid desktop output path.');
      fs.rmSync(output, { recursive: true, force: true });
      fs.mkdirSync(output, { recursive: true });
      fs.cpSync(path.join(__dirname, 'out'), output, { recursive: true, force: true });
      fs.writeFileSync(path.join(output, 'desktop-build.json'), JSON.stringify({ origin, platform: 'desktop' }));
    } else secure(path.join(__dirname, 'out'));
  } finally {
    for (const [source, temporary] of moved.reverse()) fs.renameSync(temporary, source);
  }
}

build().catch(error => { console.error(error.message); process.exitCode = 1; });
