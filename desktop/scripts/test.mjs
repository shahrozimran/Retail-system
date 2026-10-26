import path from 'node:path';
import os from 'node:os';
import { fileURLToPath } from 'node:url';
import { execFileSync } from 'node:child_process';

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const cargo = path.join(os.homedir(), '.cargo/bin', process.platform === 'win32' ? 'cargo.exe' : 'cargo');
execFileSync(cargo, ['test', '--manifest-path', path.join(root, 'src-tauri/Cargo.toml'), '--release', '--', '--include-ignored'], { cwd: root, stdio: 'inherit' });
