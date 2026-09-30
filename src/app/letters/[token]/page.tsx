import type { Metadata } from "next";
import { notFound } from "next/navigation";
import { eq } from "drizzle-orm";
import { db } from "@/lib/db";
import { books } from "@/lib/db/schema";
import { Logo } from "@/components/Logo";
import { CoverPreview } from "@/components/cover/CoverPreview";
import { getCoverTemplate } from "@/lib/book/covers";
import { LetterForm } from "./LetterForm";
import { getMessages } from "@/i18n/server";
import { LanguageSwitch } from "@/components/LanguageSwitch";

export async function generateMetadata(): Promise<Metadata> {
  return { title: (await getMessages()).gift.letter.meta, robots: { index: false } };
}

export default async function LetterPage({ params }: { params: Promise<{ token: string }> }) {
  const { token } = await params;
  if (!/^[A-Za-z0-9_-]{10,40}$/.test(token)) notFound();
  const book = await db.query.books.findFirst({ where: eq(books.inviteToken, token) });
  if (!book) notFound();
  const t = (await getMessages()).gift.letter;
  const author = book.authorName.trim();
  const recipient = book.recipientName.trim();
  // Фото-обложку не показываем посторонним — только дизайнерский шаблон.
  const template = getCoverTemplate(book.coverTemplate).requiresPhoto ? "linen" : book.coverTemplate;

  return (
    <div className="min-h-dvh bg-[radial-gradient(60%_40%_at_50%_0%,#f4e4df,transparent)]">
      <header className="mx-auto flex max-w-3xl items-start justify-between gap-4 px-4 py-6 sm:px-6">
        <Logo variant="full" />
        <LanguageSwitch />
      </header>
      <main className="mx-auto max-w-3xl px-4 pb-20 sm:px-6">
        <div className="flex flex-col items-center gap-6 text-center sm:flex-row sm:text-left">
          <div className="w-28 shrink-0 rotate-[-4deg]">
            <CoverPreview template={template} format={book.format} title={book.title} lite className="rounded-[3px] shadow-book" />
          </div>
          <div>
            <div className="eyebrow">{t.invite}</div>
            <h1 className="mt-2 font-serif text-4xl leading-tight font-medium sm:text-5xl">
              {t.headline(author || t.author)}
            </h1>
            <p className="mt-3 text-lg text-muted">
              {t.text(recipient, book.title)}
            </p>
          </div>
        </div>
        <div className="mt-10">
          {book.status === "draft" ? (
            <LetterForm token={token} recipient={recipient} />
          ) : (
            <div className="card p-8 text-center text-muted">{t.closed}</div>
          )}
        </div>
      </main>
    </div>
  );
}
