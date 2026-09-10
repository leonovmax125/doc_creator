import { NextResponse } from 'next/server';
import { createClient } from '@/lib/supabase/server';
import { generateJson, resolveGeminiSettings } from '@/lib/gemini';
import { buildAutoMarkupPrompt } from '@/lib/ai-prompts';
import { applyAutoMarkup, type AutoMarkupProposal } from '@/lib/auto-markup';
import { getMarkableUnits, normalizeBlocks, type TemplateField } from '@/lib/template-types';

export const runtime = 'nodejs';
export const maxDuration = 120;

export async function POST(request: Request) {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) return NextResponse.json({ error: 'Не авторизован' }, { status: 401 });

  const { templateId } = (await request.json()) as { templateId?: string };
  if (!templateId) return NextResponse.json({ error: 'Не указан шаблон' }, { status: 400 });

  const { data: template } = await supabase
    .from('templates')
    .select('id, blocks, fields')
    .eq('id', templateId)
    .single();
  if (!template) return NextResponse.json({ error: 'Шаблон не найден' }, { status: 404 });

  const blocks = normalizeBlocks(template.blocks);
  // Пропускаем пустые и уже размеченные (с плейсхолдерами) фрагменты.
  const units = getMarkableUnits(blocks).filter(
    (u) => u.text.trim() && !/\{\{[^}]+\}\}/.test(u.text),
  );
  if (units.length === 0) {
    return NextResponse.json({ error: 'В шаблоне нет текста для разметки' }, { status: 400 });
  }

  // Реквизиты организации и (агрегированно) клиентов — чтобы ИИ привязал поля.
  const { data: organization } = await supabase.from('organizations').select('id').single();
  const { data: orgRequisites } = organization
    ? await supabase
        .from('requisites')
        .select('field_key, field_label')
        .eq('owner_type', 'organization')
        .eq('owner_id', organization.id)
    : { data: [] };

  const { data: clients } = await supabase.from('clients').select('id');
  const clientIds = (clients ?? []).map((c) => c.id);
  let clientRequisites: { field_key: string; field_label: string }[] = [];
  if (clientIds.length > 0) {
    const { data } = await supabase
      .from('requisites')
      .select('field_key, field_label')
      .eq('owner_type', 'client')
      .in('owner_id', clientIds);
    const seen = new Map<string, string>();
    for (const row of data ?? []) if (!seen.has(row.field_key)) seen.set(row.field_key, row.field_label);
    clientRequisites = Array.from(seen, ([field_key, field_label]) => ({ field_key, field_label }));
  }

  const { apiKey, model } = await resolveGeminiSettings(supabase);
  if (!apiKey) {
    return NextResponse.json(
      { error: 'Не задан ключ Gemini. Добавьте свой ключ в Настройках → Ключи ИИ.' },
      { status: 400 },
    );
  }

  let proposals: AutoMarkupProposal[];
  try {
    const prompt = buildAutoMarkupPrompt({
      units: units.map((u) => ({ unit_id: u.id, text: u.text })),
      orgRequisites: orgRequisites ?? [],
      clientRequisites,
    });
    const raw = await generateJson(model, prompt, apiKey);
    const arr = (raw as { fields?: unknown })?.fields;
    proposals = Array.isArray(arr) ? (arr as AutoMarkupProposal[]) : [];
  } catch (err) {
    const message = err instanceof Error ? err.message : 'не удалось получить ответ';
    return NextResponse.json({ error: `ИИ не смог разметить шаблон: ${message}` }, { status: 502 });
  }

  const result = applyAutoMarkup(
    blocks,
    (template.fields ?? []) as TemplateField[],
    proposals,
    orgRequisites ?? [],
    clientRequisites,
  );

  const { error: updateError } = await supabase
    .from('templates')
    .update({ blocks: result.blocks, fields: result.fields })
    .eq('id', templateId);
  if (updateError) {
    return NextResponse.json({ error: 'Не удалось сохранить разметку' }, { status: 500 });
  }

  return NextResponse.json({ blocks: result.blocks, fields: result.fields, added: result.added });
}
