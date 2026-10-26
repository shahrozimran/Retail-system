import fs from 'node:fs';
import path from 'node:path';
import os from 'node:os';
import { fileURLToPath } from 'node:url';
import { createRequire } from 'node:module';
import { execFileSync } from 'node:child_process';
import { createHash } from 'node:crypto';

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const require = createRequire(path.join(root, '../frontend/package.json'));
const cli = require.resolve('@tauri-apps/cli/tauri.js');
const keyConfig = path.join(root, 'private/signing.json');
const env = { ...process.env, PATH: path.join(os.homedir(), '.cargo/bin') + path.delimiter + process.env.PATH };
if (!process.argv.includes('--native-only')) execFileSync(process.execPath, [path.join(root, '../frontend/build-static.js'), '--desktop'], { cwd: root, stdio: 'inherit', env });
const built = JSON.parse(fs.readFileSync(path.join(root, 'dist/desktop-build.json'), 'utf8'));
if (built.origin !== fs.readFileSync(path.join(root, 'src-tauri/api-origin.txt'), 'utf8').trim()) throw new Error('Desktop API origin differs from the native bridge.');
if (fs.existsSync(keyConfig)) {
  const signing = JSON.parse(fs.readFileSync(keyConfig, 'utf8'));
  env.TAURI_SIGNING_PRIVATE_KEY = fs.readFileSync(path.join(root, 'private/updater.key'), 'utf8').trim();
  env.TAURI_SIGNING_PRIVATE_KEY_PASSWORD = signing.password;
}
const dev = process.argv.includes('--dev');
if (!dev && !env.TAURI_SIGNING_PRIVATE_KEY) throw new Error('Run npm run desktop:signing once before producing signed update artifacts.');
execFileSync(process.execPath, [cli, dev ? 'dev' : 'build', ...(dev ? [] : ['--bundles', 'nsis'])], { cwd: root, stdio: 'inherit', env });
if (!dev) {
  const bundle = path.join(root, 'src-tauri/target/release/bundle/nsis');
  const artifacts = path.join(root, 'artifacts');
  fs.mkdirSync(artifacts, { recursive: true });
  const config = JSON.parse(fs.readFileSync(path.join(root, 'src-tauri/tauri.conf.json'), 'utf8'));
  const version = config.version;
  const installer = `${config.productName}_${version}_x64-setup.exe`;
  for (const filename of [installer, installer + '.sig']) fs.copyFileSync(path.join(bundle, filename), path.join(artifacts, filename));
  const manifest = {
    version, notes: 'Global Auto Parts desktop release.', pub_date: new Date().toISOString(),
    platforms: { 'windows-x86_64': { signature: fs.readFileSync(path.join(bundle, installer + '.sig'), 'utf8').trim(), url: `https://github.com/shahrozimran/Retail-system/releases/download/desktop-v${version}/${encodeURIComponent(installer)}` } },
  };
  fs.writeFileSync(path.join(artifacts, 'latest.json'), JSON.stringify(manifest, null, 2) + '\n');
  const checksums = [installer, installer + '.sig', 'latest.json'].map(name => createHash('sha256').update(fs.readFileSync(path.join(artifacts, name))).digest('hex') + '  ' + name).join('\n');
  fs.writeFileSync(path.join(artifacts, 'SHA256SUMS.txt'), checksums + '\n');
  console.log(`Desktop installer and signature: ${artifacts}`);
}
