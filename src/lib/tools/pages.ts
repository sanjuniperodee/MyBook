/**
 * Оценка объёма книги по числу ответов, их длине, фото и письмам. Считает тем же движком, что редактор и кабинет
 * (editorEstimate → estimatePages), поэтому число совпадает с тем, что человек увидит в готовой книге: на макете из
 * абзацев нужной длины и фото в ответах. Это оценка, а не вёрстка: реальный объём зависит от текста и расстановки фото.
 */
import type { EditorBook, EditorPhoto, EditorQuestion } from "@/lib/book/editor-model";
import { editorEstimate } from "@/lib/book/editor-estimate";
import { print, spineWidthMm, type FormatId } from "@/lib/book/formats";
import type { LetterLike } from "@/lib/book/layout";

export type AnswerLength = "short" | "medium" | "long";
/** Слов в ответе: коротко — несколько предложений, длинно — история на страницу и больше. */
export const WORDS: Record<AnswerLength, number> = { short: 50, medium: 120, long: 250 };
/** Слов в письме близкого. */
export const LETTER_WORDS = 120;

export interface BookPlan {
  format: FormatId;
  answers: number;
  length: AnswerLength;
  photos: number;
  letters: number;
}

/** Слова-«заполнитель»: средняя длина близка к русской (6–7 знаков), с точками, чтобы работали абзацы и переносы. */
const FILLER = ["история", "мама", "детство", "летом", "тёплый", "вечер", "воспоминание", "улыбка", "семья", "дорога", "помню", "всегда", "рядом", "дом", "школа", "праздник"];

function filler(words: number): string {
  const out: string[] = [];
  for (let i = 0; i < words; i++) out.push(FILLER[(i * 7 + (i >> 3)) % FILLER.length] + (i % 11 === 10 ? "." : ""));
  return out.join(" ");
}

/** Текст из абзацев по ~60 слов — как пишут в редакторе. */
function text(words: number): string {
  const paras: string[] = [];
  for (let left = words; left > 0; left -= 60) paras.push(filler(Math.min(60, left)));
  return paras.join("\n\n");
}

export function planContent(p: BookPlan) {
  const chapters = Math.min(12, Math.max(1, Math.ceil(p.answers / 7)));
  const answer = text(WORDS[p.length]);
  const questions: EditorQuestion[] = Array.from({ length: p.answers }, (_, i) => ({
    id: `q${i}`,
    chapter: `c${i % chapters}`,
    chapterTitle: "",
    prompt: "",
    hint: null,
    defaultTitle: "—",
    displayText: null,
    hideHeading: false,
    answer,
    media: [],
    isCustom: false,
  }));
  // Фото — в ответах: так их ставят чаще всего; пропорции обычного снимка с телефона.
  const photos: EditorPhoto[] = Array.from({ length: p.photos }, (_, i) => ({
    id: `p${i}`,
    width: 4000,
    height: 3000,
    caption: "",
    layout: "full",
    questionId: questions.length ? questions[i % questions.length].id : null,
    crop: null,
    chapter: null,
    opener: false,
    onCover: null,
  }));
  const letters: LetterLike[] = Array.from({ length: p.letters }, (_, i) => ({ id: `l${i}`, authorName: "—", relation: "", text: text(LETTER_WORDS) }));
  const book: EditorBook = {
    id: "estimate",
    format: p.format,
    interior: "classic",
    dedication: "",
    showToc: true,
    photoPlacement: "chapters",
    title: "—",
    language: "ru",
    theme: "mom",
    kind: "gift",
    authorGender: "f",
    recipientGender: "f",
    layoutRev: 2,
  };
  return { book, questions, photos, letters };
}

export interface BookSize {
  /** Полос по вёрстке и в печатном объёме (минимум print.minPages, кратно четырём). */
  raw: number;
  pages: number;
  spineMm: number;
  words: number;
}

export function estimateBook(p: BookPlan): BookSize {
  const { book, questions, photos, letters } = planContent(p);
  const { raw, printed } = editorEstimate(book, questions, photos, letters);
  return { raw, pages: printed, spineMm: printed ? spineWidthMm(printed) : 0, words: p.answers * WORDS[p.length] + p.letters * LETTER_WORDS };
}

export type Fullness = "empty" | "thin" | "good" | "thick";

/** Тонкая — на минимальном объёме (по нему печатные пустые полосы), хорошая — от 40 полос, толстая — больше 160. */
export const THIN_PAGES = 32;
export const GOOD_PAGES = 40;
export const THICK_PAGES = 160;

export function fullness(size: BookSize, answers: number): Fullness {
  if (!answers && !size.raw) return "empty";
  return size.raw < THIN_PAGES ? "thin" : size.raw > THICK_PAGES ? "thick" : "good";
}

/** Сколько ещё ответов той же длины нужно, чтобы книга набрала GOOD_PAGES полос (0 — уже набрала). */
export function answersToGood(p: BookPlan): number {
  for (let extra = 0; extra <= 80; extra++) {
    if (estimateBook({ ...p, answers: p.answers + extra }).raw >= GOOD_PAGES) return extra;
  }
  return 80;
}

export const MIN_PRINT_PAGES = print.minPages;
