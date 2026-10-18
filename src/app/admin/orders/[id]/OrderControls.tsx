"use client";

import { ask } from "@/components/ui/overlays";
import { useActionState, useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { LoaderCircle, RefreshCw } from "lucide-react";
import { generateFilesAction, reviewOrderPaymentAction, saveAdminNoteAction, startPostpayAction, toggleBookLockAction, updateOrderAction, updateOrderDetailsAction, type AdminState } from "../../actions";
import { SubmitButton } from "@/components/ui/SubmitButton";
import { Alert } from "@/components/ui/Alert";
import { orderStatusLabel } from "@/modules/ordering/ui/status";
import { deliveryLabels } from "@/modules/ordering/ui/labels";
import { ORDER_STATUSES as orderStatuses, type OrderStatus } from "@/shared/domain/orders";

/** У электронной версии нет печати и доставки: только «ждёт оплаты → выполнен» и отмена. */
const digitalStatuses: readonly OrderStatus[] = ["pending_payment", "paid", "cancelled"];

export function StatusForm({ orderId, status, trackingNumber, printed = true }: { orderId: string; status: OrderStatus; trackingNumber: string | null; printed?: boolean }) {
  const [state, action] = useActionState<AdminState, FormData>(updateOrderAction, {});
  return (
    <form action={action} className="space-y-3">
      <input type="hidden" name="orderId" value={orderId} />
      <div>
        <label className="label">Статус</label>
        <select name="status" defaultValue={status} className="input h-11">
          {orderStatuses.filter((s) => printed || digitalStatuses.includes(s)).map((s) => (
            <option key={s} value={s}>{orderStatusLabel(s, "ru", printed)}</option>
          ))}
        </select>
      </div>
      {printed ? (
        <div>
          <label className="label">Трек-номер</label>
          <input name="trackingNumber" defaultValue={trackingNumber ?? ""} className="input h-11" maxLength={100} />
        </div>
      ) : (
        <input type="hidden" name="trackingNumber" value={trackingNumber ?? ""} />
      )}
      <div>
        <label className="label">Комментарий в журнал</label>
        <input name="note" className="input h-11" maxLength={1000} placeholder="необязательно" />
      </div>
      {state.error ? <Alert>{state.error}</Alert> : null}
      {state.ok ? <Alert kind="success">{state.ok}</Alert> : null}
      <SubmitButton className="w-full">Сохранить</SubmitButton>
      <p className="text-xs text-muted">Клиент получит письмо при смене статуса.</p>
    </form>
  );
}

export function NoteForm({ orderId, note }: { orderId: string; note: string | null }) {
  const [state, action] = useActionState<AdminState, FormData>(saveAdminNoteAction, {});
  return (
    <form action={action} className="space-y-3">
      <input type="hidden" name="orderId" value={orderId} />
      <textarea name="adminNote" defaultValue={note ?? ""} rows={4} className="input text-sm" placeholder="Видна только администраторам" />
      {state.ok ? <p className="text-xs text-emerald-700">{state.ok}</p> : null}
      <SubmitButton className="btn-sm">Сохранить заметку</SubmitButton>
    </form>
  );
}

export function GenerateButton({ orderId, hasFiles }: { orderId: string; hasFiles: boolean }) {
  const [pending, start] = useTransition();
  return (
    <button className="btn btn-outline btn-sm" disabled={pending} onClick={() => start(() => generateFilesAction(orderId))}>
      {pending ? <LoaderCircle className="size-4 animate-spin" /> : <RefreshCw className="size-4" />}
      {pending ? "Генерируем… (до минуты)" : hasFiles ? "Перегенерировать файлы" : "Сгенерировать файлы"}
    </button>
  );
}

export function LockButton({ orderId, locked }: { orderId: string; locked: boolean }) {
  const [pending, start] = useTransition();
  return (
    <button
      className="btn btn-ghost btn-sm"
      disabled={pending}
      onClick={async () => {
        if (await ask(locked ? "Открыть книгу для правок клиентом? После правок перегенерируйте файлы." : "Закрыть книгу для правок?")) start(() => toggleBookLockAction(orderId));
      }}
    >
      {locked ? "Открыть книгу для правок" : "Закрыть книгу для правок"}
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
    <details className="group">
      <summary className="cursor-pointer text-sm text-wine hover:underline">Изменить контакты и доставку</summary>
      <form action={action} className="mt-4 grid gap-3 sm:grid-cols-2">
        <input type="hidden" name="orderId" value={order.id} />
        <label className="text-sm">
          <span className="label">Получатель</span>
          <input name="contactName" defaultValue={order.contactName} className="input h-10" required />
        </label>
        <label className="text-sm">
          <span className="label">Телефон</span>
          <input name="contactPhone" defaultValue={order.contactPhone} className="input h-10" required />
        </label>
        <label className="text-sm">
          <span className="label">E-mail</span>
          <input name="contactEmail" type="email" defaultValue={order.contactEmail} className="input h-10" required />
        </label>
        <label className="text-sm">
          <span className="label">Способ доставки</span>
          <select name="deliveryMethod" defaultValue={order.deliveryMethod ?? ""} className="input h-10">
            <option value="">—</option>
            {Object.entries(deliveryLabels).map(([id, label]) => (
              <option key={id} value={id}>
                {label}
              </option>
            ))}
          </select>
        </label>
        <label className="text-sm">
          <span className="label">Страна (только для доставки в другую страну)</span>
          <input name="country" defaultValue={order.deliveryCountry ?? ""} className="input h-10" placeholder="Казахстан — не указывать" />
        </label>
        <label className="text-sm">
          <span className="label">Город</span>
          <input name="city" defaultValue={order.city ?? ""} className="input h-10" />
        </label>
        <label className="text-sm">
          <span className="label">Индекс</span>
          <input name="postalCode" defaultValue={order.postalCode ?? ""} className="input h-10" />
        </label>
        <label className="text-sm sm:col-span-2">
          <span className="label">Адрес</span>
          <input name="address" defaultValue={order.address ?? ""} className="input h-10" />
        </label>
        <label className="text-sm">
          <span className="label">Нужна к дате</span>
          <input name="desiredDate" type="date" defaultValue={order.desiredDate ?? ""} className="input h-10" />
        </label>
        <label className="text-sm sm:col-span-2">
          <span className="label">Текст открытки</span>
          <textarea name="giftNote" defaultValue={order.giftNote ?? ""} rows={2} maxLength={500} className="input" />
        </label>
        {state.error ? <Alert className="sm:col-span-2">{state.error}</Alert> : null}
        {state.ok ? <Alert kind="success" className="sm:col-span-2">{state.ok}</Alert> : null}
        <div className="sm:col-span-2">
          <SubmitButton className="btn-sm">Сохранить изменения</SubmitButton>
        </div>
      </form>
    </details>
  );
}

export interface OrderMoneyRow {
  id: string;
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
}: {
  orderId: string;
  status: OrderStatus;
  due: number;
  received: number;
  postpay: boolean;
  settled: boolean;
  rows: OrderMoneyRow[];
  canEdit: boolean;
  canReview: boolean;
}) {
  const [pending, start] = useTransition();
  const [open, setOpen] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const router = useRouter();
  const outstanding = Math.max(0, due - received);
  const money = (n: number) => `${n.toLocaleString("ru-RU")} ₸`;
  const submit = (form: HTMLFormElement) =>
    start(async () => {
      setError(null);
      const res = await fetch(`/api/admin/orders/${orderId}/payments`, { method: "POST", body: new FormData(form) });
      const body = (await res.json().catch(() => ({}))) as { error?: string; message?: string; overpaid?: number };
      if (!res.ok) return setError(body.message ?? body.error ?? "Не удалось принять оплату");
      setOpen(false);
      if (body.overpaid) setError(`Получено больше, чем к оплате, на ${money(body.overpaid)} — ответственному поставлена задача «возврат или зачёт».`);
      router.refresh();
    });
  return (
    <div className="space-y-3 text-sm" data-testid="order-money">
      <dl className="space-y-1">
        <div className="flex justify-between"><dt className="text-muted">Получено</dt><dd className="font-semibold">{money(received)} из {money(due)}</dd></div>
        {outstanding && status !== "cancelled" ? <div className="flex justify-between text-amber-800"><dt>{postpay ? "Постоплата: ждём" : "Осталось получить"}</dt><dd>{money(outstanding)}</dd></div> : null}
        {settled && !rows.length && due > 0 ? <p className="rounded-lg bg-amber-50 px-2 py-1 text-xs text-amber-800">Оплата подтверждена без денег в журнале — прикрепите оплату с чеком.</p> : null}
      </dl>
      {rows.length ? (
        <ul className="space-y-1.5 border-t border-line pt-2 text-xs">
          {rows.map((r) => (
            <li key={r.id} className="flex flex-wrap items-baseline justify-between gap-x-2">
              <span>
                {methodLabels[r.method]} · {money(r.amount)} · {r.paidLabel}
                {r.ref ? ` · операция ${r.ref}` : ""}
                {r.by ? ` · ${r.by}` : ""}
                {r.note ? ` — ${r.note}` : ""}
              </span>
              <span className="flex gap-2">
                {r.receipt ? (
                  <a href={`/api/admin/order-payments/${r.id}/receipt`} target="_blank" rel="noopener noreferrer" className="underline">
                    чек
                  </a>
                ) : null}
                {r.method === "manual" ? (
                  r.reviewed ? (
                    <span className="text-emerald-700">проверено {r.reviewed}</span>
                  ) : canReview ? (
                    <button type="button" className="text-wine underline" disabled={pending} onClick={() => start(async () => void (await reviewOrderPaymentAction(r.id), router.refresh()))}>
                      проверено
                    </button>
                  ) : (
                    <span className="text-amber-700">не проверено</span>
                  )
                ) : null}
              </span>
            </li>
          ))}
        </ul>
      ) : null}
      {canEdit && status !== "cancelled" ? (
        <div className="flex flex-wrap gap-2">
          <button type="button" className="btn btn-sm" onClick={() => setOpen((v) => !v)}>
            Принять оплату
          </button>
          {status === "pending_payment" ? (
            <button
              type="button"
              className="btn btn-outline btn-sm"
              disabled={pending}
              onClick={() => {
                const reason = window.prompt("В печать без оплаты. О чём договорились с клиентом (когда и как заплатит)?");
                if (reason === null) return;
                start(async () => {
                  const r = await startPostpayAction(orderId, reason);
                  if (r.error) setError(r.error);
                  else router.refresh();
                });
              }}
            >
              В печать с постоплатой
            </button>
          ) : null}
        </div>
      ) : null}
      {open ? (
        <form
          className="space-y-2 rounded-xl border border-line p-3"
          onSubmit={(e) => {
            e.preventDefault();
            submit(e.currentTarget);
          }}
        >
          <div className="grid grid-cols-2 gap-2">
            <label className="block text-xs text-muted">
              Сумма, ₸
              <input name="amount" type="number" min={1} step={1} required defaultValue={outstanding || undefined} className="input mt-1 h-9 text-sm" />
            </label>
            <label className="block text-xs text-muted">
              Дата оплаты
              <input name="paidAt" type="date" className="input mt-1 h-9 text-sm" />
            </label>
          </div>
          <label className="block text-xs text-muted">
            Чек (скриншот, фото или PDF)
            <input name="file" type="file" accept="image/jpeg,image/png,image/webp,application/pdf" required className="mt-1 block w-full text-sm" />
          </label>
          <input name="note" maxLength={500} placeholder="Комментарий (необязательно)" className="input h-9 text-sm" />
          <button className="btn btn-sm" disabled={pending}>
            {pending ? <LoaderCircle className="size-4 animate-spin" /> : null} Записать оплату
          </button>
        </form>
      ) : null}
      {error ? <p className="text-xs text-red-700">{error}</p> : null}
    </div>
  );
}
