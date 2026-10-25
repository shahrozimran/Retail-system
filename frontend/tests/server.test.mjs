import test from 'node:test';
import assert from 'node:assert/strict';
import { checkOrigin, sessionToken, refreshToken, readJson } from '../src/lib/server.ts';
import { webCsp, staticCsp, securityHeaders } from '../security-headers.mjs';

test('cookie forgery and malformed bearer tokens cannot represent a session', () => {
  assert.throws(() => sessionToken(new Request('https://retail.example/api/proxy/', { headers: { cookie: 'auth_token=true' } })));
  assert.throws(() => sessionToken(new Request('https://retail.example/api/proxy/', { headers: { authorization: 'Bearer true' } })));
  const token = 'header.payload.signature';
  assert.equal(sessionToken(new Request('https://retail.example/api/proxy/', { headers: { cookie: `retail_access=${token}` } })), token);
});

test('mutation CSRF guard rejects foreign origin, missing origin and simple form requests', () => {
  process.env.APP_ORIGIN = 'https://retail.example';
  const request = headers => new Request('https://retail.example/api/auth/', { method: 'POST', headers });
  assert.throws(() => checkOrigin(request({ origin: 'https://evil.example', 'x-retail-request': '1' }), true));
  assert.throws(() => checkOrigin(request({ 'x-retail-request': '1' }), true));
  assert.throws(() => checkOrigin(request({ origin: 'https://retail.example' }), true));
  assert.doesNotThrow(() => checkOrigin(request({ origin: 'https://retail.example', 'x-retail-request': '1' }), true));
  assert.doesNotThrow(() => checkOrigin(request({ origin: 'https://localhost', 'x-retail-client': 'native', 'x-retail-request': '1' }), true));
  assert.throws(() => checkOrigin(request({ origin: 'https://evil.example', 'x-retail-client': 'native', 'x-retail-request': '1' }), true));
});

test('body limits are enforced on streamed bytes; only objects accepted', async () => {
  const request = body => new Request('https://retail.example/', { method: 'POST', body });
  await assert.rejects(readJson(request('x'.repeat(101)), 100));
  for (const body of ['null', '[]', '"string"', '{']) await assert.rejects(readJson(request(body)));
  assert.deepEqual(await readJson(request('{"action":"login"}')), { action: 'login' });
});

test('native transport never reuses browser cookies or exposes refresh values from them', () => {
  const request = new Request('https://retail.example/', {headers: {'x-retail-client':'native',cookie:'retail_access=header.payload.signature; retail_refresh=web-refresh-token'}});
  assert.throws(() => sessionToken(request));
  assert.equal(refreshToken(request),'');
});

test('production CSP rejects arbitrary inline scripts, framing, objects and external connections', () => {
  const csp = webCsp('test-nonce', false);
  assert.match(csp, /script-src 'self' 'nonce-test-nonce' 'strict-dynamic'/);
  assert.doesNotMatch(csp, /unsafe-eval/);
  assert.match(csp, /frame-ancestors 'none'/);
  assert.match(csp, /object-src 'none'/);
  assert.equal(securityHeaders['X-Content-Type-Options'], 'nosniff');
  const staticPolicy = staticCsp(["'sha256-testhash'"], 'https://retail.example');
  assert.match(staticPolicy, /sha256-testhash/);
  assert.doesNotMatch(staticPolicy.split(';').find(v => v.trim().startsWith('script-src')), /unsafe-inline/);
  assert.throws(() => staticCsp([], 'http://evil.example'));
});
