"use client";

import { useEffect, useRef, useState } from "react";
import { Check, LoaderCircle, TriangleAlert } from "lucide-react";

/** Книга пакета: к её платежу догружается чек. */
export interface ReceiptPart {
  dealId: string;
  dealNumber: number;
  prepaid: number;
  paymentId: string | null;
}

type Status = "uploading" | "ok" | "error";

/**
 * Один общий чек на предоплату за все книги: загружается к платежу каждой сделки (платёж на каждую книгу свой, чек у них один).
 * Файл больше лимита форм, поэтому уходит отдельными запросами уже после создания; ошибку любой книги можно повторить.
 */
export function PartsReceipts({ parts, receipt }: { parts: ReceiptPart[]; receipt: File | null }) {
  const todo = receipt ? parts.filter((p) => p.prepaid > 0 && p.paymentId) : [];
  const [state, setState] = useState<Record<string, { status: Status; error?: string }>>(() => Object.fromEntries(todo.map((p) => [p.dealId, { status: "uploading" as Status }])));
  const started = useRef(false);

  async function send(p: ReceiptPart) {
    if (!receipt) return;
    setState((s) => ({ ...s, [p.dealId]: { status: "uploading" } }));
    try {
      const body = new FormData();
      body.set("file", receipt);
      body.set("amount", String(p.prepaid));
      if (p.paymentId) body.set("paymentId", p.paymentId);
      const res = await fetch(`/api/admin/deals/${p.dealId}/receipts`, { method: "POST", body });
      const data = (await res.json().catch(() => ({}))) as { error?: string };
      if (!res.ok) throw new Error(data.error ?? "Не удалось загрузить чек");
      setState((s) => ({ ...s, [p.dealId]: { status: "ok" } }));
    } catch (e) {
      setState((s) => ({ ...s, [p.dealId]: { status: "error", error: (e as Error).message } }));
    }
  }

  useEffect(() => {
    if (started.current || !todo.length) return;
    started.current = true;
    void (async () => {
      for (const p of todo) await send(p);
    })();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  if (!todo.length) return null;
  const failed = todo.filter((p) => state[p.dealId]?.status === "error");
  const loading = todo.some((p) => state[p.dealId]?.status === "uploading");
  const tone = failed.length ? "bg-red-50 text-red-800" : loading ? "bg-cream/70 text-ink-soft" : "bg-emerald-50 text-emerald-900";
  return (
    <div className={`space-y-1.5 rounded-xl p-3 text-sm ${tone}`} role={failed.length ? "alert" : "status"} data-testid="receipts-status">
      <div className="flex items-center gap-2">
        {loading ? <LoaderCircle className="size-4 animate-spin" /> : failed.length ? <TriangleAlert className="size-4" /> : <Check className="size-4" />}
        <span className="flex-1">{loading ? "Загружаем чек предоплаты…" : failed.length ? "Чек загрузился не ко всем сделкам. Его можно приложить на карточке сделки." : todo.length > 1 ? `Чек предоплаты приложен к ${todo.length} сделкам` : "Чек предоплаты приложен к сделке"}</span>
      </div>
      {failed.map((p) => (
        <div key={p.dealId} className="flex items-center gap-2 text-xs">
          <span className="flex-1">Сделка №{p.dealNumber}: {state[p.dealId]?.error}</span>
          <button type="button" className="btn btn-outline btn-sm" onClick={() => void send(p)}>
            Повторить
          </button>
        </div>
      ))}
    </div>
  );
}
