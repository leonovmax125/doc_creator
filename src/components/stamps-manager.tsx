'use client';

import { useState, type FormEvent } from 'react';
import { useRouter } from 'next/navigation';
import { hasTransparency } from '@/lib/check-transparency';

export type StampWithUrl = {
  id: string;
  name: string;
  type: 'signature' | 'stamp';
  signedUrl: string | null;
};

export function StampsManager({ stamps }: { userId?: string; stamps: StampWithUrl[] }) {
  const router = useRouter();

  const [name, setName] = useState('');
  const [type, setType] = useState<'signature' | 'stamp'>('signature');
  const [file, setFile] = useState<File | null>(null);
  const [warning, setWarning] = useState(false);
  const [uploading, setUploading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function handleFileSelect(selected: File | null) {
    setFile(selected);
    setWarning(selected ? !(await hasTransparency(selected)) : false);
  }

  async function handleSubmit(event: FormEvent) {
    event.preventDefault();
    if (!file || !name.trim()) {
      setError('Укажите название и выберите файл');
      return;
    }
    setError(null);
    setUploading(true);

    const form = new FormData();
    form.set('file', file);
    form.set('name', name.trim());
    form.set('type', type);
    const response = await fetch('/api/stamps', { method: 'POST', body: form });

    if (!response.ok) {
      const data = await response.json().catch(() => null);
      setError(data?.error ?? 'Не удалось загрузить файл');
      setUploading(false);
      return;
    }

    setName('');
    setFile(null);
    setWarning(false);
    setUploading(false);
    router.refresh();
  }

  async function handleDelete(stamp: StampWithUrl) {
    await fetch(`/api/stamps/${stamp.id}`, { method: 'DELETE' });
    router.refresh();
  }

  return (
    <div>
      <form onSubmit={handleSubmit} className="mb-6 card p-4">
        <div className="flex flex-col gap-3 sm:flex-row sm:items-end">
          <div className="flex-1">
            <label className="label">Название</label>
            <input
              value={name}
              onChange={(e) => setName(e.target.value)}
              placeholder="Например, «Подпись директора»"
              className="input-field"
            />
          </div>

          <div>
            <label className="label">Тип</label>
            <select
              value={type}
              onChange={(e) => setType(e.target.value as 'signature' | 'stamp')}
              className="input-field"
            >
              <option value="signature">Подпись</option>
              <option value="stamp">Печать</option>
            </select>
          </div>

          <div>
            <label className="label">Файл (PNG)</label>
            <input
              type="file"
              accept="image/png"
              onChange={(e) => handleFileSelect(e.target.files?.[0] ?? null)}
              className="w-full text-sm"
            />
          </div>

          <button
            type="submit"
            disabled={uploading}
            className="btn btn-primary disabled:opacity-50"
          >
            {uploading ? 'Загружаем…' : 'Добавить'}
          </button>
        </div>

        {warning && (
          <p className="mt-3 rounded-lg bg-amber-50 px-3 py-2 text-sm text-amber-800">
            У выбранного файла не найден прозрачный фон — в договоре он может перекрыть текст
            белым прямоугольником.
          </p>
        )}
        {error && <p className="mt-3 rounded-lg px-3 py-2 text-sm text-[var(--danger)] bg-[var(--danger-soft)]">{error}</p>}
      </form>

      {stamps.length === 0 ? (
        <p className="text-sm text-muted">Пока ничего не загружено.</p>
      ) : (
        <div className="grid grid-cols-2 gap-4 sm:grid-cols-3 md:grid-cols-4">
          {stamps.map((stamp) => (
            <div key={stamp.id} className="card p-3">
              <div className="checkered-bg mb-2 flex h-24 items-center justify-center overflow-hidden rounded-lg">
                {stamp.signedUrl && (
                  // eslint-disable-next-line @next/next/no-img-element
                  <img src={stamp.signedUrl} alt={stamp.name} className="h-full w-full object-contain" />
                )}
              </div>
              <p className="truncate text-sm font-medium text-fg">{stamp.name}</p>
              <p className="mb-2 text-xs text-muted">
                {stamp.type === 'signature' ? 'Подпись' : 'Печать'}
              </p>
              <button
                type="button"
                onClick={() => handleDelete(stamp)}
                className="text-xs font-medium text-red-600 hover:text-red-800"
              >
                Удалить
              </button>
            </div>
          ))}
        </div>
      )}
    </div>
  );
}
