"use client";

import { useRef, useState } from "react";
import { useRouter } from "next/navigation";
import { FileText, LoaderCircle, Paperclip, TriangleAlert } from "lucide-react";
import { formatPrice } from "@/config/site";

export interface ReceiptItem {
  id: string;
  fileName: string;
  amount: number;
  isPdf: boolean;
  dateLabel: string;
  author: string;
}

/** Оплата по сделке: что обещано, сколько внесено и чеки. Чек предоплаты обязателен — без него появляется предупреждение. */
export function ReceiptsPanel({ dealId, items, agreed, prepaid, canEdit }: { dealId: string; items: ReceiptItem[]; agreed: number; prepaid: number; canEdit: boolean }) {
  const router = useRouter();
  const input = useRef<HTMLInputElement>(null);
  const [amount, setAmount] = useState(items.length ? "" : prepaid ? String(prepaid) : "");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const confirmed = items.reduce((s, r) => s + r.amount, 0);
  const missing = prepaid > 0 && items.length === 0;

  async function upload() {
    const file = input.current?.files?.[0];
    if (!file) return setError("Выберите файл чека");
    setBusy(true);
    setError(null);
    try {
      const body = new FormData();
      body.set("file", file);
      body.set("amount", amount || "0");
      const res = await fetch(`/api/admin/deals/${dealId}/receipts`, { method: "POST", body });
      const data = (await res.json().catch(() => ({}))) as { error?: string };
      if (!res.ok) throw new Error(data.error ?? "Не удалось загрузить чек");
      if (input.current) input.current.value = "";
      setAmount("");
      router.refresh();
    } catch (e) {
      setError((e as Error).message);
    } finally {
      setBusy(false);
    }
  }

  return (
    <section className="space-y-3 rounded-2xl border border-line bg-white p-5 text-sm" data-testid="deal-receipts">
      <h2 className="text-sm font-semibold">Оплата и чеки</h2>
      {agreed > 0 || prepaid > 0 ? (
        <div className="grid grid-cols-3 gap-2 text-center">
          <div className="rounded-xl bg-cream/70 p-2">
            <div className="text-[11px] text-muted">Договорились</div>
            <div className="font-medium tabular-nums">{formatPrice(agreed)}</div>
          </div>
          <div className="rounded-xl bg-cream/70 p-2">
            <div className="text-[11px] text-muted">Предоплата</div>
            <div className="font-medium tabular-nums">{formatPrice(prepaid)}</div>
          </div>
          <div className="rounded-xl bg-cream/70 p-2">
            <div className="text-[11px] text-muted">Остаток</div>
            <div className="font-medium tabular-nums">{formatPrice(Math.max(0, agreed - prepaid))}</div>
          </div>
        </div>
      ) : null}
      {missing ? (
        <div className="flex items-start gap-2 rounded-xl bg-amber-50 p-3 text-amber-900" role="alert">
          <TriangleAlert className="mt-0.5 size-4 shrink-0" />
          <span>Указана предоплата {formatPrice(prepaid)}, но чек не приложен. Прикрепите скриншот или фото перевода.</span>
        </div>
      ) : null}
      {items.length ? (
        <ul className="space-y-1.5">
          {items.map((r) => (
            <li key={r.id} className="flex items-center gap-2 rounded-xl border border-line px-3 py-2">
              {r.isPdf ? <FileText className="size-4 shrink-0 text-muted" /> : <Paperclip className="size-4 shrink-0 text-muted" />}
              <a href={`/api/admin/receipts/${r.id}`} target="_blank" rel="noopener noreferrer" className="min-w-0 flex-1 truncate text-wine hover:underline">
                {r.fileName}
              </a>
              <span className="shrink-0 text-xs text-muted tabular-nums">{r.amount ? formatPrice(r.amount) : "—"}</span>
              <span className="hidden shrink-0 text-xs text-muted sm:inline">
                {r.dateLabel} · {r.author}
              </span>
            </li>
          ))}
          {confirmed ? <li className="px-1 text-xs text-muted">Подтверждено чеками: {formatPrice(confirmed)}</li> : null}
        </ul>
      ) : (
        <p className="text-xs text-muted">Чеков пока нет.</p>
      )}
      {canEdit ? (
        <div className="space-y-2 border-t border-line pt-3">
          <div className="flex gap-2">
            <input ref={input} type="file" accept="image/jpeg,image/png,image/webp,application/pdf" className="input h-10 min-w-0 flex-1 py-1.5 text-xs" />
            <input value={amount} onChange={(e) => setAmount(e.target.value)} type="number" min={0} step={500} placeholder="Сумма, ₸" className="input h-10 w-28" aria-label="Сумма по чеку" />
          </div>
          <button type="button" className="btn btn-outline btn-sm w-full" disabled={busy} onClick={() => void upload()}>
            {busy ? <LoaderCircle className="size-4 animate-spin" /> : <Paperclip className="size-4" />} Приложить чек
          </button>
          {error ? <p className="text-xs text-red-700">{error}</p> : null}
        </div>
      ) : null}
    </section>
  );
}
