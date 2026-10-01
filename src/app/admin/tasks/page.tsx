import Link from "next/link";
import { container } from "@/server/container";
import { requireStaff } from "@/server/access";
import { adminLabel, listAdmins, staffOptions } from "@/lib/crm";
import { TaskList, type TaskItem } from "@/components/admin/CrmWidgets";
import { cn, formatDate } from "@/lib/utils";

export const metadata = { title: "Задачи" };

export default async function TasksPage({ searchParams }: { searchParams: Promise<{ who?: string; done?: string }> }) {
  const staff = await requireStaff();
  const admin = staff.user;
  const sp = await searchParams;
  const who = sp.who === "all" ? "all" : "mine";
  const showDone = sp.done === "1";
  const [rows, admins] = await Promise.all([container().reporting.taskList({ userId: admin.id, seesAll: staff.scope === "all" }, { who, done: showDone }), listAdmins()]);
  const adminOptions = staffOptions(admins);
  const names = new Map(admins.map((a) => [a.id, adminLabel(a)]));
  const today = new Date();
  today.setHours(0, 0, 0, 0);
  const tomorrow = new Date(today.getTime() + 86_400_000);
  const toItem = (r: (typeof rows)[number]): TaskItem => ({
    id: r.task.id,
    title: r.task.title,
    dueLabel: r.task.dueAt ? `до ${formatDate(r.task.dueAt)}` : null,
    overdue: !!r.task.dueAt && r.task.dueAt < today,
    done: !!r.task.doneAt,
    assignee: r.task.assigneeId ? (names.get(r.task.assigneeId) ?? null) : null,
    context: r.task.orderId
      ? { label: `заказ №${r.orderNumber}`, href: `/admin/orders/${r.task.orderId}` }
      : r.task.clientId
        ? { label: r.clientName || r.clientEmail || "клиент", href: `/admin/clients/${r.task.clientId}` }
        : null,
  });
  const groups = showDone
    ? [{ title: "Выполненные", items: rows }]
    : [
        { title: "Просрочено", items: rows.filter((r) => r.task.dueAt && r.task.dueAt < today) },
        { title: "Сегодня", items: rows.filter((r) => r.task.dueAt && r.task.dueAt >= today && r.task.dueAt < tomorrow) },
        { title: "Позже", items: rows.filter((r) => r.task.dueAt && r.task.dueAt >= tomorrow) },
        { title: "Без срока", items: rows.filter((r) => !r.task.dueAt) },
      ];
  const tab = (label: string, href: string, active: boolean) => (
    <Link href={href} className={cn("rounded-full px-3 py-1.5 text-sm", active ? "bg-ink text-white" : "bg-white text-ink-soft hover:bg-cream")}>
      {label}
    </Link>
  );

  return (
    <div className="max-w-4xl space-y-5">
      <h1 className="text-2xl font-semibold">Задачи</h1>
      <div className="flex flex-wrap gap-1.5">
        {tab("Мои", `/admin/tasks${showDone ? "?done=1" : ""}`, who === "mine")}
        {tab("Все", `/admin/tasks?who=all${showDone ? "&done=1" : ""}`, who === "all")}
        <span className="mx-2 w-px bg-line" />
        {tab("Открытые", `/admin/tasks${who === "all" ? "?who=all" : ""}`, !showDone)}
        {tab("Выполненные", `/admin/tasks?done=1${who === "all" ? "&who=all" : ""}`, showDone)}
      </div>
      <section className="rounded-2xl border border-line bg-white p-5">
        <h2 className="mb-1 text-sm font-semibold">Новая задача</h2>
        <TaskList tasks={[]} admins={adminOptions} emptyText="" />
      </section>
      {groups.map((g) =>
        g.items.length ? (
          <section key={g.title} className="rounded-2xl border border-line bg-white px-5 py-3">
            <h2 className={cn("pt-2 text-sm font-semibold", g.title === "Просрочено" && "text-red-700")}>
              {g.title} · {g.items.length}
            </h2>
            <TaskList tasks={g.items.map(toItem)} admins={adminOptions} showForm={false} />
          </section>
        ) : null,
      )}
      {rows.length === 0 ? <p className="text-sm text-muted">{showDone ? "Выполненных задач пока нет." : "Открытых задач нет."}</p> : null}
    </div>
  );
}
