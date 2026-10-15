import { formatDate } from "@/lib/dates";

/** Задача в карточке CRM — как её показывает TaskList. */
export interface TaskView {
  id: string;
  kind?: "call" | "message" | "meeting" | "task";
  title: string;
  dueLabel: string | null;
  overdue: boolean;
  done: boolean;
  assignee: string | null;
  context?: { label: string; href: string } | null;
}

/** Запись истории в карточке CRM — как её показывает NotesTimeline. */
export interface NoteView {
  id: string;
  kind: "note" | "call" | "message" | "email" | "system";
  text: string;
  author: string;
  dateLabel: string;
  orderLabel?: string | null;
}

interface TaskRow {
  id: string;
  kind?: string;
  title: string;
  dueAt: Date | null;
  doneAt: Date | null;
  assigneeId: string | null;
  orderId?: string | null;
}

interface NoteRow {
  id: string;
  kind: string;
  text: string;
  authorId: string | null;
  createdAt: Date;
  orderId?: string | null;
}

/** Задачи карточки. withTime — срок с временем (сделка); orders — номера заказов клиента для ссылки «заказ №…». */
export function taskViews(rows: TaskRow[], names: ReadonlyMap<string, string>, now: Date, opts: { withKind?: boolean; withTime?: boolean; orders?: ReadonlyMap<string, number> } = {}): TaskView[] {
  return rows.map((t) => ({
    id: t.id,
    ...(opts.withKind ? { kind: t.kind as TaskView["kind"] } : {}),
    title: t.title,
    dueLabel: t.dueAt ? `до ${formatDate(t.dueAt, opts.withTime)}` : null,
    overdue: !!t.dueAt && t.dueAt < now,
    done: !!t.doneAt,
    assignee: t.assigneeId ? (names.get(t.assigneeId) ?? null) : null,
    ...(opts.orders ? { context: t.orderId && opts.orders.has(t.orderId) ? { label: `заказ №${opts.orders.get(t.orderId)}`, href: `/admin/orders/${t.orderId}` } : null } : {}),
  }));
}

/** История карточки: автор (или «система»), дата со временем; orders — подпись «заказ №…». */
export function noteViews(rows: NoteRow[], names: ReadonlyMap<string, string>, opts: { orders?: ReadonlyMap<string, number> } = {}): NoteView[] {
  return rows.map((n) => ({
    id: n.id,
    kind: n.kind as NoteView["kind"],
    text: n.text,
    author: n.authorId ? (names.get(n.authorId) ?? "—") : "система",
    dateLabel: formatDate(n.createdAt, true),
    ...(opts.orders ? { orderLabel: n.orderId && opts.orders.has(n.orderId) ? `заказ №${opts.orders.get(n.orderId)}` : null } : {}),
  }));
}
