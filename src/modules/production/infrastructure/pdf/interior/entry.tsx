import "server-only";
import { Fragment } from "react";
import { Text, View } from "@react-pdf/renderer";
import type { Style } from "@react-pdf/stylesheet";
import { answerBlocks, rowsByBlock } from "@/lib/book/answer-blocks";
import { layoutMedia } from "@/lib/book/answer-media";
import { layoutInline, normalizeStyle, splitParagraphs } from "@/lib/book/inline-photo";
import type { ContentItem } from "@/lib/book/layout";
import { dividerDrawing } from "@/lib/book/interior-art";
import { DIVIDER, HEADING, KEEP_WITH_NEXT } from "@/lib/book/typesetting";
import { face } from "@/modules/production/infrastructure/pdf/fonts";
import { PdfDrawing } from "@/modules/production/infrastructure/pdf/art";
import { InlineRows } from "./inline-rows";
import { MediaCards } from "./media-card";
import { mark, noHyphens, type PdfKit } from "./kit";
import { TextBlock } from "./text-block";

/** Заголовок вопроса в тексте главы (с акцентной линейкой, если она есть в дизайне). */
function Heading({ kit, text, id }: { kit: PdfKit; text: string; id: string }) {
  const { design, sizes: S, scale } = kit;
  const { type: typo, palette: P, heading } = design;
  const style: Style = {
    ...face(typo.heading, typo.headingWeight, typo.headingItalic),
    fontSize: S.heading,
    lineHeight: HEADING.lineHeight,
    color: heading.accent ? P.accent : P.ink,
    textAlign: heading.align,
    marginBottom: S.afterHeading,
  };
  if (!heading.bar)
    return (
      <Text {...mark(id)} hyphenationCallback={noHyphens} minPresenceAhead={KEEP_WITH_NEXT} style={style}>
        {text}
      </Text>
    );
  return (
    <View {...mark(id)} wrap={false} minPresenceAhead={KEEP_WITH_NEXT}>
      <View style={{ width: HEADING.bar.width * scale, height: HEADING.bar.thickness, backgroundColor: P.accent, marginBottom: HEADING.bar.after * scale, alignSelf: heading.align === "center" ? "center" : "flex-start" }} />
      <Text hyphenationCallback={noHyphens} style={style}>
        {text}
      </Text>
    </View>
  );
}

/** Разделитель между ответами без заголовка: «* * *», глиф или линейка. */
function Divider({ kit, id }: { kit: PdfKit; id: string }) {
  const { design, sizes: S } = kit;
  if (design.divider === "stars")
    return (
      <Text {...mark(id)} minPresenceAhead={KEEP_WITH_NEXT} style={{ textAlign: "center", color: design.palette.rule, fontSize: S.body, marginBottom: S.beforeHeadless }}>
        * * *
      </Text>
    );
  const art = dividerDrawing(design.ornament, design.divider, design.palette);
  // Внизу полосы поместился сам разделитель, но не его нижнее поле и не текст: react-pdf оставляет его в части
  // ответа высотой в остаток полосы и ужимает вместе с рисунком — у <Svg> нулевой высоты pdfkit получает Infinity.
  // minHeight не даёт ужать (flexShrink: 0 react-pdf заменяет на 1), а разделитель внизу полосы убирает доводка.
  return (
    <View {...mark(id)} minPresenceAhead={KEEP_WITH_NEXT} style={{ alignSelf: "center", minHeight: art.h, marginTop: S.body * DIVIDER.before, marginBottom: S.beforeHeadless + S.body * DIVIDER.after }}>
      <PdfDrawing drawing={art} />
    </View>
  );
}

/** Ответ целиком: блоки набора, ряды фото и карточки QR-кодов между ними (leadIn — капитель в начале первого блока). */
function EntryBody({ kit, item, leadIn }: { kit: PdfKit; item: ContentItem; leadIn: boolean }) {
  const paragraphs = splitParagraphs(item.answer);
  const blocks = answerBlocks(paragraphs);
  const photos = (item.photos ?? []).filter((p) => kit.options.images.has(p.id));
  const rows = rowsByBlock(
    blocks,
    layoutInline(
      photos.map((p) => ({ p, style: normalizeStyle(p.inline) })),
      paragraphs.length,
    ),
  );
  const media = rowsByBlock(blocks, layoutMedia(item.media ?? [], paragraphs.length));
  // В одном месте текста сначала фото, потом QR-коды.
  const rowsAt = (at: number) => (
    <>
      <InlineRows kit={kit} itemId={item.id} at={at} rows={rows.get(at)} />
      <MediaCards kit={kit} itemId={item.id} at={at} media={media.get(at)} />
    </>
  );
  return (
    <>
      {blocks.length ? rowsAt(-1) : null}
      {blocks.map((b, i) => (
        <Fragment key={i}>
          <TextBlock kit={kit} block={b} id={`${b.kind === "lede" ? "k" : "b"}:${item.id}:${i}`} leadIn={leadIn && i === 0} />
          {i < blocks.length - 1 ? rowsAt(i) : null}
        </Fragment>
      ))}
      {rowsAt(Number.POSITIVE_INFINITY)}
    </>
  );
}

/**
 * Ответ в вёрстке главы: заголовок вопроса (или разделитель, если заголовка нет) и текст с фото.
 * Если доводка решила начать ответ с новой полосы — разрыв перед ним.
 */
export function Entry({ kit, item, index, leadIn = index === 0 }: { kit: PdfKit; item: ContentItem; index: number; leadIn?: boolean }) {
  const { design, sizes: S, flow } = kit;
  // Разрыв: решение доводки вёрстки или «с новой страницы» автора.
  const breaks = flow.breakBefore.has(item.id) || !!item.pageBreak;
  const fresh = index === 0 || breaks;
  return (
    <View break={index > 0 && breaks} style={{ marginTop: fresh ? 0 : item.heading ? S.beforeHeading : S.beforeHeadless }}>
      {item.heading ? <Heading kit={kit} text={item.heading} id={`h:${item.id}`} /> : index > 0 && !item.continued ? <Divider kit={kit} id={`h:${item.id}`} /> : null}
      <EntryBody kit={kit} item={item} leadIn={design.leadIn && leadIn && !item.continued} />
    </View>
  );
}
