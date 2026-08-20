'use client';

import { useState } from 'react';

export function ApiKeyEditor({
  hasKey,
  maskedKey,
}: {
  userId?: string;
  hasKey: boolean;
  maskedKey: string | null;
}) {
  const [value, setValue] = useState('');
  const [saved, setSaved] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const [currentHasKey, setCurrentHasKey] = useState(hasKey);

  async function save() {
    if (!value.trim()) return;
    setBusy(true);
    await fetch('/api/settings/api-key', {
      method: 'PUT',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ key: value.trim() }),
    });
    setBusy(false);
    setValue('');
    setCurrentHasKey(true);
    setSaved(new Date().toLocaleTimeString('ru-RU'));
  }

  async function remove() {
    setBusy(true);
    await fetch('/api/settings/api-key', { method: 'DELETE' });
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
    </div>
  );
}
