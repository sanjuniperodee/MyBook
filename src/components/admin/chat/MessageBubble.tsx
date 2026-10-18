"use client";

import { useEffect, useRef, useState } from "react";
import { AlertCircle, Ban, Check, CheckCheck, ChevronDown, Clock, Copy, Download, FileText, Forward, Lock, Pencil, Play, Reply, Trash2 } from "lucide-react";
import type { ChatMessage } from "@/modules/messaging";
import { cn } from "@/lib/class-names";
import { VoicePlayer } from "./VoicePlayer";

/** Сообщение чата с тем, что знает только браузер: превью ещё не отправленного файла. */
export type Msg = ChatMessage & { localSrc?: string; fileName?: string };

/** Окна WhatsApp (как на сервере): изменить — 15 минут, удалить у всех — двое суток. */
const EDIT_MS = 15 * 60_000;
const DELETE_MS = 48 * 3_600_000;

export const time = (iso: string, tz: string) => new Intl.DateTimeFormat("ru-RU", { timeZone: tz, hour: "2-digit", minute: "2-digit" }).format(new Date(iso));

/** Адрес вложения: через наш сервер (файл шлюза или хранилища, с проверкой доступа), ссылка канала или локальное превью. */
export const mediaSrc = (m: Msg) => m.localSrc ?? (m.gateway ? `/api/admin/chats/messages/${m.id}/media` : m.mediaUrl);

export const isTemp = (m: Msg) => m.id.startsWith("tmp-");

/** Короткое описание сообщения — для цитаты, пересылки и подсказок. */
export function snippet(m: Pick<ChatMessage, "type" | "text">) {
  const label = m.type === "image" ? "📷 Фото" : m.type === "video" ? "🎬 Видео" : m.type === "audio" ? "🎤 Голосовое" : m.type === "document" ? "📎 Файл" : "";
  const t = m.text.replace(/\s+/g, " ").trim();
  return [label, t].filter(Boolean).join(" · ").slice(0, 160) || "Сообщение";
}

const URL_RE = /(https?:\/\/[^\s<>"]+)/g;
/** Ссылки в тексте — кликабельные (в новой вкладке). */
function Linkified({ text, out }: { text: string; out: boolean }) {
  const parts = text.split(URL_RE);
  return (
    <>
      {parts.map((p, i) =>
        i % 2 === 1 ? (
          <a key={i} href={p} target="_blank" rel="noopener noreferrer" className={cn("break-all underline", out ? "text-white" : "text-wine")}>
            {p}
          </a>
        ) : (
          <span key={i}>{p}</span>
        ),
      )}
    </>
  );
}

function StatusIcon({ status }: { status: string }) {
  if (status === "pending") return <Clock className="size-3" />;
  if (status === "sent") return <Check className="size-3" />;
  if (status === "delivered") return <CheckCheck className="size-3" />;
  if (status === "read") return <CheckCheck className="size-3 text-sky-300" />;
  if (status === "error") return <AlertCircle className="size-3 text-red-200" />;
  return null;
}

function Attachment({ m, conversationId, onOpen, onVoiceEnded }: { m: Msg; conversationId: string; onOpen: () => void; onVoiceEnded: () => void }) {
  const [broken, setBroken] = useState(false);
  const src = mediaSrc(m);
  const out = m.direction === "out";
  const download = !!m.gateway || !!m.localSrc;
  if (!src) return null;
  if (m.type === "audio") return <VoicePlayer id={m.id} src={src} conversationId={conversationId} out={out} transcript={m.transcript} download={download} onEnded={onVoiceEnded} />;
  const file = (
    <a href={src} {...(download ? { download: m.fileName ?? true } : { target: "_blank", rel: "noopener noreferrer" })} className={cn("mb-1 flex items-center gap-3 rounded-xl p-2.5", out ? "bg-white/15" : "bg-cream/60")}>
      <span className={cn("flex size-10 shrink-0 items-center justify-center rounded-lg", out ? "bg-white/20" : "bg-white")}>
        <FileText className="size-5" />
      </span>
      <span className="min-w-0">
        <span className="block truncate text-sm font-medium">{m.fileName ?? (m.type === "image" ? "Фото" : m.type === "video" ? "Видео" : "Документ")}</span>
        <span className={cn("text-xs", out ? "text-white/70" : "text-muted")}>{broken ? "не открылось — скачать" : "открыть"}</span>
      </span>
    </a>
  );
  if (broken) return file;
  if (m.type === "image")
    return (
      <button type="button" onClick={onOpen} className="mb-1 block overflow-hidden rounded-xl" aria-label="Открыть фото">
        {/* eslint-disable-next-line @next/next/no-img-element */}
        <img src={src} alt="" className="max-h-72 min-h-24 max-w-full min-w-24 object-cover" loading="lazy" onError={() => setBroken(true)} />
      </button>
    );
  if (m.type === "video")
    return (
      <button type="button" onClick={onOpen} className="relative mb-1 block overflow-hidden rounded-xl bg-black" aria-label="Открыть видео">
        <video src={src} preload="metadata" muted playsInline className="max-h-72 max-w-full" onError={() => setBroken(true)} />
        <span className="absolute inset-0 flex items-center justify-center">
          <span className="flex size-12 items-center justify-center rounded-full bg-black/55 text-white">
            <Play className="ml-0.5 size-6" fill="currentColor" />
          </span>
        </span>
      </button>
    );
  return file;
}

export interface BubbleActions {
  reply?: () => void;
  forward?: () => void;
  edit?: () => void;
  remove?: () => void;
}

/**
 * Сообщение в ленте: вложение (фото и видео — во весь экран, голосовое — плеер с волной и расшифровкой, файл —
 * карточкой), цитата ответа, «пересланное», «изменено», удалённое. Меню — по наведению (⌄), правому клику или
 * долгому нажатию: ответить, переслать, копировать, изменить и удалить своё.
 */
export function MessageBubble({
  m,
  me,
  now,
  first = true,
  last = true,
  timeZone,
  conversationId,
  canSend,
  highlighted,
  onAction,
  onOpenMedia,
  onJump,
  onVoiceEnded,
}: {
  m: Msg;
  me: string;
  /** Первое и последнее в группе подряд от одного отправителя: подпись автора — у первого, хвостик — у последнего. */
  first?: boolean;
  last?: boolean;
  /** Текущее время (раз в полминуты) — окна правки и удаления. */
  now: number;
  timeZone: string;
  conversationId: string;
  canSend: boolean;
  highlighted: boolean;
  onAction: (kind: keyof BubbleActions | "copy", m: Msg) => void;
  onOpenMedia: (id: string) => void;
  onJump: (id: string) => void;
  onVoiceEnded: (id: string) => void;
}) {
  const [menu, setMenu] = useState(false);
  const box = useRef<HTMLDivElement>(null);
  const press = useRef<number | null>(null);
  const out = m.direction === "out";
  const own = out && !!m.authorId && m.authorId === me;
  const age = now - new Date(m.at).getTime();
  const temp = isTemp(m);
  const items: { key: keyof BubbleActions | "copy"; label: string; icon: typeof Reply; danger?: boolean }[] = [];
  if (!m.deleted && !temp) {
    if (canSend && !m.internal) items.push({ key: "reply", label: "Ответить", icon: Reply });
    if (canSend && !m.internal && (m.text || m.type !== "text")) items.push({ key: "forward", label: "Переслать", icon: Forward });
    if (m.text) items.push({ key: "copy", label: "Копировать текст", icon: Copy });
    if (own && m.type === "text" && m.status !== "error" && (m.internal || age < EDIT_MS)) items.push({ key: "edit", label: "Изменить", icon: Pencil });
    if (own && (m.internal || m.status === "error" || age < DELETE_MS)) items.push({ key: "remove", label: m.internal || m.status === "error" ? "Удалить" : "Удалить у всех", icon: Trash2, danger: true });
  }

  useEffect(() => {
    if (!menu) return;
    const close = (e: Event) => !box.current?.contains(e.target as Node) && setMenu(false);
    const esc = (e: KeyboardEvent) => e.key === "Escape" && setMenu(false);
    document.addEventListener("pointerdown", close);
    document.addEventListener("keydown", esc);
    return () => {
      document.removeEventListener("pointerdown", close);
      document.removeEventListener("keydown", esc);
    };
  }, [menu]);

  const menuEl =
    menu && items.length ? (
      <div className={cn("absolute top-full z-20 mt-1 w-48 overflow-hidden rounded-xl border border-line bg-white py-1 text-sm text-ink shadow-xl", out ? "right-0" : "left-0")} role="menu">
        {items.map((it) => (
          <button
            key={it.key}
            type="button"
            role="menuitem"
            className={cn("flex w-full items-center gap-2.5 px-3 py-2 text-left hover:bg-cream/60", it.danger && "text-red-700")}
            onClick={() => {
              setMenu(false);
              onAction(it.key, m);
            }}
          >
            <it.icon className="size-4" /> {it.label}
          </button>
        ))}
        {mediaSrc(m) && m.type !== "text" ? (
          <a href={mediaSrc(m)!} {...(m.gateway || m.localSrc ? { download: true } : { target: "_blank", rel: "noopener noreferrer" })} className="flex w-full items-center gap-2.5 px-3 py-2 hover:bg-cream/60" onClick={() => setMenu(false)}>
            <Download className="size-4" /> Скачать
          </a>
        ) : null}
      </div>
    ) : null;

  if (m.internal)
    return (
      <div ref={box} className={cn("group relative mx-auto my-1 max-w-[88%] rounded-xl border border-amber-200 bg-amber-50 px-3 py-2 text-sm text-amber-950 transition-shadow", highlighted && "ring-2 ring-amber-400")} data-internal="1" data-mid={m.id}>
        <div className="mb-0.5 flex items-center gap-1.5 text-[11px] text-amber-800">
          <Lock className="size-3" /> Заметка · {m.author} · {time(m.at, timeZone)}
          {m.edited ? " · изменено" : ""}
          {items.length ? (
            <button type="button" className="ml-auto rounded p-0.5 opacity-0 group-hover:opacity-100 hover:bg-amber-100 focus:opacity-100" onClick={() => setMenu((v) => !v)} aria-label="Действия">
              <ChevronDown className="size-3.5" />
            </button>
          ) : null}
        </div>
        {m.deleted ? <p className="text-amber-800 italic">Заметка удалена</p> : <p className="break-words whitespace-pre-wrap">{m.text}</p>}
        {menuEl}
      </div>
    );

  return (
    <div className={cn("flex", out ? "justify-end" : "justify-start")} data-mid={m.id}>
      <div
        ref={box}
        className={cn(
          "group relative max-w-[78%] rounded-[18px] px-3 py-2 text-[14px] leading-snug shadow-[0_1px_1.5px_rgba(30,25,22,0.12)] transition-shadow",
          out ? "bg-gradient-to-br from-[#8c2535] to-[#6f1a27] text-white" : "bg-white text-ink",
          last && (out ? "rounded-br-[6px]" : "rounded-bl-[6px]"),
          m.status === "error" && "from-red-700 to-red-800 bg-red-700",
          highlighted && "ring-4 ring-amber-300",
        )}
        data-direction={m.direction}
        onContextMenu={(e) => {
          if (!items.length) return;
          e.preventDefault();
          setMenu(true);
        }}
        onPointerDown={(e) => {
          if (e.pointerType !== "touch" || !items.length) return;
          press.current = window.setTimeout(() => setMenu(true), 450);
        }}
        onPointerUp={() => press.current && window.clearTimeout(press.current)}
        onPointerLeave={() => press.current && window.clearTimeout(press.current)}
        onDoubleClick={() => items.some((i) => i.key === "reply") && onAction("reply", m)}
      >
        {items.length ? (
          <button
            type="button"
            className={cn("absolute top-1 right-1 z-10 rounded-full p-0.5 opacity-0 group-hover:opacity-100 focus:opacity-100", out ? "bg-wine/80 text-white hover:bg-white/20" : "bg-white/90 text-muted hover:bg-cream")}
            onClick={() => setMenu((v) => !v)}
            aria-label="Действия с сообщением"
          >
            <ChevronDown className="size-4" />
          </button>
        ) : null}
        {first && out && m.author ? <div className="mb-0.5 text-[11px] font-semibold text-white/80">{m.author}</div> : null}
        {m.forwarded && !m.deleted ? (
          <div className={cn("mb-1 flex items-center gap-1 text-[11px] italic", out ? "text-white/75" : "text-muted")}>
            <Forward className="size-3" /> Пересланное сообщение
          </div>
        ) : null}
        {m.replyTo && !m.deleted ? (
          <button type="button" onClick={() => onJump(m.replyTo!.id)} className={cn("mb-1.5 block w-full rounded-lg border-l-4 px-2 py-1 text-left text-xs", out ? "border-white/60 bg-white/15" : "border-wine/60 bg-cream/70")}>
            <span className={cn("block font-semibold", out ? "text-white" : "text-wine")}>{m.replyTo.direction === "in" ? "Клиент" : (m.replyTo.author ?? "Мы")}</span>
            <span className={cn("line-clamp-2", out ? "text-white/85" : "text-ink-soft")}>{snippet(m.replyTo)}</span>
          </button>
        ) : null}
        {m.deleted ? (
          <p className={cn("flex items-center gap-1.5 italic", out ? "text-white/80" : "text-muted")}>
            <Ban className="size-3.5" /> Сообщение удалено
          </p>
        ) : (
          <>
            <Attachment m={m} conversationId={conversationId} onOpen={() => onOpenMedia(m.id)} onVoiceEnded={() => onVoiceEnded(m.id)} />
            {m.text ? (
              <p className="break-words whitespace-pre-wrap">
                <Linkified text={m.text} out={out} />
              </p>
            ) : null}
          </>
        )}
        <div className={cn("-mb-0.5 mt-0.5 flex items-center justify-end gap-1 text-[10.5px] leading-none tabular-nums", out ? "text-white/70" : "text-muted")}>
          {m.edited && !m.deleted ? <span className="italic">изменено</span> : null}
          {time(m.at, timeZone)}
          {out ? <StatusIcon status={m.status} /> : null}
        </div>
        {m.status === "error" && m.error ? <div className="mt-1 text-[11px] text-red-100">{m.error}</div> : null}
        {menuEl}
      </div>
    </div>
  );
}
