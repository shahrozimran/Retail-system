import { NextResponse } from 'next/server';
import type { NextRequest } from 'next/server';
import { webCsp, securityHeaders } from '../security-headers.mjs';

export default function proxy(request: NextRequest) {
  const nonce = Buffer.from(crypto.getRandomValues(new Uint8Array(16))).toString('base64');
  const development = process.env.NODE_ENV !== 'production';
  const csp = webCsp(nonce, development);
  const headers = new Headers(request.headers);
  headers.set('x-nonce', nonce);
  headers.set('Content-Security-Policy', csp);
  const response = NextResponse.next({ request: { headers } });
  response.headers.set('Content-Security-Policy', csp);
  for (const [name, value] of Object.entries(securityHeaders)) response.headers.set(name, value);
  if (!development) response.headers.set('Strict-Transport-Security', 'max-age=31536000');
  response.headers.set('Cache-Control', 'private, no-store');
  return response;
}

export const config = { matcher: ['/((?!_next/static|_next/image|favicon.ico).*)'] };
