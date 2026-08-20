import { NextResponse } from 'next/server';
import { randomUUID } from 'node:crypto';
import { sql } from '@/lib/db';
import { getCurrentUser } from '@/lib/auth/session';
import { getObject, putObject } from '@/lib/storage/local';
import { fileUrl } from '@/lib/files';
import { renderContractDocx, type FieldResolution } from '@/lib/render-contract';
import { getPngDimensions } from '@/lib/png-dimensions';
import { sanitizeFilenamePart } from '@/lib/sanitize-filename';
import { normalizeBlocks, type TemplateField } from '@/lib/template-types';

export const runtime = 'nodejs';

const SIGNATURE_WIDTH_CM = 5; // ~50 мм
const STAMP_WIDTH_CM = 4; // ~40 мм

type GenerateBody = {
  templateId: string;
  clientId: string;
  values: Record<string, string>;
  signatureId?: string | null;
  stampId?: string | null;
  caseTitle?: string;
  caseId?: string | null;
};

export async function POST(request: Request) {
  const user = await getCurrentUser();
  if (!user) return NextResponse.json({ error: 'Не авторизован' }, { status: 401 });

  const body = (await request.json()) as GenerateBody;
  const { templateId, clientId, values, signatureId, stampId, caseTitle, caseId } = body;

  if (!templateId || !clientId) {
    return NextResponse.json({ error: 'Не хватает данных' }, { status: 400 });
  }

  const templateRows = await sql<{ blocks: unknown; fields: unknown; source_file_path: string }[]>`
    select blocks, fields, source_file_path from templates
    where id = ${templateId} and user_id = ${user.id} limit 1
  `;
  const template = templateRows[0];
  if (!template) return NextResponse.json({ error: 'Шаблон не найден' }, { status: 404 });

  const clientRows = await sql<{ id: string; name: string }[]>`
    select id, name from clients where id = ${clientId} and user_id = ${user.id} limit 1
  `;
  const client = clientRows[0];
  if (!client) return NextResponse.json({ error: 'Клиент не найден' }, { status: 404 });

  const orgRequisites = await sql<{ field_key: string; field_value: string }[]>`
    select r.field_key, r.field_value from requisites r
    join organizations o on o.id = r.owner_id
    where r.owner_type = 'organization' and o.owner_id = ${user.id}
  `;
  const clientRequisites = await sql<{ field_key: string; field_value: string }[]>`
    select field_key, field_value from requisites
    where owner_type = 'client' and owner_id = ${clientId}
  `;

  const orgValues = new Map(orgRequisites.map((r) => [r.field_key, r.field_value]));
  const clientValues = new Map(clientRequisites.map((r) => [r.field_key, r.field_value]));

  let templateBuffer: Buffer;
  try {
    templateBuffer = await getObject('templates', template.source_file_path);
  } catch {
    return NextResponse.json({ error: 'Не удалось загрузить файл шаблона' }, { status: 500 });
  }

  async function loadStampImage(
    stampRowId: string | null | undefined,
    widthCm: number,
  ): Promise<{ width: number; height: number; data: string; extension: '.png' } | null> {
    if (!stampRowId) return null;
    const rows = await sql<{ file_path: string }[]>`
      select file_path from stamps where id = ${stampRowId} and user_id = ${user!.id} limit 1
    `;
    if (!rows[0]) return null;

    let buffer: Buffer;
    try {
      buffer = await getObject('stamps', rows[0].file_path);
    } catch {
      return null;
    }
    const dims = getPngDimensions(buffer);
    const height = dims ? widthCm * (dims.height / dims.width) : widthCm;
    return { width: widthCm, height, data: buffer.toString('base64'), extension: '.png' };
  }

  const [signatureImage, stampImage] = await Promise.all([
    loadStampImage(signatureId, SIGNATURE_WIDTH_CM),
    loadStampImage(stampId, STAMP_WIDTH_CM),
  ]);

  function resolve(field: TemplateField): FieldResolution {
    switch (field.source.type) {
      case 'org_requisite':
        return { kind: 'text', value: orgValues.get(field.source.field_key) ?? '' };
      case 'client_requisite':
        return {
          kind: 'text',
          value: clientValues.get(field.source.field_key) ?? values[field.id] ?? '',
        };
      case 'manual':
        return { kind: 'text', value: values[field.id] ?? '' };
      case 'signature':
        return signatureImage ? { kind: 'image', image: signatureImage } : { kind: 'skip' };
      case 'stamp':
        return stampImage ? { kind: 'image', image: stampImage } : { kind: 'skip' };
      default:
        return { kind: 'text', value: '' };
    }
  }

  let renderResult;
  try {
    renderResult = await renderContractDocx({
      templateBuffer,
      blocks: normalizeBlocks(template.blocks),
      fields: (template.fields ?? []) as TemplateField[],
      resolve,
    });
  } catch {
    return NextResponse.json({ error: 'Не удалось собрать документ' }, { status: 500 });
  }

  const dateStr = new Date().toISOString().slice(0, 10);
  const suggestedName = `Договор_${sanitizeFilenamePart(client.name)}_${dateStr}.docx`;
  const storagePath = `${user.id}/${randomUUID()}.docx`;
  await putObject('contracts', storagePath, renderResult.buffer);

  let resolvedCaseId = caseId ?? null;
  let versionNumber = 1;

  if (resolvedCaseId) {
    // Проверяем, что дело принадлежит пользователю.
    const owned = await sql`select 1 from cases where id = ${resolvedCaseId} and user_id = ${user.id} limit 1`;
    if (owned.length === 0) return NextResponse.json({ error: 'Дело не найдено' }, { status: 404 });

    const last = await sql<{ version_number: number }[]>`
      select version_number from contract_versions where case_id = ${resolvedCaseId}
      order by version_number desc limit 1
    `;
    versionNumber = (last[0]?.version_number ?? 0) + 1;
  } else {
    const title = caseTitle?.trim() || `Договор с ${client.name}`;
    const created = await sql<{ id: string }[]>`
      insert into cases (user_id, client_id, title, status)
      values (${user.id}, ${clientId}, ${title}, 'draft')
      returning id
    `;
    resolvedCaseId = created[0].id;
  }

  await sql`
    insert into contract_versions (case_id, version_number, mode, template_id, blocks, data, docx_path)
    values (
      ${resolvedCaseId},
      ${versionNumber},
      'strict',
      ${templateId},
      ${sql.json(normalizeBlocks(template.blocks))},
      ${sql.json({ values, signatureId: signatureId ?? null, stampId: stampId ?? null })},
      ${storagePath}
    )
  `;

  const warnings = [
    ...renderResult.unfilledFieldNames.map((name) => `Поле «${name}» осталось пустым`),
    ...renderResult.unmatchedFieldNames.map(
      (name) => `Не удалось найти в документе место для поля «${name}»`,
    ),
  ];

  return NextResponse.json({
    url: fileUrl('contracts', storagePath),
    filename: suggestedName,
    warnings,
    caseId: resolvedCaseId,
    versionNumber,
  });
}
