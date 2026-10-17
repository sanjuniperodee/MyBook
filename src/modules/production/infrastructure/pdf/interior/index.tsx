import "server-only";
import { Document } from "@react-pdf/renderer";
import { site } from "@/config/site";
import { photoPages, type BookContent } from "@/lib/book/layout";
import { ChapterBody } from "./chapter-body";
import { Colophon } from "./colophon";
import { Dedication } from "./dedication";
import { EndPage } from "./end-page";
import { pdfKit, type InteriorOptions } from "./kit";
import { Opener } from "./opener";
import { PhotoPage } from "./photo-page";
import { TitlePage } from "./title-page";
import { Toc } from "./toc";

export type { PreparedImage } from "./kit";

/**
 * Блок книги. Шрифты, цвета, виньетки, начальные полосы, колонтитулы и колонцифры берутся из
 * дизайна (content.interior); те же правила рисуют HTML-превью на сайте (components/interior).
 * Порядок полос: титул, оборот титула, посвящение, оглавление, главы (начальная полоса, текст, фото),
 * галерея, финал. Каждая полоса — свой файл рядом.
 */
export function InteriorDocument({ content, options }: { content: BookContent; options: InteriorOptions }) {
  const kit = pdfKit(content, options);
    const pages: React.ReactNode[] = [<TitlePage key="title" kit={kit} />, <Colophon key="colophon" kit={kit} />];
  if (content.dedication) pages.push(<Dedication key="dedication" kit={kit} text={content.dedication} />);
  if (content.showToc && content.chapters.length) pages.push(<Toc key="toc" kit={kit} />);

  for (const ch of content.chapters) {
    pages.push(<Opener key={`open-${ch.key}`} kit={kit} chapterKey={ch.key} number={ch.number} title={ch.title} epigraph={ch.epigraph} photo={ch.openerPhoto} />);
    if (ch.items.length) pages.push(<ChapterBody key={`body-${ch.key}`} kit={kit} chapter={ch} />);
    photoPages(ch.photos).forEach((group, i) => pages.push(<PhotoPage key={`ph-${ch.key}-${i}`} kit={kit} group={group} />));
  }

  if (content.galleryPhotos.length) {
    pages.push(<Opener key="open-__gallery" kit={kit} chapterKey="__gallery" number={null} title={content.galleryTitle} />);
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
