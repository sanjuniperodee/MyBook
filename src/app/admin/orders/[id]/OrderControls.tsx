"use client";

import { useActionState, useTransition } from "react";
import { LoaderCircle, RefreshCw } from "lucide-react";
import { generateFilesAction, saveAdminNoteAction, toggleBookLockAction, updateOrderAction, type AdminState } from "../../actions";
import { SubmitButton } from "@/components/ui/SubmitButton";
import { Alert } from "@/components/ui/Alert";
import { orderStatusLabels } from "@/lib/orders-shared";
import { orderStatuses, type OrderStatus } from "@/lib/db/schema";

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
      onClick={() => {
        if (confirm(locked ? "Открыть книгу для правок клиентом? После правок перегенерируйте файлы." : "Закрыть книгу для правок?")) start(() => toggleBookLockAction(orderId));
      }}
    >
      {locked ? "Открыть книгу для правок" : "Закрыть книгу для правок"}
    </button>
  );
}
