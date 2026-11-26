import type { z } from "zod";
import type { BookEditor, BookSummary, OrderBrief, Photo, PhotoUploadResult, Question, Theme } from "@mybook/contracts";
import type { ApiMessages } from "@/i18n/api-errors";
import { editorModel } from "@/lib/book/editor-data";
import type { EditorPhoto, EditorQuestion } from "@/lib/book/editor-model";
import { bookKind } from "@/lib/content/kinds";
import type { ThemeDef } from "@/lib/content/types";
import { photoUrl } from "@/lib/urls";
import { isBookEditableBy, type BookViewer } from "../domain/Book";
import type { BookRow, ChapterRow, LetterRow, PhotoRow, QuestionRow } from "../infrastructure/queries";

/**
 * Чистые презентеры книг, вопросов и фото для API v1 — общие для mybook-api и бэкенда на Nest (ADR 0014).
 */

export type PhotoLike = Pick<EditorPhoto, "id" | "width" | "height" | "caption" | "layout" | "questionId">;

export interface UserBookSummaryRow {
  book: BookRow;
  answered: number;
  total: number;
  words: number;
  photos: number;
}

export const toTheme = (t: ThemeDef): z.output<typeof Theme> => ({
  id: t.id,
  kind: t.kind,
  recipient: t.recipient,
  name: t.name,
  short: t.short,
  description: t.description,
  emoji: t.emoji,
  recipientLabel: t.recipientLabel ?? null,
  recipientPlaceholder: t.recipientPlaceholder ?? null,
  recipientGender: t.recipientGender ?? null,
  recipientGenderChoice: t.recipientGenderChoice ?? false,
  defaultRecipientGender: t.defaultRecipientGender,
  titleSuggestions: t.titleSuggestions,
});

export const toPhoto = (p: PhotoLike): z.output<typeof Photo> => ({
  id: p.id,
  width: p.width,
  height: p.height,
  caption: p.caption,
  layout: p.layout,
  questionId: p.questionId,
  thumbUrl: photoUrl(p.id, "thumb"),
  url: photoUrl(p.id, "view"),
});

export const toQuestion = (q: EditorQuestion): z.output<typeof Question> => ({
  id: q.id,
  chapter: q.chapter,
  chapterTitle: q.chapterTitle,
  prompt: q.prompt,
  hint: q.hint,
  defaultTitle: q.defaultTitle,
  displayText: q.displayText,
  hideHeading: q.hideHeading,
  answer: q.answer,
  media: q.media.map((m) => ({
    id: m.id,
    kind: m.kind,
    url: m.url,
    ...(m.fileId ? { fileId: m.fileId } : {}),
    title: m.title,
    anchor: m.anchor ?? null,
  })),
  isCustom: q.isCustom,
  pageBreak: q.pageBreak ?? false,
});

export const toBookSummary = (r: UserBookSummaryRow, order: z.output<typeof OrderBrief> | null): z.output<typeof BookSummary> => ({
  id: r.book.id,
  title: r.book.title,
  theme: r.book.theme,
  status: r.book.status,
  authorName: r.book.authorName,
  recipientName: r.book.recipientName,
  updatedAt: r.book.updatedAt.toISOString(),
  answered: r.answered,
  total: r.total,
  words: r.words,
  photos: r.photos,
  coverTemplate: r.book.coverTemplate,
  coverPhotoUrl: r.book.coverPhotoId ? photoUrl(r.book.coverPhotoId, "thumb") : null,
  order,
});

export function buildBookEditorView(input: {
  book: BookRow;
  viewer: BookViewer;
  questions: QuestionRow[];
  chapters: ChapterRow[];
  photos: PhotoRow[];
  letters: LetterRow[];
  maxPhotos: number;
}): z.output<typeof BookEditor> {
  const { book, viewer, questions, chapters, photos, letters, maxPhotos } = input;
  const model = editorModel(book, questions, chapters, photos, letters);
  return {
    book: {
      id: book.id,
      title: book.title,
      theme: book.theme,
      status: book.status,
      language: book.language === "kk" ? "kk" : "ru",
      kind: bookKind(book.theme),
    },
    editable: book.status === "draft" && isBookEditableBy(book.userId, viewer),
    chapters: model.chapters,
    questions: model.questions.map(toQuestion),
    photos: model.photos.map(toPhoto),
    maxPhotos,
  };
}

export function formatPhotoUploadResult(
  rows: readonly PhotoLike[],
  result: { created: readonly { id: string }[]; failed: readonly { name: string; reason: "tooBig" | "format" }[]; damaged: readonly string[] },
  t: ApiMessages,
): z.output<typeof PhotoUploadResult> {
  const created = new Set(result.created.map((p) => p.id));
  return {
    photos: rows.filter((p) => created.has(p.id)).map(toPhoto),
    errors: [
      ...result.failed.map((f) => (f.reason === "tooBig" ? t.photoTooBig(f.name) : t.photoFormat(f.name))),
      ...result.damaged.map((name) => t.photoDamaged(name)),
    ],
  };
}
