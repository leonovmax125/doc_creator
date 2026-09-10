'use client';

import { useDictation } from '@/lib/use-dictation';

/**
 * Кнопка-микрофон для голосового ввода правки. Пишет распознанный текст через
 * onText (родитель дописывает его в поле). Если браузер не поддерживает
 * распознавание — кнопка не показывается.
 */
export function DictationButton({
  onText,
  className = '',
}: {
  onText: (text: string) => void;
  className?: string;
}) {
  const { supported, listening, toggle } = useDictation(onText);
  if (!supported) return null;

  return (
    <button
      type="button"
      onClick={toggle}
      title={listening ? 'Остановить диктовку' : 'Диктовать голосом'}
      aria-label={listening ? 'Остановить диктовку' : 'Диктовать голосом'}
      aria-pressed={listening}
      className={`inline-flex h-9 w-9 shrink-0 items-center justify-center rounded-lg border transition-colors ${
        listening
          ? 'border-transparent bg-[var(--danger)] text-white animate-pulse'
          : 'border-border text-muted hover:bg-surface2 hover:text-fg'
      } ${className}`}
    >
      <svg
        viewBox="0 0 24 24"
        width={18}
        height={18}
        fill="none"
        stroke="currentColor"
        strokeWidth={1.8}
        strokeLinecap="round"
        strokeLinejoin="round"
        aria-hidden
      >
        <rect x="9" y="2" width="6" height="11" rx="3" />
        <path d="M5 10a7 7 0 0 0 14 0" />
        <path d="M12 17v4M8 21h8" />
      </svg>
    </button>
  );
}
