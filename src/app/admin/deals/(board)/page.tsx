import { container } from "@/server/container";
import { listFields } from "@/modules/workspace";
import { channelLabel, toAttribution } from "@/shared/domain/channels";
import Link from "next/link";
import { MobileFilters } from "@/components/admin/MobileFilters";
import { ChevronLeft, ChevronRight, Copy, Handshake, ListPlus, Plus, Search, SearchX, Settings2 } from "lucide-react";
import { can, canAssignOthers, requireStaff } from "@/server/access";
import { staffOptions } from "@/modules/access/ui";
import { staffLabel } from "@/shared/domain/staff";
import { dealSourceLabels, dealSources } from "@/shared/domain/dealSources";
import { formatPrice } from "@/config/site";
import { cn } from "@/lib/class-names";
import { formatDate, nowMs } from "@/lib/dates";
import { shortDate } from "../ui";
import { DealsBoard, type DealCard } from "../DealsBoard";
import { DealsTable, SavedViews } from "../DealsTable";
import { PageHeader } from "@/components/admin/PageHeader";
import { Segmented } from "@/components/admin/Segmented";
import { ActionMenu, MenuLink } from "@/components/admin/ActionMenu";
import { EmptyState } from "@/components/ui/EmptyState";
import { ruCount } from "@/i18n/plural";

export const metadata = { title: "Сделки" };
/** Сделок на странице списка; доска показывает до 1000 (закрытые — за 30 дней). */
const PAGE = 100;

export default async function DealsPage({ searchParams }: { searchParams: Promise<Record<string, string | undefined> & { mine?: string; a?: string; src?: string; q?: string; view?: string; p?: string }> }) {
  const staff = await requireStaff("deals.view");
  const sp = await searchParams;
  const pipelines = await container().sales.queries.listPipelines();
  const pipeline = pipelines.find((x) => x.id === sp.p) ?? pipelines[0];
  const selectFields = (await listFields("deal")).filter((f) => f.type === "select");
  const view = sp.view === "list" ? "list" : "board";
  const q = sp.q?.trim();
  const page = view === "list" ? Math.max(1, Math.floor(Number(sp.page)) || 1) : 1;
  const viewer = { userId: staff.user.id, seesAll: staff.scope === "all" };
  const [stages, rows, totals, admins, views] = await Promise.all([
    container().sales.queries.listStages(pipeline.id),
    container().reporting.dealList(viewer, pipeline, sp, selectFields, view, view === "list" ? { limit: PAGE, offset: (page - 1) * PAGE } : undefined),
    // Итоги шапки — отдельным запросом по тем же фильтрам: список обрезан страницей, доска — 1000 карточками.
    container().reporting.dealTotals(viewer, pipeline, sp, selectFields, view),
    container().access.queries.allStaff(),
    container().reporting.savedViews(staff.user.id),
  ]);
  const names = new Map(admins.map((a) => [a.id, staffLabel(a)]));
  const now = nowMs();
  const cards: DealCard[] = rows.map(({ deal, nextTask, unread, book, paid }) => ({
    id: deal.id,
    number: deal.number,
    title: deal.title,
    contactName: deal.contactName,
    stageId: deal.stageId,
    amount: deal.amount,
    paid,
    source: deal.utm ? channelLabel(toAttribution(deal.utm), deal.source) : dealSourceLabels[deal.source],
    assigneeId: deal.assigneeId,
    assigneeLabel: deal.assigneeId ? (names.get(deal.assigneeId) ?? null) : null,
    daysInStage: Math.floor((now - deal.stageChangedAt.getTime()) / 86_400_000),
    task: nextTask ? { overdue: new Date(nextTask).getTime() < now, label: shortDate(new Date(nextTask), now) } : null,
    unread,
    tags: deal.tags,
    unsorted: deal.unsorted,
    book,
    eventDate: typeof deal.customFields.event_date === "string" ? deal.customFields.event_date : null,
    repeat: deal.repeatCount,
  }));

  // Любая смена фильтра — с первой страницы; номер страницы меняет только пагинация.
  const params = (patch: Record<string, string | undefined>) => {
    const p = new URLSearchParams(Object.entries({ ...sp, page: undefined, ...patch }).filter(([, v]) => v) as [string, string][]);
    const s = p.toString();
    return s ? `/admin/deals?${s}` : "/admin/deals";
  };
  const currentQuery = new URLSearchParams(Object.entries(sp).filter(([k, v]) => v && /^(mine|a|src|q|view|p|task|stale|cf_[a-z0-9_]+)$/.test(k)) as [string, string][]).toString();
  const pages = Math.ceil(totals.total / PAGE);
  // Что сужает выборку (кроме вида и воронки): пустой результат с фильтром — «сбросить», без фильтра — «создать сделку».
  const filtered = Object.entries(sp).some(([k, v]) => v && /^(mine|a|src|q|task|stale|cf_[a-z0-9_]+)$/.test(k));
  const extraFilters = !!sp.src || selectFields.some((f) => sp[`cf_${f.key}`]);
  const settings = can(staff, "settings.manage");
  const canEdit = can(staff, "deals.edit");
  const reset = params({ mine: undefined, a: undefined, src: undefined, q: undefined, task: undefined, stale: undefined, ...Object.fromEntries(selectFields.map((f) => [`cf_${f.key}`, undefined])) });

  const filterChips = (
    <>
      <FilterChip href={params({ mine: undefined, a: undefined })} on={!sp.mine && !sp.a}>
        Все
      </FilterChip>
      <FilterChip href={params({ mine: "1", a: undefined })} on={sp.mine === "1"}>
        Мои
      </FilterChip>
      <FilterChip href={params({ mine: undefined, a: "none" })} on={sp.a === "none"}>
        Неразобранные
      </FilterChip>
      {canAssignOthers(staff)
        ? staffOptions(admins)
            .filter((a) => a.id !== staff.user.id)
            .map((a) => (
              <FilterChip key={a.id} href={params({ mine: undefined, a: a.id })} on={sp.a === a.id}>
                {a.label}
              </FilterChip>
            ))
        : null}
      <span className="mx-1 h-5 w-px shrink-0 bg-line" aria-hidden />
      {(
        [
          ["task", "none", "Без задачи", "У сделки нет запланированной задачи"],
          ["task", "overdue", "Просрочена задача", "Срок ближайшей задачи прошёл"],
          ["stale", "7", "Стоят > 7 дней", "Стоят на этапе больше 7 дней"],
        ] as const
      ).map(([k, v, label, hint]) => (
        <FilterChip key={k + v} href={params({ [k]: sp[k] === v ? undefined : v })} on={sp[k] === v} title={hint}>
          {label}
        </FilterChip>
      ))}
      {views.length || currentQuery ? <span className="mx-1 h-5 w-px shrink-0 bg-line" aria-hidden /> : null}
      <SavedViews
        views={views.map((v) => ({ id: v.id, name: v.name, query: v.query, mine: v.userId === staff.user.id, shared: v.shared }))}
        query={currentQuery}
        canShare={canAssignOthers(staff)}
      />
    </>
  );

  return (
    <div className="flex flex-col gap-4 lg:gap-5">
      <PageHeader
        title="Сделки"
        meta={
          <span className="text-sm text-muted tabular-nums" data-testid="deals-totals">
            {totals.open ? `${ruCount(totals.open, "сделка", "сделки", "сделок")} в работе на ${formatPrice(totals.openSum)}` : "в работе пока пусто"}
          </span>
        }
        actions={
          <>
            {settings || canEdit ? (
              <ActionMenu className="max-lg:order-last">
                {canEdit ? (
                  <MenuLink href="/admin/deals/duplicates" icon={<Copy />}>
                    Дубли сделок
                  </MenuLink>
                ) : null}
                {settings ? (
                  <MenuLink href={`/admin/deals/stages?p=${pipeline.id}`} icon={<Settings2 />}>
                    Этапы воронки
                  </MenuLink>
                ) : null}
                {settings ? (
                  <MenuLink href="/admin/deals/fields" icon={<ListPlus />}>
                    Свои поля
                  </MenuLink>
                ) : null}
              </ActionMenu>
            ) : null}
            {canEdit ? (
              <Link href={`/admin/deals/new?p=${pipeline.id}`} className="btn btn-primary btn-sm">
                <Plus className="size-4" aria-hidden /> Новая сделка
              </Link>
            ) : null}
          </>
        }
      />

      {/*
        Панель инструментов: на ноутбуке (≥1280) одна строка — вид и воронка, быстрые фильтры лентой, поиск. Уже — вид и поиск
        в первой строке, фильтры лентой во второй. Телефон: вид и кнопка «Фильтры» (за ней поиск и поля), лента чипов.
      */}
      <div className="flex flex-wrap items-center gap-x-3 gap-y-3 xl:flex-nowrap" role="toolbar" aria-label="Фильтры сделок">
        <div className="order-first flex min-w-0 flex-1 flex-wrap items-center gap-2 lg:flex-none">
          <Segmented
            label="Вид"
            className="max-lg:w-full max-lg:[&>a]:flex-1 max-lg:[&>a]:justify-center"
            items={[
              { key: "board", label: "Воронка", href: params({ view: undefined }), active: view === "board" },
              { key: "list", label: "Список", href: params({ view: "list" }), active: view === "list" },
            ]}
          />
          {pipelines.length > 1 ? (
            <div data-testid="pipelines" className="max-lg:w-full">
              <Segmented label="Воронки" className="max-lg:w-full" items={pipelines.map((x) => ({ key: x.id, label: x.name, href: x.id === pipelines[0].id ? params({ p: undefined }) : params({ p: x.id }), active: x.id === pipeline.id }))} />
            </div>
          ) : null}
        </div>

        <div className="m-hscroll no-scrollbar order-1 flex min-w-0 basis-full items-center gap-2 lg:order-last lg:overflow-x-auto xl:order-2 xl:basis-0 xl:flex-1" aria-label="Быстрые фильтры">
          {filterChips}
        </div>

        <form className="max-lg:contents lg:order-3 lg:ml-auto lg:flex lg:items-center lg:gap-2 xl:ml-0" action="/admin/deals" role="search">
          {sp.p ? <input type="hidden" name="p" value={sp.p} /> : null}
          {sp.mine ? <input type="hidden" name="mine" value={sp.mine} /> : null}
          {sp.a ? <input type="hidden" name="a" value={sp.a} /> : null}
          {sp.task ? <input type="hidden" name="task" value={sp.task} /> : null}
          {sp.stale ? <input type="hidden" name="stale" value={sp.stale} /> : null}
          {view === "list" ? <input type="hidden" name="view" value="list" /> : null}
          <MobileFilters compact active={extraFilters || !!q}>
            <div className="flex flex-col gap-2 max-lg:mt-1 lg:contents">
              <label className="relative min-w-0 lg:w-56">
                <Search className="pointer-events-none absolute top-1/2 left-3 size-4 -translate-y-1/2 text-muted" aria-hidden />
                <input name="q" defaultValue={q} type="search" placeholder="Имя, телефон, №" aria-label="Поиск сделок: имя, телефон, номер" className="input pl-9" />
              </label>
              {selectFields.map((f) => (
                <select key={f.key} name={`cf_${f.key}`} defaultValue={sp[`cf_${f.key}`] ?? ""} className="input lg:max-w-40" aria-label={f.label}>
                  <option value="">{f.label}: все</option>
                  {f.options.map((o) => (
                    <option key={o} value={o}>
                      {o}
                    </option>
                  ))}
                </select>
              ))}
              <select name="src" defaultValue={sp.src ?? ""} className="input lg:w-40" aria-label="Источник">
                <option value="">Все источники</option>
                {dealSources.map((s) => (
                  <option key={s} value={s}>
                    {dealSourceLabels[s]}
                  </option>
                ))}
              </select>
              <button className="btn btn-outline">Найти</button>
            </div>
          </MobileFilters>
        </form>
      </div>

      {view === "board" && cards.length === 0 ? (
        <div className="panel">
          {filtered ? (
            <EmptyState icon={SearchX} title="По этим фильтрам сделок нет" action={<Link href={reset} className="btn btn-outline btn-sm">Сбросить фильтры</Link>}>
              Измените поиск или ответственного — или сбросьте фильтры, чтобы увидеть всю воронку.
            </EmptyState>
          ) : (
            <EmptyState icon={Handshake} title="В воронке пока нет сделок" action={canEdit ? <Link href={`/admin/deals/new?p=${pipeline.id}`} className="btn btn-dark btn-sm"><Plus className="size-4" aria-hidden /> Новая сделка</Link> : undefined}>
              Заявки с сайта, из чатов и звонков появятся здесь сами. Сделку по договорённости заведите вручную.
            </EmptyState>
          )}
        </div>
      ) : view === "board" ? (
        <DealsBoard key={currentQuery} stages={stages.map((s) => ({ id: s.id, name: s.name, color: s.color, kind: s.kind }))} initial={cards} canEdit={canEdit} canDecide={can(staff, "deals.delete")} meId={staff.user.id} />
      ) : (
        <DealsTable
          rows={rows.map(({ deal, paid, nextTask, unread }) => {
            const st = stages.find((x) => x.id === deal.stageId);
            return {
              id: deal.id,
              number: deal.number,
              title: deal.title,
              contactName: deal.contactName,
              stage: { name: st?.name ?? "—", color: st?.color ?? "#9a8f86" },
              lostReason: deal.lostReason,
              channel: channelLabel(toAttribution(deal.utm), deal.source),
              campaign: deal.utm?.campaign ?? null,
              assignee: deal.assigneeId ? (names.get(deal.assigneeId) ?? null) : null,
              amount: deal.amount ? formatPrice(deal.amount) : "—",
              paid: paid ? formatPrice(paid) : null,
              created: formatDate(deal.createdAt),
              task: nextTask ? { overdue: new Date(nextTask).getTime() < now, label: shortDate(new Date(nextTask), now) } : null,
              closed: st ? st.kind !== "open" : false,
              unread,
            };
          })}
          stages={stages.map((x) => ({ id: x.id, name: x.name, kind: x.kind }))}
          staff={canAssignOthers(staff) ? staffOptions(admins) : staffOptions(admins).filter((a) => a.id === staff.user.id)}
          canEdit={canEdit}
          canDelete={can(staff, "deals.delete")}
          footer={
            <>
              <span className="text-muted tabular-nums">{pages > 1 ? `Сделки ${(page - 1) * PAGE + 1}–${(page - 1) * PAGE + rows.length} из ${totals.total}` : `Всего: ${ruCount(totals.total, "сделка", "сделки", "сделок")}`}</span>
              {pages > 1 ? (
                <nav className="flex items-center gap-2" data-testid="deals-pager" aria-label="Страницы">
                  {page > 1 ? (
                    <Link className="btn btn-outline btn-sm" href={params({ page: String(page - 1) })}>
                      <ChevronLeft className="size-4" aria-hidden /> Назад
                    </Link>
                  ) : null}
                  <span className="text-muted tabular-nums">
                    {page} из {pages}
                  </span>
                  {page < pages ? (
                    <Link className="btn btn-outline btn-sm" href={params({ page: String(page + 1) })}>
                      Дальше <ChevronRight className="size-4" aria-hidden />
                    </Link>
                  ) : null}
                </nav>
              ) : null}
            </>
          }
          empty={
            filtered ? (
              <EmptyState compact icon={SearchX} title="По этим фильтрам сделок нет" action={<Link href={reset} className="btn btn-outline btn-sm">Сбросить фильтры</Link>} />
            ) : (
              <EmptyState compact icon={Handshake} title="Сделок пока нет" action={canEdit ? <Link href={`/admin/deals/new?p=${pipeline.id}`} className="btn btn-dark btn-sm">Новая сделка</Link> : undefined}>
                Заявки с сайта, из чатов и звонков появятся здесь сами.
              </EmptyState>
            )
          }
        />
      )}
    </div>
  );
}

/** Чип-фильтр ссылкой: выбранный — тушью (aria-current), на телефоне выше — под палец. */
function FilterChip({ href, on, children, title }: { href: string; on: boolean; children: React.ReactNode; title?: string }) {
  return (
    <Link href={href} aria-current={on ? "true" : undefined} title={title} className={cn("chip max-lg:h-10", on && "chip-on")}>
      {children}
    </Link>
  );
}
