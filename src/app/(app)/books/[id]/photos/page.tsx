import type { Metadata } from "next";
import { requireUser } from "@/lib/auth";
import { getAccessibleBook, getBookPhotos, getBookQuestions } from "@/lib/books";
import { applyGender } from "@/lib/content/gender";
import { PhotosManager } from "./PhotosManager";
import { getMessages } from "@/i18n/server";

export async function generateMetadata(): Promise<Metadata> {
  return { title: (await getMessages()).books.photos.meta };
}

export default async function PhotosPage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const user = await requireUser(`/books/${id}/photos`);
  const book = await getAccessibleBook(id, user);
  const [photos, questions, m] = await Promise.all([getBookPhotos(book.id), getBookQuestions(book.id), getMessages()]);
  const titles = new Map(questions.map((q) => [q.id, q.displayText ?? applyGender(q.title, book.authorGender, book.recipientGender)]));
  return (
    <main className="mx-auto max-w-6xl px-4 py-8 sm:px-6 sm:py-10">
      <div>
        <PhotosManager
          bookId={book.id}
          format={book.format}
          editable={book.status === "draft"}
          initial={photos.map((p) => ({ id: p.id, caption: p.caption, layout: p.layout, width: p.width, height: p.height, inAnswer: p.questionId ? (titles.get(p.questionId) ?? m.books.photos.answer) : null }))}
        />
      </div>
    </main>
  );
}
