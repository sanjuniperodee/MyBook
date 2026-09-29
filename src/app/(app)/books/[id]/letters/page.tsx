import type { Metadata } from "next";
import { asc, eq } from "drizzle-orm";
import { requireUser } from "@/lib/auth";
import { getAccessibleBook } from "@/lib/books";
import { db } from "@/lib/db";
import { bookLetters } from "@/lib/db/schema";
import { env } from "@/lib/env";
import { LettersManager } from "./LettersManager";

export const metadata: Metadata = { title: "Письма близких" };

export default async function LettersPage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const user = await requireUser(`/books/${id}/letters`);
  const book = await getAccessibleBook(id, user);
  const letters = await db.select().from(bookLetters).where(eq(bookLetters.bookId, book.id)).orderBy(asc(bookLetters.createdAt));
  return (
    <main className="mx-auto max-w-6xl px-4 py-8 sm:px-6 sm:py-10">
      <h1 className="mb-8 font-serif text-4xl font-medium sm:text-5xl">Письма близких</h1>
      <LettersManager
        bookId={book.id}
        initialToken={book.inviteToken}
        appUrl={env.appUrl}
        recipient={book.recipientName}
        editable={book.status === "draft"}
        initialLetters={letters.map((l) => ({ id: l.id, authorName: l.authorName, relation: l.relation, text: l.text, status: l.status, createdAt: l.createdAt.toISOString() }))}
      />
    </main>
  );
}
