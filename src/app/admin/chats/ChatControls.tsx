"use client";

import { useRouter } from "next/navigation";
import { useTransition } from "react";
import { Archive, Handshake, Inbox, LoaderCircle } from "lucide-react";
import { toastError } from "@/components/ui/overlays";
import { assignConversationAction, createDealFromChatAction, setConversationStatusAction } from "./actions";

export function ChatSideControls({
  conversationId,
  assigneeId,
  options,
  status,
  hasDeal,
  canSend,
  canCreateDeal,
}: {
  conversationId: string;
  assigneeId: string | null;
  options: { id: string; label: string }[];
  status: "open" | "closed";
  hasDeal: boolean;
  canSend: boolean;
  canCreateDeal: boolean;
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
