import { booksId } from "@/lib/db/refs";
import { nowMs } from "@/lib/utils";
import { getOccasion, parseDay } from "@/lib/occasions";
import { messagesFor } from "@/i18n/messages";

import Link from "next/link";
import { and, desc, eq, ilike, lt, or, sql, type SQL } from "drizzle-orm";
import { db } from "@/lib/db";
import { bookQuestions, books, orders, photos, users } from "@/lib/db/schema";
import { getTheme, getThemes } from "@/lib/content/themes";
import { STALLED_DAYS } from "@/lib/crm-clients";
import { cn, formatDate } from "@/lib/utils";
import { RemindAll } from "./RemindAll";
import { requireStaff } from "@/lib/crm/rbac";

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
  await requireStaff("clients.view");
  const sp = await searchParams;
  const f = (sp.f && sp.f in filters ? sp.f : "all") as Filter;
  const answered = sql<number>`(select count(*)::int from ${bookQuestions} q where q.book_id = ${booksId} and length(trim(q.answer)) > 0)`;
  const total = sql<number>`(select count(*)::int from ${bookQuestions} q where q.book_id = ${booksId})`;
  const staleDate = new Date(nowMs() - STALLED_DAYS * 86_400_000);
  const w: SQL[] = [];
  if (f === "writing") w.push(eq(books.status, "draft"), sql`${books.updatedAt} >= ${staleDate}`);
  if (f === "stalled") w.push(eq(books.status, "draft"), lt(books.updatedAt, staleDate));
  if (f === "ready") w.push(eq(books.status, "draft"), sql`${answered} >= 30`);
  if (f === "ordered") w.push(eq(books.status, "ordered"));
  if (sp.theme && themes.some((t) => t.id === sp.theme)) w.push(eq(books.theme, sp.theme));
  if (sp.q?.trim()) {
    const s = `%${sp.q.trim()}%`;
    w.push(or(ilike(books.title, s), ilike(books.authorName, s), ilike(books.recipientName, s), ilike(users.email, s))!);
  }
  const rows = await db
    .select({
      book: books,
      owner: { id: users.id, email: users.email, name: users.name, remindedAt: users.remindedAt },
      answered,
      total,
      photos: sql<number>`(select count(*)::int from ${photos} p where p.book_id = ${booksId})`,
      hasOrder: sql<boolean>`exists (select 1 from ${orders} o where o.book_id = ${booksId} and o.status <> 'cancelled')`,
    })
    .from(books)
    .innerJoin(users, eq(books.userId, users.id))
    .where(w.length ? and(...w) : undefined)
    .orderBy(desc(books.updatedAt))
    .limit(200);
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
      <div className="overflow-x-auto rounded-2xl border border-line bg-white">
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
                      {getTheme(r.book.theme).short} · для {r.book.recipientName || "—"}
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
                        <div className="h-full rounded-full bg-wine" style={{ width: `${r.total ? (r.answered / r.total) * 100 : 0}%` }} />
                      </div>
                      <span className="text-xs text-muted tabular-nums">
                        {r.answered}/{r.total}
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
