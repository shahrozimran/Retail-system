import { NextRequest, NextResponse } from 'next/server';
import { ApiError, checkOrigin, readJson } from '@/lib/server';
import { requireSession, signIn, signOut, type UserSession } from '@/lib/supabase';
import { clearSession, writeSession } from '@/lib/auth-cookies';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

async function handle(request: NextRequest) {
  let activeSession: UserSession | undefined;
  try {
    checkOrigin(request, request.method !== 'GET');
    if (request.method === 'GET') {
      const session = await requireSession(request);
      const response = NextResponse.json({ success: true }, { headers: { 'Cache-Control': 'private, no-store' } });
      return session.refreshed ? writeSession(response, session) : response;
    }
    const payload = await readJson(request, 4096);
    if (payload.action === 'logout') {
      if (Object.keys(payload).some(key => key !== 'action')) throw new ApiError('Unknown authentication field.');
      activeSession = await requireSession(request);
      await signOut(activeSession.accessToken);
      return clearSession(NextResponse.json({ success: true }, { headers: { 'Cache-Control': 'no-store' } }));
    }
    if (payload.action !== 'login' || Object.keys(payload).some(key => !['action', 'email', 'password'].includes(key))) throw new ApiError('Unknown authentication action or field.');
    const session = await signIn(payload.email, payload.password);
    const response = NextResponse.json({ success: true, expiresIn: session.expires_in }, { headers: { 'Cache-Control': 'no-store' } });
    return writeSession(response, { accessToken: session.access_token, refreshToken: session.refresh_token, expiresIn: session.expires_in, native: request.headers.get('x-retail-client') === 'native' });
  } catch (error) {
    const safe = error instanceof ApiError ? error : new ApiError('Authentication could not be completed.', 503, 'AUTH_UNAVAILABLE');
    const response = NextResponse.json({ success: false, message: safe.message, code: safe.code }, { status: safe.status, headers: { 'Cache-Control': 'no-store', ...(safe.status === 429 ? { 'Retry-After': '60' } : {}) } });
    if (safe.status === 401 || safe.status === 403) return clearSession(response);
    return activeSession?.refreshed ? writeSession(response, activeSession) : response;
  }
}

export const GET = handle;
export const POST = handle;
