import { canManageTask } from "@/modules/clients/domain";
import { formatDate } from "@/lib/dates";
import type { TaskRow } from "./TaskRows";

/** Срок для поля «дата и время» — по времени магазина (сервер работает в TZ=Asia/Almaty). */
const localInput = (d: Date) => {
  const p = (n: number) => String(n).padStart(2, "0");
  return `${d.getFullYear()}-${p(d.getMonth() + 1)}-${p(d.getDate())}T${p(d.getHours())}:${p(d.getMinutes())}`;
};

/** Задача из выборки отчётов (taskList, myDay) с подписями того, к чему она: сделка, заказ, клиент. */
export interface ListedTask {
  task: {
    id: string;
    title: string;
    kind: TaskRow["kind"];
    dueAt: Date | null;
    doneAt: Date | null;
    assigneeId: string | null;
    createdById: string | null;
    remindBeforeMin: number | null;
    result: string | null;
    dealId: string | null;
    orderId: string | null;
    clientId: string | null;
  };
  clientName: string | null;
  clientEmail: string | null;
  orderNumber: number | null;
  dealTitle: string | null;
  dealContact: string | null;
  dealNumber: number | null;
}

/** Строка TaskRows для «Задач» и «Моего дня»: срок, просрочка, к чему задача, задача бота, можно ли менять. */
export function taskRow(r: ListedTask, viewer: { userId: string; allTasks: boolean }, now: Date): TaskRow {
  const t = r.task;
  const deal = t.dealId ? `сделка${r.dealNumber ? ` №${r.dealNumber}` : ""} · ${r.dealContact || r.dealTitle || "без имени"}` : null;
  return {
    id: t.id,
    title: t.title.replace(/\s*\(бот\)\s*$/, ""),
    kind: t.kind,
    due: t.dueAt ? localInput(t.dueAt) : "",
    dueLabel: t.dueAt ? `до ${formatDate(t.dueAt, true)}` : null,
    overdue: !!t.dueAt && t.dueAt < now,
    done: !!t.doneAt,
    doneLabel: t.doneAt ? formatDate(t.doneAt, true) : null,
    assigneeId: t.assigneeId,
    remindBeforeMin: t.remindBeforeMin,
    result: t.result ?? "",
    context: t.dealId
      ? { label: deal!, href: `/admin/deals/${t.dealId}` }
      : t.orderId
        ? { label: `заказ №${r.orderNumber}`, href: `/admin/orders/${t.orderId}` }
        : t.clientId
          ? { label: r.clientName || r.clientEmail || "клиент", href: `/admin/clients/${t.clientId}` }
          : null,
    fromBot: /\(бот\)\s*$/.test(t.title),
    editable: canManageTask(viewer, t),
  };
}
