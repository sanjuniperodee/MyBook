"use client";

import { ask, promptText, toast } from "@/components/ui/overlays";
import { useActionState, useEffect, useRef, useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { ArrowRightLeft, BookCopy, CircleCheck, CreditCard, Download, FileArchive, LoaderCircle, Printer, Receipt, RefreshCw, Truck, Undo2 } from "lucide-react";
import { changeOrderTermsAction, generateFilesAction, reviewOrderPaymentAction, saveAdminNoteAction, startPostpayAction, toggleBookLockAction, updateOrderAction, updateOrderDetailsAction, type AdminState } from "../../actions";
import { SubmitButton } from "@/components/ui/SubmitButton";
import { Alert } from "@/components/ui/Alert";
import { prepareAndDownload, RenderStatus, useRenderJob } from "@/components/ui/RenderProgress";
import { orders } from "@/i18n/messages/ru/orders";
import type { RenderKind } from "@/modules/production";
import { orderStatusLabel } from "@/modules/ordering/ui/status";
import { orderNotice, type OrderNoticeFacts } from "@/modules/ordering/ui/notice";
import { deliveryLabels } from "@/modules/ordering/ui/labels";
import { DiscountHint } from "@/components/admin/DiscountHint";
import { ActionMenu, menuItemClass } from "@/components/admin/ActionMenu";
import { Badge } from "@/components/ui/Badge";
import { Field } from "@/components/ui/Field";
import { Disclosure } from "./Disclosure";
import { RefundPanel, UpgradePanel } from "@/components/admin/money/MoneyPanels";
import { cn } from "@/lib/class-names";
import { ORDER_STATUSES as orderStatuses, type OrderStatus } from "@/shared/domain/orders";

/** У электронной версии нет печати и доставки: только «ждёт оплаты → выполнен» и отмена. */
const digitalStatuses: readonly OrderStatus[] = ["pending_payment", "paid", "cancelled"];

/**
 * Форма статуса; notice — что известно о каналах клиента: под формой видно, что реально уйдёт при выбранном статусе и
 * трек-номере в поле (без трека правило о трек-номере не пишет).
 */
export function StatusForm({ orderId, status, trackingNumber, printed = true, notice }: { orderId: string; status: OrderStatus; trackingNumber: string | null; printed?: boolean; notice: OrderNoticeFacts }) {
  const [state, action] = useActionState<AdminState, FormData>(updateOrderAction, {});
  const [to, setTo] = useState<OrderStatus>(status);
  const [track, setTrack] = useState(trackingNumber ?? "");
  const hint = orderNotice(notice, { from: status, to, track: printed ? track : trackingNumber, savedTrack: trackingNumber });
  return (
    <form action={action} className="space-y-3">
      <input type="hidden" name="orderId" value={orderId} />
      <Field label="Статус">
        <select name="status" defaultValue={status} onChange={(e) => setTo(e.target.value as OrderStatus)} className="input">
          {orderStatuses.filter((s) => printed || digitalStatuses.includes(s)).map((s) => (
            <option key={s} value={s}>{orderStatusLabel(s, "ru", printed)}</option>
          ))}
        </select>
      </Field>
      {printed ? (
        <Field label="Трек-номер" hint={to === "shipped" && !track ? "С трек-номером клиент сможет отследить посылку" : undefined}>
          <input id="order-track" name="trackingNumber" value={track} onChange={(e) => setTrack(e.target.value)} className="input" maxLength={100} />
        </Field>
      ) : (
        <input type="hidden" name="trackingNumber" value={trackingNumber ?? ""} />
      )}
      <Field label="Комментарий в журнал" optional>
        <input name="note" className="input" maxLength={1000} />
      </Field>
      <p className={hint.warn ? "rounded-lg bg-warning-bg px-2.5 py-1.5 text-xs text-warning" : "text-xs text-muted"} data-testid="order-notice">
        {hint.text}
      </p>
      {state.error ? <Alert>{state.error}</Alert> : null}
      {state.ok ? <Alert kind="success">{state.ok}</Alert> : null}
      <SubmitButton className="btn-dark w-full">Сохранить статус</SubmitButton>
    </form>
  );
}

/**
 * Главное следующее действие в шапке заказа — по статусу: ждёт оплаты → «Принять оплату» (открывает форму в «Деньгах»),
 * оплачен → «Передать в печать», в печати → «Отметить отправленным» (к полю трек-номера), отправлен → «Отметить
 * доставленным». Смена статуса — с подтверждением: что получит клиент, видно в вопросе (как под формой статуса).
 */
export function NextStep({ orderId, status, printed, trackingNumber, notice }: { orderId: string; status: OrderStatus; printed: boolean; trackingNumber: string | null; notice: OrderNoticeFacts }) {
  const [pending, start] = useTransition();
  const router = useRouter();
  const move = (to: OrderStatus, question: string) => async () => {
    const hint = orderNotice(notice, { from: status, to, track: trackingNumber, savedTrack: trackingNumber });
    if (!(await ask(`${question} ${hint.text}`))) return;
    start(async () => {
      const body = new FormData();
      body.set("orderId", orderId);
      body.set("status", to);
      body.set("trackingNumber", trackingNumber ?? "");
      const r = await updateOrderAction({}, body);
      if (r.error) toast(r.error, "error");
      else {
        toast(`Заказ: ${orderStatusLabel(to, "ru", printed)}`);
        router.refresh();
      }
    });
  };
  const cls = "btn btn-primary btn-sm";
  const spin = pending ? <LoaderCircle className="size-4 animate-spin" aria-hidden /> : null;
  if (status === "pending_payment")
    return (
      <a href="#pay" className={cls} data-testid="order-next">
        <CreditCard className="size-4" aria-hidden /> Принять оплату
      </a>
    );
  if (!printed) return null;
  if (status === "paid")
    return (
      <button type="button" className={cls} disabled={pending} onClick={move("in_production", "Передать заказ в печать?")} data-testid="order-next">
        {spin ?? <Printer className="size-4" aria-hidden />} Передать в печать
      </button>
    );
  if (status === "in_production")
    return (
      <a href="#status" className={cls} data-testid="order-next" onClick={() => setTimeout(() => document.getElementById("order-track")?.focus(), 350)}>
        <Truck className="size-4" aria-hidden /> Отметить отправленным
      </a>
    );
  if (status === "shipped")
    return (
      <button type="button" className={cls} disabled={pending} onClick={move("delivered", "Заказ доставлен?")} data-testid="order-next">
        {spin ?? <CircleCheck className="size-4" aria-hidden />} Отметить доставленным
      </button>
    );
  return null;
}

export function NoteForm({ orderId, note }: { orderId: string; note: string | null }) {
  const [state, action] = useActionState<AdminState, FormData>(saveAdminNoteAction, {});
  return (
    <form action={action} className="space-y-3">
      <input type="hidden" name="orderId" value={orderId} />
      <textarea name="adminNote" defaultValue={note ?? ""} rows={3} className="input text-sm" placeholder="Видна только сотрудникам" aria-label="Заметка о заказе" />
      <div className="flex items-center gap-3">
        <SubmitButton className="btn-outline btn-sm">Сохранить заметку</SubmitButton>
        {state.ok ? <span className="text-xs text-success" role="status">{state.ok}</span> : null}
      </div>
    </form>
  );
}

/**
 * Файлы для типографии: скачивание и пересборка. Пока файла нет (или его пересобирают), кнопка ждёт сборку и показывает
 * её ход — этап, проценты и сколько осталось; готовый файл скачивается сразу из кэша.
 */
export function PrintFileActions({ orderId, hasFiles }: { orderId: string; hasFiles: boolean }) {
  const router = useRouter();
  // Админка — только по-русски: тексты хода сборки те же, что у клиента на русском.
  const labels = orders.order.progress;
  const { busy, job, error, run, waiting } = useRenderJob(orderId, labels.failed);
  const link = (id: string, kind: string, href: string, label: string, opts: { className: string; icon?: "zip"; kinds?: RenderKind[] }) => (
    <a
      key={id}
      href={href}
      role={opts.className === menuItemClass ? "menuitem" : undefined}
      aria-disabled={busy !== null}
      className={`${opts.className} ${busy !== null && busy !== id ? "pointer-events-none opacity-50" : ""}`}
      onClick={(e) => {
        // Ctrl/⌘-клик и средняя кнопка — как у обычной ссылки.
        if (e.button !== 0 || e.metaKey || e.ctrlKey || e.shiftKey || e.altKey) return;
        e.preventDefault();
        void run(id, opts.kinds ?? ["package"], () => prepareAndDownload(orderId, kind, href));
      }}
    >
      {busy === id ? <LoaderCircle className="size-4 animate-spin" /> : opts.icon === "zip" ? <FileArchive className="size-4" /> : <Download className="size-4" />} {label}
    </a>
  );
  return (
    <>
      <div className="flex flex-wrap items-center gap-2">
        {link("zip", "block", `/api/admin/orders/${orderId}/package`, "Скачать всё (ZIP)", { className: "btn btn-dark btn-sm", icon: "zip" })}
        <ActionMenu label="Отдельные файлы" className="[&>button]:w-auto">
          {link("block", "block", `/api/orders/${orderId}/files/block`, "Блок книги", { className: menuItemClass })}
          {link("cover", "cover", `/api/orders/${orderId}/files/cover`, "Обложка", { className: menuItemClass })}
          {link("layout", "layout", `/api/orders/${orderId}/files/layout`, "Каркас обложки", { className: menuItemClass, kinds: ["package", "layout"] })}
          {link("spec", "spec", `/api/orders/${orderId}/files/spec`, "Техзадание", { className: menuItemClass })}
          {link("reading", "reading", `/api/orders/${orderId}/files/reading`, "PDF для чтения", { className: menuItemClass, kinds: ["reading"] })}
        </ActionMenu>
        <button
          className="btn btn-ghost btn-sm"
          disabled={busy !== null}
          onClick={() =>
            void run("generate", ["package"], async () => {
              await generateFilesAction(orderId);
              router.refresh();
            })
          }
        >
          {busy === "generate" ? <LoaderCircle className="size-4 animate-spin" /> : <RefreshCw className="size-4" />}
          {busy === "generate" ? "Генерируем…" : hasFiles ? "Перегенерировать файлы" : "Сгенерировать файлы"}
        </button>
      </div>
      <RenderStatus job={job} waiting={waiting} labels={labels} />
      {error ? <Alert className="mt-3">{error}</Alert> : null}
    </>
  );
}

export function LockButton({ orderId, locked }: { orderId: string; locked: boolean }) {
  const [pending, start] = useTransition();
  return (
    <button
      className="btn btn-ghost btn-sm h-7 px-2 text-xs text-wine"
      disabled={pending}
      onClick={async () => {
        if (await ask(locked ? "Открыть книгу для правок клиентом? После правок перегенерируйте файлы." : "Закрыть книгу для правок?")) start(() => toggleBookLockAction(orderId));
      }}
    >
      {pending ? <LoaderCircle className="size-3.5 animate-spin" aria-hidden /> : null}
      {locked ? "Открыть для правок" : "Закрыть для правок"}
    </button>
  );
}

export function DetailsForm({
  order,
}: {
  order: { id: string; contactName: string; contactPhone: string; contactEmail: string; deliveryMethod: string | null; deliveryCountry: string | null; city: string | null; address: string | null; postalCode: string | null; desiredDate: string | null; giftNote: string | null };
}) {
  const [state, action] = useActionState<AdminState, FormData>(updateOrderDetailsAction, {});
  return (
    <Disclosure title="Изменить контакты и доставку" hint="получатель, адрес, дата, открытка">
      <form action={action} className="grid gap-3 sm:grid-cols-2">
        <input type="hidden" name="orderId" value={order.id} />
        <Field label="Получатель">
          <input name="contactName" defaultValue={order.contactName} className="input" required />
        </Field>
        <Field label="Телефон">
          <input name="contactPhone" type="tel" defaultValue={order.contactPhone} className="input" required />
        </Field>
        <Field label="E-mail">
          <input name="contactEmail" type="email" defaultValue={order.contactEmail} className="input" required />
        </Field>
        <Field label="Способ доставки">
          <select name="deliveryMethod" defaultValue={order.deliveryMethod ?? ""} className="input">
            <option value="">Не выбран</option>
            {Object.entries(deliveryLabels).map(([id, label]) => (
              <option key={id} value={id}>
                {label}
              </option>
            ))}
          </select>
        </Field>
        <Field label="Страна" hint="Только для доставки в другую страну; Казахстан не указывать">
          <input name="country" defaultValue={order.deliveryCountry ?? ""} className="input" />
        </Field>
        <Field label="Город">
          <input name="city" defaultValue={order.city ?? ""} className="input" />
        </Field>
        <Field label="Индекс">
          <input name="postalCode" defaultValue={order.postalCode ?? ""} className="input" inputMode="numeric" />
        </Field>
        <Field label="Нужна к дате">
          <input name="desiredDate" type="date" defaultValue={order.desiredDate ?? ""} className="input" />
        </Field>
        <Field label="Адрес" className="sm:col-span-2">
          <input name="address" defaultValue={order.address ?? ""} className="input" />
        </Field>
        <Field label="Текст открытки" className="sm:col-span-2">
          <textarea name="giftNote" defaultValue={order.giftNote ?? ""} rows={2} maxLength={500} className="input" />
        </Field>
        {state.error ? <Alert className="sm:col-span-2">{state.error}</Alert> : null}
        {state.ok ? <Alert kind="success" className="sm:col-span-2">{state.ok}</Alert> : null}
        <div className="sm:col-span-2">
          <SubmitButton className="btn-dark btn-sm">Сохранить изменения</SubmitButton>
        </div>
      </form>
    </Disclosure>
  );
}

/**
 * Тариф и договорённая цена книги, пока заказ не оплачен. Пустая сумма — по прайсу тарифа; промокод, доставка, допы и внесённая
 * предоплата остаются. Открытый счёт Kaspi на старую сумму закроется — выставьте новый.
 */
export function TermsForm({
  orderId,
  plan,
  agreed,
  plans,
  maxPercent,
}: {
  orderId: string;
  plan: string;
  /** Договорённая цена первого экземпляра сейчас (пусто — по прайсу). */
  agreed: number | null;
  plans: { id: string; label: string; price: number }[];
  /** Лимит скидки сотрудника, %; null — без лимита. */
  maxPercent: number | null;
}) {
  const [state, action] = useActionState<AdminState, FormData>(changeOrderTermsAction, {});
  const [planId, setPlanId] = useState(plan);
  const [price, setPrice] = useState(agreed === null ? "" : String(agreed));
  const list = plans.find((p) => p.id === planId)?.price ?? 0;
  return (
    <form action={action} className="space-y-3" data-testid="order-terms">
      <input type="hidden" name="orderId" value={orderId} />
      <Field label="Тариф">
        <select name="plan" value={planId} onChange={(e) => setPlanId(e.target.value)} className="input">
          {plans.map((p) => (
            <option key={p.id} value={p.id}>
              {p.label} · {p.price.toLocaleString("ru-RU")} ₸
            </option>
          ))}
        </select>
      </Field>
      <div>
        <Field label="Договорённая цена книги, ₸">
          <input name="agreedTotal" type="number" inputMode="numeric" min={1} step={1} value={price} onChange={(e) => setPrice(e.target.value)} placeholder={`по прайсу: ${list.toLocaleString("ru-RU")}`} className="input" />
        </Field>
        <DiscountHint list={{ listPrice: list, planless: false }} price={Number(price) || 0} maxPercent={maxPercent} />
      </div>
      {state.error ? <Alert>{state.error}</Alert> : null}
      {state.ok ? <Alert kind="success">{state.ok}</Alert> : null}
      <SubmitButton className="btn-outline w-full">Сохранить тариф и цену</SubmitButton>
      <p className="text-xs text-muted">Доставка, допы, промокод и внесённая предоплата остаются. Открытый счёт Kaspi закроется — выставьте новый на новую сумму.</p>
    </form>
  );
}

export interface OrderMoneyRow {
  id: string;
  /** refund — возврат клиенту (сумма больше нуля, показывается со знаком минус). */
  kind?: "payment" | "refund";
  amount: number;
  method: "manual" | "kaspi" | "cloudpayments";
  ref: string | null;
  paidLabel: string;
  note: string;
  receipt: boolean;
  /** Ручную оплату проверил руководитель (кто и когда). */
  reviewed: string | null;
  by: string | null;
}

const methodLabels = { manual: "Перевод", kaspi: "Kaspi", cloudpayments: "Карта" } as const;

/**
 * Деньги по заказу: журнал оплат (перевод с чеком, онлайн), «Принять оплату» в любом статусе, кроме отменённого,
 * «В печать с постоплатой» для неоплаченного. Руководитель отмечает ручные оплаты «проверено» (сверил с выпиской).
 */
export function OrderMoney({
  orderId,
  status,
  due,
  received,
  postpay,
  settled,
  rows,
  canEdit,
  canReview,
  orderNumber,
  refundable = 0,
  digital = false,
}: {
  orderId: string;
  status: OrderStatus;
  due: number;
  received: number;
  orderNumber: number;
  /** Сколько можно вернуть клиенту: по отменённому — всё полученное, по живому — переплата. */
  refundable?: number;
  /** Электронная версия: оплаченную можно «Перевести в печатную». */
  digital?: boolean;
  postpay: boolean;
  settled: boolean;
  rows: OrderMoneyRow[];
  canEdit: boolean;
  canReview: boolean;
}) {
  const [pending, start] = useTransition();
  const [open, setOpen] = useState(false);
  const [panel, setPanel] = useState<"refund" | "upgrade" | null>(null);
  const [error, setError] = useState<string | null>(null);
  const router = useRouter();
  const amount = useRef<HTMLInputElement>(null);
  const canRefund = canEdit && refundable > 0;
  const canUpgrade = canEdit && digital && status === "paid" && settled;
  const outstanding = Math.max(0, due - received);
  const money = (n: number) => `${n.toLocaleString("ru-RU")} ₸`;
  const canPay = canEdit && status !== "cancelled";
  // «Принять оплату» из шапки заказа (#pay): открыть форму и поставить курсор в сумму.
  useEffect(() => {
    if (!canPay) return;
    const fromHash = () => {
      if (window.location.hash !== "#pay") return;
      setOpen(true);
      setTimeout(() => amount.current?.focus(), 50);
    };
    fromHash();
    window.addEventListener("hashchange", fromHash);
    return () => window.removeEventListener("hashchange", fromHash);
  }, [canPay]);
  const submit = (form: HTMLFormElement) =>
    start(async () => {
      setError(null);
      const res = await fetch(`/api/admin/orders/${orderId}/payments`, { method: "POST", body: new FormData(form) });
      const body = (await res.json().catch(() => ({}))) as { error?: string; message?: string; overpaid?: number };
      if (!res.ok) return setError(body.message ?? body.error ?? "Не удалось принять оплату");
      close();
      if (body.overpaid) setError(`Получено больше, чем к оплате, на ${money(body.overpaid)} — ответственному поставлена задача «возврат или зачёт».`);
      router.refresh();
    });
  // Закрыли форму — убираем #pay из адреса, иначе повторное «Принять оплату» в шапке не откроет её (hashchange не придёт).
  const close = () => {
    setOpen(false);
    if (window.location.hash === "#pay") history.replaceState(null, "", window.location.pathname + window.location.search);
  };
  const share = due > 0 ? Math.min(1, received / due) : received > 0 ? 1 : 0;
  return (
    <div className="space-y-4 text-sm" data-testid="order-money">
      <div>
        <div className="flex flex-wrap items-baseline justify-between gap-x-3 gap-y-1">
          <span className="text-muted">Получено</span>
          <span className="tabular-nums">
            <b className="text-base font-semibold">{money(received)}</b> <span className="text-muted">из {money(due)}</span>
          </span>
        </div>
        <div className="mt-2 h-1.5 overflow-hidden rounded-full bg-sunken" aria-hidden>
          <div className={cn("h-full rounded-full", share >= 1 ? "bg-success" : "bg-wine")} style={{ width: `${share * 100}%` }} />
        </div>
        {outstanding && status !== "cancelled" ? (
          <div className="mt-2 flex justify-between gap-3 text-warning">
            <span>{postpay ? "Постоплата: ждём" : "Осталось получить"}</span>
            <span className="font-medium tabular-nums">{money(outstanding)}</span>
          </div>
        ) : null}
        {settled && !rows.length && due > 0 ? <Alert kind="warning" className="mt-2">Оплата подтверждена без денег в журнале — прикрепите оплату с чеком.</Alert> : null}
      </div>
      {rows.length ? (
        <ul className="divide-y divide-line rounded-[10px] border border-line">
          {rows.map((r) => (
            <li key={r.id} className="flex flex-wrap items-start gap-x-3 gap-y-1 px-3 py-2.5">
              <span className="min-w-0 flex-1">
                <span className="flex flex-wrap items-center gap-x-2">
                  <b className={cn("font-semibold tabular-nums", r.kind === "refund" && "text-danger")}>{r.kind === "refund" ? `−${money(r.amount)}` : money(r.amount)}</b>
                  {r.kind === "refund" ? <Badge tone="danger">возврат</Badge> : <Badge>{methodLabels[r.method]}</Badge>}
                  <span className="text-xs text-muted">{r.paidLabel}</span>
                </span>
                <span className="mt-0.5 block text-xs text-muted">
                  {[r.ref ? `операция ${r.ref}` : null, r.by, r.note || null].filter(Boolean).join(", ")}
                </span>
              </span>
              <span className="flex items-center gap-2 text-xs">
                {r.receipt ? (
                  <a href={`/api/admin/order-payments/${r.id}/receipt`} target="_blank" rel="noopener noreferrer" className="inline-flex items-center gap-1 text-wine hover:underline">
                    <Receipt className="size-3.5" aria-hidden /> чек
                  </a>
                ) : null}
                {r.method === "manual" ? (
                  r.reviewed ? (
                    <Badge tone="success" title={`Проверено: ${r.reviewed}`}>
                      проверено
                    </Badge>
                  ) : canReview ? (
                    <button
                      type="button"
                      className="btn btn-outline btn-sm h-7 px-2 text-xs"
                      disabled={pending}
                      onClick={() =>
                        start(async () => {
                          // Отказ (свою запись проверяет другой сотрудник, уже проверено) — тостом, иначе кнопка «молчит».
                          const res = await reviewOrderPaymentAction(r.id);
                          if (res.error) toast(res.error, "error");
                          else router.refresh();
                        })
                      }
                    >
                      Отметить проверенным
                    </button>
                  ) : (
                    <Badge tone="warning">не проверено</Badge>
                  )
                ) : null}
              </span>
            </li>
          ))}
        </ul>
      ) : null}
      {(canPay || canRefund) && !open ? (
        <div className="flex flex-wrap gap-2">
          {canPay ? (
            <button type="button" className="btn btn-dark btn-sm" onClick={() => setOpen(true)}>
              <CreditCard className="size-4" aria-hidden /> Принять оплату
            </button>
          ) : null}
          {canRefund ? (
            <button type="button" className="btn btn-outline btn-sm" onClick={() => setPanel("refund")} data-testid="order-refund">
              <Undo2 className="size-4" aria-hidden /> Вернуть клиенту
            </button>
          ) : null}
          {canUpgrade ? (
            <button type="button" className="btn btn-outline btn-sm" onClick={() => setPanel("upgrade")} data-testid="order-upgrade">
              <BookCopy className="size-4" aria-hidden /> Перевести в печатную
            </button>
          ) : null}
          {status === "pending_payment" ? (
            <button
              type="button"
              className="btn btn-outline btn-sm"
              disabled={pending}
              onClick={async () => {
                const reason = await promptText({
                  title: "В печать без оплаты",
                  text: "О чём договорились с клиентом: когда и как заплатит.",
                  confirmLabel: "В печать",
                  input: { required: true, placeholder: "Например: доплатит при получении, Kaspi", maxLength: 200 },
                });
                if (reason === null) return;
                start(async () => {
                  const r = await startPostpayAction(orderId, reason);
                  if (r.error) setError(r.error);
                  else router.refresh();
                });
              }}
            >
              <ArrowRightLeft className="size-4" aria-hidden /> В печать с постоплатой
            </button>
          ) : null}
        </div>
      ) : null}
      {open ? (
        <form
          id="pay"
          className="scroll-mt-[calc(var(--topbar-h)+1rem)] space-y-3 rounded-[10px] border border-line bg-sunken/50 p-3 sm:p-4"
          onSubmit={(e) => {
            e.preventDefault();
            submit(e.currentTarget);
          }}
        >
          <div className="text-sm font-semibold">Принять оплату</div>
          <div className="grid grid-cols-2 gap-3">
            <Field label="Сумма, ₸">
              <input ref={amount} name="amount" type="number" inputMode="numeric" min={1} step={1} required defaultValue={outstanding || undefined} className="input h-10" />
            </Field>
            <Field label="Дата оплаты" hint="Пусто — сегодня">
              <input name="paidAt" type="date" className="input h-10" />
            </Field>
          </div>
          <Field label="Чек" hint="Скриншот, фото или PDF перевода">
            <input name="file" type="file" accept="image/jpeg,image/png,image/webp,application/pdf" required className="block w-full text-sm file:mr-3 file:rounded-lg file:border file:border-line-strong file:bg-white file:px-3 file:py-1.5 file:text-sm file:text-ink" />
          </Field>
          <Field label="Комментарий" optional>
            <input name="note" maxLength={500} className="input h-10" />
          </Field>
          <div className="flex flex-wrap gap-2">
            <button className="btn btn-dark btn-sm" disabled={pending}>
              {pending ? <LoaderCircle className="size-4 animate-spin" aria-hidden /> : null} Записать оплату
            </button>
            <button type="button" className="btn btn-ghost btn-sm" onClick={close}>
              Отмена
            </button>
          </div>
        </form>
      ) : null}
      {error ? <Alert>{error}</Alert> : null}
      {canRefund ? <RefundPanel open={panel === "refund"} onClose={() => setPanel(null)} target={{ kind: "order", id: orderId, label: `Заказ №${orderNumber}`, amount: refundable, max: refundable }} /> : null}
      {canUpgrade ? <UpgradePanel open={panel === "upgrade"} onClose={() => setPanel(null)} order={{ id: orderId, number: orderNumber, received }} /> : null}
    </div>
  );
}
