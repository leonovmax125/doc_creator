import { NextResponse } from 'next/server';
import { sql } from '@/lib/db';
import { getCurrentUser } from '@/lib/auth/session';
import { getObject } from '@/lib/storage/local';
import { generateJson, resolveGeminiKey, GEMINI_FLASH } from '@/lib/gemini';
import { buildPatchPrompt } from '@/lib/ai-prompts';
import { applyDocxPatch, type PatchEdit } from '@/lib/apply-docx-patch';
import { parseDocxToBlocks } from '@/lib/docx-to-blocks';
import { saveContractVersion } from '@/lib/save-contract';
import { getMarkableUnits, normalizeBlocks, unmarkTemplate, type TemplateField } from '@/lib/template-types';

export const runtime = 'nodejs';
export const maxDuration = 120;

type Body = {
  clientId: string;
  caseTitle?: string | null;
  caseId?: string | null;
  templateId?: string | null;
  instruction?: string;
  materialIds?: string[];
};

type Requisite = { field_label: string; field_value: string };

export async function POST(request: Request) {
  const user = await getCurrentUser();
  if (!user) return NextResponse.json({ error: 'Не авторизован' }, { status: 401 });

  const body = (await request.json()) as Body;
  const { clientId } = body;
  const instruction = (body.instruction ?? '').trim();

  if (!clientId) return NextResponse.json({ error: 'Не выбран клиент' }, { status: 400 });
  if (!body.templateId || !instruction) {
    return NextResponse.json({ error: 'Выберите шаблон и опишите правку' }, { status: 400 });
  }

  const clientRows = await sql<{ id: string; name: string }[]>`
    select id, name from clients where id = ${clientId} and user_id = ${user.id} limit 1
  `;
  const client = clientRows[0];
  if (!client) return NextResponse.json({ error: 'Клиент не найден' }, { status: 404 });

  const templateRows = await sql<{ blocks: unknown; fields: unknown; source_file_path: string }[]>`
    select blocks, fields, source_file_path from templates
    where id = ${body.templateId} and user_id = ${user.id} limit 1
  `;
  const template = templateRows[0];
  if (!template) return NextResponse.json({ error: 'Шаблон не найден' }, { status: 404 });

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
    where owner_type = 'client' and owner_id = ${clientId}
    order by sort_order
  `;
  const orgRequisites = orgReqRows.filter((r) => r.field_value);
  const clientRequisites = clientReqRows.filter((r) => r.field_value);

  const materials: { name: string; content: string }[] = [];
  const materialIds = (body.materialIds ?? []).filter(Boolean);
  if (materialIds.length > 0) {
    const rows = await sql<{ name: string; content_text: string }[]>`
      select name, content_text from materials
      where user_id = ${user.id} and id = any(${materialIds})
    `;
    for (const row of rows) {
      if (row.content_text) materials.push({ name: row.name, content: row.content_text });
    }
  }

  let templateBuffer: Buffer;
  try {
    templateBuffer = await getObject('templates', template.source_file_path);
  } catch {
    return NextResponse.json({ error: 'Не удалось загрузить файл шаблона' }, { status: 500 });
  }

  const realBlocks = unmarkTemplate(
    normalizeBlocks(template.blocks),
    (template.fields ?? []) as TemplateField[],
  );
  const documentText = getMarkableUnits(realBlocks)
    .map((u) => u.text)
    .filter(Boolean)
    .join('\n');

  let edits: PatchEdit[];
  try {
    const prompt = buildPatchPrompt({
      documentText,
      instruction,
      materials,
      clientRequisites,
      orgRequisites,
    });
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
    patched = await applyDocxPatch(templateBuffer, edits);
  } catch {
    return NextResponse.json({ error: 'Не удалось применить правки к документу' }, { status: 500 });
  }

  let blocks;
  try {
    blocks = await parseDocxToBlocks(patched.buffer);
  } catch {
    blocks = realBlocks;
  }

  const result = await saveContractVersion(user.id, {
    clientId,
    clientName: client.name,
    mode: 'assisted',
    templateId: body.templateId,
    blocks,
    data: { instruction, materialIds },
    docxBuffer: patched.buffer,
    caseId: body.caseId ?? null,
    caseTitle: body.caseTitle ?? null,
  });

  if (!result.ok) return NextResponse.json({ error: result.error }, { status: 500 });

  const warnings =
    patched.skipped.length > 0
      ? [`Некоторые правки не удалось применить: ${patched.skipped.join('; ')}`]
      : [];

  return NextResponse.json({
    url: result.url,
    filename: result.filename,
    caseId: result.caseId,
    versionId: result.versionId,
    versionNumber: result.versionNumber,
    warnings,
  });
}
