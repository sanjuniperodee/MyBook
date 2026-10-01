"use client";

import { ask } from "@/components/ui/overlays";
import { useActionState, useTransition } from "react";
import { LoaderCircle, RefreshCw } from "lucide-react";
import { generateFilesAction, saveAdminNoteAction, toggleBookLockAction, updateOrderAction, updateOrderDetailsAction, type AdminState } from "../../actions";
import { SubmitButton } from "@/components/ui/SubmitButton";
import { Alert } from "@/components/ui/Alert";
import { orderStatusLabels } from "@/modules/ordering/ui/status";
import { ORDER_STATUSES as orderStatuses, type OrderStatus } from "@/modules/ordering/domain";

export function StatusForm({ orderId, status, trackingNumber }: { orderId: string; status: OrderStatus; trackingNumber: string | null }) {
  const [state, action] = useActionState<AdminState, FormData>(updateOrderAction, {});
  return (
    <form action={action} className="space-y-3">
      <input type="hidden" name="orderId" value={orderId} />
      <div>
        <label className="label">Статус</label>
        <select name="status" defaultValue={status} className="input h-11">
          {orderStatuses.map((s) => (
            <option key={s} value={s}>{orderStatusLabels[s]}</option>
          ))}
        </select>
      </div>
      <div>
        <label className="label">Трек-номер</label>
        <input name="trackingNumber" defaultValue={trackingNumber ?? ""} className="input h-11" maxLength={100} />
      </div>
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
  order: { id: string; contactName: string; contactPhone: string; contactEmail: string; deliveryMethod: string | null; city: string | null; address: string | null; postalCode: string | null; desiredDate: string | null; giftNote: string | null };
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
            <option value="courier">Курьер по городу</option>
            <option value="post">Доставка по Казахстану</option>
            <option value="pickup">Самовывоз</option>
          </select>
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
