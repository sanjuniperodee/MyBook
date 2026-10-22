"use client";

import { useMemo } from "react";
import { useRouter } from "next/navigation";
import { useMessages } from "@/i18n/client";
import { groupByChapter, sectionLabel, type EditorBook, type EditorChapter, type EditorPhoto, type EditorQuestion } from "@/lib/book/editor-model";
import { getFormat } from "@/lib/book/formats";
import { getInteriorDesign } from "@/lib/book/interiors";
import type { BookContent, LetterLike } from "@/lib/book/layout";
import { SUGGEST_TOP, suggestOpener } from "@/lib/book/opener-suggest";
import { openerFrame } from "@/lib/book/photo-pages";
import type { PhotoPlace } from "@/lib/book/photo-place";
import { tocKey } from "@/lib/book/toc";
import { ChapterPhotoSheet } from "../photos/ChapterPhotoSheet";
import { GallerySheet } from "../photos/GallerySheet";
import type { ChooserMode } from "../photos/PhotoChooser";
import { PlaceSheet } from "../photos/PlaceSheet";
import type { PlaceChapter, PlaceData, PlaceEvents } from "../photos/model";
import { useBookContent } from "../questions/useBookContent";
import type { PreviewTarget } from "./targets";

/** Какой лист фото открыт в редакторе: цель из превью (или карточки начала главы) и с какого места начать. */
export type PhotoSheetTarget = PreviewTarget & { choose?: ChooserMode; focus?: "after" };

/** Книга в редакторе — входы сборки (useBookContent): те же объекты, что у превью и счётчика полос. */
export interface BookSource {
  book: EditorBook;
  questions: EditorQuestion[];
  photos: EditorPhoto[];
  letters: LetterLike[];
  chapters: EditorChapter[];
}

/**
 * Данные листов мест по книге в редакторе: главы по порядку редактора (номер, название и эпиграф — как в печати;
 * глава без текста — printed false, фото для неё ждёт текста), ответы для «В ответ…», места фото (photoPlaceOf).
 */
export function placeData(
  src: BookSource,
  content: Pick<BookContent, "chapters" | "galleryTitle">,
  places: ReadonlyMap<string, PhotoPlace>,
  opts: { editable: boolean; untitledSection: string; untitledChapter: string },
): PlaceData {
  const { book, questions, photos, chapters } = src;
  const blank = book.kind === "blank";
  const tocLines = book.tocLines ?? {};
  const seen = new Set<string>();
  const list: PlaceChapter[] = [];
  for (const g of groupByChapter(questions, blank ? chapters : undefined)) {
    if (seen.has(g.key)) continue;
    seen.add(g.key);
    const ch = content.chapters.find((c) => c.key === g.key);
    if (ch) {
      list.push({ key: g.key, title: ch.title, number: ch.number, epigraph: ch.epigraph, printed: true });
      continue;
    }
    const folded = content.chapters.flatMap((c) => c.folded ?? []).find((f) => f.key === g.key);
    const title = folded?.title || tocLines[tocKey.chapter(g.key)]?.title?.trim() || g.title.trim() || (blank ? opts.untitledChapter : g.title);
    list.push({ key: g.key, title, number: null, epigraph: chapters.find((c) => c.key === g.key)?.epigraph || undefined, printed: !!folded });
  }
  return {
    book: { id: book.id, interior: book.interior, format: book.format, language: book.language, blank, photoPlacement: book.photoPlacement, galleryTitle: content.galleryTitle, editable: opts.editable },
    photos,
    places,
    chapters: list,
    answers: questions.map((q) => ({ id: q.id, title: sectionLabel(q, book.kind, opts.untitledSection), chapterKey: q.chapter })),
    tocLines,
  };
}

/**
 * Листы фото редактора поверх превью и карточки начала главы: «Фото главы» (начало главы и фото после неё), «Где
 * стоит фото» и «Альбом в конце». Данные — из той же сборки книги, что у превью; что лист поменял, приходит
 * в события on (редактор обновляет свои фото и настройки книги — превью и счётчик пересобираются сами).
 */
export function PhotoSheetHost({ src, target, editable, on, onLeave, onClose }: { src: BookSource; target: PhotoSheetTarget; editable: boolean; on: PlaceEvents; onLeave: () => void; onClose: () => void }) {
  const messages = useMessages();
  const router = useRouter();
  const { book, questions, photos, letters, chapters } = src;
  const { content, places } = useBookContent(book, questions, photos, letters, chapters);
  const data = useMemo(
    () => placeData({ book, questions, photos, letters, chapters }, content, places, { editable, untitledSection: messages.books.untitledSection, untitledChapter: messages.book.untitledChapter }),
    [book, questions, photos, letters, chapters, content, places, editable, messages],
  );
  const chapterKey = target.chapterKey;
  // Подсказка «подходит по форме» — лучшие снимки для рамки оформления (фото главы ставит только автор).
  const fit = useMemo(() => {
    const frame = openerFrame(getFormat(book.format), getInteriorDesign(book.interior));
    return frame && chapterKey ? suggestOpener(content, photos, frame, chapterKey, book).slice(0, SUGGEST_TOP).map((c) => c.id) : undefined;
  }, [content, photos, book, chapterKey]);

  if (target.kind === "gallery") return <GallerySheet data={data} on={on} onClose={onClose} />;
  if (chapterKey)
    return (
      <ChapterPhotoSheet
        data={data}
        on={on}
        chapterKey={chapterKey}
        fit={fit}
        choose={target.choose}
        focus={target.kind === "photo" ? "after" : target.focus}
        onChangeDesign={() => {
          onLeave();
          router.push(`/books/${book.id}/pages`);
        }}
        onClose={onClose}
      />
    );
  if (target.photoId) return <PlaceSheet data={data} on={on} photoId={target.photoId} onClose={onClose} />;
  return null;
}
