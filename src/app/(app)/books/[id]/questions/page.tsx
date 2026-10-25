import type { Metadata } from "next";
import { requireUser } from "@/server/auth";
import { getAccessibleBook, viewerOf } from "@/server/books";
import { isBookEditableBy, MAX_PHOTOS } from "@/modules/authoring";
import { container } from "@/server/container";
import { editorBook, editorModel } from "@/lib/book/editor-data";
import { sectionIndex } from "@/lib/book/editor-model";
import { QuestionsEditor } from "@/components/editor/QuestionsEditor";
import { getMessages } from "@/i18n/server";

export async function generateMetadata(): Promise<Metadata> {
  return { title: (await getMessages()).books.questionsMeta };
}

export default async function QuestionsPage({ params, searchParams }: { params: Promise<{ id: string }>; searchParams: Promise<{ q?: string | string[]; s?: string | string[] }> }) {
  const { id } = await params;
  const { q, s } = await searchParams;
  const user = await requireUser(`/books/${id}/questions`);
  const book = await getAccessibleBook(id, user);
  const [rows, chapters, photos, letters, proofreadAi, writerAi] = await Promise.all([
    container().authoring.queries.questions(book.id),
    container().authoring.queries.chapters(book.id),
    container().authoring.queries.photos(book.id),
    container().authoring.queries.approvedLetters(book.id),
    book.status === "draft" ? container().assistant.proofreader.configured() : false,
    book.status === "draft" ? container().assistant.writer.configured() : false,
  ]);
  // Все фото книги, снимок обложки тоже; какие снимки обложка и оборот печатают на самом деле, считается здесь
  // (cover-photos.ts через editorModel): каталог обложек в браузер не идёт, а редактор собирает книгу, как PDF.
  const model = editorModel(book, rows, chapters, photos, letters);
  // Править можно черновик, и сотруднику — только с правом правки (с правом просмотра он лишь читает: сервер ответил бы 404).
  const editable = book.status === "draft" && isBookEditableBy(book.userId, await viewerOf(user, book.id));
  return (
    <QuestionsEditor
      epigraphs={model.epigraphs}
      book={editorBook(book, model.coverPhotos)}
      proofreadAi={proofreadAi}
      writerAi={writerAi}
      initialQuestions={model.questions}
      chapters={model.chapters}
      initialIndex={sectionIndex(
        model.questions.map((x) => x.id),
        s,
        q,
      )}
      initialPhotos={model.photos}
      maxPhotos={MAX_PHOTOS}
      letters={model.letters}
      editable={editable}
    />
  );
}
