export const ACCESS_COOKIE = 'retail_access';
export const REFRESH_COOKIE = 'retail_refresh';
export const REFRESH_SECONDS = 7 * 24 * 60 * 60;
export const READ_ACTIONS = new Set(['dashboard', 'products', 'transactions', 'reports', 'productions', 'customers', 'customer_ledger', 'raw_materials']);
export const WRITE_ACTIONS = new Set(['transaction', 'batch_transaction', 'update_transaction', 'delete_transaction', 'update_transaction_batch', 'delete_transaction_batch', 'add_product', 'update_product', 'delete_product', 'process_production', 'add_customer', 'record_customer_payment', 'delete_customer', 'add_raw_material', 'update_raw_material', 'delete_raw_material']);

export class ApiError extends Error {
  status: number;
  code: string;
  rolledBack = false;
  constructor(message: string, status = 400, code = 'INVALID_REQUEST') { super(message); this.status = status; this.code = code; }
}

export async function readJson(request: Request, limit = 65536): Promise<Record<string, unknown>> {
  if (!request.body) throw new ApiError('Request body is required.');
  const reader = request.body.getReader();
  let size = 0;
  const chunks: Uint8Array[] = [];
  while (true) {
    const { done, value } = await reader.read();
    if (done) break;
    size += value.byteLength;
    if (size > limit) { await reader.cancel(); throw new ApiError('Request is too large.', 413); }
    chunks.push(value);
  }
  try {
    const value = JSON.parse(Buffer.concat(chunks).toString('utf8'));
    if (!value || typeof value !== 'object' || Array.isArray(value)) throw new Error();
    return value;
  } catch { throw new ApiError('A JSON object is required.'); }
}

export function checkOrigin(request: Request, mutation = false) {
  const configured = process.env.APP_ORIGIN;
  if (process.env.NODE_ENV === 'production' && (!configured || !configured.startsWith('https://'))) throw new ApiError('Server configuration is incomplete.', 503);
  const expected = new URL(configured || request.url).origin;
  const origin = request.headers.get('origin');
  const native = request.headers.get('x-retail-client') === 'native';
  const nativeOrigins = new Set((process.env.NATIVE_ORIGINS || 'https://localhost,capacitor://localhost').split(',').map(s => s.trim()));
  if (request.headers.get('sec-fetch-site') === 'cross-site' && !native) throw new ApiError('Request origin is not allowed.', 403);
  if (origin && origin !== expected && !(native && nativeOrigins.has(origin))) throw new ApiError('Request origin is not allowed.', 403);
  if (mutation && request.headers.get('x-retail-request') !== '1') throw new ApiError('Request verification failed.', 403);
  if (mutation && !native && origin !== expected) throw new ApiError('Request origin is not allowed.', 403);
}

export function cookieValue(request: Request, name: string) {
  return request.headers.get('cookie')?.split(';').map(c => c.trim()).find(c => c.startsWith(name + '='))?.slice(name.length + 1) || '';
}

export function sessionToken(request: Request): string {
  const native = request.headers.get('x-retail-client') === 'native';
  const authorization = request.headers.get('authorization');
  const token = native || authorization ? authorization?.replace(/^Bearer /, '') : cookieValue(request, ACCESS_COOKIE);
  if (!token || token.length > 8192 || !/^[A-Za-z0-9_-]+\.[A-Za-z0-9_-]+\.[A-Za-z0-9_-]+$/.test(token)) throw new ApiError('Please sign in.', 401, 'UNAUTHORIZED');
  return token;
}

export function refreshToken(request: Request): string {
  const native = request.headers.get('x-retail-client') === 'native' || !!request.headers.get('authorization');
  const token = native ? request.headers.get('x-retail-refresh-token') || '' : cookieValue(request, REFRESH_COOKIE);
  return /^[A-Za-z0-9._~-]{8,1024}$/.test(token) ? token : '';
}
