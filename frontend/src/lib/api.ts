import { Capacitor } from '@capacitor/core';
import { prepareOperation, finishOperation } from './operations.ts';

const native = Capacitor.isNativePlatform();
const configuredOrigin = process.env.NEXT_PUBLIC_API_ORIGIN || '';
const origin = native && /^https:\/\/[^/?#]+$/.test(configuredOrigin) ? configuredOrigin : '';
export const API_URL = native ? origin : '/api';
export const PROXY = `${origin}/api/proxy/`;
const AUTH = `${origin}/api/auth/`;
let bearer = '';
let nativeRefresh = '';

export async function apiFetch(url: string, options: RequestInit = {}) {
  if (native && !origin) throw new Error('The secure API origin is not configured for this app.');
  const target = new URL(url, typeof window === 'undefined' ? 'http://localhost' : window.location.origin);
  const expected = new URL(origin || (typeof window === 'undefined' ? 'http://localhost' : window.location.origin));
  if (target.origin !== expected.origin || !['/api/proxy/', '/api/auth/'].includes(target.pathname)) throw new Error('Invalid API destination.');
  const headers = new Headers(options.headers);
  headers.set('X-Retail-Request', '1');
  if (native) {
    headers.set('X-Retail-Client', 'native');
    if (bearer) headers.set('Authorization', `Bearer ${bearer}`);
    if (nativeRefresh) headers.set('X-Retail-Refresh-Token', nativeRefresh);
  }
  let operationKey = '';
  if ((options.method || 'GET').toUpperCase() === 'POST' && target.pathname === '/api/proxy/') {
    const body = JSON.parse(String(options.body));
    const operation = await prepareOperation(body);
    operationKey = operation.key;
    options = { ...options, body: JSON.stringify(operation.payload) };
  }
  const response = await globalThis.fetch(url, { ...options, headers, credentials: native ? 'omit' : 'same-origin', cache: 'no-store', signal: options.signal || AbortSignal.timeout(30000) });
  if (native) {
    bearer = response.headers.get('x-retail-access-token') || bearer;
    nativeRefresh = response.headers.get('x-retail-refresh-token') || nativeRefresh;
  }
  if (operationKey) {
    try {
      const result = await response.clone().json();
      if (result.success === true || result.operationState === 'rolled_back') finishOperation(operationKey);
    } catch { /* Preserve the receipt after an uncertain response. */ }
  }
  if ((response.status === 401 || response.status === 403) && target.pathname !== '/api/auth/') {
    bearer = '';
    nativeRefresh = '';
    if (typeof window !== 'undefined') window.location.replace('/login/');
  }
  return response;
}

export async function login(email: string, password: string) {
  const response = await apiFetch(AUTH, { method: 'POST', body: JSON.stringify({ action: 'login', email, password }) });
  const data = await response.json();
  if (!response.ok || !data.success) throw new Error(data.message || 'Sign in failed.');
}

export async function hasSession() {
  if (native && !bearer && !nativeRefresh) return false;
  const response = await apiFetch(AUTH);
  const data = await response.json();
  if (response.status === 401) return false;
  if (!response.ok || !data.success) throw new Error(data.message || 'Session verification failed.');
  return true;
}

export async function logout() {
  const response = await apiFetch(AUTH, { method: 'POST', body: JSON.stringify({ action: 'logout' }) });
  const data = await response.json();
  if (!response.ok && response.status !== 401) throw new Error(data.message || 'Sign out failed.');
  bearer = '';
  nativeRefresh = '';
}
