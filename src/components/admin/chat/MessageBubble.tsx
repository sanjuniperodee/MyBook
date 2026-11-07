"use client";

import { memo, useEffect, useRef, useState } from "react";
import { AlertCircle, Ban, Bot, Check, CheckCheck, CheckSquare, ChevronDown, Slash, Clock, Copy, Download, FileText, Forward, Lock, Pencil, Play, Reply, RotateCw, Trash2 } from "lucide-react";
import type { ChatMessage } from "@/modules/messaging";
import { cn } from "@/lib/class-names";
import { VoicePlayer } from "./VoicePlayer";
import { BotTraceButton } from "./BotTrace";

/** Сообщение чата с тем, что знает только браузер: превью ещё не отправленного файла. */
export type Msg = ChatMessage & { localSrc?: string; fileName?: string };

/** Окна WhatsApp (как на сервере): изменить — 15 минут, удалить у всех — двое суток. */
const EDIT_MS = 15 * 60_000;
const DELETE_MS = 48 * 3_600_000;

/**
 * Intl.DateTimeFormat дорог в создании (на телефоне — доли миллисекунды), а лента зовёт его по нескольку раз на каждое
 * сообщение при каждой перерисовке. Поэтому форматтеры создаются один раз на (локаль, пояс, вид).
 */
const formatters = new Map<string, Intl.DateTimeFormat>();
export function formatter(locale: string, tz: string, kind: string, options: Intl.DateTimeFormatOptions) {
  const key = `${locale}|${tz}|${kind}`;
  let f = formatters.get(key);
  if (!f) formatters.set(key, (f = new Intl.DateTimeFormat(locale, { timeZone: tz, ...options })));
  return f;
}

export const time = (iso: string, tz: string) => formatter("ru-RU", tz, "time", { hour: "2-digit", minute: "2-digit" }).format(new Date(iso));

/** Адрес вложения: через наш сервер (файл шлюза или хранилища, с проверкой доступа), ссылка канала или локальное превью. */
export const mediaSrc = (m: Msg) => m.localSrc ?? (m.gateway ? `/api/admin/chats/messages/${m.id}/media` : m.mediaUrl);

export const isTemp = (m: Msg) => m.id.startsWith("tmp-");

/** Подписи-заглушки вложений из канала («🎤 Голосовое сообщение») — под самим вложением они лишние. */
const PLACEHOLDERS = new Set(["🎤 Голосовое сообщение", "📷 Фото", "🎬 Видео", "📎 Файл", "Голосовое сообщение"]);

/**
 * Есть ли у сообщения свой текст под вложением. Подпись-заглушка («🎤 Голосовое сообщение», «📷 Фото») не показывается,
 * и тогда время с галочками встаёт отдельной строкой — иначе оно наезжает на плеер голосового («расшифровать», «скачать»)
 * или на край фото.
 */
export function hasCaption(m: Pick<ChatMessage, "type" | "text" | "deleted">): boolean {
  return !m.deleted && !!m.text && !(m.type !== "text" && PLACEHOLDERS.has(m.text.trim()));
}

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
          <a key={i} href={p} target="_blank" rel="noopener noreferrer" className={cn("underline [overflow-wrap:anywhere]", out ? "text-white" : "text-wine")}>
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
  if (status === "read") return <CheckCheck className="size-3.5 text-info" aria-label="прочитано" />;
  if (status === "error") return <AlertCircle className="size-3.5 text-danger" aria-label="не отправлено" />;
  return null;
}

function Attachment({ m, conversationId, onOpen, onVoiceEnded }: { m: Msg; conversationId: string; onOpen: () => void; onVoiceEnded: () => void }) {
  const [broken, setBroken] = useState(false);
  const src = mediaSrc(m);
  const out = false;
  const download = !!m.gateway || !!m.localSrc;
  if (!src) return null;
  if (m.type === "audio") return <VoicePlayer id={m.id} src={src} conversationId={conversationId} out={out} transcript={m.transcript} download={download} onEnded={onVoiceEnded} />;
  const file = (
    <a href={src} {...(download ? { download: m.fileName ?? true } : { target: "_blank", rel: "noopener noreferrer" })} className="mb-1 flex min-w-52 items-center gap-3 rounded-[10px] border border-line bg-white/70 p-2 transition-colors hover:border-line-strong">
      <span className="flex size-10 shrink-0 items-center justify-center rounded-lg bg-sunken text-ink-soft">
        <FileText className="size-5" strokeWidth={1.8} />
      </span>
      <span className="min-w-0">
        <span className="block truncate text-sm font-medium">{m.fileName ?? (m.type === "image" ? "Фото" : m.type === "video" ? "Видео" : "Документ")}</span>
        <span className={cn("text-xs", broken ? "text-danger" : "text-muted")}>{broken ? "Не открылось — скачать файл" : "Открыть"}</span>
      </span>
    </a>
  );
  if (broken) return file;
  if (m.type === "image")
    return (
      <button type="button" onClick={onOpen} className="-mx-1 mb-1 block overflow-hidden rounded-[10px]" aria-label="Открыть фото">
        {/* eslint-disable-next-line @next/next/no-img-element */}
        <img src={src} alt="" className="max-h-72 min-h-24 max-w-full min-w-24 object-cover" loading="lazy" decoding="async" onError={() => setBroken(true)} />
      </button>
    );
  if (m.type === "video")
    return (
      <button type="button" onClick={onOpen} className="relative -mx-1 mb-1 block overflow-hidden rounded-[10px] bg-black" aria-label="Открыть видео">
        <video src={src} preload="none" muted playsInline className="max-h-72 max-w-full" onError={() => setBroken(true)} />
        <span className="absolute inset-0 flex items-center justify-center">
          <span className="flex size-12 items-center justify-center rounded-full bg-black/55 text-white">
            <Play className="ml-0.5 size-6" fill="currentColor" />
          </span>
        </span>
      </button>
    );
  return file;
}

/** Сообщение можно выбрать для пересылки или удаления (не удалённое и не ещё отправляемое). */
export const selectable = (m: Msg) => !m.deleted && !isTemp(m);

/** Можно переслать: не заметка, есть текст или вложение. */
export const canForward = (m: Msg) => selectable(m) && !m.internal && (!!m.text || m.type !== "text");

/** Можно удалить: своё, в окне WhatsApp (заметка и неотправленное — всегда). */
export const canRemove = (m: Msg, me: string, now: number) => selectable(m) && m.direction === "out" && !!m.authorId && m.authorId === me && (m.internal || m.status === "error" || now - new Date(m.at).getTime() < DELETE_MS);

export interface BubbleActions {
  retry?: () => void;
  /** Убрать неотправленную локальную копию (сообщение не дошло до сервера). */
  discard?: () => void;
  reply?: () => void;
  forward?: () => void;
  edit?: () => void;
  remove?: () => void;
  select?: () => void;
  template?: () => void;
}

/**
 * Сообщение в ленте: вложение (фото и видео — во весь экран, голосовое — плеер с волной и расшифровкой, файл —
 * карточкой), цитата ответа, «пересланное», «изменено», удалённое. Меню — по наведению (⌄), правому клику или
 * долгому нажатию: ответить, переслать, копировать, изменить и удалить своё.
 */
function Bubble({
  m,
  me,
  now,
  first = true,
  last = true,
  timeZone,
  conversationId,
  canSend,
  highlighted,
  selecting = false,
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
  /** Идёт выбор сообщений: меню не нужно, клик отмечает сообщение (обрабатывает лента). */
  selecting?: boolean;
  onAction: (kind: keyof BubbleActions | "copy", m: Msg) => void;
  onOpenMedia: (id: string) => void;
  onJump: (id: string) => void;
  onVoiceEnded: (id: string) => void;
}) {
  const [menu, setMenu] = useState(false);
  const [openNote, setOpenNote] = useState(false);
  // Внизу экрана меню открывается вверх — иначе его обрезает лента.
  const [menuUp, setMenuUp] = useState(false);
  const openMenu = (v: boolean) => {
    if (v && box.current) setMenuUp(box.current.getBoundingClientRect().bottom > window.innerHeight * 0.6);
    setMenu(v);
  };
  const box = useRef<HTMLDivElement>(null);
  const press = useRef<number | null>(null);
  const out = m.direction === "out";
  const own = out && !!m.authorId && m.authorId === me;
  const age = now - new Date(m.at).getTime();
  const temp = isTemp(m);
  const items: { key: keyof BubbleActions | "copy"; label: string; icon: typeof Reply; danger?: boolean }[] = [];
  if (!m.deleted && !temp && !selecting) {
    // Не ушло (шлюз не принял) — повторить тем же текстом (chats-22).
    if (canSend && out && !m.internal && m.status === "error" && m.type === "text") items.push({ key: "retry", label: "Повторить отправку", icon: RotateCw });
    if (canSend && !m.internal) items.push({ key: "reply", label: "Ответить", icon: Reply });
    if (canSend && canForward(m)) items.push({ key: "forward", label: "Переслать", icon: Forward });
    if (m.text) items.push({ key: "copy", label: "Копировать текст", icon: Copy });
    if (!m.internal && hasCaption(m)) items.push({ key: "template", label: "Создать шаблон (/)", icon: Slash });
    if (own && m.type === "text" && m.status !== "error" && (m.internal || age < EDIT_MS)) items.push({ key: "edit", label: "Изменить", icon: Pencil });
    if (canRemove(m, me, now)) items.push({ key: "remove", label: m.internal || m.status === "error" ? "Удалить" : "Удалить у всех", icon: Trash2, danger: true });
    items.push({ key: "select", label: "Выбрать", icon: CheckSquare });
  } else if (temp && !selecting && m.status === "error") {
    // Не дошло до сервера (сеть, ошибка) — записи в CRM нет: повторить текст или убрать копию из ленты.
    if (canSend && m.type === "text") items.push({ key: "retry", label: "Повторить отправку", icon: RotateCw });
    if (m.text) items.push({ key: "copy", label: "Копировать текст", icon: Copy });
    items.push({ key: "discard", label: "Убрать из ленты", icon: Trash2, danger: true });
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
      <div className={cn("absolute z-30 w-56 overflow-hidden rounded-[10px] border border-line bg-white p-1 text-sm font-normal text-ink shadow-soft", menuUp ? "bottom-full mb-1" : "top-full mt-1", out ? "right-0" : "left-0")} role="menu">
        {items.map((it) => (
          <button
            key={it.key}
            type="button"
            role="menuitem"
            className={cn("flex min-h-9 w-full items-center gap-2.5 rounded-lg px-2.5 text-left hover:bg-sunken max-lg:min-h-11", it.danger ? "text-danger" : "text-ink")}
            onClick={() => {
              setMenu(false);
              onAction(it.key, m);
            }}
          >
            <it.icon className={cn("size-4", !it.danger && "text-ink-soft")} strokeWidth={1.8} /> {it.label}
          </button>
        ))}
        {mediaSrc(m) && m.type !== "text" ? (
          <a href={mediaSrc(m)!} {...(m.gateway || m.localSrc ? { download: true } : { target: "_blank", rel: "noopener noreferrer" })} className="flex min-h-9 w-full items-center gap-2.5 rounded-lg px-2.5 hover:bg-sunken max-lg:min-h-11" onClick={() => setMenu(false)}>
            <Download className="size-4 text-ink-soft" strokeWidth={1.8} /> Скачать
          </a>
        ) : null}
      </div>
    ) : null;

  const isBot = out && m.author === "бот";
  const botNote = m.internal && m.author === "бот";

  if (m.internal)
    return (
      <div ref={box} className={cn("group relative mx-auto my-2 w-full max-w-[min(560px,94%)]", highlighted && "rounded-[10px] ring-2 ring-wine/40")} data-internal="1" data-mid={m.id}>
        <div className={cn("rounded-[10px] border-l-[3px] px-3 py-2 text-[13px] leading-relaxed text-ink", botNote ? "border-info bg-info-bg" : "border-warning bg-warning-bg")}>
          <div className={cn("flex min-h-5 items-center gap-1.5 text-xs font-medium", botNote ? "text-info" : "text-warning")}>
            {botNote ? <Bot className="size-3.5 shrink-0" aria-hidden /> : <Lock className="size-3 shrink-0" aria-hidden />}
            <span className="min-w-0 truncate">{botNote ? "Итог бота" : `Заметка для коллег, ${m.author}`}</span>
            <span className="shrink-0 font-normal tabular-nums opacity-90">{time(m.at, timeZone)}</span>
            {m.edited ? <span className="shrink-0 font-normal opacity-90">изменено</span> : null}
            {botNote && !m.deleted ? (
              <button type="button" onClick={() => setOpenNote((v) => !v)} className="ml-auto shrink-0 rounded px-1 font-medium underline-offset-2 hover:underline max-lg:min-h-8" aria-expanded={openNote}>
                {openNote ? "Свернуть" : "Подробнее"}
              </button>
            ) : null}
            {items.length ? (
              <button type="button" className={cn("flex size-6 shrink-0 items-center justify-center rounded-md opacity-0 group-hover:opacity-100 hover:bg-ink/[0.06] focus:opacity-100 [@media(hover:none)]:opacity-100", !botNote && "ml-auto")} onClick={() => openMenu(!menu)} aria-label="Действия с заметкой">
                <ChevronDown className="size-3.5" />
              </button>
            ) : null}
          </div>
          {m.deleted ? (
            <p className="mt-0.5 text-muted italic">Заметка удалена</p>
          ) : botNote && !openNote ? (
            <p className="mt-0.5 truncate">{m.text.replace(/^🤖\s*/, "").split("\n")[0]}</p>
          ) : (
            <p className="mt-0.5 break-words whitespace-pre-wrap">{botNote ? m.text.replace(/^🤖\s*/, "") : m.text}</p>
          )}
        </div>
        {menuEl}
      </div>
    );

  const failed = m.status === "error";
  return (
    <div className={cn("flex", out ? "justify-end" : "justify-start")} data-mid={m.id}>
      <div
        ref={box}
        className={cn(
          "group relative max-w-[min(82%,560px)] rounded-[14px] border px-3 pt-1.5 pb-1.5 text-[14px] leading-[1.45] text-ink sm:max-w-[min(72%,560px)]",
          out ? (failed ? "border-danger/30 bg-danger-bg" : m.deleted ? "border-line bg-white/60" : isBot ? "border-transparent bg-info-bg" : "border-transparent bg-rose") : "border-line bg-white",
          last && (out ? "rounded-br-[4px]" : "rounded-bl-[4px]"),
          highlighted && "ring-2 ring-wine/40",
        )}
        data-direction={m.direction}
        onContextMenu={(e) => {
          if (!items.length) return;
          e.preventDefault();
          openMenu(true);
        }}
        onPointerDown={(e) => {
          if (e.pointerType !== "touch" || !items.length) return;
          press.current = window.setTimeout(() => openMenu(true), 450);
        }}
        onPointerUp={() => press.current && window.clearTimeout(press.current)}
        onPointerLeave={() => press.current && window.clearTimeout(press.current)}
        onDoubleClick={() => items.some((i) => i.key === "reply") && onAction("reply", m)}
      >
        {items.length ? (
          <button type="button" className="absolute top-1 right-1 z-10 flex size-6 items-center justify-center rounded-md border border-line bg-white text-muted opacity-0 group-hover:opacity-100 hover:text-ink focus:opacity-100" onClick={() => openMenu(!menu)} aria-label="Действия с сообщением">
            <ChevronDown className="size-4" />
          </button>
        ) : null}
        {first && out && m.author ? (
          <div className={cn("flex items-center gap-1 pt-0.5 text-xs font-semibold", isBot ? "text-info" : "text-wine")}>
            {isBot ? <Bot className="size-3.5" /> : null}
            {isBot ? "Бот" : m.author}
          </div>
        ) : null}
        {m.forwarded && !m.deleted ? (
          <div className="flex items-center gap-1 pt-0.5 text-xs text-muted italic">
            <Forward className="size-3.5" /> Пересланное сообщение
          </div>
        ) : null}
        {m.replyTo && !m.deleted ? (
          <button type="button" onClick={() => onJump(m.replyTo!.id)} className={cn("my-1 block w-full rounded-lg border-l-2 border-wine px-2 py-1 text-left text-[13px] transition-colors", out ? "bg-white/60 hover:bg-white/80" : "bg-sunken hover:bg-sunken/70")}>
            <span className="block text-xs font-semibold text-wine">{m.replyTo.direction === "in" ? "Клиент" : (m.replyTo.author ?? "Мы")}</span>
            <span className="line-clamp-2 text-ink-soft">{snippet(m.replyTo)}</span>
          </button>
        ) : null}
        {m.deleted ? (
          <p className="flex items-center gap-1.5 py-0.5 pr-14 text-muted italic">
            <Ban className="size-4" aria-hidden /> Сообщение удалено
          </p>
        ) : (
          <>
            <div className={m.type !== "text" ? "pt-1" : undefined}>
              <Attachment m={m} conversationId={conversationId} onOpen={() => onOpenMedia(m.id)} onVoiceEnded={() => onVoiceEnded(m.id)} />
            </div>
            {hasCaption(m) ? (
              <p className="break-words whitespace-pre-wrap">
                <Linkified text={m.text} out={false} />
                {/* Место под время справа, чтобы оно не наезжало на последнюю строку. */}
                <span className="inline-block w-[74px]" aria-hidden />
              </p>
            ) : null}
          </>
        )}
        {/* С текстом время встаёт в зарезервированное место его последней строки; без текста — своей строкой под вложением. */}
        <div className={cn("flex items-center justify-end gap-1 text-xs leading-none text-muted tabular-nums", hasCaption(m) ? "-mt-3.5 float-right ml-2 translate-y-0.5" : "mt-1")}>
          {m.edited && !m.deleted ? <span className="italic">изменено</span> : null}
          {time(m.at, timeZone)}
          {out ? <StatusIcon status={m.status} /> : null}
        </div>
        <div className="clear-both" />
        {failed && m.error ? (
          <div className="mt-1 flex items-start gap-1 text-xs text-danger">
            <AlertCircle className="mt-px size-3.5 shrink-0" aria-hidden /> <span className="min-w-0 [overflow-wrap:anywhere]">{m.error}</span>
          </div>
        ) : null}
        {/* Ответ AI-продажника: что решила модель и что сделал код. */}
        {isBot && m.trace && !m.deleted && !temp ? <BotTraceButton conversationId={conversationId} messageId={m.id} /> : null}
        {menuEl}
      </div>
    </div>
  );
}

/** Для сравнения перерисовок: «сейчас» важно лишь тем, что от него зависят окна правки и удаления сообщения. */
const windows = (m: Msg, now: number) => {
  const age = now - new Date(m.at).getTime();
  return (age < EDIT_MS ? 1 : 0) + (age < DELETE_MS ? 2 : 0);
};

/**
 * Лента на 150 сообщений не должна перерисовываться целиком из-за таймера «сейчас» (раз в полминуты), набора текста,
 * выделения одного сообщения или обновления страницы: пузырь перерисовывается, только если изменилось его сообщение или
 * то, что он показывает. Ссылки на сообщения ChatPanel сохраняет между обновлениями, обработчики у него стабильные.
 */
export const MessageBubble = memo(Bubble, (a, b) => {
  const { now: an, ...ar } = a;
  const { now: bn, ...br } = b;
  for (const k of Object.keys(ar) as (keyof typeof ar)[]) if (ar[k] !== br[k]) return false;
  return windows(a.m, an) === windows(b.m, bn);
});
