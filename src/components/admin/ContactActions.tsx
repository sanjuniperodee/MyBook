"use client";

import { useRouter } from "next/navigation";
import { useTransition } from "react";
import { LoaderCircle, MessageCircle, PhoneOutgoing } from "lucide-react";
import { toast } from "@/components/ui/overlays";
import { callAction, openChatAction } from "@/app/admin/crm-actions";
import { cn } from "@/lib/utils";

type Target = { clientId?: string; dealId?: string; orderId?: string; callId?: string };

/** «Позвонить» через АТС и «Написать» в WhatsApp из CRM. Номер не нужен в браузере — сервер найдёт его сам. */
export function ContactActions({ target, canCall, canChat, className }: { target: Target; canCall: boolean; canChat: boolean; className?: string }) {
  const [calling, startCall] = useTransition();
  const [opening, startChat] = useTransition();
  const router = useRouter();
  if (!canCall && !canChat) return null;
  return (
    <div className={cn("flex flex-wrap gap-2", className)}>
      {canCall ? (
        <button
          type="button"
          className="btn btn-outline btn-sm flex-1"
          disabled={calling}
          onClick={() =>
            startCall(async () => {
              const r = await callAction(target);
              toast(r.message ?? "Звоним", r.ok ? "success" : "error");
            })
          }
        >
          {calling ? <LoaderCircle className="size-4 animate-spin" /> : <PhoneOutgoing className="size-4" />} Позвонить
        </button>
      ) : null}
      {canChat ? (
        <button
          type="button"
          className="btn btn-outline btn-sm flex-1"
          disabled={opening}
          onClick={() =>
            startChat(async () => {
              const r = await openChatAction(target);
              if (r.ok && r.id) router.push(`/admin/chats?c=${r.id}`);
              else toast(r.ok ? "Готово" : r.message, r.ok ? "success" : "error");
            })
          }
        >
          {opening ? <LoaderCircle className="size-4 animate-spin" /> : <MessageCircle className="size-4" />} Написать
        </button>
      ) : null}
    </div>
  );
}

export function ManagerSelect({ value, options, disabled, onChange }: { value: string | null; options: { id: string; label: string }[]; disabled?: boolean; onChange: (v: string | null) => Promise<unknown> }) {
  const [pending, start] = useTransition();
  return (
    <select
      className="input h-9 text-sm"
      value={value ?? ""}
      disabled={disabled || pending}
      aria-label="Ответственный"
      onChange={(e) =>
        start(async () => {
          const r = (await onChange(e.target.value || null)) as { ok?: boolean; message?: string } | undefined;
          if (r && r.ok === false) toast(r.message ?? "Не удалось", "error");
        })
      }
    >
      <option value="">Не назначен</option>
      {options.map((o) => (
        <option key={o.id} value={o.id}>
          {o.label}
        </option>
      ))}
    </select>
  );
}
