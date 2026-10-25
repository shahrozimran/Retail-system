import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import bcrypt from 'bcryptjs';
import { buildAdminSql } from './admin-sql.mjs';

const directory = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '../private');
let input = '';
if (process.stdin.isTTY) throw new Error('Provide credentials through piped standard input; interactive password echo is disabled.');
process.stdin.setEncoding('utf8');
for await (const chunk of process.stdin) {
  input += chunk;
  if (input.length > 8192) throw new Error('Credential input is too large.');
  if (input.includes('\n')) break;
}
let credentials;
try { credentials = JSON.parse(input); } catch { throw new Error('Provide one JSON object with email and password on standard input.'); }
const { email, password } = credentials;
if (typeof password !== 'string' || password.length < 8 || password.length > 72) throw new Error('Use an 8 to 72 character password.');
const sql = buildAdminSql(email, await bcrypt.hash(password, 12));
fs.mkdirSync(directory, { recursive: true });
fs.writeFileSync(path.join(directory, 'admin-bootstrap.sql'), sql, { mode: 0o600 });
console.log('Private admin bootstrap created at supabase/private/admin-bootstrap.sql. No plaintext password was saved.');
