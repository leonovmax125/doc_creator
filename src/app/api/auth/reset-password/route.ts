import { NextResponse } from 'next/server';
import { sql } from '@/lib/db';
import { hashPassword } from '@/lib/auth/password';
import { createSession } from '@/lib/auth/session';

export const runtime = 'nodejs';

/** Задаёт новый пароль по одноразовому токену из письма и сразу выполняет вход. */
export async function POST(request: Request) {
  const body = await request.json().catch(() => null);
  const token = String(body?.token ?? '').trim();
  const password = String(body?.password ?? '');

  if (!token) {
    return NextResponse.json({ error: 'Нет токена. Откройте ссылку из письма.' }, { status: 400 });
  }
  if (password.length < 6) {
    return NextResponse.json({ error: 'Пароль должен быть не короче 6 символов' }, { status: 400 });
  }

  const rows = await sql<{ user_id: string }[]>`
    select user_id from password_reset_tokens
    where token = ${token} and used = false and expires_at > now()
    limit 1
  `;
  const row = rows[0];
  if (!row) {
    return NextResponse.json(
      { error: 'Ссылка недействительна или устарела. Запросите новое письмо.' },
      { status: 400 },
    );
  }

  const passwordHash = await hashPassword(password);
  await sql.begin(async (tx) => {
    await tx`update users set password_hash = ${passwordHash} where id = ${row.user_id}`;
    await tx`update password_reset_tokens set used = true where token = ${token}`;
    // Завершаем прежние сессии пользователя — на случай, если пароль меняют
    // из-за компрометации.
    await tx`delete from sessions where user_id = ${row.user_id}`;
  });

  await createSession(row.user_id);
  return NextResponse.json({ ok: true });
}
