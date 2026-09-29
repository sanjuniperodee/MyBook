import { getCoverTemplate } from "@/lib/book/covers";
import { cn } from "@/lib/utils";
import { CoverPreview, type CoverPreviewProps } from "./CoverPreview";

/** Обложка, собранная в объёмную книгу с корешком и обрезом страниц (чистый CSS 3D). */
export function Book3D({
  className,
  rotate = -22,
  thickness = 7,
  ...cover
}: CoverPreviewProps & { rotate?: number; thickness?: number }) {
  const template = getCoverTemplate(cover.template);
  return (
    <div className={cn("book-3d", className)}>
      <div className="book-3d__inner" style={{ transform: `rotateY(${rotate}deg)` }}>
        <div className="relative overflow-hidden rounded-r-[3px] rounded-l-[2px] shadow-book">
          <CoverPreview {...cover} />
          {/* блик и тень у корешка */}
          <div className="pointer-events-none absolute inset-y-0 left-0 w-[7%] bg-gradient-to-r from-black/25 via-white/10 to-transparent" />
          <div className="pointer-events-none absolute inset-0 bg-gradient-to-tr from-transparent via-white/0 to-white/15" />
        </div>
        <div className="book-3d__spine" style={{ width: `${thickness}%`, background: template.spine.color === "#FFFFFF" ? "#333" : undefined }}>
          <div className="h-full w-full" style={{ background: "linear-gradient(90deg, rgba(0,0,0,.35), rgba(0,0,0,.1)), " + template.swatch }} />
        </div>
        <div className="book-3d__pages" style={{ width: `${thickness - 1}%` }} />
      </div>
    </div>
  );
}
