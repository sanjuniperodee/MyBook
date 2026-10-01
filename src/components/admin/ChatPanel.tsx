"use client";

import { useRouter } from "next/navigation";
import { useEffect, useMemo, useRef, useState, useTransition } from "react";
import { AlertCircle, BadgePercent, BookOpen, Check, CheckCheck, Clock, FileText, LoaderCircle, Lock, MessageSquareQuote, Receipt, SendHorizontal, Sparkles, Wallet } from "lucide-react";
import { aiSuggestReplyAction } from "@/app/admin/ai-actions";
import { markReadAction, sendInternalNoteAction, sendMessageAction, sendOfferAction } from "@/app/admin/chats/actions";
import { MentionTextarea } from "./MentionTextarea";
import type { ChatOffers } from "@/lib/crm/offers";
import { fillTemplate } from "@/lib/crm/automation-meta";
import { toast, toastError } from "@/components/ui/overlays";
import { cn } from "@/lib/utils";

export interface ChatMessage {
  id: string;
  direction: "in" | "out";
  type: string;
  text: string;
  mediaUrl: string | null;
  status: string;
  error: string | null;
  author: string | null;
  at: string;
  /** Внутренняя заметка сотрудника — клиент её не видит. */
  internal?: boolean;
}

const REFRESH_MS = 15_000;

/** Время — в часовом поясе магазина, как и во всей CRM (браузер менеджера может быть настроен иначе). */
const TZ = "Asia/Almaty";
const dayKey = (d: Date) => new Intl.DateTimeFormat("en-CA", { timeZone: TZ }).format(d);

function dayLabel(iso: string) {
  const d = new Date(iso);
  const today = new Date();
  const key = dayKey(d);
  if (key === dayKey(today)) return "Сегодня";
  if (key === dayKey(new Date(today.getTime() - 86_400_000))) return "Вчера";
  return new Intl.DateTimeFormat("ru-RU", { timeZone: TZ, day: "numeric", month: "long", year: key.slice(0, 4) === dayKey(today).slice(0, 4) ? undefined : "numeric" }).format(d);
}

const time = (iso: string) => new Intl.DateTimeFormat("ru-RU", { timeZone: TZ, hour: "2-digit", minute: "2-digit" }).format(new Date(iso));

function StatusIcon({ status }: { status: string }) {
  if (status === "pending") return <Clock className="size-3" />;
  if (status === "sent") return <Check className="size-3" />;
  if (status === "delivered") return <CheckCheck className="size-3" />;
  if (status === "read") return <CheckCheck className="size-3 text-sky-300" />;
  if (status === "error") return <AlertCircle className="size-3 text-red-200" />;
  return null;
}

function Media({ m }: { m: ChatMessage }) {
  if (!m.mediaUrl) return null;
  if (m.type === "image")
    return (
      <a href={m.mediaUrl} target="_blank" rel="noopener noreferrer">
        {/* eslint-disable-next-line @next/next/no-img-element */}
        <img src={m.mediaUrl} alt="" className="mb-1 max-h-64 rounded-lg object-cover" loading="lazy" />
      </a>
    );
  if (m.type === "audio") return <audio controls src={m.mediaUrl} className="mb-1 h-9 max-w-full" preload="none" />;
  if (m.type === "video") return <video controls src={m.mediaUrl} className="mb-1 max-h-64 rounded-lg" preload="none" />;
  return (
    <a href={m.mediaUrl} target="_blank" rel="noopener noreferrer" className="mb-1 flex items-center gap-1.5 underline">
      <FileText className="size-4" /> Открыть файл
    </a>
  );
}

/**
 * Переписка с клиентом и поле ответа. Список сообщений приходит с сервера и обновляется router.refresh();
 * отправленные сообщения показываем сразу (оптимистично), пока сервер их не подтвердит.
 */
export function ChatPanel({
  conversationId,
  messages,
  canSend,
  templates,
  vars,
  sendDisabledReason,
  className,
  mentionables = [],
  offers = null,
  ai = false,
}: {
  conversationId: string;
  messages: ChatMessage[];
  canSend: boolean;
  templates: { id: string; title: string; text: string }[];
  vars: { name: string; order: number | null; link: string; manager: string; fields?: Record<string, string> };
  sendDisabledReason?: string | null;
  className?: string;
  mentionables?: string[];
  offers?: ChatOffers | null;
  /** Подключён AI-помощник: кнопка «Подсказать ответ». */
  ai?: boolean;
}) {
  const router = useRouter();
  const [text, setText] = useState("");
  const [local, setLocal] = useState<ChatMessage[]>([]);
  const [showTemplates, setShowTemplates] = useState(false);
  const [showOffers, setShowOffers] = useState(false);
  const [discount, setDiscount] = useState({ percent: 10, hours: 48 });
  const [mode, setMode] = useState<"client" | "note">(canSend ? "client" : "note");
  const [sending, start] = useTransition();
  const [thinking, think] = useTransition();
  const scroller = useRef<HTMLDivElement>(null);
  const input = useRef<HTMLTextAreaElement>(null);

  // Серверная версия сообщения вытесняет локальную копию.
  const all = useMemo(() => {
    const ids = new Set(messages.map((m) => m.id));
    return [...messages, ...local.filter((m) => !ids.has(m.id))].sort((a, b) => a.at.localeCompare(b.at));
  }, [messages, local]);

  useEffect(() => {
    void markReadAction(conversationId).then(() => window.dispatchEvent(new Event("crm:refresh")));
  }, [conversationId, messages.length]);

  useEffect(() => {
    scroller.current?.scrollTo({ top: scroller.current.scrollHeight });
  }, [all.length, conversationId]);

  useEffect(() => {
    // Новые сообщения приходят событием (SSE); опрос — страховка на случай обрыва соединения.
    const onLive = (e: Event) => {
      const d = (e as CustomEvent<{ type?: string; conversationId?: string | null }>).detail;
      if (d?.type === "chat" && (!d.conversationId || d.conversationId === conversationId)) router.refresh();
    };
    window.addEventListener("crm:live", onLive);
    const id = window.setInterval(() => document.visibilityState === "visible" && router.refresh(), REFRESH_MS);
    return () => {
      window.removeEventListener("crm:live", onLive);
      window.clearInterval(id);
    };
  }, [router, conversationId]);

  const offer = (req: Parameters<typeof sendOfferAction>[1]) => {
    setShowOffers(false);
    start(async () => {
      try {
        const r = await sendOfferAction(conversationId, req);
        toast(r.message, r.ok ? "success" : "error");
        router.refresh();
      } catch (err) {
        toastError(err);
      }
    });
  };

  const suggest = () =>
    think(async () => {
      try {
        const r = await aiSuggestReplyAction(conversationId);
        if (!r.ok) return toast(r.message, "error");
        setText(r.text);
        input.current?.focus();
      } catch (err) {
        toastError(err);
      }
    });

  const send = () => {
    const body = text.trim();
    if (!body || sending) return;
    const tempId = `tmp-${Date.now()}`;
    const internal = mode === "note";
    setLocal((l) => [...l, { id: tempId, direction: "out", type: "text", text: body, mediaUrl: null, status: internal ? "sent" : "pending", error: null, author: vars.manager || "Вы", at: new Date().toISOString(), internal }]);
    setText("");
    start(async () => {
      try {
        if (internal) {
          const res = await sendInternalNoteAction(conversationId, body);
          setLocal((l) => l.map((m) => (m.id === tempId ? { ...m, id: res.id } : m)));
          router.refresh();
          return;
        }
        const res = await sendMessageAction(conversationId, body);
        setLocal((l) => l.map((m) => (m.id === tempId ? { ...m, id: res.id, status: res.status, error: res.error } : m)));
        router.refresh();
      } catch (err) {
        setLocal((l) => l.map((m) => (m.id === tempId ? { ...m, status: "error", error: (err as Error).message } : m)));
        toastError(err);
      }
    });
  };

  let lastDay = "";
  return (
    <div className={cn("flex min-h-0 flex-col", className)}>
      <div ref={scroller} className="min-h-0 flex-1 space-y-1.5 overflow-y-auto bg-[#f4efe7] px-3 py-4 sm:px-5" data-testid="chat-messages">
        {all.length === 0 ? <p className="py-10 text-center text-sm text-muted">Сообщений пока нет — напишите первым.</p> : null}
        {all.map((m) => {
          const day = dayLabel(m.at);
          const sep = day !== lastDay;
          lastDay = day;
          return (
            <div key={m.id}>
              {sep ? (
                <div className="my-3 text-center">
                  <span className="rounded-full bg-white/80 px-3 py-1 text-[11px] text-muted">{day}</span>
                </div>
              ) : null}
              {m.internal ? (
                <div className="mx-auto my-1 max-w-[88%] rounded-xl border border-amber-200 bg-amber-50 px-3 py-2 text-sm text-amber-950" data-internal="1">
                  <div className="mb-0.5 flex items-center gap-1.5 text-[11px] text-amber-800">
                    <Lock className="size-3" /> Заметка · {m.author} · {time(m.at)}
                  </div>
                  <p className="break-words whitespace-pre-wrap">{m.text}</p>
                </div>
              ) : (
              <div className={cn("flex", m.direction === "out" ? "justify-end" : "justify-start")}>
                <div
                  className={cn(
                    "max-w-[80%] rounded-2xl px-3 py-2 text-sm shadow-sm",
                    m.direction === "out" ? "rounded-br-md bg-wine text-white" : "rounded-bl-md bg-white text-ink",
                    m.status === "error" && "bg-red-700",
                  )}
                  data-direction={m.direction}
                >
                  <Media m={m} />
                  {m.text ? <p className="break-words whitespace-pre-wrap">{m.text}</p> : null}
                  <div className={cn("mt-1 flex items-center justify-end gap-1 text-[10px]", m.direction === "out" ? "text-white/70" : "text-muted")}>
                    {m.direction === "out" && m.author ? <span className="mr-1 truncate">{m.author}</span> : null}
                    {time(m.at)}
                    {m.direction === "out" ? <StatusIcon status={m.status} /> : null}
                  </div>
                  {m.status === "error" && m.error ? <div className="mt-1 text-[11px] text-red-100">{m.error}</div> : null}
                </div>
              </div>
              )}
            </div>
          );
        })}
      </div>
      <div className={cn("relative border-t bg-white p-3", mode === "note" ? "border-amber-200 bg-amber-50/60" : "border-line")}>
        {showTemplates && templates.length && mode === "client" ? (
          <div className="absolute right-3 bottom-full left-3 mb-2 max-h-64 overflow-y-auto rounded-xl border border-line bg-white shadow-xl">
            {templates.map((t) => (
              <button
                key={t.id}
                type="button"
                className="block w-full px-4 py-2.5 text-left hover:bg-cream/60"
                onClick={() => {
                  setText(fillTemplate(t.text, vars));
                  setShowTemplates(false);
                  input.current?.focus();
                }}
              >
                <span className="block text-sm font-medium">{t.title}</span>
                <span className="line-clamp-1 text-xs text-muted">{t.text}</span>
              </button>
            ))}
          </div>
        ) : null}
        {showOffers && offers ? (
          <div className="absolute bottom-full left-3 mb-2 w-80 space-y-1 rounded-xl border border-line bg-white p-2 shadow-xl" data-testid="offers">
            <button type="button" disabled={!offers.order || sending} className="flex w-full items-center gap-2 rounded-lg px-3 py-2 text-left text-sm hover:bg-cream/60 disabled:opacity-40" onClick={() => offer({ kind: "order" })}>
              <Receipt className="size-4 text-wine" /> {offers.order ? `Ссылка на оплату заказа №${offers.order.number}` : "Неоплаченного заказа нет"}
            </button>
            <button type="button" disabled={!offers.book || sending} className="flex w-full items-center gap-2 rounded-lg px-3 py-2 text-left text-sm hover:bg-cream/60 disabled:opacity-40" onClick={() => offer({ kind: "book" })}>
              <BookOpen className="size-4 text-wine" /> {offers.book ? `Ссылка на книгу «${offers.book.title}»` : "Книги в работе нет"}
            </button>
            {offers.maxDiscount > 0 ? (
              <div className="rounded-lg border border-line p-2">
                <div className="mb-2 flex items-center gap-2 text-sm font-medium">
                  <BadgePercent className="size-4 text-wine" /> Персональная скидка
                </div>
                <div className="flex items-center gap-2 text-sm">
                  <select className="input h-8 text-sm" value={discount.percent} onChange={(e) => setDiscount((d) => ({ ...d, percent: Number(e.target.value) }))} aria-label="Размер скидки">
                    {[5, 10, 15, 20, 25, 30].filter((p) => p <= offers.maxDiscount).map((p) => (
                      <option key={p} value={p}>
                        {p}%
                      </option>
                    ))}
                  </select>
                  <select className="input h-8 text-sm" value={discount.hours} onChange={(e) => setDiscount((d) => ({ ...d, hours: Number(e.target.value) }))} aria-label="Срок действия">
                    <option value={24}>на сутки</option>
                    <option value={48}>на 2 дня</option>
                    <option value={72}>на 3 дня</option>
                    <option value={168}>на неделю</option>
                  </select>
                  <button type="button" className="btn btn-sm h-8" disabled={sending} onClick={() => offer({ kind: "discount", ...discount })}>
                    Отправить
                  </button>
                </div>
                <p className="mt-1.5 text-[11px] text-muted">Одноразовый промокод; по ссылке скидка применится сама.</p>
              </div>
            ) : null}
          </div>
        ) : null}
        {sendDisabledReason && mode === "client" ? <p className="mb-2 rounded-lg bg-amber-50 px-3 py-2 text-xs text-amber-800">{sendDisabledReason}</p> : null}
        <div className="mb-2 flex gap-1 text-xs">
          {canSend ? (
            <button type="button" onClick={() => setMode("client")} className={cn("rounded-lg px-2.5 py-1", mode === "client" ? "bg-ink text-white" : "text-muted hover:bg-cream")}>
              Клиенту
            </button>
          ) : null}
          <button type="button" onClick={() => setMode("note")} className={cn("flex items-center gap-1 rounded-lg px-2.5 py-1", mode === "note" ? "bg-amber-500 text-white" : "text-muted hover:bg-cream")}>
            <Lock className="size-3" /> Заметка для коллег
          </button>
        </div>
        <div className="flex items-end gap-2">
          {mode === "client" ? (
            <>
              <button type="button" className="btn btn-ghost btn-sm size-10 px-0" onClick={() => (setShowTemplates((v) => !v), setShowOffers(false))} title="Шаблоны ответов" aria-label="Шаблоны">
                <MessageSquareQuote className="size-5" />
              </button>
              {offers ? (
                <button type="button" className="btn btn-ghost btn-sm size-10 px-0" onClick={() => (setShowOffers((v) => !v), setShowTemplates(false))} title="Оплата и скидка" aria-label="Оплата и скидка">
                  <Wallet className="size-5" />
                </button>
              ) : null}
              {ai ? (
                <button type="button" className="btn btn-ghost btn-sm size-10 px-0 text-violet-700" onClick={suggest} disabled={thinking} title="AI: подсказать ответ (вы сможете поправить текст перед отправкой)" aria-label="Подсказать ответ">
                  {thinking ? <LoaderCircle className="size-5 animate-spin" /> : <Sparkles className="size-5" />}
                </button>
              ) : null}
            </>
          ) : null}
          <MentionTextarea
            ref={input}
            value={text}
            onValueChange={setText}
            mentionables={mentionables}
            onKeyDown={(e) => {
              if (e.key === "Enter" && !e.shiftKey && !e.nativeEvent.isComposing) {
                e.preventDefault();
                send();
              }
            }}
            rows={1}
            maxLength={4000}
            placeholder={mode === "note" ? "Заметка видна только сотрудникам. @имя — позвать коллегу" : "Сообщение… (Enter — отправить, Shift+Enter — новая строка)"}
            className="max-h-40 min-h-10 w-full resize-none rounded-xl border border-line bg-[#fbf9f5] px-3 py-2 text-sm outline-none field-sizing-content focus:border-wine/40"
            aria-label="Текст сообщения"
          />
          <button type="button" className={cn("btn size-10 px-0", mode === "note" && "bg-amber-500 hover:bg-amber-600")} disabled={!text.trim() || sending} onClick={send} aria-label="Отправить">
            <SendHorizontal className="size-5" />
          </button>
        </div>
      </div>
    </div>
  );
}
