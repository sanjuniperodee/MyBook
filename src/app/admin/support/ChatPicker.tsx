"use client";

import { useEffect, useState, useTransition } from "react";
import { Check, MessagesSquare, Search, X } from "lucide-react";
import { cn } from "@/lib/class-names";
import { chatMessagesAction, linkChatAction, searchChatsAction, type ChatHit, type ChatLine } from "./actions";

const time = (iso: string) => new Date(iso).toLocaleString("ru-RU", { day: "2-digit", month: "2-digit", hour: "2-digit", minute: "2-digit" });

function lineText(m: ChatLine) {
  if (m.type === "audio") return m.transcript ? `🎤 ${m.transcript}` : "🎤 Голосовое";
  return m.text || (m.type === "image" ? "📷 Фото" : m.type === "video" ? "🎬 Видео" : "📎 Файл");
}

export interface ChatPick {
  chat: ChatHit;
  ids: string[];
}

/**
 * Выбор переписки клиента: найти чат CRM по телефону или имени, отметить сообщения, которые писал клиент по этой
 * проблеме (жалоба, голосовые, скриншоты, ответы менеджера по теме). onPick — что сделать с выбором: в форме нового
 * обращения — запомнить, в карточке — приложить. Голосовые выбранных сообщений потом расшифровываются Gemini.
 */
export function ChatSelect({ initialQuery, initialChat, initialIds, onPick, onCancel, pickLabel }: { initialQuery: string; initialChat?: ChatHit | null; initialIds?: string[]; onPick: (pick: ChatPick) => void | Promise<void>; onCancel?: () => void; pickLabel: string }) {
  const [q, setQ] = useState(initialQuery);
  const [hits, setHits] = useState<ChatHit[] | null>(null);
  const [conv, setConv] = useState<ChatHit | null>(null);
  const [lines, setLines] = useState<ChatLine[]>([]);
  const [more, setMore] = useState(true);
  const [picked, setPicked] = useState<Set<string>>(new Set(initialIds ?? []));
  const [pending, start] = useTransition();

  const search = (term: string) =>
    start(async () => {
      setConv(null);
      setHits(term.trim() ? await searchChatsAction(term) : []);
    });

  const openChat = (c: ChatHit, keep = false) =>
    start(async () => {
      setConv(c);
      const rows = await chatMessagesAction(c.id);
      setLines(rows);
      setMore(rows.length >= 80);
      if (!keep) setPicked(new Set());
    });

  // Открыли с готовым чатом (из чата CRM или уже приложенной перепиской) — сразу его сообщения; иначе — поиск по телефону.
  useEffect(() => {
    if (initialChat) openChat(initialChat, true);
    else if (initialQuery.trim()) search(initialQuery);
    // eslint-disable-next-line react-hooks/exhaustive-deps -- только при открытии
  }, []);

  const older = () =>
    start(async () => {
      if (!conv || !lines.length) return;
      const rows = await chatMessagesAction(conv.id, lines[0].at);
      setLines((prev) => [...rows, ...prev]);
      setMore(rows.length >= 80);
    });

  const toggle = (id: string) =>
    setPicked((prev) => {
      const next = new Set(prev);
      if (next.has(id)) next.delete(id);
      else next.add(id);
      return next;
    });

  return (
    <div className="space-y-3">
      <div className="flex gap-2">
        <div className="relative flex-1">
          <Search className="pointer-events-none absolute top-1/2 left-3 size-4 -translate-y-1/2 text-muted" aria-hidden />
          <input
            className="input pl-9"
            value={q}
            onChange={(e) => setQ(e.target.value)}
            onKeyDown={(e) => {
              if (e.key === "Enter") {
                e.preventDefault();
                search(q);
              }
            }}
            placeholder="Телефон или имя клиента"
            aria-label="Найти чат клиента"
          />
        </div>
        <button type="button" className="btn btn-outline" disabled={pending} onClick={() => search(q)}>
          Найти
        </button>
        {onCancel ? (
          <button type="button" className="btn btn-ghost btn-icon" onClick={onCancel} aria-label="Закрыть">
            <X className="size-4" aria-hidden />
          </button>
        ) : null}
      </div>

      {!conv && hits ? (
        hits.length ? (
          <ul className="divide-y divide-line rounded-[10px] border border-line bg-white">
            {hits.map((c) => (
              <li key={c.id}>
                <button type="button" className="w-full px-3 py-2 text-left text-sm hover:bg-sunken/60" onClick={() => openChat(c)}>
                  <span className="font-medium">{c.contact || `+${c.chatId}`}</span> <span className="text-xs text-muted">{c.channel === "whatsapp" ? `+${c.chatId}` : c.channel}</span>
                  <span className="block truncate text-xs text-muted">
                    {c.lastAt ? `${time(c.lastAt)} · ` : ""}
                    {c.last}
                  </span>
                </button>
              </li>
            ))}
          </ul>
        ) : (
          <p className="text-sm text-muted">Чатов не нашлось — попробуйте последние цифры номера или имя.</p>
        )
      ) : null}

      {conv ? (
        <div className="space-y-2">
          <div className="flex items-center justify-between gap-2 text-sm">
            <span className="font-medium">{conv.contact || `+${conv.chatId}`}</span>
            <button type="button" className="text-xs text-muted underline" onClick={() => setConv(null)}>
              другой чат
            </button>
          </div>
          <p className="text-xs text-muted">Отметьте, что писал клиент по этой проблеме: жалобу, голосовые, скриншоты — и ответы по теме.</p>
          <div className="max-h-[28rem] space-y-1 overflow-y-auto rounded-[10px] border border-line bg-white p-2">
            {more ? (
              <button type="button" className="btn btn-ghost btn-sm w-full" onClick={older} disabled={pending}>
                Раньше
              </button>
            ) : null}
            {lines.map((m) => {
              const on = picked.has(m.id);
              return (
                <button
                  key={m.id}
                  type="button"
                  onClick={() => toggle(m.id)}
                  aria-pressed={on}
                  className={cn("flex w-full items-start gap-2 rounded-[8px] px-2 py-1.5 text-left text-sm", m.direction === "in" ? "bg-sunken/60" : "bg-white", on && "ring-2 ring-wine")}
                >
                  <span className={cn("mt-0.5 grid size-4 shrink-0 place-items-center rounded border", on ? "border-wine bg-wine text-white" : "border-line-strong")}>{on ? <Check className="size-3" aria-hidden /> : null}</span>
                  <span className="min-w-0 flex-1">
                    <span className="text-[11px] text-muted">
                      {m.direction === "in" ? "клиент" : "магазин"} · {time(m.at)}
                    </span>
                    <span className="block break-words whitespace-pre-wrap">{lineText(m)}</span>
                  </span>
                </button>
              );
            })}
          </div>
          <button type="button" className="btn btn-primary" disabled={pending || !picked.size} onClick={() => start(async () => onPick({ chat: conv, ids: [...picked] }))}>
            {pickLabel} {picked.size ? `· ${picked.size} сообщ.` : ""}
          </button>
        </div>
      ) : null}
      {pending ? <p className="text-sm text-muted">Загружаем…</p> : null}
    </div>
  );
}

/** Переписка в карточке обращения: изменить отмеченные сообщения или отвязать. */
export function TicketChatPicker({ ticketId, number, initialQuery, linked }: { ticketId: string; number: number; initialQuery: string; linked: { chat: ChatHit; ids: string[] } | null }) {
  const [open, setOpen] = useState(false);
  const [error, setError] = useState("");
  const [pending, start] = useTransition();

  const save = async (convId: string | null, ids: string[]) => {
    setError("");
    const r = await linkChatAction(number, ticketId, convId, ids);
    if (!r.ok) return setError(r.error);
    setOpen(false);
  };

  if (!open) {
    return (
      <div className="flex flex-wrap gap-2">
        <button type="button" className="btn btn-outline" onClick={() => setOpen(true)}>
          <MessagesSquare className="size-4" aria-hidden /> {linked ? "Изменить сообщения" : "Выбрать чат и сообщения"}
        </button>
        {linked ? (
          <button type="button" className="btn btn-ghost" disabled={pending} onClick={() => start(() => save(null, []))}>
            <X className="size-4" aria-hidden /> Отвязать
          </button>
        ) : null}
        {error ? <p className="field-error w-full text-sm">{error}</p> : null}
      </div>
    );
  }
  return (
    <div className="space-y-2">
      <ChatSelect initialQuery={initialQuery} initialChat={linked?.chat} initialIds={linked?.ids} pickLabel="Приложить" onCancel={() => setOpen(false)} onPick={({ chat, ids }) => save(chat.id, ids)} />
      <p className="text-xs text-muted">После привязки голосовые расшифровываются — до минуты.</p>
      {error ? <p className="field-error text-sm">{error}</p> : null}
    </div>
  );
}
