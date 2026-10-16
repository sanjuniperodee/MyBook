import "server-only";
import type { Style } from "@react-pdf/stylesheet";
import { messagesFor, type Messages } from "@/i18n/messages";
import { mm, type BookFormat } from "@/lib/book/formats";
import { emptyFlow, type FlowDecisions } from "@/lib/book/flow-decisions";
import type { BookContent } from "@/lib/book/layout";
import { interiorMetrics, openerFlow, pageBox, pageSide, textArea } from "@/lib/book/page-geometry";
import type { PageBox } from "@/lib/book/interior-art";
import { PAPER, type InteriorDesign, type TextFace } from "@/lib/book/interiors";
import { interiorSizes, trackingPt, type InteriorSizes } from "@/lib/book/typesetting";
import { face } from "@/modules/production/infrastructure/pdf/fonts";
import { FLOW_MARK } from "@/modules/production/infrastructure/pdf/flow";

export interface PreparedImage {
  data: Buffer;
  width: number;
  height: number;
}

export interface InteriorOptions {
  bleedMm: number;
  watermark: boolean;
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
  italicBody: Style;
}

export function pdfKit(content: BookContent, options: InteriorOptions): PdfKit {
  const { format, interior: design } = content;
  const { scale, marginTop, marginBottom } = interiorMetrics[format.id];
  const bleed = options.bleedMm;
  const side = pageSide(format);
  const typeArea = textArea(format);
  const typo = design.type;
  const sizes = interiorSizes(design, scale);
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
      backgroundColor: PAPER,
    },
    body: {
      ...face(typo.body, 400),
      fontSize: sizes.body,
      lineHeight: typo.lineHeight,
      color: design.palette.ink,
      textAlign: "justify",
    },
    italicBody: face(typo.body, 400, true),
  };
}

/** Пометка блока для доводки вёрстки (react-pdf сохраняет её в раскладке). */
export const mark = (id: string) => ({ [FLOW_MARK]: id }) as object;

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
