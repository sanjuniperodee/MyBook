import "server-only";
import type { ReactNode } from "react";
import { Text, View } from "@react-pdf/renderer";
import type { Style } from "@react-pdf/stylesheet";
import { answerBlocks, rowsByBlock } from "@/lib/book/answer-blocks";
import { layoutMedia } from "@/lib/book/answer-media";
import { layoutInline, normalizeStyle, splitParagraphsDetailed } from "@/lib/book/inline-photo";
import type { ContentItem } from "@/lib/book/layout";
import { dividerDrawing } from "@/lib/book/interior-art";
import { DIVIDER, HEADING, headingFace, KEEP_WITH_NEXT } from "@/lib/book/typesetting";
import { face } from "@/modules/production/infrastructure/pdf/fonts";
import { PdfDrawing } from "@/modules/production/infrastructure/pdf/art";
import { InlineRow, rowBreaks, rowKeyOf } from "./inline-rows";
import { MediaCards } from "./media-card";
import { mark, noHyphens, textFace, type PdfKit } from "./kit";
import { TextBlock } from "./text-block";

/** Заголовок вопроса в тексте главы (с акцентной линейкой, если она есть в дизайне). */
function Heading({ kit, text, id }: { kit: PdfKit; text: string; id: string }) {
  const { design, sizes: S, scale } = kit;
  const { type: typo, palette: P, heading } = design;
  const style: Style = {
    // Своё начертание заголовков (дизайнер) — с прописными и разрядкой; иначе — как раньше.
    ...(heading.face ? textFace(headingFace(design), S.heading) : face(typo.heading, typo.headingWeight, typo.headingItalic)),
    ...kit.measure,
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
      <View style={{ ...kit.measure, width: HEADING.bar.width * scale, height: HEADING.bar.thickness, backgroundColor: P.accent, marginBottom: HEADING.bar.after * scale, alignSelf: heading.align === "center" ? "center" : "flex-start" }} />
      <Text hyphenationCallback={noHyphens} style={style}>
        {text}
      </Text>
    </View>
  );
}

/** Разделитель между ответами без заголовка: «* * *», глиф, линейка, астеризм или просто отбивка. */
function Divider({ kit, id }: { kit: PdfKit; id: string }) {
  const { design, sizes: S } = kit;
  // Отбивка: пустая строка вместо знака (минимальная высота — чтобы доводка видела разделитель).
  if (design.divider === "space") return <View {...mark(id)} minPresenceAhead={KEEP_WITH_NEXT} style={{ height: S.body * 0.8, marginBottom: S.beforeHeadless }} />;
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

/**
 * Ответ целиком: блоки набора, ряды фото и карточки QR-кодов между ними (leadIn — капитель в начале первого блока).
 * Части ответа: новая часть — с ряда фото «с новой страницы» (Entry ставит перед ней разрыв). fresh — перед ответом
 * на полосе ничего нет и у него нет заголовка: первому ряду разрыв не нужен, он и так в верху полосы.
 */
function entryParts({ kit, item, leadIn, start, fresh }: { kit: PdfKit; item: ContentItem; leadIn: boolean; /** Ответ открывает главу: буквица. */ start: boolean; fresh: boolean }): ReactNode[][] {
  const { paragraphs, breaks } = splitParagraphsDetailed(item.answer);
  const blocks = answerBlocks(paragraphs, { plain: kit.design.plainAnswers, breaks });
  const photos = (item.photos ?? []).filter((p) => kit.options.images.has(p.id));
  const rows = rowsByBlock(
    blocks,
    layoutInline(
      photos.map((p) => ({ p, style: normalizeStyle(p.inline) })),
      paragraphs.length,
    ),
  );
  const media = rowsByBlock(blocks, layoutMedia(item.media ?? [], paragraphs.length));
  const parts: ReactNode[][] = [[]];
  const push = (node: ReactNode) => parts[parts.length - 1].push(node);
  // Первое, что стоит в ответе: ряды перед текстом, а без текста — ряды в конце.
  const lead = blocks.length ? -1 : Number.POSITIVE_INFINITY;
  // В одном месте текста сначала фото, потом QR-коды.
  const rowsAt = (at: number) => {
    (rows.get(at) ?? []).forEach((row, r) => {
      const key = rowKeyOf(item.id, at, r);
      const breaks = rowBreaks(row, fresh && at === lead && r === 0);
      if (breaks) parts.push([]);
      push(<InlineRow key={key} kit={kit} rowKey={key} row={row} breaks={breaks} />);
    });
    push(<MediaCards key={`m:${at}`} kit={kit} itemId={item.id} at={at} media={media.get(at)} />);
  };
  if (blocks.length) rowsAt(-1);
  blocks.forEach((b, i) => {
    push(<TextBlock key={`b:${i}`} kit={kit} block={b} id={`${b.kind === "lede" ? "k" : "b"}:${item.id}:${i}`} leadIn={leadIn && i === 0} dropCap={start && i === 0} first={i === 0} />);
    if (i < blocks.length - 1) rowsAt(i);
  });
  rowsAt(Number.POSITIVE_INFINITY);
  return parts;
}

/**
 * Ответ в вёрстке главы: заголовок вопроса (или разделитель, если заголовка нет) и текст с фото.
 * Если доводка решила начать ответ с новой полосы — разрыв перед ним; ряд фото «с новой страницы» — разрыв перед
 * своей частью ответа.
 */
export function Entry({ kit, item, index, leadIn = index === 0 }: { kit: PdfKit; item: ContentItem; index: number; leadIn?: boolean }) {
  const { design, sizes: S, flow } = kit;
  // Разрыв: решение доводки вёрстки или «с новой страницы» автора.
  const breaks = flow.breakBefore.has(item.id) || !!item.pageBreak;
  const fresh = index === 0 || breaks;
  // Ответ в верху полосы без заголовка и разделителя (над первым ответом главы может стоять её название — inline).
  const bare = !item.heading && !(index > 0 && !item.continued) && !(index === 0 && leadIn && kit.content.chapterStart === "inline");
  const parts = entryParts({ kit, item, leadIn: design.leadIn && leadIn && !item.continued, start: leadIn && !item.continued, fresh: fresh && bare });
  return (
    <>
      <View break={index > 0 && breaks} style={{ marginTop: fresh ? 0 : item.heading ? S.beforeHeading : S.beforeHeadless }}>
        {item.heading ? <Heading kit={kit} text={item.heading} id={`h:${item.id}`} /> : index > 0 && !item.continued ? <Divider kit={kit} id={`h:${item.id}`} /> : null}
        {parts[0]}
      </View>
      {parts.slice(1).map((part, i) => (
        <View key={i} break>
          {part}
        </View>
      ))}
    </>
  );
}
