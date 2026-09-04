import { NextResponse } from 'next/server';
import { randomUUID } from 'node:crypto';
import { sql } from '@/lib/db';
import { getCurrentUser } from '@/lib/auth/session';
import { putObject } from '@/lib/storage/local';
import { fileUrl } from '@/lib/files';

export const runtime = 'nodejs';

/** Загружает подпись/печать (PNG) и создаёт запись. */
export async function POST(request: Request) {
  const user = await getCurrentUser();
  if (!user) return NextResponse.json({ error: 'Не авторизован' }, { status: 401 });

  const formData = await request.formData();
  const file = formData.get('file');
  const name = String(formData.get('name') ?? '').trim();
  const type = String(formData.get('type') ?? '');

  if (!(file instanceof File) || file.size === 0 || !name || !['signature', 'stamp'].includes(type)) {
    return NextResponse.json({ error: 'Укажите название, тип и файл' }, { status: 400 });
  }

  const path = `${user.id}/${randomUUID()}.png`;
  const buffer = Buffer.from(await file.arrayBuffer());
  await putObject('stamps', path, buffer);

  const inserted = await sql`
    insert into stamps (user_id, name, type, file_path)
    values (${user.id}, ${name}, ${type}, ${path})
    returning id, name, type, file_path
  `;
  const row = inserted[0];

  return NextResponse.json({
    stamp: { id: row.id, name: row.name, type: row.type, signedUrl: fileUrl('stamps', row.file_path) },
  });
}
