import "server-only";
import { Document } from "@react-pdf/renderer";
import { site } from "@/config/site";
import { chapterRuns, photoPages, type BookContent } from "@/lib/book/layout";
import { hasToc, printedGalleryTitle } from "@/lib/book/toc";
import { ChapterBody } from "./chapter-body";
import { Colophon } from "./colophon";
import { Dedication } from "./dedication";
import { EndPage } from "./end-page";
import { chapterKit, pdfKit, type InteriorOptions } from "./kit";
import { Opener } from "./opener";
import { PhotoPage } from "./photo-page";
import { TitlePage } from "./title-page";
import { Toc } from "./toc";

export type { PreparedImage } from "./kit";

/**
 * Блок книги. Шрифты, цвета, виньетки, начальные полосы, колонтитулы и колонцифры берутся из
 * дизайна (content.interior); те же правила рисуют HTML-превью на сайте (components/interior).
 * Порядок полос: титул, оборот титула, посвящение, оглавление, главы (начальная полоса, текст, фото),
 * галерея, финал. Каждая полоса — свой файл рядом и помечена видом (pageMark) для манифеста сборки.
 * Водяного знака в вёрстке нет: сборка одна для экрана и печати, знак ставится поверх готового PDF (pdf/watermark.tsx).
 */
export function InteriorDocument({ content, options }: { content: BookContent; options: InteriorOptions }) {
  const base = pdfKit(content, options);
  const kit = base;
  const pages: React.ReactNode[] = [<TitlePage key="title" kit={kit} />, <Colophon key="colophon" kit={kit} />];
  if (content.dedication) pages.push(<Dedication key="dedication" kit={kit} text={content.dedication} />);
  if (hasToc(content)) pages.push(<Toc key="toc" kit={kit} />);

  for (const ch of content.chapters) {
    // Глава со своим оформлением (дизайнер) — свой набор; остальные главы — общий.
    const kit = chapterKit(base, ch.key);
    pages.push(<Opener key={`open-${ch.key}`} kit={kit} chapterKey={ch.key} number={ch.number} title={ch.title} epigraph={ch.epigraph} photo={ch.openerPhoto} />);
    // Текст главы — кусками: между ними фото на всю страницу из историй (под обрез, без колонтитула).
    const runs = chapterRuns(ch.items);
    const lastText = runs.findLastIndex((r) => r.items.length);
    runs.forEach((run, i) => {
      if (run.items.length) pages.push(<ChapterBody key={`body-${ch.key}-${i}`} kit={kit} chapter={ch} items={run.items} first={i === 0} tail={i === lastText} />);
      if (run.photo) pages.push(<PhotoPage key={`pp-${ch.key}-${i}`} kit={kit} group={[run.photo]} chapterKey={ch.key} />);
    });
    photoPages(ch.photos).forEach((group, i) => pages.push(<PhotoPage key={`ph-${ch.key}-${i}`} kit={kit} group={group} chapterKey={ch.key} />));
  }

  if (content.galleryPhotos.length) {
    pages.push(<Opener key="open-__gallery" kit={kit} chapterKey="__gallery" number={null} title={printedGalleryTitle(content)} />);
    photoPages(content.galleryPhotos).forEach((group, i) => pages.push(<PhotoPage key={`ph-gallery-${i}`} kit={kit} group={group} />));
  }

  pages.push(<EndPage key="end" kit={kit} />);

  return (
    <Document
      // Раскладку react-pdf отдаёт только во внутреннем поле onRender — другого способа узнать, где что встало, нет.
      onRender={options.onLayout ? (r) => options.onLayout?.((r as { _INTERNAL__LAYOUT__DATA_?: unknown })._INTERNAL__LAYOUT__DATA_) : undefined}
      title={content.title} author={content.authorName || site.name} creator={site.name} producer={site.name} language={content.language}>
      {pages}
    </Document>
  );
}
