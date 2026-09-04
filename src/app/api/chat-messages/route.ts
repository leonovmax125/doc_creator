import { NextResponse } from 'next/server';
import { sql } from '@/lib/db';
import { getCurrentUser } from '@/lib/auth/session';
import { ownsVersion } from '@/lib/auth/owns';

export const runtime = 'nodejs';

/** Сохраняет сообщение чата ИИ внутри версии договора. */
export async function POST(request: Request) {
  const user = await getCurrentUser();
  if (!user) return NextResponse.json({ error: 'Не авторизован' }, { status: 401 });

  const body = await request.json().catch(() => null);
  const versionId = String(body?.versionId ?? '');
  const role = body?.role;
  const content = String(body?.content ?? '');

  if (!versionId || !['user', 'assistant'].includes(role) || !content) {
    return NextResponse.json({ error: 'Неверные данные' }, { status: 400 });
  }
  if (!(await ownsVersion(user.id, versionId))) {
    return NextResponse.json({ error: 'Нет доступа' }, { status: 403 });
  }

  const rows = await sql<{ id: string; role: 'user' | 'assistant'; content: string }[]>`
    insert into chat_messages (version_id, role, content)
    values (${versionId}, ${role}, ${content})
    returning id, role, content
  `;

  return NextResponse.json({ message: rows[0] });
}
