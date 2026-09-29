"use client";

import { ask } from "@/components/ui/overlays";
import { useTransition } from "react";
import { LoaderCircle } from "lucide-react";
import { cancelGiftAction, markGiftPaidAction, resendGiftAction } from "./actions";

export function GiftActions({ id, status, canResend }: { id: string; status: string; canResend: boolean }) {
  const [pending, start] = useTransition();
  const btn = "rounded-lg border border-line px-2.5 py-1 text-xs hover:bg-cream disabled:opacity-50";
  return (
    <div className="flex flex-wrap justify-end gap-1.5">
      {pending ? <LoaderCircle className="size-4 animate-spin text-muted" /> : null}
      {status === "pending_payment" ? (
        <button className={btn} disabled={pending} onClick={async () => (await ask("Подтвердить оплату и выпустить код?")) && start(() => markGiftPaidAction(id))}>
          Оплачен
        </button>
      ) : null}
      {status === "paid" && canResend ? (
        <button className={btn} disabled={pending} onClick={() => start(() => resendGiftAction(id))}>
          Отправить получателю
        </button>
      ) : null}
      {status !== "cancelled" ? (
        <button className={`${btn} text-red-700`} disabled={pending} onClick={async () => (await ask("Отменить сертификат? Код перестанет действовать.", true)) && start(() => cancelGiftAction(id))}>
          Отменить
        </button>
      ) : null}
    </div>
  );
}
