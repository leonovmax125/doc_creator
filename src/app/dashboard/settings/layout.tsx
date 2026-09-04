import { getCurrentUser } from '@/lib/auth/session';
import { SettingsTabs } from '@/components/settings-tabs';

export default async function SettingsLayout({ children }: { children: React.ReactNode }) {
  const user = await getCurrentUser();

  return (
    <div>
      <h1 className="mb-4 text-2xl font-semibold text-fg">Настройки</h1>
      <SettingsTabs isAdmin={user?.is_admin ?? false} />
      {children}
    </div>
  );
}
