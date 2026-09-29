import type { Metadata } from "next";
import { requireUser } from "@/lib/auth";
import { getAccessibleBook, getBookPhotos, getBookQuestions } from "@/lib/books";
import { applyGender } from "@/lib/content/gender";
import { PhotosManager } from "./PhotosManager";

export const metadata: Metadata = { title: "Фотографии" };

export default async function PhotosPage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const user = await requireUser(`/books/${id}/photos`);
  const book = await getAccessibleBook(id, user);
  const [photos, questions] = await Promise.all([getBookPhotos(book.id), getBookQuestions(book.id)]);
  const titles = new Map(questions.map((q) => [q.id, q.displayText ?? applyGender(q.title, book.authorGender, book.recipientGender)]));
  return (
    <main className="mx-auto max-w-6xl px-4 py-8 sm:px-6 sm:py-10">
      <div>
        <PhotosManager
          bookId={book.id}
          format={book.format}
          editable={book.status === "draft"}
          initial={photos.map((p) => ({ id: p.id, caption: p.caption, layout: p.layout, width: p.width, height: p.height, inAnswer: p.questionId ? (titles.get(p.questionId) ?? "ответ") : null }))}
        />
      </div>
    </main>
  );
}
