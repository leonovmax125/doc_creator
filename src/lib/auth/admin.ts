import 'server-only';
import { NextResponse } from 'next/server';
import { getCurrentUser, type SessionUser } from './session';

/** Возвращает пользователя-админа либо готовый ответ-ошибку для route. */
export async function requireAdmin(): Promise<
  { user: SessionUser } | { error: NextResponse }
> {
  const user = await getCurrentUser();
  if (!user) return { error: NextResponse.json({ error: 'Не авторизован' }, { status: 401 }) };
  if (!user.is_admin) return { error: NextResponse.json({ error: 'Нужны права администратора' }, { status: 403 }) };
  return { user };
}
