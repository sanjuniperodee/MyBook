"use client";

import { useRouter } from "next/navigation";
import { useEffect, useMemo, useRef, useState, useTransition } from "react";
import { AlertCircle, Check, CheckCheck, Clock, FileText, MessageSquareQuote, SendHorizontal } from "lucide-react";
import { markReadAction, sendMessageAction } from "@/app/admin/chats/actions";
import { fillTemplate } from "@/lib/crm/automation-meta";
import { toastError } from "@/components/ui/overlays";
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
}

const REFRESH_MS = 5_000;

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
}: {
  conversationId: string;
  messages: ChatMessage[];
  canSend: boolean;
  templates: { id: string; title: string; text: string }[];
  vars: { name: string; order: number | null; link: string; manager: string };
  sendDisabledReason?: string | null;
  className?: string;
}) {
  const router = useRouter();
  const [text, setText] = useState("");
  const [local, setLocal] = useState<ChatMessage[]>([]);
  const [showTemplates, setShowTemplates] = useState(false);
  const [sending, start] = useTransition();
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
    const id = window.setInterval(() => document.visibilityState === "visible" && router.refresh(), REFRESH_MS);
    return () => window.clearInterval(id);
  }, [router]);

  const send = () => {
    const body = text.trim();
    if (!body || sending) return;
    const tempId = `tmp-${Date.now()}`;
    setLocal((l) => [...l, { id: tempId, direction: "out", type: "text", text: body, mediaUrl: null, status: "pending", error: null, author: vars.manager || "Вы", at: new Date().toISOString() }]);
    setText("");
    start(async () => {
      try {
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
            </div>
          );
        })}
      </div>
      {canSend ? (
        <div className="relative border-t border-line bg-white p-3">
          {showTemplates && templates.length ? (
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
          {sendDisabledReason ? <p className="mb-2 rounded-lg bg-amber-50 px-3 py-2 text-xs text-amber-800">{sendDisabledReason}</p> : null}
          <div className="flex items-end gap-2">
            <button type="button" className="btn btn-ghost btn-sm size-10 px-0" onClick={() => setShowTemplates((v) => !v)} title="Шаблоны ответов" aria-label="Шаблоны">
              <MessageSquareQuote className="size-5" />
            </button>
            <textarea
              ref={input}
              value={text}
              onChange={(e) => setText(e.target.value)}
              onKeyDown={(e) => {
                if (e.key === "Enter" && !e.shiftKey && !e.nativeEvent.isComposing) {
                  e.preventDefault();
                  send();
                }
              }}
              rows={1}
              maxLength={4000}
              placeholder="Сообщение… (Enter — отправить, Shift+Enter — новая строка)"
              className="max-h-40 min-h-10 flex-1 resize-none rounded-xl border border-line bg-[#fbf9f5] px-3 py-2 text-sm outline-none field-sizing-content focus:border-wine/40"
              aria-label="Текст сообщения"
            />
            <button type="button" className="btn size-10 px-0" disabled={!text.trim() || sending} onClick={send} aria-label="Отправить">
              <SendHorizontal className="size-5" />
            </button>
          </div>
        </div>
      ) : (
        <p className="border-t border-line bg-white p-3 text-center text-xs text-muted">Ваша роль позволяет только читать переписку.</p>
      )}
    </div>
  );
}
