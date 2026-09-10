'use client';

import { useEffect, useMemo, useState } from 'react';
import Link from 'next/link';
import { createClient } from '@/lib/supabase/client';
import type { TemplateField } from '@/lib/template-types';
import { DictationButton } from '@/components/dictation-button';

type Client = { id: string; name: string };
type Template = { id: string; name: string; category: string | null; fields: TemplateField[] };
type OrgRequisite = { field_key: string; field_label: string; field_value: string };
type Stamp = { id: string; name: string; type: 'signature' | 'stamp' };
type Material = { id: string; name: string };

type Mode = 'strict' | 'assisted';

const MODE_INFO: { id: Mode; label: string; hint: string }[] = [
  { id: 'strict', label: 'Строго по шаблону', hint: 'Быстро, без ИИ — подстановка размеченных полей' },
  {
    id: 'assisted',
    label: 'Шаблон + правки ИИ',
    hint: 'Описать словами, что изменить; ИИ правит документ, сохраняя оформление',
  },
];

const MANUAL_INPUT_LABELS: Record<'text' | 'number' | 'date' | 'amount', string> = {
  text: 'Текст',
  number: 'Число',
  date: 'Дата',
  amount: 'Сумма',
};

function stepLabels(mode: Mode): string[] {
  if (mode === 'assisted') return ['Клиент', 'Режим', 'Шаблон', 'Правки'];
  return ['Клиент', 'Режим', 'Шаблон', 'Поля'];
}

/** Пресет для режима «Новая версия» — открывает мастер сразу на шаге полей. */
export type WizardPreset = {
  caseId: string;
  caseTitle: string;
  clientId: string;
  templateId: string;
  values: Record<string, string>;
};

export function ContractWizard({
  clients,
  templates,
  orgRequisites,
  stamps,
  materials = [],
  preset,
  initialClientId,
}: {
  clients: Client[];
  templates: Template[];
  orgRequisites: OrgRequisite[];
  stamps: Stamp[];
  materials?: Material[];
  preset?: WizardPreset;
  initialClientId?: string;
}) {
  const supabase = createClient();
  const isNewVersion = !!preset;
  const [step, setStep] = useState(preset ? 4 : 1);
  const [mode, setMode] = useState<Mode>('strict');

  const [clientList, setClientList] = useState(clients);
  const [selectedClientId, setSelectedClientId] = useState<string | null>(
    preset?.clientId ?? initialClientId ?? null,
  );
  const [newClientMode, setNewClientMode] = useState(false);
  const [newClientName, setNewClientName] = useState('');
  const [creatingClient, setCreatingClient] = useState(false);

  const [selectedTemplateId, setSelectedTemplateId] = useState<string | null>(
    preset?.templateId ?? null,
  );
  const [caseTitle, setCaseTitle] = useState(preset?.caseTitle ?? '');

  const [clientValues, setClientValues] = useState<Record<string, string>>({});
  const [manualValues, setManualValues] = useState<Record<string, string>>(preset?.values ?? {});

  // Режим «Шаблон + правки ИИ»
  const [instruction, setInstruction] = useState('');
  const [selectedMaterialIds, setSelectedMaterialIds] = useState<string[]>([]);

  const [showSignatureDialog, setShowSignatureDialog] = useState(false);
  const [selectedSignatureId, setSelectedSignatureId] = useState<string | ''>('');
  const [selectedStampId, setSelectedStampId] = useState<string | ''>('');

  const [generating, setGenerating] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [result, setResult] = useState<{
    url: string;
    filename: string;
    warnings: string[];
    caseId: string;
    versionId?: string;
  } | null>(null);

  const orgValueByKey = useMemo(
    () => new Map(orgRequisites.map((r) => [r.field_key, r])),
    [orgRequisites],
  );

  const labels = stepLabels(mode);
  const selectedTemplate = templates.find((t) => t.id === selectedTemplateId) ?? null;
  const signatures = stamps.filter((s) => s.type === 'signature');
  const stampImages = stamps.filter((s) => s.type === 'stamp');

  useEffect(() => {
    if (!selectedClientId) return;
    supabase
      .from('requisites')
      .select('field_key, field_value')
      .eq('owner_type', 'client')
      .eq('owner_id', selectedClientId)
      .then(({ data }) => {
        const map: Record<string, string> = {};
        for (const row of data ?? []) map[row.field_key] = row.field_value;
        setClientValues(map);
      });
  }, [selectedClientId, supabase]);

  async function handleCreateClient() {
    if (!newClientName.trim()) return;
    setCreatingClient(true);
    const {
      data: { user },
    } = await supabase.auth.getUser();
    if (!user) return;

    const { data, error: insertError } = await supabase
      .from('clients')
      .insert({ user_id: user.id, name: newClientName.trim() })
      .select('id, name')
      .single();

    setCreatingClient(false);
    if (insertError || !data) {
      setError('Не удалось создать клиента');
      return;
    }
    setClientList((prev) => [...prev, data]);
    setSelectedClientId(data.id);
    setNewClientMode(false);
    setNewClientName('');
  }

  async function handleDownload(url: string, filename: string) {
    const response = await fetch(url);
    const blob = await response.blob();
    const objectUrl = URL.createObjectURL(blob);
    const link = document.createElement('a');
    link.href = objectUrl;
    link.download = filename;
    document.body.appendChild(link);
    link.click();
    link.remove();
    URL.revokeObjectURL(objectUrl);
  }

  function goNext() {
    setError(null);
    setStep((s) => Math.min(s + 1, 4));
  }
  function goBack() {
    setError(null);
    setStep((s) => Math.max(s - 1, 1));
  }

  function toggleInArray(arr: string[], id: string): string[] {
    return arr.includes(id) ? arr.filter((x) => x !== id) : [...arr, id];
  }

  async function handleGenerateStrict() {
    if (!selectedClientId || !selectedTemplateId) return;
    setGenerating(true);
    setError(null);

    const response = await fetch('/api/contracts/generate', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        templateId: selectedTemplateId,
        clientId: selectedClientId,
        values: manualValues,
        signatureId: selectedSignatureId || null,
        stampId: selectedStampId || null,
        caseTitle: caseTitle || null,
        caseId: preset?.caseId ?? null,
      }),
    });

    setGenerating(false);
    setShowSignatureDialog(false);

    if (!response.ok) {
      const body = await response.json().catch(() => null);
      setError(body?.error ?? 'Не удалось сгенерировать договор');
      return;
    }
    setResult(await response.json());
  }

  async function handleGenerateAi() {
    if (!selectedClientId) return;
    setGenerating(true);
    setError(null);

    const response = await fetch('/api/contracts/generate-ai', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        mode,
        clientId: selectedClientId,
        caseTitle: caseTitle || null,
        caseId: preset?.caseId ?? null,
        templateId: selectedTemplateId,
        instruction,
        materialIds: selectedMaterialIds,
      }),
    });

    setGenerating(false);

    if (!response.ok) {
      const body = await response.json().catch(() => null);
      setError(body?.error ?? 'Не удалось сгенерировать договор');
      return;
    }
    setResult(await response.json());
  }

  function onGenerateClick() {
    if (mode === 'strict') setShowSignatureDialog(true);
    else handleGenerateAi();
  }

  const canProceedFromStep3 = !!selectedTemplateId;
  const canGenerate = mode === 'assisted' ? instruction.trim().length > 0 : true;

  return (
    <div className="mx-auto max-w-2xl">
      <div className="mb-6 flex items-center justify-between">
        {labels.map((label, i) => (
          <div key={label} className="flex flex-1 items-center">
            <div
              className={`flex h-7 w-7 shrink-0 items-center justify-center rounded-full text-xs font-medium ${
                step === i + 1
                  ? 'bg-accent text-white'
                  : step > i + 1
                    ? 'bg-surface2 text-fg'
                    : 'bg-surface2 text-muted'
              }`}
            >
              {i + 1}
            </div>
            <span className="ml-2 hidden text-sm text-muted sm:inline">{label}</span>
            {i < labels.length - 1 && <div className="mx-2 h-px flex-1 bg-gray-200" />}
          </div>
        ))}
      </div>

      {result ? (
        <div className="card p-5">
          <h2 className="mb-2 text-lg font-semibold text-fg">Договор готов</h2>
          {result.warnings.length > 0 && (
            <div className="mb-4 rounded-lg bg-amber-50 p-3 text-sm text-amber-800">
              <p className="mb-1 font-medium">Проверьте перед отправкой:</p>
              <ul className="list-disc pl-5">
                {result.warnings.map((w, i) => (
                  <li key={i}>{w}</li>
                ))}
              </ul>
            </div>
          )}
          <div className="flex flex-wrap gap-2">
            <button
              type="button"
              onClick={() => handleDownload(result.url, result.filename)}
              className="btn btn-primary"
            >
              Скачать {result.filename}
            </button>
            {result.versionId && (
              <Link
                href={`/dashboard/contracts/${result.caseId}/refine/${result.versionId}`}
                className="btn btn-secondary"
              >
                Доработать с ИИ
              </Link>
            )}
            <Link href={`/dashboard/contracts/${result.caseId}`} className="btn btn-secondary">
              Открыть дело
            </Link>
          </div>
        </div>
      ) : (
        <div className="card p-5">
          {step === 1 && (
            <div>
              <h2 className="mb-3 text-lg font-semibold text-fg">Выберите клиента</h2>
              <div className="space-y-2">
                {clientList.map((client) => (
                  <label
                    key={client.id}
                    className={`flex cursor-pointer items-center gap-2 rounded-lg border p-3 text-sm ${
                      selectedClientId === client.id ? 'border-accent' : 'border-border'
                    }`}
                  >
                    <input
                      type="radio"
                      checked={selectedClientId === client.id}
                      onChange={() => setSelectedClientId(client.id)}
                    />
                    {client.name}
                  </label>
                ))}
              </div>

              {newClientMode ? (
                <div className="mt-3 flex gap-2">
                  <input
                    value={newClientName}
                    onChange={(e) => setNewClientName(e.target.value)}
                    placeholder="Название клиента"
                    className="input-field flex-1"
                  />
                  <button
                    type="button"
                    onClick={handleCreateClient}
                    disabled={creatingClient}
                    className="btn btn-primary"
                  >
                    Создать
                  </button>
                </div>
              ) : (
                <button
                  type="button"
                  onClick={() => setNewClientMode(true)}
                  className="mt-3 text-sm font-medium text-muted hover:text-fg"
                >
                  + Новый клиент
                </button>
              )}
            </div>
          )}

          {step === 2 && (
            <div>
              <h2 className="mb-3 text-lg font-semibold text-fg">Выберите режим</h2>
              <div className="space-y-2">
                {MODE_INFO.map((m) => (
                  <label
                    key={m.id}
                    className={`flex cursor-pointer items-start gap-2 rounded-lg border p-3 text-sm ${
                      mode === m.id ? 'border-accent bg-surface2' : 'border-border'
                    }`}
                  >
                    <input
                      type="radio"
                      checked={mode === m.id}
                      onChange={() => setMode(m.id)}
                      className="mt-0.5"
                    />
                    <span>
                      <span className="font-medium text-fg">{m.label}</span>
                      <span className="block text-xs text-muted">{m.hint}</span>
                    </span>
                  </label>
                ))}
              </div>
            </div>
          )}

          {step === 3 && (
            <div>
              <h2 className="mb-3 text-lg font-semibold text-fg">Выберите шаблон</h2>
              {templates.length === 0 ? (
                <p className="text-sm text-muted">Сначала загрузите шаблон в разделе «Шаблоны».</p>
              ) : (
                <div className="space-y-2">
                  {templates.map((template) => (
                    <label
                      key={template.id}
                      className={`flex cursor-pointer items-center justify-between rounded-lg border p-3 text-sm ${
                        selectedTemplateId === template.id ? 'border-accent' : 'border-border'
                      }`}
                    >
                      <span className="flex items-center gap-2">
                        <input
                          type="radio"
                          checked={selectedTemplateId === template.id}
                          onChange={() => setSelectedTemplateId(template.id)}
                        />
                        {template.name}
                      </span>
                      {template.category && (
                        <span className="text-xs text-muted">{template.category}</span>
                      )}
                    </label>
                  ))}
                </div>
              )}

              {mode === 'assisted' && (
                <div className="mt-5">
                  <p className="mb-2 text-sm font-medium text-fg">
                    Материалы для учёта (необязательно)
                  </p>
                  {materials.length === 0 ? (
                    <p className="text-sm text-muted">
                      Нет материалов — добавьте их в разделе «Материалы».
                    </p>
                  ) : (
                    <div className="space-y-2">
                      {materials.map((m) => (
                        <label
                          key={m.id}
                          className="flex cursor-pointer items-center gap-2 rounded-lg border border-border p-3 text-sm"
                        >
                          <input
                            type="checkbox"
                            checked={selectedMaterialIds.includes(m.id)}
                            onChange={() =>
                              setSelectedMaterialIds((prev) => toggleInArray(prev, m.id))
                            }
                          />
                          {m.name}
                        </label>
                      ))}
                    </div>
                  )}
                  <p className="mt-2 text-xs text-muted">
                    ИИ учтёт содержимое выбранных материалов при правке договора.
                  </p>
                </div>
              )}
            </div>
          )}

          {step === 4 && (
            <div>
              {!isNewVersion && (
                <div className="mb-4">
                  <label className="label">Название дела</label>
                  <input
                    value={caseTitle}
                    onChange={(e) => setCaseTitle(e.target.value)}
                    placeholder={`Договор с ${
                      clientList.find((c) => c.id === selectedClientId)?.name ?? 'клиентом'
                    }`}
                    className="input-field"
                  />
                </div>
              )}

              {mode === 'strict' && selectedTemplate && (
                <>
                  <h2 className="mb-3 text-lg font-semibold text-fg">Заполните поля</h2>
                  <div className="space-y-3">
                    {selectedTemplate.fields
                      .filter((f) => f.source.type !== 'signature' && f.source.type !== 'stamp')
                      .map((field) => {
                        if (field.source.type === 'org_requisite') {
                          const req = orgValueByKey.get(field.source.field_key);
                          return (
                            <div key={field.id}>
                              <label className="label">
                                {field.name}
                              </label>
                              <input
                                readOnly
                                value={req?.field_value ?? ''}
                                className="w-full rounded-lg border border-border bg-surface2 px-3 py-2 text-sm text-muted"
                              />
                              <p className="mt-1 text-xs text-muted">Из реквизитов организации</p>
                            </div>
                          );
                        }

                        if (field.source.type === 'client_requisite') {
                          const value = clientValues[field.source.field_key];
                          if (value !== undefined) {
                            return (
                              <div key={field.id}>
                                <label className="label">
                                  {field.name}
                                </label>
                                <input
                                  readOnly
                                  value={value}
                                  className="w-full rounded-lg border border-border bg-surface2 px-3 py-2 text-sm text-muted"
                                />
                                <p className="mt-1 text-xs text-muted">Из реквизитов клиента</p>
                              </div>
                            );
                          }
                          return (
                            <div key={field.id}>
                              <label className="label">
                                {field.name}
                              </label>
                              <input
                                value={manualValues[field.id] ?? ''}
                                onChange={(e) =>
                                  setManualValues((prev) => ({ ...prev, [field.id]: e.target.value }))
                                }
                                className="input-field"
                              />
                              <p className="mt-1 text-xs text-muted">
                                У клиента нет этого реквизита — впишите вручную
                              </p>
                            </div>
                          );
                        }

                        if (field.source.type === 'manual') {
                          const inputType =
                            field.source.input_type === 'date'
                              ? 'date'
                              : field.source.input_type === 'amount' ||
                                  field.source.input_type === 'number'
                                ? 'number'
                                : 'text';
                          return (
                            <div key={field.id}>
                              <label className="label">
                                {field.name}
                              </label>
                              <input
                                type={inputType}
                                step={field.source.input_type === 'amount' ? '0.01' : undefined}
                                value={manualValues[field.id] ?? ''}
                                onChange={(e) =>
                                  setManualValues((prev) => ({ ...prev, [field.id]: e.target.value }))
                                }
                                className="input-field"
                              />
                              <p className="mt-1 text-xs text-muted">
                                Ручной ввод ({MANUAL_INPUT_LABELS[field.source.input_type]})
                              </p>
                            </div>
                          );
                        }

                        return null;
                      })}
                  </div>
                </>
              )}

              {mode === 'assisted' && (
                <>
                  <h2 className="mb-3 text-lg font-semibold text-fg">Что изменить в шаблоне</h2>
                  <div className="flex items-start gap-2">
                    <textarea
                      value={instruction}
                      onChange={(e) => setInstruction(e.target.value)}
                      rows={5}
                      placeholder="Например: убери пункт про предоплату, добавь раздел о конфиденциальности, срок сделай 3 месяца"
                      className="input-field flex-1"
                    />
                    <DictationButton
                      onText={(t) =>
                        setInstruction((prev) => (prev.trim() ? `${prev.trim()} ${t}` : t))
                      }
                    />
                  </div>
                  <p className="mt-2 text-xs text-muted">
                    ИИ внесёт правки прямо в ваш .docx, сохранив оформление, и подставит реквизиты
                    выбранного клиента. Опишите словами, что поменять.
                  </p>
                </>
              )}
            </div>
          )}

          {generating && mode === 'assisted' && (
            <p className="mt-4 rounded-lg bg-blue-50 px-3 py-2 text-sm text-blue-700">
              ИИ работает над договором, это может занять до минуты…
            </p>
          )}

          {error && <p className="mt-4 rounded-lg px-3 py-2 text-sm text-[var(--danger)] bg-[var(--danger-soft)]">{error}</p>}

          <div className="mt-5 flex justify-between">
            <button
              type="button"
              onClick={goBack}
              disabled={step === 1 || isNewVersion}
              className="rounded-lg px-3 py-2 text-sm font-medium text-muted hover:bg-surface2 disabled:opacity-0"
            >
              Назад
            </button>

            {step < 4 ? (
              <button
                type="button"
                onClick={goNext}
                disabled={(step === 1 && !selectedClientId) || (step === 3 && !canProceedFromStep3)}
                className="btn btn-primary disabled:opacity-50"
              >
                Далее
              </button>
            ) : (
              <button
                type="button"
                onClick={onGenerateClick}
                disabled={generating || !canGenerate}
                className="btn btn-primary disabled:opacity-50"
              >
                {generating ? 'Готовим…' : 'Сгенерировать договор'}
              </button>
            )}
          </div>
        </div>
      )}

      {showSignatureDialog && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/40 px-4 backdrop-blur-sm">
          <div className="card animate-modal w-full max-w-sm p-5 shadow-[var(--shadow)]">
            <h2 className="mb-3 text-lg font-semibold text-fg">Подпись и печать</h2>

            <div className="mb-3">
              <label className="label">Подпись</label>
              <select
                value={selectedSignatureId}
                onChange={(e) => setSelectedSignatureId(e.target.value)}
                className="input-field"
              >
                <option value="">Без подписи</option>
                {signatures.map((s) => (
                  <option key={s.id} value={s.id}>
                    {s.name}
                  </option>
                ))}
              </select>
            </div>

            <div className="mb-4">
              <label className="label">Печать</label>
              <select
                value={selectedStampId}
                onChange={(e) => setSelectedStampId(e.target.value)}
                className="input-field"
              >
                <option value="">Без печати</option>
                {stampImages.map((s) => (
                  <option key={s.id} value={s.id}>
                    {s.name}
                  </option>
                ))}
              </select>
            </div>

            <div className="flex justify-end gap-2">
              <button
                type="button"
                onClick={() => setShowSignatureDialog(false)}
                className="rounded-lg px-3 py-2 text-sm font-medium text-muted hover:bg-surface2"
              >
                Отмена
              </button>
              <button
                type="button"
                onClick={handleGenerateStrict}
                disabled={generating}
                className="btn btn-primary disabled:opacity-50"
              >
                {generating ? 'Готовим…' : 'Готово'}
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
