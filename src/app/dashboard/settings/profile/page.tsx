import { sql } from '@/lib/db';
import { getCurrentUser } from '@/lib/auth/session';
import { ChangePassword } from '@/components/change-password';

export default async function ProfilePage() {
  const user = await getCurrentUser();
  const rows = user
    ? await sql<{ full_name: string; email: string; created_at: string }[]>`
        select full_name, email, created_at from users where id = ${user.id} limit 1
      `
    : [];
  const profile = rows[0] ?? null;

  return (
    <div className="max-w-sm space-y-4">
      <div className="card p-4">
        <dl className="space-y-3 text-sm">
          <div>
            <dt className="text-muted">Имя</dt>
            <dd className="text-fg">{profile?.full_name}</dd>
          </div>
          <div>
            <dt className="text-muted">Почта</dt>
            <dd className="text-fg">{profile?.email}</dd>
          </div>
          <div>
            <dt className="text-muted">В сервисе с</dt>
            <dd className="text-fg">
              {profile?.created_at ? new Date(profile.created_at).toLocaleDateString('ru-RU') : ''}
            </dd>
          </div>
        </dl>
      </div>

      <div className="card p-4">
        <h2 className="mb-3 text-sm font-semibold text-fg">Смена пароля</h2>
        <ChangePassword />
      </div>
    </div>
  );
}
