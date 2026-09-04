import Link from 'next/link';
import { sql } from '@/lib/db';
import { getCurrentUser } from '@/lib/auth/session';
import { fileUrl } from '@/lib/files';
import { DownloadButton } from '@/components/download-button';
import { CASE_STATUS_LABELS, CASE_STATUS_BADGE, type CaseStatus } from '@/lib/case-status';

export default async function DashboardPage() {
  const user = await getCurrentUser();
  if (!user) return null;

  const startOfMonth = new Date();
  startOfMonth.setDate(1);
  startOfMonth.setHours(0, 0, 0, 0);

  const [casesCountRows, clientsCountRows, monthCountRows] = await Promise.all([
    sql<{ n: number }[]>`select count(*)::int as n from cases where user_id = ${user.id}`,
    sql<{ n: number }[]>`select count(*)::int as n from clients where user_id = ${user.id}`,
    sql<{ n: number }[]>`
      select count(*)::int as n from contract_versions v
      join cases c on c.id = v.case_id
      where c.user_id = ${user.id} and v.created_at >= ${startOfMonth}
    `,
  ]);

  const recentVersions = await sql<
    { id: string; docx_path: string | null; created_at: string; case_id: string; title: string; client_name: string }[]
  >`
    select v.id, v.docx_path, v.created_at, c.id as case_id, c.title, cl.name as client_name
    from contract_versions v
    join cases c on c.id = v.case_id
    join clients cl on cl.id = c.client_id
    where c.user_id = ${user.id}
    order by v.created_at desc
    limit 5
  `;

  const recent = recentVersions.map((v) => ({
    id: v.id,
    caseId: v.case_id,
    title: v.title,
    clientName: v.client_name,
    createdAt: v.created_at,
    url: fileUrl('contracts', v.docx_path),
  }));

  const drafts = await sql<{ id: string; title: string; status: CaseStatus }[]>`
    select id, title, status from cases
    where user_id = ${user.id} and status = 'draft'
    order by created_at desc limit 5
  `;

  const frequentClients = await sql<{ id: string; name: string; count: number }[]>`
    select cl.id, cl.name, count(*)::int as count
    from cases c
    join clients cl on cl.id = c.client_id
    where c.user_id = ${user.id}
    group by cl.id, cl.name
    order by count desc
    limit 5
  `;

  return (
    <div>
      <div className="mb-6 flex flex-wrap items-center justify-between gap-3">
        <h1 className="text-2xl font-semibold text-fg">Дашборд</h1>
        <Link href="/dashboard/contracts/new" className="btn btn-primary px-5 py-3">
          Создать договор
        </Link>
      </div>

      <div className="mb-6 grid grid-cols-1 gap-3 sm:grid-cols-3">
        {[
          { label: 'Всего договоров', value: casesCountRows[0]?.n ?? 0 },
          { label: 'Клиентов', value: clientsCountRows[0]?.n ?? 0 },
          { label: 'Создано за месяц', value: monthCountRows[0]?.n ?? 0 },
        ].map((stat) => (
          <div key={stat.label} className="card p-4">
            <p className="text-2xl font-semibold text-fg">{stat.value}</p>
            <p className="text-sm text-muted">{stat.label}</p>
          </div>
        ))}
      </div>

      <div className="grid grid-cols-1 gap-6 lg:grid-cols-2">
        <section>
          <h2 className="mb-3 text-sm font-medium text-fg">Последние договоры</h2>
          {recent.length === 0 ? (
            <p className="text-sm text-muted">Пока пусто.</p>
          ) : (
            <div className="space-y-2">
              {recent.map((item) => (
                <div key={item.id} className="flex items-center justify-between card p-3">
                  <Link href={`/dashboard/contracts/${item.caseId}`} className="min-w-0">
                    <p className="truncate text-sm font-medium text-fg">{item.title}</p>
                    <p className="truncate text-xs text-muted">
                      {item.clientName} · {new Date(item.createdAt).toLocaleDateString('ru-RU')}
                    </p>
                  </Link>
                  {item.url && (
                    <DownloadButton
                      url={item.url}
                      filename={`${item.title}.docx`}
                      className="ml-3 shrink-0 text-xs font-medium text-muted hover:text-fg"
                    >
                      Скачать
                    </DownloadButton>
                  )}
                </div>
              ))}
            </div>
          )}
        </section>

        <section>
          <h2 className="mb-3 text-sm font-medium text-fg">Черновики</h2>
          {drafts.length === 0 ? (
            <p className="text-sm text-muted">Нет черновиков.</p>
          ) : (
            <div className="space-y-2">
              {drafts.map((c) => (
                <Link
                  key={c.id}
                  href={`/dashboard/contracts/${c.id}`}
                  className="flex items-center justify-between card p-3 hover:border-border"
                >
                  <span className="min-w-0 truncate text-sm text-fg">{c.title}</span>
                  <span
                    className={`ml-3 shrink-0 rounded-full px-2 py-1 text-xs font-medium ${CASE_STATUS_BADGE[c.status]}`}
                  >
                    {CASE_STATUS_LABELS[c.status]}
                  </span>
                </Link>
              ))}
            </div>
          )}
        </section>

        <section>
          <h2 className="mb-3 text-sm font-medium text-fg">Частые клиенты</h2>
          {frequentClients.length === 0 ? (
            <p className="text-sm text-muted">Пока пусто.</p>
          ) : (
            <div className="space-y-2">
              {frequentClients.map((c) => (
                <Link
                  key={c.id}
                  href={`/dashboard/contracts/new?client=${c.id}`}
                  className="flex items-center justify-between card p-3 hover:border-border"
                >
                  <span className="min-w-0 truncate text-sm text-fg">{c.name}</span>
                  <span className="ml-3 shrink-0 text-xs text-muted">
                    {c.count} {c.count === 1 ? 'дело' : 'дел'}
                  </span>
                </Link>
              ))}
            </div>
          )}
        </section>
      </div>
    </div>
  );
}
