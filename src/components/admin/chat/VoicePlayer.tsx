"use client";

import { useEffect, useMemo, useRef, useState, useTransition } from "react";
import { Download, FileAudio, LoaderCircle, Mic, Pause, Play } from "lucide-react";
import { transcribeMessageAction } from "@/app/admin/chats/actions";
import { cn } from "@/lib/class-names";

/** Событие «играет это голосовое»: остальные плееры чата встают на паузу; next — следующее подряд после окончания. */
export const AUDIO_EVENT = "chat:audio";
export type AudioEvent = { id: string; action: "play" | "next" };

const BARS = 36;
const SPEEDS = [1, 1.5, 2] as const;

/** Псевдо-волна из id сообщения: у каждого голосового своя, стабильная между перерисовками. */
function bars(seed: string) {
  let h = 2166136261;
  for (const ch of seed) h = Math.imul(h ^ ch.charCodeAt(0), 16777619);
  return Array.from({ length: BARS }, (_, i) => {
    h = Math.imul(h ^ (i + 1), 2654435761) >>> 0;
    const v = (h % 1000) / 1000;
    // Края тише середины — похоже на речь.
    const edge = Math.sin((Math.PI * (i + 0.5)) / BARS);
    return 0.25 + 0.75 * v * (0.55 + 0.45 * edge);
  });
}

const mmss = (s: number) => (Number.isFinite(s) && s >= 0 ? `${Math.floor(s / 60)}:${String(Math.floor(s % 60)).padStart(2, "0")}` : "0:00");

/**
 * Голосовое как в мессенджере: кнопка, волна с перемоткой (клик и перетаскивание), время, скорость 1×/1.5×/2×,
 * расшифровка (готовая или по кнопке «Расшифровать»). Играет одно голосовое за раз; закончилось — следующее подряд.
 * Браузер не смог (голосовые WhatsApp — Ogg Opus, старый Safari) — ссылка на файл.
 */
export function VoicePlayer({
  id,
  src,
  conversationId,
  out,
  transcript: initial,
  download,
  onEnded,
}: {
  id: string;
  src: string;
  conversationId: string;
  out: boolean;
  transcript?: string | null;
  download: boolean;
  onEnded?: () => void;
}) {
  const audio = useRef<HTMLAudioElement>(null);
  const wave = useRef<HTMLDivElement>(null);
  const [playing, setPlaying] = useState(false);
  const [loading, setLoading] = useState(false);
  const [time, setTime] = useState(0);
  const [duration, setDuration] = useState(0);
  const [speed, setSpeed] = useState<(typeof SPEEDS)[number]>(1);
  const [failed, setFailed] = useState(false);
  const [fetched, setTranscript] = useState<string | null>(null);
  const transcript = fetched ?? initial ?? null;
  const [showText, setShowText] = useState(!!initial);
  const [err, setErr] = useState<string | null>(null);
  const [busy, start] = useTransition();
  const heights = useMemo(() => bars(id), [id]);

  useEffect(() => {
    const on = (e: Event) => {
      const d = (e as CustomEvent<AudioEvent>).detail;
      const a = audio.current;
      if (!a) return;
      if (d.id === id && d.action === "play") void a.play().catch(() => setFailed(true));
      else if (d.id !== id && d.action === "play") a.pause();
    };
    window.addEventListener(AUDIO_EVENT, on);
    return () => window.removeEventListener(AUDIO_EVENT, on);
  }, [id]);

  const toggle = () => {
    const a = audio.current;
    if (!a) return;
    if (a.paused) {
      setLoading(a.readyState < 2);
      window.dispatchEvent(new CustomEvent<AudioEvent>(AUDIO_EVENT, { detail: { id, action: "play" } }));
    } else a.pause();
  };

  const seekTo = (clientX: number) => {
    const a = audio.current;
    const el = wave.current;
    if (!a || !el || !duration) return;
    const r = el.getBoundingClientRect();
    a.currentTime = Math.max(0, Math.min(1, (clientX - r.left) / r.width)) * duration;
    setTime(a.currentTime);
  };

  const transcribe = () =>
    start(async () => {
      setErr(null);
      const r = await transcribeMessageAction(conversationId, id);
      if (r.text) {
        setTranscript(r.text);
        setShowText(true);
      } else setErr(r.error ?? "Не получилось");
    });

  const progress = duration ? time / duration : 0;
  const tone = out ? { on: "bg-white", off: "bg-white/40", btn: "bg-white text-wine", sub: "text-white/75" } : { on: "bg-wine", off: "bg-wine/25", btn: "bg-wine text-white", sub: "text-muted" };

  return (
    <div className="mb-1 w-72 max-w-full">
      <audio
        ref={audio}
        src={src}
        preload="metadata"
        onLoadedMetadata={(e) => setDuration(e.currentTarget.duration)}
        onDurationChange={(e) => Number.isFinite(e.currentTarget.duration) && setDuration(e.currentTarget.duration)}
        onTimeUpdate={(e) => setTime(e.currentTarget.currentTime)}
        onPlay={(e) => {
          e.currentTarget.playbackRate = speed;
          setPlaying(true);
        }}
        onPlaying={() => setLoading(false)}
        onPause={() => setPlaying(false)}
        onEnded={() => {
          setPlaying(false);
          setTime(0);
          onEnded?.();
        }}
        onError={() => setFailed(true)}
        className="hidden"
      />
      {failed ? (
        <a href={src} {...(download ? { download: true } : { target: "_blank", rel: "noopener noreferrer" })} className="flex items-center gap-2 underline">
          <FileAudio className="size-4" /> Браузер не воспроизвёл — открыть файл
        </a>
      ) : (
        <div className="flex items-center gap-2.5">
          <button type="button" onClick={toggle} className={cn("flex size-10 shrink-0 items-center justify-center rounded-full shadow-sm", tone.btn)} aria-label={playing ? "Пауза" : "Слушать"}>
            {loading && playing ? <LoaderCircle className="size-5 animate-spin" /> : playing ? <Pause className="size-5" fill="currentColor" /> : <Play className="ml-0.5 size-5" fill="currentColor" />}
          </button>
          <div className="min-w-0 flex-1">
            <div
              ref={wave}
              className="flex h-8 cursor-pointer touch-none items-center gap-[2px]"
              onPointerDown={(e) => {
                e.currentTarget.setPointerCapture(e.pointerId);
                seekTo(e.clientX);
              }}
              onPointerMove={(e) => e.buttons === 1 && seekTo(e.clientX)}
              role="slider"
              aria-label="Перемотка"
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
                <span key={i} className={cn("w-[3px] flex-1 rounded-full transition-colors", i / BARS < progress ? tone.on : tone.off)} style={{ height: `${Math.round(h * 100)}%` }} />
              ))}
            </div>
            <div className={cn("mt-0.5 flex items-center gap-2 text-[11px] tabular-nums", tone.sub)}>
              <Mic className="size-3" />
              <span>{playing || time ? mmss(time) : mmss(duration)}</span>
              <button
                type="button"
                className="rounded px-1 font-semibold hover:bg-black/10"
                onClick={() => {
                  const next = SPEEDS[(SPEEDS.indexOf(speed) + 1) % SPEEDS.length];
                  setSpeed(next);
                  if (audio.current) audio.current.playbackRate = next;
                }}
                aria-label="Скорость"
              >
                {speed}×
              </button>
              <span className="ml-auto flex items-center gap-2">
                {transcript ? (
                  <button type="button" className="underline-offset-2 hover:underline" onClick={() => setShowText((v) => !v)}>
                    {showText ? "скрыть текст" : "текст"}
                  </button>
                ) : (
                  <button type="button" className="underline-offset-2 hover:underline" onClick={transcribe} disabled={busy}>
                    {busy ? "расшифровываю…" : "расшифровать"}
                  </button>
                )}
                <a href={src} {...(download ? { download: true } : { target: "_blank", rel: "noopener noreferrer" })} aria-label="Скачать" className="hover:opacity-80">
                  <Download className="size-3.5" />
                </a>
              </span>
            </div>
          </div>
        </div>
      )}
      {showText && transcript ? <p className={cn("mt-1.5 border-l-2 pl-2 text-[13px] italic", out ? "border-white/40" : "border-wine/30")}>{transcript}</p> : null}
      {err ? <p className={cn("mt-1 text-[11px]", out ? "text-white/80" : "text-red-700")}>{err}</p> : null}
    </div>
  );
}
