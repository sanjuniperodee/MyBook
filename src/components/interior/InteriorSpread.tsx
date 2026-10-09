import { memo } from "react";
import type { Locale } from "@/i18n/config";
import type { BookFormat } from "@/lib/book/formats";
import type { InteriorDesign } from "@/lib/book/interiors";
import { cn } from "@/lib/utils";
import { messagesFor } from "@/i18n/messages";
import { DedicationPage, EndPage, OpenerPage, pageKit, PhotoPage, TextPage, TitlePage, TocPage, type PagePhoto, type SampleEntry } from "./BookPage";
import { cqwUnits } from "./units";

export type SpreadKind = "chapter" | "front" | "toc" | "photos";

/** Что показать на развороте: содержимое книги клиента или пример, если ответов ещё нет. */
export interface SpreadSample {
  language: Locale;
  title: string;
  subtitle: string;
  author: string;
  year: number;
  dedication: string;
  /** Подсказка на пустой странице посвящения (в книгу не попадёт). */
  dedicationPlaceholder: string;
  chapter: { number: number; title: string; epigraph?: string };
  entries: SampleEntry[];
  toc: { title: string; number: number; page: number }[];
  showToc: boolean;
  /** Фото книги для разворота «Фото» и начала главы; недостающие — пейзажи-заглушки. */
  photos?: { url: string; width: number; height: number; caption: string }[];
}

/** Номер правой страницы с текстом главы на развороте «Глава». */
const TEXT_FOLIO = 7;

/** Фото для разворота «Фото»: снимок на всю полосу и сетка из трёх (пейзажи-заглушки с подписями на языке книги). */
function samplePhotos(language: Locale, own: NonNullable<SpreadSample["photos"]> = []): { single: PagePhoto[]; grid: PagePhoto[] } {
  const [a, b, c] = messagesFor(language).book.samplePhotos;
  const stock = [
    { width: 1500, height: 1200, caption: a },
    { width: 1600, height: 1000, caption: b },
    { width: 1200, height: 1200, caption: "" },
    { width: 1200, height: 1200, caption: c },
  ];
  const pick = (i: number, id: string, layout: PagePhoto["layout"]): PagePhoto => ({ id, layout, ...(own[i] ?? stock[i]) });
  return { single: [pick(0, "s1", "full")], grid: [pick(1, "g1", "grid"), pick(2, "g2", "grid"), pick(3, "g3", "grid")] };
}

/**
 * Разворот книги в выбранном оформлении: «Глава» — начальная полоса и текст, «Титул» — титул и
 * посвящение, «Оглавление» — содержание и финальная страница, «Фото» — фотостраницы с рамками
 * и подписями дизайна. Масштабируется по ширине родителя.
 */
export const InteriorSpread = memo(function InteriorSpread({
  design,
  format,
  sample,
  kind = "chapter",
  className,
}: {
  design: InteriorDesign;
  format: BookFormat;
  sample: SpreadSample;
  kind?: SpreadKind;
  className?: string;
}) {
  const kit = pageKit(design, format, cqwUnits(format.widthMm), sample.language);
  const page = { aspectRatio: `${format.widthMm} / ${format.heightMm}` };
  let left: React.ReactNode;
  let right: React.ReactNode;
  if (kind === "front") {
    left = <TitlePage kit={kit} title={sample.title} subtitle={sample.subtitle} author={sample.author} year={sample.year} style={page} />;
    right = <DedicationPage kit={kit} text={sample.dedication} placeholder={sample.dedicationPlaceholder} style={page} />;
  } else if (kind === "photos") {
    const photos = samplePhotos(sample.language, sample.photos);
    left = <PhotoPage kit={kit} photos={photos.single} style={page} />;
    right = <PhotoPage kit={kit} photos={photos.grid} scene={1} style={page} />;
  } else if (kind === "toc") {
    left = <TocPage kit={kit} entries={sample.toc} muted={!sample.showToc} style={page} />;
    right = <EndPage kit={kit} year={sample.year} style={page} />;
  } else {
    left = <OpenerPage kit={kit} number={sample.chapter.number} title={sample.chapter.title} epigraph={sample.chapter.epigraph} photo={design.opener.photo ? { url: sample.photos?.[0]?.url } : undefined} style={page} />;
    right = (
      <TextPage
        kit={kit}
        entries={sample.entries}
        folio={TEXT_FOLIO}
        bookTitle={sample.title}
        chapterTitle={sample.chapter.title}
        recto
        leadIn
        style={page}
      />
    );
  }
  return (
    <div className={cn("relative grid grid-cols-2 overflow-hidden select-none", className)}>
      {left}
      {right}
      {/* Тень у корешка, как у раскрытой книги */}
      <div aria-hidden className="pointer-events-none absolute inset-y-0 left-1/2 w-[7%] -translate-x-full bg-gradient-to-l from-black/[.10] to-transparent" />
      <div aria-hidden className="pointer-events-none absolute inset-y-0 left-1/2 w-[7%] bg-gradient-to-r from-black/[.10] to-transparent" />
    </div>
  );
});
