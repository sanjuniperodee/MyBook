import Link from "next/link";
import { Archive, CalendarDays, ChevronRight, Lock, Users } from "lucide-react";
import { can, requireStaff } from "@/web/access";
import { PageHeader } from "@/components/admin/PageHeader";
import { EmptyState } from "@/components/ui/EmptyState";
import { BOARD_COLORS, isBoardColor } from "@/shared/domain/boards";
import { NewBoard } from "./NewBoard";
import { RestoreBoard } from "./RestoreBoard";
import { crmRead } from "@/web/crm";

export const metadata = { title: "Доски" };

const GROUPS = [
  { kind: "team", title: "Отделы", hint: "Общие доски: продажи, производство, поддержка" },
  { kind: "project", title: "Проекты", hint: "Запуски, кампании, улучшения" },
  { kind: "personal", title: "Личные", hint: "Видите только вы и те, кого пригласите" },
] as const;

/** Доски задач — список по группам (отделы, проекты, личные): открыть, создать по шаблону, архив. */
export default async function BoardsPage({ searchParams }: { searchParams: Promise<{ archived?: string }> }) {
  const staff = await requireStaff();
  const archived = (await searchParams).archived === "1";
  const { boards, templates } = await crmRead("pages.boards", { archived });
  return (
    <div className="flex flex-col gap-5">
      <PageHeader
        title={archived ? "Доски в архиве" : "Доски"}
        back={archived ? { href: "/admin/tasks/boards", label: "Доски" } : undefined}
        actions={
          archived ? null : (
            <div className="flex items-center gap-2">
              <Link href="/admin/tasks/calendar" className="btn btn-outline">
                <CalendarDays className="size-4" aria-hidden /> Календарь
              </Link>
              <NewBoard templates={templates} canTeam={can(staff, "boards.manage")} />
            </div>
          )
        }
      >
        {archived ? "Верните доску — карточки снова появятся на ней." : "Задачи отделов, проектов и свои — колонками, как в Trello. Задачи из сделок и правил CRM — на доске «Продажи»."}
      </PageHeader>

      {!boards.length ? (
        <EmptyState icon={Archive} title={archived ? "В архиве пусто" : "Досок пока нет"}>
          {archived ? "Убранные в архив доски появятся здесь." : "Создайте первую доску по шаблону."}
        </EmptyState>
      ) : archived ? (
        <section className="panel divide-y divide-line">
          {boards.map((b) => (
            <div key={b.id} className="flex items-center gap-3 px-4 py-3">
              <span className="size-3 rounded-[4px]" style={{ background: isBoardColor(b.color) ? BOARD_COLORS[b.color] : BOARD_COLORS.slate }} aria-hidden />
              <span className="flex-1 font-medium">{b.name}</span>
              {b.canManage ? <RestoreBoard id={b.id} /> : null}
            </div>
          ))}
        </section>
      ) : (
        GROUPS.map((g) => {
          const list = boards.filter((b) => b.kind === g.kind);
          if (!list.length) return null;
          return (
            <section key={g.kind} aria-labelledby={`g-${g.kind}`}>
              <h2 id={`g-${g.kind}`} className="mb-2 flex items-baseline gap-2 text-[15px] font-semibold">
                {g.title} <span className="text-xs font-normal text-muted">{g.hint}</span>
              </h2>
              <ul className="panel divide-y divide-line">
                {list.map((b) => (
                  <li key={b.id}>
                    <Link href={`/admin/tasks/boards/${b.id}`} className="flex items-center gap-3 px-4 py-3 transition-colors hover:bg-sunken/60 max-lg:min-h-14">
                      <span className="flex size-9 shrink-0 items-center justify-center rounded-[var(--r-ctl)] text-sm font-semibold text-white" style={{ background: isBoardColor(b.color) ? BOARD_COLORS[b.color] : BOARD_COLORS.slate }} aria-hidden>
                        {b.name.slice(0, 1).toUpperCase()}
                      </span>
                      <span className="min-w-0 flex-1">
                        <span className="flex items-center gap-1.5 font-medium">
                          {b.name}
                          {b.visibility === "members" ? <Lock className="size-3.5 text-muted" aria-label="Видят участники" /> : <Users className="size-3.5 text-muted" aria-label="Видят все" />}
                          {b.isDefault ? <span className="text-xs font-normal text-muted">· задачи из сделок</span> : null}
                        </span>
                        {b.description ? <span className="block truncate text-xs text-muted">{b.description}</span> : null}
                      </span>
                      <span className="shrink-0 text-right text-xs text-muted tabular-nums">
                        <b className="block text-[15px] font-semibold text-ink">{b.openCards ?? 0}</b>
                        открытых
                      </span>
                      <ChevronRight className="size-4 shrink-0 text-muted" aria-hidden />
                    </Link>
                  </li>
                ))}
              </ul>
            </section>
          );
        })
      )}
      {!archived ? (
        <Link href="/admin/tasks/boards?archived=1" className="self-start text-[13px] text-muted hover:text-ink hover:underline">
          <Archive className="mr-1 inline size-3.5" aria-hidden /> Доски в архиве
        </Link>
      ) : null}
    </div>
  );
}
