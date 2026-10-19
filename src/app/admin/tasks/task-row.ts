import { canManageTask } from "@/modules/clients/domain";
import { formatDate } from "@/lib/dates";
import { normalizePhone } from "@/shared/domain/phone";
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

/** Задача «Моего дня» с номером и тем, кто ведёт сделку, заказ или клиента, к которым она (reporting.myDay). */
export interface ReachableTask {
  task: Pick<ListedTask["task"], "dealId" | "orderId" | "clientId">;
  phone: string | null;
  dealAssigneeId: string | null;
  orderAssigneeId: string | null;
  clientManagerId: string | null;
}

/** Кто связывается: виден ли ему номер, может ли он работать с записью (canWork), подключена ли АТС и есть ли право писать. */
export interface Reacher {
  phoneVisible: boolean;
  works: (assigneeId: string | null) => boolean;
  pbx: boolean;
  chat: boolean;
}

/**
 * С кем и чем связаться по задаче. Цель — сделка, иначе заказ, иначе клиент: в том же порядке её находит сервер у
 * «Позвонить» и «Открыть чат», и он же разрешает их только тому, кто с целью работает (её ответственный или роль «все
 * записи»). Поэтому у роли «только свои» на неразобранной («ничья» задача бота) или чужой сделке этих кнопок нет —
 * «Позвонить» остаётся ссылкой tel:, а WhatsApp — wa.me, если номер сотруднику виден. null — задача ни к кому.
 */
export function taskContact(r: ReachableTask, who: Reacher): TaskRow["contact"] {
  const t = r.task;
  const to: [NonNullable<TaskRow["contact"]>["target"], string | null] | null = t.dealId
    ? [{ dealId: t.dealId }, r.dealAssigneeId]
    : t.orderId
      ? [{ orderId: t.orderId }, r.orderAssigneeId]
      : t.clientId
        ? [{ clientId: t.clientId }, r.clientManagerId]
        : null;
  if (!to) return null;
  const [target, assignee] = to;
  const digits = who.phoneVisible ? normalizePhone(r.phone) : "";
  const works = who.works(assignee);
  return { phone: digits.length >= 10 ? digits : null, target, pbx: who.pbx && works, chat: who.chat && works };
}
