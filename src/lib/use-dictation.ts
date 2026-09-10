'use client';

import { useCallback, useEffect, useRef, useState } from 'react';

// Голосовой ввод через встроенный в браузер Web Speech API (SpeechRecognition).
// Работает в Chrome/Edge/Safari (в т.ч. на телефоне), понимает русский, ничего
// не стоит и не требует ключей. Распознавание идёт на стороне браузера.

// Минимальные типы (в TS DOM их нет без отдельного lib).
type SpeechRecognitionAlternative = { transcript: string };
type SpeechRecognitionResult = { isFinal: boolean; 0: SpeechRecognitionAlternative };
type SpeechRecognitionEventLike = {
  resultIndex: number;
  results: { length: number; [i: number]: SpeechRecognitionResult };
};
type RecognitionLike = {
  lang: string;
  continuous: boolean;
  interimResults: boolean;
  start: () => void;
  stop: () => void;
  onresult: ((e: SpeechRecognitionEventLike) => void) | null;
  onerror: (() => void) | null;
  onend: (() => void) | null;
};

function getRecognitionCtor(): (new () => RecognitionLike) | null {
  if (typeof window === 'undefined') return null;
  const w = window as unknown as {
    SpeechRecognition?: new () => RecognitionLike;
    webkitSpeechRecognition?: new () => RecognitionLike;
  };
  return w.SpeechRecognition ?? w.webkitSpeechRecognition ?? null;
}

/**
 * Диктовка. onText вызывается для каждого завершённого фрагмента речи —
 * родитель сам решает, как его добавить (обычно дописать к полю ввода).
 */
export function useDictation(onText: (text: string) => void): {
  supported: boolean;
  listening: boolean;
  toggle: () => void;
} {
  const [supported, setSupported] = useState(false);
  const [listening, setListening] = useState(false);
  const recRef = useRef<RecognitionLike | null>(null);
  const onTextRef = useRef(onText);
  useEffect(() => {
    onTextRef.current = onText;
  });

  useEffect(() => {
    // Поддержку определяем только на клиенте после монтирования (на сервере
    // window нет). Это разовый переход false→true — сознательное исключение.
    // eslint-disable-next-line react-hooks/set-state-in-effect
    setSupported(getRecognitionCtor() !== null);
  }, []);

  const stop = useCallback(() => {
    try {
      recRef.current?.stop();
    } catch {
      // уже остановлено
    }
    setListening(false);
  }, []);

  const start = useCallback(() => {
    const Ctor = getRecognitionCtor();
    if (!Ctor) return;
    const rec = new Ctor();
    rec.lang = 'ru-RU';
    rec.continuous = true;
    rec.interimResults = false; // берём только финальные фрагменты — без дублей
    rec.onresult = (e) => {
      let finalText = '';
      for (let i = e.resultIndex; i < e.results.length; i += 1) {
        const r = e.results[i];
        if (r.isFinal) finalText += r[0].transcript;
      }
      const trimmed = finalText.trim();
      if (trimmed) onTextRef.current(trimmed);
    };
    rec.onerror = () => setListening(false);
    rec.onend = () => setListening(false);
    recRef.current = rec;
    try {
      rec.start();
      setListening(true);
    } catch {
      setListening(false);
    }
  }, []);

  const toggle = useCallback(() => {
    if (listening) stop();
    else start();
  }, [listening, start, stop]);

  // Останавливаем распознавание при размонтировании страницы.
  useEffect(
    () => () => {
      try {
        recRef.current?.stop();
      } catch {
        // ignore
      }
    },
    [],
  );

  return { supported, listening, toggle };
}
