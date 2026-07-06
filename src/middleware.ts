// Route guard: redirects unauthenticated visitors to /login.
// Full HMAC session validation happens server-side; this checks cookie presence only.
import { NextRequest, NextResponse } from 'next/server';

const PUBLIC = ['/login', '/signup', '/api/auth/login', '/api/auth/signup'];

export function middleware(req: NextRequest) {
  const { pathname } = req.nextUrl;
  if (PUBLIC.some((p) => pathname.startsWith(p)) || pathname.startsWith('/_next')) return NextResponse.next();
  if (!req.cookies.get('prospect_session')?.value) {
    if (pathname.startsWith('/api/')) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
    return NextResponse.redirect(new URL('/login', req.url));
  }
  return NextResponse.next();
}

export const config = { matcher: ['/((?!_next/static|_next/image|favicon.ico).*)'] };
