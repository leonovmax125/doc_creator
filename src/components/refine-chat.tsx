'use client';

import { useState } from 'react';

type ChatMessage = { id: string; role: 'user' | 'assistant'; content: string };

export function RefineChat({
  versionId,
  versionNumber,
  initialMessages,
  initialUrl,
  initialFilename,
}: {
  versionId: string;
  versionNumber: number;
  initialMessages: ChatMessage[];
  initialUrl: string | null;
  initialFilename: string;
}) {
  const [messages, setMessages] = useState<ChatMessage[]>(initialMessages);
  const [input, setInput] = useState('');
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [url, setUrl] = useState<string | null>(initialUrl);
  const [filename, setFilename] = useState(initialFilename);

  // Показываем сообщение сразу (локально), а сохранение в БД — фоновое и
  // необязательное: чат работает, даже если история почему-то не пишется.
  function addMessage(role: 'user' | 'assistant', content: string) {
    const local: ChatMessage = { id: `local-${Date.now()}-${Math.random()}`, role, content };
    setMessages((prev) => [...prev, local]);
    fetch('/api/chat-messages', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ versionId, role, content }),
    }).catch(() => {});
  }

  async function send() {
    const instruction = input.trim();
    if (!instruction || busy) return;
    setInput('');
    setError(null);
    addMessage('user', instruction);
    setBusy(true);

    try {
      const response = await fetch('/api/contracts/refine', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ versionId, instruction }),
      });

      if (!response.ok) {
        const body = await response.json().catch(() => null);
        const msg = body?.error ?? 'Не удалось выполнить правку';
        setError(msg);
        addMessage('assistant', msg);
        return;
      }

      const data = (await response.json()) as {
        url: string | null;
        filename: string;
        applied: number;
        skipped: string[];
      };
      setUrl(data.url);
      setFilename(data.filename);

      const note =
        `Готово, применено правок: ${data.applied}.` +
        (data.skipped.length ? ` Не удалось: ${data.skipped.join('; ')}.` : '') +
        ' Скачайте обновлённый документ кнопкой сверху.';
      addMessage('assistant', note);
    } catch {
      const msg = 'Не удалось связаться с сервером. Попробуйте ещё раз.';
      setError(msg);
      addMessage('assistant', msg);
    } finally {
      setBusy(false);
    }
  }

  async function download() {
    if (!url) return;
    const blob = await (await fetch(url)).blob();
    const objectUrl = URL.createObjectURL(blob);
    const link = document.createElement('a');
    link.href = objectUrl;
    link.download = filename;
    document.body.appendChild(link);
    link.click();
    link.remove();
    URL.revokeObjectURL(objectUrl);
  }

  return (
    <div className="mx-auto max-w-2xl">
      <div className="mb-4 flex flex-wrap items-center justify-between gap-2">
        <h1 className="text-xl font-semibold text-fg">Доработка договора · версия {versionNumber}</h1>
        {url && (
          <button type="button" onClick={download} className="btn btn-secondary">
            Скачать .docx
          </button>
        )}
      </div>

      <p className="mb-4 text-sm text-muted">
        Опишите правку — ИИ внесёт её прямо в документ, сохранив оформление. Можно уточнять сколько
        угодно раз: «поменяй срок на 2 месяца», «убери пункт 5.3», «добавь раздел о конфиденциальности».
      </p>

      <div className="card flex h-[60vh] flex-col p-0">
        <div className="flex-1 space-y-2 overflow-y-auto p-3">
          {messages.length === 0 && (
            <p className="text-sm text-muted">Напишите первую правку внизу.</p>
          )}
          {messages.map((m) => (
            <div
              key={m.id}
              className={`max-w-[85%] rounded-lg px-3 py-2 text-sm ${
                m.role === 'user' ? 'ml-auto bg-accent text-accent-fg' : 'bg-surface2 text-fg'
              }`}
            >
              {m.content}
            </div>
          ))}
          {busy && (
            <div className="max-w-[85%] rounded-lg bg-surface2 px-3 py-2 text-sm text-muted">
              ИИ вносит правку…
            </div>
          )}
        </div>

        <div className="border-t border-border p-3">
          {error && (
            <p className="mb-2 rounded-lg px-3 py-2 text-sm" style={{ background: 'var(--danger-soft)', color: 'var(--danger)' }}>
              {error}
            </p>
          )}
          <textarea
            value={input}
            onChange={(e) => setInput(e.target.value)}
            onKeyDown={(e) => {
              if (e.key === 'Enter' && !e.shiftKey) {
                e.preventDefault();
                send();
              }
            }}
            rows={2}
            placeholder="Например: срок оказания услуг сделай до 15 сентября 2026"
            className="input-field resize-none"
          />
          <button
            type="button"
            onClick={send}
            disabled={busy || !input.trim()}
            className="btn btn-primary mt-2 w-full"
          >
            Отправить
          </button>
        </div>
      </div>
    </div>
  );
}
