import Link from 'next/link';
import { sql } from '@/lib/db';
import { getCurrentUser } from '@/lib/auth/session';
import { CasesList, type CaseListItem } from '@/components/cases-list';
import type { CaseStatus } from '@/lib/case-status';

export default async function ContractsPage() {
  const user = await getCurrentUser();

  const rows = user
    ? await sql<
        {
          id: string;
          title: string;
          status: CaseStatus;
          created_at: string;
          client_id: string;
          client_name: string;
          version_count: number;
          last_modified: string;
        }[]
      >`
        select
          c.id, c.title, c.status, c.created_at,
          cl.id as client_id, cl.name as client_name,
          count(v.id)::int as version_count,
          greatest(c.created_at, coalesce(max(v.created_at), c.created_at)) as last_modified
        from cases c
        join clients cl on cl.id = c.client_id
        left join contract_versions v on v.case_id = c.id
        where c.user_id = ${user.id}
        group by c.id, cl.id, cl.name
        order by c.created_at desc
      `
    : [];

  const items: CaseListItem[] = rows.map((c) => ({
    id: c.id,
    title: c.title,
    status: c.status,
    clientId: c.client_id,
    clientName: c.client_name,
    versionCount: c.version_count,
    lastModified: c.last_modified,
  }));

  const clients = Array.from(
    new Map(items.map((i) => [i.clientId, i.clientName])).entries(),
  ).map(([id, name]) => ({ id, name }));

  return (
    <div>
      <div className="mb-4 flex items-center justify-between">
        <h1 className="text-2xl font-semibold text-fg">Договоры</h1>
        <Link href="/dashboard/contracts/new" className="btn btn-primary">
          + Создать договор
        </Link>
      </div>

      <CasesList items={items} clients={clients} />
    </div>
  );
}
