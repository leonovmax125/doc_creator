import 'server-only';
import { sql } from '@/lib/db';

// Проверки владения — замена RLS. Каждый API-маршрут перед изменением/чтением
// чужой таблицы обязан убедиться, что запись принадлежит текущему пользователю.

export async function ownsOrganization(userId: string, orgId: string): Promise<boolean> {
  const r = await sql`select 1 from organizations where id = ${orgId} and owner_id = ${userId} limit 1`;
  return r.length > 0;
}

export async function ownsClient(userId: string, clientId: string): Promise<boolean> {
  const r = await sql`select 1 from clients where id = ${clientId} and user_id = ${userId} limit 1`;
  return r.length > 0;
}

/** Реквизиты принадлежат организации или клиенту — проверяем через них. */
export async function ownsRequisitesTarget(
  userId: string,
  ownerType: string,
  ownerId: string,
): Promise<boolean> {
  if (ownerType === 'organization') return ownsOrganization(userId, ownerId);
  if (ownerType === 'client') return ownsClient(userId, ownerId);
  return false;
}

export async function ownsRequisite(userId: string, requisiteId: string): Promise<boolean> {
  const rows = await sql<{ owner_type: string; owner_id: string }[]>`
    select owner_type, owner_id from requisites where id = ${requisiteId} limit 1
  `;
  if (!rows[0]) return false;
  return ownsRequisitesTarget(userId, rows[0].owner_type, rows[0].owner_id);
}

export async function ownsCase(userId: string, caseId: string): Promise<boolean> {
  const r = await sql`select 1 from cases where id = ${caseId} and user_id = ${userId} limit 1`;
  return r.length > 0;
}

export async function ownsVersion(userId: string, versionId: string): Promise<boolean> {
  const r = await sql`
    select 1 from contract_versions v
    join cases c on c.id = v.case_id
    where v.id = ${versionId} and c.user_id = ${userId} limit 1
  `;
  return r.length > 0;
}

export async function ownsStamp(userId: string, stampId: string): Promise<boolean> {
  const r = await sql`select 1 from stamps where id = ${stampId} and user_id = ${userId} limit 1`;
  return r.length > 0;
}

export async function ownsTemplate(userId: string, templateId: string): Promise<boolean> {
  const r = await sql`select 1 from templates where id = ${templateId} and user_id = ${userId} limit 1`;
  return r.length > 0;
}

export async function ownsMaterial(userId: string, materialId: string): Promise<boolean> {
  const r = await sql`select 1 from materials where id = ${materialId} and user_id = ${userId} limit 1`;
  return r.length > 0;
}
