'use client';

import { useState } from 'react';
import Link from 'next/link';
import {
  CASE_STATUSES,
  CASE_STATUS_LABELS,
  type CaseStatus,
} from '@/lib/case-status';

const MODE_LABELS: Record<string, string> = {
  strict: 'Строго по шаблону',
  assisted: 'Шаблон + правки ИИ',
  generative: 'С нуля',
};

export type CaseVersionItem = {
  id: string;
  versionNumber: number;
  mode: string;
  createdAt: string;
  url: string | null;
};

export function CaseDetail({
  caseId,
  title,
  status: initialStatus,
  clientName,
  versions,
}: {
  caseId: string;
  title: string;
  status: CaseStatus;
  clientName: string;
  versions: CaseVersionItem[];
}) {
  const [status, setStatus] = useState<CaseStatus>(initialStatus);

  async function changeStatus(next: CaseStatus) {
    setStatus(next);
    await fetch(`/api/cases/${caseId}`, {
      method: 'PATCH',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ status: next }),
    });
  }

  async function handleDownload(url: string, versionNumber: number) {
    const response = await fetch(url);
    const blob = await response.blob();
    const objectUrl = URL.createObjectURL(blob);
    const link = document.createElement('a');
    link.href = objectUrl;
    link.download = `${title}_v${versionNumber}.docx`;
    document.body.appendChild(link);
    link.click();
    link.remove();
    URL.revokeObjectURL(objectUrl);
  }

  return (
    <div>
      <div className="mb-1 flex flex-wrap items-center justify-between gap-2">
        <h1 className="text-2xl font-semibold text-fg">{title}</h1>
        <Link
          href={`/dashboard/contracts/${caseId}/new-version`}
          className="btn btn-primary"
        >
          Новая версия
        </Link>
      </div>
      <p className="mb-4 text-sm text-muted">Клиент: {clientName}</p>

      <div className="mb-6 flex items-center gap-2">
        <label className="text-sm text-fg">Статус:</label>
        <select
          value={status}
          onChange={(e) => changeStatus(e.target.value as CaseStatus)}
          className="rounded-lg border border-border px-3 py-2 text-sm focus:border-accent focus:outline-none"
        >
          {CASE_STATUSES.map((s) => (
            <option key={s} value={s}>
              {CASE_STATUS_LABELS[s]}
            </option>
          ))}
        </select>
      </div>

      <h2 className="mb-3 text-sm font-medium text-fg">Версии</h2>
      <div className="space-y-2">
        {versions.map((v) => (
          <div
            key={v.id}
            className="flex items-center justify-between card p-4"
          >
            <div>
              <p className="font-medium text-fg">v{v.versionNumber}</p>
              <p className="text-sm text-muted">
                {MODE_LABELS[v.mode] ?? v.mode} ·{' '}
                {new Date(v.createdAt).toLocaleDateString('ru-RU')}
              </p>
            </div>
            <div className="flex items-center gap-2">
              {v.mode !== 'strict' && (
                <Link
                  href={`/dashboard/contracts/${caseId}/refine/${v.id}`}
                  className="btn btn-secondary"
                >
                  Доработать с ИИ
                </Link>
              )}
              {v.url && (
                <button
                  type="button"
                  onClick={() => handleDownload(v.url as string, v.versionNumber)}
                  className="btn btn-secondary"
                >
                  Скачать
                </button>
              )}
            </div>
          </div>
        ))}
      </div>
    </div>
  );
}
