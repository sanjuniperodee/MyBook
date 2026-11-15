"use client";

import { useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { toast } from "@/components/ui/overlays";
import { setPayFormAction } from "./actions";

/** Форма оплаты в строке реестра: выбор сохраняется сразу; при ошибке возвращается прежнее значение. */
export function PayFormSelect({ dealId, value, options, label }: { dealId: string; value: string; options: string[]; label: string }) {
  const [pending, start] = useTransition();
  const [current, setCurrent] = useState(value);
  const router = useRouter();
  const list = current && !options.includes(current) ? [current, ...options] : options;
  return (
    <select
      className="input h-8 w-36 py-0 text-sm"
      aria-label={label}
      value={current}
      disabled={pending}
      onChange={(e) => {
        const next = e.target.value;
        const before = current;
        setCurrent(next);
        start(async () => {
          const r = await setPayFormAction(dealId, next);
          if (!r.ok) {
            setCurrent(before);
            return toast(r.error, "error");
          }
          router.refresh();
        });
      }}
    >
      <option value="">не указана</option>
      {list.map((o) => (
        <option key={o} value={o}>
          {o}
        </option>
      ))}
    </select>
  );
}
