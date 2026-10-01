import { memo } from "react";
import type { Locale } from "@/i18n/config";
import type { BookFormat } from "@/lib/book/formats";
import type { InteriorDesign } from "@/lib/book/interiors";
import { cn } from "@/lib/utils";
import { DedicationPage, EndPage, OpenerPage, pageKit, TextPage, TitlePage, TocPage, type SampleEntry } from "./BookPage";
import { cqwUnits } from "./units";

export type SpreadKind = "chapter" | "front" | "toc";

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
}

/** Номер правой страницы с текстом главы на развороте «Глава». */
const TEXT_FOLIO = 7;

/**
 * Разворот книги в выбранном оформлении: «Глава» — начальная полоса и текст, «Титул» — титул и
 * посвящение, «Оглавление» — содержание и финальная страница. Масштабируется по ширине родителя.
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
  } else if (kind === "toc") {
    left = <TocPage kit={kit} entries={sample.toc} muted={!sample.showToc} style={page} />;
    right = <EndPage kit={kit} year={sample.year} style={page} />;
  } else {
    left = <OpenerPage kit={kit} number={sample.chapter.number} title={sample.chapter.title} epigraph={sample.chapter.epigraph} style={page} />;
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
