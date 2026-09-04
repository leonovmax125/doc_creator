import { NextResponse } from 'next/server';
import { sql } from '@/lib/db';
import { verifyPassword } from '@/lib/auth/password';
import { createSession } from '@/lib/auth/session';

export const runtime = 'nodejs';

export async function POST(request: Request) {
  const body = await request.json().catch(() => null);
  const email = String(body?.email ?? '').trim().toLowerCase();
  const password = String(body?.password ?? '');

  if (!email || !password) {
    return NextResponse.json({ error: 'Введите почту и пароль' }, { status: 400 });
  }

  const rows = await sql<{ id: string; password_hash: string }[]>`
    select id, password_hash from users where email = ${email} limit 1
  `;
  const user = rows[0];
  // Проверяем пароль всегда (даже если пользователя нет) — чтобы по времени
  // ответа нельзя было определить, есть ли такая почта.
  const ok = user
    ? await verifyPassword(password, user.password_hash)
    : await verifyPassword(password, 'scrypt$00$00');

  if (!user || !ok) {
    return NextResponse.json({ error: 'Неверная почта или пароль' }, { status: 400 });
  }

  await createSession(user.id);
  return NextResponse.json({ ok: true });
}
