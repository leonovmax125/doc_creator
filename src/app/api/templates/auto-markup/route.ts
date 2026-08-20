import { NextResponse } from 'next/server';
import { sql } from '@/lib/db';
import { getCurrentUser } from '@/lib/auth/session';
import { ownsTemplate } from '@/lib/auth/owns';
import { generateJson, resolveGeminiKey, GEMINI_FLASH } from '@/lib/gemini';
import { buildAutoMarkupPrompt } from '@/lib/ai-prompts';
import { applyAutoMarkup, type AutoMarkupProposal } from '@/lib/auto-markup';
import { getMarkableUnits, normalizeBlocks, type TemplateField } from '@/lib/template-types';

export const runtime = 'nodejs';
export const maxDuration = 120;

type RequisiteOption = { field_key: string; field_label: string };

export async function POST(request: Request) {
  const user = await getCurrentUser();
  if (!user) return NextResponse.json({ error: 'Не авторизован' }, { status: 401 });

  const { templateId } = (await request.json()) as { templateId?: string };
  if (!templateId) return NextResponse.json({ error: 'Не указан шаблон' }, { status: 400 });
  if (!(await ownsTemplate(user.id, templateId))) {
    return NextResponse.json({ error: 'Нет доступа' }, { status: 403 });
  }

  const templateRows = await sql<{ blocks: unknown; fields: unknown }[]>`
    select blocks, fields from templates where id = ${templateId} limit 1
  `;
  const template = templateRows[0];
  if (!template) return NextResponse.json({ error: 'Шаблон не найден' }, { status: 404 });

  const blocks = normalizeBlocks(template.blocks);
  // Пропускаем пустые и уже размеченные (с плейсхолдерами) фрагменты.
  const units = getMarkableUnits(blocks).filter(
    (u) => u.text.trim() && !/\{\{[^}]+\}\}/.test(u.text),
  );
  if (units.length === 0) {
    return NextResponse.json({ error: 'В шаблоне нет текста для разметки' }, { status: 400 });
  }

  const orgRequisites = await sql<RequisiteOption[]>`
    select r.field_key, r.field_label from requisites r
    join organizations o on o.id = r.owner_id
    where r.owner_type = 'organization' and o.owner_id = ${user.id}
  `;
  const clientRequisites = await sql<RequisiteOption[]>`
    select distinct on (r.field_key) r.field_key, r.field_label
    from requisites r
    join clients c on c.id = r.owner_id
    where r.owner_type = 'client' and c.user_id = ${user.id}
    order by r.field_key
  `;

  const apiKey = await resolveGeminiKey(user.id);
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
      orgRequisites,
      clientRequisites,
    });
    const raw = await generateJson(GEMINI_FLASH, prompt, apiKey);
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
    orgRequisites,
    clientRequisites,
  );

  await sql`
    update templates set blocks = ${sql.json(result.blocks)}, fields = ${sql.json(result.fields)}
    where id = ${templateId}
  `;

  return NextResponse.json({ blocks: result.blocks, fields: result.fields, added: result.added });
}
