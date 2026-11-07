"use client";

import { useRouter } from "next/navigation";
import { useTransition } from "react";
import { Archive, Bot, Handshake, Inbox, LoaderCircle, Play, Square } from "lucide-react";
import { toastError } from "@/components/ui/overlays";
import { cn } from "@/lib/class-names";
import type { BotStatus } from "@/modules/messaging";
import { assignConversationAction, createDealFromChatAction, setConversationStatusAction, startBotAction, stopBotAction } from "./actions";

/**
 * Полоса бота над перепиской: что он делает сейчас («Бот: вопрос 2 из 4», «Бот передал менеджеру») и кнопки
 * «Остановить» / «Запустить». Бот, который ни разу не работал, — только кнопка запуска.
 */
export function BotBanner({ conversationId, status, canControl, hasDeal }: { conversationId: string; status: BotStatus; canControl: boolean; hasDeal: boolean }) {
  const [pending, start] = useTransition();
  const router = useRouter();
  if (!status.label) return null;
  const run = (fn: () => Promise<unknown>) =>
    start(async () => {
      try {
        await fn();
        router.refresh();
      } catch (e) {
        toastError(e);
      }
    });
  return (
    <div
      className={cn("flex min-h-10 items-center gap-2 border-b border-line px-4 py-1 text-xs lg:px-5", status.tone === "active" || status.tone === "waiting" ? "bg-info-bg text-info" : "bg-sunken/60 text-ink-soft")}
      data-testid="bot-banner"
    >
      <Bot className="size-4 shrink-0" strokeWidth={1.8} aria-hidden />
      <span className="min-w-0 flex-1 truncate font-medium">{status.label}</span>
      {canControl && status.canStop ? (
        <button className="btn btn-ghost btn-sm h-8 px-2.5 text-xs text-current max-lg:h-11" disabled={pending} onClick={() => run(() => stopBotAction(conversationId))}>
          {pending ? <LoaderCircle className="size-3.5 animate-spin" /> : <Square className="size-3.5" />} Остановить бота
        </button>
      ) : null}
      {canControl && hasDeal && status.canStart ? (
        <button className="btn btn-ghost btn-sm h-8 px-2.5 text-xs text-current max-lg:h-11" disabled={pending} onClick={() => run(() => startBotAction(conversationId))} title="Бот поздоровается и спросит то, чего ещё нет в сделке">
          {pending ? <LoaderCircle className="size-3.5 animate-spin" /> : <Play className="size-3.5" />} Запустить бота
        </button>
      ) : null}
    </div>
  );
}

export function ChatSideControls({
  conversationId,
  assigneeId,
  options,
  status,
  hasDeal,
  canSend,
  canCreateDeal,
  canStartBot = false,
}: {
  conversationId: string;
  assigneeId: string | null;
  options: { id: string; label: string }[];
  status: "open" | "closed";
  hasDeal: boolean;
  canSend: boolean;
  canCreateDeal: boolean;
  /** Бот в этом диалоге не работал — можно запустить вручную. */
  canStartBot?: boolean;
}) {
  const [pending, start] = useTransition();
  const router = useRouter();
  const run = (fn: () => Promise<unknown>) =>
    start(async () => {
      try {
        await fn();
        router.refresh();
      } catch (e) {
        toastError(e);
      }
    });
  return (
    <div className="space-y-3">
      <div>
        <label htmlFor={`assignee-${conversationId}`} className="label text-[13px]">
          Ответственный
        </label>
        <select id={`assignee-${conversationId}`} className="input h-10 text-sm" value={assigneeId ?? ""} disabled={!canSend || pending} onChange={(e) => run(() => assignConversationAction(conversationId, e.target.value || null))}>
          <option value="">Не назначен</option>
          {options.map((o) => (
            <option key={o.id} value={o.id}>
              {o.label}
            </option>
          ))}
        </select>
      </div>
      <div className="flex flex-col gap-2">
        {!hasDeal && canCreateDeal ? (
          <button
            className="btn btn-outline btn-sm"
            disabled={pending}
            onClick={() =>
              start(async () => {
                try {
                  const r = await createDealFromChatAction(conversationId);
                  router.push(`/admin/deals/${r.id}`);
                } catch (e) {
                  toastError(e);
                }
              })
            }
          >
            <Handshake className="size-4" /> Создать сделку
          </button>
        ) : null}
        {canSend && hasDeal && canStartBot ? (
          <button className="btn btn-outline btn-sm" disabled={pending} onClick={() => run(() => startBotAction(conversationId))} title="Бот поздоровается и спросит то, чего ещё нет в сделке">
            <Bot className="size-4" /> Запустить бота
          </button>
        ) : null}
        {canSend ? (
          <button className="btn btn-ghost btn-sm" disabled={pending} onClick={() => run(() => setConversationStatusAction(conversationId, status === "open" ? "closed" : "open"))}>
            {pending ? <LoaderCircle className="size-4 animate-spin" /> : status === "open" ? <Archive className="size-4" /> : <Inbox className="size-4" />}
            {status === "open" ? "Закрыть диалог" : "Вернуть в открытые"}
          </button>
        ) : null}
      </div>
    </div>
  );
}
