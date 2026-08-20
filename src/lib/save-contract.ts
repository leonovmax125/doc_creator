import { randomUUID } from 'node:crypto';
import { sql } from './db';
import { putObject } from './storage/local';
import { fileUrl } from './files';
import { sanitizeFilenamePart } from './sanitize-filename';
import type { Block } from './template-types';

/**
 * Сохраняет готовый .docx: кладёт файл на диск (бакет contracts), создаёт дело
 * (или новую версию в переданном деле) и запись версии. Возвращает ссылку на
 * файл и осмысленное имя. Используется и strict-, и AI-режимами.
 */
export async function saveContractVersion(
  userId: string,
  params: {
    clientId: string;
    clientName: string;
    mode: 'strict' | 'assisted' | 'generative';
    templateId: string | null;
    blocks: Block[];
    data: Record<string, unknown>;
    docxBuffer: Buffer;
    caseId?: string | null;
    caseTitle?: string | null;
  },
): Promise<
  | {
      ok: true;
      url: string | null;
      filename: string;
      caseId: string;
      versionNumber: number;
      versionId: string;
    }
  | { ok: false; error: string }
> {
  const storagePath = `${userId}/${randomUUID()}.docx`;
  await putObject('contracts', storagePath, params.docxBuffer);

  let resolvedCaseId = params.caseId ?? null;
  let versionNumber = 1;

  if (resolvedCaseId) {
    const last = await sql<{ version_number: number }[]>`
      select version_number from contract_versions
      where case_id = ${resolvedCaseId}
      order by version_number desc limit 1
    `;
    versionNumber = (last[0]?.version_number ?? 0) + 1;
  } else {
    const title = params.caseTitle?.trim() || `Договор с ${params.clientName}`;
    const created = await sql<{ id: string }[]>`
      insert into cases (user_id, client_id, title, status)
      values (${userId}, ${params.clientId}, ${title}, 'draft')
      returning id
    `;
    if (!created[0]) return { ok: false, error: 'Не удалось создать дело' };
    resolvedCaseId = created[0].id;
  }

  const newVersion = await sql<{ id: string }[]>`
    insert into contract_versions (case_id, version_number, mode, template_id, blocks, data, docx_path)
    values (
      ${resolvedCaseId},
      ${versionNumber},
      ${params.mode},
      ${params.templateId},
      ${sql.json(params.blocks as never)},
      ${sql.json(params.data as never)},
      ${storagePath}
    )
    returning id
  `;
  if (!newVersion[0]) return { ok: false, error: 'Не удалось сохранить версию договора' };

  const dateStr = new Date().toISOString().slice(0, 10);
  const filename = `Договор_${sanitizeFilenamePart(params.clientName)}_${dateStr}.docx`;

  return {
    ok: true,
    url: fileUrl('contracts', storagePath),
    filename,
    caseId: resolvedCaseId,
    versionNumber,
    versionId: newVersion[0].id,
  };
}
