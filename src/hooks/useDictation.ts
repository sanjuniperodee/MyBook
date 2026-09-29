"use client";

import { useCallback, useEffect, useRef, useState } from "react";

interface RecognitionResult {
  isFinal: boolean;
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
  start(): void;
  stop(): void;
  onresult: ((e: RecognitionEvent) => void) | null;
  onerror: ((e: { error: string }) => void) | null;
  onend: (() => void) | null;
}

function getRecognition(): (new () => Recognition) | null {
  if (typeof window === "undefined") return null;
  const w = window as unknown as { SpeechRecognition?: new () => Recognition; webkitSpeechRecognition?: new () => Recognition };
  return w.SpeechRecognition ?? w.webkitSpeechRecognition ?? null;
}

/** Голосовой ввод через Web Speech API (Chrome, Edge, Safari). Готовые фразы отдаются в onText. */
export function useDictation(onText: (text: string) => void) {
  const [supported, setSupported] = useState(false);
  const [listening, setListening] = useState(false);
  const [interim, setInterim] = useState("");
  const [error, setError] = useState<string | null>(null);
  const rec = useRef<Recognition | null>(null);
  const onTextRef = useRef(onText);
  const wanted = useRef(false);

  useEffect(() => {
    onTextRef.current = onText;
  });

  useEffect(() => {
    // Проверка возможностей браузера доступна только на клиенте
    // eslint-disable-next-line react-hooks/set-state-in-effect
    setSupported(!!getRecognition());
    return () => {
      wanted.current = false;
      rec.current?.stop();
    };
  }, []);

  const stop = useCallback(() => {
    wanted.current = false;
    rec.current?.stop();
    setListening(false);
    setInterim("");
  }, []);

  const start = useCallback((lang: string) => {
    const Ctor = getRecognition();
    if (!Ctor) return;
    rec.current?.stop();
    const r = new Ctor();
    r.lang = lang;
    r.continuous = true;
    r.interimResults = true;
    r.onresult = (e) => {
      let live = "";
      for (let i = e.resultIndex; i < e.results.length; i++) {
        const res = e.results[i];
        if (res.isFinal) onTextRef.current(res[0].transcript.trim());
        else live += res[0].transcript;
      }
      setInterim(live);
    };
    r.onerror = (e) => {
      if (e.error === "no-speech" || e.error === "aborted") return;
      const messages: Record<string, string> = {
        "not-allowed": "Браузер не дал доступ к микрофону. Нажмите на значок замка в адресной строке → Микрофон → Разрешить и попробуйте снова.",
        "service-not-allowed": "Голосовой ввод недоступен в этом браузере. Попробуйте Chrome или Edge.",
        "audio-capture": "Микрофон не найден. Проверьте, что он подключён.",
        network: "Для распознавания речи нужен интернет. Проверьте соединение.",
        "language-not-supported": "Этот язык распознавания не поддерживается браузером. Выберите RU.",
      };
      setError(messages[e.error] ?? "Не удалось распознать речь");
      wanted.current = false;
      setListening(false);
    };
    // Браузер сам останавливает распознавание после паузы — перезапускаем, пока пользователь не нажал «стоп».
    r.onend = () => {
      if (wanted.current) {
        try {
          r.start();
        } catch {
          setListening(false);
        }
      } else setListening(false);
    };
    rec.current = r;
    wanted.current = true;
    setError(null);
    setListening(true);
    r.start();
  }, []);

  return { supported, listening, interim, error, start, stop };
}
