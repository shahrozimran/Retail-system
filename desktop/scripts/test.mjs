import path from 'node:path';
import os from 'node:os';
import { fileURLToPath } from 'node:url';
import { execFileSync } from 'node:child_process';

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const cargo = path.join(os.homedir(), '.cargo/bin', process.platform === 'win32' ? 'cargo.exe' : 'cargo');
const liveLogin = process.argv.includes('--login');
execFileSync(cargo, ['test', '--manifest-path', path.join(root, 'src-tauri/Cargo.toml'), '--release', '--', ...(liveLogin ? ['--ignored', 'hosted_admin_login_read_and_logout'] : ['--include-ignored', '--skip', 'hosted_admin_login_read_and_logout'])], { cwd: root, stdio: 'inherit' });
