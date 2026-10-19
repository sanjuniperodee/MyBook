import "server-only";
/* eslint-disable jsx-a11y/alt-text -- react-pdf Image не поддерживает alt */
import { Image, Text, View } from "@react-pdf/renderer";
import type { PhotoItem } from "@/lib/book/layout";
import { framedBox, polaroidFontSize, ROW_GAP, type InlinePhotoStyle } from "@/lib/book/inline-photo";
import { PHOTO_COLORS } from "@/lib/book/interiors";
import { INLINE_ROW } from "@/lib/book/typesetting";
import { face } from "@/modules/production/infrastructure/pdf/fonts";
import { mark, noHyphens, type PdfKit } from "./kit";

/** Фото ответа вместе с его стилем вставки (рамка, выравнивание, пропорции). */
interface InlineItem {
  p: PhotoItem;
  style: InlinePhotoStyle;
}

/** Фото в ряду: рамка или поляроид со своей подписью; k — масштаб ряда из доводки, i — место в ряду. */
function RowPhoto({ kit, item: { p, style }, b, k, i }: { kit: PdfKit; item: InlineItem; b: ReturnType<typeof framedBox>; k: number; i: number }) {
  const { design, sizes: S, options, textWidthPt } = kit;
  const img = options.images.get(p.id);
  if (!img) return null;
  const box = { outerW: b.outerW * k, outerH: b.outerH * k, imgW: b.imgW * k, imgH: b.imgH * k, pad: b.pad * k, padBottom: b.padBottom * k, radius: b.radius * k };
  const polaroid = style.frame === "polaroid";
  const bw = polaroid ? INLINE_ROW.polaroidBorder : style.frame === "line" ? INLINE_ROW.lineBorder : 0;
  return (
    <View style={{ width: box.outerW, marginLeft: i ? textWidthPt * ROW_GAP : 0 }}>
      <View
        style={{
          width: box.outerW,
          height: box.outerH,
          paddingTop: box.pad,
          paddingLeft: box.pad,
          paddingRight: box.pad,
          paddingBottom: box.padBottom,
          backgroundColor: polaroid ? PHOTO_COLORS.card : undefined,
          borderWidth: bw,
          borderColor: polaroid ? PHOTO_COLORS.polaroidEdge : design.palette.ink,
          borderStyle: "solid",
          borderRadius: box.radius,
          overflow: "hidden",
        }}
      >
        <Image src={{ data: img.data, format: "jpg" }} style={{ width: box.imgW - bw * 2, height: box.imgH - bw * 2, borderRadius: box.radius, objectFit: "cover" }} />
        {polaroid && p.caption ? (
          <Text style={{ ...face("caveat", 500), position: "absolute", left: box.pad, right: box.pad, bottom: box.padBottom * INLINE_ROW.polaroidCaption, fontSize: polaroidFontSize(box, p.caption, S.body), color: PHOTO_COLORS.polaroidInk, textAlign: "center", maxLines: 1 }}>
            {p.caption}
          </Text>
        ) : null}
      </View>
      {!polaroid && p.caption ? <Text hyphenationCallback={noHyphens} style={{ ...kit.italicBody, fontSize: S.caption, color: design.palette.muted, textAlign: "center", marginTop: INLINE_ROW.captionGap }}>{p.caption}</Text> : null}
    </View>
  );
}

/**
 * Один ряд фото. Высота ряда уходит в доводку (rowHeights); масштаб (ряд уменьшен под свободное место полосы)
 * и отступ сверху (ряд один на полосе — по центру) приходят из неё.
 */
function InlineRow({ kit, rowKey, row }: { kit: PdfKit; rowKey: string; row: InlineItem[] }) {
  const { options, flow, sizes: S, textWidthPt, textHeightPt } = kit;
  const align = row[0].style.align;
  const k = flow.rowScale.get(rowKey) ?? 1;
  const boxes = row.map(({ p, style }) => framedBox(p, style, textWidthPt, textHeightPt, row.length));
  options.rowHeights?.set(rowKey, Math.max(...boxes.map((b) => b.outerH)));
  return (
    <View
      {...mark(rowKey)}
      wrap={false}
      style={{
        flexDirection: "row",
        justifyContent: align === "left" ? "flex-start" : align === "right" ? "flex-end" : "center",
        alignItems: "flex-start",
        marginTop: S.body * INLINE_ROW.before,
        marginBottom: S.body * INLINE_ROW.after,
        paddingTop: flow.rowOffset.get(rowKey) ?? 0,
      }}
    >
      {row.map((item, i) => (
        <RowPhoto key={item.p.id} kit={kit} item={item} b={boxes[i]} k={k} i={i} />
      ))}
    </View>
  );
}

/**
 * Ряды фото внутри ответа: фото встают после нужного блока текста, узкие — в ряд. at — после какого блока
 * (-1 — перед первым, Infinity — после последнего).
 */
export function InlineRows({ kit, itemId, at, rows }: { kit: PdfKit; itemId: string; at: number; rows: InlineItem[][] | undefined }) {
  return (
    <>
      {(rows ?? []).map((row, r) => {
        const rowKey = `r:${itemId}:${at}:${r}`;
        return <InlineRow key={rowKey} kit={kit} rowKey={rowKey} row={row} />;
      })}
    </>
  );
}
