"use client";

import { useTransition } from "react";
import { CheckCircle2, PhoneOutgoing } from "lucide-react";
import { toast } from "@/components/ui/overlays";
import { callAction, markCallHandledAction } from "../crm-actions";

export function CallRowActions({ callId, canCall, canHandle }: { callId: string; canCall: boolean; canHandle: boolean }) {
  const [pending, start] = useTransition();
  return (
    <div className="flex justify-end gap-3 text-xs">
      {canCall ? (
        <button
          className="flex items-center gap-1 text-wine hover:underline"
          disabled={pending}
          onClick={() =>
            start(async () => {
              const r = await callAction({ callId });
              toast(r.message ?? "Звоним", r.ok ? "success" : "error");
            })
          }
        >
          <PhoneOutgoing className="size-3.5" /> Перезвонить
        </button>
      ) : null}
      {canHandle ? (
        <button className="flex items-center gap-1 text-muted hover:text-ink" disabled={pending} onClick={() => start(async () => void (await markCallHandledAction(callId)))}>
          <CheckCircle2 className="size-3.5" /> Обработан
        </button>
      ) : null}
    </div>
  );
}
