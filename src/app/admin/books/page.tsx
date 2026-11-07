import { container } from "@/server/container";
import { cn } from "@/lib/class-names";
import { formatDate, nowMs } from "@/lib/dates";
import { getOccasion, parseDay } from "@/lib/occasions";
import { messagesFor } from "@/i18n/messages";

import Link from "next/link";
import { BookOpen, Eye, Search } from "lucide-react";
import { PageHeader } from "@/components/admin/PageHeader";
import { Badge } from "@/components/ui/Badge";
import { EmptyState } from "@/components/ui/EmptyState";
import { getTheme, getThemes } from "@/lib/content/themes";
import { STALLED_DAYS } from "@/modules/reporting";
import { RemindAll } from "./RemindAll";
import { requireStaff, staffViewer } from "@/server/access";
import { bookLine, progressRatio, progressShort, progressText } from "@/lib/content/crm-labels";

const themes = getThemes("ru");

const ru = messagesFor("ru").common;

export const metadata = { title: "Книги" };

const filters = {
  all: "Все",
  writing: "Пишутся",
  stalled: `Заброшены (${STALLED_DAYS}+ дн.)`,
  ready: "Почти готовы",
  ordered: "Заказаны",
} as const;
type Filter = keyof typeof filters;

export default async function AdminBooks({ searchParams }: { searchParams: Promise<{ f?: string; q?: string; theme?: string }> }) {
  const staff = await requireStaff("clients.view");
  const sp = await searchParams;
  const f = (sp.f && sp.f in filters ? sp.f : "all") as Filter;
  const rows = await container().reporting.bookList(f, { q: sp.q, theme: sp.theme && themes.some((t) => t.id === sp.theme) ? sp.theme : undefined, staleDays: STALLED_DAYS, now: nowMs(), viewer: staffViewer(staff) });
  const remindable = [...new Set(rows.filter((r) => r.book.status === "draft" && !r.hasOrder).map((r) => r.owner.id))];
  const link = (patch: Record<string, string | undefined>) =>
    `/admin/books?${new URLSearchParams(Object.entries({ f, q: sp.q, theme: sp.theme, ...patch }).filter(([, v]) => v && v !== "all") as [string, string][])}`;

  const filteredBy = !!sp.q || !!sp.theme;

  return (
    <div className="flex flex-col gap-5">
      <PageHeader title="Книги" actions={f === "stalled" || f === "ready" ? <RemindAll clientIds={remindable} /> : null}>
        Найдено {rows.length}. Заброшенным и почти готовым книгам помогает напоминание автору.
      </PageHeader>

      <div className="space-y-3">
        <nav aria-label="Этап книги" className="m-hscroll flex flex-wrap gap-1.5">
          {(Object.keys(filters) as Filter[]).map((k) => (
            <Link key={k} href={link({ f: k })} aria-current={f === k ? "page" : undefined} className={cn("chip max-lg:h-10", f === k && "chip-on")}>
              {filters[k]}
            </Link>
          ))}
        </nav>
        <form className="panel grid gap-2 p-2.5 sm:grid-cols-[minmax(0,1fr)_14rem_auto]">
          <input type="hidden" name="f" value={f} />
          <div className="relative">
            <Search className="pointer-events-none absolute top-1/2 left-3 size-4 -translate-y-1/2 text-muted" aria-hidden />
            <input name="q" defaultValue={sp.q} placeholder="Название, имена, e-mail" aria-label="Поиск книг: название, имена, e-mail" type="search" className="input h-10 pl-9 text-sm" />
          </div>
          <select name="theme" defaultValue={sp.theme ?? ""} className="input h-10 text-sm" aria-label="Тема">
            <option value="">Все темы</option>
            {themes.map((t) => (
              <option key={t.id} value={t.id}>
                {t.name}
              </option>
            ))}
          </select>
          <div className="flex gap-2">
            <button className="btn btn-dark btn-sm h-10 flex-1 sm:flex-none">Найти</button>
            {filteredBy ? (
              <Link href={link({ q: undefined, theme: undefined })} className="btn btn-ghost btn-sm h-10">
                Сбросить
              </Link>
            ) : null}
          </div>
        </form>
      </div>

      {rows.length === 0 ? (
        <div className="panel">
          <EmptyState
            icon={BookOpen}
            title={filteredBy || f !== "all" ? "Книг по этому фильтру нет" : "Книг пока нет"}
            action={
              filteredBy || f !== "all" ? (
                <Link href="/admin/books" className="btn btn-outline btn-sm">
                  Показать все книги
                </Link>
              ) : null
            }
          >
            {filteredBy || f !== "all" ? "Измените этап, тему или строку поиска." : "Книги появятся, когда клиенты начнут их писать на сайте."}
          </EmptyState>
        </div>
      ) : (
        <>
          <ul className="panel divide-y divide-line overflow-hidden lg:hidden" data-testid="books-cards">
            {rows.map((r) => {
              const idle = Math.floor((nowMs() - r.book.updatedAt.getTime()) / 86_400_000);
              const stale = r.book.status === "draft" && idle >= STALLED_DAYS;
              return (
                <li key={r.book.id} className="px-4 py-3.5">
                  <div className="flex items-start gap-3">
                    <div className="min-w-0 flex-1">
                      <div className="truncate text-[15px] font-semibold">{r.book.title}</div>
                      <div className="truncate text-sm text-muted">
                        {bookLine({ theme: r.book.theme, themeShort: getTheme(r.book.theme).short, authorName: r.book.authorName, recipientName: r.book.recipientName })}
                      </div>
                      <Link href={`/admin/clients/${r.owner.id}`} className="block truncate text-sm text-wine">
                        {r.owner.name || r.owner.email}
                      </Link>
                    </div>
                    <BookStatus draft={r.book.status === "draft"} />
                  </div>
                  <div className="mt-2.5 flex items-center gap-2">
                    <Progress ratio={progressRatio({ theme: r.book.theme, ...r })} />
                    <span className="text-xs text-muted tabular-nums">{progressShort({ theme: r.book.theme, ...r })}</span>
                  </div>
                  <div className="mt-1 flex items-center gap-3 text-xs">
                    <span className={stale ? "font-medium text-danger" : "text-muted"}>{idle <= 0 ? "изменена сегодня" : `${idle} дн. без правок`}</span>
                    <span className="text-muted">{r.photos} фото</span>
                    <Link href={`/books/${r.book.id}/preview`} className="ml-auto inline-flex min-h-11 items-center gap-1 font-medium text-wine">
                      <Eye className="size-3.5" aria-hidden /> Макет
                    </Link>
                  </div>
                </li>
              );
            })}
          </ul>
          <div className="panel hidden overflow-x-auto lg:block">
            <table className="table min-w-[900px] [&_td:first-child]:pl-4 [&_td:last-child]:pr-4 [&_th:first-child]:pl-4 [&_th:last-child]:pr-4 sm:[&_td:first-child]:pl-5 sm:[&_th:first-child]:pl-5">
              <thead>
                <tr>
                  <th>Книга</th>
                  <th>Автор</th>
                  <th>Прогресс</th>
                  <th>Изменена</th>
                  <th>Статус</th>
                  <th>Сделка</th>
                  <th>
                    <span className="sr-only">Макет</span>
                  </th>
                </tr>
              </thead>
              <tbody>
                {rows.map((r) => {
                  const idle = Math.floor((nowMs() - r.book.updatedAt.getTime()) / 86_400_000);
                  const stale = r.book.status === "draft" && idle >= STALLED_DAYS;
                  return (
                    <tr key={r.book.id}>
                      <td className="max-w-80">
                        <div className="truncate font-medium">{r.book.title}</div>
                        <div className="truncate text-xs text-muted">
                          {bookLine({ theme: r.book.theme, themeShort: getTheme(r.book.theme).short, authorName: r.book.authorName, recipientName: r.book.recipientName })}
                          {r.book.theme === "autobiography" && r.book.recordedBy ? `, записано: ${r.book.recordedBy}` : ""}
                        </div>
                        {r.book.occasion && r.book.occasionDate ? (
                          <Badge tone="accent" className="mt-1">
                            {ru.occasions[getOccasion(r.book.occasion)!.id].label}, {ru.date(parseDay(r.book.occasionDate))}
                          </Badge>
                        ) : null}
                      </td>
                      <td className="max-w-56">
                        <Link href={`/admin/clients/${r.owner.id}`} className="block truncate hover:text-wine hover:underline">
                          {r.owner.name || r.owner.email}
                        </Link>
                        <div className="truncate text-xs text-muted">{r.owner.remindedAt ? `напоминали ${formatDate(r.owner.remindedAt)}` : r.owner.email}</div>
                      </td>
                      <td>
                        <div className="flex items-center gap-2">
                          <Progress ratio={progressRatio({ theme: r.book.theme, ...r })} className="w-24 flex-none" />
                          <span className="text-xs text-muted tabular-nums" title={progressText({ theme: r.book.theme, ...r })}>
                            {progressShort({ theme: r.book.theme, ...r })}
                          </span>
                        </div>
                        <div className="text-xs text-muted">{r.photos} фото</div>
                      </td>
                      <td className={cn("whitespace-nowrap", stale ? "font-medium text-danger" : "text-muted")}>{idle <= 0 ? "сегодня" : `${idle} дн. назад`}</td>
                      <td>
                        <BookStatus draft={r.book.status === "draft"} />
                      </td>
                      <td>
                        {r.deal ? (
                          <Link href={`/admin/deals/${r.deal.id}`} className="text-wine tabular-nums hover:underline">
                            №{r.deal.number}
                          </Link>
                        ) : (
                          <span className="text-muted">—</span>
                        )}
                      </td>
                      <td className="text-right">
                        <Link href={`/books/${r.book.id}/preview`} className="btn btn-ghost btn-sm">
                          <Eye className="size-4" aria-hidden /> Макет
                        </Link>
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
        </>
      )}
    </div>
  );
}

const BookStatus = ({ draft }: { draft: boolean }) => (draft ? <Badge dot>Пишется</Badge> : <Badge tone="success" dot>Заказана</Badge>);

/** Полоса прогресса книги: доля готового — винным. */
function Progress({ ratio, className }: { ratio: number; className?: string }) {
  return (
    <div className={cn("h-1.5 flex-1 overflow-hidden rounded-full bg-sunken", className)} role="presentation">
      <div className="h-full rounded-full bg-wine" style={{ width: `${Math.min(1, Math.max(0, ratio)) * 100}%` }} />
    </div>
  );
}
