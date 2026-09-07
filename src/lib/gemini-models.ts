// Список моделей Gemini и идентификаторы — без серверных зависимостей, чтобы
// можно было импортировать и в клиентских компонентах (выпадающий список),
// и на сервере (gemini.ts).

export const GEMINI_FLASH = 'gemini-flash-latest';
export const GEMINI_PRO = 'gemini-pro-latest';
// Самая лёгкая модель: выше пропускная способность, реже «перегружена» (503).
export const GEMINI_FLASH_LITE = 'gemini-flash-lite-latest';

/** Модели, доступные пользователю для выбора (Настройки → Ключи ИИ). */
export const GEMINI_MODELS: { id: string; label: string }[] = [
  { id: GEMINI_FLASH_LITE, label: 'Flash-Lite — самая лёгкая, реже перегружается' },
  { id: GEMINI_FLASH, label: 'Flash — баланс скорости и качества (по умолчанию)' },
  { id: GEMINI_PRO, label: 'Pro — самая умная, но чаще занята' },
];
