"use client";

import { useDeferredValue, useEffect, useMemo, useState, type ComponentProps } from "react";
import { createPortal } from "react-dom";
import { X } from "lucide-react";
import { useMessages } from "@/i18n/client";
import { previewFromContent, type EditorBook, type EditorChapter, type EditorPhoto, type EditorQuestion } from "@/lib/book/editor-model";
import type { LetterLike } from "@/lib/book/layout";
import { PhotoIntroCard, usePhotoIntroSeen } from "../photos/PhotoIntro";
import { PagePreview } from "../preview/PagePreview";
import { closesOnKey } from "./Drawer";
import { useBookContent } from "./useBookContent";

type PaneProps = {
  book: EditorBook;
  questions: EditorQuestion[];
  photos: EditorPhoto[];
  letters: LetterLike[];
  /** Главы редактора — у любой книги (та же сборка, что у счётчика полос и листов фото). */
  chapters: EditorChapter[];
  epigraphs: Record<string, string>;
} & Omit<ComponentProps<typeof PagePreview>, "chapters" | "gallery">;

/**
 * Превью книги в редакторе — из той же сборки, что PDF и счётчик полос (useBookContent): главы и их названия как
 * в печати, фото в ответах — только те, что там печатаются, фото главы с кадром, страницы фото после глав и альбом
 * в конце. Вопросы сборка берёт отложенными (useDeferredValue): символ в ответе сразу виден в поле, а книга
 * перерисовывается, когда браузер свободен. Второй, отложенный проход затрагивает только превью, а не весь редактор.
 * Фото — без отложения: уголок размера и перетаскивание считают от того, что видно сейчас.
 */
export function PreviewPane({ book, questions, photos, letters, chapters, epigraphs, currentId, ...rest }: PaneProps) {
  const { content, places } = useBookContent(book, questions, photos, letters, chapters);
  const deferredQuestions = useDeferredValue(questions);
  const untitled = useMessages().book.untitledChapter;
  const preview = useMemo(
    () => previewFromContent(content, deferredQuestions, photos, { currentId, tocLines: book.tocLines, epigraphs, untitled, places }),
    [content, deferredQuestions, photos, currentId, book.tocLines, epigraphs, untitled, places],
  );
  return <PagePreview chapters={preview.chapters} gallery={preview.gallery} currentId={currentId} {...rest} />;
}

/**
 * Объяснение «Где стоит фото» и подсказка «нажмите на фото» — один раз, при первом открытии превью (PhotoIntroCard:
 * «Понятно» прячет карточку и во вкладке «Фото», и в листе места).
 */
export function PreviewIntro({ blank }: { blank: boolean }) {
  const tp = useMessages().editor.previewPhotos;
  const [seen] = usePhotoIntroSeen();
  if (seen) return null;
  return (
    <div className="space-y-2">
      <PhotoIntroCard blank={blank} />
      <p className="px-1 text-xs text-muted">{tp.tip}</p>
    </div>
  );
}

/**
 * Превью на весь экран (телефон и узкий экран): шапка с «К тексту», ниже — книга, прокрученная к текущему ответу.
 * Листы, открытые с полос превью, ложатся поверх (они выше слоем). Escape закрывает, если поверх нет листа.
 */
export function PreviewSheet({ title, onClose, children }: { title: string; onClose: () => void; children: (className: string) => React.ReactNode }) {
  const t = useMessages().editor.chrome;
  const [mounted, setMounted] = useState(false);
  useEffect(() => {
    // eslint-disable-next-line react-hooks/set-state-in-effect -- портал — только в браузере
    setMounted(true);
    const prev = document.body.style.overflow;
    document.body.style.overflow = "hidden";
    const onKey = (e: KeyboardEvent) => {
      // Поверх превью открыт лист (фото главы, место фото) — Escape закрывает его, а не превью.
      if (!closesOnKey(e) || document.querySelectorAll('[aria-modal="true"]').length > 1) return;
      e.preventDefault();
      onClose();
    };
    window.addEventListener("keydown", onKey);
    return () => {
      window.removeEventListener("keydown", onKey);
      document.body.style.overflow = prev;
    };
  }, [onClose]);
  if (!mounted) return null;
  return createPortal(
    <div role="dialog" aria-modal="true" aria-label={title} className="fixed inset-0 z-[80] flex flex-col bg-paper">
      <div className="flex shrink-0 items-center gap-2 border-b border-line/70 bg-paper/95 py-1.5 pr-1.5 pl-4 pt-[max(0.375rem,env(safe-area-inset-top))] backdrop-blur-xl">
        <h2 className="min-w-0 flex-1 truncate text-base font-semibold">{title}</h2>
        <button type="button" onClick={onClose} className="flex h-11 shrink-0 items-center gap-1.5 rounded-full px-3 text-sm font-medium text-wine hover:bg-cream">
          <X className="size-4" /> {t.previewClose}
        </button>
      </div>
      {children("mx-auto min-h-0 w-full max-w-xl flex-1 overflow-y-auto overscroll-contain px-4 pt-4 pb-[max(1.5rem,env(safe-area-inset-bottom))]")}
    </div>,
    document.body,
  );
}
