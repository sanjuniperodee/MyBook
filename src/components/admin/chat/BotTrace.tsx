"use client";

import { useState, useTransition } from "react";
import { HelpCircle, LoaderCircle } from "lucide-react";
import type { BotTurnTrace } from "@/modules/messaging";
import { traceRows } from "@/modules/messaging/ui/botTrace";
import { botTraceAction } from "@/app/admin/chats/actions";
import { cn } from "@/lib/class-names";

/** След хода AI-продажника строками — в «Почему так?» у ответа в чате и под ответом в тест-режиме настроек бота. */
export function BotTraceView({ trace }: { trace: BotTurnTrace }) {
  return (
    <dl className="space-y-1.5 text-[12px] leading-snug" data-testid="bot-trace">
      {traceRows(trace).map((r) => (
        <div key={r.label}>
          <dt className="font-medium text-ink-soft">{r.label}</dt>
          {r.lines.map((line, i) => (
            <dd key={i} className={cn("break-words", r.warn ? "text-amber-800" : "text-ink")}>
              {line}
            </dd>
          ))}
        </div>
      ))}
    </dl>
  );
}

/**
 * «Почему так?» под ответом бота в чате: по клику раскрывается след хода (загружается с сервера — право «Чаты» и
 * видимость диалога проверяет действие). initial — готовый след (превью и тесты без сервера).
 */
export function BotTraceButton({ conversationId, messageId, initial = null }: { conversationId: string; messageId: string; initial?: BotTurnTrace | null }) {
  const [open, setOpen] = useState(!!initial);
  const [loaded, setLoaded] = useState<{ trace?: BotTurnTrace; error?: string } | null>(initial ? { trace: initial } : null);
  const [pending, start] = useTransition();
  const toggle = () => {
    const next = !open;
    setOpen(next);
    if (next && !loaded?.trace)
      start(async () => {
        setLoaded(await botTraceAction(conversationId, messageId).catch(() => ({ error: "Не удалось загрузить — попробуйте ещё раз" })));
      });
  };
  return (
    <div className="clear-both mt-1" data-testid="bot-trace-button">
      <button type="button" onClick={toggle} className="flex items-center gap-1 text-[11.5px] text-violet-700 hover:underline" aria-expanded={open}>
        <HelpCircle className="size-3.5" /> Почему так?
      </button>
      {open ? (
        <div className="mt-1 rounded-lg border border-violet-200 bg-white/80 p-2">
          {pending ? <LoaderCircle className="size-4 animate-spin text-muted" /> : loaded?.trace ? <BotTraceView trace={loaded.trace} /> : <p className="text-[12px] text-muted">{loaded?.error ?? ""}</p>}
        </div>
      ) : null}
    </div>
  );
}
