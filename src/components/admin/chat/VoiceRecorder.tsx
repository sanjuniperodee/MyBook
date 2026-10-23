"use client";

import { useEffect, useRef, useState } from "react";
import { SendHorizontal, Trash2 } from "lucide-react";
import { toast } from "@/components/ui/overlays";
import { cn } from "@/lib/class-names";

/** Дольше не пишем: запись уходит сама (длинное голосовое в WhatsApp никто не дослушает). */
const MAX_MS = 10 * 60_000;
/** Короче — случайное нажатие, не отправляем. */
const MIN_MS = 700;
const BARS = 40;

/** Формат записи, который умеет браузер: webm/opus (Chrome, Firefox), mp4 (Safari). На сервере всё станет Ogg Opus. */
function pickMime() {
  if (typeof MediaRecorder === "undefined") return null;
  return ["audio/webm;codecs=opus", "audio/webm", "audio/mp4", "audio/ogg;codecs=opus"].find((m) => MediaRecorder.isTypeSupported(m)) ?? "";
}

/** Запись голосового доступна: нужен микрофон и MediaRecorder (и защищённое соединение — на http браузер не даст микрофон). */
export const canRecordVoice = () => typeof window !== "undefined" && !!navigator.mediaDevices?.getUserMedia && pickMime() !== null;

const mmss = (ms: number) => `${Math.floor(ms / 60_000)}:${String(Math.floor(ms / 1000) % 60).padStart(2, "0")}`;

/**
 * Запись голосового, как в WhatsApp: мусорка — отменить, красная точка с таймером и «живой» волной громкости,
 * кнопка справа — отправить. Начинает писать сразу при появлении; запрос микрофона браузер показывает сам.
 */
export function VoiceRecorder({ onSend, onCancel }: { onSend: (voice: { blob: Blob; mime: string; ms: number }) => void; onCancel: () => void }) {
  const [elapsed, setElapsed] = useState(0);
  const [levels, setLevels] = useState<number[]>(() => Array(BARS).fill(0.08));
  const [ready, setReady] = useState(false);
  const stop = useRef<(send: boolean) => void>(() => {});
  // Колбэки родителя меняются на каждый рендер — держим свежие в ref, чтобы запись не перезапускалась.
  const cb = useRef({ onSend, onCancel });
  useEffect(() => {
    cb.current = { onSend, onCancel };
  });

  useEffect(() => {
    let alive = true;
    let recorder: MediaRecorder | null = null;
    let stream: MediaStream | null = null;
    let ctx: AudioContext | null = null;
    let timer = 0;
    let finished = false;
    let send = false;
    const chunks: Blob[] = [];
    const started = { at: 0 };

    const cleanup = () => {
      window.clearInterval(timer);
      stream?.getTracks().forEach((t) => t.stop());
      void ctx?.close().catch(() => {});
    };

    (async () => {
      try {
        stream = await navigator.mediaDevices.getUserMedia({ audio: { echoCancellation: true, noiseSuppression: true } });
      } catch (err) {
        const denied = err instanceof DOMException && (err.name === "NotAllowedError" || err.name === "SecurityError");
        toast(denied ? "Нет доступа к микрофону — разрешите его в настройках браузера для этого сайта" : "Микрофон не найден или занят другим приложением", "error");
        if (alive) cb.current.onCancel();
        return;
      }
      if (!alive) return cleanup();
      const mime = pickMime() ?? "";
      recorder = new MediaRecorder(stream, mime ? { mimeType: mime } : undefined);
      recorder.ondataavailable = (e) => e.data.size && chunks.push(e.data);
      recorder.onstop = () => {
        const ms = Date.now() - started.at;
        cleanup();
        if (!send) return;
        if (ms < MIN_MS) {
          toast("Слишком короткая запись — удерживайте дольше", "error");
          return cb.current.onCancel();
        }
        const type = recorder?.mimeType || mime || "audio/webm";
        cb.current.onSend({ blob: new Blob(chunks, { type }), mime: type, ms });
      };
      stop.current = (s) => {
        if (finished) return;
        finished = true;
        send = s;
        if (recorder && recorder.state !== "inactive") recorder.stop();
        else cleanup();
        if (!s) cb.current.onCancel();
      };
      recorder.start(250);
      started.at = Date.now();
      setReady(true);

      // Волна громкости: последние 40 замеров.
      try {
        ctx = new AudioContext();
        const analyser = ctx.createAnalyser();
        analyser.fftSize = 256;
        ctx.createMediaStreamSource(stream).connect(analyser);
        const data = new Uint8Array(analyser.fftSize);
        timer = window.setInterval(() => {
          analyser.getByteTimeDomainData(data);
          let peak = 0;
          for (const v of data) peak = Math.max(peak, Math.abs(v - 128));
          setLevels((l) => [...l.slice(1), Math.min(1, 0.08 + (peak / 128) * 1.6)]);
        }, 80);
      } catch {
        // Без волны запись всё равно идёт.
      }
    })();

    const tick = window.setInterval(() => {
      if (!started.at) return;
      const ms = Date.now() - started.at;
      setElapsed(ms);
      if (ms >= MAX_MS) stop.current(true);
    }, 200);

    return () => {
      alive = false;
      window.clearInterval(tick);
      // Размонтирование без отправки (смена диалога): запись выбрасываем.
      finished = true;
      if (recorder && recorder.state !== "inactive") {
        recorder.onstop = null;
        recorder.stop();
      }
      cleanup();
    };
  }, []);

  return (
    <div className="flex min-w-0 flex-1 items-center gap-2" role="group" aria-label="Запись голосового сообщения">
      <button type="button" onClick={() => stop.current(false)} className="flex size-11 shrink-0 items-center justify-center rounded-full text-muted transition hover:bg-red-50 hover:text-red-700" aria-label="Отменить запись" title="Отменить запись">
        <Trash2 className="size-5" />
      </button>
      <div className="flex h-11 min-w-0 flex-1 items-center gap-3 rounded-[22px] border border-line bg-[#fbf9f5] px-4">
        <span className={cn("size-2.5 shrink-0 rounded-full bg-red-500", ready && "animate-pulse")} aria-hidden />
        <span className="w-10 shrink-0 text-sm tabular-nums" aria-live="off">
          {mmss(elapsed)}
        </span>
        <div className="flex h-7 min-w-0 flex-1 items-center justify-end gap-[3px] overflow-hidden" aria-hidden>
          {levels.map((v, i) => (
            <span key={i} className="w-[3px] shrink-0 rounded-full bg-wine/70" style={{ height: `${Math.round(v * 100)}%` }} />
          ))}
        </div>
      </div>
      <button type="button" onClick={() => stop.current(true)} disabled={!ready} className="flex size-11 shrink-0 items-center justify-center rounded-full bg-wine text-white shadow-md transition hover:bg-wine-dark disabled:opacity-40" aria-label="Отправить голосовое" title="Отправить голосовое">
        <SendHorizontal className="ml-0.5 size-5" />
      </button>
    </div>
  );
}
