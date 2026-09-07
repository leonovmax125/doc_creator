'use client';

import { useState } from 'react';
import { createClient } from '@/lib/supabase/client';
import { GEMINI_MODELS, GEMINI_FLASH } from '@/lib/gemini-models';

export function ApiKeyEditor({
  userId,
  hasKey,
  maskedKey,
  currentModel,
}: {
  userId: string;
  hasKey: boolean;
  maskedKey: string | null;
  currentModel?: string | null;
}) {
  const supabase = createClient();
  const [value, setValue] = useState('');
  const [saved, setSaved] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const [currentHasKey, setCurrentHasKey] = useState(hasKey);
  const [model, setModel] = useState(currentModel || GEMINI_FLASH);
  const [modelSaved, setModelSaved] = useState(false);

  async function saveModel(next: string) {
    setModel(next);
    setModelSaved(false);
    await supabase.from('user_settings').upsert({
      user_id: userId,
      gemini_model: next,
      updated_at: new Date().toISOString(),
    });
    setModelSaved(true);
  }

  async function save() {
    if (!value.trim()) return;
    setBusy(true);
    await supabase.from('user_settings').upsert({
      user_id: userId,
      gemini_api_key: value.trim(),
      updated_at: new Date().toISOString(),
    });
    setBusy(false);
    setValue('');
    setCurrentHasKey(true);
    setSaved(new Date().toLocaleTimeString('ru-RU'));
  }

  async function remove() {
    setBusy(true);
    await supabase.from('user_settings').update({ gemini_api_key: null }).eq('user_id', userId);
    setBusy(false);
    setCurrentHasKey(false);
    setSaved(null);
  }

  return (
    <div className="card max-w-lg space-y-4 p-4">
      <div>
        <p className="text-sm text-fg">
          Свой ключ Google Gemini для генерации и правок договоров. Ключ хранится в вашем аккаунте
          и виден только вам.
        </p>
        <p className="mt-1 text-xs text-muted">
          Получить ключ: Google AI Studio → API keys. Если ключ не задан, используется общий ключ
          сервиса (если он настроен).
        </p>
      </div>

      {currentHasKey && (
        <div className="flex items-center justify-between rounded-lg border border-border px-3 py-2 text-sm">
          <span className="text-muted">Текущий ключ: {maskedKey ?? '••••'}</span>
          <button
            type="button"
            onClick={remove}
            disabled={busy}
            className="text-sm font-medium text-[var(--danger)] hover:underline disabled:opacity-50"
          >
            Удалить
          </button>
        </div>
      )}

      <div>
        <label className="label">{currentHasKey ? 'Заменить ключ' : 'Добавить ключ'}</label>
        <input
          type="password"
          value={value}
          onChange={(e) => setValue(e.target.value)}
          placeholder="AIza…"
          className="input-field"
        />
      </div>

      <div className="flex items-center justify-end gap-3">
        {saved && <span className="text-xs text-muted">Сохранено в {saved}</span>}
        <button
          type="button"
          onClick={save}
          disabled={busy || !value.trim()}
          className="btn btn-primary"
        >
          Сохранить
        </button>
      </div>

      <div className="border-t border-border pt-4">
        <label className="label">Модель Gemini</label>
        <select
          value={model}
          onChange={(e) => saveModel(e.target.value)}
          className="input-field"
        >
          {GEMINI_MODELS.map((m) => (
            <option key={m.id} value={m.id}>
              {m.label}
            </option>
          ))}
        </select>
        <p className="mt-1 text-xs text-muted">
          Если часто пишет «перегружен» — выберите <b>Flash-Lite</b>: она легче и реже занята.
          Если выбранная модель всё же занята, приложение само пробует Flash-Lite.
          {modelSaved && <span className="ml-1 text-[var(--accent-soft-fg)]">Сохранено.</span>}
        </p>
      </div>
    </div>
  );
}
