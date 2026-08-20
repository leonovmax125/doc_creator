import { NextResponse } from 'next/server';
import { sql } from '@/lib/db';
import { getCurrentUser } from '@/lib/auth/session';

export const runtime = 'nodejs';

/** Создаёт клиента. */
export async function POST(request: Request) {
  const user = await getCurrentUser();
  if (!user) return NextResponse.json({ error: 'Не авторизован' }, { status: 401 });

  const body = await request.json().catch(() => null);
  const name = String(body?.name ?? '').trim();
  if (!name) return NextResponse.json({ error: 'Укажите название клиента' }, { status: 400 });

  const country = String(body?.country ?? '').trim() || null;
  const contactPerson = String(body?.contact_person ?? '').trim() || null;
  const notes = String(body?.notes ?? '').trim() || null;

  const rows = await sql<{ id: string }[]>`
    insert into clients (user_id, name, country, contact_person, notes)
    values (${user.id}, ${name}, ${country}, ${contactPerson}, ${notes})
    returning id
  `;

  return NextResponse.json({ id: rows[0].id });
}
