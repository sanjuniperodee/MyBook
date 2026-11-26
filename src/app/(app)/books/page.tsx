import type { Metadata } from "next";
import { Link } from "@/i18n/client";
import { Plus } from "lucide-react";
import { requireUser } from "@/web/auth";
import { getLocale, getMessages } from "@/i18n/server";
import { AgreementCard } from "@/components/AgreementCard";
import { PageHead } from "../_components/PageHead";
import { v1WebRead } from "@/web/api";
import { FirstBook, HeroBook, ShelfCard } from "./BooksShelf";

export async function generateMetadata(): Promise<Metadata> {
  return { title: (await getMessages()).books.list.meta };
}

/**
 * Мои книги: главная — самая свежая из тех, что пишутся, — показана крупно: объёмная обложка, где книга на пути и одно
 * действие «Продолжить писать». Остальные книги — компактными листами ниже, заказанные — со статусом заказа и ссылкой на
 * него. Пустая полка — приглашение к первой книге.
 */
export default async function BooksPage() {
  const user = await requireUser("/books");
  const [locale, m] = await Promise.all([getLocale(), getMessages()]);
  const { books, agreement, agreementBooks } = await v1WebRead({
    name: "cabinet.booksPage",
    section: "cabinet",
    locale,
    viaApi: (api) => api.webShelf({ locale }),
  });
  const card = agreement ? <AgreementCard agreement={agreement} books={agreementBooks} /> : null;
  const t = m.books.list;

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
    <main className="mx-auto max-w-6xl px-4 py-6 sm:px-6 sm:py-12">
      {card ? <div className="mb-8">{card}</div> : null}
      {/* На телефоне название раздела — в шапке, а «Новая книга» — под книгой: первый экран отдан книге и её действию. */}
      <PageHead
        title={t.title}
        lead={<span className="max-md:hidden">{t.autosave}</span>}
        actions={
          <Link href="/books/new" className="btn btn-outline max-md:hidden">
            <Plus className="size-4" aria-hidden /> {t.newBook}
          </Link>
        }
      />

      <div className="md:mt-12">
        <HeroBook b={hero} m={m} />
      </div>
      <Link href="/books/new" className="btn btn-outline mt-4 w-full border-dashed md:hidden">
        <Plus className="size-4" aria-hidden /> {t.newBook}
      </Link>

      {rest.length ? (
        <section aria-labelledby="shelf" className="mt-14 border-t border-line pt-8 sm:mt-20">
          <h2 id="shelf" className="text-[15px] font-semibold">
            {t.shelf}
          </h2>
          <ul className="mt-5 grid gap-4 md:grid-cols-2">
            {rest.map((b) => (
              <ShelfCard key={b.row.book.id} b={b} m={m} />
            ))}
          </ul>
        </section>
      ) : null}
    </main>
  );
}
