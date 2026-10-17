import Link from "next/link";
import { Search } from "lucide-react";
import { container } from "@/server/container";
import { can, requireStaff } from "@/server/access";
import { staffOptions } from "@/modules/access/ui";
import { canManageTask } from "@/modules/clients/domain";
import { TaskList, taskKinds } from "@/components/admin/CrmWidgets";
import { cn } from "@/lib/class-names";
import { formatDate } from "@/lib/dates";
import { TaskRows, type TaskRow } from "./TaskRows";

export const metadata = { title: "Задачи" };

type Sp = { who?: string; done?: string; kind?: string; q?: string };

/** Срок для поля «дата и время» — по времени магазина (сервер работает в TZ=Asia/Almaty). */
const localInput = (d: Date) => {
  const p = (n: number) => String(n).padStart(2, "0");
  return `${d.getFullYear()}-${p(d.getMonth() + 1)}-${p(d.getDate())}T${p(d.getHours())}:${p(d.getMinutes())}`;
};

export default async function TasksPage({ searchParams }: { searchParams: Promise<Sp> }) {
  const staff = await requireStaff();
  const me = staff.user;
  const sp = await searchParams;
  const seesAll = staff.scope === "all";
  const allTasks = can(staff, "tasks.all");
  const who = sp.who && seesAll ? sp.who : "mine";
  const showDone = sp.done === "1";
  const kind = sp.kind && sp.kind in taskKinds ? sp.kind : "";
  const q = (sp.q ?? "").trim().slice(0, 100);
  const [rows, admins] = await Promise.all([
    container().reporting.taskList({ userId: me.id, seesAll }, { who, done: showDone, kind, q }),
    container().access.queries.allStaff(),
  ]);
  const staffList = staffOptions(admins);
  const now = new Date();
  const tomorrow = new Date(now);
  tomorrow.setHours(0, 0, 0, 0);
  tomorrow.setDate(tomorrow.getDate() + 1);

  const toRow = (r: (typeof rows)[number]): TaskRow => {
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
      editable: canManageTask({ userId: me.id, allTasks }, t),
    };
  };

  const groups = showDone
    ? [{ key: "done", title: "Выполненные", tone: "", items: rows }]
    : [
        { key: "overdue", title: "Просрочено", tone: "text-red-700", items: rows.filter((r) => r.task.dueAt && r.task.dueAt < now) },
        { key: "today", title: "Сегодня", tone: "", items: rows.filter((r) => r.task.dueAt && r.task.dueAt >= now && r.task.dueAt < tomorrow) },
        { key: "later", title: "Позже", tone: "", items: rows.filter((r) => r.task.dueAt && r.task.dueAt >= tomorrow) },
        { key: "none", title: "Без срока", tone: "", items: rows.filter((r) => !r.task.dueAt) },
      ];

  const href = (p: Partial<Sp>) => {
    const next = { who: who === "mine" ? undefined : who, done: showDone ? "1" : undefined, kind: kind || undefined, q: q || undefined, ...p };
    const qs = new URLSearchParams(Object.entries(next).filter((e): e is [string, string] => !!e[1]));
    return `/admin/tasks${qs.size ? `?${qs}` : ""}`;
  };
  const chip = (label: string, to: string, active: boolean) => (
    <Link href={to} className={cn("rounded-full px-3 py-1.5 text-sm", active ? "bg-ink text-white" : "bg-white text-ink-soft hover:bg-cream")}>
      {label}
    </Link>
  );
  const person = who !== "mine" && who !== "all" ? who : "";

  return (
    <div className="max-w-5xl space-y-4">
      <div className="flex flex-wrap items-end justify-between gap-3">
        <h1 className="text-2xl font-semibold">Задачи</h1>
        {!showDone ? (
          <div className="flex flex-wrap gap-2 text-sm">
            {groups.map((g) => (
              <a key={g.key} href={`#${g.key}`} className={cn("rounded-xl border border-line bg-white px-3 py-1.5", g.key === "overdue" && g.items.length && "border-red-200 bg-red-50 text-red-700")}>
                {g.title} <b>{g.items.length}</b>
              </a>
            ))}
          </div>
        ) : null}
      </div>

      <div className="space-y-2 rounded-2xl border border-line bg-white p-3">
        <div className="flex flex-wrap items-center gap-1.5">
          {chip("Мои", href({ who: undefined }), who === "mine")}
          {seesAll ? chip("Все", href({ who: "all" }), who === "all") : null}
          {seesAll ? (
            <form action="/admin/tasks" className="flex items-center gap-1.5">
              {showDone ? <input type="hidden" name="done" value="1" /> : null}
              {kind ? <input type="hidden" name="kind" value={kind} /> : null}
              {q ? <input type="hidden" name="q" value={q} /> : null}
              <select name="who" defaultValue={person} className={cn("input h-9 w-44 text-sm", person && "border-ink")} aria-label="Сотрудник">
                <option value="" disabled>
                  Сотрудник…
                </option>
                {staffList.map((s) => (
                  <option key={s.id} value={s.id}>
                    {s.label}
                  </option>
                ))}
              </select>
              <button className="btn btn-outline btn-sm h-9">Показать</button>
            </form>
          ) : null}
          <span className="mx-1 h-6 w-px bg-line" />
          {chip("Открытые", href({ done: undefined }), !showDone)}
          {chip("Выполненные", href({ done: "1" }), showDone)}
        </div>
        <div className="flex flex-wrap items-center gap-1.5">
          {chip("Все типы", href({ kind: undefined }), !kind)}
          {Object.entries(taskKinds).map(([k, v]) => (
            <span key={k}>{chip(v, href({ kind: k }), kind === k)}</span>
          ))}
          <form action="/admin/tasks" className="ml-auto flex items-center gap-1.5">
            {who !== "mine" ? <input type="hidden" name="who" value={who} /> : null}
            {showDone ? <input type="hidden" name="done" value="1" /> : null}
            {kind ? <input type="hidden" name="kind" value={kind} /> : null}
            <div className="relative">
              <Search className="pointer-events-none absolute top-1/2 left-2.5 size-4 -translate-y-1/2 text-muted" />
              <input name="q" defaultValue={q} placeholder="Задача, клиент, сделка" className="input h-9 w-64 pl-8 text-sm" />
            </div>
          </form>
        </div>
      </div>

      <details className="group rounded-2xl border border-line bg-white px-5 py-3" open={rows.length === 0 && !showDone && !q}>
        <summary className="cursor-pointer text-sm font-semibold">+ Новая задача</summary>
        <div className="mt-1">
          <TaskList tasks={[]} admins={staffList} emptyText="" />
        </div>
      </details>

      {groups.map((g) =>
        g.items.length ? (
          <section key={g.key} id={g.key} className="scroll-mt-4 rounded-2xl border border-line bg-white px-5 py-3">
            <h2 className={cn("pt-1 text-sm font-semibold", g.tone)}>
              {g.title} · {g.items.length}
            </h2>
            <TaskRows tasks={g.items.map(toRow)} staff={staffList} canAssign={seesAll} />
          </section>
        ) : null,
      )}
      {rows.length === 0 ? <p className="text-sm text-muted">{q || kind ? "По фильтру задач нет." : showDone ? "Выполненных задач пока нет." : "Открытых задач нет."}</p> : null}
      {rows.length >= 300 ? <p className="text-xs text-muted">Показаны первые 300 задач — уточните фильтр.</p> : null}
    </div>
  );
}
