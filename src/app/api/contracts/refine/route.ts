import { NextResponse } from 'next/server';
import { randomUUID } from 'node:crypto';
import { sql } from '@/lib/db';
import { getCurrentUser } from '@/lib/auth/session';
import { getObject, putObject, deleteObject } from '@/lib/storage/local';
import { fileUrl } from '@/lib/files';
import { generateJson, resolveGeminiKey, GEMINI_FLASH } from '@/lib/gemini';
import { buildPatchPrompt } from '@/lib/ai-prompts';
import { applyDocxPatch, type PatchEdit } from '@/lib/apply-docx-patch';
import { parseDocxToBlocks } from '@/lib/docx-to-blocks';
import { getMarkableUnits } from '@/lib/template-types';
import { sanitizeFilenamePart } from '@/lib/sanitize-filename';

export const runtime = 'nodejs';
export const maxDuration = 120;

type Requisite = { field_label: string; field_value: string };

/** Дорабатывает текущий .docx версии по инструкции, сохраняя оформление. */
export async function POST(request: Request) {
  const user = await getCurrentUser();
  if (!user) return NextResponse.json({ error: 'Не авторизован' }, { status: 401 });

  const { versionId, instruction: rawInstruction } = (await request.json()) as {
    versionId: string;
    instruction: string;
  };
  const instruction = (rawInstruction ?? '').trim();
  if (!versionId || !instruction) {
    return NextResponse.json({ error: 'Опишите, что поправить' }, { status: 400 });
  }

  const versionRows = await sql<
    { docx_path: string | null; client_id: string; client_name: string }[]
  >`
    select v.docx_path, c.client_id, cl.name as client_name
    from contract_versions v
    join cases c on c.id = v.case_id
    join clients cl on cl.id = c.client_id
    where v.id = ${versionId} and c.user_id = ${user.id}
    limit 1
  `;
  const version = versionRows[0];
  if (!version || !version.docx_path) {
    return NextResponse.json({ error: 'Версия не найдена' }, { status: 404 });
  }
  const clientName = version.client_name ?? 'клиент';

  const apiKey = await resolveGeminiKey(user.id);
  if (!apiKey) {
    return NextResponse.json(
      { error: 'Не задан ключ Gemini. Добавьте свой ключ в Настройках → Ключи ИИ.' },
      { status: 400 },
    );
  }

  const orgReqRows = await sql<Requisite[]>`
    select r.field_label, r.field_value from requisites r
    join organizations o on o.id = r.owner_id
    where r.owner_type = 'organization' and o.owner_id = ${user.id}
    order by r.sort_order
  `;
  const clientReqRows = await sql<Requisite[]>`
    select field_label, field_value from requisites
    where owner_type = 'client' and owner_id = ${version.client_id}
    order by sort_order
  `;
  const orgRequisites = orgReqRows.filter((r) => r.field_value);
  const clientRequisites = clientReqRows.filter((r) => r.field_value);

  let currentBuffer: Buffer;
  try {
    currentBuffer = await getObject('contracts', version.docx_path);
  } catch {
    return NextResponse.json({ error: 'Не удалось загрузить документ версии' }, { status: 500 });
  }

  let documentText: string;
  try {
    const blocks = await parseDocxToBlocks(currentBuffer);
    documentText = getMarkableUnits(blocks)
      .map((u) => u.text)
      .filter(Boolean)
      .join('\n');
  } catch {
    return NextResponse.json({ error: 'Не удалось прочитать документ' }, { status: 500 });
  }

  let edits: PatchEdit[];
  try {
    const prompt = buildPatchPrompt({ documentText, instruction, clientRequisites, orgRequisites });
    const raw = await generateJson(GEMINI_FLASH, prompt, apiKey);
    const list = (raw as { edits?: unknown }).edits;
    edits = Array.isArray(list) ? (list as PatchEdit[]) : [];
  } catch (err) {
    const message = err instanceof Error ? err.message : 'Не удалось обработать запрос';
    return NextResponse.json(
      { error: message.startsWith('ИИ') ? message : `ИИ не справился: ${message}` },
      { status: 502 },
    );
  }

  let patched: { buffer: Buffer; applied: number; skipped: string[] };
  try {
    patched = await applyDocxPatch(currentBuffer, edits);
  } catch {
    return NextResponse.json({ error: 'Не удалось применить правки' }, { status: 500 });
  }

  const storagePath = `${user.id}/${randomUUID()}.docx`;
  await putObject('contracts', storagePath, patched.buffer);

  let newBlocks;
  try {
    newBlocks = await parseDocxToBlocks(patched.buffer);
  } catch {
    newBlocks = null;
  }

  if (newBlocks) {
    await sql`
      update contract_versions set docx_path = ${storagePath}, blocks = ${sql.json(newBlocks)}
      where id = ${versionId}
    `;
  } else {
    await sql`update contract_versions set docx_path = ${storagePath} where id = ${versionId}`;
  }

  // Удаляем прежний файл, чтобы не копить мусор.
  await deleteObject('contracts', version.docx_path);

  const dateStr = new Date().toISOString().slice(0, 10);
  const filename = `Договор_${sanitizeFilenamePart(clientName)}_${dateStr}.docx`;

  return NextResponse.json({
    url: fileUrl('contracts', storagePath),
    filename,
    applied: patched.applied,
    skipped: patched.skipped,
  });
}
