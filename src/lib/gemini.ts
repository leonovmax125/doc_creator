import { GoogleGenAI } from '@google/genai';
import { sql } from './db';
import { coerceText, type Block } from './template-types';

// Flash — для правок и разбора, Pro — для генерации с нуля (см. CLAUDE.md, шаг 5).
// Используем стабильные алиасы -latest: конкретные версии (например
// gemini-2.5-flash) закрываются Google для новых пользователей, а -latest
// всегда указывает на доступную актуальную модель. Поменяйте id при желании.
export const GEMINI_FLASH = 'gemini-flash-latest';
export const GEMINI_PRO = 'gemini-pro-latest';

/**
 * Ключ Gemini: сначала личный ключ пользователя из user_settings, иначе общий
 * ключ из переменной окружения.
 */
export async function resolveGeminiKey(userId: string): Promise<string | null> {
  const rows = await sql<{ gemini_api_key: string | null }[]>`
    select gemini_api_key from user_settings where user_id = ${userId} limit 1
  `;
  const personal = rows[0]?.gemini_api_key?.trim();
  return personal || process.env.GEMINI_API_KEY?.trim() || null;
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

/**
 * Запрашивает у модели строго JSON по тексту и/или изображению (Gemini —
 * мультимодальная модель, читает скрины/фото). При временной перегрузке
 * (503/429/UNAVAILABLE) повторяет запрос с паузой, затем бросает понятную
 * ошибку по-русски вместо технического JSON от Google.
 */
export async function generateJson(
  model: string,
  prompt: string,
  apiKey: string,
  image?: InlineImage,
): Promise<unknown> {
  const ai = makeClient(apiKey);
  const delays = [1500, 4000, 8000];

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
      if (isTransient(err)) {
        throw new Error('ИИ сейчас перегружен. Подождите несколько секунд и попробуйте ещё раз.');
      }
      throw err;
    }
  }
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
  let lastError: unknown;
  for (let attempt = 0; attempt < 2; attempt += 1) {
    try {
      const raw = await generateJson(model, prompt, apiKey);
      return parseBlocksFromAi(raw);
    } catch (err) {
      lastError = err;
    }
  }
  throw lastError instanceof Error ? lastError : new Error('Модель вернула некорректный ответ');
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
