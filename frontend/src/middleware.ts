import { NextResponse } from 'next/server'
import type { NextRequest } from 'next/server'

export function middleware(request: NextRequest) {
  const authToken = request.cookies.get('auth_token')
  const { pathname } = request.nextUrl

  // Define public paths that don't require authentication
  const isPublicPath = pathname === '/login'
  
  // Define protected paths (exclude static files and public paths)
  const isStaticFile = pathname.startsWith('/_next') || 
                       pathname.startsWith('/api') || 
                       pathname.includes('.') ||
                       pathname === '/favicon.ico'

  if (isStaticFile) {
    return NextResponse.next()
  }

  // Redirect logic
  if (!authToken && !isPublicPath) {
    // If no token and trying to access protected route -> login
    return NextResponse.redirect(new URL('/login', request.url))
  }

  if (authToken && isPublicPath) {
    // If has token and trying to access login -> dashboard
    return NextResponse.redirect(new URL('/', request.url))
  }

  return NextResponse.next()
}

// See "Matching Paths" below to learn more
export const config = {
  matcher: [
    /*
     * Match all request paths except for the ones starting with:
     * - api (API routes)
     * - _next/static (static files)
     * - _next/image (image optimization files)
     * - favicon.ico (favicon file)
     */
    '/((?!api|_next/static|_next/image|favicon.ico).*)',
  ],
}
