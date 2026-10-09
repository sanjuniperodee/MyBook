import "server-only";
/* eslint-disable jsx-a11y/alt-text -- react-pdf Image не поддерживает alt */
import { Fragment } from "react";
import { Document, Image, Page, Text, View } from "@react-pdf/renderer";
import type { Style } from "@react-pdf/stylesheet";
import { mm } from "@/lib/book/formats";
import { interiorMetrics, openerFlow, pageBox, photoPages, type BookContent, type PhotoItem } from "@/lib/book/layout";
import { framedBox, layoutInline, normalizeStyle, polaroidFontSize, ROW_GAP, splitParagraphs } from "@/lib/book/inline-photo";
import { chapterMark, DISPLAY_TOP, interiorSizes, splitLeadIn, trackingPt, VIGNETTE_RULE, type InteriorPalette, type TextFace } from "@/lib/book/interiors";
import { dividerDrawing, frameShapes, openerArtShapes, vignetteDrawing } from "@/lib/book/interior-art";
import { openerPhotoPlan, photoArea, photoPagePlan } from "@/lib/book/photo-pages";
import { face } from "@/modules/production/infrastructure/pdf/fonts";
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
}

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
  const side = (metrics.marginInner + metrics.marginOuter) / 2;
  const bodyPt = S.body;
  const textWidthPt = mm(format.widthMm - side * 2);
  const textHeightPt = mm(format.heightMm - metrics.marginTop - metrics.marginBottom);
  const box = pageBox(format, B);
  const flow = openerFlow(format, design);

  const pagePadding: Style = {
    paddingTop: mm(B + metrics.marginTop),
    paddingBottom: mm(B + metrics.marginBottom),
    paddingLeft: mm(B + side),
    paddingRight: mm(B + side),
    backgroundColor: "#FFFFFF",
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
    ...(design.folio.font === "label" ? label(P.muted, S.folio * 0.85) : { ...face(typo.body, 400), fontSize: S.folio, color: P.muted }),
    position: "absolute",
    bottom: mm(B + metrics.marginBottom / 2 - 2),
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
    const style: Style = { ...label(P.muted, S.runningHead), position: "absolute", top: mm(B + metrics.marginTop * 0.36), left: mm(B + side), right: mm(B + side), maxLines: 1, textOverflow: "ellipsis" };
    const verso = { ...style, textAlign: outer ? "left" : "center" } as Style;
    const recto = { ...style, textAlign: outer ? "right" : "center" } as Style;
    return (
      <>
        <Text fixed style={verso} render={({ pageNumber }) => (pageNumber % 2 === 0 ? content.title : "")} />
        <Text fixed style={recto} render={({ pageNumber }) => (pageNumber % 2 === 1 ? chapterTitle : "")} />
        {design.runningHead === "ruled" ? (
          <View fixed style={{ position: "absolute", top: mm(B + metrics.marginTop * 0.62), left: mm(B + side), right: mm(B + side), height: 0.4, backgroundColor: P.rule }} />
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
          <Text style={{ ...textFace(design.display, S.title), lineHeight: 1.15, textAlign: "center", color: P.ink }}>{content.title}</Text>
          {content.subtitle ? (
            <Text style={{ ...italicBody, fontSize: S.subtitle, marginTop: 10, textAlign: "center", color: P.muted }}>{content.subtitle}</Text>
          ) : null}
          {vignette(VIGNETTE_RULE.title, P)}
          {content.authorName ? <Text style={{ ...label(P.muted), textAlign: "center" }}>{content.authorName}</Text> : null}
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
      <Text style={{ ...face(typo.body, 400), fontSize: S.colophon, lineHeight: 1.6, color: P.muted }}>
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
          <Text style={{ ...italicBody, fontSize: S.dedication, lineHeight: 1.6, textAlign: "center", color: P.ink, maxWidth: "85%" }}>{content.dedication}</Text>,
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
          style={{
            ...textFace(design.display, S.tocTitle),
            textAlign: design.opener.align === "left" ? "left" : "center",
            marginTop: 20 * scale,
            marginBottom: 26 * scale,
            color: P.ink,
          }}
        >
          {t.toc}
        </Text>
        {entries.map((e) => (
          <View key={e.key} wrap={false} style={{ flexDirection: "row", alignItems: "flex-end", marginBottom: 7 * scale }}>
            <Text style={{ ...face(typo.body, 400), fontSize: bodyPt, color: P.ink, maxWidth: "82%" }}>
              {e.num ? `${e.num}. ` : ""}
              {e.label}
            </Text>
            <View style={{ flexGrow: 1, borderBottomWidth: 0.6, borderBottomColor: P.rule, borderBottomStyle: "dotted", marginHorizontal: 5, marginBottom: 3 }} />
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
    const artShapes = art ? openerArtShapes(art, { w: box.w, h: box.h, flowTop: flow.top, k: flow.k, palette: colors, seed: number ?? 0 }) : [];
    // Глава открывается своим снимком (opener.photo): фото сверху, название — ниже него.
    const img = photo ? options.images.get(photo.id) : undefined;
    const shot = img ? openerPhotoPlan(format, design, metrics) : null;
    const imgStyle = (r: { x: number; y: number; w: number; h: number }) => ({ position: "absolute" as const, left: mm(B + r.x), top: mm(B + r.y), width: mm(r.w), height: mm(r.h) });
    return (
      <Page key={`open-${key}`} size={pageSize} style={{ ...pagePadding, backgroundColor: fill?.paper ?? "#FFFFFF" }}>
        <PdfPageLayer shapes={[...artShapes, ...frameShapes(design.frame, box, colors)]} box={box} />
        {shot && img ? (
          <>
            <PdfPageLayer shapes={shot.under} box={box} />
            {shot.card ? (
              <View style={{ ...imgStyle(shot.card), backgroundColor: "#FFFFFF", borderWidth: 0.4, borderColor: "#E3DBD0", paddingTop: mm(shot.img.y - shot.card.y), paddingLeft: mm(shot.img.x - shot.card.x), transform: `rotate(${shot.card.rotate}deg)` }}>
                <Image src={{ data: img.data, format: "jpg" }} style={{ width: mm(shot.img.w), height: mm(shot.img.h) }} />
              </View>
            ) : (
              <Image src={{ data: img.data, format: "jpg" }} style={imgStyle(shot.img)} />
            )}
            <PdfPageLayer shapes={shot.over} box={box} />
          </>
        ) : null}
        {watermark}
        <Text
          style={{ position: "absolute", top: 0, left: 0, fontSize: 1, color: fill?.paper ?? "#FFFFFF" }}
          render={({ pageNumber }) => {
            options.onChapterPage?.(key, pageNumber);
            return " ";
          }}
        />
        {placed(
          <>
            {mark?.kind === "label" ? (
              <Text
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
              <Text style={{ ...textFace(design.opener.numeral ?? design.display, S.numeral), lineHeight: 1, textAlign, color: colors.accent, marginBottom: S.numeral * 0.12 }}>{mark.text}</Text>
            ) : null}
            <Text style={{ ...textFace(design.display, S.openerTitle), lineHeight: 1.15, textAlign, color: colors.ink, maxWidth: "90%" }}>{title}</Text>
            {vignette(VIGNETTE_RULE.opener, colors, align)}
            {epigraph ? (
              <Text style={{ ...italicBody, fontSize: S.epigraph, lineHeight: 1.55, textAlign, color: colors.muted, maxWidth: align === "left" ? "85%" : "78%" }}>{epigraph}</Text>
            ) : null}
          </>,
          shot?.textTop ?? design.opener.top,
          align,
        )}
      </Page>
    );
  };

  // ── Фотостраница: места, рамки и подписи — из photo-pages (та же раскладка у превью и у подготовки снимков) ──
  const area = photoArea(format, metrics);
  const captionStyle = (size: number): Style => {
    if (design.photos.caption === "hand") return { ...face("caveat", 500), fontSize: size, lineHeight: 1.15, color: P.ink };
    if (design.photos.caption === "label") return { ...label(P.muted, size), lineHeight: 1.3 };
    return { ...italicBody, fontSize: size, lineHeight: 1.3, color: P.muted };
  };
  const photoPage = (group: PhotoItem[], key: string) => {
    if (group.length === 1 && group[0].layout === "bleed") {
      const img = options.images.get(group[0].id);
      return (
        <Page key={key} size={pageSize} style={{ backgroundColor: "#FFFFFF" }}>
          {img ? <Image src={{ data: img.data, format: "jpg" }} style={{ position: "absolute", top: 0, left: 0, width: pageSize.width, height: pageSize.height }} /> : null}
          {watermark}
        </Page>
      );
    }
    const plan = photoPagePlan(group, area, design, S);
    return (
      <Page key={key} size={pageSize} style={{ backgroundColor: "#FFFFFF" }}>
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

  // ── Ответ с фото внутри: фото встают после нужного абзаца, узкие — в ряд ──
  const inlineRows = (anchor: number, layout: Map<number, { p: PhotoItem; style: ReturnType<typeof normalizeStyle> }[][]>) =>
    (layout.get(anchor) ?? []).map((row, r) => {
      const align = row[0].style.align;
      return (
        <View
          key={`r-${anchor}-${r}`}
          wrap={false}
          style={{
            flexDirection: "row",
            justifyContent: align === "left" ? "flex-start" : align === "right" ? "flex-end" : "center",
            alignItems: "flex-start",
            marginTop: bodyPt * 0.5,
            marginBottom: bodyPt,
          }}
        >
          {row.map(({ p, style }, i) => {
            const img = options.images.get(p.id);
            if (!img) return null;
            const box = framedBox(p, style, textWidthPt, textHeightPt, row.length);
            const polaroid = style.frame === "polaroid";
            const bw = polaroid ? 0.5 : style.frame === "line" ? 1 : 0;
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
                    backgroundColor: polaroid ? "#FFFFFF" : undefined,
                    borderWidth: bw,
                    borderColor: polaroid ? "#DDD6CE" : P.ink,
                    borderStyle: "solid",
                    borderRadius: box.radius,
                    overflow: "hidden",
                  }}
                >
                  <Image src={{ data: img.data, format: "jpg" }} style={{ width: box.imgW - bw * 2, height: box.imgH - bw * 2, borderRadius: box.radius, objectFit: "cover" }} />
                  {polaroid && p.caption ? (
                    <Text style={{ ...face("caveat", 500), position: "absolute", left: box.pad, right: box.pad, bottom: box.padBottom * 0.22, fontSize: polaroidFontSize(box, p.caption, bodyPt), color: "#3A332E", textAlign: "center", maxLines: 1 }}>
                      {p.caption}
                    </Text>
                  ) : null}
                </View>
                {!polaroid && p.caption ? <Text style={{ ...italicBody, fontSize: S.caption, color: P.muted, textAlign: "center", marginTop: 6 }}>{p.caption}</Text> : null}
              </View>
            );
          })}
        </View>
      );
    });

  /** Начальные слова главы капителью (если дизайн это предполагает). */
  const leadInStyle: Style = { ...face(typo.body, 400), fontSize: bodyPt * 0.86, letterSpacing: bodyPt * 0.07, textTransform: "uppercase", color: P.accent };

  const inlineBody = (it: BookContent["chapters"][number]["items"][number], leadIn: boolean) => {
    const paragraphs = splitParagraphs(it.answer);
    const photos = (it.photos ?? []).filter((p) => options.images.has(p.id));
    const layout = layoutInline(
      photos.map((p) => ({ p, style: normalizeStyle(p.inline) })),
      paragraphs.length,
    );
    return (
      <>
        {paragraphs.length ? inlineRows(-1, layout) : null}
        {paragraphs.map((p, i) => {
          const [lead, rest] = leadIn && i === 0 ? splitLeadIn(p) : ["", p];
          return (
            <Fragment key={i}>
              <Text style={{ ...body, marginBottom: bodyPt * 0.45 }} orphans={2} widows={2}>
                {lead ? <Text style={leadInStyle}>{lead}</Text> : null}
                {rest}
              </Text>
              {i < paragraphs.length - 1 ? inlineRows(i, layout) : null}
            </Fragment>
          );
        })}
        {inlineRows(Number.POSITIVE_INFINITY, layout)}
      </>
    );
  };

  const heading = (text: string) => {
    const style: Style = {
      ...headingFace,
      fontSize: S.heading,
      lineHeight: 1.22,
      color: design.heading.accent ? P.accent : P.ink,
      textAlign: design.heading.align,
      marginBottom: S.afterHeading,
    };
    if (!design.heading.bar) return <Text minPresenceAhead={40} style={style}>{text}</Text>;
    return (
      <View wrap={false} minPresenceAhead={40}>
        <View style={{ width: 14 * scale, height: 1.2, backgroundColor: P.accent, marginBottom: 6 * scale, alignSelf: design.heading.align === "center" ? "center" : "flex-start" }} />
        <Text style={style}>{text}</Text>
      </View>
    );
  };

  const divider =
    design.divider === "stars" ? (
      <Text style={{ textAlign: "center", color: P.rule, fontSize: bodyPt, marginBottom: S.beforeHeadless }}>* * *</Text>
    ) : (
      <PdfDrawing drawing={dividerDrawing(design.ornament, design.divider, P)} style={{ alignSelf: "center", marginTop: bodyPt * 0.3, marginBottom: S.beforeHeadless + bodyPt * 0.2 }} />
    );

  // ── Главы ──
  for (const ch of content.chapters) {
    pages.push(opener(ch.key, ch.number, ch.title, ch.epigraph, ch.openerPhoto));
    if (ch.items.length) {
      pages.push(
        <Page key={`body-${ch.key}`} size={pageSize} style={pagePadding} wrap>
          {watermark}
          {runningHead(ch.title)}
          {folio}
          {ch.items.map((it, idx) => (
            <View key={it.id} style={{ marginTop: idx === 0 ? 0 : it.heading ? S.beforeHeading : S.beforeHeadless }}>
              {it.heading ? heading(it.heading) : idx > 0 ? divider : null}
              {inlineBody(it, design.leadIn && idx === 0)}
            </View>
          ))}
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
          <Text style={{ ...italicBody, fontSize: S.end, textAlign: "center", color: P.ink }}>{t.theEnd}</Text>
          <Text style={{ ...label(P.muted), textAlign: "center", marginTop: 16 }}>{content.year}</Text>
        </>,
        DISPLAY_TOP.end,
      )}
    </Page>,
  );

  return (
    <Document title={content.title} author={content.authorName || site.name} creator={site.name} producer={site.name} language={content.language}>
      {pages}
    </Document>
  );
}
