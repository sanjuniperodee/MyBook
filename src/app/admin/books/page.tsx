import { container } from "@/server/container";
import { cn } from "@/lib/class-names";
import { formatDate, nowMs } from "@/lib/dates";
import { getOccasion, parseDay } from "@/lib/occasions";
import { messagesFor } from "@/i18n/messages";

import Link from "next/link";
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

  return (
    <div className="space-y-5">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div>
          <h1 className="text-2xl font-semibold">Книги</h1>
          <p className="text-sm text-muted">Показано {rows.length}. Напоминания помогают вернуть тех, кто начал книгу и не закончил.</p>
        </div>
        {f === "stalled" || f === "ready" ? <RemindAll clientIds={remindable} /> : null}
      </div>
      <div className="flex flex-wrap gap-1.5">
        {(Object.keys(filters) as Filter[]).map((k) => (
          <Link key={k} href={link({ f: k })} className={cn("rounded-full px-3 py-1.5 text-sm", f === k ? "bg-ink text-white" : "bg-white text-ink-soft hover:bg-cream")}>
            {filters[k]}
          </Link>
        ))}
      </div>
      <form className="flex flex-wrap gap-2">
        <input type="hidden" name="f" value={f} />
        <input name="q" defaultValue={sp.q} placeholder="Название, имена, e-mail" className="input h-10 w-72 text-sm" />
        <select name="theme" defaultValue={sp.theme ?? ""} className="input h-10 w-52 text-sm">
          <option value="">Все темы</option>
          {themes.map((t) => (
            <option key={t.id} value={t.id}>
              {t.name}
            </option>
          ))}
        </select>
        <button className="btn btn-dark btn-sm h-10">Найти</button>
      </form>
      <ul className="space-y-2.5 lg:hidden" data-testid="books-cards">
        {rows.map((r) => {
          const idle = Math.floor((nowMs() - r.book.updatedAt.getTime()) / 86_400_000);
          return (
            <li key={r.book.id} className="rounded-2xl border border-line bg-white p-3.5 shadow-soft">
              <div className="flex items-start gap-3">
                <div className="min-w-0 flex-1">
                  <div className="truncate text-[16px] font-semibold">{r.book.title}</div>
                  <div className="truncate text-sm text-muted">
                    {bookLine({ theme: r.book.theme, themeShort: getTheme(r.book.theme).short, authorName: r.book.authorName, recipientName: r.book.recipientName })}
                  </div>
                  <Link href={`/admin/clients/${r.owner.id}`} className="block truncate text-sm text-ink-soft">
                    {r.owner.name || r.owner.email}
                  </Link>
                </div>
                <span className={cn("shrink-0 rounded-full px-2.5 py-1 text-xs", r.book.status === "draft" ? "bg-cream text-ink-soft" : "bg-emerald-100 text-emerald-800")}>{r.book.status === "draft" ? "Пишется" : "Заказана"}</span>
              </div>
              <div className="mt-2.5 flex items-center gap-2">
                <div className="h-1.5 flex-1 overflow-hidden rounded-full bg-cream">
                  <div className="h-full rounded-full bg-wine" style={{ width: `${progressRatio({ theme: r.book.theme, ...r }) * 100}%` }} />
                </div>
                <span className="text-xs text-muted tabular-nums">{progressShort({ theme: r.book.theme, ...r })}</span>
              </div>
              <div className="mt-2 flex items-center gap-3 text-xs">
                <span className={r.book.status === "draft" && idle >= STALLED_DAYS ? "text-red-700" : "text-muted"}>{idle <= 0 ? "сегодня" : `${idle} дн. назад`}</span>
                <span className="text-muted">{r.photos} фото</span>
                <Link href={`/books/${r.book.id}/preview`} className="ml-auto inline-flex min-h-10 items-center font-medium text-wine">
                  Макет
                </Link>
              </div>
            </li>
          );
        })}
        {rows.length === 0 ? <li className="rounded-2xl border border-dashed border-line bg-white px-4 py-10 text-center text-sm text-muted">Книг не найдено</li> : null}
      </ul>
      <div className="hidden overflow-x-auto rounded-2xl border border-line bg-white lg:block">
        <table className="w-full min-w-[900px] text-sm">
          <thead className="border-b border-line text-left text-muted">
            <tr>
              <th className="px-4 py-3 font-medium">Книга</th>
              <th className="px-3 py-3 font-medium">Автор</th>
              <th className="px-3 py-3 font-medium">Прогресс</th>
              <th className="px-3 py-3 font-medium">Изменена</th>
              <th className="px-3 py-3 font-medium">Статус</th>
              <th className="px-3 py-3" />
            </tr>
          </thead>
          <tbody className="divide-y divide-line">
            {rows.map((r) => {
              const idle = Math.floor((nowMs() - r.book.updatedAt.getTime()) / 86_400_000);
              return (
                <tr key={r.book.id} className="hover:bg-cream/40">
                  <td className="px-4 py-3">
                    <div className="font-medium">{r.book.title}</div>
                    <div className="text-xs text-muted">
                      {bookLine({ theme: r.book.theme, themeShort: getTheme(r.book.theme).short, authorName: r.book.authorName, recipientName: r.book.recipientName })}
                      {r.book.theme === "autobiography" && r.book.recordedBy ? ` · записано: ${r.book.recordedBy}` : ""}
                    </div>
                    {r.book.occasion && r.book.occasionDate ? (
                      <div className="mt-0.5 text-xs text-wine">
                        {ru.occasions[getOccasion(r.book.occasion)!.id].label} · {ru.date(parseDay(r.book.occasionDate))}
                      </div>
                    ) : null}
                  </td>
                  <td className="px-3 py-3">
                    <Link href={`/admin/clients/${r.owner.id}`} className="hover:text-wine hover:underline">
                      {r.owner.name || r.owner.email}
                    </Link>
                    <div className="text-xs text-muted">{r.owner.remindedAt ? `напоминали ${formatDate(r.owner.remindedAt)}` : r.owner.email}</div>
                  </td>
                  <td className="px-3 py-3">
                    <div className="flex items-center gap-2">
                      <div className="h-1.5 w-24 overflow-hidden rounded-full bg-cream">
                        <div className="h-full rounded-full bg-wine" style={{ width: `${progressRatio({ theme: r.book.theme, ...r }) * 100}%` }} />
                      </div>
                      <span className="text-xs text-muted tabular-nums" title={progressText({ theme: r.book.theme, ...r })}>
                        {progressShort({ theme: r.book.theme, ...r })}
                      </span>
                    </div>
                    <div className="text-xs text-muted">{r.photos} фото</div>
                  </td>
                  <td className={cn("px-3 py-3", r.book.status === "draft" && idle >= STALLED_DAYS ? "text-red-700" : "text-muted")}>{idle <= 0 ? "сегодня" : `${idle} дн. назад`}</td>
                  <td className="px-3 py-3">
                    <span className={cn("rounded-full px-2.5 py-1 text-xs", r.book.status === "draft" ? "bg-cream text-ink-soft" : "bg-emerald-100 text-emerald-800")}>{r.book.status === "draft" ? "Пишется" : "Заказана"}</span>
                  </td>
                  <td className="px-3 py-3 text-right">
                    <Link href={`/books/${r.book.id}/preview`} className="text-xs text-wine hover:underline">
                      Макет
                    </Link>
                  </td>
                </tr>
              );
            })}
          </tbody>
        </table>
        {rows.length === 0 ? <p className="py-10 text-center text-muted">Книг не найдено</p> : null}
      </div>
    </div>
  );
}
