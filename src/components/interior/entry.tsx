import { Fragment, type CSSProperties, type HTMLAttributes, type ImgHTMLAttributes, type ReactNode } from "react";
import { mm, MM_TO_PT, PT_TO_MM } from "@/lib/book/formats";
import { cssFont } from "@/lib/book/fonts";
import { answerBlocks, rowsByBlock } from "@/lib/book/answer-blocks";
import { layoutMedia, mediaCardBox, mediaIcon, mediaSource, qrDrawing, qrInk, type AnswerMedia } from "@/lib/book/answer-media";
import { framedBox, layoutInline, normalizeStyle, objectPosition, polaroidFontSize, ROW_GAP, type InlinePhotoStyle } from "@/lib/book/inline-photo";
import { dividerDrawing, vignetteDrawing } from "@/lib/book/interior-art";
import { PHOTO_COLORS } from "@/lib/book/interiors";
import { textArea } from "@/lib/book/page-geometry";
import { bookMessagesFor } from "@/i18n/messages/partial";
import { CHAPTER_TAIL, DIVIDER, HEADING, HTML_LINE_HEIGHT, INLINE_ROW, MEDIA_CARD, VIGNETTE_RULE } from "@/lib/book/typesetting";
import { AnswerBlockView } from "./answer-block";
import { InlineDrawing } from "./graphics";
import { metricsOf, type PageKit } from "./kit";
import { italicBody, labelCss } from "./typography";

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
  photos?: EntryPhoto[];
  media?: AnswerMedia[];
}

/** Концовка главы — небольшая виньетка после последнего ответа, как в PDF. */
export function ChapterTail({ kit }: { kit: PageKit }) {
  return (
    <div style={{ display: "flex", justifyContent: "center", breakBefore: "avoid", breakInside: "avoid", marginTop: kit.u.pt(kit.sizes.beforeHeading * CHAPTER_TAIL.before) }}>
      <InlineDrawing drawing={vignetteDrawing(kit.design.ornament, VIGNETTE_RULE.end, kit.design.palette)} u={kit.u} />
    </div>
  );
}

/** Заголовок вопроса в тексте главы (с акцентной линейкой, если она есть в дизайне). */
export function QuestionHeading({ kit, children, style, ...rest }: { kit: PageKit; children: ReactNode; style?: CSSProperties } & React.HTMLAttributes<HTMLDivElement>) {
  const { design, sizes: S, u } = kit;
  const { heading } = design;
  const scale = metricsOf(kit).scale;
  return (
    <div style={{ breakInside: "avoid", breakAfter: "avoid", ...style }} {...rest}>
      {heading.bar ? (
        <div style={{ width: u.pt(HEADING.bar.width * scale), height: u.pt(HEADING.bar.thickness), background: design.palette.accent, marginBottom: u.pt(HEADING.bar.after * scale), marginInline: heading.align === "center" ? "auto" : undefined }} />
      ) : null}
      <div
        style={{
          fontFamily: cssFont(design.type.heading),
          fontWeight: design.type.headingWeight,
          fontStyle: design.type.headingItalic ? "italic" : "normal",
          fontSize: u.pt(S.heading),
          lineHeight: HEADING.lineHeight,
          color: heading.accent ? design.palette.accent : design.palette.ink,
          textAlign: heading.align,
          marginBottom: u.pt(S.afterHeading),
        }}
      >
        {children}
      </div>
    </div>
  );
}

/** Разделитель между ответами без заголовка: «* * *», глиф или линейка. */
export function Divider({ kit, style }: { kit: PageKit; style?: CSSProperties }) {
  const { design, sizes: S, u } = kit;
  if (design.divider === "stars")
    return <div style={{ textAlign: "center", color: design.palette.rule, fontSize: u.pt(S.body), lineHeight: HTML_LINE_HEIGHT.stars, marginBottom: u.pt(S.beforeHeadless), breakAfter: "avoid", ...style }}>* * *</div>;
  // flow-root: отступ обёртки и собственный отступ глифа складываются, как в PDF, а не схлопываются.
  return (
    <div style={{ display: "flow-root", breakAfter: "avoid", ...style }}>
      <InlineDrawing
        drawing={dividerDrawing(design.ornament, design.divider, design.palette)}
        u={u}
        style={{ margin: `${u.pt(S.body * DIVIDER.before)} auto ${u.pt(S.beforeHeadless + S.body * DIVIDER.after)}` }}
      />
    </div>
  );
}

export type RowItem<P extends EntryPhoto = EntryPhoto> = { p: P; style: InlinePhotoStyle };

/** Рамка фото в ряду, мм — framedBox по полосе набора формата. */
export type RowPhotoBox = ReturnType<typeof framedBox>;

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
function RowPhoto<P extends EntryPhoto>({ kit, item, rowSize, layer }: { kit: PageKit; item: RowItem<P>; rowSize: number; layer?: (item: RowItem<P>, box: RowPhotoBox) => RowPhotoLayer }) {
  const { design, sizes: S, u } = kit;
  const { p, style } = item;
  const { w: textW, h: textH } = textArea(kit.format);
  const b = framedBox(p, style, textW, textH, rowSize);
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
      {!polaroid && p.caption ? <figcaption style={{ ...italicBody(kit, S.caption), color: design.palette.muted, textAlign: "center", marginTop: u.pt(INLINE_ROW.captionGap), lineHeight: HTML_LINE_HEIGHT.caption }}>{p.caption}</figcaption> : null}
      {extra?.overlay}
    </figure>
  );
}

/**
 * Ряд фото внутри ответа — те же размеры, рамки и подписи, что в PDF (inline-photo.ts). layer — интерактивный
 * слой превью редактора над каждым фото; атрибуты ряда (data-*) ложатся на его обёртку.
 */
export function InlineRow<P extends EntryPhoto>({
  kit,
  row,
  layer,
  ...rest
}: { kit: PageKit; row: RowItem<P>[]; layer?: (item: RowItem<P>, box: RowPhotoBox) => RowPhotoLayer } & HTMLAttributes<HTMLDivElement>) {
  const { sizes: S, u } = kit;
  const align = row[0].style.align;
  return (
    <div
      {...rest}
      style={{
        display: "flex",
        justifyContent: align === "left" ? "flex-start" : align === "right" ? "flex-end" : "center",
        alignItems: "flex-start",
        gap: u.mm(textArea(kit.format).w * ROW_GAP),
        marginTop: u.pt(S.body * INLINE_ROW.before),
        marginBottom: u.pt(S.body * INLINE_ROW.after),
        breakInside: "avoid",
        ...rest.style,
      }}
    >
      {row.map((item) => (
        <RowPhoto key={item.p.id} kit={kit} item={item} rowSize={row.length} layer={layer} />
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
    <div {...rest} style={{ marginTop: u.pt(S.body * MEDIA_CARD.before), marginBottom: u.pt(S.body * MEDIA_CARD.after), breakInside: "avoid", display: "flow-root", ...rest.style }}>
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
export function EntryBody({ kit, entry, leadIn, links = false }: { kit: PageKit; entry: SampleEntry; leadIn: boolean; links?: boolean }) {
  const blocks = answerBlocks(entry.paragraphs);
  const items = (entry.photos ?? []).map((p) => ({ p, style: normalizeStyle(p.inline) }));
  const rows = rowsByBlock(blocks, layoutInline(items, entry.paragraphs.length));
  const media = rowsByBlock(blocks, layoutMedia(entry.media ?? [], entry.paragraphs.length));
  const rowsAt = (key: number) => [
    ...(rows.get(key) ?? []).map((row, r) => <InlineRow key={`${key}-${r}`} kit={kit} row={row} />),
    ...(media.get(key) ?? []).map((m) => <MediaCard key={`${key}-m-${m.id}`} kit={kit} media={m} href={links ? m.url : undefined} />),
  ];
  return (
    <>
      {blocks.length ? rowsAt(-1) : null}
      {blocks.map((b, j) => (
        <Fragment key={j}>
          <AnswerBlockView kit={kit} block={b} leadIn={leadIn && j === 0} />
          {j < blocks.length - 1 ? rowsAt(j) : null}
        </Fragment>
      ))}
      {rowsAt(Number.POSITIVE_INFINITY)}
    </>
  );
}
