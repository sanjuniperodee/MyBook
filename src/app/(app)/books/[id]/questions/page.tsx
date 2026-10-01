import type { Metadata } from "next";
import { requireUser } from "@/server/auth";
import { getAccessibleBook } from "@/server/books";
import { container } from "@/server/container";
import { applyGender } from "@/lib/content/gender";
import { chapterTitle, getTheme } from "@/lib/content/themes";
import { QuestionsEditor, type EditorQuestion } from "@/components/editor/QuestionsEditor";
import { getMessages } from "@/i18n/server";

export async function generateMetadata(): Promise<Metadata> {
  return { title: (await getMessages()).books.questionsMeta };
}

export default async function QuestionsPage({ params, searchParams }: { params: Promise<{ id: string }>; searchParams: Promise<{ q?: string }> }) {
  const { id } = await params;
  const { q } = await searchParams;
  const user = await requireUser(`/books/${id}/questions`);
  const book = await getAccessibleBook(id, user);
  const [rows, photos] = await Promise.all([container().authoring.queries.questions(book.id), container().authoring.queries.photos(book.id)]);
  const theme = getTheme(book.theme, book.language);
  const g = (s: string) => applyGender(s, book.authorGender, book.recipientGender);
  const questions: EditorQuestion[] = rows.map((r) => ({
    id: r.id,
    chapter: r.chapter,
    chapterTitle: g(chapterTitle(theme, r.chapter, book.language)),
    prompt: g(r.prompt),
    hint: r.hint ? g(r.hint) : null,
    defaultTitle: g(r.title),
    displayText: r.displayText,
    hideHeading: r.hideHeading,
    answer: r.answer,
    isCustom: r.questionKey === "custom",
  }));
  return (
    <QuestionsEditor
      book={{
        id: book.id,
        format: book.format,
        typography: book.typography,
        dedication: book.dedication,
        showToc: book.showToc,
        photoPlacement: book.photoPlacement,
        title: book.title,
        language: book.language,
      }}
      initialQuestions={questions}
      initialIndex={Math.max(0, (Number(q) || 1) - 1)}
      initialPhotos={photos
        .filter((p) => p.id !== book.coverPhotoId)
        .map((p) => ({ id: p.id, width: p.width, height: p.height, caption: p.caption, layout: p.layout, questionId: p.questionId, inline: p.inline }))}
      editable={book.status === "draft"}
    />
  );
}
