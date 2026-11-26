import type { Metadata } from "next";
import { requireUser } from "@/server/auth";
import { getAccessibleBook } from "@/server/books";
import { localQuestionsPageDtoForUser } from "@/server/v1-local-bridge-book";
import { v1WebRead } from "@/server/v1-web-client";
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
  const data = await v1WebRead({
    name: "book.questionsPage",
    section: "book",
    local: () => localQuestionsPageDtoForUser(book, user),
    viaApi: (api) => api.webBookQuestionsPage({ bookId: book.id }),
  });
  return (
    <QuestionsEditor
      epigraphs={data.epigraphs}
      book={data.book}
      proofreadAi={data.proofreadAi}
      writerAi={data.writerAi}
      initialQuestions={data.initialQuestions}
      chapters={data.chapters}
      initialIndex={sectionIndex(
        data.initialQuestions.map((x) => x.id),
        s,
        q,
      )}
      initialPhotos={data.initialPhotos}
      maxPhotos={data.maxPhotos}
      letters={data.letters}
      editable={data.editable}
    />
  );
}
