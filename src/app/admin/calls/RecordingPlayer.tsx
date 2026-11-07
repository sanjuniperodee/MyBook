"use client";

import { useEffect, useMemo, useRef, useState } from "react";
import { Download, LoaderCircle, Pause, Play } from "lucide-react";
import { cn } from "@/lib/class-names";

/** Событие «играет эта запись»: остальные плееры страницы встают на паузу. */
const PLAY_EVENT = "calls:recording";
const BARS = 36;
const SPEEDS = [1, 1.5, 2] as const;

/** Псевдо-волна из id звонка: у каждой записи своя и не меняется между перерисовками. */
function bars(seed: string) {
  let h = 2166136261;
  for (const ch of seed) h = Math.imul(h ^ ch.charCodeAt(0), 16777619);
  return Array.from({ length: BARS }, (_, i) => {
    h = Math.imul(h ^ (i + 1), 2654435761) >>> 0;
    const v = (h % 1000) / 1000;
    const edge = Math.sin((Math.PI * (i + 0.5)) / BARS);
    return 0.2 + 0.8 * v * (0.55 + 0.45 * edge);
  });
}

const mmss = (s: number) => (Number.isFinite(s) && s >= 0 ? `${Math.floor(s / 60)}:${String(Math.floor(s % 60)).padStart(2, "0")}` : "0:00");

/**
 * Запись разговора в «Звонках»: кнопка, волна с перемоткой (клик, перетаскивание, стрелки ±5 с), время, скорость 1×/1.5×/2×
 * и «скачать». Файл не грузится, пока запись не включили: на странице десятки звонков. Длительность до загрузки — из
 * журнала. Первое прослушивание звонка WhatsApp собирает файл на сервере — пару секунд крутится загрузка.
 */
export function RecordingPlayer({ callId, durationSec, ext = "mp3", className }: { callId: string; durationSec: number; ext?: string; className?: string }) {
  const src = `/api/admin/calls/${callId}/recording`;
  const audio = useRef<HTMLAudioElement>(null);
  const wave = useRef<HTMLDivElement>(null);
  const [playing, setPlaying] = useState(false);
  const [loading, setLoading] = useState(false);
  const [time, setTime] = useState(0);
  const [duration, setDuration] = useState(durationSec);
  const [speed, setSpeed] = useState<(typeof SPEEDS)[number]>(1);
  const [error, setError] = useState<string | null>(null);
  const heights = useMemo(() => bars(callId), [callId]);

  useEffect(() => {
    const on = (e: Event) => {
      if ((e as CustomEvent<string>).detail !== callId) audio.current?.pause();
    };
    window.addEventListener(PLAY_EVENT, on);
    return () => window.removeEventListener(PLAY_EVENT, on);
  }, [callId]);

  const toggle = () => {
    const a = audio.current;
    if (!a) return;
    if (!a.paused) return a.pause();
    setError(null);
    if (a.readyState < 2) setLoading(true);
    window.dispatchEvent(new CustomEvent(PLAY_EVENT, { detail: callId }));
    a.playbackRate = speed;
    void a.play().catch(async () => {
      setLoading(false);
      // Сервер объясняет текстом, почему записи нет (звонок ещё идёт, нет прав) — покажем его.
      const res = await fetch(src, { headers: { Range: "bytes=0-0" } }).catch(() => null);
      setError(res && !res.ok ? (await res.text()).slice(0, 120) || "Запись недоступна" : "Браузер не воспроизвёл запись");
    });
  };

  const seekTo = (clientX: number) => {
    const a = audio.current;
    const el = wave.current;
    if (!a || !el || !duration) return;
    const r = el.getBoundingClientRect();
    a.currentTime = Math.max(0, Math.min(1, (clientX - r.left) / r.width)) * duration;
    setTime(a.currentTime);
  };

  const progress = duration ? Math.min(1, time / duration) : 0;
  return (
    <div className={cn("flex min-w-0 items-center gap-2", className)} data-testid="call-recording">
      <audio
        ref={audio}
        src={src}
        preload="none"
        onLoadedMetadata={(e) => Number.isFinite(e.currentTarget.duration) && setDuration(e.currentTarget.duration)}
        onDurationChange={(e) => Number.isFinite(e.currentTarget.duration) && setDuration(e.currentTarget.duration)}
        onTimeUpdate={(e) => setTime(e.currentTarget.currentTime)}
        onPlay={() => setPlaying(true)}
        onPlaying={() => setLoading(false)}
        onWaiting={() => setLoading(true)}
        onPause={() => setPlaying(false)}
        onEnded={() => {
          setPlaying(false);
          setTime(0);
        }}
        className="hidden"
      />
      <button
        type="button"
        onClick={toggle}
        className="flex size-8 shrink-0 items-center justify-center rounded-[var(--r-ctl)] bg-wine text-white transition-colors hover:bg-wine-dark max-lg:size-11"
        aria-label={playing ? "Пауза" : "Слушать запись"}
      >
        {loading ? <LoaderCircle className="size-4 animate-spin" /> : playing ? <Pause className="size-3.5" fill="currentColor" /> : <Play className="ml-0.5 size-3.5" fill="currentColor" />}
      </button>
      {error ? (
        <div className="min-w-0 flex-1 truncate text-xs text-danger" title={error}>
          {error}
        </div>
      ) : (
        <div
          ref={wave}
          className="flex h-6 min-w-16 flex-1 cursor-pointer touch-none items-center gap-[2px]"
          onPointerDown={(e) => {
            e.currentTarget.setPointerCapture(e.pointerId);
            seekTo(e.clientX);
          }}
          onPointerMove={(e) => e.buttons === 1 && seekTo(e.clientX)}
          role="slider"
          aria-label="Перемотка записи"
          aria-valuemin={0}
          aria-valuemax={Math.round(duration)}
          aria-valuenow={Math.round(time)}
          tabIndex={0}
          onKeyDown={(e) => {
            const a = audio.current;
            if (!a) return;
            if (e.key === "ArrowRight") a.currentTime = Math.min(duration, a.currentTime + 5);
            if (e.key === "ArrowLeft") a.currentTime = Math.max(0, a.currentTime - 5);
          }}
        >
          {heights.map((h, i) => (
            <span key={i} className={cn("min-w-[2px] flex-1 rounded-full transition-colors", (i + 0.5) / BARS < progress ? "bg-wine" : "bg-wine/20")} style={{ height: `${Math.round(h * 100)}%` }} />
          ))}
        </div>
      )}
      <span className="shrink-0 text-xs text-muted tabular-nums">
        {playing || time ? `${mmss(time)} / ` : ""}
        {mmss(duration)}
      </span>
      <button
        type="button"
        className="shrink-0 rounded px-1 text-xs font-semibold text-muted hover:bg-sunken hover:text-ink max-lg:min-h-9"
        onClick={() => {
          const next = SPEEDS[(SPEEDS.indexOf(speed) + 1) % SPEEDS.length];
          setSpeed(next);
          if (audio.current) audio.current.playbackRate = next;
        }}
        aria-label="Скорость"
      >
        {speed}×
      </button>
      <a href={src} download={`zvonok-${callId.slice(0, 8)}.${ext}`} className="flex shrink-0 items-center rounded p-1 text-muted hover:bg-sunken hover:text-ink max-lg:min-h-9 max-lg:px-1.5" aria-label="Скачать запись">
        <Download className="size-3.5" />
      </a>
    </div>
  );
}
