"use client";

import { useMemo } from "react";
import { BookOpen, Images } from "lucide-react";
import { useMessages } from "@/i18n/client";
import { OpenerPage } from "@/components/interior/pages";
import { pageKit } from "@/components/interior/kit";
import { cqwUnits } from "@/components/interior/units";
import { editorPhotoUrl, type EditorBook, type EditorChapter, type EditorPhoto, type EditorQuestion } from "@/lib/book/editor-model";
import { getFormat } from "@/lib/book/formats";
import { getInteriorDesign } from "@/lib/book/interiors";
import type { LetterLike } from "@/lib/book/layout";
import type { PhotoCrop } from "@/lib/book/photo-crop";
import type { PhotoPlace } from "@/lib/book/photo-place";
import { tocKey } from "@/lib/book/toc";
import { cn } from "@/lib/class-names";
import { noOpenerPhotoOf, openerOf } from "../photos/model";
import { useBookContent } from "./useBookContent";

/** Кнопки карточки: выбрать фото главы, «Без фото», сменить фото, кадр, фото после главы (изменить или добавить). */
export type ChapterStartAction = "choose" | "none" | "change" | "crop" | "after" | "addAfter";

export interface ChapterStartCardProps {
  book: Pick<EditorBook, "interior" | "format" | "language">;
  /** Название главы — как в печати (своё из оглавления). */
  title: string;
  /** Номер главы в книге; null — в главе ещё нечего печатать. */
  number: number | null;
  epigraph?: string;
  /** Фото главы с кадром; null — не выбрано. */
  opener: { url: string; crop?: PhotoCrop } | null;
  /** Автор выбрал «Без фото» (tocLines noOpenerPhoto). */
  dismissed: boolean;
  /** Фото после главы. */
  after: number;
  editable: boolean;
  onAction: (action: ChapterStartAction) => void;
}

const BTN = "btn btn-outline btn-sm min-h-11 shrink-0 px-3 sm:min-h-9";

/**
 * Карточка «Начало главы» над первым вопросом главы (S0): где менять фото главы и фото после главы, не уходя
 * из редактора. Первая строка — только в оформлении с фото главы: мини-страница начала главы в текущих оформлении
 * и формате — с выбранным фото и его кадром или, как в печати, без фото (тёмная полоса в «Кино»). Состояния:
 * не выбрано — янтарная подсказка [Выбрать фото] [Без фото]; выбрано — [Изменить] [Кадр]; «без фото» — тихая строка
 * [Изменить]. Вторая строка — в любом оформлении: сколько фото после главы и [Изменить].
 */
export function ChapterStartCard({ book, title, number, epigraph, opener, dismissed, after, editable, onAction }: ChapterStartCardProps) {
  const m = useMessages();
  const t = m.editor.chapterStart;
  const design = getInteriorDesign(book.interior);
  const format = getFormat(book.format);
  const shape = design.opener.photo;
  const kit = useMemo(() => pageKit(design, format, cqwUnits(format.widthMm), book.language), [design, format, book.language]);
  const state = opener ? "chosen" : dismissed ? "dismissed" : "prompt";

  return (
    <section aria-label={t.title(title)} data-chapter-start={shape ? state : "plain"} className="mb-3 rounded-[22px] border border-line/70 bg-white px-4 py-3 shadow-soft sm:mb-4 sm:px-5">
      {shape ? (
        <div className="flex items-start gap-3 border-b border-line/60 pb-3">
          <div className="w-14 shrink-0 overflow-hidden rounded-[5px] shadow-sm ring-1 ring-line" aria-hidden>
            <OpenerPage kit={kit} number={number} title={title} epigraph={epigraph} photo={opener ? { url: opener.url, crop: opener.crop } : undefined} style={{ aspectRatio: `${format.widthMm} / ${format.heightMm}` }} />
          </div>
          <div className="min-w-0 flex-1">
            <div lang={book.language} className="flex items-center gap-1.5 text-sm font-medium text-ink">
              <BookOpen className="size-3.5 shrink-0 text-wine" aria-hidden />
              <span className="truncate">{t.title(title)}</span>
            </div>
            {state === "prompt" ? (
              <>
                <p className="mt-1.5 rounded-xl bg-amber-50 px-3 py-2 text-[13px] leading-snug text-amber-900">{t.prompt(m.catalog.interiors[design.id].name, m.editor.openerShape[shape])}</p>
                {editable ? (
                  <div className="mt-2 flex flex-wrap gap-2">
                    <button type="button" className={cn(BTN, "border-wine/40 text-wine")} onClick={() => onAction("choose")}>
                      {t.choose}
                    </button>
                    <button type="button" className={BTN} onClick={() => onAction("none")}>
                      {t.none}
                    </button>
                  </div>
                ) : null}
              </>
            ) : state === "chosen" ? (
              editable ? (
                <div className="mt-2 flex flex-wrap gap-2">
                  <button type="button" className={BTN} onClick={() => onAction("change")}>
                    {t.change}
                  </button>
                  <button type="button" className={BTN} onClick={() => onAction("crop")}>
                    {t.crop}
                  </button>
                </div>
              ) : null
            ) : (
              <div className="mt-1 flex flex-wrap items-center gap-x-2 gap-y-1">
                <p className="min-w-0 flex-1 text-[13px] leading-snug text-muted">{t.dismissed}</p>
                {editable ? (
                  <button type="button" className={BTN} onClick={() => onAction("choose")}>
                    {t.change}
                  </button>
                ) : null}
              </div>
            )}
          </div>
        </div>
      ) : (
        <div lang={book.language} className="flex items-center gap-1.5 pb-1 text-sm font-medium text-ink">
          <BookOpen className="size-3.5 shrink-0 text-wine" aria-hidden />
          <span className="truncate">{t.title(title)}</span>
        </div>
      )}
      <div className={cn("flex items-center gap-2", shape ? "pt-2" : "pt-1")}>
        <Images className="size-4 shrink-0 text-muted" aria-hidden />
        {after ? (
          <>
            <span className="min-w-0 flex-1 text-[13px] text-ink-soft">{t.after(after)}</span>
            {editable ? (
              <button type="button" className={BTN} onClick={() => onAction("after")}>
                {t.change}
              </button>
            ) : null}
          </>
        ) : editable ? (
          <button type="button" className="-mx-1 flex min-h-11 min-w-0 flex-1 items-center rounded-lg px-1 text-left text-[13px] text-wine hover:bg-wine/5 sm:min-h-9" onClick={() => onAction("addAfter")}>
            {t.afterZero}
          </button>
        ) : (
          <span className="min-w-0 flex-1 text-[13px] text-muted">{t.after(0)}</span>
        )}
      </div>
    </section>
  );
}

/** Что карточка знает о главе по местам фото (photoPlaceOf): фото главы (и выбранное для главы, ещё ждущее текста) и фото после главы. */
export function chapterStartPhotos(places: ReadonlyMap<string, PhotoPlace>, photos: readonly EditorPhoto[], chapterKey: string) {
  const chosen = openerOf(places, chapterKey);
  const opener = chosen ? photos.find((p) => p.id === chosen.id) : photos.find((p) => p.opener && places.get(p.id)?.waitingFor === chapterKey);
  const after = photos.filter((p) => {
    const pl = places.get(p.id);
    return pl?.waitingFor ? pl.waitingFor === chapterKey && !p.opener : pl?.kind === "after" && pl.chapterKey === chapterKey;
  }).length;
  return { opener: opener ?? null, after };
}

/**
 * Карточка начала главы по сборке книги (useBookContent — та же, что у превью и счётчика полос): номер, название
 * и эпиграф главы как в печати. Глава, убранная автором (влита в предыдущую), своего начала не имеет — карточки нет.
 */
export function ChapterStart({
  book,
  questions,
  photos,
  letters,
  chapters,
  chapterKey,
  fallbackTitle,
  editable,
  onAction,
}: {
  book: EditorBook;
  questions: EditorQuestion[];
  photos: EditorPhoto[];
  letters: LetterLike[];
  chapters: EditorChapter[];
  chapterKey: string;
  /** Название главы в редакторе — пока в ней нечего печатать. */
  fallbackTitle: string;
  editable: boolean;
  onAction: (action: ChapterStartAction) => void;
}) {
  const { content, places } = useBookContent(book, questions, photos, letters, chapters);
  const ch = content.chapters.find((c) => c.key === chapterKey);
  const folded = !ch && content.chapters.some((c) => c.folded?.some((f) => f.key === chapterKey));
  const { opener, after } = useMemo(() => chapterStartPhotos(places, photos, chapterKey), [places, photos, chapterKey]);
  if (folded) return null;
  const tocLines = book.tocLines ?? {};
  const title = ch?.title ?? (tocLines[tocKey.chapter(chapterKey)]?.title?.trim() || fallbackTitle);
  const epigraph = ch ? ch.epigraph : chapters.find((c) => c.key === chapterKey)?.epigraph || undefined;
  return (
    <ChapterStartCard
      book={book}
      title={title}
      number={ch?.number ?? null}
      epigraph={epigraph}
      opener={opener ? { url: editorPhotoUrl(opener), crop: opener.crop ?? undefined } : null}
      dismissed={noOpenerPhotoOf(tocLines, chapterKey)}
      after={after}
      editable={editable}
      onAction={onAction}
    />
  );
}
