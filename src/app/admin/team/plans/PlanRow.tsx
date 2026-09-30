"use client";

import { useState, useTransition } from "react";
import { toast, toastError } from "@/components/ui/overlays";
import { savePlanAction } from "../actions";
import { cn } from "@/lib/utils";

export function PlanRow({ month, userId, name, planAmount, planDeals, fact, percent }: { month: string; userId: string; name: string; planAmount: number; planDeals: number; fact: string; percent: number | null }) {
  const [amount, setAmount] = useState(String(planAmount || ""));
  const [deals, setDeals] = useState(String(planDeals || ""));
  const [pending, start] = useTransition();
  const dirty = amount !== String(planAmount || "") || deals !== String(planDeals || "");
  return (
    <tr>
      <td className="px-4 py-2.5 font-medium">{name}</td>
      <td className="px-4 py-2.5">
        <input value={amount} onChange={(e) => setAmount(e.target.value.replace(/\D/g, ""))} inputMode="numeric" className="input h-9 w-36 text-sm" placeholder="0" aria-label={`План в тенге: ${name}`} />
      </td>
      <td className="px-4 py-2.5">
        <div className="flex items-center gap-2">
          <input value={deals} onChange={(e) => setDeals(e.target.value.replace(/\D/g, ""))} inputMode="numeric" className="input h-9 w-20 text-sm" placeholder="0" aria-label={`План сделок: ${name}`} />
          {dirty ? (
            <button
              className="btn btn-sm h-9"
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
      <td className="px-4 py-2.5 tabular-nums">{fact}</td>
      <td className="px-4 py-2.5">
        {percent === null ? (
          <span className="text-muted">план не задан</span>
        ) : (
          <div className="flex items-center gap-2">
            <div className="h-2 w-32 overflow-hidden rounded-full bg-cream">
              <div className={cn("h-full rounded-full", percent >= 100 ? "bg-emerald-600" : "bg-wine")} style={{ width: `${Math.min(100, percent)}%` }} />
            </div>
            <span className="tabular-nums">{percent}%</span>
          </div>
        )}
      </td>
    </tr>
  );
}
