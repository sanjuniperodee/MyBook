"use client";

import { useRef, useState } from "react";
import { useRouter } from "next/navigation";
import { FileText, LoaderCircle, Paperclip, ReceiptText, Trash2, TriangleAlert } from "lucide-react";
import { formatPrice, getPlans } from "@/config/site";
import { planLabels } from "@/modules/ordering/ui/labels";
import { InvoiceDialog } from "@/components/admin/invoices/InvoiceDialog";
import { InvoicesBlock } from "@/components/admin/invoices/InvoicesBlock";
import { choiceNeeded, guardIds, newIssueKey, overpaidPayments, type InvoicePerms, type InvoiceView, type MoneyGuard } from "@/components/admin/invoices/model";
import { setDealAgreedGiftsAction, setDealAgreedPlanAction } from "../actions";
import { giftOptionsForPlan } from "@/components/admin/invoices/model";
import type { AgreementGift } from "@/shared/domain/agreementGifts";

interface PaymentItem {
  id: string;
  amount: number;
  kind: "prepayment" | "payment" | "refund";
  dateLabel: string;
  author: string;
  note: string;
  receipts: { id: string; fileName: string; isPdf: boolean }[];
  /** Онлайн-платёж (Kaspi, карта): вместо чека — операция; удалить нельзя. */
  online?: string | null;
  /** Счёт из чата, которым оплачено (P12). */
  invoice?: string | null;
}

/** Ошибка сохранения с кодом ответа: invoiceChoice — пока форма была открыта, появился счёт или онлайн-оплата. */
class SaveError extends Error {
  constructor(
    message: string,
    readonly code: string | undefined,
  ) {
    super(message);
  }
}

async function send(url: string, body: FormData) {
  const res = await fetch(url, { method: "POST", body });
  const data = (await res.json().catch(() => ({}))) as { error?: string; code?: string };
  if (!res.ok) throw new SaveError(data.error ?? "Не удалось сохранить", data.code);
}

/** Привязать чек к платежу, у которого его нет. */
function AttachReceipt({ dealId, payment, onDone }: { dealId: string; payment: PaymentItem; onDone: () => void }) {
  const input = useRef<HTMLInputElement>(null);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  return (
    <div className="mt-1.5 space-y-1" data-testid="attach-receipt">
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
/** Деньги по заказу сделки (журнал заказа): к оплате по заказу, сколько получено, записи — только чтение. */
export interface OrderMoneyView {
  due: number;
  received: number;
  postpay: boolean;
  rows: { id: string; amount: number; method: string; dateLabel: string; receipt: boolean }[];
}

const noInvoicePerms: InvoicePerms = { edit: false, send: false, access: false, pay: false };

export function PaymentsPanel({
  dealId,
  payments,
  agreed,
  plan,
  gifts = [],
  canEdit,
  canDelete = false,
  order,
  orderMoney = null,
  invoices = [],
  invoicePerms = noInvoicePerms,
  guard = null,
  payInvoiceId = null,
  canIssue = false,
}: {
  dealId: string;
  payments: PaymentItem[];
  agreed: number;
  plan: string | null;
  /** Что по договорённости бесплатно (упаковка, доставка). */
  gifts?: AgreementGift[];
  canEdit: boolean;
  canDelete?: boolean;
  order: { id: string; number: number } | null;
  orderMoney?: OrderMoneyView | null;
  /** Счета из чата по сделке (новые сверху). */
  invoices?: InvoiceView[];
  invoicePerms?: InvoicePerms;
  /** Открытый счёт и онлайн-оплаты за 72 ч: приём платежа требует явного выбора «по счёту» или «другая оплата». */
  guard?: MoneyGuard | null;
  /** «Оплата пришла» из чата (?pay=): форма приёма открывается с этим счётом. */
  payInvoiceId?: string | null;
  /** Можно выставить счёт (chats.send + deals.edit, ведёт сделку). */
  canIssue?: boolean;
}) {
  const router = useRouter();
  const file = useRef<HTMLInputElement>(null);
  const form = useRef<HTMLDivElement>(null);
  // Счёт, по которому можно принять перевод: ждёт оплаты или истёк (клиент мог заплатить в последний день).
  const payable = (id: string | null | undefined) => invoices.find((i) => i.id === id && (i.status === "pending_payment" || i.status === "expired")) ?? null;
  // Выбор в форме: "" — ещё не выбрали, "other" — другая оплата, иначе id счёта.
  const [choice, setChoice] = useState(() => payable(payInvoiceId)?.id ?? "");
  const [invoiceKey, setInvoiceKey] = useState<string | null>(null);
  const [amount, setAmount] = useState(() => String(payable(payInvoiceId)?.amount ?? ""));
  const [day, setDay] = useState("");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  // Получено = платежи сделки минус возвраты клиенту, плюс деньги по её заказу (остаток, постоплата).
  const dealPaid = payments.reduce((s, p) => s + (p.kind === "refund" ? -p.amount : p.amount), 0);
  const paid = dealPaid + (orderMoney?.received ?? 0);
  // С заказом итог — внесённое по сделке + «к оплате» заказа (доставка и допы — в нём); без заказа — договорённость.
  const target = orderMoney ? dealPaid + orderMoney.due : agreed;
  const locked = !!order; // по сделке оформлен заказ: дальше деньги идут через него
  const [refundOpen, setRefundOpen] = useState(false);
  const [refundAmount, setRefundAmount] = useState("");
  const [refundNote, setRefundNote] = useState("");
  const refundFile = useRef<HTMLInputElement>(null);
  const noReceipt = payments.filter((p) => !p.receipts.length && p.kind !== "refund" && !p.online);
  const overpaid = overpaidPayments(payments, agreed);
  const refresh = () => router.refresh();
  const byInvoice = choice && choice !== "other" ? payable(choice) : null;
  // Варианты «по счёту»: открытый счёт и выбранный кнопкой «Оплата пришла» (может быть истёкшим).
  const invoiceChoices = [...new Map([payable(guard?.invoice?.id), payable(payInvoiceId), byInvoice].filter((i): i is InvoiceView => !!i).map((i) => [i.id, i])).values()];
  const mustChoose = choiceNeeded(guard) || invoiceChoices.length > 0;

  /** «Оплата пришла» в блоке счетов: форма приёма с этим счётом и его суммой. */
  function payByInvoice(v: InvoiceView) {
    setChoice(v.id);
    setAmount(String(v.amount));
    setError(null);
    form.current?.scrollIntoView({ behavior: "smooth", block: "center" });
    file.current?.focus();
  }
  const [planValue, setPlanValue] = useState(plan ?? "");
  const [planMsg, setPlanMsg] = useState<string | null>(null);
  const [giftValue, setGiftValue] = useState<AgreementGift[]>(gifts);
  const [giftMsg, setGiftMsg] = useState<string | null>(null);
  // Бесплатным можно отметить только то, что есть у тарифа договорённости (тариф не указан — оба варианта).
  const giftChoices = giftOptionsForPlan(planValue || null);
  const toggleGift = async (g: AgreementGift, on: boolean) => {
    const prev = giftValue;
    const next = on ? [...prev.filter((x) => x !== g), g] : prev.filter((x) => x !== g);
    setGiftValue(next);
    setGiftMsg(null);
    const r = await setDealAgreedGiftsAction(dealId, next);
    if (r.ok) {
      setGiftMsg("Сохранено");
      refresh();
    } else {
      setGiftValue(prev);
      setGiftMsg(r.message ?? "Не удалось");
    }
  };
  const planOptions = getPlans().filter((p) => !p.hidden || p.id === plan);

  async function add() {
    const f = file.current?.files?.[0];
    if (!f) return setError("Приложите чек: платёж без чека не принимается");
    if (mustChoose && !choice) return setError("Отметьте: оплата по счёту или другая оплата");
    setBusy(true);
    setError(null);
    try {
      const body = new FormData();
      body.set("file", f);
      body.set("amount", byInvoice ? String(byInvoice.amount) : amount);
      if (day) body.set("paidAt", day);
      // По счёту — счёт закрывается этой оплатой; «другая» — сервер сверит, что менеджер видел открытый счёт и онлайн-оплаты.
      if (byInvoice) body.set("invoiceId", byInvoice.id);
      else if (choice === "other") body.set("seen", guardIds(guard).join(","));
      await send(`/api/admin/deals/${dealId}/payments`, body);
      if (file.current) file.current.value = "";
      setAmount("");
      setDay("");
      setChoice("");
      refresh();
    } catch (e) {
      setError((e as Error).message);
      if (e instanceof SaveError && e.code === "invoiceChoice") refresh();
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
    <section id="deal-payments" className="space-y-3 rounded-2xl border border-line bg-white p-5 text-sm" data-testid="deal-payments">
      <div className="flex items-center justify-between gap-2">
        <h2 className="text-sm font-semibold">Оплата и чеки</h2>
        {canIssue && !locked ? (
          <button type="button" className="btn btn-outline btn-sm" onClick={() => setInvoiceKey(newIssueKey())} data-testid="issue-invoice">
            <ReceiptText className="size-4" /> Счёт
          </button>
        ) : null}
      </div>
      {invoiceKey ? <InvoiceDialog issueKey={invoiceKey} dealId={dealId} onClose={() => setInvoiceKey(null)} /> : null}
      <div className="grid grid-cols-3 gap-2 text-center">
        <div className="rounded-xl bg-cream/70 p-2">
          <div className="text-[11px] text-muted">{orderMoney ? `Всего по заказу №${order?.number}` : "Книга по договорённости"}</div>
          <div className="font-medium tabular-nums">{formatPrice(target)}</div>
        </div>
        <div className="rounded-xl bg-emerald-50 p-2">
          <div className="text-[11px] text-emerald-800">Получено</div>
          <div className="font-medium text-emerald-900 tabular-nums">{formatPrice(paid)}</div>
        </div>
        <div className="rounded-xl bg-cream/70 p-2">
          <div className="text-[11px] text-muted">{orderMoney?.postpay ? "Постоплата: ждём" : "Остаток"}</div>
          <div className="font-medium tabular-nums">{formatPrice(Math.max(0, target - paid))}</div>
        </div>
      </div>
      <div data-testid="agreed-plan">
        <label className="mb-1 block text-[11px] text-muted" htmlFor="agreed-plan">
          Тариф договорённости
        </label>
        <select
          id="agreed-plan"
          className="input h-9 w-full text-sm"
          value={planValue}
          disabled={!canEdit || locked}
          onChange={async (e) => {
            const next = e.target.value;
            const prev = planValue;
            setPlanValue(next);
            setPlanMsg(null);
            const r = await setDealAgreedPlanAction(dealId, next || null);
            if (r.ok) {
              setPlanMsg("Тариф сохранён");
              refresh();
            } else {
              setPlanValue(prev);
              setPlanMsg(r.message ?? "Не удалось");
            }
          }}
        >
          <option value="">Не указан — клиент выберет тариф сам</option>
          {planOptions.map((p) => (
            <option key={p.id} value={p.id}>
              {planLabels[p.id]}
            </option>
          ))}
        </select>
        <p className="mt-1 text-[11px] text-muted">{planMsg ?? "Клиент оформит заказ по договорённости только на этот тариф. Доставка и допы считаются сверху."}</p>
      </div>
      {giftChoices.length ? (
        <div data-testid="agreed-gifts">
          <div className="mb-1 text-[11px] text-muted">Бесплатно по договорённости</div>
          <div className="flex flex-wrap gap-x-5 gap-y-1">
            {giftChoices.map((g) => (
              <label key={g} className="flex items-center gap-2 text-sm">
                <input type="checkbox" checked={giftValue.includes(g)} disabled={!canEdit || locked} onChange={(e) => void toggleGift(g, e.target.checked)} />
                {g === "giftwrap" ? "Подарочная упаковка" : "Доставка"}
              </label>
            ))}
          </div>
          <p className="mt-1 text-[11px] text-muted">{giftMsg ?? "Отмеченное клиент выбирает при оформлении сам, и оно стоит 0 ₸. Не отмечено — по прайсу."}</p>
        </div>
      ) : null}
      {order ? (
        <p className="rounded-xl bg-emerald-50 p-3 text-xs text-emerald-900" data-testid="order-linked">
          Оформлен{" "}
          <a href={`/admin/orders/${order.id}`} className="font-medium underline">
            заказ №{order.number}
          </a>
          : внесённая предоплата вычтена из его «к оплате». Остаток и постоплату принимайте в заказе — кнопкой ниже.
          {orderMoney?.rows.length ? (
            <span className="mt-2 block space-y-0.5">
              {orderMoney.rows.map((r) => (
                <span key={r.id} className="block">
                  {r.method} · {formatPrice(r.amount)} · {r.dateLabel}
                  {r.receipt ? (
                    <>
                      {" "}
                      ·{" "}
                      <a href={`/api/admin/order-payments/${r.id}/receipt`} target="_blank" rel="noopener noreferrer" className="underline">
                        чек
                      </a>
                    </>
                  ) : null}
                </span>
              ))}
            </span>
          ) : null}
          {canEdit && orderMoney && orderMoney.received < orderMoney.due ? (
            <a href={`/admin/orders/${order.id}#money`} className="btn btn-sm mt-2 inline-flex">
              Принять оплату по заказу №{order.number}
            </a>
          ) : null}
        </p>
      ) : null}
      <InvoicesBlock dealId={dealId} invoices={invoices} perms={invoicePerms} onPaid={canEdit && !locked ? payByInvoice : undefined} />
      {dealPaid > agreed && agreed > 0 && !locked ? <p className="rounded-xl bg-amber-50 p-2.5 text-xs text-amber-900">Получено больше, чем договорились: проверьте сумму сделки или платежи.</p> : null}
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
                {p.invoice && !p.online ? <span className="rounded-full bg-cream px-2 py-0.5 text-[11px] text-ink-soft">по счёту {p.invoice}</span> : null}
                {overpaid.has(p.id) ? (
                  <span className="rounded-full bg-red-50 px-2 py-0.5 text-[11px] text-red-800" title="После этого платежа оплачено больше договорённости">
                    переплата
                  </span>
                ) : null}
                {canDelete && !locked && !p.online ? (
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
              {p.online ? (
                // Онлайн-платёж подтвердила платёжная система: вместо чека — операция и счёт.
                <p className="mt-1 text-xs text-emerald-800" data-testid="payment-online">
                  {p.online}
                  {p.invoice ? ` · счёт ${p.invoice}` : ""}
                </p>
              ) : p.receipts.length ? (
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
        <div ref={form} className="space-y-2 border-t border-line pt-3">
          <div className="text-xs font-medium text-ink-soft">Принять платёж</div>
          {mustChoose ? (
            <fieldset className="space-y-1.5 rounded-xl bg-amber-50/70 p-2.5 text-xs" data-testid="payment-choice">
              <legend className="sr-only">По счёту или другая оплата</legend>
              {guard?.recentOnline.length ? <p className="text-amber-900">Недавно уже пришла онлайн-оплата: {guard.recentOnline.map((r) => r.text).join("; ")}. Не записывайте её второй раз.</p> : null}
              {invoiceChoices.map((v) => (
                <label key={v.id} className="flex cursor-pointer items-center gap-2">
                  <input
                    type="radio"
                    name="payment-choice"
                    checked={choice === v.id}
                    onChange={() => {
                      setChoice(v.id);
                      setAmount(String(v.amount));
                    }}
                  />
                  По счёту {v.label} — {formatPrice(v.amount)}
                  {v.status === "expired" ? " (истёк)" : ""}
                </label>
              ))}
              <label className="flex cursor-pointer items-center gap-2">
                <input type="radio" name="payment-choice" checked={choice === "other"} onChange={() => setChoice("other")} />
                Это другая оплата{invoiceChoices.length ? " (не по счёту, в том числе часть суммы)" : ""}
              </label>
            </fieldset>
          ) : null}
          <div className="grid grid-cols-2 gap-2">
            <input
              value={byInvoice ? String(byInvoice.amount) : amount}
              onChange={(e) => setAmount(e.target.value)}
              readOnly={!!byInvoice}
              title={byInvoice ? `Сумма счёта ${byInvoice.label}; частичную оплату примите как «другую»` : undefined}
              type="number"
              min={1}
              step={500}
              placeholder="Сумма, ₸"
              className="input h-10"
              aria-label="Сумма платежа"
            />
            <input value={day} onChange={(e) => setDay(e.target.value)} type="date" className="input h-10" aria-label="Дата платежа" />
          </div>
          <input ref={file} type="file" accept="image/jpeg,image/png,image/webp,application/pdf" className="input h-10 w-full py-1.5 text-xs" aria-label="Чек" />
          <button type="button" className="btn btn-primary btn-sm w-full" disabled={busy || !(byInvoice || amount) || (mustChoose && !choice)} onClick={() => void add()}>
            {busy ? <LoaderCircle className="size-4 animate-spin" /> : <Paperclip className="size-4" />} {byInvoice ? `Принять оплату по счёту ${byInvoice.label} с чеком` : "Принять платёж с чеком"}
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
