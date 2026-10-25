import type { NextResponse } from 'next/server';
import { ACCESS_COOKIE, REFRESH_COOKIE, REFRESH_SECONDS } from './server.ts';
import type { UserSession } from './supabase.ts';

export function writeSession(response: NextResponse, session: Pick<UserSession, 'accessToken' | 'refreshToken' | 'expiresIn' | 'native'>) {
  response.headers.set('Cache-Control', 'private, no-store');
  if (session.native) {
    response.headers.set('X-Retail-Access-Token', session.accessToken);
    response.headers.set('X-Retail-Refresh-Token', session.refreshToken);
  } else {
    const options = { httpOnly: true, secure: process.env.NODE_ENV === 'production', sameSite: 'strict' as const, path: '/' };
    response.cookies.set(ACCESS_COOKIE, session.accessToken, { ...options, maxAge: Math.min(session.expiresIn, 3600) });
    response.cookies.set(REFRESH_COOKIE, session.refreshToken, { ...options, maxAge: REFRESH_SECONDS });
  }
  return response;
}

export function clearSession(response: NextResponse) {
  const options = { httpOnly: true, secure: process.env.NODE_ENV === 'production', sameSite: 'strict' as const, path: '/', maxAge: 0 };
  response.cookies.set(ACCESS_COOKIE, '', options);
  response.cookies.set(REFRESH_COOKIE, '', options);
  response.cookies.set('retail_session', '', options);
  return response;
}
