import type { Metadata } from "next";
import { requireUser } from "@/server/auth";
import { getAccessibleBook } from "@/server/books";
import { container } from "@/server/container";
import { editorModel } from "@/lib/book/editor-data";
import { QuestionsEditor } from "@/components/editor/QuestionsEditor";
import { getMessages } from "@/i18n/server";

export async function generateMetadata(): Promise<Metadata> {
  return { title: (await getMessages()).books.questionsMeta };
}

export default async function QuestionsPage({ params, searchParams }: { params: Promise<{ id: string }>; searchParams: Promise<{ q?: string }> }) {
  const { id } = await params;
  const { q } = await searchParams;
  const user = await requireUser(`/books/${id}/questions`);
  const book = await getAccessibleBook(id, user);
  const [rows, photos, letters, proofreadAi] = await Promise.all([
    container().authoring.queries.questions(book.id),
    container().authoring.queries.photos(book.id),
    container().authoring.queries.approvedLetters(book.id),
    book.status === "draft" ? container().assistant.proofreader.configured() : false,
  ]);
  const model = editorModel(book, rows, photos, letters);
  return (
    <QuestionsEditor
      epigraphs={model.epigraphs}
      book={{
        id: book.id,
        format: book.format,
        interior: book.interior,
        dedication: book.dedication,
        showToc: book.showToc,
        photoPlacement: book.photoPlacement,
        title: book.title,
        language: book.language,
        names: [book.authorName, book.recipientName].filter(Boolean),
        theme: book.theme,
        authorGender: book.authorGender,
        recipientGender: book.recipientGender,
      }}
      proofreadAi={proofreadAi}
      initialQuestions={model.questions}
      initialIndex={Math.max(0, (Number(q) || 1) - 1)}
      initialPhotos={model.photos}
      letters={model.letters}
      editable={book.status === "draft"}
    />
  );
}
