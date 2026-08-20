'use client';

import { useState } from 'react';

export type InviteRow = {
  code: string;
  is_used: boolean;
  created_at: string;
};

function randomCode() {
  // Читаемый код без похожих символов (0/O, 1/l).
  const chars = 'abcdefghjkmnpqrstuvwxyz23456789';
  let out = '';
  for (let i = 0; i < 8; i += 1) out += chars[Math.floor(Math.random() * chars.length)];
  return out;
}

export function InvitesManager({ initialCodes }: { initialCodes: InviteRow[] }) {
  const [codes, setCodes] = useState<InviteRow[]>(initialCodes);
  const [custom, setCustom] = useState('');
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [copied, setCopied] = useState<string | null>(null);

  async function generate(code: string) {
    const trimmed = code.trim().toLowerCase();
    if (!trimmed) return;
    setBusy(true);
    setError(null);

    const response = await fetch('/api/invites', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ code: trimmed }),
    });

    setBusy(false);
    if (!response.ok) {
      const data = await response.json().catch(() => null);
      setError(data?.error ?? 'Не удалось создать код (нужны права администратора)');
      return;
    }
    const { invite } = await response.json();
    setCodes((prev) => [invite as InviteRow, ...prev]);
    setCustom('');
  }

  async function remove(code: string) {
    await fetch(`/api/invites/${encodeURIComponent(code)}`, { method: 'DELETE' });
    setCodes((prev) => prev.filter((c) => c.code !== code));
  }

  function copy(code: string) {
    navigator.clipboard.writeText(code);
    setCopied(code);
    setTimeout(() => setCopied(null), 1500);
  }

  return (
    <div className="max-w-2xl space-y-4">
      <div className="card space-y-3 p-4">
        <p className="text-sm text-fg">Создайте код и передайте его новому пользователю.</p>
        <div className="flex flex-col gap-2 sm:flex-row">
          <button
            type="button"
            onClick={() => generate(randomCode())}
            disabled={busy}
            className="btn btn-primary"
          >
            Сгенерировать случайный
          </button>
          <div className="flex flex-1 gap-2">
            <input
              value={custom}
              onChange={(e) => setCustom(e.target.value)}
              placeholder="или свой код"
              className="input-field"
            />
            <button
              type="button"
              onClick={() => generate(custom)}
              disabled={busy || !custom.trim()}
              className="btn btn-secondary"
            >
              Создать
            </button>
          </div>
        </div>
        {error && (
          <p className="rounded-lg px-3 py-2 text-sm text-[var(--danger)] bg-[var(--danger-soft)]">
            {error}
          </p>
        )}
      </div>

      <div>
        <h2 className="mb-2 text-sm font-medium text-fg">Коды</h2>
        {codes.length === 0 ? (
          <p className="text-sm text-muted">Пока нет ни одного кода.</p>
        ) : (
          <div className="space-y-2">
            {codes.map((c) => (
              <div key={c.code} className="card flex items-center justify-between p-3">
                <div className="min-w-0">
                  <span className="font-mono text-sm text-fg">{c.code}</span>
                  <span
                    className={`badge ml-2 ${
                      c.is_used
                        ? 'bg-surface2 text-muted'
                        : 'text-[var(--accent-soft-fg)] bg-[var(--accent-soft)]'
                    }`}
                  >
                    {c.is_used ? 'использован' : 'свободен'}
                  </span>
                </div>
                <div className="flex shrink-0 items-center gap-3">
                  {!c.is_used && (
                    <button
                      type="button"
                      onClick={() => copy(c.code)}
                      className="text-sm font-medium text-accent hover:underline"
                    >
                      {copied === c.code ? 'Скопировано' : 'Копировать'}
                    </button>
                  )}
                  <button
                    type="button"
                    onClick={() => remove(c.code)}
                    className="text-sm font-medium text-muted hover:text-[var(--danger)]"
                  >
                    Удалить
                  </button>
                </div>
              </div>
            ))}
          </div>
        )}
      </div>
    </div>
  );
}
