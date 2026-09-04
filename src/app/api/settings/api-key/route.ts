import { NextResponse } from 'next/server';
import { sql } from '@/lib/db';
import { getCurrentUser } from '@/lib/auth/session';

export const runtime = 'nodejs';

/** Сохраняет личный ключ Gemini. */
export async function PUT(request: Request) {
  const user = await getCurrentUser();
  if (!user) return NextResponse.json({ error: 'Не авторизован' }, { status: 401 });

  const body = await request.json().catch(() => null);
  const key = String(body?.key ?? '').trim();
  if (!key) return NextResponse.json({ error: 'Пустой ключ' }, { status: 400 });

  await sql`
    insert into user_settings (user_id, gemini_api_key, updated_at)
    values (${user.id}, ${key}, now())
    on conflict (user_id) do update set gemini_api_key = ${key}, updated_at = now()
  `;
  return NextResponse.json({ ok: true });
}

/** Удаляет личный ключ Gemini. */
export async function DELETE() {
  const user = await getCurrentUser();
  if (!user) return NextResponse.json({ error: 'Не авторизован' }, { status: 401 });

  await sql`
    insert into user_settings (user_id, gemini_api_key, updated_at)
    values (${user.id}, null, now())
    on conflict (user_id) do update set gemini_api_key = null, updated_at = now()
  `;
  return NextResponse.json({ ok: true });
}
