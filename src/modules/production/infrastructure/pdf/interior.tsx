import "server-only";
/* eslint-disable jsx-a11y/alt-text -- react-pdf Image не поддерживает alt */
import { Fragment } from "react";
import { Document, Image, Page, Text, View } from "@react-pdf/renderer";
import type { Style } from "@react-pdf/stylesheet";
import { mm } from "@/lib/book/formats";
import { photoPages, type BookContent, type PhotoItem } from "@/lib/book/layout";
import { interiorMetrics, openerFlow, pageBox, pageSide, textArea } from "@/lib/book/page-geometry";
import { framedBox, layoutInline, normalizeStyle, polaroidFontSize, ROW_GAP, splitParagraphs } from "@/lib/book/inline-photo";
import { chapterMark, PAPER, PHOTO_COLORS, type InteriorPalette, type TextFace } from "@/lib/book/interiors";
import {
  ANSWER,
  CHAPTER_TAIL,
  DISPLAY_TOP,
  DIVIDER,
  FOLIO,
  folioBottom,
  FRONT,
  HEADING,
  INLINE_ROW,
  interiorSizes,
  KEEP_WITH_NEXT,
  LEAD_IN,
  OPENER,
  RUNNING_HEAD,
  runningHeadTop,
  runningRuleTop,
  splitLeadIn,
  TOC,
  trackingPt,
  VIGNETTE_RULE,
} from "@/lib/book/typesetting";
import { dividerDrawing, frameShapes, openerArtShapes, vignetteDrawing } from "@/lib/book/interior-art";
import { openerPhotoPlan, photoArea, photoPagePlan } from "@/lib/book/photo-pages";
import { answerBlocks, rowsByBlock, type AnswerBlock } from "@/lib/book/answer-blocks";
import { face } from "@/modules/production/infrastructure/pdf/fonts";
import { emptyFlow, FLOW_MARK, type FlowDecisions } from "@/modules/production/infrastructure/pdf/flow";
import { PdfDrawing, PdfPageLayer } from "@/modules/production/infrastructure/pdf/art";
import { site } from "@/config/site";
import { messagesFor } from "@/i18n/messages";

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
  /** Решения доводки вёрстки из прошлого прохода (см. flow.ts). */
  flow?: FlowDecisions;
  /** Готовая раскладка — для следующего прохода доводки. */
  onLayout?: (layout: unknown) => void;
  /** Сюда записывается высота фото в каждом ряду (без подписи), pt — для доводки. */
  rowHeights?: Map<string, number>;
}

/** Пометка блока для доводки вёрстки (react-pdf сохраняет её в раскладке). */
const mark = (id: string) => ({ [FLOW_MARK]: id }) as object;

/** Без переносов: в крупных надписях (название, главы, заголовки, подписи) и выделенных строках перенос выглядит как ошибка — переносы только в основном тексте. */
const noHyphens = (word: string) => [word];

/** Начертание из дизайна: шрифт, регистр и разрядка. */
function textFace(f: TextFace, size: number): Style {
  return {
    ...face(f.font, f.weight, f.italic),
    fontSize: size,
    textTransform: f.upper ? "uppercase" : undefined,
    letterSpacing: f.tracking ? trackingPt(f, size) : undefined,
  };
}

/**
 * Блок книги. Шрифты, цвета, виньетки, начальные полосы, колонтитулы и колонцифры берутся из
 * дизайна (content.interior); те же правила рисуют HTML-превью на сайте (components/interior).
 */
export function InteriorDocument({ content, options }: { content: BookContent; options: InteriorOptions }) {
  const { format, interior: design } = content;
  const t = messagesFor(content.language).book;
  const metrics = interiorMetrics[format.id];
  const B = options.bleedMm;
  const scale = metrics.scale;
  const S = interiorSizes(design, scale);
  const P = design.palette;
  const typo = design.type;
  const pageSize = { width: mm(format.widthMm + B * 2), height: mm(format.heightMm + B * 2) };
  const side = pageSide(format);
  const bodyPt = S.body;
  const typeArea = textArea(format);
  const textWidthPt = mm(typeArea.w);
  const textHeightPt = mm(typeArea.h);
  const box = pageBox(format, B);
  const openerAt = openerFlow(format, design);
  const flow = options.flow ?? emptyFlow();

  const pagePadding: Style = {
    paddingTop: mm(B + metrics.marginTop),
    paddingBottom: mm(B + metrics.marginBottom),
    paddingLeft: mm(B + side),
    paddingRight: mm(B + side),
    backgroundColor: PAPER,
  };

  const body: Style = {
    ...face(typo.body, 400),
    fontSize: bodyPt,
    lineHeight: typo.lineHeight,
    color: P.ink,
    textAlign: "justify",
  };
  const headingFace = face(typo.heading, typo.headingWeight, typo.headingItalic);
  const italicBody = face(typo.body, 400, true);
  /** Служебная надпись прописными; разрядка — от базового кегля подписи, как в прежней вёрстке. */
  const label = (color: string, size = S.label): Style => ({
    ...face(design.label.font, design.label.weight, design.label.italic),
    fontSize: size,
    letterSpacing: trackingPt(design.label, S.label),
    textTransform: design.label.upper ? "uppercase" : undefined,
    color,
  });

  const watermark = options.watermark ? (
    <Text
      fixed
      style={{
        position: "absolute",
        top: pageSize.height / 2 - 30,
        left: -40,
        width: pageSize.width + 80,
        textAlign: "center",
        fontSize: 44 * scale,
        color: "#000000",
        opacity: 0.05,
        transform: "rotate(-35deg)",
        ...face("montserrat", 600),
        letterSpacing: 6,
      }}
    >
      {t.previewMark}
    </Text>
  ) : null;

  // ── Колонцифра и колонтитул: «снаружи» — у внешнего края (нечётные полосы — правые) ──
  const outer = design.folio.align === "outer";
  const folioStyle: Style = {
    ...(design.folio.font === "label" ? label(P.muted, S.folio * FOLIO.labelSize) : { ...face(typo.body, 400), fontSize: S.folio, color: P.muted }),
    position: "absolute",
    bottom: mm(B + folioBottom(format)),
    left: outer ? mm(B + side) : 0,
    right: outer ? mm(B + side) : 0,
    textAlign: "center",
  };
  const folioText = (n: number) => (design.folio.dashes ? `— ${n} —` : `${n}`);
  const folio = outer ? (
    <>
      <Text fixed style={{ ...folioStyle, textAlign: "left" }} render={({ pageNumber }) => (pageNumber % 2 === 0 ? folioText(pageNumber) : "")} />
      <Text fixed style={{ ...folioStyle, textAlign: "right" }} render={({ pageNumber }) => (pageNumber % 2 === 1 ? folioText(pageNumber) : "")} />
    </>
  ) : (
    <Text fixed style={folioStyle} render={({ pageNumber }) => folioText(pageNumber)} />
  );

  const runningHead = (chapterTitle: string) => {
    if (design.runningHead === "none") return null;
    const style: Style = { ...label(P.muted, S.runningHead), position: "absolute", top: mm(B + runningHeadTop(format)), left: mm(B + side), right: mm(B + side), maxLines: 1, textOverflow: "ellipsis" };
    const verso = { ...style, textAlign: outer ? "left" : "center" } as Style;
    const recto = { ...style, textAlign: outer ? "right" : "center" } as Style;
    return (
      <>
        <Text fixed style={verso} render={({ pageNumber }) => (pageNumber % 2 === 0 ? content.title : "")} />
        <Text fixed style={recto} render={({ pageNumber }) => (pageNumber % 2 === 1 ? chapterTitle : "")} />
        {design.runningHead === "ruled" ? (
          <View fixed style={{ position: "absolute", top: mm(B + runningRuleTop(format)), left: mm(B + side), right: mm(B + side), height: RUNNING_HEAD.rule, backgroundColor: P.rule }} />
        ) : null}
      </>
    );
  };

  const vignette = (rule: number, colors: InteriorPalette, align: "center" | "left" = "center") => (
    <PdfDrawing drawing={vignetteDrawing(design.ornament, rule, colors)} style={{ marginVertical: S.vignetteGap, alignSelf: align === "left" ? "flex-start" : "center" }} />
  );

  /** Блок на парадной полосе: начинается на доле top высоты полосы набора. */
  const placed = (children: React.ReactNode, top: number, align: "center" | "left" = "center") => (
    <View style={{ flexGrow: 1, alignItems: align === "left" ? "flex-start" : "center" }}>
      <View style={{ height: `${top * 100}%` }} />
      {children}
    </View>
  );

  const frame = (colors: InteriorPalette) => <PdfPageLayer shapes={frameShapes(design.frame, box, colors)} box={box} />;

  const pages: React.ReactNode[] = [];

  // ── Титульный лист ──
  pages.push(
    <Page key="title" size={pageSize} style={pagePadding}>
      {frame(P)}
      {watermark}
      {placed(
        <>
          <Text hyphenationCallback={noHyphens} style={{ ...textFace(design.display, S.title), lineHeight: FRONT.title.lineHeight, textAlign: "center", color: P.ink }}>{content.title}</Text>
          {content.subtitle ? (
            <Text hyphenationCallback={noHyphens} style={{ ...italicBody, fontSize: S.subtitle, marginTop: FRONT.subtitle.before, textAlign: "center", color: P.muted }}>{content.subtitle}</Text>
          ) : null}
          {vignette(VIGNETTE_RULE.title, P)}
          {content.authorName ? <Text hyphenationCallback={noHyphens} style={{ ...label(P.muted), textAlign: "center" }}>{content.authorName}</Text> : null}
        </>,
        DISPLAY_TOP.title,
      )}
      <Text style={{ ...label(P.muted, S.year), textAlign: "center" }}>{content.year}</Text>
    </Page>,
  );

  // ── Оборот титула ──
  pages.push(
    <Page key="colophon" size={pageSize} style={pagePadding}>
      {watermark}
      <View style={{ flexGrow: 1 }} />
      <Text style={{ ...face(typo.body, 400), fontSize: S.colophon, lineHeight: FRONT.colophon.lineHeight, color: P.muted }}>
        {`${t.copyright(content.year, content.authorName)}\n`}
        {t.colophon(site.name)}
      </Text>
    </Page>,
  );

  // ── Посвящение ──
  if (content.dedication) {
    pages.push(
      <Page key="dedication" size={pageSize} style={pagePadding}>
        {frame(P)}
        {watermark}
        {placed(
          <Text hyphenationCallback={noHyphens} style={{ ...italicBody, fontSize: S.dedication, lineHeight: FRONT.dedication.lineHeight, textAlign: "center", color: P.ink, maxWidth: FRONT.dedication.maxWidth }}>{content.dedication}</Text>,
          DISPLAY_TOP.dedication,
        )}
      </Page>,
    );
  }

  // ── Оглавление ──
  if (content.showToc && content.chapters.length) {
    const entries = [...content.chapters.map((c) => ({ key: c.key, label: c.title, num: c.number }))];
    if (content.galleryPhotos.length) entries.push({ key: "__gallery", label: t.gallery, num: 0 });
    pages.push(
      <Page key="toc" size={pageSize} style={pagePadding} wrap>
        {watermark}
        <Text
          hyphenationCallback={noHyphens}
          style={{
            ...textFace(design.display, S.tocTitle),
            textAlign: design.opener.align === "left" ? "left" : "center",
            marginTop: TOC.title.before * scale,
            marginBottom: TOC.title.after * scale,
            color: P.ink,
          }}
        >
          {t.toc}
        </Text>
        {entries.map((e) => (
          <View key={e.key} wrap={false} style={{ flexDirection: "row", alignItems: "flex-end", marginBottom: TOC.entry.after * scale }}>
            <Text hyphenationCallback={noHyphens} style={{ ...face(typo.body, 400), fontSize: bodyPt, color: P.ink, maxWidth: TOC.entry.maxWidth }}>
              {e.num ? `${e.num}. ` : ""}
              {e.label}
            </Text>
            <View style={{ flexGrow: 1, borderBottomWidth: TOC.leader.width, borderBottomColor: P.rule, borderBottomStyle: "dotted", marginHorizontal: TOC.leader.side, marginBottom: TOC.leader.bottom }} />
            <Text style={{ ...face(typo.body, 400), fontSize: bodyPt, color: P.muted }}>{options.tocPages?.[e.key] ?? "00"}</Text>
          </View>
        ))}
      </Page>,
    );
  }

  // ── Начальная полоса главы ──
  const opener = (key: string, number: number | null, title: string, epigraph?: string, photo?: PhotoItem) => {
    const { fill, align, art } = design.opener;
    const colors = fill ?? P;
    const mark = number ? chapterMark(design, number, t.chapter) : null;
    const textAlign = align === "left" ? "left" : "center";
    const artShapes = art ? openerArtShapes(art, { w: box.w, h: box.h, flowTop: openerAt.top, k: openerAt.k, palette: colors, seed: number ?? 0 }) : [];
    // Глава открывается своим снимком (opener.photo): фото сверху, название — ниже него.
    const img = photo ? options.images.get(photo.id) : undefined;
    const shot = img ? openerPhotoPlan(format, design) : null;
    const imgStyle = (r: { x: number; y: number; w: number; h: number }) => ({ position: "absolute" as const, left: mm(B + r.x), top: mm(B + r.y), width: mm(r.w), height: mm(r.h) });
    return (
      <Page key={`open-${key}`} size={pageSize} style={{ ...pagePadding, backgroundColor: fill?.paper ?? PAPER }}>
        <PdfPageLayer shapes={[...artShapes, ...frameShapes(design.frame, box, colors)]} box={box} />
        {shot && img ? (
          <>
            <PdfPageLayer shapes={shot.under} box={box} />
            {shot.card ? (
              <View style={{ ...imgStyle(shot.card), backgroundColor: PHOTO_COLORS.card, borderWidth: OPENER.cardBorder, borderColor: PHOTO_COLORS.openerCardEdge, paddingTop: mm(shot.img.y - shot.card.y), paddingLeft: mm(shot.img.x - shot.card.x), transform: `rotate(${shot.card.rotate}deg)` }}>
                <Image src={{ data: img.data, format: "jpg" }} style={{ width: mm(shot.img.w), height: mm(shot.img.h) }} />
              </View>
            ) : (
              <Image
                // fixed — снимок под обрез выше полосы набора: иначе react-pdf переносит его на следующую страницу.
                fixed
                src={{ data: img.data, format: "jpg" }}
                style={{
                  ...imgStyle(shot.img),
                  // Арка и круг: react-pdf обрезает снимок по скруглению углов. Затемнение «во всю полосу» уже в самом снимке.
                  ...(shot.mask === "circle" ? { borderRadius: mm(shot.img.w / 2) } : shot.mask === "arch" ? { borderTopLeftRadius: mm(shot.img.w / 2), borderTopRightRadius: mm(shot.img.w / 2) } : {}),
                }}
              />
            )}
            <PdfPageLayer shapes={shot.over} box={box} />
          </>
        ) : null}
        {watermark}
        <Text
          style={{ position: "absolute", top: 0, left: 0, fontSize: 1, color: fill?.paper ?? PAPER }}
          render={({ pageNumber }) => {
            options.onChapterPage?.(key, pageNumber);
            return " ";
          }}
        />
        {placed(
          <>
            {mark?.kind === "label" ? (
              <Text
                hyphenationCallback={noHyphens}
                style={{
                  ...(design.opener.kicker ? { ...textFace(design.opener.kicker, S.kicker), color: colors.accent } : label(colors.accent)),
                  textAlign,
                  marginBottom: S.kickerGap,
                }}
              >
                {mark.text}
              </Text>
            ) : null}
            {mark?.kind === "numeral" ? (
              <Text style={{ ...textFace(design.opener.numeral ?? design.display, S.numeral), lineHeight: OPENER.numeral.lineHeight, textAlign, color: colors.accent, marginBottom: S.numeral * OPENER.numeral.after }}>{mark.text}</Text>
            ) : null}
            <Text hyphenationCallback={noHyphens} style={{ ...textFace(design.display, S.openerTitle), lineHeight: OPENER.title.lineHeight, textAlign, color: colors.ink, maxWidth: OPENER.title.maxWidth }}>{title}</Text>
            {vignette(VIGNETTE_RULE.opener, colors, align)}
            {epigraph ? (
              <Text hyphenationCallback={noHyphens} style={{ ...italicBody, fontSize: S.epigraph, lineHeight: OPENER.epigraph.lineHeight, textAlign, color: colors.muted, maxWidth: OPENER.epigraph.maxWidth[align] }}>{epigraph}</Text>
            ) : null}
          </>,
          shot?.textTop ?? design.opener.top,
          align,
        )}
      </Page>
    );
  };

  // ── Фотостраница: места, рамки и подписи — из photo-pages (та же раскладка у превью и у подготовки снимков) ──
  const area = photoArea(format);
  const captionStyle = (size: number): Style => {
    if (design.photos.caption === "hand") return { ...face("caveat", 500), fontSize: size, lineHeight: 1.15, color: P.ink };
    if (design.photos.caption === "label") return { ...label(P.muted, size), lineHeight: 1.3 };
    return { ...italicBody, fontSize: size, lineHeight: 1.3, color: P.muted };
  };
  const photoPage = (group: PhotoItem[], key: string) => {
    if (group.length === 1 && group[0].layout === "bleed") {
      const img = options.images.get(group[0].id);
      // fixed — снимок во весь лист не участвует в разбиении на страницы. Иначе react-pdf сравнивает его высоту
      // (yoga считает во float32) с высотой полосы (double): в квадрате 583,937… pt округляется вверх, снимок «выше
      // полосы», и всё после него — водяной знак превью — уходит на следующую полосу, которую react-pdf отбрасывает.
      return (
        <Page key={key} size={pageSize} style={{ backgroundColor: PAPER }}>
          {img ? <Image fixed src={{ data: img.data, format: "jpg" }} style={{ position: "absolute", top: 0, left: 0, width: pageSize.width, height: pageSize.height }} /> : null}
          {watermark}
        </Page>
      );
    }
    const plan = photoPagePlan(group, area, design, S);
    return (
      <Page key={key} size={pageSize} style={{ backgroundColor: design.photos.paper ?? PAPER }}>
        <PdfPageLayer shapes={plan.under} box={box} />
        {plan.cells.map((c) => {
          const img = options.images.get(c.id);
          return img ? <Image key={c.id} src={{ data: img.data, format: "jpg" }} style={{ position: "absolute", left: mm(B + c.img.x), top: mm(B + c.img.y), width: mm(c.img.w), height: mm(c.img.h) }} /> : null;
        })}
        <PdfPageLayer shapes={plan.over} box={box} />
        {plan.cells.map((c) =>
          c.caption ? (
            <Text
              key={`cap-${c.id}`}
              hyphenationCallback={noHyphens}
              style={{ ...captionStyle(c.caption.size), position: "absolute", left: mm(B + c.caption.box.x), top: mm(B + c.caption.box.y), width: mm(c.caption.box.w), textAlign: "center", maxLines: c.caption.inside ? 1 : 3, textOverflow: "ellipsis" }}
            >
              {c.caption.text}
            </Text>
          ) : null,
        )}
        {watermark}
      </Page>
    );
  };

  // ── Ответ с фото внутри: фото встают после нужного блока текста, узкие — в ряд ──
  type InlineItem = { p: PhotoItem; style: ReturnType<typeof normalizeStyle> };
  const inlineRows = (itemId: string, key: number, rows: InlineItem[][] | undefined) =>
    (rows ?? []).map((row, r) => {
      const rowKey = `r:${itemId}:${key}:${r}`;
      const align = row[0].style.align;
      // Доводка: ряд уменьшен под свободное место полосы или стоит один по центру полосы.
      const k = flow.rowScale.get(rowKey) ?? 1;
      const boxes = row.map(({ p, style }) => framedBox(p, style, textWidthPt, textHeightPt, row.length));
      options.rowHeights?.set(rowKey, Math.max(...boxes.map((b) => b.outerH)));
      return (
        <View
          key={rowKey}
          {...mark(rowKey)}
          wrap={false}
          style={{
            flexDirection: "row",
            justifyContent: align === "left" ? "flex-start" : align === "right" ? "flex-end" : "center",
            alignItems: "flex-start",
            marginTop: bodyPt * INLINE_ROW.before,
            marginBottom: bodyPt * INLINE_ROW.after,
            paddingTop: flow.rowOffset.get(rowKey) ?? 0,
          }}
        >
          {row.map(({ p, style }, i) => {
            const img = options.images.get(p.id);
            if (!img) return null;
            const b = boxes[i];
            const box = { outerW: b.outerW * k, outerH: b.outerH * k, imgW: b.imgW * k, imgH: b.imgH * k, pad: b.pad * k, padBottom: b.padBottom * k, radius: b.radius * k };
            const polaroid = style.frame === "polaroid";
            const bw = polaroid ? INLINE_ROW.polaroidBorder : style.frame === "line" ? INLINE_ROW.lineBorder : 0;
            return (
              <View key={p.id} style={{ width: box.outerW, marginLeft: i ? textWidthPt * ROW_GAP : 0 }}>
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
                    borderColor: polaroid ? PHOTO_COLORS.polaroidEdge : P.ink,
                    borderStyle: "solid",
                    borderRadius: box.radius,
                    overflow: "hidden",
                  }}
                >
                  <Image src={{ data: img.data, format: "jpg" }} style={{ width: box.imgW - bw * 2, height: box.imgH - bw * 2, borderRadius: box.radius, objectFit: "cover" }} />
                  {polaroid && p.caption ? (
                    <Text style={{ ...face("caveat", 500), position: "absolute", left: box.pad, right: box.pad, bottom: box.padBottom * INLINE_ROW.polaroidCaption, fontSize: polaroidFontSize(box, p.caption, bodyPt), color: PHOTO_COLORS.polaroidInk, textAlign: "center", maxLines: 1 }}>
                      {p.caption}
                    </Text>
                  ) : null}
                </View>
                {!polaroid && p.caption ? <Text hyphenationCallback={noHyphens} style={{ ...italicBody, fontSize: S.caption, color: P.muted, textAlign: "center", marginTop: INLINE_ROW.captionGap }}>{p.caption}</Text> : null}
              </View>
            );
          })}
        </View>
      );
    });

  /** Начальные слова главы капителью (если дизайн это предполагает). */
  const leadInStyle: Style = { ...face(typo.body, 400), fontSize: bodyPt * LEAD_IN.size, letterSpacing: bodyPt * LEAD_IN.tracking, textTransform: "uppercase", color: P.accent };
  const centered = design.heading.align === "center";

  /** Блок набора ответа: абзац, лид, выделенный короткий ответ, список или стихи (см. answer-blocks). */
  const textBlock = (b: AnswerBlock, id: string, leadIn: boolean) => {
    switch (b.kind) {
      case "para": {
        const [lead, rest] = leadIn ? splitLeadIn(b.text) : ["", b.text];
        return (
          <Text {...mark(id)} style={{ ...body, marginBottom: bodyPt * ANSWER.para.after }} orphans={2} widows={2}>
            {lead ? <Text style={leadInStyle}>{lead}</Text> : null}
            {rest}
          </Text>
        );
      }
      case "lede":
        return (
          <Text {...mark(id)} hyphenationCallback={noHyphens} style={{ ...italicBody, fontSize: bodyPt * ANSWER.lede.size, lineHeight: ANSWER.lede.lineHeight, color: P.muted, textAlign: centered ? "center" : "left", marginBottom: bodyPt * ANSWER.lede.after }}>
            {b.text}
          </Text>
        );
      case "quote": {
        const style: Style = { ...italicBody, fontSize: bodyPt * ANSWER.quote.size, lineHeight: ANSWER.quote.lineHeight, color: P.ink };
        return centered ? (
          <View {...mark(id)} wrap={false} style={{ alignItems: "center", paddingHorizontal: textWidthPt * ANSWER.quote.inset, marginTop: bodyPt * ANSWER.quote.before, marginBottom: bodyPt * ANSWER.quote.after }}>
            <Text hyphenationCallback={noHyphens} style={{ ...style, textAlign: "center" }}>
              {b.lines.join("\n")}
            </Text>
          </View>
        ) : (
          <View {...mark(id)} wrap={false} style={{ borderLeftWidth: ANSWER.quote.rule, borderLeftColor: P.accent, borderLeftStyle: "solid", paddingLeft: bodyPt * ANSWER.quote.indent, marginTop: bodyPt * ANSWER.quote.before, marginBottom: bodyPt * ANSWER.quote.after }}>
            <Text hyphenationCallback={noHyphens} style={style}>
              {b.lines.join("\n")}
            </Text>
          </View>
        );
      }
      case "list":
        return (
          <View {...mark(id)} style={{ marginBottom: bodyPt * ANSWER.list.after }}>
            {b.items.map((item, i) => (
              <View key={i} wrap={item.text.length > 260} style={{ flexDirection: "row", marginBottom: i < b.items.length - 1 ? bodyPt * ANSWER.list.gap : 0 }}>
                <Text style={{ ...body, width: bodyPt * (b.ordered ? ANSWER.list.orderedMarker : ANSWER.list.marker), textAlign: "left", color: P.accent }}>{item.marker}</Text>
                <Text style={{ ...body, flex: 1, textAlign: "left" }} orphans={2} widows={2}>
                  {item.text}
                </Text>
              </View>
            ))}
          </View>
        );
      case "verse":
        return (
          <Text
            {...mark(id)}
            hyphenationCallback={noHyphens}
            style={{ ...body, textAlign: centered ? "center" : "left", paddingLeft: centered ? 0 : textWidthPt * ANSWER.verse.indent, marginTop: bodyPt * ANSWER.verse.before, marginBottom: bodyPt * ANSWER.verse.after }}
            orphans={2}
            widows={2}
          >
            {b.lines.join("\n")}
          </Text>
        );
    }
  };

  const inlineBody = (it: BookContent["chapters"][number]["items"][number], leadIn: boolean) => {
    const blocks = answerBlocks(splitParagraphs(it.answer));
    const photos = (it.photos ?? []).filter((p) => options.images.has(p.id));
    const rows = rowsByBlock(
      blocks,
      layoutInline(
        photos.map((p) => ({ p, style: normalizeStyle(p.inline) })),
        splitParagraphs(it.answer).length,
      ),
    );
    return (
      <>
        {blocks.length ? inlineRows(it.id, -1, rows.get(-1)) : null}
        {blocks.map((b, i) => (
          <Fragment key={i}>
            {textBlock(b, `${b.kind === "lede" ? "k" : "b"}:${it.id}:${i}`, leadIn && i === 0)}
            {i < blocks.length - 1 ? inlineRows(it.id, i, rows.get(i)) : null}
          </Fragment>
        ))}
        {inlineRows(it.id, Number.POSITIVE_INFINITY, rows.get(Number.POSITIVE_INFINITY))}
      </>
    );
  };

  const heading = (text: string, id: string) => {
    const style: Style = {
      ...headingFace,
      fontSize: S.heading,
      lineHeight: HEADING.lineHeight,
      color: design.heading.accent ? P.accent : P.ink,
      textAlign: design.heading.align,
      marginBottom: S.afterHeading,
    };
    if (!design.heading.bar)
      return (
        <Text {...mark(id)} hyphenationCallback={noHyphens} minPresenceAhead={KEEP_WITH_NEXT} style={style}>
          {text}
        </Text>
      );
    return (
      <View {...mark(id)} wrap={false} minPresenceAhead={KEEP_WITH_NEXT}>
        <View style={{ width: HEADING.bar.width * scale, height: HEADING.bar.thickness, backgroundColor: P.accent, marginBottom: HEADING.bar.after * scale, alignSelf: design.heading.align === "center" ? "center" : "flex-start" }} />
        <Text hyphenationCallback={noHyphens} style={style}>
          {text}
        </Text>
      </View>
    );
  };

  const divider = (id: string) => {
    if (design.divider === "stars")
      return (
        <Text {...mark(id)} minPresenceAhead={KEEP_WITH_NEXT} style={{ textAlign: "center", color: P.rule, fontSize: bodyPt, marginBottom: S.beforeHeadless }}>
          * * *
        </Text>
      );
    const art = dividerDrawing(design.ornament, design.divider, P);
    // Внизу полосы поместился сам разделитель, но не его нижнее поле и не текст: react-pdf оставляет его в части
    // ответа высотой в остаток полосы и ужимает вместе с рисунком — у <Svg> нулевой высоты pdfkit получает Infinity.
    // minHeight не даёт ужать (flexShrink: 0 react-pdf заменяет на 1), а разделитель внизу полосы убирает доводка.
    return (
      <View {...mark(id)} minPresenceAhead={KEEP_WITH_NEXT} style={{ alignSelf: "center", minHeight: art.h, marginTop: bodyPt * DIVIDER.before, marginBottom: S.beforeHeadless + bodyPt * DIVIDER.after }}>
        <PdfDrawing drawing={art} />
      </View>
    );
  };

  // ── Главы ──
  for (const ch of content.chapters) {
    pages.push(opener(ch.key, ch.number, ch.title, ch.epigraph, ch.openerPhoto));
    if (ch.items.length) {
      pages.push(
        <Page key={`body-${ch.key}`} size={pageSize} style={pagePadding} wrap>
          {watermark}
          {runningHead(ch.title)}
          {folio}
          {ch.items.map((it, idx) => {
            const fresh = idx === 0 || flow.breakBefore.has(it.id);
            return (
              <View key={it.id} break={idx > 0 && flow.breakBefore.has(it.id)} style={{ marginTop: fresh ? 0 : it.heading ? S.beforeHeading : S.beforeHeadless }}>
                {it.heading ? heading(it.heading, `h:${it.id}`) : idx > 0 ? divider(`h:${it.id}`) : null}
                {inlineBody(it, design.leadIn && idx === 0)}
              </View>
            );
          })}
          {/* Концовка главы — небольшая виньетка: последняя полоса главы не выглядит оборванной. */}
          {flow.noTail.has(ch.key) ? null : (
            <View {...mark(`t:${ch.key}`)} wrap={false} style={{ alignItems: "center", marginTop: S.beforeHeading * CHAPTER_TAIL.before }}>
              <PdfDrawing drawing={vignetteDrawing(design.ornament, VIGNETTE_RULE.end, P)} />
            </View>
          )}
        </Page>,
      );
    }
    photoPages(ch.photos).forEach((group, i) => pages.push(photoPage(group, `ph-${ch.key}-${i}`)));
  }

  // ── Галерея ──
  if (content.galleryPhotos.length) {
    pages.push(opener("__gallery", null, t.gallery));
    photoPages(content.galleryPhotos).forEach((group, i) => pages.push(photoPage(group, `ph-gallery-${i}`)));
  }

  // ── Финал ──
  pages.push(
    <Page key="end" size={pageSize} style={pagePadding}>
      {frame(P)}
      {watermark}
      {placed(
        <>
          {vignette(VIGNETTE_RULE.end, P)}
          <Text hyphenationCallback={noHyphens} style={{ ...italicBody, fontSize: S.end, textAlign: "center", color: P.ink }}>{t.theEnd}</Text>
          <Text style={{ ...label(P.muted), textAlign: "center", marginTop: FRONT.endYear.before }}>{content.year}</Text>
        </>,
        DISPLAY_TOP.end,
      )}
    </Page>,
  );

  return (
    <Document
      // Раскладку react-pdf отдаёт только во внутреннем поле onRender — другого способа узнать, где что встало, нет.
      onRender={options.onLayout ? (r) => options.onLayout?.((r as { _INTERNAL__LAYOUT__DATA_?: unknown })._INTERNAL__LAYOUT__DATA_) : undefined}
      title={content.title} author={content.authorName || site.name} creator={site.name} producer={site.name} language={content.language}>
      {pages}
    </Document>
  );
}
