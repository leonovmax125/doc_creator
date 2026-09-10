import { NextResponse } from 'next/server';
import { createClient } from '@/lib/supabase/server';
import { generateJson, resolveGeminiSettings } from '@/lib/gemini';
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
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) return NextResponse.json({ error: 'Не авторизован' }, { status: 401 });

  const body = (await request.json()) as Body;
  const { clientId } = body;
  const instruction = (body.instruction ?? '').trim();

  if (!clientId) return NextResponse.json({ error: 'Не выбран клиент' }, { status: 400 });
  if (!body.templateId || !instruction) {
    return NextResponse.json({ error: 'Выберите шаблон и опишите правку' }, { status: 400 });
  }

  const { data: client } = await supabase.from('clients').select('id, name').eq('id', clientId).single();
  if (!client) return NextResponse.json({ error: 'Клиент не найден' }, { status: 404 });

  const { data: template } = await supabase
    .from('templates')
    .select('blocks, fields, source_file_path')
    .eq('id', body.templateId)
    .single();
  if (!template) return NextResponse.json({ error: 'Шаблон не найден' }, { status: 404 });

  const { apiKey, model } = await resolveGeminiSettings(supabase);
  if (!apiKey) {
    return NextResponse.json(
      { error: 'Не задан ключ Gemini. Добавьте свой ключ в Настройках → Ключи ИИ.' },
      { status: 400 },
    );
  }

  // Реквизиты сторон — чтобы ИИ мог подставить данные клиента.
  const { data: organization } = await supabase.from('organizations').select('id').single();
  const { data: orgReqRows } = organization
    ? await supabase
        .from('requisites')
        .select('field_label, field_value')
        .eq('owner_type', 'organization')
        .eq('owner_id', organization.id)
        .order('sort_order')
    : { data: [] };
  const { data: clientReqRows } = await supabase
    .from('requisites')
    .select('field_label, field_value')
    .eq('owner_type', 'client')
    .eq('owner_id', clientId)
    .order('sort_order');
  const orgRequisites = ((orgReqRows ?? []) as Requisite[]).filter((r) => r.field_value);
  const clientRequisites = ((clientReqRows ?? []) as Requisite[]).filter((r) => r.field_value);

  // Материалы.
  const materials: { name: string; content: string }[] = [];
  if ((body.materialIds ?? []).length > 0) {
    const { data: rows } = await supabase
      .from('materials')
      .select('name, content_text')
      .in('id', body.materialIds as string[]);
    for (const row of rows ?? []) {
      if (row.content_text) materials.push({ name: row.name, content: row.content_text });
    }
  }

  // Исходный .docx — его и патчим, чтобы сохранить оформление.
  const { data: templateFile, error: downloadError } = await supabase.storage
    .from('templates')
    .download(template.source_file_path);
  if (downloadError || !templateFile) {
    return NextResponse.json({ error: 'Не удалось загрузить файл шаблона' }, { status: 500 });
  }
  const templateBuffer = Buffer.from(await templateFile.arrayBuffer());

  // Текст договора для модели — реальный (плейсхолдеры разметки подставляем обратно).
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
    const raw = await generateJson(model, prompt, apiKey);
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

  // Блоки готового документа — для предпросмотра и дальнейшего редактирования.
  let blocks;
  try {
    blocks = await parseDocxToBlocks(patched.buffer);
  } catch {
    blocks = realBlocks;
  }

  const result = await saveContractVersion(supabase, user.id, {
    clientId,
    clientName: client.name,
    mode: 'assisted',
    templateId: body.templateId,
    blocks,
    data: { instruction, materialIds: body.materialIds ?? [] },
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
