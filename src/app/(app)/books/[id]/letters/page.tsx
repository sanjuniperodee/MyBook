import type { Metadata } from "next";
import { requireUser } from "@/server/auth";
import { getAccessibleBook } from "@/server/books";
import { container } from "@/server/container";
import { env } from "@/config/env";
import { bookKind } from "@/lib/content/kinds";
import { LettersManager } from "./LettersManager";
import { getMessages } from "@/i18n/server";

export async function generateMetadata(): Promise<Metadata> {
  return { title: (await getMessages()).books.letters.meta };
}

export default async function LettersPage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const user = await requireUser(`/books/${id}/letters`);
  const book = await getAccessibleBook(id, user);
  const m = await getMessages();
  const letters = await container().authoring.queries.letters(book.id);
  return (
    <main className="mx-auto max-w-7xl px-4 py-6 sm:px-6 sm:py-8">
      <header className="mb-5 max-w-2xl">
        <h1 className="font-serif text-[30px] leading-tight font-medium sm:text-[36px]">{m.books.letters.title}</h1>
        <p className="mt-1 text-[15px] leading-relaxed text-pretty text-muted">{m.bookStudio.letters.lead}</p>
      </header>
      <LettersManager
        bookId={book.id}
        initialToken={book.inviteToken}
        appUrl={env.appUrl}
        invitation={{ kind: bookKind(book.theme), author: book.authorName, title: book.title, recipient: book.recipientName, inviteText: book.inviteText }}
        bookLanguage={book.language}
        editable={book.status === "draft"}
        initialLetters={letters.map((l) => ({ id: l.id, authorName: l.authorName, relation: l.relation, text: l.text, status: l.status, createdAt: l.createdAt.toISOString() }))}
      />
    </main>
  );
}
