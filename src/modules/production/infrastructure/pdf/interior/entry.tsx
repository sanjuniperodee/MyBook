import "server-only";
import type { ReactNode } from "react";
import { Text, View } from "@react-pdf/renderer";
import type { Style } from "@react-pdf/stylesheet";
import { answerBlocks, rowsByBlock } from "@/lib/book/answer-blocks";
import { layoutMedia } from "@/lib/book/answer-media";
import { layoutInline, normalizeStyle, placedByAuthor, splitParagraphsDetailed } from "@/lib/book/inline-photo";
import type { ContentItem } from "@/lib/book/layout";
import { dividerDrawing } from "@/lib/book/interior-art";
import { DIVIDER, HEADING, headingFace, KEEP_WITH_NEXT } from "@/lib/book/typesetting";
import { face } from "@/modules/production/infrastructure/pdf/fonts";
import { PdfDrawing } from "@/modules/production/infrastructure/pdf/art";
import { InlineRow, rowBreaks, rowKeyOf } from "./inline-rows";
import { MediaCard } from "./media-card";
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
/** Блок ответа в вёрстке и его пометка (по ней черновой проход начинает и кончает документ на блоке). */
interface Node {
  node: ReactNode;
  mark: string;
}

function entryParts({ kit, item, leadIn, start, fresh }: { kit: PdfKit; item: ContentItem; leadIn: boolean; /** Ответ открывает главу: буквица. */ start: boolean; fresh: boolean }): Node[][] {
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
  const parts: Node[][] = [[]];
  const push = (node: ReactNode, mark: string) => parts[parts.length - 1].push({ node, mark });
  // Первое, что стоит в ответе: ряды перед текстом, а без текста — ряды в конце.
  const lead = blocks.length ? -1 : Number.POSITIVE_INFINITY;
  // В одном месте текста сначала фото, потом QR-коды.
  const rowsAt = (at: number) => {
    (rows.get(at) ?? []).forEach((row, r) => {
      const key = rowKeyOf(item.id, at, r);
      const breaks = rowBreaks(row, fresh && at === lead && r === 0);
      if (breaks) parts.push([]);
      push(<InlineRow key={key} kit={kit} rowKey={key} row={row} breaks={breaks} />, rowMark(row, key));
    });
    for (const m of media.get(at) ?? []) {
      const id = `b:${item.id}:m${at}:${m.id}`;
      push(<MediaCard key={id} kit={kit} media={m} id={id} />, id);
    }
  };
  if (blocks.length) rowsAt(-1);
  blocks.forEach((b, i) => {
    const id = `${b.kind === "lede" ? "k" : "b"}:${item.id}:${i}`;
    push(<TextBlock key={`b:${i}`} kit={kit} block={b} id={id} leadIn={leadIn && i === 0} dropCap={start && i === 0} first={i === 0} />, id);
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
export function Entry({
  kit,
  item,
  index,
  leadIn = index === 0,
  pageStart = false,
  begin,
  end,
}: {
  kit: PdfKit;
  item: ContentItem;
  index: number;
  leadIn?: boolean;
  /** Ответ с разрывом — первый в своём документе (черновой проход): полосу уже начинает, разрыв не нужен. */
  pageStart?: boolean;
  /** Черновой проход: начать с блока с этой пометкой (он в верху полосы) и кончить блоком с пометкой end. */
  begin?: string;
  end?: string;
}) {
  const { design, sizes: S, flow } = kit;
  // Разрыв: решение доводки вёрстки или «с новой страницы» автора.
  const breaks = flow.breakBefore.has(item.id) || !!item.pageBreak;
  const fresh = index === 0 || breaks;
  // Ответ в верху полосы без заголовка и разделителя (над первым ответом главы может стоять её название — inline).
  const bare = !item.heading && !(index > 0 && !item.continued) && !(index === 0 && leadIn && kit.content.chapterStart === "inline");
  const parts = entryParts({ kit, item, leadIn: design.leadIn && leadIn && !item.continued, start: leadIn && !item.continued, fresh: fresh && bare });
  const head = item.heading ? <Heading key="h" kit={kit} text={item.heading} id={`h:${item.id}`} /> : index > 0 && !item.continued ? <Divider key="h" kit={kit} id={`h:${item.id}`} /> : null;
  // Обёртки ответа: первая — с заголовком, следующие — части с ряда «с новой страницы» (с разрывом перед собой).
  const wrappers: Node[][] = [[...(head ? [{ node: head, mark: `h:${item.id}` }] : []), ...parts[0]], ...parts.slice(1)];
  const at = (mark: string | undefined) => {
    for (let w = 0; mark && w < wrappers.length; w++) {
      const k = wrappers[w].findIndex((n) => n.mark === mark);
      if (k >= 0) return { w, k };
    }
    return null;
  };
  const from = at(begin) ?? { w: 0, k: 0 };
  const to = at(end) ?? { w: wrappers.length - 1, k: Number.POSITIVE_INFINITY };
  return (
    <>
      {wrappers.map((nodes, w) => {
        if (w < from.w || w > to.w) return null;
        const first = w === from.w && begin !== undefined;
        const shown = nodes.slice(w === from.w ? from.k : 0, w === to.w ? to.k + 1 : undefined).map((n) => n.node);
        // Начало с середины обёртки — как её продолжение у react-pdf на новой полосе: без верхнего поля.
        const cont = first && from.k > 0;
        if (w === 0)
          return (
            <View key={w} break={index > 0 && breaks && !pageStart && !first} style={{ marginTop: fresh || cont ? 0 : item.heading ? S.beforeHeading : S.beforeHeadless }}>
              {shown}
            </View>
          );
        return (
          <View key={w} break={!first}>
            {shown}
          </View>
        );
      })}
    </>
  );
}

/** Пометка ряда фото в вёрстке (InlineRow: ряд, поставленный автором, — вид f). */
function rowMark(row: Parameters<typeof rowBreaks>[0], key: string) {
  return placedByAuthor(row[0].style) ? `f${key.slice(1)}` : key;
}
