import Link from "next/link";
import { MobileFilters } from "@/components/admin/MobileFilters";
import { CheckCheck, ListChecks, Search } from "lucide-react";
import { container } from "@/server/container";
import { can, requireStaff } from "@/server/access";
import { staffOptions } from "@/modules/access/ui";
import { PageHeader } from "@/components/admin/PageHeader";
import { Segmented } from "@/components/admin/Segmented";
import { EmptyState } from "@/components/ui/EmptyState";
import { cn } from "@/lib/class-names";
import { TaskRows } from "./TaskRows";
import { taskRow } from "./task-row";
import { NewTask } from "./NewTask";

export const metadata = { title: "Задачи" };

/**
 * Типы задач для фильтра. Своя копия подписей taskKinds: тот объект живёт в клиентском модуле CrmWidgets, и в серверном
 * компоненте вместо него приходит ссылка на клиентский модуль — без ключей (фильтр по типу молча не работал).
 */
const KINDS = { task: "Задача", call: "Позвонить", message: "Написать", meeting: "Встреча" } as const;

type Sp = { who?: string; done?: string; kind?: string; q?: string };

/**
 * Задачи — рабочий список дня: группы «Просрочено · Сегодня · Завтра · Позже · Без срока» с якорями (лента прилипает под
 * шапкой), в каждой — строки с галочкой, «+1 ч», «Завтра» и правкой на месте. Главное действие — «Новая задача» (диалог).
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

  return (
    <div className="flex max-w-6xl flex-col gap-5">
      <PageHeader title="Задачи" actions={<NewTask staff={staffList} />}>
        {showDone ? "Выполненные задачи: что сделали и когда." : "Звонки, сообщения и встречи по срокам."}
      </PageHeader>

      <MobileFilters active={filtered || showDone}>
        <div className="space-y-2">
          <div className="flex flex-wrap items-center gap-2">
            <Segmented
              label="Открытые или выполненные"
              items={[
                {
                  key: "open",
                  label: "Открытые",
                  href: href({ done: undefined }),
                  active: !showDone,
                },
                {
                  key: "done",
                  label: "Выполненные",
                  href: href({ done: "1" }),
                  active: showDone,
                },
              ]}
            />
            {seesAll ? (
              <>
                <Segmented
                  label="Чьи задачи"
                  items={[
                    {
                      key: "mine",
                      label: "Мои",
                      href: href({ who: undefined }),
                      active: who === "mine",
                    },
                    {
                      key: "all",
                      label: "Все",
                      href: href({ who: "all" }),
                      active: who === "all",
                    },
                  ]}
                />
                <form action="/admin/tasks" className="flex items-center gap-1.5">
                  {showDone ? <input type="hidden" name="done" value="1" /> : null}
                  {kind ? <input type="hidden" name="kind" value={kind} /> : null}
                  {q ? <input type="hidden" name="q" value={q} /> : null}
                  <select name="who" defaultValue={person} className={cn("input h-10 w-44 text-sm", person && "border-ink")} aria-label="Сотрудник">
                    <option value="" disabled>
                      Сотрудник…
                    </option>
                    {staffList.map((s) => (
                      <option key={s.id} value={s.id}>
                        {s.label}
                      </option>
                    ))}
                  </select>
                  <button className="btn btn-outline btn-sm h-10">Показать</button>
                </form>
              </>
            ) : null}
            <form action="/admin/tasks" className="flex min-w-56 flex-1 items-center gap-1.5 lg:ml-auto lg:max-w-72">
              {who !== "mine" ? <input type="hidden" name="who" value={who} /> : null}
              {showDone ? <input type="hidden" name="done" value="1" /> : null}
              {kind ? <input type="hidden" name="kind" value={kind} /> : null}
              <div className="relative flex-1">
                <Search className="pointer-events-none absolute top-1/2 left-3 size-4 -translate-y-1/2 text-muted" aria-hidden />
                <input name="q" defaultValue={q} placeholder="Задача, клиент, сделка" aria-label="Поиск задач: задача, клиент, сделка" className="input h-10 pl-9 text-sm" type="search" />
              </div>
            </form>
          </div>
          <div className="flex flex-wrap gap-1.5" role="group" aria-label="Тип задачи">
            <Link href={href({ kind: undefined })} aria-current={!kind ? "page" : undefined} className={cn("chip max-lg:h-10", !kind && "chip-on")}>
              Все типы
            </Link>
            {Object.entries(KINDS).map(([k, v]) => (
              <Link key={k} href={href({ kind: k })} aria-current={kind === k ? "page" : undefined} className={cn("chip max-lg:h-10", kind === k && "chip-on")}>
                {v}
              </Link>
            ))}
          </div>
        </div>
      </MobileFilters>

      {/* Якоря групп: прилипают под шапкой — до «Позже» не нужно листать весь список. */}
      {!showDone && shown.length > 1 ? (
        <nav aria-label="Группы задач" className="sticky top-[var(--topbar-h)] z-10 -mx-4 border-b border-line bg-canvas/90 px-4 py-2 backdrop-blur-md sm:-mx-6 sm:px-6 lg:mx-0 lg:px-0">
          <div className="m-hscroll flex gap-1.5">
            {groups.map((g) =>
              g.items.length ? (
                <a key={g.key} href={`#${g.key}`} className={cn("chip max-lg:h-10", g.key === "overdue" && "border-danger/30 bg-danger-bg text-danger hover:text-danger")}>
                  {g.title} <b className="font-semibold tabular-nums">{g.items.length}</b>
                </a>
              ) : null,
            )}
          </div>
        </nav>
      ) : null}

      {shown.map((g) => (
        <section key={g.key} id={g.key} aria-labelledby={`${g.key}-h`} className="panel scroll-mt-[calc(var(--topbar-h)+4rem)]">
          <header className="panel-head min-h-12 py-2.5">
            <h2 id={`${g.key}-h`} className={cn("panel-title flex items-center gap-2", g.key === "overdue" && "text-danger")}>
              {g.title}
              <span className={cn("badge tabular-nums", g.key === "overdue" && "badge-danger")}>{g.items.length}</span>
            </h2>
          </header>
          <div className="px-4 sm:px-5">
            <TaskRows tasks={g.items.map(toRow)} staff={staffList} canAssign={seesAll} />
          </div>
        </section>
      ))}

      {rows.length === 0 ? (
        <div className="panel">
          {filtered ? (
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
            <EmptyState icon={CheckCheck} title="Открытых задач нет" action={<NewTask staff={staffList} variant="outline" />}>
              Поставьте следующий шаг: позвонить, написать или встретиться с клиентом.
            </EmptyState>
          )}
        </div>
      ) : null}
      {rows.length >= 300 ? <p className="text-xs text-muted">Показаны первые 300 задач — уточните фильтр.</p> : null}
    </div>
  );
}
