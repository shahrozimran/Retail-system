import { createClient, type SupabaseClient } from '@supabase/supabase-js';
import { ApiError, refreshToken, sessionToken } from './server.ts';

export function supabaseConfig() {
  const url = process.env.SUPABASE_URL || '';
  const key = process.env.SUPABASE_PUBLISHABLE_KEY || '';
  let parsed: URL;
  try { parsed = new URL(url); } catch { throw new ApiError('Supabase is not configured.', 503, 'CONFIGURATION_ERROR'); }
  const local = process.env.NODE_ENV !== 'production' && ['localhost', '127.0.0.1'].includes(parsed.hostname);
  let validKey = /^sb_publishable_[A-Za-z0-9_-]+$/.test(key);
  if (!validKey && key.split('.').length === 3) {
    try { validKey = JSON.parse(Buffer.from(key.split('.')[1], 'base64url').toString()).role === 'anon'; } catch { /* Invalid legacy public key. */ }
  }
  if ((!local && parsed.protocol !== 'https:') || !['', '/'].includes(parsed.pathname) || parsed.search || parsed.hash || parsed.username || parsed.password || !validKey) throw new ApiError('Supabase is not configured.', 503, 'CONFIGURATION_ERROR');
  return { url: parsed.origin, key };
}

export function supabaseClient(accessToken?: string) {
  const { url, key } = supabaseConfig();
  return createClient(url, key, {
    auth: { persistSession: false, autoRefreshToken: false, detectSessionInUrl: false },
    global: {
      ...(accessToken ? { headers: { Authorization: `Bearer ${accessToken}` } } : {}),
      fetch: (input, init) => globalThis.fetch(input, { ...init, signal: init?.signal || AbortSignal.timeout(20000) }),
    },
  });
}

type BackendError = { code?: string; status?: number; message?: string };
export function databaseError(error: BackendError): ApiError {
  if (error.code === '42501' || error.code === 'PGRST301' || error.code === 'PGRST303') return new ApiError('This account is not authorized.', 403, 'FORBIDDEN');
  let result: ApiError;
  if (error.code === '23503') result = new ApiError('This record is referenced by business history or another record.', 409, 'CONFLICT');
  else if (error.code === '23505') result = new ApiError('The identifier or SKU is already in use, or stock has changed. Refresh and check the record.', 409, 'CONFLICT');
  else if (error.code === '23514' || error.code === '22003') result = new ApiError('A quantity, balance, or amount exceeds its allowed range.', 400);
  else if (error.code === '22023') result = new ApiError(error.message || 'Invalid request.', 400);
  else if (error.code?.startsWith('22')) result = new ApiError('Invalid request value.', 400);
  else return new ApiError('The database is unavailable. Retry the same operation after checking its status.', 503, 'DATABASE_UNAVAILABLE');
  // PostgreSQL rolls the entire RPC statement back on these errors.
  result.rolledBack = true;
  return result;
}

export async function rpc(client: SupabaseClient, name: string, parameters: Record<string, unknown> = {}) {
  const { data, error } = await client.rpc(name, parameters);
  if (error) throw databaseError(error);
  if (!data || data.success !== true) throw new ApiError('The database returned an invalid response.', 503, 'DATABASE_UNAVAILABLE');
  return data;
}

export type UserSession = {
  client: SupabaseClient;
  accessToken: string;
  refreshToken: string;
  expiresIn: number;
  refreshed: boolean;
  native: boolean;
};

export async function requireSession(request: Request): Promise<UserSession> {
  let access = '';
  try { access = sessionToken(request); } catch (error) { if (!(error instanceof ApiError) || error.status !== 401) throw error; }
  let refresh = refreshToken(request);
  if (!access && !refresh) throw new ApiError('Please sign in.', 401, 'UNAUTHORIZED');
  const auth = supabaseClient();
  let valid = false;
  if (access) {
    const { data, error } = await auth.auth.getUser(access);
    if (error && (!error.status || error.status >= 500)) throw new ApiError('Session verification is temporarily unavailable.', 503, 'AUTH_UNAVAILABLE');
    valid = !!data.user && !error;
  }
  let expiresIn = 3600;
  let refreshed = false;
  if (!valid) {
    if (!refresh) throw new ApiError('Please sign in.', 401, 'UNAUTHORIZED');
    const { data, error } = await auth.auth.refreshSession({ refresh_token: refresh });
    if (error || !data.session) {
      if (error && (!error.status || error.status >= 500 || error.status === 429)) throw new ApiError('Session refresh is temporarily unavailable.', error.status === 429 ? 429 : 503, 'AUTH_UNAVAILABLE');
      throw new ApiError('Your session has expired. Please sign in.', 401, 'UNAUTHORIZED');
    }
    access = data.session.access_token;
    refresh = data.session.refresh_token;
    expiresIn = data.session.expires_in;
    refreshed = true;
  }
  const client = supabaseClient(access);
  // The SQL check also verifies the current auth.sessions row, so signing out
  // removes access even while an old access JWT has not reached its expiry.
  await rpc(client, 'retail_session');
  return { client, accessToken: access, refreshToken: refresh, expiresIn, refreshed, native: request.headers.get('x-retail-client') === 'native' };
}

export async function signIn(email: unknown, password: unknown) {
  if (typeof email !== 'string' || typeof password !== 'string' || email.length > 254 || password.length < 1 || password.length > 1024 || !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email.trim())) throw new ApiError('Invalid email or password.', 401, 'UNAUTHORIZED');
  const auth = supabaseClient();
  const { data, error } = await auth.auth.signInWithPassword({ email: email.trim().toLowerCase(), password });
  if (error || !data.session) {
    if (error?.status === 429) throw new ApiError('Too many sign-in attempts. Try again later.', 429, 'RATE_LIMITED');
    if (error && (!error.status || error.status >= 500)) throw new ApiError('Sign in is temporarily unavailable.', 503, 'AUTH_UNAVAILABLE');
    throw new ApiError('Invalid email or password.', 401, 'UNAUTHORIZED');
  }
  const client = supabaseClient(data.session.access_token);
  try { await rpc(client, 'retail_session'); }
  catch (error) {
    // Revoke this just-created session when it does not belong to the admin.
    await auth.auth.signOut({ scope: 'local' }).catch(() => {});
    throw error;
  }
  return data.session;
}

export async function signOut(accessToken: string) {
  // Auth's logout endpoint accepts the user's JWT; no service-role key is used.
  const { error } = await supabaseClient().auth.admin.signOut(accessToken, 'local');
  if (error && error.status !== 401 && error.status !== 403 && error.status !== 404) throw new ApiError('Sign out could not be completed. Please try again.', 503, 'AUTH_UNAVAILABLE');
}
