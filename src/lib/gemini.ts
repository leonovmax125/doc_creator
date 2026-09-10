import { GoogleGenAI } from '@google/genai';
import type { SupabaseClient } from '@supabase/supabase-js';
import { coerceText, type Block } from './template-types';
import { GEMINI_FLASH, GEMINI_PRO, GEMINI_FLASH_LITE, GEMINI_MODELS } from './gemini-models';

// Идентификаторы моделей Gemini и список для выбора — в ./gemini-models (client-safe).
// Модель для ИИ-операций выбирает пользователь (Настройки → Ключи ИИ); по умолчанию
// Flash. При перегрузке выбранной модели generateJson сам откатывается на Flash-Lite.
export { GEMINI_FLASH, GEMINI_PRO, GEMINI_FLASH_LITE, GEMINI_MODELS };

const ALLOWED_MODELS = new Set(GEMINI_MODELS.map((m) => m.id));

/**
 * Ключ Gemini: сначала личный ключ пользователя из user_settings (RLS вернёт
 * только его собственную строку), иначе общий ключ из переменной окружения.
 */
export async function resolveGeminiKey(supabase: SupabaseClient): Promise<string | null> {
  const { data } = await supabase.from('user_settings').select('gemini_api_key').maybeSingle();
  const personal = data?.gemini_api_key?.trim();
  return personal || process.env.GEMINI_API_KEY?.trim() || null;
}

/**
 * Ключ и выбранная модель одним запросом к user_settings (на «горячем» ИИ-пути
 * не делаем два отдельных SELECT одной и той же строки).
 */
export async function resolveGeminiSettings(
  supabase: SupabaseClient,
): Promise<{ apiKey: string | null; model: string }> {
  const { data } = await supabase
    .from('user_settings')
    .select('gemini_api_key, gemini_model')
    .maybeSingle();
  const apiKey = data?.gemini_api_key?.trim() || process.env.GEMINI_API_KEY?.trim() || null;
  const chosen = data?.gemini_model?.trim();
  return { apiKey, model: chosen && ALLOWED_MODELS.has(chosen) ? chosen : GEMINI_FLASH };
}

function makeClient(apiKey: string): GoogleGenAI {
  return new GoogleGenAI({ apiKey });
}

const sleep = (ms: number) => new Promise((r) => setTimeout(r, ms));

/** Временная перегрузка модели — есть смысл повторить запрос. */
function isTransient(err: unknown): boolean {
  const s = (err instanceof Error ? err.message : String(err)).toLowerCase();
  return (
    s.includes('503') ||
    s.includes('429') ||
    s.includes('unavailable') ||
    s.includes('overloaded') ||
    s.includes('high demand') ||
    s.includes('rate limit')
  );
}

export type InlineImage = { data: string; mimeType: string };

/** Одна модель с повторами при временной перегрузке. Пробрасывает исходную
 *  ошибку наверх (в т.ч. перегрузку), чтобы generateJson решил про откат на
 *  лёгкую модель и итоговое сообщение пользователю. */
async function attemptModel(
  model: string,
  prompt: string,
  apiKey: string,
  image?: InlineImage,
): Promise<unknown> {
  const ai = makeClient(apiKey);
  // Держим суммарные паузы небольшими: с учётом отката на вторую модель и
  // лимита времени функции (maxDuration) длинные повторы приводили к 504.
  const delays = [1500, 4000];

  const contents = image
    ? [{ role: 'user', parts: [{ text: prompt }, { inlineData: image }] }]
    : prompt;

  for (let attempt = 0; ; attempt += 1) {
    try {
      const response = await ai.models.generateContent({
        model,
        contents,
        config: { responseMimeType: 'application/json', temperature: 0.4 },
      });

      const text = response.text;
      if (!text) throw new Error('Пустой ответ модели');

      // На всякий случай убираем markdown-обёртку, если она вдруг появилась.
      const cleaned = text
        .trim()
        .replace(/^```(?:json)?\s*/i, '')
        .replace(/\s*```$/i, '');

      return JSON.parse(cleaned);
    } catch (err) {
      if (isTransient(err) && attempt < delays.length) {
        await sleep(delays[attempt]);
        continue;
      }
      throw err;
    }
  }
}

/**
 * Запрашивает у модели строго JSON по тексту и/или изображению (Gemini —
 * мультимодальная модель, читает скрины/фото). Повторяет запрос при временной
 * перегрузке; если выбранная модель занята даже после повторов — автоматически
 * пробует лёгкую Flash-Lite, и лишь затем бросает понятную ошибку по-русски.
 */
export async function generateJson(
  model: string,
  prompt: string,
  apiKey: string,
  image?: InlineImage,
): Promise<unknown> {
  // Если выбранная модель перегружена даже после повторов — автоматически
  // пробуем более лёгкую Flash-Lite (у неё запас по нагрузке), потом сдаёмся.
  const chain = model === GEMINI_FLASH_LITE ? [model] : [model, GEMINI_FLASH_LITE];
  let lastError: unknown;

  for (const m of chain) {
    try {
      return await attemptModel(m, prompt, apiKey, image);
    } catch (err) {
      lastError = err;
      if (isTransient(err)) continue; // занята — пробуем следующую модель
      throw err; // настоящая ошибка — не имеет смысла менять модель
    }
  }

  if (isTransient(lastError)) {
    throw new Error('ИИ сейчас перегружен. Подождите несколько секунд и попробуйте ещё раз.');
  }
  throw lastError instanceof Error ? lastError : new Error('Модель вернула ошибку');
}

/**
 * Запрашивает у модели структуру блоков и валидирует её. Если ответ невалиден
 * — повторяет запрос один раз (как требует CLAUDE.md, шаг 5), потом бросает.
 */
export async function generateBlocks(
  model: string,
  prompt: string,
  apiKey: string,
): Promise<Block[]> {
  // generateJson сам повторяет запрос и откатывается на лёгкую модель при
  // перегрузке — его ошибку здесь НЕ повторяем (иначе удвоили бы время и могли
  // выйти за лимит времени функции). Повторяем только когда модель вернула
  // корректный JSON, но непригодную структуру блоков.
  let lastParseError: unknown;
  for (let attempt = 0; attempt < 2; attempt += 1) {
    const raw = await generateJson(model, prompt, apiKey); // перегрузку/ошибку API пробрасываем сразу
    try {
      return parseBlocksFromAi(raw);
    } catch (err) {
      lastParseError = err;
    }
  }
  throw lastParseError instanceof Error
    ? lastParseError
    : new Error('Модель вернула некорректный ответ');
}

const VALID_TYPES = new Set([
  'title',
  'heading',
  'paragraph',
  'clause',
  'list',
  'table',
  'requisites_table',
  'signatures',
  'page_break',
]);

let idCounter = 0;
function makeId() {
  idCounter += 1;
  return `ai${Date.now().toString(36)}${idCounter}`;
}

// coerceText надёжно достаёт текст даже когда ИИ вернул пункт/ячейку объектом.
const toText = coerceText;

/**
 * Приводит ответ модели к валидному массиву блоков нашей структуры
 * (см. CLAUDE.md 2.1). Бросает исключение, если структура непригодна.
 */
export function parseBlocksFromAi(raw: unknown): Block[] {
  const arr = Array.isArray(raw)
    ? raw
    : raw && typeof raw === 'object' && Array.isArray((raw as { blocks?: unknown }).blocks)
      ? (raw as { blocks: unknown[] }).blocks
      : null;

  if (!arr) throw new Error('Ответ не содержит массив blocks');

  const blocks: Block[] = [];

  for (const item of arr) {
    if (!item || typeof item !== 'object') continue;
    const b = item as Record<string, unknown>;
    const type = b.type;
    if (typeof type !== 'string' || !VALID_TYPES.has(type)) continue;

    const id = typeof b.id === 'string' && b.id ? b.id : makeId();

    switch (type) {
      case 'title':
      case 'paragraph':
        blocks.push({ id, type, text: toText(b.text) });
        break;
      case 'heading':
      case 'clause':
        blocks.push({ id, type, number: toText(b.number), text: toText(b.text) });
        break;
      case 'list': {
        const items = Array.isArray(b.items) ? b.items : [];
        blocks.push({
          id,
          type: 'list',
          items: items.map((it) => ({ id: makeId(), text: toText(it) })),
        });
        break;
      }
      case 'table': {
        const rows = Array.isArray(b.rows) ? b.rows : [];
        blocks.push({
          id,
          type: 'table',
          rows: rows.map((row) =>
            (Array.isArray(row) ? row : []).map((cell) => ({ id: makeId(), text: toText(cell) })),
          ),
        });
        break;
      }
      // requisites_table / signatures / page_break — служебные, у них нет текста.
      // Пока не рендерим их в сборке с нуля, поэтому просто пропускаем.
      default:
        break;
    }
  }

  if (blocks.length === 0) throw new Error('Не удалось разобрать ни одного блока');
  return blocks;
}
