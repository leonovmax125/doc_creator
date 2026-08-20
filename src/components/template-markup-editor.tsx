'use client';

import { useEffect, useRef, useState } from 'react';
import { MarkFieldDialog } from './mark-field-dialog';
import {
  getMarkableUnits,
  updateMarkableUnitText,
  type Block,
  type TemplateField,
} from '@/lib/template-types';

type RequisiteOption = { field_key: string; field_label: string };

const SOURCE_LABELS: Record<string, (field: TemplateField) => string> = {
  org_requisite: (f) => `Реквизит организации: ${(f.source as { field_label: string }).field_label}`,
  client_requisite: (f) => `Реквизит клиента: ${(f.source as { field_label: string }).field_label}`,
  manual: (f) => {
    const labels = { text: 'Текст', number: 'Число', date: 'Дата', amount: 'Сумма' };
    const type = (f.source as { input_type: keyof typeof labels }).input_type;
    return `Ручной ввод (${labels[type]})`;
  },
  material: () => 'Материал из библиотеки',
  signature: () => 'Место подписи',
  stamp: () => 'Место печати',
};

function describeSource(field: TemplateField): string {
  return SOURCE_LABELS[field.source.type]?.(field) ?? field.source.type;
}

function renderTextWithPlaceholders(text: string) {
  const parts = text.split(/(\{\{[^}]+\}\})/g);
  return parts.map((part, index) =>
    /^\{\{[^}]+\}\}$/.test(part) ? (
      <mark key={index} className="rounded bg-amber-100 px-1 text-amber-800">
        {part}
      </mark>
    ) : (
      <span key={index}>{part}</span>
    ),
  );
}

export function TemplateMarkupEditor({
  templateId,
  name: initialName,
  category: initialCategory,
  initialBlocks,
  initialFields,
  orgRequisites,
  clientRequisites,
}: {
  templateId: string;
  name: string;
  category: string | null;
  initialBlocks: Block[];
  initialFields: TemplateField[];
  orgRequisites: RequisiteOption[];
  clientRequisites: RequisiteOption[];
}) {
  const [name, setName] = useState(initialName);
  const [category, setCategory] = useState(initialCategory ?? '');
  const [blocks, setBlocks] = useState<Block[]>(initialBlocks);
  const [fields, setFields] = useState<TemplateField[]>(initialFields);
  const [selection, setSelection] = useState<{ unitId: string; text: string } | null>(null);
  const [dialog, setDialog] = useState<{ unitId: string; text: string } | null>(null);

  const unitRefs = useRef<Map<string, HTMLElement>>(new Map());
  const dialogOpenRef = useRef(false);

  useEffect(() => {
    dialogOpenRef.current = dialog !== null;
  }, [dialog]);

  useEffect(() => {
    function onSelectionChange() {
      // Пока открыт диалог, не трогаем состояние выделения: клики и ввод
      // в полях диалога тоже вызывают selectionchange и иначе сбросили бы его.
      if (dialogOpenRef.current) return;

      const sel = window.getSelection();
      if (!sel || sel.isCollapsed) {
        setSelection(null);
        return;
      }
      const text = sel.toString().trim();
      if (!text) {
        setSelection(null);
        return;
      }
      for (const [unitId, el] of unitRefs.current) {
        if (el.contains(sel.anchorNode) && el.contains(sel.focusNode)) {
          setSelection({ unitId, text });
          return;
        }
      }
      setSelection(null);
    }

    document.addEventListener('selectionchange', onSelectionChange);
    return () => document.removeEventListener('selectionchange', onSelectionChange);
  }, []);

  async function patchTemplate(
    patch: { blocks?: Block[]; fields?: TemplateField[]; name?: string; category?: string | null },
  ) {
    await fetch(`/api/templates/${templateId}`, {
      method: 'PATCH',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(patch),
    });
  }

  const persist = patchTemplate;
  const persistMeta = patchTemplate;

  const [autoBusy, setAutoBusy] = useState(false);
  const [autoMsg, setAutoMsg] = useState<string | null>(null);

  async function runAutoMarkup() {
    setAutoBusy(true);
    setAutoMsg(null);
    const response = await fetch('/api/templates/auto-markup', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ templateId }),
    });
    setAutoBusy(false);

    if (!response.ok) {
      const body = await response.json().catch(() => null);
      setAutoMsg(body?.error ?? 'Не удалось разметить автоматически');
      return;
    }
    const data = (await response.json()) as { blocks: Block[]; fields: TemplateField[]; added: number };
    setBlocks(data.blocks);
    setFields(data.fields);
    setAutoMsg(
      data.added > 0
        ? `ИИ разметил полей: ${data.added}. Проверьте справа — лишнее можно снять, недостающее добавить вручную.`
        : 'ИИ не нашёл, что разметить. Попробуйте разметить вручную.',
    );
  }

  function addField(field: TemplateField, appendToEnd = false) {
    const units = getMarkableUnits(blocks);
    const unit = units.find((u) => u.id === field.block_id);
    if (!unit) return;

    const newText = appendToEnd
      ? `${unit.text} ${field.placeholder}`.trim()
      : unit.text.replace(field.original_text, field.placeholder);

    const newBlocks = updateMarkableUnitText(blocks, field.block_id, newText);
    const newFields = [...fields, field];
    setBlocks(newBlocks);
    setFields(newFields);
    persist({ blocks: newBlocks, fields: newFields });
  }

  function removeField(fieldId: string) {
    const field = fields.find((f) => f.id === fieldId);
    if (!field) return;

    const units = getMarkableUnits(blocks);
    const unit = units.find((u) => u.id === field.block_id);
    if (!unit) return;

    const newText = unit.text.replace(field.placeholder, field.original_text).trim();
    const newBlocks = updateMarkableUnitText(blocks, field.block_id, newText);
    const newFields = fields.filter((f) => f.id !== fieldId);
    setBlocks(newBlocks);
    setFields(newFields);
    persist({ blocks: newBlocks, fields: newFields });
  }

  function handleDialogConfirm(field: TemplateField) {
    addField(field);
    setDialog(null);
    setSelection(null);
    window.getSelection()?.removeAllRanges();
  }

  function insertSignatureOrStamp(unitId: string, type: 'signature' | 'stamp') {
    const field: TemplateField = {
      id: crypto.randomUUID(),
      name: type === 'signature' ? 'Место подписи' : 'Место печати',
      placeholder: type === 'signature' ? '{{signature}}' : '{{stamp}}',
      source: { type },
      block_id: unitId,
      original_text: '',
    };
    addField(field, true);
  }

  function hasPlaceholder(text: string) {
    return /\{\{[^}]+\}\}/.test(text);
  }

  function markWholeUnit(unitId: string, text: string) {
    const trimmed = text.trim();
    if (!trimmed) return;
    setDialog({ unitId, text: trimmed });
  }

  function registerRef(unitId: string) {
    return (el: HTMLElement | null) => {
      if (el) unitRefs.current.set(unitId, el);
      else unitRefs.current.delete(unitId);
    };
  }

  function SelectionToolbar({ unitId }: { unitId: string }) {
    if (selection?.unitId !== unitId) return null;
    return (
      <div className="mt-1 flex flex-wrap items-center gap-2 rounded-lg bg-surface2 px-2 py-1 text-xs">
        <span className="truncate text-muted">Выделено: «{selection.text}»</span>
        <button
          type="button"
          onClick={() => setDialog({ unitId, text: selection.text })}
          className="rounded-md bg-accent px-2 py-1 font-medium text-white"
        >
          Сделать полем
        </button>
      </div>
    );
  }

  const hasSignature = fields.some((f) => f.source.type === 'signature');
  const hasStamp = fields.some((f) => f.source.type === 'stamp');
  const existingPlaceholderKeys = fields.map((f) => f.placeholder.slice(2, -2));

  return (
    <div>
      <div className="mb-4 grid grid-cols-1 gap-3 card p-4 sm:grid-cols-2">
        <div>
          <label className="label">Название шаблона</label>
          <input
            value={name}
            onChange={(e) => setName(e.target.value)}
            onBlur={(e) => persistMeta({ name: e.target.value })}
            className="input-field"
          />
        </div>
        <div>
          <label className="label">Категория</label>
          <input
            value={category}
            onChange={(e) => setCategory(e.target.value)}
            onBlur={(e) => persistMeta({ category: e.target.value || null })}
            className="input-field"
          />
        </div>
      </div>

      <div className="mb-4 card p-4">
        <div className="flex flex-wrap items-center justify-between gap-3">
          <div>
            <p className="text-sm font-medium text-fg">Авторазметка полей</p>
            <p className="text-xs text-muted">
              ИИ сам найдёт реквизиты сторон, даты и суммы и проставит поля. Оформление шаблона
              сохранится.
            </p>
          </div>
          <button
            type="button"
            onClick={runAutoMarkup}
            disabled={autoBusy}
            className="btn btn-primary"
          >
            {autoBusy ? 'ИИ размечает…' : 'Разметить автоматически (ИИ)'}
          </button>
        </div>
        {autoMsg && (
          <p className="mt-3 rounded-lg px-3 py-2 text-sm" style={{ background: 'var(--accent-soft)', color: 'var(--accent-soft-fg)' }}>
            {autoMsg}
          </p>
        )}
      </div>

      <div className="grid grid-cols-1 gap-4 lg:grid-cols-[1fr_320px]">
        <div className="space-y-3 card p-4">
          {blocks.length === 0 && (
            <p className="text-sm text-muted">Не удалось распознать текст в этом файле.</p>
          )}

          {blocks.map((block) => {
            if (block.type === 'list') {
              return (
                <ul key={block.id} className="list-disc space-y-1 pl-5 text-sm text-fg">
                  {block.items.map((item) => (
                    <li key={item.id}>
                      <span ref={registerRef(item.id)}>{renderTextWithPlaceholders(item.text)}</span>
                      <SelectionToolbar unitId={item.id} />
                      {item.text.trim() && !hasPlaceholder(item.text) && (
                        <button
                          type="button"
                          onClick={() => markWholeUnit(item.id, item.text)}
                          className="ml-2 text-xs text-muted hover:text-fg"
                        >
                          Разметить целиком
                        </button>
                      )}
                    </li>
                  ))}
                </ul>
              );
            }

            if (block.type === 'table') {
              return (
                <div key={block.id} className="overflow-x-auto">
                  <table className="w-full border-collapse text-sm">
                    <tbody>
                      {block.rows.map((row, ri) => (
                        <tr key={ri}>
                          {row.map((cell) => (
                            <td key={cell.id} className="border border-border px-2 py-1 align-top">
                              <span ref={registerRef(cell.id)}>
                                {renderTextWithPlaceholders(cell.text)}
                              </span>
                              <SelectionToolbar unitId={cell.id} />
                              {cell.text.trim() && !hasPlaceholder(cell.text) && (
                                <button
                                  type="button"
                                  onClick={() => markWholeUnit(cell.id, cell.text)}
                                  className="mt-1 block text-xs text-muted hover:text-fg"
                                >
                                  Разметить целиком
                                </button>
                              )}
                            </td>
                          ))}
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              );
            }

            const isTitle = block.type === 'title';
            const textClassName = isTitle
              ? 'text-center font-semibold text-fg'
              : block.type === 'heading'
                ? 'font-medium text-fg'
                : 'text-sm text-fg';

            return (
              <div key={block.id}>
                <div className={textClassName}>
                  {(block.type === 'heading' || block.type === 'clause') && (
                    <span className="mr-2 text-muted">{block.number}</span>
                  )}
                  <span ref={registerRef(block.id)}>{renderTextWithPlaceholders(block.text)}</span>
                </div>

                <SelectionToolbar unitId={block.id} />

                <div className="mt-1 flex gap-3 text-xs text-muted">
                  {!hasSignature && (
                    <button
                      type="button"
                      onClick={() => insertSignatureOrStamp(block.id, 'signature')}
                      className="hover:text-fg"
                    >
                      + место для подписи
                    </button>
                  )}
                  {!hasStamp && (
                    <button
                      type="button"
                      onClick={() => insertSignatureOrStamp(block.id, 'stamp')}
                      className="hover:text-fg"
                    >
                      + место для печати
                    </button>
                  )}
                </div>
              </div>
            );
          })}
        </div>

        <div className="h-fit card p-4">
          <h2 className="mb-3 text-sm font-medium text-fg">Поля шаблона</h2>
          {fields.length === 0 ? (
            <p className="text-sm text-muted">
              Выделите текст в договоре слева и нажмите «Сделать полем».
            </p>
          ) : (
            <ul className="space-y-2">
              {fields.map((field) => (
                <li key={field.id} className="rounded-lg border border-border p-2 text-sm">
                  <div className="flex items-start justify-between gap-2">
                    <div className="min-w-0">
                      <p className="truncate font-medium text-fg">{field.name}</p>
                      <p className="truncate text-xs text-muted">{describeSource(field)}</p>
                      <p className="truncate text-xs text-muted">{field.placeholder}</p>
                    </div>
                    <button
                      type="button"
                      onClick={() => removeField(field.id)}
                      className="shrink-0 text-xs font-medium text-red-600 hover:text-red-800"
                    >
                      Снять
                    </button>
                  </div>
                </li>
              ))}
            </ul>
          )}
        </div>
      </div>

      {dialog && (
        <MarkFieldDialog
          blockId={dialog.unitId}
          selectedText={dialog.text}
          orgRequisites={orgRequisites}
          clientRequisites={clientRequisites}
          existingPlaceholderKeys={existingPlaceholderKeys}
          onConfirm={handleDialogConfirm}
          onClose={() => setDialog(null)}
        />
      )}
    </div>
  );
}
