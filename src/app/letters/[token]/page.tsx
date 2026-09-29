import type { Metadata } from "next";
import { notFound } from "next/navigation";
import { eq } from "drizzle-orm";
import { db } from "@/lib/db";
import { books } from "@/lib/db/schema";
import { Logo } from "@/components/Logo";
import { CoverPreview } from "@/components/cover/CoverPreview";
import { getCoverTemplate } from "@/lib/book/covers";
import { LetterForm } from "./LetterForm";

export const metadata: Metadata = { title: "Письмо для книги", robots: { index: false } };

export default async function LetterPage({ params }: { params: Promise<{ token: string }> }) {
  const { token } = await params;
  if (!/^[A-Za-z0-9_-]{10,40}$/.test(token)) notFound();
  const book = await db.query.books.findFirst({ where: eq(books.inviteToken, token) });
  if (!book) notFound();
  const author = book.authorName.trim();
  const recipient = book.recipientName.trim();
  // Фото-обложку не показываем посторонним — только дизайнерский шаблон.
  const template = getCoverTemplate(book.coverTemplate).requiresPhoto ? "linen" : book.coverTemplate;

  return (
    <div className="min-h-dvh bg-[radial-gradient(60%_40%_at_50%_0%,#f4e4df,transparent)]">
      <header className="mx-auto max-w-3xl px-4 py-6 sm:px-6">
        <Logo />
      </header>
      <main className="mx-auto max-w-3xl px-4 pb-20 sm:px-6">
        <div className="flex flex-col items-center gap-6 text-center sm:flex-row sm:text-left">
          <div className="w-28 shrink-0 rotate-[-4deg]">
            <CoverPreview template={template} format={book.format} title={book.title} lite className="rounded-[3px] shadow-book" />
          </div>
          <div>
            <div className="eyebrow">Приглашение</div>
            <h1 className="mt-2 font-serif text-4xl leading-tight font-medium sm:text-5xl">
              {author || "Автор"} готовит книгу-сюрприз
            </h1>
            <p className="mt-3 text-lg text-muted">
              {recipient ? `Её получит ${recipient}. ` : ""}Напишите пару тёплых слов, общее воспоминание или пожелание — ваше письмо может войти в книгу «{book.title}» отдельной главой.
            </p>
          </div>
        </div>
        <div className="mt-10">
          {book.status === "draft" ? (
            <LetterForm token={token} recipient={recipient} />
          ) : (
            <div className="card p-8 text-center text-muted">Книга уже отправлена в печать — приём писем закрыт. Спасибо!</div>
          )}
        </div>
      </main>
    </div>
  );
}
