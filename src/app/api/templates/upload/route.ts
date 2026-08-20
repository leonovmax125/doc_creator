import { NextResponse } from 'next/server';
import { randomUUID } from 'node:crypto';
import { sql } from '@/lib/db';
import { getCurrentUser } from '@/lib/auth/session';
import { putObject } from '@/lib/storage/local';
import { parseDocxToBlocks } from '@/lib/docx-to-blocks';

export const runtime = 'nodejs';

export async function POST(request: Request) {
  const user = await getCurrentUser();
  if (!user) return NextResponse.json({ error: 'Не авторизован' }, { status: 401 });

  const formData = await request.formData();
  const file = formData.get('file');
  const name = formData.get('name');
  const category = formData.get('category');

  if (!(file instanceof File) || typeof name !== 'string' || !name.trim()) {
    return NextResponse.json({ error: 'Не хватает данных для загрузки' }, { status: 400 });
  }

  const buffer = Buffer.from(await file.arrayBuffer());
  const path = `${user.id}/${randomUUID()}.docx`;
  await putObject('templates', path, buffer);

  let blocks;
  try {
    blocks = await parseDocxToBlocks(buffer);
  } catch {
    return NextResponse.json({ error: 'Не удалось разобрать документ' }, { status: 500 });
  }

  const rows = await sql<{ id: string }[]>`
    insert into templates (user_id, name, category, source_file_path, blocks, fields)
    values (
      ${user.id},
      ${name.trim()},
      ${typeof category === 'string' && category.trim() ? category.trim() : null},
      ${path},
      ${sql.json(blocks)},
      ${sql.json([])}
    )
    returning id
  `;

  return NextResponse.json({ id: rows[0].id });
}
