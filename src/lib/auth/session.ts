import 'server-only';
import { randomBytes } from 'node:crypto';
import { cookies } from 'next/headers';
import { sql } from '@/lib/db';
import { SESSION_COOKIE } from './constants';

// Сессии на стороне сервера: непубличный token в httpOnly-cookie + строка в
// таблице sessions. Заменяет Supabase Auth. Чужую сессию подделать нельзя —
// token случайный (256 бит) и сверяется с БД.

const COOKIE = SESSION_COOKIE;
const MAX_AGE_SECONDS = 60 * 60 * 24 * 30; // 30 дней

export type SessionUser = {
  id: string;
  email: string;
  full_name: string;
  is_admin: boolean;
};

/** Создаёт сессию для пользователя и ставит cookie. */
export async function createSession(userId: string): Promise<void> {
  const token = randomBytes(32).toString('hex');
  const expiresAt = new Date(Date.now() + MAX_AGE_SECONDS * 1000);
  await sql`
    insert into sessions (token, user_id, expires_at)
    values (${token}, ${userId}, ${expiresAt})
  `;
  const store = await cookies();
  store.set(COOKIE, token, {
    httpOnly: true,
    sameSite: 'lax',
    secure: process.env.NODE_ENV === 'production',
    path: '/',
    maxAge: MAX_AGE_SECONDS,
  });
}

/** Удаляет текущую сессию (выход). */
export async function destroySession(): Promise<void> {
  const store = await cookies();
  const token = store.get(COOKIE)?.value;
  if (token) await sql`delete from sessions where token = ${token}`;
  store.delete(COOKIE);
}

/** Текущий пользователь по cookie, либо null. Просроченные сессии игнорируются. */
export async function getCurrentUser(): Promise<SessionUser | null> {
  const store = await cookies();
  const token = store.get(COOKIE)?.value;
  if (!token) return null;

  const rows = await sql<SessionUser[]>`
    select u.id, u.email, u.full_name, u.is_admin
    from sessions s
    join users u on u.id = s.user_id
    where s.token = ${token} and s.expires_at > now()
    limit 1
  `;
  return rows[0] ?? null;
}

/** Как getCurrentUser, но бросает — для защищённых серверных мест. */
export async function requireUser(): Promise<SessionUser> {
  const user = await getCurrentUser();
  if (!user) throw new Error('Не авторизован');
  return user;
}

export { SESSION_COOKIE };
