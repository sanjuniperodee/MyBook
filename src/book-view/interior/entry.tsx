import { Fragment, type CSSProperties, type HTMLAttributes, type ImgHTMLAttributes, type ReactNode } from "react";
import { mm, MM_TO_PT, PT_TO_MM } from "@/lib/book/formats";
import { cssFont, naturalLineHeight, pdfLineCss, pdfLineTranslate } from "@/lib/book/fonts";
import { answerBlocks, rowsByBlock, type AnswerBlock } from "@/lib/book/answer-blocks";
import { layoutMedia, mediaCardBox, mediaIcon, mediaSource, qrDrawing, qrInk, type AnswerMedia } from "@/lib/book/answer-media";
import { framedBox, layoutInline, normalizeStyle, objectPosition, placedByAuthor, polaroidFontSize, ROW_GAP, rowSpaceAbove, rowSpaceLimit, type InlinePhotoStyle } from "@/lib/book/inline-photo";
import { dividerDrawing, vignetteDrawing } from "@/lib/book/interior-art";
import { PHOTO_COLORS } from "@/lib/book/interiors";
import { textArea } from "@/lib/book/page-geometry";
import { bookMessagesFor } from "@/i18n/messages/partial";
import { CHAPTER_TAIL, DIVIDER, HEADING, headingFace, HTML_LINE_HEIGHT, INLINE_ROW, MEDIA_CARD, quoteFace, VIGNETTE_RULE } from "@/lib/book/typesetting";
import { AnswerBlockView } from "./answer-block";
import { GAP_BELOW, gapAbove } from "./entry-gap";
import { keepWithNext } from "./keep";
import { breakBefore } from "./breaks";
import type { FlowDecisions } from "@/lib/book/flow-decisions";
import { lineSpans } from "./lines";
import { headingSpec, italicSpec, measureWidthPt } from "./text-specs";
import { InlineDrawing } from "./graphics";
import { metricsOf, type PageKit } from "./kit";
import { faceCss, italicBody, labelCss, measureCss } from "./typography";

/** Фото внутри ответа (как в PDF: после нужного абзаца, узкие — в ряд). */
interface EntryPhoto {
  id: string;
  url: string;
  width: number;
  height: number;
  caption: string;
  inline?: InlinePhotoStyle | null;
}

/** Ответ в вёрстке страницы: заголовок, абзацы, фото и QR-коды видео и музыки. */
export interface SampleEntry {
  heading: string | null;
  paragraphs: string[];
  /** Перед какими абзацами автор оставил пустую строку (строфы стихов) — номера абзацев (данные идут с сервера). */
  breaks?: readonly number[];
  photos?: EntryPhoto[];
  media?: AnswerMedia[];
  /** «С новой страницы»: перед историей — переход на следующую полосу. */
  pageBreak?: boolean;
  /** Продолжение истории после фото на всю страницу: без заголовка и разделителя. */
  continued?: boolean;
}

/** Заголовок вопроса в тексте главы (с акцентной линейкой, если она есть в дизайне). */
export function QuestionHeading({ kit, children, style, ...rest }: { kit: PageKit; children: ReactNode; style?: CSSProperties } & React.HTMLAttributes<HTMLDivElement>) {
  const { design, sizes: S, u } = kit;
  const { heading } = design;
  const scale = metricsOf(kit).scale;
  return (
    <div style={{ breakInside: "avoid", ...keepWithNext(kit), ...style }} {...rest}>
      {heading.bar ? (
        <div style={{ ...measureCss(kit), width: u.pt(HEADING.bar.width * scale), height: u.pt(HEADING.bar.thickness), background: design.palette.accent, marginBottom: u.pt(HEADING.bar.after * scale), ...(heading.align === "center" ? { marginInline: "auto" } : {}) }} />
      ) : null}
      <div
        style={{
          ...(heading.face
            ? faceCss(headingFace(design), S.heading, u)
            : { fontFamily: cssFont(design.type.heading), ...pdfLineCss(design.type.heading), fontWeight: design.type.headingWeight, fontStyle: design.type.headingItalic ? "italic" : "normal" }),
          ...measureCss(kit),
          fontSize: u.pt(S.heading),
          lineHeight: HEADING.lineHeight,
          color: heading.accent ? design.palette.accent : design.palette.ink,
          textAlign: heading.align,
          marginBottom: u.pt(S.afterHeading),
        }}
      >
        {typeof children === "string" ? (lineSpans({ kit, req: { text: children, spec: headingSpec(kit, S.heading), width: measureWidthPt(kit), hyphens: false, justify: false }, align: heading.align }) ?? children) : children}
      </div>
    </div>
  );
}

/** Разделитель между ответами без заголовка: «* * *», глиф или линейка. */
export function Divider({ kit, style, ...rest }: { kit: PageKit; style?: CSSProperties } & HTMLAttributes<HTMLDivElement>) {
  const { design, sizes: S, u } = kit;
  if (design.divider === "space") return <div {...rest} style={{ height: u.pt(S.body * 0.8), marginBottom: u.pt(S.beforeHeadless), ...keepWithNext(kit), ...style }} />;
  if (design.divider === "stars")
    return (
      // Шрифта у «* * *» в PDF нет — встроенный Helvetica (и его высота строки, HTML_LINE_HEIGHT.stars).
      <div {...rest} style={{ textAlign: "center", fontFamily: "Helvetica, Arial, sans-serif", color: design.palette.rule, fontSize: u.pt(S.body), lineHeight: HTML_LINE_HEIGHT.stars, marginBottom: u.pt(S.beforeHeadless), ...keepWithNext(kit), ...style }}>
        * * *
      </div>
    );
  // flow-root: отступ обёртки и собственный отступ глифа складываются, как в PDF, а не схлопываются.
  return (
    <div {...rest} style={{ display: "flow-root", ...keepWithNext(kit), ...style }}>
      <InlineDrawing
        drawing={dividerDrawing(design.ornament, design.divider, design.palette)}
        u={u}
        style={{ margin: `${u.pt(S.body * DIVIDER.before)} auto ${u.pt(S.beforeHeadless + S.body * DIVIDER.after)}` }}
      />
    </div>
  );
}

/** Концовка главы — небольшая виньетка после её текста, как в PDF (ChapterTail в pdf/interior/chapter-body.tsx). */
export function ChapterTail({ kit, style, ...rest }: { kit: PageKit; style?: CSSProperties } & HTMLAttributes<HTMLDivElement>) {
  const { design, sizes: S, u } = kit;
  return (
    <div {...rest} {...gapAbove(S.beforeHeading * CHAPTER_TAIL.before, u.pt).attrs} style={{ display: "flow-root", breakInside: "avoid", ...gapAbove(S.beforeHeading * CHAPTER_TAIL.before, u.pt).style, ...style }}>
      <InlineDrawing drawing={vignetteDrawing(design.ornament, VIGNETTE_RULE.end, design.palette)} u={u} style={{ margin: "0 auto" }} />
    </div>
  );
}

/** Высота строки подписи под фото (множитель кегля) — как у PDF: Text без lineHeight. */
export const captionLineHeight = (kit: PageKit) => {
  const q = quoteFace(kit.design);
  return naturalLineHeight(q.font, q.weight, !!q.italic);
};

export type RowItem<P extends EntryPhoto = EntryPhoto> = { p: P; style: InlinePhotoStyle };

/**
 * Рамка фото в ряду, мм — framedBox по полосе набора формата; space — отступ над рядом (мм), spaceLimit — наибольший
 * отступ этого ряда (доля полосы, rowSpaceLimit).
 */
export type RowPhotoBox = ReturnType<typeof framedBox> & { space: number; spaceLimit: number };

/**
 * Слой поверх фото в ряду — для превью редактора: атрибуты и обработчики фигуры, стиль рамки (выделение),
 * подпись img и элементы поверх (ручка размера). Вёрстка фото от слоя не меняется.
 */
export interface RowPhotoLayer {
  figure?: HTMLAttributes<HTMLElement> & { [data: `data-${string}`]: string | undefined };
  frame?: CSSProperties;
  img?: Pick<ImgHTMLAttributes<HTMLImageElement>, "alt" | "onLoad">;
  overlay?: ReactNode;
}

/** Фото в ряду: рамка или поляроид со своей подписью, размеры — как в PDF (inline-photo.ts). */
function RowPhoto<P extends EntryPhoto>({ kit, item, rowSize, space, scale = 1, layer }: { kit: PageKit; item: RowItem<P>; rowSize: number; space: { space: number; spaceLimit: number }; scale?: number; layer?: (item: RowItem<P>, box: RowPhotoBox) => RowPhotoLayer }) {
  const { design, sizes: S, u } = kit;
  const { p, style } = item;
  const { w: textW, h: textH } = textArea(kit.format);
  // Масштаб ряда из доводки (ряд уменьшен под свободное место полосы) — как в PDF: снимок и поля меньше, подпись та же.
  const box = framedBox(p, style, textW, textH, rowSize);
  const scaled = scale === 1 ? box : { ...box, outerW: box.outerW * scale, outerH: box.outerH * scale, imgW: box.imgW * scale, imgH: box.imgH * scale, pad: box.pad * scale, padBottom: box.padBottom * scale, radius: box.radius * scale };
  const b = { ...scaled, ...space };
  const polaroid = style.frame === "polaroid";
  const bw = polaroid ? INLINE_ROW.polaroidBorder : style.frame === "line" ? INLINE_ROW.lineBorder : 0;
  const extra = layer?.(item, b);
  return (
    <figure {...extra?.figure} style={{ width: u.mm(b.outerW), margin: 0, flex: "none", ...extra?.figure?.style }}>
      <div
        style={{
          position: "relative",
          width: u.mm(b.outerW),
          height: u.mm(b.outerH),
          padding: `${u.mm(b.pad)} ${u.mm(b.pad)} ${u.mm(b.padBottom)}`,
          background: polaroid ? PHOTO_COLORS.card : undefined,
          border: bw ? `${u.pt(bw)} solid ${polaroid ? PHOTO_COLORS.polaroidEdge : design.palette.ink}` : undefined,
          borderRadius: u.mm(b.radius),
          boxShadow: polaroid ? "0 1px 3px rgba(0,0,0,.12)" : undefined,
          overflow: "hidden",
          boxSizing: "border-box",
          ...extra?.frame,
        }}
      >
        {/* eslint-disable-next-line @next/next/no-img-element -- фото клиента в вёрстке страницы */}
        <img
          alt=""
          {...extra?.img}
          src={p.url}
          draggable={false}
          style={{ display: "block", width: "100%", height: u.mm(b.imgH - bw * 2 * PT_TO_MM), objectFit: "cover", objectPosition: objectPosition(p, style), borderRadius: u.mm(b.radius), maxWidth: "none" }}
        />
        {polaroid && p.caption ? (
          <div
            style={{
              position: "absolute",
              left: u.mm(b.pad),
              right: u.mm(b.pad),
              bottom: u.mm(b.padBottom * INLINE_ROW.polaroidCaption),
              fontFamily: cssFont("caveat"),
              ...pdfLineTranslate("caveat"),
              fontWeight: 500,
              fontSize: u.pt(polaroidFontSize({ imgW: mm(b.imgW), padBottom: mm(b.padBottom) }, p.caption, S.body)),
              lineHeight: HTML_LINE_HEIGHT.polaroidCaption,
              color: PHOTO_COLORS.polaroidInk,
              textAlign: "center",
              whiteSpace: "nowrap",
              overflow: "hidden",
            }}
          >
            {p.caption}
          </div>
        ) : null}
      </div>
      {!polaroid && p.caption ? (
        // Строки подписи — высотой, как у react-pdf (без интерлиньяжа: по метрикам шрифта): от них высота ряда.
        <figcaption style={{ ...italicBody(kit, S.caption), color: design.palette.muted, textAlign: "center", marginTop: u.pt(INLINE_ROW.captionGap), lineHeight: captionLineHeight(kit) }}>
          {/* Строки подписи — как у PDF (шириной в рамку снимка): от них высота ряда. */}
          {lineSpans({ kit, req: { text: p.caption, spec: italicSpec(kit, S.caption), width: b.outerW * MM_TO_PT, hyphens: false, justify: false }, align: "center" }) ?? p.caption}
        </figcaption>
      ) : null}
      {extra?.overlay}
    </figure>
  );
}

/**
 * Ряд фото внутри ответа — те же размеры, рамки и подписи, что в PDF (inline-photo.ts). layer — интерактивный
 * слой превью редактора над каждым фото; атрибуты ряда (data-*) ложатся на его обёртку. Отступ автора — padding
 * (на переносе в новую колонку браузер его не отбрасывает, как и react-pdf); «с новой страницы» — разрыв колонки,
 * кроме ряда, перед которым на полосе ничего нет (fresh).
 */
export function InlineRow<P extends EntryPhoto>({
  kit,
  row,
  layer,
  fresh = false,
  scale,
  offset = 0,
  ...rest
}: {
  kit: PageKit;
  row: RowItem<P>[];
  layer?: (item: RowItem<P>, box: RowPhotoBox) => RowPhotoLayer;
  /** Перед рядом на полосе ничего нет: «с новой страницы» разрыва не делает. */
  fresh?: boolean;
  /** Масштаб ряда из доводки вёрстки (flow.rowScale); нет — 1. Ряд, поставленный автором, доводка не уменьшает. */
  scale?: number;
  /** Отступ сверху, pt — ряд один на полосе, по центру (flow.rowOffset). */
  offset?: number;
} & HTMLAttributes<HTMLDivElement>) {
  const { sizes: S, u } = kit;
  const align = row[0].style.align;
  const { w: textW, h: textH } = textArea(kit.format);
  const space = { space: rowSpaceAbove(row, textW, textH), spaceLimit: rowSpaceLimit(row, textW, textH) };
  const breaks = !!row[0].style.breakBefore && !fresh;
  // Ряд, поставленный автором (отступ, «с новой страницы»): свой отступ сверху, доводка его не трогает — как в PDF.
  const own = placedByAuthor(row[0].style);
  const before = breaks ? 0 : S.body * INLINE_ROW.before;
  return (
    <div
      {...rest}
      {...GAP_BELOW}
      {...(before ? { "data-gap-above": String(before) } : {})}
      style={{
        display: "flex",
        justifyContent: align === "left" ? "flex-start" : align === "right" ? "flex-end" : "center",
        alignItems: "flex-start",
        gap: u.mm(textArea(kit.format).w * ROW_GAP),
        // Отбивки сверху и снизу — полями внутри ряда (entry-gap.ts), как у react-pdf: снизу — помещается на полосе
        // вместе с рядом, сверху — остаётся и на новой полосе; соседние не схлопываются. Сверху к отбивке — свой
        // отступ автора или сдвиг доводки (ряд по центру полосы).
        paddingBottom: u.pt(S.body * INLINE_ROW.after),
        paddingTop: `calc(${u.pt(before)} + ${own ? u.mm(space.space) : u.pt(offset)})`,
        breakBefore: breaks ? "column" : undefined,
        breakInside: "avoid",
        ...rest.style,
      }}
    >
      {row.map((item) => (
        <RowPhoto key={item.p.id} kit={kit} item={item} rowSize={row.length} space={space} scale={own ? 1 : scale} layer={layer} />
      ))}
    </div>
  );
}

/**
 * Карточка видео или музыки — как в PDF (media-card.tsx): QR-код, вид и площадка, подпись и подсказка «наведите
 * камеру»; размеры — mediaCardBox. href — карточка ещё и ссылка (листаемая книга на сайте), атрибуты — на обёртку.
 */
export function MediaCard({ kit, media, href, ...rest }: { kit: PageKit; media: AnswerMedia; href?: string } & HTMLAttributes<HTMLDivElement>) {
  const { design, sizes: S, u } = kit;
  const { palette: P, type: typo } = design;
  const scale = metricsOf(kit).scale;
  const box = mediaCardBox(textArea(kit.format).w * MM_TO_PT, scale);
  const t = bookMessagesFor(kit.language).media;
  const source = mediaSource(media.url);
  const card = (
    <div
      style={{
        display: "flex",
        alignItems: "center",
        width: u.pt(box.width),
        height: u.pt(box.height),
        padding: u.pt(box.pad),
        border: `${u.pt(box.border)} solid ${P.rule}`,
        borderRadius: u.pt(box.radius),
        boxSizing: "border-box",
        color: P.ink,
        textDecoration: "none",
      }}
    >
      <InlineDrawing drawing={qrDrawing(media.url, box.qr, qrInk(P.ink))} u={u} />
      <div style={{ width: u.pt(box.textWidth), marginLeft: u.pt(box.gap), minWidth: 0 }}>
        <div style={{ display: "flex", alignItems: "center", gap: u.pt(4 * scale) }}>
          <InlineDrawing drawing={mediaIcon(media.kind, S.label * MEDIA_CARD.icon, P.accent)} u={u} />
          <span style={{ ...labelCss(kit, P.accent), whiteSpace: "nowrap", overflow: "hidden", textOverflow: "ellipsis" }}>{source ? `${t[media.kind]} · ${source}` : t[media.kind]}</span>
        </div>
        {media.title ? (
          <div
            style={{
              fontFamily: cssFont(typo.heading),
              ...pdfLineCss(typo.heading),
              fontWeight: typo.headingWeight,
              fontStyle: typo.headingItalic ? "italic" : "normal",
              fontSize: u.pt(S.body * MEDIA_CARD.title.size),
              lineHeight: MEDIA_CARD.title.lineHeight,
              marginTop: u.pt(MEDIA_CARD.labelGap * scale),
              display: "-webkit-box",
              WebkitLineClamp: MEDIA_CARD.title.maxLines,
              WebkitBoxOrient: "vertical",
              overflow: "hidden",
              overflowWrap: "anywhere",
            }}
          >
            {media.title}
          </div>
        ) : null}
        <div style={{ ...italicBody(kit, S.caption), lineHeight: 1.3, color: P.muted, marginTop: u.pt(MEDIA_CARD.noteGap * scale) }}>{t.scan[media.kind]}</div>
      </div>
    </div>
  );
  return (
    // Отбивка снизу — полем внутри, как у ряда фото (InlineRow): неделимый блок PDF занимает её на полосе.
    <div {...rest} {...GAP_BELOW} {...gapAbove(S.body * MEDIA_CARD.before, u.pt).attrs} style={{ ...gapAbove(S.body * MEDIA_CARD.before, u.pt).style, paddingBottom: u.pt(S.body * MEDIA_CARD.after), breakInside: "avoid", display: "flow-root", ...rest.style }}>
      {href ? (
        <a href={href} target="_blank" rel="noopener noreferrer" style={{ color: "inherit", textDecoration: "none" }}>
          {card}
        </a>
      ) : (
        card
      )}
    </div>
  );
}

/** Ответ целиком: блоки набора, фото и QR-коды между ними, как в PDF (в одном месте — сначала фото). */
/** Абзац до стольких знаков держим на полосе вместе с заголовком; длиннее — заголовку хватает «трёх строк» (orphans). */
const KEEP_WITH_HEAD_CHARS = 700;

/**
 * head — заголовок или разделитель ответа: он ставится в одну неразрывную обёртку с первым блоком (рядом фото или
 * коротким абзацем). Так заголовок не остаётся внизу полосы и в Safari, где break-after: avoid в колонках не работает.
 */
export function EntryBody({
  kit,
  entry,
  leadIn,
  start = false,
  links = false,
  head,
  fresh = false,
  id,
  flow,
}: {
  kit: PageKit;
  entry: SampleEntry;
  leadIn: boolean;
  /** Ответ открывает главу: буквица. */
  start?: boolean;
  links?: boolean;
  head?: ReactNode;
  /** Ответ стоит в верху полосы: первому ряду «с новой страницы» разрыв не нужен. */
  fresh?: boolean;
  /**
   * Пометка ответа и решения доводки — полосы, как у PDF (pdf-tree.ts): блоки помечены, ряды уменьшены и сдвинуты,
   * разрывы ставит kit.breaks, заголовок с абзацем не склеивается. Нет — полосы ставит браузер.
   */
  id?: string;
  flow?: FlowDecisions;
}) {
  const blocks = answerBlocks(entry.paragraphs, { plain: kit.design.plainAnswers, breaks: new Set(entry.breaks) });
  const items = (entry.photos ?? []).map((p) => ({ p, style: normalizeStyle(p.inline) }));
  const rows = rowsByBlock(blocks, layoutInline(items, entry.paragraphs.length));
  const media = rowsByBlock(blocks, layoutMedia(entry.media ?? [], entry.paragraphs.length));
  const lead = blocks.length ? -1 : Number.POSITIVE_INFINITY;
  const exact = id !== undefined && !!flow;
  const rowsAt = (key: number) => [
    ...(rows.get(key) ?? []).map((row, r) => {
      const mark = `${placedByAuthor(row[0].style) ? "f" : "r"}:${id}:${key}:${r}`;
      return exact ? (
        <InlineRow key={`${key}-${r}`} kit={kit} row={row} fresh={fresh && !head && key === lead && r === 0} scale={flow.rowScale.get(mark)} offset={flow.rowOffset.get(mark)} style={breakBefore(kit, mark)} data-flow={mark} />
      ) : (
        <InlineRow key={`${key}-${r}`} kit={kit} row={row} fresh={fresh && !head && key === lead && r === 0} />
      );
    }),
    ...(media.get(key) ?? []).map((m) => {
      const mark = `b:${id}:m${key}:${m.id}`;
      return <MediaCard key={`${key}-m-${m.id}`} kit={kit} media={m} href={links ? m.url : undefined} {...(exact ? { "data-flow": mark, style: breakBefore(kit, mark) } : {})} />;
    }),
  ];
  if (exact)
    return (
      <>
        {head}
        {blocks.length ? rowsAt(-1) : null}
        {blocks.map((b, j) => (
          <Fragment key={j}>
            <AnswerBlockView kit={kit} block={b} leadIn={leadIn && j === 0} dropCap={start && j === 0} first={j === 0} data-flow={`${b.kind === "lede" ? "k" : "b"}:${id}:${j}`} />
            {j < blocks.length - 1 ? rowsAt(j) : null}
          </Fragment>
        ))}
        {rowsAt(Number.POSITIVE_INFINITY)}
      </>
    );
  const before = blocks.length ? rowsAt(-1) : [];
  const tail = rowsAt(Number.POSITIVE_INFINITY);
  // Что держать вместе с заголовком: ряд фото перед текстом, иначе короткий первый блок, а без текста — первое фото.
  const keep: "rows" | "block" | "tail" | null = !head ? null : before.length ? "rows" : blocks.length ? (blockChars(blocks[0]) <= KEEP_WITH_HEAD_CHARS ? "block" : null) : tail.length ? "tail" : null;
  const block = (b: AnswerBlock, j: number) => (
    // Под заголовком на той же полосе — не меньше трёх строк (как в PDF), иначе заголовок с абзацем — на следующую.
    <AnswerBlockView kit={kit} block={b} leadIn={leadIn && j === 0} dropCap={start && j === 0} first={j === 0} style={j === 0 && entry.heading && !before.length ? { orphans: 3 } : undefined} />
  );
  return (
    <>
      {head ? (
        <div style={{ breakInside: "avoid" }}>
          {head}
          {keep === "rows" ? before : keep === "block" ? block(blocks[0], 0) : keep === "tail" ? tail.slice(0, 1) : null}
        </div>
      ) : null}
      {keep === "rows" ? null : before}
      {blocks.map((b, j) => (
        <Fragment key={j}>
          {keep === "block" && j === 0 ? null : block(b, j)}
          {j < blocks.length - 1 ? rowsAt(j) : null}
        </Fragment>
      ))}
      {keep === "tail" ? tail.slice(1) : tail}
    </>
  );
}

/** Знаков в блоке набора — чтобы решить, держать ли его на полосе вместе с заголовком. */
function blockChars(b: AnswerBlock): number {
  switch (b.kind) {
    case "para":
    case "lede":
    case "strong":
      return b.text.length;
    case "quote":
    case "verse":
      return b.lines.join(" ").length;
    case "list":
      return b.items.reduce((n, it) => n + it.text.length, 0);
  }
}

export { keepWithNext };
