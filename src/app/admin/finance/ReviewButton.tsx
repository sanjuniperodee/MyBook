"use client";

import { useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { Check } from "lucide-react";
import { reviewOrderPaymentAction } from "../actions";
import { reviewDealPaymentAction } from "./actions";

/** «Проверено» у ручного подтверждения денег: платёж сделки или оплата заказа. Только руководитель (проверка — на сервере). */
export function ReviewButton({ kind, id }: { kind: "deal" | "order"; id: string }) {
  const [pending, start] = useTransition();
  const [error, setError] = useState<string | null>(null);
  const router = useRouter();
  return (
    <span className="inline-flex flex-col items-end gap-0.5">
      <button
        type="button"
        className="btn btn-outline btn-sm whitespace-nowrap"
        disabled={pending}
        data-testid="finance-review"
        onClick={() =>
          start(async () => {
            setError(null);
            try {
              const r = kind === "deal" ? await reviewDealPaymentAction(id) : await reviewOrderPaymentAction(id);
              if (r.error) setError(r.error);
              router.refresh();
            } catch {
              setError("Не удалось отметить — недостаточно прав или нет связи");
            }
          })
        }
      >
        <Check className="size-3.5" /> Проверено
      </button>
      {error ? <span className="text-[11px] text-red-700">{error}</span> : null}
    </span>
  );
}
