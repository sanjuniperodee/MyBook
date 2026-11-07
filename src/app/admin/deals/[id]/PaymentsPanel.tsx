"use client";

import { useRef, useState } from "react";
import { useRouter } from "next/navigation";
import { CircleCheck, FileText, LoaderCircle, Paperclip, ReceiptText, Trash2, Undo2 } from "lucide-react";
import { Alert } from "@/components/ui/Alert";
import { Panel } from "@/components/ui/Panel";
import { ask } from "@/components/ui/overlays";
import { cn } from "@/lib/class-names";
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

/** Поле выбора файла чека: кнопка «Выбрать файл» в стиле системы, без «прыжка» высоты. */
const fileCls = "input h-auto min-h-9 py-1.5 text-xs file:mr-3 file:rounded-md file:border-0 file:bg-sunken file:px-2.5 file:py-1.5 file:text-xs file:font-medium file:text-ink";

/** Привязать чек к платежу, у которого его нет. */
function AttachReceipt({ dealId, payment, onDone }: { dealId: string; payment: PaymentItem; onDone: () => void }) {
  const input = useRef<HTMLInputElement>(null);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  return (
    <div className="mt-2 space-y-1" data-testid="attach-receipt">
      <div className="flex gap-2">
        <input ref={input} type="file" accept="image/jpeg,image/png,image/webp,application/pdf" className={cn(fileCls, "min-w-0 flex-1")} aria-label="Чек к платежу" />
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
          {busy ? <LoaderCircle className="size-4 animate-spin" aria-hidden /> : <Paperclip className="size-4" aria-hidden />} Прикрепить
        </button>
      </div>
      {error ? (
        <p className="text-xs text-danger" role="alert">
          {error}
        </p>
      ) : null}
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
  refundAfterOrder = null,
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
  /** Сделка с заказом: сколько внесено по сделке сверх учтённого в заказе (у отменённого — всё) — это можно вернуть отсюда. */
  refundAfterOrder?: number | null;
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
  // Возврат: без заказа — до всего полученного; с заказом — только лишнее по сделке (деньги заказа возвращаются не здесь).
  const refundMax = locked ? (refundAfterOrder ?? 0) : paid;
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

  const refundBlock = refundOpen ? (
    <div className="space-y-2.5 rounded-[var(--r-ctl)] border border-danger/25 bg-danger-bg/50 p-3.5" data-testid="refund-form">
      <div className="text-sm font-medium text-danger">Возврат денег клиенту</div>
      <div className="grid gap-2 sm:grid-cols-2">
        <input value={refundAmount} onChange={(e) => setRefundAmount(e.target.value)} type="number" min={1} max={refundMax} step={500} inputMode="numeric" placeholder={`Сумма, ₸ (до ${formatPrice(refundMax)})`} className="input tabular-nums" aria-label="Сумма возврата" />
        <input value={refundNote} onChange={(e) => setRefundNote(e.target.value)} maxLength={300} placeholder="Причина возврата" className="input" aria-label="Причина возврата" />
      </div>
      <input ref={refundFile} type="file" accept="image/jpeg,image/png,image/webp,application/pdf" className={fileCls} aria-label="Чек возврата" />
      <div className="flex gap-2">
        <button type="button" className="btn btn-outline btn-sm" disabled={busy || !refundAmount} onClick={() => void giveBack()}>
          {busy ? <LoaderCircle className="size-4 animate-spin" aria-hidden /> : <Undo2 className="size-4" aria-hidden />} Оформить возврат
        </button>
        <button type="button" className="btn btn-ghost btn-sm" onClick={() => setRefundOpen(false)}>
          Отмена
        </button>
      </div>
    </div>
  ) : (
    <button type="button" className="inline-flex min-h-9 items-center gap-1.5 text-sm text-muted hover:text-danger" onClick={() => setRefundOpen(true)}>
      <Undo2 className="size-4" aria-hidden /> Вернуть деньги клиенту
    </button>
  );

  const left = Math.max(0, target - paid);
  return (
    <div id="deal-payments" className="scroll-mt-[calc(var(--topbar-h)+1rem)] space-y-4 text-sm lg:space-y-5" data-testid="deal-payments">
      <section className="panel overflow-hidden">
        <header className="panel-head">
          <h2 className="panel-title">Оплата</h2>
          {canIssue && !locked ? (
            <button type="button" className="btn btn-outline btn-sm" onClick={() => setInvoiceKey(newIssueKey())} data-testid="issue-invoice">
              <ReceiptText className="size-4" aria-hidden /> Выставить счёт
            </button>
          ) : null}
        </header>
        {invoiceKey ? <InvoiceDialog issueKey={invoiceKey} dealId={dealId} onClose={() => setInvoiceKey(null)} /> : null}

        {/* Итог одной строкой: сколько всего, сколько пришло, сколько ждём. */}
        <dl className="grid grid-cols-3 divide-x divide-line">
          <div className="min-w-0 px-4 py-3.5 sm:px-5">
            <dt className="truncate text-xs text-muted" title={orderMoney ? `Всего по заказу №${order?.number}` : "По договорённости"}>
              {orderMoney ? (
                <>
                  Всего<span className="max-sm:hidden"> по заказу №{order?.number}</span>
                </>
              ) : (
                <>
                  <span className="sm:hidden">Сумма</span>
                  <span className="max-sm:hidden">По договорённости</span>
                </>
              )}
            </dt>
            <dd className="mt-0.5 text-xl font-semibold tabular-nums">{formatPrice(target)}</dd>
          </div>
          <div className="min-w-0 px-4 py-3.5 sm:px-5">
            <dt className="truncate text-xs text-muted">Получено</dt>
            <dd className={cn("mt-0.5 text-xl font-semibold tabular-nums", paid > 0 && "text-success")}>{formatPrice(paid)}</dd>
          </div>
          <div className="min-w-0 px-4 py-3.5 sm:px-5">
            <dt className="truncate text-xs text-muted">{orderMoney?.postpay ? "Постоплата: ждём" : "Остаток"}</dt>
            <dd className={cn("mt-0.5 text-xl font-semibold tabular-nums", left > 0 ? "text-ink" : "text-muted")}>{formatPrice(left)}</dd>
          </div>
        </dl>
        {target > 0 ? (
          <div className="h-1 bg-sunken" aria-hidden>
            <div className="h-full bg-success transition-[width]" style={{ width: `${Math.min(100, Math.round((paid / target) * 100))}%` }} />
          </div>
        ) : null}

        <div className="panel-body space-y-4 border-t border-line">
          {order ? (
            <div className="rounded-[var(--r-ctl)] bg-success-bg p-3.5 text-success" data-testid="order-linked">
              <p>
                Оформлен{" "}
                <a href={`/admin/orders/${order.id}`} className="font-medium underline">
                  заказ №{order.number}
                </a>
                : внесённая предоплата вычтена из его «к оплате». Тариф и договорённую сумму, пока заказ не оплачен, меняйте в заказе; остаток и постоплату принимайте там же.
              </p>
              {orderMoney?.rows.length ? (
                <ul className="mt-2 space-y-0.5 text-xs tabular-nums">
                  {orderMoney.rows.map((r) => (
                    <li key={r.id}>
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
                    </li>
                  ))}
                </ul>
              ) : null}
              {canEdit && orderMoney && orderMoney.received < orderMoney.due ? (
                <a href={`/admin/orders/${order.id}#money`} className="btn btn-dark btn-sm mt-3">
                  Принять оплату по заказу №{order.number}
                </a>
              ) : null}
            </div>
          ) : null}

          {dealPaid > agreed && agreed > 0 && !locked ? <Alert kind="warning">Получено больше, чем договорились: проверьте сумму сделки или платежи.</Alert> : null}
          {noReceipt.length ? <Alert kind="warning">Нет чека: {noReceipt.map((p) => formatPrice(p.amount)).join(", ")}. Прикрепите скриншот или фото перевода.</Alert> : null}

          <InvoicesBlock dealId={dealId} invoices={invoices} perms={invoicePerms} onPaid={canEdit && !locked ? payByInvoice : undefined} />
        </div>
      </section>

      <section className="panel overflow-hidden">
        <header className="panel-head">
          <h2 className="panel-title">
            Платежи {payments.length ? <span className="font-normal text-muted tabular-nums">{payments.length}</span> : null}
          </h2>
        </header>
        {payments.length ? (
          <ul className="divide-y divide-line">
            {payments.map((p) => (
              <li key={p.id} className="px-4 py-3 sm:px-5">
                <div className="flex flex-wrap items-center gap-x-3 gap-y-1">
                  <span className={cn("text-[15px] font-semibold tabular-nums", p.kind === "refund" && "text-danger")}>
                    {p.kind === "refund" ? "−" : ""}
                    {formatPrice(p.amount)}
                  </span>
                  <span className={cn("badge", p.kind === "refund" && "badge-danger")}>{p.kind === "prepayment" ? "предоплата" : p.kind === "refund" ? "возврат" : "платёж"}</span>
                  {p.invoice && !p.online ? <span className="badge">по счёту {p.invoice}</span> : null}
                  {overpaid.has(p.id) ? (
                    <span className="badge badge-danger" title="После этого платежа оплачено больше договорённости">
                      переплата
                    </span>
                  ) : null}
                  <span className="ml-auto truncate text-xs text-muted">
                    {p.dateLabel} · {p.author}
                  </span>
                  {canDelete && !locked && !p.online ? (
                    <button
                      type="button"
                      className="btn btn-ghost btn-icon btn-sm -my-1 -mr-1.5 size-8 text-muted hover:text-danger max-lg:size-11"
                      aria-label="Удалить платёж"
                      title="Удалить ошибочный платёж"
                      onClick={async () => {
                        if (!(await ask(`Удалить платёж ${formatPrice(p.amount)}? Он пропадёт из выручки.`, true))) return;
                        const res = await fetch(`/api/admin/payments/${p.id}`, { method: "DELETE" });
                        if (res.ok) refresh();
                        else setError("Не удалось удалить платёж");
                      }}
                    >
                      <Trash2 className="size-4" aria-hidden />
                    </button>
                  ) : null}
                </div>
                {p.note ? <p className="mt-1 text-xs text-muted">{p.note}</p> : null}
                {p.online ? (
                  // Онлайн-платёж подтвердила платёжная система: вместо чека — операция и счёт.
                  <p className="mt-1 flex items-center gap-1 text-xs text-success" data-testid="payment-online">
                    <CircleCheck className="size-3.5 shrink-0" aria-hidden />
                    {p.online}
                    {p.invoice ? ` · счёт ${p.invoice}` : ""}
                  </p>
                ) : p.receipts.length ? (
                  <ul className="mt-1.5 flex flex-wrap gap-x-3 gap-y-1">
                    {p.receipts.map((r) => (
                      <li key={r.id} className="flex min-w-0 items-center gap-1 text-xs">
                        {r.isPdf ? <FileText className="size-3.5 shrink-0 text-muted" aria-hidden /> : <Paperclip className="size-3.5 shrink-0 text-muted" aria-hidden />}
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
          <p className="px-4 py-4 text-sm text-muted sm:px-5">Платежей пока нет. Принятый платёж с чеком сразу попадает в выручку.</p>
        )}

        {canEdit && !locked ? (
          <div ref={form} id="deal-payment-form" className="scroll-mt-[calc(var(--topbar-h)+1rem)] space-y-3 border-t border-line bg-sunken/50 px-4 py-4 sm:px-5">
            <h3 className="text-sm font-semibold">Принять платёж</h3>
            {mustChoose ? (
              <fieldset className="space-y-1.5 rounded-[var(--r-ctl)] bg-warning-bg p-3 text-sm text-warning [&_input]:size-4 [&_input]:accent-wine" data-testid="payment-choice">
                <legend className="sr-only">По счёту или другая оплата</legend>
                {guard?.recentOnline.length ? <p className="mb-1">Недавно уже пришла онлайн-оплата: {guard.recentOnline.map((r) => r.text).join("; ")}. Не записывайте её второй раз.</p> : null}
                {invoiceChoices.map((v) => (
                  <label key={v.id} className="flex min-h-8 cursor-pointer items-center gap-2 text-ink">
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
                <label className="flex min-h-8 cursor-pointer items-center gap-2 text-ink">
                  <input type="radio" name="payment-choice" checked={choice === "other"} onChange={() => setChoice("other")} />
                  Это другая оплата{invoiceChoices.length ? " (не по счёту, в том числе часть суммы)" : ""}
                </label>
              </fieldset>
            ) : null}
            <div className="grid gap-3 sm:grid-cols-2">
              <label className="min-w-0">
                <span className="label text-xs">Сумма, ₸</span>
                <input
                  value={byInvoice ? String(byInvoice.amount) : amount}
                  onChange={(e) => setAmount(e.target.value)}
                  readOnly={!!byInvoice}
                  title={byInvoice ? `Сумма счёта ${byInvoice.label}; частичную оплату примите как «другую»` : undefined}
                  type="number"
                  min={1}
                  step={500}
                  inputMode="numeric"
                  placeholder="0"
                  className="input tabular-nums read-only:bg-sunken"
                  aria-label="Сумма платежа"
                />
              </label>
              <label className="min-w-0">
                <span className="label text-xs">Дата оплаты</span>
                <input value={day} onChange={(e) => setDay(e.target.value)} type="date" className="input" aria-label="Дата платежа" />
              </label>
              <label className="block sm:col-span-2">
                <span className="label text-xs">Чек: скриншот, фото или PDF</span>
                <input ref={file} type="file" accept="image/jpeg,image/png,image/webp,application/pdf" className={fileCls} aria-label="Чек" />
              </label>
            </div>
            {error ? <Alert>{error}</Alert> : null}
            <button type="button" className="btn btn-dark w-full sm:w-auto" disabled={busy || !(byInvoice || amount) || (mustChoose && !choice)} onClick={() => void add()}>
              {busy ? <LoaderCircle className="size-4 animate-spin" aria-hidden /> : <Paperclip className="size-4" aria-hidden />} {byInvoice ? `Принять оплату по счёту ${byInvoice.label} с чеком` : "Принять платёж с чеком"}
            </button>
            <p className="text-xs text-muted">Платёж сразу попадает в выручку: обзор, аналитику, план менеджера и карточку клиента.</p>
          </div>
        ) : null}
        {canEdit && !locked && refundMax > 0 ? <div className="border-t border-line px-4 py-3 sm:px-5">{refundBlock}</div> : null}
        {canEdit && locked && refundMax > 0 ? (
          <div className="space-y-2 border-t border-line px-4 py-3 sm:px-5" data-testid="refund-after-order">
            <p className="text-xs text-muted">Можно вернуть клиенту {formatPrice(refundMax)} — деньги по сделке, которые не учтены в заказе (или заказ отменён).</p>
            {refundBlock}
            {error ? <Alert>{error}</Alert> : null}
          </div>
        ) : null}
      </section>

      {/* Договорённость — что обещано клиенту; меняют редко, поэтому отдельным листом ниже платежей. */}
      <Panel title="Договорённость" description="Тариф и бесплатное по договорённости: клиент увидит это при оформлении заказа">
        <div className="grid gap-5 sm:grid-cols-2">
          <div data-testid="agreed-plan" className="min-w-0">
            <label className="label text-xs" htmlFor="agreed-plan">
              Тариф договорённости
            </label>
            <select
              id="agreed-plan"
              className="input"
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
              <option value="">Не указан — клиент выберет сам</option>
              {planOptions.map((p) => (
                <option key={p.id} value={p.id}>
                  {planLabels[p.id]}
                </option>
              ))}
            </select>
            <p className="hint">{planMsg ?? "Клиент оформит заказ по договорённости только на этот тариф. Доставка и допы считаются сверху."}</p>
          </div>
          {giftChoices.length ? (
            <div data-testid="agreed-gifts" className="min-w-0">
              <div className="label text-xs">Бесплатно по договорённости</div>
              <div className="flex min-h-10 flex-wrap items-center gap-x-5 gap-y-1">
                {giftChoices.map((g) => (
                  <label key={g} className="flex min-h-8 items-center gap-2 text-sm">
                    <input type="checkbox" className="size-4 accent-wine" checked={giftValue.includes(g)} disabled={!canEdit || locked} onChange={(e) => void toggleGift(g, e.target.checked)} />
                    {g === "giftwrap" ? "Подарочная упаковка" : "Доставка"}
                  </label>
                ))}
              </div>
              <p className="hint">{giftMsg ?? "Отмеченное клиент выбирает при оформлении сам, и оно стоит 0 ₸. Не отмечено — по прайсу."}</p>
            </div>
          ) : null}
        </div>
      </Panel>
    </div>
  );
}
