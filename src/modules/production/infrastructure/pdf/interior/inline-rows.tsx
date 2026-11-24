import "server-only";
/* eslint-disable jsx-a11y/alt-text -- react-pdf Image не поддерживает alt */
import { Image, Text, View } from "@react-pdf/renderer";
import type { PhotoItem } from "@/lib/book/layout";
import { framedBox, placedByAuthor, polaroidFontSize, ROW_GAP, rowSpaceAbove, type InlinePhotoStyle } from "@/lib/book/inline-photo";
import { PHOTO_COLORS } from "@/lib/book/interiors";
import { INLINE_ROW } from "@/lib/book/typesetting";
import { face } from "@/modules/production/infrastructure/pdf/fonts";
import { mark, noHyphens, zone, type PdfKit } from "./kit";

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
    <View {...zone(`p|${p.id}`)} style={{ width: box.outerW, marginLeft: i ? textWidthPt * ROW_GAP : 0 }}>
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
 * и отступ сверху (ряд один на полосе — по центру) приходят из неё. Ряд, поставленный автором (отступ сверху,
 * «с новой страницы»), доводка не трогает: свой отступ — внутри неразрывного ряда (уходит на новую полосу вместе
 * с фото). Разрыв «с новой страницы» ставит ответ (Entry): react-pdf не смотрит на break у блока внутри View, которая
 * целиком помещается на полосе, поэтому ответ делится на части по таким рядам (rowBreaks); breaks — ряд начинает часть.
 */
export function InlineRow({ kit, rowKey, row, breaks = false }: { kit: PdfKit; rowKey: string; row: InlineItem[]; breaks?: boolean }) {
  const { options, flow, sizes: S, textWidthPt, textHeightPt } = kit;
  const align = row[0].style.align;
  const own = placedByAuthor(row[0].style);
  const k = own ? 1 : (flow.rowScale.get(rowKey) ?? 1);
  const boxes = row.map(({ p, style }) => framedBox(p, style, textWidthPt, textHeightPt, row.length));
  // Ряд с фото «не уменьшать» в доводку не идёт: shrinkRow без высоты ряда его не трогает — фото уходит на новую полосу.
  if (!own && !row.some(({ style }) => style.keepSize)) options.rowHeights?.set(rowKey, Math.max(...boxes.map((b) => b.outerH)));
  return (
    <View
      {...mark(own ? `f${rowKey.slice(1)}` : rowKey)}
      wrap={false}
      style={{
        flexDirection: "row",
        justifyContent: align === "left" ? "flex-start" : align === "right" ? "flex-end" : "center",
        alignItems: "flex-start",
        marginTop: breaks ? 0 : S.body * INLINE_ROW.before,
        marginBottom: S.body * INLINE_ROW.after,
        paddingTop: own ? rowSpaceAbove(row, textWidthPt, textHeightPt) : (flow.rowOffset.get(rowKey) ?? 0),
      }}
    >
      {row.map((item, i) => (
        <RowPhoto key={item.p.id} kit={kit} item={item} b={boxes[i]} k={k} i={i} />
      ))}
    </View>
  );
}

/** Ключ ряда фото в доводке: ответ, место в тексте (номер блока) и номер ряда в этом месте. */
export const rowKeyOf = (itemId: string, at: number, r: number) => `r:${itemId}:${at}:${r}`;

/** Ряд «с новой страницы»: перед ним разрыв, если на полосе перед рядом что-то есть (fresh — ничего нет). */
export const rowBreaks = (row: InlineItem[], fresh: boolean) => !!row[0]?.style.breakBefore && !fresh;
