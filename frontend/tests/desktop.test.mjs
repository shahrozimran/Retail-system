import test, { after } from 'node:test';
import assert from 'node:assert/strict';
import { mockIPC, clearMocks } from '@tauri-apps/api/mocks';

process.env.NEXT_PUBLIC_APP_PLATFORM = 'desktop';
process.env.NEXT_PUBLIC_API_ORIGIN = 'https://retail-system-chi.vercel.app';
const previousWindow = globalThis.window;
const previousFetch = globalThis.fetch;
globalThis.window = { crypto: globalThis.crypto, location: { origin: 'http://tauri.localhost', replace() {} } };
const calls = [];
let fail = false;
mockIPC((command, args) => {
  calls.push({ command, args });
  if (command !== 'retail_request') return true;
  if (fail) { fail = false; throw new Error('Network response lost'); }
  const login = args.request.body && JSON.parse(args.request.body).action === 'login';
  return { status: 200, body: JSON.stringify({ success: true }), headers: login ? { 'x-retail-access-token': 'test.jwt.signature', 'x-retail-refresh-token': 'test-refresh-token' } : {} };
});
globalThis.fetch = async () => { throw new Error('WebView fetch must not carry desktop API requests.'); };
const { apiFetch, login, logout, PROXY } = await import('../src/lib/api.ts');
const { saveDesktopInvoice } = await import('../src/lib/desktop.ts');
after(() => { clearMocks(); globalThis.window = previousWindow; globalThis.fetch = previousFetch; });

test('desktop login and requests use the bounded Rust bridge and in-memory tokens, preserving lost-response receipts', async () => {
  await login('test@example.invalid', 'dummy-test-password');
  assert.equal(calls[0].command, 'retail_request');
  assert.equal(calls[0].args.request.url, 'https://retail-system-chi.vercel.app/api/auth/');
  await apiFetch(PROXY + '?action=products');
  assert.equal(calls.at(-1).args.request.accessToken, 'test.jwt.signature');
  assert.equal(calls.at(-1).args.request.refreshToken, 'test-refresh-token');
  const options = { method: 'POST', body: JSON.stringify({ action: 'add_customer', name: 'Test only' }) };
  fail = true;
  await assert.rejects(apiFetch(PROXY, options), /Network response lost/);
  const receipt = JSON.parse(calls.at(-1).args.request.body).requestId;
  await apiFetch(PROXY, options);
  assert.equal(JSON.parse(calls.at(-1).args.request.body).requestId, receipt);
  await assert.rejects(apiFetch('https://evil.example/api/proxy/'), /Invalid API destination/);
  await logout();
  await apiFetch(PROXY + '?action=products');
  assert.equal(calls.at(-1).args.request.accessToken, null);
  assert.equal(calls.at(-1).args.request.refreshToken, null);
});

test('desktop invoices use native save/preview commands instead of browser downloads', async () => {
  const pdf = new TextEncoder().encode('%PDF-1.7 test').buffer;
  await saveDesktopInvoice(pdf, 'INV-test.pdf');
  assert.equal(calls.at(-1).command, 'save_invoice');
  assert.equal(calls.at(-1).args.filename, 'INV-test.pdf');
  await saveDesktopInvoice(pdf, 'INV-test.pdf', true);
  assert.equal(calls.at(-1).command, 'print_invoice');
});
