import type { Metadata } from "next";
import { requireUser } from "@/server/auth";
import { getAccessibleBook } from "@/server/books";
import { container } from "@/server/container";
import { questionTexts } from "@/lib/book/layout";
import { PhotosManager } from "./PhotosManager";
import { getMessages } from "@/i18n/server";

export async function generateMetadata(): Promise<Metadata> {
  return { title: (await getMessages()).books.photos.meta };
}

export default async function PhotosPage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const user = await requireUser(`/books/${id}/photos`);
  const book = await getAccessibleBook(id, user);
  const [photos, questions, m] = await Promise.all([container().authoring.queries.photos(book.id), container().authoring.queries.questions(book.id), getMessages()]);
  // Заголовок вопроса в книге: свой текст автора — без подстановки рода; пустой заголовок раздела — общая подпись.
  const titles = new Map(questions.map((q) => [q.id, questionTexts(q, book).heading.trim()]));
  return (
    <main className="mx-auto max-w-6xl px-4 py-8 sm:px-6 sm:py-10">
      <div>
        <PhotosManager
          bookId={book.id}
          format={book.format}
          editable={book.status === "draft"}
          initial={photos.map((p) => ({ id: p.id, caption: p.caption, layout: p.layout, width: p.width, height: p.height, crop: p.crop, inAnswer: p.questionId ? titles.get(p.questionId) || m.books.photos.answer : null }))}
        />
      </div>
    </main>
  );
}
