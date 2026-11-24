import "server-only";
import { Document } from "@react-pdf/renderer";
import { site } from "@/config/site";
import { chapterRuns, photoPages, type BookContent } from "@/lib/book/layout";
import { GALLERY_KEY, hasToc, printedGalleryTitle } from "@/lib/book/toc";
import { BlankPage } from "./blank-page";
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
 * Порядок полос: титул, оборот титула (оба — если не выключены: content.titlePage), посвящение, оглавление, главы (начальная полоса, текст, фото),
 * галерея, финал. У книг с content.openersLeft начальная полоса главы и альбома всегда слева: где по счёту она выпала бы
 * справа, перед ней пустая полоса (какие — решает доводка вёрстки по прошлому проходу, flow.blankBefore). Каждая полоса — свой файл рядом и помечена видом (pageMark) для манифеста сборки.
 * Водяного знака в вёрстке нет: сборка одна для экрана и печати, знак ставится поверх готового PDF (pdf/watermark.tsx).
 */
/**
 * Часть блока: всё до глав (front), у главы — пустая полоса и начальная (…:head), куски текста между разрывами
 * (…:<кусок>:<первый ответ>), фото на всю страницу (…:p<кусок>) и фотостраницы (…:photos), альбом и финал.
 * items — ответы, чьи решения доводки меняют часть; tail — глава, чья концовка в части; blank — пустая полоса перед.
 */
export interface InteriorGroup {
  key: string;
  pages: React.ReactNode[];
  items?: string[];
  tail?: string;
  blank?: string;
  /** Кусок текста главы с другого места: с блока begin (он в верху полосы) до блока end — черновой проход. */
  window?: (begin: { item: string; mark: string } | null, end: { item: string; mark: string } | null) => React.ReactNode;
}

export const FRONT_GROUP = "front";
export const GALLERY_GROUP = "gallery";
export const END_GROUP = "end";

/**
 * Полосы блока по частям. Каждая часть — свои Page: глава начинается с новой полосы, ответ с разрывом — тоже, и
 * раскладка части от соседних не зависит (колонтитулы и колонцифры — абсолютные, по номеру полосы ничего не сдвигают;
 * правило minPresenceAhead у верхних блоков полосы — ответов — не задано). Поэтому черновые проходы доводки верстают
 * только части, где поменялись решения (pdf/drafts.tsx), а итоговая сборка — всё подряд (InteriorDocument).
 */
export function interiorGroups(content: BookContent, options: InteriorOptions, split = false): InteriorGroup[] {
  const base = pdfKit(content, options);
  const kit = base;
  const groups: InteriorGroup[] = [];
  // Без титула (content.titlePage === false) нет и его оборота: две полосы, чётность дальше не сдвигается.
  const front: React.ReactNode[] = content.titlePage === false ? [] : [<TitlePage key="title" kit={kit} />, <Colophon key="colophon" kit={kit} />];
  if (content.dedication) front.push(<Dedication key="dedication" kit={kit} text={content.dedication} />);
  if (hasToc(content)) front.push(<Toc key="toc" kit={kit} />);
  groups.push({ key: FRONT_GROUP, pages: front });
  const blank = (pages: React.ReactNode[], key: string) => {
    if (content.openersLeft && kit.flow.blankBefore.has(key)) pages.push(<BlankPage key={`blank-${key}`} kit={kit} />);
  };

  for (const ch of content.chapters) {
    // Глава со своим оформлением (дизайнер) — свой набор; остальные главы — общий.
    const kit = chapterKit(base, ch.key);
    // Без начальных полос (content.chapterStart) глава начинается с полосы текста: номер и название над ним (inline)
    // или чистый лист (none) — полосу главы тогда сообщает метка вверху первой полосы (ChapterBody).
    const noOpener = !!content.chapterStart;
    if (!noOpener) {
      const pages: React.ReactNode[] = [];
      blank(pages, ch.key);
      pages.push(<Opener key={`open-${ch.key}`} kit={kit} chapterKey={ch.key} number={ch.number} title={ch.title} epigraph={ch.epigraph} photo={ch.openerPhoto} />);
      groups.push({ key: `ch:${ch.key}:head`, pages, blank: ch.key });
    }
    // Текст главы — кусками: между ними фото на всю страницу из историй (под обрез, без колонтитула).
    const runs = chapterRuns(ch.items);
    const lastText = runs.findLastIndex((r) => r.items.length);
    runs.forEach((run, i) => {
      // Первый кусок без начальной полосы несёт заголовок главы — даже пустой (глава начинается с фото на всю страницу).
      if (run.items.length || (noOpener && i === 0)) {
        const props = { kit, chapter: ch, items: run.items, first: i === 0, tail: i === lastText };
        // Куски между разрывами (решение доводки или «с новой страницы»): ответ с разрывом начинает полосу.
        // Итоговая сборка (split = false) — кусок целиком, одной полосой Page, как всегда.
        const starts = [0, ...(split ? run.items.flatMap((it, k) => (k > 0 && (kit.flow.breakBefore.has(it.id) || it.pageBreak) ? [k] : [])) : [])];
        starts.forEach((from, j) => {
          const to = starts[j + 1] ?? run.items.length;
          groups.push({
            key: `ch:${ch.key}:${i}:${run.items[from]?.id ?? ""}`,
            pages: [split ? <ChapterBody key={`body-${ch.key}-${i}-${from}`} {...props} from={from} to={to} /> : <ChapterBody key={`body-${ch.key}-${i}`} {...props} />],
            items: run.items.slice(from, to).map((it) => it.id),
            ...(props.tail && to === run.items.length ? { tail: ch.key } : {}),
            window: (begin, end) => {
              const at = begin ? run.items.findIndex((it) => it.id === begin.item) : from;
              return <ChapterBody key={`body-${ch.key}-${i}-${from}-w`} {...props} from={at} to={to} begin={begin?.mark} end={end ?? undefined} />;
            },
          });
        });
      }
      if (run.photo) groups.push({ key: `ch:${ch.key}:p${i}`, pages: [<PhotoPage key={`pp-${ch.key}-${i}`} kit={kit} group={[run.photo]} chapterKey={ch.key} />] });
    });
    const photos = photoPages(ch.photos).map((group, i) => <PhotoPage key={`ph-${ch.key}-${i}`} kit={kit} group={group} chapterKey={ch.key} />);
    if (photos.length) groups.push({ key: `ch:${ch.key}:photos`, pages: photos });
  }

  if (content.galleryPhotos.length) {
    const pages: React.ReactNode[] = [];
    blank(pages, GALLERY_KEY);
    pages.push(<Opener key="open-__gallery" kit={kit} chapterKey={GALLERY_KEY} number={null} title={printedGalleryTitle(content)} photo={content.galleryOpenerPhoto} />);
    photoPages(content.galleryPhotos).forEach((group, i) => pages.push(<PhotoPage key={`ph-gallery-${i}`} kit={kit} group={group} />));
    groups.push({ key: GALLERY_GROUP, pages, blank: GALLERY_KEY });
  }

  groups.push({ key: END_GROUP, pages: [<EndPage key="end" kit={kit} />] });
  return groups;
}

/** Блок целиком (итоговая сборка). */
export function InteriorDocument({ content, options }: { content: BookContent; options: InteriorOptions }) {
  // Сразу документ (а не элемент InteriorPages): его полосы видны и тем, кто разбирает дерево (тесты).
  return InteriorPages({ content, options, pages: interiorGroups(content, options).flatMap((g) => g.pages) });
}

/** Документ из полос pages (черновой проход доводки — одна часть блока). */
export function InteriorPages({ content, options, pages }: { content: BookContent; options: InteriorOptions; pages: React.ReactNode[] }) {
  return (
    <Document
      // Раскладку react-pdf отдаёт только во внутреннем поле onRender — другого способа узнать, где что встало, нет.
      onRender={options.onLayout ? (r) => options.onLayout?.((r as { _INTERNAL__LAYOUT__DATA_?: unknown })._INTERNAL__LAYOUT__DATA_) : undefined}
      title={content.title} author={content.authorName || site.name} creator={site.name} producer={site.name} language={content.language}>
      {pages}
    </Document>
  );
}
