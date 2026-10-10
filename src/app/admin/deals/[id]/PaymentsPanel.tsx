"use client";

import { useRef, useState } from "react";
import { useRouter } from "next/navigation";
import { FileText, LoaderCircle, Paperclip, Trash2, TriangleAlert } from "lucide-react";
import { formatPrice } from "@/config/site";

export interface PaymentItem {
  id: string;
  amount: number;
  kind: "prepayment" | "payment" | "refund";
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
export function PaymentsPanel({ dealId, payments, agreed, canEdit, order }: { dealId: string; payments: PaymentItem[]; agreed: number; canEdit: boolean; order: { id: string; number: number } | null }) {
  const router = useRouter();
  const file = useRef<HTMLInputElement>(null);
  const [amount, setAmount] = useState("");
  const [day, setDay] = useState("");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  // Получено = платежи минус возвраты клиенту.
  const paid = payments.reduce((s, p) => s + (p.kind === "refund" ? -p.amount : p.amount), 0);
  const locked = !!order; // по сделке оформлен заказ: дальше деньги идут через него
  const [refundOpen, setRefundOpen] = useState(false);
  const [refundAmount, setRefundAmount] = useState("");
  const [refundNote, setRefundNote] = useState("");
  const refundFile = useRef<HTMLInputElement>(null);
  const noReceipt = payments.filter((p) => !p.receipts.length && p.kind !== "refund");
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

  async function giveBack() {
    const f = refundFile.current?.files?.[0];
    if (!f) return setError("Приложите чек возврата");
    if (refundNote.trim().length < 3) return setError("Укажите причину возврата");
    setBusy(true);
    setError(null);
    try {
      const body = new FormData();
      body.set("file", f);
      body.set("amount", refundAmount);
      body.set("kind", "refund");
      body.set("note", refundNote);
      await send(`/api/admin/deals/${dealId}/payments`, body);
      setRefundOpen(false);
      setRefundAmount("");
      setRefundNote("");
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
      {order ? (
        <p className="rounded-xl bg-emerald-50 p-3 text-xs text-emerald-900" data-testid="order-linked">
          Оформлен{" "}
          <a href={`/admin/orders/${order.id}`} className="font-medium underline">
            заказ №{order.number}
          </a>
          : внесённая предоплата вычтена из его «к оплате». Дальнейшую оплату принимайте в заказе.
        </p>
      ) : null}
      {paid > agreed && agreed > 0 && !locked ? <p className="rounded-xl bg-amber-50 p-2.5 text-xs text-amber-900">Получено больше, чем договорились: проверьте сумму сделки или платежи.</p> : null}
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
                <span className={`font-medium tabular-nums ${p.kind === "refund" ? "text-red-700" : ""}`}>
                  {p.kind === "refund" ? "−" : ""}
                  {formatPrice(p.amount)}
                </span>
                <span className="rounded-full bg-cream px-2 py-0.5 text-[11px] text-ink-soft">{p.kind === "prepayment" ? "предоплата" : p.kind === "refund" ? "возврат" : "платёж"}</span>
                <span className="ml-auto truncate text-xs text-muted">
                  {p.dateLabel} · {p.author}
                </span>
                {canEdit && !locked ? (
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
              ) : canEdit && p.kind !== "refund" ? (
                <AttachReceipt dealId={dealId} payment={p} onDone={refresh} />
              ) : null}
            </li>
          ))}
        </ul>
      ) : (
        <p className="text-xs text-muted">Платежей пока нет.</p>
      )}

      {canEdit && !locked ? (
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
          {paid > 0 ? (
            <div className="border-t border-line pt-3">
              {refundOpen ? (
                <div className="space-y-2 rounded-xl border border-red-200 bg-red-50/50 p-3">
                  <div className="text-xs font-medium text-red-900">Возврат денег клиенту</div>
                  <input value={refundAmount} onChange={(e) => setRefundAmount(e.target.value)} type="number" min={1} max={paid} step={500} placeholder={`Сумма, ₸ (не больше ${formatPrice(paid)})`} className="input h-10 w-full" aria-label="Сумма возврата" />
                  <input value={refundNote} onChange={(e) => setRefundNote(e.target.value)} maxLength={300} placeholder="Причина возврата" className="input h-10 w-full" aria-label="Причина возврата" />
                  <input ref={refundFile} type="file" accept="image/jpeg,image/png,image/webp,application/pdf" className="input h-10 w-full py-1.5 text-xs" aria-label="Чек возврата" />
                  <div className="flex gap-2">
                    <button type="button" className="btn btn-outline btn-sm flex-1" disabled={busy || !refundAmount} onClick={() => void giveBack()}>
                      {busy ? <LoaderCircle className="size-4 animate-spin" /> : null} Оформить возврат
                    </button>
                    <button type="button" className="btn btn-ghost btn-sm" onClick={() => setRefundOpen(false)}>
                      Отмена
                    </button>
                  </div>
                </div>
              ) : (
                <button type="button" className="text-xs text-muted underline hover:text-red-700" onClick={() => setRefundOpen(true)}>
                  Вернуть деньги клиенту
                </button>
              )}
            </div>
          ) : null}
        </div>
      ) : null}
    </section>
  );
}
