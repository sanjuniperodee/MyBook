import Link from "next/link";
import { MobileFilters } from "@/components/admin/MobileFilters";
import { CheckCheck, ListChecks, Search } from "lucide-react";
import { container } from "@/server/container";
import { can, requireStaff } from "@/server/access";
import { staffOptions } from "@/modules/access/ui";
import { PageHeader } from "@/components/admin/PageHeader";
import { Segmented } from "@/components/admin/Segmented";
import { EmptyState } from "@/components/ui/EmptyState";
import { Badge } from "@/components/ui/Badge";
import { cn } from "@/lib/class-names";
import { TaskRows } from "./TaskRows";
import { taskRow } from "./task-row";
import { NewTask, QuickTask } from "./NewTask";

export const metadata = { title: "Задачи" };

/**
 * Типы задач для фильтра. Своя копия подписей taskKinds: тот объект живёт в клиентском модуле CrmWidgets, и в серверном
 * компоненте вместо него приходит ссылка на клиентский модуль — без ключей (фильтр по типу молча не работал).
 */
const KINDS = { task: "Задача", call: "Позвонить", message: "Написать", meeting: "Встреча" } as const;

type Sp = { who?: string; done?: string; kind?: string; q?: string };

/**
 * Задачи — «Очередь» (DESIGN.md §7.2): один лист, в нём группы «Просрочено · Сегодня · Завтра · Позже · Без срока» со
 * своими счётчиками и якорями-вкладками (лента прилипает под шапкой), сверху быстрый ввод новой задачи, в строке —
 * галочка, название, связанная запись, срок и ответственный. «Мои / Все», тип и поиск — одной строкой над очередью.
 */
export default async function TasksPage({ searchParams }: { searchParams: Promise<Sp> }) {
  const staff = await requireStaff();
  const me = staff.user;
  const sp = await searchParams;
  const seesAll = staff.scope === "all";
  const allTasks = can(staff, "tasks.all");
  const who = sp.who && seesAll ? sp.who : "mine";
  const showDone = sp.done === "1";
  const kind = sp.kind && sp.kind in KINDS ? sp.kind : "";
  const q = (sp.q ?? "").trim().slice(0, 100);
  const [rows, admins] = await Promise.all([container().reporting.taskList({ userId: me.id, seesAll }, { who, done: showDone, kind, q }), container().access.queries.allStaff()]);
  const staffList = staffOptions(admins);
  const now = new Date();
  const tomorrow = new Date(now);
  tomorrow.setHours(0, 0, 0, 0);
  tomorrow.setDate(tomorrow.getDate() + 1);
  const afterTomorrow = new Date(tomorrow);
  afterTomorrow.setDate(afterTomorrow.getDate() + 1);

  const toRow = (r: (typeof rows)[number]) => taskRow(r, { userId: me.id, allTasks }, now);
  const due = (r: (typeof rows)[number]) => r.task.dueAt;

  const groups = showDone
    ? [{ key: "done", title: "Выполненные", items: rows }]
    : [
        {
          key: "overdue",
          title: "Просрочено",
          items: rows.filter((r) => due(r) && due(r)! < now),
        },
        {
          key: "today",
          title: "Сегодня",
          items: rows.filter((r) => due(r) && due(r)! >= now && due(r)! < tomorrow),
        },
        {
          key: "tomorrow",
          title: "Завтра",
          items: rows.filter((r) => due(r) && due(r)! >= tomorrow && due(r)! < afterTomorrow),
        },
        {
          key: "later",
          title: "Позже",
          items: rows.filter((r) => due(r) && due(r)! >= afterTomorrow),
        },
        { key: "none", title: "Без срока", items: rows.filter((r) => !due(r)) },
      ];
  const shown = groups.filter((g) => g.items.length);

  const href = (p: Partial<Sp>) => {
    const next = {
      who: who === "mine" ? undefined : who,
      done: showDone ? "1" : undefined,
      kind: kind || undefined,
      q: q || undefined,
      ...p,
    };
    const qs = new URLSearchParams(Object.entries(next).filter((e): e is [string, string] => !!e[1]));
    return `/admin/tasks${qs.size ? `?${qs}` : ""}`;
  };
  const person = who !== "mine" && who !== "all" ? who : "";
  const filtered = !!q || !!kind || who !== "mine";

  const overdueCount = showDone ? 0 : groups[0].items.length;

  return (
    <div className="flex flex-col gap-4">
      <PageHeader
        title="Задачи"
        actions={<NewTask staff={staffList} />}
        meta={
          !showDone && rows.length ? (
            <span className="flex items-center gap-3 text-[13px] text-muted">
              <span className="tabular-nums">{rows.length} открытых</span>
              {overdueCount ? <Badge tone="danger">просрочено {overdueCount}</Badge> : null}
            </span>
          ) : null
        }
      >
        {showDone ? "Выполненные задачи: что сделали и когда." : "Звонки, сообщения и встречи по срокам: сверху то, что горит."}
      </PageHeader>

      <MobileFilters active={filtered || showDone}>
        <div className="flex flex-wrap items-center gap-x-2 gap-y-2" data-testid="tasks-toolbar">
          {seesAll ? (
            <Segmented
              label="Чьи задачи"
              items={[
                { key: "mine", label: "Мои", href: href({ who: undefined }), active: who === "mine" },
                { key: "all", label: "Все", href: href({ who: "all" }), active: who === "all" },
              ]}
            />
          ) : null}
          <Segmented
            label="Открытые или выполненные"
            items={[
              { key: "open", label: "Открытые", href: href({ done: undefined }), active: !showDone },
              { key: "done", label: "Выполненные", href: href({ done: "1" }), active: showDone },
            ]}
          />
          <Segmented
            label="Тип задачи"
            items={[
              { key: "all", label: "Все типы", href: href({ kind: undefined }), active: !kind },
              ...Object.entries(KINDS).map(([k, v]) => ({ key: k, label: v, href: href({ kind: k }), active: kind === k })),
            ]}
          />
          {seesAll ? (
            <form action="/admin/tasks" className="flex items-center gap-1.5">
              {showDone ? <input type="hidden" name="done" value="1" /> : null}
              {kind ? <input type="hidden" name="kind" value={kind} /> : null}
              {q ? <input type="hidden" name="q" value={q} /> : null}
              <select name="who" defaultValue={person} className={cn("input w-44", person && "border-ink")} aria-label="Сотрудник">
                <option value="" disabled>
                  Сотрудник…
                </option>
                {staffList.map((s) => (
                  <option key={s.id} value={s.id}>
                    {s.label}
                  </option>
                ))}
              </select>
              <button className="btn btn-outline">Показать</button>
            </form>
          ) : null}
          <form action="/admin/tasks" className="flex min-w-56 flex-1 items-center lg:ml-auto lg:max-w-72">
            {who !== "mine" ? <input type="hidden" name="who" value={who} /> : null}
            {showDone ? <input type="hidden" name="done" value="1" /> : null}
            {kind ? <input type="hidden" name="kind" value={kind} /> : null}
            <div className="relative flex-1">
              <Search className="pointer-events-none absolute top-1/2 left-3 size-4 -translate-y-1/2 text-muted" aria-hidden />
              <input name="q" defaultValue={q} placeholder="Задача, клиент, сделка" aria-label="Поиск задач: задача, клиент, сделка" className="input pl-9" type="search" />
            </div>
          </form>
        </div>
      </MobileFilters>

      <section className="panel" aria-label={showDone ? "Выполненные задачи" : "Очередь задач"}>
        {/* Якоря групп прилипают под шапкой: до «Позже» не нужно листать весь список. */}
        {!showDone && shown.length > 1 ? (
          <nav aria-label="Группы задач" className="tabs sticky top-[var(--topbar-h)] z-10 rounded-t-[var(--r-panel)] bg-white px-2 sm:px-3">
            {shown.map((g) => (
              <a key={g.key} href={`#${g.key}`} className="tab">
                {g.title}
                <span className={cn("count", g.key === "overdue" && "count-alert")}>{g.items.length}</span>
              </a>
            ))}
          </nav>
        ) : null}
        {!showDone ? <QuickTask /> : null}

        {shown.map((g) => (
          <section key={g.key} id={g.key} aria-labelledby={`${g.key}-h`} className="scroll-mt-[calc(var(--topbar-h)+3rem)]">
            <h2 id={`${g.key}-h`} className={cn("flex items-center gap-2 border-b border-line bg-sunken/60 px-4 py-1.5 text-[13px] font-semibold sm:px-5", g.key === "overdue" ? "text-danger" : "text-ink-soft")}>
              {g.title}
              <span className={cn("count", g.key === "overdue" && "count-alert")}>{g.items.length}</span>
            </h2>
            <TaskRows tasks={g.items.map(toRow)} staff={staffList} canAssign={seesAll} />
          </section>
        ))}

        {rows.length === 0 ? (
          filtered ? (
            <EmptyState
              icon={Search}
              title="По фильтру задач нет"
              action={
                <Link href={showDone ? "/admin/tasks?done=1" : "/admin/tasks"} className="btn btn-outline btn-sm">
                  Сбросить фильтры
                </Link>
              }
            >
              Измените тип, сотрудника или строку поиска.
            </EmptyState>
          ) : showDone ? (
            <EmptyState icon={ListChecks} title="Выполненных задач пока нет">
              Отмеченные задачи с итогом появятся здесь.
            </EmptyState>
          ) : (
            <EmptyState compact icon={CheckCheck} title="Открытых задач нет">
              Впишите следующий шаг в строке выше: позвонить, написать или встретиться с клиентом.
            </EmptyState>
          )
        ) : null}
      </section>
      {rows.length >= 300 ? <p className="text-xs text-muted">Показаны первые 300 задач — уточните фильтр.</p> : null}
    </div>
  );
}
