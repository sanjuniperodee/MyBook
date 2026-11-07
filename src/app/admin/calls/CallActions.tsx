"use client";

import { useTransition } from "react";
import { CheckCircle2, PhoneOutgoing } from "lucide-react";
import { toast } from "@/components/ui/overlays";
import { cn } from "@/lib/class-names";
import { callAction, markCallHandledAction } from "../crm-actions";
import { useWhatsappCall, WhatsappCallButton } from "@/components/admin/WhatsappCall";

export function CallRowActions({ callId, canCall, canHandle }: { callId: string; canCall: boolean; canHandle: boolean }) {
  const [pending, start] = useTransition();
  const wa = useWhatsappCall();
  // АТС нет, а звонки WhatsApp включены — «Перезвонить» звонит в WhatsApp.
  const viaWhatsapp = !!wa && !wa.pbx;
  return (
    <div className="flex flex-wrap justify-end gap-1 lg:flex-nowrap">
      {canCall ? (
        <button
          className={cn("btn btn-ghost btn-sm h-8 px-2.5 text-[13px] max-lg:h-11", canHandle && "text-wine hover:text-wine")}
          disabled={pending || (viaWhatsapp && wa.busy)}
          onClick={() =>
            viaWhatsapp
              ? wa.dial({ callId })
              : start(async () => {
                  const r = await callAction({ callId });
                  toast(r.message ?? "Звоним", r.ok ? "success" : "error");
                })
          }
        >
          <PhoneOutgoing className="size-4" strokeWidth={1.8} /> Перезвонить
        </button>
      ) : null}
      {canCall && !viaWhatsapp ? <WhatsappCallButton plain target={{ callId }} label="WhatsApp" className="btn btn-ghost btn-sm h-8 px-2.5 text-[13px] max-lg:h-11" /> : null}
      {canHandle ? (
        <button className="btn btn-ghost btn-sm h-8 px-2.5 text-[13px] max-lg:h-11" disabled={pending} onClick={() => start(async () => void (await markCallHandledAction(callId)))} title="Отметить, что клиенту уже перезвонили или ответили">
          <CheckCircle2 className="size-4" strokeWidth={1.8} /> Обработан
        </button>
      ) : null}
    </div>
  );
}
