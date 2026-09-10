import { NextResponse } from 'next/server';
import { createClient } from '@/lib/supabase/server';
import { generateJson, resolveGeminiSettings } from '@/lib/gemini';
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
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) return NextResponse.json({ error: 'Не авторизован' }, { status: 401 });

  const { versionId, instruction: rawInstruction } = (await request.json()) as {
    versionId: string;
    instruction: string;
  };
  const instruction = (rawInstruction ?? '').trim();
  if (!versionId || !instruction) {
    return NextResponse.json({ error: 'Опишите, что поправить' }, { status: 400 });
  }

  const { data: version } = await supabase
    .from('contract_versions')
    .select('id, docx_path, case:cases(client_id, title, client:clients(name))')
    .eq('id', versionId)
    .single();
  if (!version || !version.docx_path) {
    return NextResponse.json({ error: 'Версия не найдена' }, { status: 404 });
  }

  const caseRow = (Array.isArray(version.case) ? version.case[0] : version.case) as
    | { client_id: string; title: string; client: { name: string } | { name: string }[] | null }
    | null;
  const client = caseRow
    ? ((Array.isArray(caseRow.client) ? caseRow.client[0] : caseRow.client) as { name: string } | null)
    : null;
  const clientName = client?.name ?? 'клиент';

  const { apiKey, model } = await resolveGeminiSettings(supabase);
  if (!apiKey) {
    return NextResponse.json(
      { error: 'Не задан ключ Gemini. Добавьте свой ключ в Настройках → Ключи ИИ.' },
      { status: 400 },
    );
  }

  // Реквизиты сторон — на случай, если правка просит подставить данные.
  const { data: organization } = await supabase.from('organizations').select('id').single();
  const { data: orgReqRows } = organization
    ? await supabase
        .from('requisites')
        .select('field_label, field_value')
        .eq('owner_type', 'organization')
        .eq('owner_id', organization.id)
        .order('sort_order')
    : { data: [] };
  const { data: clientReqRows } = caseRow
    ? await supabase
        .from('requisites')
        .select('field_label, field_value')
        .eq('owner_type', 'client')
        .eq('owner_id', caseRow.client_id)
        .order('sort_order')
    : { data: [] };
  const orgRequisites = ((orgReqRows ?? []) as Requisite[]).filter((r) => r.field_value);
  const clientRequisites = ((clientReqRows ?? []) as Requisite[]).filter((r) => r.field_value);

  // Текущий .docx версии — его и патчим.
  const { data: file, error: downloadError } = await supabase.storage
    .from('contracts')
    .download(version.docx_path);
  if (downloadError || !file) {
    return NextResponse.json({ error: 'Не удалось загрузить документ версии' }, { status: 500 });
  }
  const currentBuffer = Buffer.from(await file.arrayBuffer());

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
    patched = await applyDocxPatch(currentBuffer, edits);
  } catch {
    return NextResponse.json({ error: 'Не удалось применить правки' }, { status: 500 });
  }

  // Обновляем документ версии на месте (рабочий черновик).
  const storagePath = `${user.id}/${crypto.randomUUID()}.docx`;
  const { error: uploadError } = await supabase.storage
    .from('contracts')
    .upload(storagePath, patched.buffer, {
      contentType: 'application/vnd.openxmlformats-officedocument.wordprocessingml.document',
    });
  if (uploadError) {
    return NextResponse.json({ error: 'Не удалось сохранить документ' }, { status: 500 });
  }

  let newBlocks;
  try {
    newBlocks = await parseDocxToBlocks(patched.buffer);
  } catch {
    newBlocks = null;
  }

  await supabase
    .from('contract_versions')
    .update({ docx_path: storagePath, ...(newBlocks ? { blocks: newBlocks } : {}) })
    .eq('id', versionId);

  // Удаляем прежний файл, чтобы не копить мусор в хранилище.
  await supabase.storage.from('contracts').remove([version.docx_path]);

  const dateStr = new Date().toISOString().slice(0, 10);
  const filename = `Договор_${sanitizeFilenamePart(clientName)}_${dateStr}.docx`;
  const { data: signed } = await supabase.storage
    .from('contracts')
    .createSignedUrl(storagePath, 3600);

  return NextResponse.json({
    url: signed?.signedUrl ?? null,
    filename,
    applied: patched.applied,
    skipped: patched.skipped,
  });
}
