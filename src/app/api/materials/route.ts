import { NextResponse } from 'next/server';
import { randomUUID } from 'node:crypto';
import { sql } from '@/lib/db';
import { getCurrentUser } from '@/lib/auth/session';
import { putObject } from '@/lib/storage/local';
import { extractText } from '@/lib/extract-text';
import { MATERIAL_TYPES, type MaterialType } from '@/lib/material-types';

export const runtime = 'nodejs';

export async function POST(request: Request) {
  const user = await getCurrentUser();
  if (!user) return NextResponse.json({ error: 'Не авторизован' }, { status: 401 });

  const formData = await request.formData();
  const name = formData.get('name');
  const typeRaw = formData.get('type');
  const tagsRaw = formData.get('tags');
  const contentText = formData.get('content_text');
  const file = formData.get('file');

  if (typeof name !== 'string' || !name.trim()) {
    return NextResponse.json({ error: 'Укажите название материала' }, { status: 400 });
  }

  const type: MaterialType = MATERIAL_TYPES.includes(typeRaw as MaterialType)
    ? (typeRaw as MaterialType)
    : 'other';

  const tags =
    typeof tagsRaw === 'string'
      ? tagsRaw.split(',').map((t) => t.trim()).filter(Boolean)
      : [];

  let content = typeof contentText === 'string' ? contentText : '';
  let filePath: string | null = null;

  if (file instanceof File && file.size > 0) {
    const buffer = Buffer.from(await file.arrayBuffer());

    let extracted = '';
    try {
      extracted = await extractText(buffer, file.name);
    } catch (err) {
      const message = err instanceof Error ? err.message : 'Не удалось разобрать файл';
      return NextResponse.json({ error: message }, { status: 400 });
    }

    const ext = file.name.slice(file.name.lastIndexOf('.')) || '';
    filePath = `${user.id}/${randomUUID()}${ext}`;
    await putObject('materials', filePath, buffer);

    // Текст из файла дополняет введённый вручную (если тот был).
    content = [content, extracted].filter(Boolean).join('\n\n').trim();
  }

  const rows = await sql<{ id: string }[]>`
    insert into materials (user_id, name, type, content_text, file_path, tags)
    values (${user.id}, ${name.trim()}, ${type}, ${content}, ${filePath}, ${tags})
    returning id
  `;

  return NextResponse.json({ id: rows[0].id });
}
