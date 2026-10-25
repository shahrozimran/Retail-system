export function webCsp(nonce, development = false) {
  return [
    "default-src 'self'", `script-src 'self' 'nonce-${nonce}' 'strict-dynamic'${development ? " 'unsafe-eval'" : ''}`,
    "style-src 'self' 'unsafe-inline'", "img-src 'self' data: blob:", "font-src 'self'",
    `connect-src 'self'${development ? ' ws: wss:' : ''}`, "object-src 'none'", "base-uri 'none'",
    "form-action 'self'", "frame-ancestors 'none'", ...(!development ? ['upgrade-insecure-requests'] : []),
  ].join('; ');
}

export function staticCsp(hashes, origin = '') {
  if (origin && !/^https:\/\/[^/?#]+$/.test(origin)) throw new Error('NEXT_PUBLIC_API_ORIGIN must be an HTTPS origin.');
  return ["default-src 'self'", `script-src 'self' ${hashes.join(' ')}`, "style-src 'self' 'unsafe-inline'", "img-src 'self' data: blob:", "font-src 'self'", `connect-src 'self'${origin ? ' ' + origin : ''}`, "object-src 'none'", "base-uri 'none'", "form-action 'self'"].join('; ');
}

export const securityHeaders = {
  'X-Content-Type-Options': 'nosniff',
  'X-Frame-Options': 'DENY',
  'Referrer-Policy': 'no-referrer',
  'Permissions-Policy': 'camera=(), microphone=(), geolocation=(), payment=(), usb=()',
  'Cross-Origin-Opener-Policy': 'same-origin',
};
