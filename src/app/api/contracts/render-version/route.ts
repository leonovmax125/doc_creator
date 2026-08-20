import { NextResponse } from 'next/server';
import { randomUUID } from 'node:crypto';
import { sql } from '@/lib/db';
import { getCurrentUser } from '@/lib/auth/session';
import { putObject } from '@/lib/storage/local';
import { fileUrl } from '@/lib/files';
import { buildDocxFromBlocks } from '@/lib/build-docx';
import { sanitizeFilenamePart } from '@/lib/sanitize-filename';
import { normalizeBlocks } from '@/lib/template-types';

export const runtime = 'nodejs';

/** Пере-собирает .docx текущей версии из её (возможно отредактированных) блоков. */
export async function POST(request: Request) {
  const user = await getCurrentUser();
  if (!user) return NextResponse.json({ error: 'Не авторизован' }, { status: 401 });

  const { versionId, blocks: rawBlocks } = (await request.json()) as {
    versionId: string;
    blocks: unknown;
  };

  const rows = await sql<{ client_name: string }[]>`
    select cl.name as client_name
    from contract_versions v
    join cases c on c.id = v.case_id
    join clients cl on cl.id = c.client_id
    where v.id = ${versionId} and c.user_id = ${user.id}
    limit 1
  `;
  if (!rows[0]) return NextResponse.json({ error: 'Версия не найдена' }, { status: 404 });

  const blocks = normalizeBlocks(rawBlocks);
  if (blocks.length === 0) {
    return NextResponse.json({ error: 'Документ пуст' }, { status: 400 });
  }

  let buffer: Buffer;
  try {
    buffer = await buildDocxFromBlocks(blocks);
  } catch {
    return NextResponse.json({ error: 'Не удалось собрать документ' }, { status: 500 });
  }

  const storagePath = `${user.id}/${randomUUID()}.docx`;
  await putObject('contracts', storagePath, buffer);

  await sql`
    update contract_versions set blocks = ${sql.json(blocks)}, docx_path = ${storagePath}
    where id = ${versionId}
  `;

  const dateStr = new Date().toISOString().slice(0, 10);
  const filename = `Договор_${sanitizeFilenamePart(rows[0].client_name ?? 'клиент')}_${dateStr}.docx`;

  return NextResponse.json({ url: fileUrl('contracts', storagePath), filename });
}
