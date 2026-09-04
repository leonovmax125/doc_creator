'use client';

import { useEffect, useRef, useState } from 'react';
import { renumberBlocks, blocksToPreviewHtml } from '@/lib/block-utils';
import type { Block } from '@/lib/template-types';

type ChatMessage = { id: string; role: 'user' | 'assistant'; content: string };
type AddableType = 'paragraph' | 'heading' | 'clause' | 'list' | 'table';

const ADD_TYPES: { type: AddableType; label: string }[] = [
  { type: 'paragraph', label: 'Абзац' },
  { type: 'heading', label: 'Раздел' },
  { type: 'clause', label: 'Пункт' },
  { type: 'list', label: 'Список' },
  { type: 'table', label: 'Таблица' },
];

function newId() {
  return `e${Date.now().toString(36)}${Math.random().toString(36).slice(2, 6)}`;
}

function emptyBlock(type: AddableType): Block {
  switch (type) {
    case 'heading':
      return { id: newId(), type: 'heading', number: '', text: 'Новый раздел' };
    case 'clause':
      return { id: newId(), type: 'clause', number: '', text: 'Новый пункт' };
    case 'list':
      return { id: newId(), type: 'list', items: [{ id: newId(), text: 'Пункт списка' }] };
    case 'table':
      return {
        id: newId(),
        type: 'table',
        rows: [
          [
            { id: newId(), text: 'Ячейка' },
            { id: newId(), text: 'Ячейка' },
          ],
        ],
      };
    default:
      return { id: newId(), type: 'paragraph', text: 'Новый абзац' };
  }
}

function serialize(block: Block): string {
  if (block.type === 'list') return block.items.map((i) => i.text).join('|');
  if (block.type === 'table') return block.rows.map((r) => r.map((c) => c.text).join('|')).join('||');
  return `${'number' in block ? block.number : ''}:${block.text}`;
}

export function BlockEditor({
  versionId,
  caseId,
  versionNumber,
  initialBlocks,
  initialMessages,
}: {
  versionId: string;
  caseId: string;
  versionNumber: number;
  initialBlocks: Block[];
  initialMessages: ChatMessage[];
}) {
  const [blocks, setBlocks] = useState<Block[]>(initialBlocks);
  const [messages, setMessages] = useState<ChatMessage[]>(initialMessages);
  const [chatInput, setChatInput] = useState('');
  const [aiBusy, setAiBusy] = useState(false);
  const [proposed, setProposed] = useState<Block[] | null>(null);
  const [changedIds, setChangedIds] = useState<Set<string>>(new Set());
  const [selectedBlockId, setSelectedBlockId] = useState<string | null>(null);
  const [saveStatus, setSaveStatus] = useState<'idle' | 'saving' | 'saved'>('idle');
  const [tab, setTab] = useState<'doc' | 'chat'>('doc');
  const [previewHtml, setPreviewHtml] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [addMenuFor, setAddMenuFor] = useState<string | null>(null);

  const saveTimer = useRef<ReturnType<typeof setTimeout> | null>(null);
  const firstRender = useRef(true);

  // Автосохранение блоков в версию с дебаунсом.
  useEffect(() => {
    if (firstRender.current) {
      firstRender.current = false;
      return;
    }
    setSaveStatus('saving');
    if (saveTimer.current) clearTimeout(saveTimer.current);
    saveTimer.current = setTimeout(async () => {
      await fetch(`/api/versions/${versionId}`, {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ blocks }),
      });
      setSaveStatus('saved');
    }, 800);
    return () => {
      if (saveTimer.current) clearTimeout(saveTimer.current);
    };
  }, [blocks, versionId]);

  function updateBlocks(next: Block[], renumber = false) {
    setBlocks(renumber ? renumberBlocks(next) : next);
  }

  function patchBlock(id: string, patch: Partial<Block>) {
    setBlocks((prev) => prev.map((b) => (b.id === id ? ({ ...b, ...patch } as Block) : b)));
  }

  function deleteBlock(id: string) {
    updateBlocks(blocks.filter((b) => b.id !== id), true);
    if (selectedBlockId === id) setSelectedBlockId(null);
  }

  function moveBlock(id: string, dir: -1 | 1) {
    const idx = blocks.findIndex((b) => b.id === id);
    const swap = idx + dir;
    if (idx === -1 || swap < 0 || swap >= blocks.length) return;
    const next = [...blocks];
    [next[idx], next[swap]] = [next[swap], next[idx]];
    updateBlocks(next, true);
  }

  function addBlockAfter(id: string, type: AddableType) {
    const idx = blocks.findIndex((b) => b.id === id);
    const next = [...blocks];
    next.splice(idx + 1, 0, emptyBlock(type));
    updateBlocks(next, true);
    setAddMenuFor(null);
  }

  async function persistMessage(role: 'user' | 'assistant', content: string) {
    const response = await fetch('/api/chat-messages', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ versionId, role, content }),
    });
    if (response.ok) {
      const { message } = await response.json();
      if (message) setMessages((prev) => [...prev, message as ChatMessage]);
    }
  }

  async function sendToAi() {
    const instruction = chatInput.trim();
    if (!instruction || aiBusy) return;
    setChatInput('');
    setError(null);
    await persistMessage('user', instruction);
    setAiBusy(true);

    const selectedBlock = selectedBlockId ? blocks.find((b) => b.id === selectedBlockId) : null;
    const payloadBlocks = selectedBlock ? [selectedBlock] : blocks;

    const response = await fetch('/api/ai/edit-blocks', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ blocks: payloadBlocks, instruction }),
    });

    setAiBusy(false);

    if (!response.ok) {
      const body = await response.json().catch(() => null);
      setError(body?.error ?? 'ИИ не смог обработать запрос');
      await persistMessage('assistant', 'Не удалось выполнить правку.');
      return;
    }

    const { blocks: returned } = (await response.json()) as { blocks: Block[] };

    let nextBlocks: Block[];
    if (selectedBlock) {
      // Заменяем только выбранный блок на то, что вернул ИИ (может стать несколькими).
      const idx = blocks.findIndex((b) => b.id === selectedBlock.id);
      nextBlocks = [...blocks.slice(0, idx), ...returned, ...blocks.slice(idx + 1)];
    } else {
      nextBlocks = returned;
    }
    nextBlocks = renumberBlocks(nextBlocks);

    // Подсветка изменённых: те, чей сериализованный вид не совпал с прежним по id.
    const before = new Map(blocks.map((b) => [b.id, serialize(b)]));
    const changed = new Set<string>();
    for (const b of nextBlocks) {
      if (before.get(b.id) !== serialize(b)) changed.add(b.id);
    }

    setProposed(nextBlocks);
    setChangedIds(changed);
    setSelectedBlockId(null);
    await persistMessage('assistant', 'Готово. Проверьте изменения и примите или отмените их.');
  }

  function acceptChanges() {
    if (!proposed) return;
    updateBlocks(proposed);
    setProposed(null);
    setChangedIds(new Set());
  }

  function rejectChanges() {
    setProposed(null);
    setChangedIds(new Set());
  }

  async function handleDownload() {
    setBusy(true);
    setError(null);
    const response = await fetch('/api/contracts/render-version', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ versionId, blocks }),
    });
    setBusy(false);
    if (!response.ok) {
      setError('Не удалось собрать .docx');
      return;
    }
    const { url, filename } = (await response.json()) as { url: string; filename: string };
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

  async function handleSaveAsNewVersion() {
    setBusy(true);
    setError(null);
    const response = await fetch('/api/contracts/save-version', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ caseId, blocks }),
    });
    setBusy(false);
    if (!response.ok) {
      setError('Не удалось сохранить новую версию');
      return;
    }
    const { versionNumber: newNum } = (await response.json()) as { versionNumber: number };
    window.location.href = `/dashboard/contracts/${caseId}?saved=v${newNum}`;
  }

  const viewBlocks = proposed ?? blocks;
  const readOnly = proposed !== null;

  return (
    <div>
      <div className="mb-4 flex flex-wrap items-center justify-between gap-2">
        <div className="flex items-center gap-3">
          <h1 className="text-xl font-semibold text-fg">Редактор · версия {versionNumber}</h1>
          <span className="text-xs text-muted">
            {saveStatus === 'saving' ? 'Сохранение…' : saveStatus === 'saved' ? 'Сохранено' : ''}
          </span>
        </div>
        <div className="flex flex-wrap gap-2">
          <button
            type="button"
            onClick={() => setPreviewHtml(blocksToPreviewHtml(blocks))}
            className="btn btn-secondary"
          >
            Предпросмотр
          </button>
          <button
            type="button"
            onClick={handleDownload}
            disabled={busy}
            className="btn btn-secondary disabled:opacity-50"
          >
            Скачать .docx
          </button>
          <button
            type="button"
            onClick={handleSaveAsNewVersion}
            disabled={busy}
            className="btn btn-primary"
          >
            Сохранить как новую версию
          </button>
        </div>
      </div>

      {error && <p className="mb-3 rounded-lg px-3 py-2 text-sm text-[var(--danger)] bg-[var(--danger-soft)]">{error}</p>}

      {proposed && (
        <div className="mb-3 flex items-center justify-between rounded-lg bg-amber-50 px-3 py-2 text-sm text-amber-800">
          <span>ИИ предложил изменения — они подсвечены.</span>
          <div className="flex gap-2">
            <button type="button" onClick={rejectChanges} className="font-medium hover:underline">
              Отменить
            </button>
            <button
              type="button"
              onClick={acceptChanges}
              className="rounded-md bg-accent px-3 py-1 font-medium text-white"
            >
              Принять изменения
            </button>
          </div>
        </div>
      )}

      {/* Вкладки на мобильном */}
      <div className="mb-3 flex gap-1 lg:hidden">
        {(['doc', 'chat'] as const).map((t) => (
          <button
            key={t}
            type="button"
            onClick={() => setTab(t)}
            className={`flex-1 rounded-lg px-3 py-2 text-sm font-medium ${
              tab === t ? 'bg-accent text-white' : 'bg-surface2 text-muted'
            }`}
          >
            {t === 'doc' ? 'Документ' : 'Правки'}
          </button>
        ))}
      </div>

      <div className="grid grid-cols-1 gap-4 lg:grid-cols-[1fr_360px]">
        {/* Документ */}
        <div className={`${tab === 'doc' ? 'block' : 'hidden'} lg:block`}>
          <div className="space-y-2 card p-4">
            {viewBlocks.map((block) => (
              <BlockRow
                key={block.id}
                block={block}
                readOnly={readOnly}
                highlighted={changedIds.has(block.id)}
                selected={selectedBlockId === block.id}
                onSelect={() =>
                  setSelectedBlockId((cur) => (cur === block.id ? null : block.id))
                }
                onPatch={(patch) => patchBlock(block.id, patch)}
                onDelete={() => deleteBlock(block.id)}
                onMove={(dir) => moveBlock(block.id, dir)}
                addMenuOpen={addMenuFor === block.id}
                onToggleAddMenu={() =>
                  setAddMenuFor((cur) => (cur === block.id ? null : block.id))
                }
                onAdd={(type) => addBlockAfter(block.id, type)}
              />
            ))}
          </div>
        </div>

        {/* Чат */}
        <div className={`${tab === 'chat' ? 'block' : 'hidden'} lg:block`}>
          <div className="flex h-[70vh] flex-col rounded-xl border border-border bg-surface">
            <div className="border-b border-border px-3 py-2 text-sm font-medium text-fg">
              Чат с ИИ
              {selectedBlockId && (
                <span className="ml-2 rounded-full bg-blue-100 px-2 py-0.5 text-xs text-blue-700">
                  правка выбранного блока
                </span>
              )}
            </div>
            <div className="flex-1 space-y-2 overflow-y-auto p-3">
              {messages.length === 0 && (
                <p className="text-sm text-muted">
                  Напишите, что изменить. Можно выделить блок слева, чтобы править только его.
                </p>
              )}
              {messages.map((m) => (
                <div
                  key={m.id}
                  className={`max-w-[85%] rounded-lg px-3 py-2 text-sm ${
                    m.role === 'user'
                      ? 'ml-auto bg-accent text-white'
                      : 'bg-surface2 text-fg'
                  }`}
                >
                  {m.content}
                </div>
              ))}
              {aiBusy && (
                <div className="max-w-[85%] rounded-lg bg-surface2 px-3 py-2 text-sm text-muted">
                  ИИ думает…
                </div>
              )}
            </div>
            <div className="border-t border-border p-3">
              <textarea
                value={chatInput}
                onChange={(e) => setChatInput(e.target.value)}
                onKeyDown={(e) => {
                  if (e.key === 'Enter' && !e.shiftKey) {
                    e.preventDefault();
                    sendToAi();
                  }
                }}
                rows={2}
                placeholder="Например: перепиши раздел об ответственности мягче"
                className="input-field resize-none"
              />
              <button
                type="button"
                onClick={sendToAi}
                disabled={aiBusy || !chatInput.trim()}
                className="mt-2 btn btn-primary w-full"
              >
                Отправить
              </button>
            </div>
          </div>
        </div>
      </div>

      {previewHtml !== null && (
        <div
          className="fixed inset-0 z-50 flex items-center justify-center bg-black/40 p-4 backdrop-blur-sm"
          onClick={() => setPreviewHtml(null)}
        >
          <div
            className="animate-modal max-h-[85vh] w-full max-w-2xl overflow-y-auto rounded-xl shadow-[var(--shadow)]"
            onClick={(e) => e.stopPropagation()}
          >
            <div
              className="doc-preview"
              // Превью строится из наших же блоков функцией blocksToPreviewHtml (экранирует текст).
              dangerouslySetInnerHTML={{ __html: previewHtml }}
            />
          </div>
        </div>
      )}
    </div>
  );
}

function BlockRow({
  block,
  readOnly,
  highlighted,
  selected,
  onSelect,
  onPatch,
  onDelete,
  onMove,
  addMenuOpen,
  onToggleAddMenu,
  onAdd,
}: {
  block: Block;
  readOnly: boolean;
  highlighted: boolean;
  selected: boolean;
  onSelect: () => void;
  onPatch: (patch: Partial<Block>) => void;
  onDelete: () => void;
  onMove: (dir: -1 | 1) => void;
  addMenuOpen: boolean;
  onToggleAddMenu: () => void;
  onAdd: (type: AddableType) => void;
}) {
  const textAreaClass =
    'w-full resize-none rounded-md border border-transparent bg-transparent px-2 py-1 text-sm hover:border-border focus:border-border focus:outline-none';

  return (
    <div
      className={`group relative rounded-lg border p-2 ${
        highlighted ? 'border-amber-300 bg-amber-50' : selected ? 'border-blue-400' : 'border-transparent'
      }`}
    >
      <div className="flex items-start gap-2">
        <div className="min-w-0 flex-1">
          {(block.type === 'heading' || block.type === 'clause') && (
            <span className="mr-1 text-xs text-muted">{block.number}</span>
          )}

          {(block.type === 'title' ||
            block.type === 'heading' ||
            block.type === 'clause' ||
            block.type === 'paragraph') && (
            <textarea
              value={block.text}
              readOnly={readOnly}
              onChange={(e) => onPatch({ text: e.target.value } as Partial<Block>)}
              rows={Math.max(1, Math.ceil(block.text.length / 70))}
              className={`${textAreaClass} ${block.type === 'title' ? 'text-center font-semibold' : ''} ${
                block.type === 'heading' ? 'font-medium' : ''
              }`}
            />
          )}

          {block.type === 'list' && (
            <ul className="space-y-1">
              {block.items.map((item, i) => (
                <li key={item.id} className="flex items-center gap-1">
                  <span className="text-muted">•</span>
                  <input
                    value={item.text}
                    readOnly={readOnly}
                    onChange={(e) => {
                      const items = block.items.map((it) =>
                        it.id === item.id ? { ...it, text: e.target.value } : it,
                      );
                      onPatch({ items } as Partial<Block>);
                    }}
                    className="w-full rounded-md border border-transparent px-2 py-1 text-sm hover:border-border focus:border-border focus:outline-none"
                  />
                  {!readOnly && (
                    <button
                      type="button"
                      onClick={() =>
                        onPatch({ items: block.items.filter((_, j) => j !== i) } as Partial<Block>)
                      }
                      className="text-xs text-muted hover:text-red-500"
                    >
                      ✕
                    </button>
                  )}
                </li>
              ))}
              {!readOnly && (
                <li>
                  <button
                    type="button"
                    onClick={() =>
                      onPatch({
                        items: [...block.items, { id: newId(), text: '' }],
                      } as Partial<Block>)
                    }
                    className="text-xs text-muted hover:text-fg"
                  >
                    + пункт
                  </button>
                </li>
              )}
            </ul>
          )}

          {block.type === 'table' && (
            <div className="overflow-x-auto">
              <table className="w-full border-collapse text-sm">
                <tbody>
                  {block.rows.map((row, ri) => (
                    <tr key={ri}>
                      {row.map((cell) => (
                        <td key={cell.id} className="border border-border p-1">
                          <input
                            value={cell.text}
                            readOnly={readOnly}
                            onChange={(e) => {
                              const rows = block.rows.map((r) =>
                                r.map((c) => (c.id === cell.id ? { ...c, text: e.target.value } : c)),
                              );
                              onPatch({ rows } as Partial<Block>);
                            }}
                            className="w-full px-1 py-0.5 text-sm focus:outline-none"
                          />
                        </td>
                      ))}
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}
        </div>

        {!readOnly && (
          <div className="flex shrink-0 items-center gap-0.5 opacity-0 transition group-hover:opacity-100">
            <button
              type="button"
              onClick={onSelect}
              title="Править этот блок через ИИ"
              className={`rounded px-1 text-xs ${selected ? 'text-blue-600' : 'text-muted hover:text-blue-600'}`}
            >
              ИИ
            </button>
            <button
              type="button"
              onClick={() => onMove(-1)}
              className="rounded px-1 text-muted hover:bg-surface2"
              title="Вверх"
            >
              ▲
            </button>
            <button
              type="button"
              onClick={() => onMove(1)}
              className="rounded px-1 text-muted hover:bg-surface2"
              title="Вниз"
            >
              ▼
            </button>
            <button
              type="button"
              onClick={onToggleAddMenu}
              className="rounded px-1 text-muted hover:bg-surface2"
              title="Добавить блок ниже"
            >
              ＋
            </button>
            <button
              type="button"
              onClick={onDelete}
              className="rounded px-1 text-red-400 hover:bg-red-50"
              title="Удалить"
            >
              ✕
            </button>
          </div>
        )}
      </div>

      {addMenuOpen && !readOnly && (
        <div className="mt-1 flex flex-wrap gap-1 rounded-lg bg-surface2 p-2">
          {ADD_TYPES.map((t) => (
            <button
              key={t.type}
              type="button"
              onClick={() => onAdd(t.type)}
              className="rounded-md border border-border bg-surface px-2 py-1 text-xs text-fg hover:border-border"
            >
              {t.label}
            </button>
          ))}
        </div>
      )}
    </div>
  );
}
