import { NextResponse } from 'next/server';
import { randomBytes } from 'node:crypto';
import { sql } from '@/lib/db';
import { sendMail } from '@/lib/mail';

export const runtime = 'nodejs';

/** Отправляет письмо со ссылкой на смену пароля. Всегда отвечает 200, чтобы по
 *  ответу нельзя было узнать, есть ли такая почта в системе. */
export async function POST(request: Request) {
  const body = await request.json().catch(() => null);
  const email = String(body?.email ?? '').trim().toLowerCase();
  if (!email) return NextResponse.json({ ok: true });

  const rows = await sql<{ id: string }[]>`select id from users where email = ${email} limit 1`;
  const user = rows[0];

  if (user) {
    const token = randomBytes(32).toString('hex');
    const expiresAt = new Date(Date.now() + 60 * 60 * 1000); // 1 час
    await sql`
      insert into password_reset_tokens (token, user_id, expires_at)
      values (${token}, ${user.id}, ${expiresAt})
    `;

    const appUrl = process.env.APP_URL || new URL(request.url).origin;
    const link = `${appUrl}/reset-password?token=${token}`;

    await sendMail({
      to: email,
      subject: 'Смена пароля — Договоры',
      text: `Чтобы задать новый пароль, перейдите по ссылке (действует 1 час):\n${link}\n\nЕсли вы не запрашивали смену пароля — просто проигнорируйте это письмо.`,
      html: `<p>Чтобы задать новый пароль, перейдите по ссылке (действует 1&nbsp;час):</p>
<p><a href="${link}">${link}</a></p>
<p>Если вы не запрашивали смену пароля — просто проигнорируйте это письмо.</p>`,
    });
  }

  return NextResponse.json({ ok: true });
}
