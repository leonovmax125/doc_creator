import { NextResponse, type NextRequest } from 'next/server';
import { SESSION_COOKIE } from './constants';

// Middleware работает в Edge-окружении и не может ходить в Postgres, поэтому
// здесь только быстрая проверка НАЛИЧИЯ cookie сессии — для перенаправлений.
// Настоящую проверку сессии (валидна ли она) делают серверные страницы через
// getCurrentUser: даже с поддельной cookie данные не отдадутся.

export function updateSession(request: NextRequest): NextResponse {
  const hasSession = request.cookies.has(SESSION_COOKIE);
  const { pathname } = request.nextUrl;

  const isAuthPage = pathname === '/login' || pathname === '/register';
  const isProtectedPage = pathname.startsWith('/dashboard');

  if (!hasSession && isProtectedPage) {
    const url = request.nextUrl.clone();
    url.pathname = '/login';
    return NextResponse.redirect(url);
  }

  if (hasSession && isAuthPage) {
    const url = request.nextUrl.clone();
    url.pathname = '/dashboard';
    return NextResponse.redirect(url);
  }

  return NextResponse.next();
}
