"use client";

import { useCallback, useEffect, useRef, useState } from "react";

interface RecognitionResult {
  isFinal: boolean;
  length: number;
  0: { transcript: string };
}
interface RecognitionEvent {
  resultIndex: number;
  results: ArrayLike<RecognitionResult>;
}
interface Recognition {
  lang: string;
  continuous: boolean;
  interimResults: boolean;
  maxAlternatives: number;
  start(): void;
  stop(): void;
  abort(): void;
  onresult: ((e: RecognitionEvent) => void) | null;
  onerror: ((e: { error: string }) => void) | null;
  onend: (() => void) | null;
  onspeechstart: (() => void) | null;
  onaudiostart: (() => void) | null;
}

function getRecognition(): (new () => Recognition) | null {
  if (typeof window === "undefined") return null;
  const w = window as unknown as { SpeechRecognition?: new () => Recognition; webkitSpeechRecognition?: new () => Recognition };
  return w.SpeechRecognition ?? w.webkitSpeechRecognition ?? null;
}

const errorMessages: Record<string, string> = {
  "not-allowed": "Браузер не дал доступ к микрофону. Нажмите на значок замка в адресной строке → Микрофон → Разрешить и попробуйте снова.",
  "service-not-allowed": "Голосовой ввод недоступен в этом браузере. Попробуйте Chrome или Edge.",
  "audio-capture": "Микрофон не найден. Проверьте, что он подключён и выбран в настройках системы.",
  network: "Сервис распознавания речи недоступен. Проверьте интернет или попробуйте другой браузер (Chrome, Edge).",
  "language-not-supported": "Этот язык распознавания не поддерживается браузером. Выберите RU.",
};

/**
 * Голосовой ввод через Web Speech API (Chrome, Edge, Safari).
 * Каждая распознанная фраза один раз передаётся в onText. Промежуточный текст — в interim.
 */
export function useDictation(onText: (text: string) => void) {
  const [supported, setSupported] = useState(false);
  const [listening, setListening] = useState(false);
  const [interim, setInterim] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [silent, setSilent] = useState(false);
  const session = useRef<{ rec: Recognition; alive: boolean } | null>(null);
  const onTextRef = useRef(onText);
  const silenceTimer = useRef<ReturnType<typeof setTimeout> | null>(null);

  useEffect(() => {
    onTextRef.current = onText;
  });

  useEffect(() => {
    // Проверка возможностей браузера доступна только на клиенте
    // eslint-disable-next-line react-hooks/set-state-in-effect
    setSupported(!!getRecognition());
    return () => {
      if (session.current) {
        session.current.alive = false;
        session.current.rec.abort();
      }
    };
  }, []);

  const clearSilence = () => {
    if (silenceTimer.current) clearTimeout(silenceTimer.current);
    silenceTimer.current = null;
    setSilent(false);
  };

  const stop = useCallback(() => {
    const s = session.current;
    if (s) {
      s.alive = false;
      s.rec.stop(); // stop, а не abort: браузер отдаст последнюю фразу
    }
    session.current = null;
    clearSilence();
    setListening(false);
    setInterim("");
  }, []);

  const start = useCallback(
    (lang: string) => {
      const Ctor = getRecognition();
      if (!Ctor) return;
      if (session.current) {
        session.current.alive = false;
        session.current.rec.abort();
      }
      // В Chrome на Android непрерывный режим дублирует фразы — там слушаем по одной фразе и перезапускаемся.
      const android = /Android/i.test(navigator.userAgent);
      const s = { rec: new Ctor(), alive: true };
      const r = s.rec;
      r.lang = lang;
      r.continuous = !android;
      r.interimResults = true;
      r.maxAlternatives = 1;
      let consumed = 0; // сколько финальных результатов этого запуска уже отдано

      r.onaudiostart = () => {
        if (silenceTimer.current) clearTimeout(silenceTimer.current);
        silenceTimer.current = setTimeout(() => setSilent(true), 8000);
      };
      r.onspeechstart = () => clearSilence();
      r.onresult = (e) => {
        if (session.current && session.current !== s) return; // устаревший сеанс
        clearSilence();
        let live = "";
        for (let i = 0; i < e.results.length; i++) {
          const res = e.results[i];
          const text = res[0]?.transcript?.trim() ?? "";
          if (res.isFinal) {
            if (i >= consumed) {
              consumed = i + 1;
              if (text) onTextRef.current(text);
            }
          } else live += (live ? " " : "") + text;
        }
        setInterim(live);
      };
      r.onerror = (e) => {
        if (e.error === "no-speech" || e.error === "aborted") return;
        s.alive = false;
        setError(errorMessages[e.error] ?? `Не удалось распознать речь (${e.error})`);
        setListening(false);
        setInterim("");
      };
      // Браузер останавливает распознавание после паузы — перезапускаем, пока пользователь не нажал «стоп».
      r.onend = () => {
        if (s.alive && session.current === s) {
          consumed = 0;
          try {
            r.start();
            return;
          } catch {
            /* упадём в остановку ниже */
          }
        }
        if (session.current === s || session.current === null) {
          setListening(false);
          setInterim("");
        }
      };
      session.current = s;
      setError(null);
      setListening(true);
      try {
        r.start();
      } catch {
        setError("Не удалось включить микрофон. Обновите страницу и попробуйте снова.");
        setListening(false);
      }
    },
    [],
  );

  return { supported, listening, interim, error, silent, start, stop };
}
