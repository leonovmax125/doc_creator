import { NextResponse } from 'next/server';
import { sql } from '@/lib/db';
import { hashPassword } from '@/lib/auth/password';
import { getCurrentUser } from '@/lib/auth/session';

export const runtime = 'nodejs';

/** Смена пароля вошедшим пользователем (Настройки → Профиль). */
export async function POST(request: Request) {
  const user = await getCurrentUser();
  if (!user) return NextResponse.json({ error: 'Не авторизован' }, { status: 401 });

  const body = await request.json().catch(() => null);
  const password = String(body?.password ?? '');
  if (password.length < 6) {
    return NextResponse.json({ error: 'Пароль должен быть не короче 6 символов' }, { status: 400 });
  }

  const passwordHash = await hashPassword(password);
  await sql`update users set password_hash = ${passwordHash} where id = ${user.id}`;
  return NextResponse.json({ ok: true });
}
