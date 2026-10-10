"use client";

import { useRef, useState } from "react";
import { useRouter } from "next/navigation";
import { FileText, LoaderCircle, Paperclip, Trash2, TriangleAlert } from "lucide-react";
import { formatPrice } from "@/config/site";

export interface PaymentItem {
  id: string;
  amount: number;
  kind: "prepayment" | "payment";
  dateLabel: string;
  author: string;
  note: string;
  receipts: { id: string; fileName: string; isPdf: boolean }[];
}

async function send(url: string, body: FormData) {
  const res = await fetch(url, { method: "POST", body });
  const data = (await res.json().catch(() => ({}))) as { error?: string };
  if (!res.ok) throw new Error(data.error ?? "Не удалось сохранить");
}

/** Привязать чек к платежу, у которого его нет. */
function AttachReceipt({ dealId, payment, onDone }: { dealId: string; payment: PaymentItem; onDone: () => void }) {
  const input = useRef<HTMLInputElement>(null);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  return (
    <div className="mt-1.5 space-y-1">
      <div className="flex gap-2">
        <input ref={input} type="file" accept="image/jpeg,image/png,image/webp,application/pdf" className="input h-9 min-w-0 flex-1 py-1 text-xs" />
        <button
          type="button"
          className="btn btn-outline btn-sm shrink-0"
          disabled={busy}
          onClick={async () => {
            const file = input.current?.files?.[0];
            if (!file) return setError("Выберите файл чека");
            setBusy(true);
            setError(null);
            try {
              const body = new FormData();
              body.set("file", file);
              body.set("amount", String(payment.amount));
              body.set("paymentId", payment.id);
              await send(`/api/admin/deals/${dealId}/receipts`, body);
              onDone();
            } catch (e) {
              setError((e as Error).message);
            } finally {
              setBusy(false);
            }
          }}
        >
          {busy ? <LoaderCircle className="size-4 animate-spin" /> : <Paperclip className="size-4" />} Чек
        </button>
      </div>
      {error ? <p className="text-xs text-red-700">{error}</p> : null}
    </div>
  );
}

/**
 * Оплата по сделке: что обещано, сколько принято, платежи с чеками. Каждый принятый платёж сразу попадает в выручку
 * (обзор, аналитика, планы менеджеров, карточка клиента). Платёж без чека не принимается — а если чек пропал, виден алерт.
 */
export function PaymentsPanel({ dealId, payments, agreed, canEdit }: { dealId: string; payments: PaymentItem[]; agreed: number; canEdit: boolean }) {
  const router = useRouter();
  const file = useRef<HTMLInputElement>(null);
  const [amount, setAmount] = useState("");
  const [day, setDay] = useState("");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const paid = payments.reduce((s, p) => s + p.amount, 0);
  const noReceipt = payments.filter((p) => !p.receipts.length);
  const refresh = () => router.refresh();

  async function add() {
    const f = file.current?.files?.[0];
    if (!f) return setError("Приложите чек: платёж без чека не принимается");
    setBusy(true);
    setError(null);
    try {
      const body = new FormData();
      body.set("file", f);
      body.set("amount", amount);
      if (day) body.set("paidAt", day);
      await send(`/api/admin/deals/${dealId}/payments`, body);
      if (file.current) file.current.value = "";
      setAmount("");
      setDay("");
      refresh();
    } catch (e) {
      setError((e as Error).message);
    } finally {
      setBusy(false);
    }
  }

  return (
    <section className="space-y-3 rounded-2xl border border-line bg-white p-5 text-sm" data-testid="deal-payments">
      <h2 className="text-sm font-semibold">Оплата и чеки</h2>
      <div className="grid grid-cols-3 gap-2 text-center">
        <div className="rounded-xl bg-cream/70 p-2">
          <div className="text-[11px] text-muted">Договорились</div>
          <div className="font-medium tabular-nums">{formatPrice(agreed)}</div>
        </div>
        <div className="rounded-xl bg-emerald-50 p-2">
          <div className="text-[11px] text-emerald-800">Получено</div>
          <div className="font-medium text-emerald-900 tabular-nums">{formatPrice(paid)}</div>
        </div>
        <div className="rounded-xl bg-cream/70 p-2">
          <div className="text-[11px] text-muted">Остаток</div>
          <div className="font-medium tabular-nums">{formatPrice(Math.max(0, agreed - paid))}</div>
        </div>
      </div>
      {paid > agreed && agreed > 0 ? <p className="rounded-xl bg-amber-50 p-2.5 text-xs text-amber-900">Получено больше, чем договорились: проверьте сумму сделки или платежи.</p> : null}
      {noReceipt.length ? (
        <div className="flex items-start gap-2 rounded-xl bg-amber-50 p-3 text-amber-900" role="alert">
          <TriangleAlert className="mt-0.5 size-4 shrink-0" />
          <span>Нет чека: {noReceipt.map((p) => formatPrice(p.amount)).join(", ")}. Прикрепите скриншот или фото перевода.</span>
        </div>
      ) : null}

      {payments.length ? (
        <ul className="space-y-2">
          {payments.map((p) => (
            <li key={p.id} className="rounded-xl border border-line px-3 py-2">
              <div className="flex items-center gap-2">
                <span className="font-medium tabular-nums">{formatPrice(p.amount)}</span>
                <span className="rounded-full bg-cream px-2 py-0.5 text-[11px] text-ink-soft">{p.kind === "prepayment" ? "предоплата" : "платёж"}</span>
                <span className="ml-auto truncate text-xs text-muted">
                  {p.dateLabel} · {p.author}
                </span>
                {canEdit ? (
                  <button
                    type="button"
                    className="text-muted hover:text-red-700"
                    aria-label="Удалить платёж"
                    title="Удалить ошибочный платёж"
                    onClick={async () => {
                      if (!confirm(`Удалить платёж ${formatPrice(p.amount)}? Он пропадёт из выручки.`)) return;
                      const res = await fetch(`/api/admin/payments/${p.id}`, { method: "DELETE" });
                      if (res.ok) refresh();
                      else setError("Не удалось удалить платёж");
                    }}
                  >
                    <Trash2 className="size-4" />
                  </button>
                ) : null}
              </div>
              {p.note ? <p className="mt-1 text-xs text-muted">{p.note}</p> : null}
              {p.receipts.length ? (
                <ul className="mt-1.5 flex flex-wrap gap-x-3 gap-y-1">
                  {p.receipts.map((r) => (
                    <li key={r.id} className="flex items-center gap-1 text-xs">
                      {r.isPdf ? <FileText className="size-3.5 text-muted" /> : <Paperclip className="size-3.5 text-muted" />}
                      <a href={`/api/admin/receipts/${r.id}`} target="_blank" rel="noopener noreferrer" className="max-w-[16rem] truncate text-wine hover:underline">
                        {r.fileName}
                      </a>
                    </li>
                  ))}
                </ul>
              ) : canEdit ? (
                <AttachReceipt dealId={dealId} payment={p} onDone={refresh} />
              ) : null}
            </li>
          ))}
        </ul>
      ) : (
        <p className="text-xs text-muted">Платежей пока нет.</p>
      )}

      {canEdit ? (
        <div className="space-y-2 border-t border-line pt-3">
          <div className="text-xs font-medium text-ink-soft">Принять платёж</div>
          <div className="grid grid-cols-2 gap-2">
            <input value={amount} onChange={(e) => setAmount(e.target.value)} type="number" min={1} step={500} placeholder="Сумма, ₸" className="input h-10" aria-label="Сумма платежа" />
            <input value={day} onChange={(e) => setDay(e.target.value)} type="date" className="input h-10" aria-label="Дата платежа" />
          </div>
          <input ref={file} type="file" accept="image/jpeg,image/png,image/webp,application/pdf" className="input h-10 w-full py-1.5 text-xs" aria-label="Чек" />
          <button type="button" className="btn btn-primary btn-sm w-full" disabled={busy || !amount} onClick={() => void add()}>
            {busy ? <LoaderCircle className="size-4 animate-spin" /> : <Paperclip className="size-4" />} Принять платёж с чеком
          </button>
          <p className="text-xs text-muted">Платёж сразу попадает в выручку: обзор, аналитику, план менеджера и карточку клиента.</p>
          {error ? <p className="text-xs text-red-700">{error}</p> : null}
        </div>
      ) : null}
    </section>
  );
}
