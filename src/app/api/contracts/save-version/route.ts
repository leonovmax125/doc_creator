import { NextResponse } from 'next/server';
import { sql } from '@/lib/db';
import { getCurrentUser } from '@/lib/auth/session';
import { buildDocxFromBlocks } from '@/lib/build-docx';
import { saveContractVersion } from '@/lib/save-contract';
import { normalizeBlocks } from '@/lib/template-types';

export const runtime = 'nodejs';

/** Сохраняет текущие блоки как НОВУЮ версию в том же деле (v+1). */
export async function POST(request: Request) {
  const user = await getCurrentUser();
  if (!user) return NextResponse.json({ error: 'Не авторизован' }, { status: 401 });

  const { caseId, blocks: rawBlocks } = (await request.json()) as {
    caseId: string;
    blocks: unknown;
  };

  const rows = await sql<{ client_id: string; client_name: string }[]>`
    select c.client_id, cl.name as client_name
    from cases c
    join clients cl on cl.id = c.client_id
    where c.id = ${caseId} and c.user_id = ${user.id}
    limit 1
  `;
  if (!rows[0]) return NextResponse.json({ error: 'Дело не найдено' }, { status: 404 });

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

  const result = await saveContractVersion(user.id, {
    clientId: rows[0].client_id,
    clientName: rows[0].client_name ?? 'клиент',
    mode: 'generative',
    templateId: null,
    blocks,
    data: { editedInBlockEditor: true },
    docxBuffer: buffer,
    caseId,
  });

  if (!result.ok) return NextResponse.json({ error: result.error }, { status: 500 });

  return NextResponse.json({
    url: result.url,
    filename: result.filename,
    versionNumber: result.versionNumber,
  });
}
