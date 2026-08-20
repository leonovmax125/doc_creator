import Link from 'next/link';
import { sql } from '@/lib/db';
import { getCurrentUser } from '@/lib/auth/session';

export default async function TemplatesPage() {
  const user = await getCurrentUser();
  const templates = user
    ? await sql<{ id: string; name: string; category: string | null; created_at: string }[]>`
        select id, name, category, created_at from templates
        where user_id = ${user.id} order by created_at desc
      `
    : [];

  return (
    <div>
      <div className="mb-4 flex items-center justify-between">
        <h1 className="text-2xl font-semibold text-fg">Шаблоны</h1>
        <Link href="/dashboard/templates/new" className="btn btn-primary">
          + Загрузить шаблон
        </Link>
      </div>

      {templates.length === 0 ? (
        <p className="text-sm text-muted">Пока нет ни одного шаблона.</p>
      ) : (
        <div className="grid grid-cols-1 gap-3 sm:grid-cols-2 lg:grid-cols-3">
          {templates.map((template) => (
            <Link
              key={template.id}
              href={`/dashboard/templates/${template.id}`}
              className="card p-4 hover:border-border"
            >
              <p className="font-medium text-fg">{template.name}</p>
              {template.category && <p className="mt-1 text-sm text-muted">{template.category}</p>}
              <p className="mt-1 text-xs text-muted">
                {new Date(template.created_at).toLocaleDateString('ru-RU')}
              </p>
            </Link>
          ))}
        </div>
      )}
    </div>
  );
}
