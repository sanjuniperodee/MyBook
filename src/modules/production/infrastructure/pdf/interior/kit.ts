import "server-only";
import type { Style } from "@react-pdf/stylesheet";
import { messagesFor, type Messages } from "@/i18n/messages";
import type { BookPageKind } from "@/lib/book/book-build";
import { mm, type BookFormat } from "@/lib/book/formats";
import { emptyFlow, type FlowDecisions } from "@/lib/book/flow-decisions";
import type { BookContent } from "@/lib/book/layout";
import { interiorMetrics, openerFlow, pageBox, pageSide, textArea } from "@/lib/book/page-geometry";
import type { PageBox } from "@/lib/book/interior-art";
import { chapterDesign, PAPER, type InteriorDesign, type TextFace } from "@/lib/book/interiors";
import { bodyAlign, bodyWeight, interiorSizes, measureInsets, quoteFace, trackingPt, type InteriorSizes } from "@/lib/book/typesetting";
import { face } from "@/modules/production/infrastructure/pdf/fonts";
import { FLOW_MARK } from "@/modules/production/infrastructure/pdf/flow";
import { PAGE_MARK } from "@/modules/production/infrastructure/pdf/pages";

export interface PreparedImage {
  data: Buffer;
  width: number;
  height: number;
}

export interface InteriorOptions {
  bleedMm: number;
  /** Номера страниц глав для оглавления (из первого прохода). */
  tocPages?: Record<string, number>;
  onChapterPage?: (key: string, page: number) => void;
  images: Map<string, PreparedImage>;
  /** Решения доводки вёрстки из прошлого прохода (см. lib/book/flow-decisions.ts). */
  flow?: FlowDecisions;
  /** Готовая раскладка — для следующего прохода доводки. */
  onLayout?: (layout: unknown) => void;
  /** Сюда записывается высота фото в каждом ряду (без подписи), pt — для доводки. */
  rowHeights?: Map<string, number>;
  /** Электронная версия: QR-коды в ответах ещё и ссылки (в печатных файлах ссылок нет). */
  links?: boolean;
  /** Сюда записывается текст колонки рядом с каждой буквицей и число её строк — для доводки (pdf/flow.ts refineDropCaps). */
  dropColumns?: Map<string, { text: string; lines: number }>;
}

/** Всё, что нужно любой полосе блока: содержимое, дизайн, кегли, поля, стили основного текста и решения доводки. */
export interface PdfKit {
  content: BookContent;
  options: InteriorOptions;
  design: InteriorDesign;
  format: BookFormat;
  /** Служебные надписи книги на её языке («Глава N», «Содержание»). */
  t: Messages["book"];
  sizes: InteriorSizes;
  /** Масштаб формата относительно A5. */
  scale: number;
  /** Вылет под обрез, мм. */
  bleed: number;
  /** Полоса с вылетами, pt. */
  pageSize: { width: number; height: number };
  /** Поле слева и справа, мм. */
  side: number;
  /** Полоса в мм вместе с вылетами — для слоёв графики. */
  box: PageBox;
  /** Полоса набора, pt. */
  textWidthPt: number;
  textHeightPt: number;
  /** Где на начальной полосе начинается текст главы и какой масштаб у рисунка дизайна. */
  openerAt: ReturnType<typeof openerFlow>;
  flow: FlowDecisions;
  /** Поля и бумага полосы. */
  pagePadding: Style;
  /** Основной текст. */
  body: Style;
  /** Начертание цитат, лида, эпиграфов, посвящения и подзаголовка (по умолчанию курсив основного шрифта). */
  italicBody: Style;
  /** Бумага полос. */
  paper: string;
  /** Узкая колонка текста: поля слева и справа внутри полосы набора, pt (без узкой колонки — пусто). */
  measure: Style;
}

export function pdfKit(content: BookContent, options: InteriorOptions): PdfKit {
  const { format, interior: design } = content;
  const { scale, marginTop, marginBottom } = interiorMetrics[format.id];
  const bleed = options.bleedMm;
  const side = pageSide(format);
  const typeArea = textArea(format);
  const typo = design.type;
  const sizes = interiorSizes(design, scale);
  const paper = design.paper ?? PAPER;
  const inset = measureInsets(design);
  const q = quoteFace(design);
  return {
    content,
    options,
    design,
    format,
    t: messagesFor(content.language).book,
    sizes,
    scale,
    bleed,
    pageSize: { width: mm(format.widthMm + bleed * 2), height: mm(format.heightMm + bleed * 2) },
    side,
    box: pageBox(format, bleed),
    textWidthPt: mm(typeArea.w),
    textHeightPt: mm(typeArea.h),
    openerAt: openerFlow(format, design),
    flow: options.flow ?? emptyFlow(),
    pagePadding: {
      paddingTop: mm(bleed + marginTop),
      paddingBottom: mm(bleed + marginBottom),
      paddingLeft: mm(bleed + side),
      paddingRight: mm(bleed + side),
      backgroundColor: paper,
    },
    body: {
      ...face(typo.body, bodyWeight(design)),
      fontSize: sizes.body,
      lineHeight: typo.lineHeight,
      color: design.palette.ink,
      textAlign: bodyAlign(design),
      ...(design.text?.tracking ? { letterSpacing: design.text.tracking * sizes.body } : {}),
    },
    italicBody: { ...face(q.font, q.weight, q.italic), ...(q.upper ? { textTransform: "uppercase" as const } : {}) },
    paper,
    measure: inset.left || inset.right ? { marginLeft: mm(typeArea.w) * inset.left, marginRight: mm(typeArea.w) * inset.right } : {},
  };
}

/** Пометка блока для доводки вёрстки (react-pdf сохраняет её в раскладке). */
export const mark = (id: string) => ({ [FLOW_MARK]: id }) as object;

/** Пометка страницы блока: вид полосы и глава — для манифеста сборки (pdf/pages.ts). Нужна у каждой <Page>. */
export const pageMark = (kind: BookPageKind, chapterKey?: string) => ({ [PAGE_MARK]: chapterKey === undefined ? { kind } : { kind, chapterKey } }) as object;

/** Без переносов: в крупных надписях (название, главы, заголовки, подписи) и выделенных строках перенос выглядит как ошибка — переносы только в основном тексте. */
export const noHyphens = (word: string) => [word];

/** Начертание из дизайна: шрифт, регистр и разрядка. */
export function textFace(f: TextFace, size: number): Style {
  return {
    ...face(f.font, f.weight, f.italic),
    fontSize: size,
    textTransform: f.upper ? "uppercase" : undefined,
    letterSpacing: f.tracking ? trackingPt(f, size) : undefined,
  };
}

/** Служебная надпись прописными; разрядка — от базового кегля подписи, как в прежней вёрстке. */
export function labelStyle(kit: PdfKit, color: string, size = kit.sizes.label): Style {
  const { label } = kit.design;
  return {
    ...face(label.font, label.weight, label.italic),
    fontSize: size,
    letterSpacing: trackingPt(label, kit.sizes.label),
    textTransform: label.upper ? "uppercase" : undefined,
    color,
  };
}

/** Набор для главы со своим оформлением (design.chapters); у остальных глав — тот же набор. */
export function chapterKit(kit: PdfKit, chapterKey: string): PdfKit {
  const design = chapterDesign(kit.design, chapterKey);
  return design === kit.design ? kit : pdfKit({ ...kit.content, interior: design }, kit.options);
}
