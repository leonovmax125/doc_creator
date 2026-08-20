import { NextResponse } from 'next/server';
import { sql } from '@/lib/db';
import { hashPassword } from '@/lib/auth/password';
import { createSession } from '@/lib/auth/session';

export const runtime = 'nodejs';

const ADMIN_EMAIL = (process.env.ADMIN_EMAIL || 'leonovmax126@gmail.com').toLowerCase();

/** Регистрация по коду приглашения: проверка кода → создание пользователя →
 *  погашение кода → вход. Всё в одной транзакции. */
export async function POST(request: Request) {
  const body = await request.json().catch(() => null);
  const fullName = String(body?.fullName ?? '').trim();
  const email = String(body?.email ?? '').trim().toLowerCase();
  const password = String(body?.password ?? '');
  const code = String(body?.inviteCode ?? '').trim();

  if (!fullName || !email || !password || !code) {
    return NextResponse.json({ error: 'Заполните все поля' }, { status: 400 });
  }
  if (password.length < 6) {
    return NextResponse.json({ error: 'Пароль должен быть не короче 6 символов' }, { status: 400 });
  }

  const codeRows = await sql`select code from invite_codes where code = ${code} and is_used = false limit 1`;
  if (codeRows.length === 0) {
    return NextResponse.json(
      { error: 'Код приглашения недействителен или уже использован' },
      { status: 400 },
    );
  }

  const existing = await sql`select id from users where email = ${email} limit 1`;
  if (existing.length > 0) {
    return NextResponse.json(
      { error: 'Пользователь с такой почтой уже зарегистрирован' },
      { status: 400 },
    );
  }

  const passwordHash = await hashPassword(password);
  const isAdmin = email === ADMIN_EMAIL;

  let userId: string;
  try {
    userId = await sql.begin(async (tx) => {
      const inserted = await tx`
        insert into users (email, password_hash, full_name, is_admin)
        values (${email}, ${passwordHash}, ${fullName}, ${isAdmin})
        returning id
      `;
      const uid = inserted[0].id as string;
      // Условие is_used = false в UPDATE защищает от гонки двух регистраций
      // по одному коду.
      const upd = await tx`
        update invite_codes set is_used = true, used_by = ${uid}
        where code = ${code} and is_used = false
      `;
      if (upd.count === 0) throw new Error('invite_used');
      return uid;
    });
  } catch (err) {
    if (err instanceof Error && err.message === 'invite_used') {
      return NextResponse.json(
        { error: 'Код приглашения только что использовали. Попросите новый.' },
        { status: 400 },
      );
    }
    throw err;
  }

  await createSession(userId);
  return NextResponse.json({ ok: true });
}
