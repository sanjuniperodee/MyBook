import { Fragment, type CSSProperties, type ReactNode } from "react";
import { mm, PT_TO_MM } from "@/lib/book/formats";
import { cssFont } from "@/lib/book/fonts";
import { answerBlocks, rowsByBlock } from "@/lib/book/answer-blocks";
import { framedBox, layoutInline, normalizeStyle, objectPosition, polaroidFontSize, ROW_GAP, type InlinePhotoStyle } from "@/lib/book/inline-photo";
import { dividerDrawing, vignetteDrawing } from "@/lib/book/interior-art";
import { PHOTO_COLORS } from "@/lib/book/interiors";
import { textArea } from "@/lib/book/page-geometry";
import { CHAPTER_TAIL, DIVIDER, HEADING, HTML_LINE_HEIGHT, INLINE_ROW, VIGNETTE_RULE } from "@/lib/book/typesetting";
import { AnswerBlockView } from "./answer-block";
import { InlineDrawing } from "./graphics";
import { metricsOf, type PageKit } from "./kit";
import { italicBody } from "./typography";

/** Фото внутри ответа (как в PDF: после нужного абзаца, узкие — в ряд). */
interface EntryPhoto {
  id: string;
  url: string;
  width: number;
  height: number;
  caption: string;
  inline?: InlinePhotoStyle | null;
}

/** Ответ в вёрстке страницы: заголовок, абзацы и фото. */
export interface SampleEntry {
  heading: string | null;
  paragraphs: string[];
  photos?: EntryPhoto[];
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

type RowItem = { p: EntryPhoto; style: InlinePhotoStyle };

/** Фото в ряду: рамка или поляроид со своей подписью, размеры — как в PDF (inline-photo.ts). */
function RowPhoto({ kit, item: { p, style }, rowSize }: { kit: PageKit; item: RowItem; rowSize: number }) {
  const { design, sizes: S, u } = kit;
  const { w: textW, h: textH } = textArea(kit.format);
  const b = framedBox(p, style, textW, textH, rowSize);
  const polaroid = style.frame === "polaroid";
  const bw = polaroid ? INLINE_ROW.polaroidBorder : style.frame === "line" ? INLINE_ROW.lineBorder : 0;
  return (
    <figure style={{ width: u.mm(b.outerW), margin: 0, flex: "none" }}>
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
        }}
      >
        {/* eslint-disable-next-line @next/next/no-img-element -- фото клиента в вёрстке страницы */}
        <img
          src={p.url}
          alt=""
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
    </figure>
  );
}

/** Ряд фото внутри ответа — те же размеры, рамки и подписи, что в PDF (inline-photo.ts). */
function InlineRow({ kit, row }: { kit: PageKit; row: RowItem[] }) {
  const { sizes: S, u } = kit;
  const align = row[0].style.align;
  return (
    <div
      style={{
        display: "flex",
        justifyContent: align === "left" ? "flex-start" : align === "right" ? "flex-end" : "center",
        alignItems: "flex-start",
        gap: u.mm(textArea(kit.format).w * ROW_GAP),
        marginTop: u.pt(S.body * INLINE_ROW.before),
        marginBottom: u.pt(S.body * INLINE_ROW.after),
        breakInside: "avoid",
      }}
    >
      {row.map((item) => (
        <RowPhoto key={item.p.id} kit={kit} item={item} rowSize={row.length} />
      ))}
    </div>
  );
}

/** Ответ целиком: блоки набора и фото между ними, как в PDF. */
export function EntryBody({ kit, entry, leadIn }: { kit: PageKit; entry: SampleEntry; leadIn: boolean }) {
  const blocks = answerBlocks(entry.paragraphs);
  const items = (entry.photos ?? []).map((p) => ({ p, style: normalizeStyle(p.inline) }));
  const rows = rowsByBlock(blocks, layoutInline(items, entry.paragraphs.length));
  const rowsAt = (key: number) => (rows.get(key) ?? []).map((row, r) => <InlineRow key={`${key}-${r}`} kit={kit} row={row} />);
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
