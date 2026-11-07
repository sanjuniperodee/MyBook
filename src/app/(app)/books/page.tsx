import type { Metadata } from "next";
import { Link } from "@/i18n/client";
import { Plus } from "lucide-react";
import { requireUser } from "@/server/auth";
import { container } from "@/server/container";
import { getTheme } from "@/lib/content/themes";
import { BLANK_READY_WORDS, bookKind } from "@/lib/content/kinds";
import { formatDate, nowMs } from "@/lib/dates";
import { deadlineFor, getOccasion } from "@/lib/occasions";
import { getLocale, getMessages } from "@/i18n/server";
import { AgreementCard } from "@/components/AgreementCard";
import { isPrintedPlan } from "@/modules/ordering/ui/status";
import { PageHead } from "../_components/PageHead";
import { FirstBook, HeroBook, ShelfCard, type ShelfBook } from "./BooksShelf";

export async function generateMetadata(): Promise<Metadata> {
  return { title: (await getMessages()).books.list.meta };
}

/** Сколько книг «в работе» ищут следующий раздел без ответа: у остальных «Продолжить писать» ведёт в начало редактора. */
const NEXT_SECTION_LOOKUP = 6;

/**
 * Мои книги: главная — самая свежая из тех, что пишутся, — показана крупно: объёмная обложка, где книга на пути и одно
 * действие «Продолжить писать». Остальные книги — компактными листами ниже, заказанные — со статусом заказа и ссылкой на
 * него. Пустая полка — приглашение к первой книге.
 */
export default async function BooksPage() {
  const user = await requireUser("/books");
  const [rows, orders, locale, m, agreement] = await Promise.all([
    container().authoring.queries.userBooks(user.id),
    container().ordering.queries.userOrders(user.id),
    getLocale(),
    getMessages(),
    container().ordering.orders.agreementFor(user.id),
  ]);
  const card = agreement ? <AgreementCard agreement={agreement} books={rows.map((r) => ({ id: r.book.id, status: r.book.status, theme: r.book.theme, answered: r.answered, total: r.total, words: r.words }))} /> : null;
  const t = m.books.list;
  const now = new Date(nowMs());

  // Книги в работе — первыми (свежие выше), заказанные — после: «Продолжить писать» относится к первой.
  const sorted = [...rows].sort((a, b) => Number(a.book.status !== "draft") - Number(b.book.status !== "draft"));
  // Заказ книги для полки: последний, но отменённый не заслоняет действующий (список идёт от новых к старым).
  const lastOrder = new Map<string, (typeof orders)[number]>();
  for (const o of orders) {
    const seen = lastOrder.get(o.bookId);
    if (!seen || (seen.status === "cancelled" && o.status !== "cancelled")) lastOrder.set(o.bookId, o);
  }

  // Следующий раздел без ответа — как «Следующий вопрос» на странице книги; ищем только у начатых книг в работе.
  const nextSection = new Map<string, string>();
  await Promise.all(
    sorted
      .filter((r) => r.book.status === "draft" && r.answered > 0 && r.answered < r.total)
      .slice(0, NEXT_SECTION_LOOKUP)
      .map(async (r) => {
        const next = (await container().authoring.queries.questions(r.book.id)).find((q) => !q.answer.trim());
        if (next) nextSection.set(r.book.id, `/books/${r.book.id}/questions?s=${next.id}`);
      }),
  );

  const books: ShelfBook[] = sorted.map((row) => {
    const { book, answered, total, words } = row;
    const blank = bookKind(book.theme) === "blank";
    const ordered = book.status !== "draft";
    const occasion = getOccasion(book.occasion);
    const dl = !ordered && occasion && book.occasionDate ? deadlineFor(book.occasionDate, now) : null;
    const last = lastOrder.get(book.id);
    return {
      row,
      kind: getTheme(book.theme, locale).name,
      blank,
      // Своя книга измеряется не ответами на вопросы, а объёмом: полоса — путь к «почти готовой» книге.
      progress: blank ? Math.min(100, Math.round((words / BLANK_READY_WORDS) * 100)) : total ? Math.round((answered / total) * 100) : 0,
      order: last ? { id: last.id, number: last.number, status: last.status, printed: isPrintedPlan(last.plan) } : null,
      ordered,
      writeHref: nextSection.get(book.id) ?? `/books/${book.id}/questions`,
      deadline:
        dl && occasion && dl.state !== "past"
          ? {
              text: m.common.deadline.chip(m.common.occasions[occasion.id].label, dl.daysToTarget) + (dl.state === "relaxed" || dl.state === "soon" || dl.state === "urgent" ? m.common.deadline.chipOrderBy(dl.orderBy) : ""),
              tone: dl.state === "relaxed" ? "calm" : dl.state === "soon" ? "warm" : "hot",
            }
          : null,
      updated: t.updated(formatDate(book.updatedAt, false, locale)),
    };
  });

  if (books.length === 0) {
    return (
      <main className="mx-auto max-w-6xl px-4 py-8 sm:px-6 sm:py-14">
        {card ? <div className="mb-10">{card}</div> : null}
        <FirstBook name={user.name} m={m} />
      </main>
    );
  }

  const [hero, ...rest] = books;
  return (
    <main className="mx-auto max-w-6xl px-4 py-8 sm:px-6 sm:py-12">
      {card ? <div className="mb-8">{card}</div> : null}
      <PageHead
        title={t.title}
        lead={t.autosave}
        actions={
          <Link href="/books/new" className="btn btn-outline">
            <Plus className="size-4" aria-hidden /> {t.newBook}
          </Link>
        }
      />

      <div className="mt-8 sm:mt-12">
        <HeroBook b={hero} m={m} locale={locale} />
      </div>

      {rest.length ? (
        <section aria-labelledby="shelf" className="mt-14 border-t border-line pt-8 sm:mt-20">
          <h2 id="shelf" className="text-[15px] font-semibold">
            {t.shelf}
          </h2>
          <ul className="mt-5 grid gap-4 md:grid-cols-2">
            {rest.map((b) => (
              <ShelfCard key={b.row.book.id} b={b} m={m} locale={locale} />
            ))}
          </ul>
        </section>
      ) : null}
    </main>
  );
}
