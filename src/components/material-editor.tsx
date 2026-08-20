'use client';

import { useState } from 'react';
import { useRouter } from 'next/navigation';
import { MATERIAL_TYPES, MATERIAL_TYPE_LABELS, type MaterialType } from '@/lib/material-types';

type Material = {
  id: string;
  name: string;
  type: MaterialType;
  content_text: string;
  tags: string[];
  file_path: string | null;
};

export function MaterialEditor({ material }: { material: Material }) {
  const router = useRouter();

  const [name, setName] = useState(material.name);
  const [type, setType] = useState<MaterialType>(material.type);
  const [tags, setTags] = useState(material.tags.join(', '));
  const [contentText, setContentText] = useState(material.content_text);
  const [savedAt, setSavedAt] = useState<string | null>(null);

  async function handleSave() {
    await fetch(`/api/materials/${material.id}`, {
      method: 'PATCH',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        name: name.trim(),
        type,
        content_text: contentText,
        tags: tags
          .split(',')
          .map((t) => t.trim())
          .filter(Boolean),
      }),
    });
    setSavedAt(new Date().toLocaleTimeString('ru-RU'));
  }

  async function handleDelete() {
    if (!confirm('Удалить материал?')) return;
    await fetch(`/api/materials/${material.id}`, { method: 'DELETE' });
    router.push('/dashboard/materials');
  }

  return (
    <div className="max-w-lg space-y-4 card p-4">
      <div>
        <label className="label">Название</label>
        <input
          value={name}
          onChange={(e) => setName(e.target.value)}
          className="input-field"
        />
      </div>

      <div>
        <label className="label">Тип</label>
        <select
          value={type}
          onChange={(e) => setType(e.target.value as MaterialType)}
          className="input-field"
        >
          {MATERIAL_TYPES.map((t) => (
            <option key={t} value={t}>
              {MATERIAL_TYPE_LABELS[t]}
            </option>
          ))}
        </select>
      </div>

      <div>
        <label className="label">Теги (через запятую)</label>
        <input
          value={tags}
          onChange={(e) => setTags(e.target.value)}
          className="input-field"
        />
      </div>

      <div>
        <label className="label">Текст</label>
        <textarea
          value={contentText}
          onChange={(e) => setContentText(e.target.value)}
          rows={10}
          className="input-field"
        />
        {material.file_path && (
          <p className="mt-1 text-xs text-muted">
            Текст извлечён из загруженного файла. Можно править вручную.
          </p>
        )}
      </div>

      <div className="flex items-center justify-between">
        <button
          type="button"
          onClick={handleDelete}
          className="text-sm font-medium text-red-600 hover:text-red-800"
        >
          Удалить
        </button>
        <div className="flex items-center gap-3">
          {savedAt && <span className="text-xs text-muted">Сохранено в {savedAt}</span>}
          <button
            type="button"
            onClick={handleSave}
            className="btn btn-primary"
          >
            Сохранить
          </button>
        </div>
      </div>
    </div>
  );
}
