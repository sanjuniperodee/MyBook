import type { Metadata } from "next";
import { requireUser } from "@/server/auth";
import { getAccessibleBook, viewerOf } from "@/server/books";
import { isBookEditableBy } from "@/modules/authoring";
import { container } from "@/server/container";
import { editorModel } from "@/lib/book/editor-data";
import { sectionIndex } from "@/lib/book/editor-model";
import { bookKind } from "@/lib/content/kinds";
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
  const [rows, chapters, photos, letters, proofreadAi] = await Promise.all([
    container().authoring.queries.questions(book.id),
    container().authoring.queries.chapters(book.id),
    container().authoring.queries.photos(book.id),
    container().authoring.queries.approvedLetters(book.id),
    book.status === "draft" ? container().assistant.proofreader.configured() : false,
  ]);
  const model = editorModel(book, rows, chapters, photos, letters);
  // Править можно черновик, и сотруднику — только с правом правки (с правом просмотра он лишь читает: сервер ответил бы 404).
  const editable = book.status === "draft" && isBookEditableBy(book.userId, await viewerOf(user, book.id));
  return (
    <QuestionsEditor
      epigraphs={model.epigraphs}
      book={{
        id: book.id,
        format: book.format,
        interior: book.interior,
        dedication: book.dedication,
        showToc: book.showToc,
        tocMode: book.tocMode,
        tocLines: book.tocLines,
        photoPlacement: book.photoPlacement,
        title: book.title,
        language: book.language,
        // Имена на книге (и «кто записал» у автобиографии) проверка орфографии не отмечает.
        names: [book.authorName, book.recipientName, book.recordedBy].filter(Boolean),
        theme: book.theme,
        kind: bookKind(book.theme),
        authorGender: book.authorGender,
        recipientGender: book.recipientGender,
      }}
      proofreadAi={proofreadAi}
      initialQuestions={model.questions}
      chapters={model.chapters}
      initialIndex={sectionIndex(
        model.questions.map((x) => x.id),
        s,
        q,
      )}
      initialPhotos={model.photos}
      letters={model.letters}
      editable={editable}
    />
  );
}
