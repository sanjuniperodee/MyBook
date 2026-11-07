"use client";

import { useState, useTransition } from "react";
import { toast, toastError } from "@/components/ui/overlays";
import { savePlanAction } from "../actions";
import { cn } from "@/lib/class-names";

export function PlanRow({ month, userId, name, planAmount, planDeals, fact, percent }: { month: string; userId: string; name: string; planAmount: number; planDeals: number; fact: string; percent: number | null }) {
  const [amount, setAmount] = useState(String(planAmount || ""));
  const [deals, setDeals] = useState(String(planDeals || ""));
  const [pending, start] = useTransition();
  const dirty = amount !== String(planAmount || "") || deals !== String(planDeals || "");
  return (
    <tr className="max-lg:grid max-lg:grid-cols-2 max-lg:gap-3 max-lg:px-4 max-lg:py-4 [&>td]:max-lg:border-0">
      <td className="font-medium max-lg:col-span-2 max-lg:p-0 max-lg:text-base">{name}</td>
      <td className="max-lg:p-0">
        <span className="label lg:hidden">План, ₸</span>
        <input value={amount} onChange={(e) => setAmount(e.target.value.replace(/\D/g, ""))} inputMode="numeric" className="input h-10 w-36 text-sm tabular-nums max-lg:w-full lg:h-9" placeholder="0" aria-label={`План в тенге: ${name}`} />
      </td>
      <td className="max-lg:p-0">
        <span className="label lg:hidden">План, сделок</span>
        <div className="flex items-center gap-2">
          <input value={deals} onChange={(e) => setDeals(e.target.value.replace(/\D/g, ""))} inputMode="numeric" className="input h-10 w-20 text-sm tabular-nums max-lg:flex-1 lg:h-9" placeholder="0" aria-label={`План сделок: ${name}`} />
          {dirty ? (
            <button
              className="btn btn-dark btn-sm"
              disabled={pending}
              onClick={() =>
                start(async () => {
                  try {
                    await savePlanAction(userId, month, Number(amount || 0), Number(deals || 0));
                    toast("План сохранён");
                  } catch (e) {
                    toastError(e);
                  }
                })
              }
            >
              Сохранить
            </button>
          ) : null}
        </div>
      </td>
      <td className="tabular-nums max-lg:col-span-2 max-lg:p-0 max-lg:text-muted">{fact}</td>
      <td className="max-lg:col-span-2 max-lg:p-0">
        {percent === null ? (
          <span className="text-muted">план не задан</span>
        ) : (
          <div className="flex items-center gap-2">
            <div className="h-1.5 w-32 overflow-hidden rounded-full bg-sunken max-lg:flex-1">
              <div className={cn("h-full rounded-full", percent >= 100 ? "bg-success" : "bg-wine")} style={{ width: `${Math.min(100, percent)}%` }} />
            </div>
            <span className="tabular-nums">{percent}%</span>
          </div>
        )}
      </td>
    </tr>
  );
}
