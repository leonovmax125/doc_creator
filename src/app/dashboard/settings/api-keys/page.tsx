import { createClient } from '@/lib/supabase/server';
import { ApiKeyEditor } from '@/components/api-key-editor';

export default async function ApiKeysPage() {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();

  if (!user) return null;

  const { data: settings } = await supabase
    .from('user_settings')
    .select('gemini_api_key, gemini_model')
    .eq('user_id', user.id)
    .maybeSingle();

  const key = settings?.gemini_api_key ?? null;
  const masked = key ? `${key.slice(0, 4)}…${key.slice(-4)}` : null;

  return (
    <ApiKeyEditor
      userId={user.id}
      hasKey={!!key}
      maskedKey={masked}
      currentModel={settings?.gemini_model ?? null}
    />
  );
}
