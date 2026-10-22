import "server-only";
/* eslint-disable jsx-a11y/alt-text -- react-pdf Image не поддерживает alt */
import { Image, Page, Text, View } from "@react-pdf/renderer";
import { mm } from "@/lib/book/formats";
import type { PhotoItem } from "@/lib/book/layout";
import { chapterMark, PAPER, PHOTO_COLORS, type InteriorPalette } from "@/lib/book/interiors";
import { frameShapes, openerArtShapes } from "@/lib/book/interior-art";
import { openerFit } from "@/lib/book/opener-fit";
import { openerPhotoPlan, type OpenerPhotoPlan } from "@/lib/book/photo-pages";
import { OPENER, VIGNETTE_RULE } from "@/lib/book/typesetting";
import { PdfPageLayer } from "@/modules/production/infrastructure/pdf/art";
import { labelStyle, noHyphens, pageMark, textFace, type PdfKit } from "./kit";
import { Placed, Vignette } from "./parts";

type Rect = { x: number; y: number; w: number; h: number };

/** Снимок главы на начальной полосе: рамка-карточка или снимок под обрез (арка и круг — со скруглением), графика под ним и над ним. */
function OpenerPhoto({ kit, shot, image }: { kit: PdfKit; shot: OpenerPhotoPlan; image: Buffer }) {
  const { bleed: B, box } = kit;
  const at = (r: Rect) => ({ position: "absolute" as const, left: mm(B + r.x), top: mm(B + r.y), width: mm(r.w), height: mm(r.h) });
  return (
    <>
      <PdfPageLayer shapes={shot.under} box={box} />
      {shot.card ? (
        <View style={{ ...at(shot.card), backgroundColor: PHOTO_COLORS.card, borderWidth: OPENER.cardBorder, borderColor: PHOTO_COLORS.openerCardEdge, paddingTop: mm(shot.img.y - shot.card.y), paddingLeft: mm(shot.img.x - shot.card.x), transform: `rotate(${shot.card.rotate}deg)` }}>
          <Image src={{ data: image, format: "jpg" }} style={{ width: mm(shot.img.w), height: mm(shot.img.h) }} />
        </View>
      ) : (
        <Image
          // fixed — снимок под обрез выше полосы набора: иначе react-pdf переносит его на следующую страницу.
          fixed
          src={{ data: image, format: "jpg" }}
          style={{
            ...at(shot.img),
            // Арка и круг: react-pdf обрезает снимок по скруглению углов. Затемнение «во всю полосу» уже в самом снимке.
            ...(shot.mask === "circle" ? { borderRadius: mm(shot.img.w / 2) } : shot.mask === "arch" ? { borderTopLeftRadius: mm(shot.img.w / 2), borderTopRightRadius: mm(shot.img.w / 2) } : {}),
          }}
        />
      )}
      <PdfPageLayer shapes={shot.over} box={box} />
    </>
  );
}

/** Номер главы: подпись («Глава 1») или крупная цифра — по дизайну. */
function ChapterMark({ kit, colors, number }: { kit: PdfKit; colors: InteriorPalette; number: number | null }) {
  const { design, sizes: S, t } = kit;
  const mark = number ? chapterMark(design, number, t.chapter) : null;
  const textAlign = design.opener.align;
  if (mark?.kind === "label")
    return (
      <Text
        hyphenationCallback={noHyphens}
        style={{
          ...(design.opener.kicker ? { ...textFace(design.opener.kicker, S.kicker), color: colors.accent } : labelStyle(kit, colors.accent)),
          textAlign,
          marginBottom: S.kickerGap,
        }}
      >
        {mark.text}
      </Text>
    );
  if (mark?.kind === "numeral")
    return <Text style={{ ...textFace(design.opener.numeral ?? design.display, S.numeral), lineHeight: OPENER.numeral.lineHeight, textAlign, color: colors.accent, marginBottom: S.numeral * OPENER.numeral.after }}>{mark.text}</Text>;
  return null;
}

/**
 * Начальная полоса главы: номер, название, виньетка, эпиграф и рисунок дизайна; в оформлениях, где глава
 * открывается своим снимком, — фото сверху, название ниже. Заодно сообщает, на какой полосе встала глава.
 */
export function Opener({ kit, chapterKey, number, title, epigraph, photo }: { kit: PdfKit; chapterKey: string; number: number | null; title: string; epigraph?: string; photo?: PhotoItem }) {
  const { design, format, box, sizes: S, options, openerAt, italicBody } = kit;
  const { fill, align, art } = design.opener;
  const colors = fill ?? design.palette;
  const artShapes = art ? openerArtShapes(art, { w: box.w, h: box.h, flowTop: openerAt.top, k: openerAt.k, palette: colors, seed: number ?? 0 }) : [];
  const image = photo ? options.images.get(photo.id) : undefined;
  const shot = image ? openerPhotoPlan(format, design) : null;
  // Длинное название и эпиграф своей книги не должны выталкивать начальную полосу на вторую (то же правило — в HTML).
  const fit = openerFit(format, design, { title, epigraph, number, photo: !!shot });
  return (
    <Page {...pageMark("opener", chapterKey)} size={kit.pageSize} style={{ ...kit.pagePadding, backgroundColor: fill?.paper ?? PAPER }}>
      <PdfPageLayer shapes={[...artShapes, ...frameShapes(design.frame, box, colors)]} box={box} />
      {shot && image ? <OpenerPhoto kit={kit} shot={shot} image={image.data} /> : null}
      <Text
        style={{ position: "absolute", top: 0, left: 0, fontSize: 1, color: fill?.paper ?? PAPER }}
        render={({ pageNumber }) => {
          options.onChapterPage?.(chapterKey, pageNumber);
          return " ";
        }}
      />
      <Placed top={shot?.textTop ?? design.opener.top} align={align}>
        <ChapterMark kit={kit} colors={colors} number={number} />
        <Text hyphenationCallback={noHyphens} style={{ ...textFace(design.display, fit.titleSize), lineHeight: OPENER.title.lineHeight, textAlign: align, color: colors.ink, maxWidth: OPENER.title.maxWidth }}>{title}</Text>
        <Vignette kit={kit} rule={VIGNETTE_RULE.opener} colors={colors} align={align} />
        {epigraph ? (
          <Text hyphenationCallback={noHyphens} style={{ ...italicBody, fontSize: S.epigraph, lineHeight: OPENER.epigraph.lineHeight, textAlign: align, color: colors.muted, maxWidth: OPENER.epigraph.maxWidth[align], ...(fit.epigraphLines ? { maxLines: fit.epigraphLines, textOverflow: "ellipsis" as const } : {}) }}>{epigraph}</Text>
        ) : null}
      </Placed>
    </Page>
  );
}
