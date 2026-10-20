"use client";

import { useRouter } from "next/navigation";
import { useTransition } from "react";
import { Archive, Bot, Handshake, Inbox, LoaderCircle, Play, Square, UserRound } from "lucide-react";
import { toastError } from "@/components/ui/overlays";
import { cn } from "@/lib/class-names";
import type { BotStatus } from "@/modules/messaging";
import { assignConversationAction, createDealFromChatAction, pauseBotAction, resumeBotAction, setConversationStatusAction, startBotAction, stopBotAction } from "./actions";

/**
 * Полоса бота над перепиской: режим AI в этом чате и что бот делает сейчас («AI включён», «Менеджер ведёт диалог», «AI на
 * паузе до 15:30», «AI-продажник ведёт диалог») и кнопки «Отключить AI», «Пауза», «Возобновить AI», «Запустить бота».
 * Режим хранится на сервере; права проверяют действия.
 */
export function BotBanner({ conversationId, status, canControl, hasDeal }: { conversationId: string; status: BotStatus; canControl: boolean; hasDeal: boolean }) {
  const [pending, start] = useTransition();
  const router = useRouter();
  // Без сделки бот в диалоге не работает — «AI включён» было бы неправдой.
  if (!status.label || (!hasDeal && status.tone === "none")) return null;
  const run = (fn: () => Promise<unknown>) =>
    start(async () => {
      try {
        await fn();
        router.refresh();
      } catch (e) {
        toastError(e);
      }
    });
  const manager = status.mode === "HUMAN_TAKEOVER";
  const off = status.mode === "DISABLED" || status.mode === "AI_PAUSED";
  return (
    <div
      className={cn(
        "flex flex-wrap items-center gap-2 border-b border-line px-4 py-1.5 text-xs",
        manager ? "bg-amber-50 text-amber-900" : off ? "bg-cream/60 text-ink-soft" : status.tone === "active" || status.tone === "waiting" ? "bg-emerald-50 text-emerald-900" : "bg-cream/40 text-muted",
      )}
      data-testid="bot-banner"
      data-mode={status.mode ?? ""}
    >
      {manager ? <UserRound className="size-3.5 shrink-0" /> : <Bot className="size-3.5 shrink-0" />}
      <span className="min-w-0 flex-1 truncate">{status.label}</span>
      {canControl && status.canResume ? (
        <button className="btn btn-ghost btn-sm h-7 px-2 text-xs font-medium" disabled={pending} onClick={() => run(() => resumeBotAction(conversationId))} title="Бот снова отвечает в этом чате; на сообщения без ответа ответит сразу">
          {pending ? <LoaderCircle className="size-3.5 animate-spin" /> : <Play className="size-3.5" />} Возобновить AI
        </button>
      ) : null}
      {canControl && status.canStop && status.mode !== "AI_PAUSED" && status.mode !== "DISABLED" ? (
        <>
          <select
            className="h-7 rounded-md border border-line bg-white px-1 text-xs"
            aria-label="Пауза AI"
            value=""
            disabled={pending}
            onChange={(e) => {
              const minutes = Number(e.target.value);
              if (minutes) run(() => pauseBotAction(conversationId, minutes));
            }}
          >
            <option value="">Пауза…</option>
            <option value="30">на 30 минут</option>
            <option value="60">на 1 час</option>
            <option value="180">на 3 часа</option>
            <option value="1440">на сутки</option>
          </select>
          <button className="btn btn-ghost btn-sm h-7 px-2 text-xs" disabled={pending} onClick={() => run(() => stopBotAction(conversationId))} title="Бот не отвечает в этом чате ни днём, ни ночью, пока AI не возобновят">
            {pending ? <LoaderCircle className="size-3.5 animate-spin" /> : <Square className="size-3.5" />} Отключить AI
          </button>
        </>
      ) : null}
      {canControl && hasDeal && status.canStart ? (
        <button className="btn btn-ghost btn-sm h-7 px-2 text-xs" disabled={pending} onClick={() => run(() => startBotAction(conversationId))} title="Бот поздоровается и спросит то, чего ещё нет в сделке">
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
    <div className="space-y-4">
      <section>
        <h3 className="mb-2 text-xs font-semibold tracking-wide text-muted uppercase">Ответственный</h3>
        <select className="input h-9 text-sm" value={assigneeId ?? ""} disabled={!canSend || pending} onChange={(e) => run(() => assignConversationAction(conversationId, e.target.value || null))} aria-label="Ответственный за чат">
          <option value="">Не назначен</option>
          {options.map((o) => (
            <option key={o.id} value={o.id}>
              {o.label}
            </option>
          ))}
        </select>
      </section>
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
          <button className="btn btn-ghost btn-sm" disabled={pending} onClick={() => run(() => startBotAction(conversationId))} title="Бот поздоровается и спросит то, чего ещё нет в сделке">
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
