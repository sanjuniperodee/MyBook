"use client";

import { useState, useTransition } from "react";
import { Check, MessagesSquare, Search, X } from "lucide-react";
import { cn } from "@/lib/class-names";
import { chatMessagesAction, linkChatAction, searchChatsAction, type ChatHit, type ChatLine } from "../actions";

const time = (iso: string) => new Date(iso).toLocaleString("ru-RU", { day: "2-digit", month: "2-digit", hour: "2-digit", minute: "2-digit" });

function lineText(m: ChatLine) {
  if (m.type === "audio") return m.transcript ? `🎤 ${m.transcript}` : "🎤 Голосовое";
  return m.text || (m.type === "image" ? "📷 Фото" : m.type === "video" ? "🎬 Видео" : "📎 Файл");
}

/**
 * Выбор переписки клиента для обращения: найти диалог по телефону или имени, отметить сообщения, которые и есть
 * обращение (жалоба клиента, голосовые, скриншоты), и приложить. Голосовые потом расшифровываются Gemini.
 */
export function ChatPicker({ ticketId, number, initialQuery, linked }: { ticketId: string; number: number; initialQuery: string; linked: { conversationId: string; ids: string[] } | null }) {
  const [open, setOpen] = useState(false);
  const [q, setQ] = useState(initialQuery);
  const [hits, setHits] = useState<ChatHit[] | null>(null);
  const [conv, setConv] = useState<ChatHit | null>(null);
  const [lines, setLines] = useState<ChatLine[]>([]);
  const [more, setMore] = useState(true);
  const [picked, setPicked] = useState<Set<string>>(new Set(linked?.ids ?? []));
  const [error, setError] = useState("");
  const [pending, start] = useTransition();

  const search = () =>
    start(async () => {
      setError("");
      setConv(null);
      setHits(await searchChatsAction(q));
    });

  const openChat = (c: ChatHit) =>
    start(async () => {
      setConv(c);
      const rows = await chatMessagesAction(c.id);
      setLines(rows);
      setMore(rows.length >= 80);
      if (linked?.conversationId !== c.id) setPicked(new Set());
    });

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

  const save = (ids: string[]) =>
    start(async () => {
      const r = await linkChatAction(number, ticketId, ids.length && conv ? conv.id : null, ids);
      if (!r.ok) return setError(r.error);
      setOpen(false);
    });

  if (!open) {
    return (
      <div className="flex flex-wrap gap-2">
        <button type="button" className="btn btn-outline" onClick={() => (setOpen(true), hits === null && q && search())}>
          <MessagesSquare className="size-4" aria-hidden /> {linked ? "Изменить сообщения" : "Выбрать чат и сообщения"}
        </button>
        {linked ? (
          <button type="button" className="btn btn-ghost" disabled={pending} onClick={() => save([])}>
            <X className="size-4" aria-hidden /> Отвязать
          </button>
        ) : null}
      </div>
    );
  }

  return (
    <div className="space-y-3">
      <form
        className="flex gap-2"
        onSubmit={(e) => {
          e.preventDefault();
          search();
        }}
      >
        <div className="relative flex-1">
          <Search className="pointer-events-none absolute top-1/2 left-3 size-4 -translate-y-1/2 text-muted" aria-hidden />
          <input className="input pl-9" value={q} onChange={(e) => setQ(e.target.value)} placeholder="Телефон или имя клиента" aria-label="Найти чат" />
        </div>
        <button type="submit" className="btn btn-outline" disabled={pending}>
          Найти
        </button>
        <button type="button" className="btn btn-ghost btn-icon" onClick={() => setOpen(false)} aria-label="Закрыть">
          <X className="size-4" aria-hidden />
        </button>
      </form>

      {!conv && hits ? (
        hits.length ? (
          <ul className="divide-y divide-line rounded-[10px] border border-line">
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
          <p className="text-sm text-muted">Чатов не нашлось — попробуйте последние цифры номера.</p>
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
          <p className="text-xs text-muted">Отметьте сообщения, которые относятся к обращению: жалобу, голосовые, скриншоты, ответы менеджера по теме.</p>
          <div className="max-h-[28rem] space-y-1 overflow-y-auto rounded-[10px] border border-line p-2">
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
          <button type="button" className="btn btn-primary" disabled={pending || !picked.size} onClick={() => save([...picked])}>
            Приложить {picked.size ? `${picked.size} сообщ.` : ""}
          </button>
        </div>
      ) : null}
      {pending ? <p className="text-sm text-muted">Загружаем… после привязки голосовые расшифровываются — до минуты.</p> : null}
      {error ? <p className="field-error text-sm">{error}</p> : null}
    </div>
  );
}
