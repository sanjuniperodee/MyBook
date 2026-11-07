import { ViewTransition } from "react";
import { getCoverTemplate } from "@/lib/book/covers";
import { cn } from "@/lib/class-names";
import { CoverPreview, type CoverPreviewProps } from "./CoverPreview";

/**
 * Обложка, собранная в объёмную книгу с корешком и обрезом страниц (чистый CSS 3D).
 * bookId — книгу можно «открыть» (OpenBookLink): обложка распахивается вокруг корешка, под ней — первая страница
 * (`book-3d__leaf`), которая затем «перетекает» в лист редактора (имя `leaf-<id>` — пара с листом в редакторе).
 */
export function Book3D({
  className,
  rotate = 22,
  thickness = 7,
  bookId,
  ...cover
}: CoverPreviewProps & { rotate?: number; thickness?: number; bookId?: string }) {
  const template = getCoverTemplate(cover.template);
  const leaf = (
    <div className="book-3d__leaf" aria-hidden>
      <span />
      <span />
      <span />
      <span />
      <span />
    </div>
  );
  return (
    <div className={cn("book-3d", className)} data-book-3d={bookId}>
      <div className="book-3d__inner" style={{ "--ry": `${rotate}deg` } as React.CSSProperties}>
        {/* Первая страница под крышкой: видна, когда книга приоткрыта (наведение) или открывается (OpenBookLink). */}
        {bookId ? (
          <ViewTransition name={`leaf-${bookId}`} share="morph" default="none">
            {leaf}
          </ViewTransition>
        ) : (
          leaf
        )}
        {/* Крышка: лицо — обложка, изнанка — форзац; при открытии крышка поворачивается вокруг корешка (.is-opening). */}
        <div className="book-3d__lid">
          <div className="book-3d__cover relative overflow-hidden rounded-r-[3px] rounded-l-[2px] shadow-book">
            <CoverPreview {...cover} />
            {/* блик и тень у корешка */}
            <div className="pointer-events-none absolute inset-y-0 left-0 w-[7%] bg-gradient-to-r from-black/25 via-white/10 to-transparent" />
            <div className="pointer-events-none absolute inset-0 bg-gradient-to-tr from-transparent via-white/0 to-white/15" />
          </div>
          <div className="book-3d__endpaper" aria-hidden />
        </div>
        <div className="book-3d__spine" style={{ width: `${thickness}%`, background: template.spine.color === "#FFFFFF" ? "#333" : undefined }}>
          <div className="h-full w-full" style={{ background: "linear-gradient(270deg, rgba(0,0,0,.35), rgba(0,0,0,.1)), " + template.swatch }} />
        </div>
        <div className="book-3d__pages" style={{ width: `${thickness - 1}%` }} />
      </div>
    </div>
  );
}
