import "server-only";
/* eslint-disable jsx-a11y/alt-text -- react-pdf Image не поддерживает alt */
import { Document, Image, Page, Text, View } from "@react-pdf/renderer";
import type { Style } from "@react-pdf/stylesheet";
import { mm } from "../book/formats";
import { interiorMetrics, photoPages, type BookContent, type PhotoItem } from "../book/layout";
import { face } from "./fonts";
import { site } from "@/config/site";

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

const INK = "#1F1A17";
const MUTED = "#7A7068";
const LIGHT = "#B4A99E";

export function InteriorDocument({ content, options }: { content: BookContent; options: InteriorOptions }) {
  const { format, typography: typo } = content;
  const metrics = interiorMetrics[format.id];
  const B = options.bleedMm;
  const scale = metrics.scale;
  const pageSize = { width: mm(format.widthMm + B * 2), height: mm(format.heightMm + B * 2) };
  const side = (metrics.marginInner + metrics.marginOuter) / 2;
  const bodyPt = typo.bodySize * scale;

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
    color: INK,
    textAlign: "justify",
  };
  const headingFace = face(typo.heading, typo.headingWeight, typo.headingItalic);
  const displayFace = face(typo.heading, typo.headingWeight >= 500 ? 500 : 400, false);
  const italicBody = face(typo.body, 400, true);
  const smallCaps: Style = {
    ...face(typo.body === "montserrat" ? "montserrat" : typo.body, 400),
    fontSize: 7.5 * scale,
    letterSpacing: 2.2,
    textTransform: "uppercase",
    color: MUTED,
  };

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
      ПРЕДПРОСМОТР
    </Text>
  ) : null;

  const pageNumber = (
    <Text
      fixed
      style={{
        position: "absolute",
        bottom: mm(B + metrics.marginBottom / 2 - 2),
        left: 0,
        right: 0,
        textAlign: "center",
        fontSize: 8 * scale,
        color: MUTED,
        ...face(typo.body, 400),
      }}
      render={({ pageNumber }) => `${pageNumber}`}
    />
  );

  const ornament = (width = 34) => (
    <View style={{ flexDirection: "row", alignItems: "center", justifyContent: "center", marginVertical: 14 * scale }}>
      <View style={{ width, height: 0.5, backgroundColor: LIGHT }} />
      <View style={{ width: 3.2, height: 3.2, marginHorizontal: 6, backgroundColor: LIGHT, transform: "rotate(45deg)" }} />
      <View style={{ width, height: 0.5, backgroundColor: LIGHT }} />
    </View>
  );

  const centered = (children: React.ReactNode, topRatio = 0.3) => (
    <View style={{ flexGrow: 1, alignItems: "center" }}>
      <View style={{ height: `${topRatio * 100}%` }} />
      {children}
    </View>
  );

  const pages: React.ReactNode[] = [];

  // ── Титульный лист ──
  pages.push(
    <Page key="title" size={pageSize} style={pagePadding}>
      {watermark}
      {centered(
        <>
          <Text style={{ ...displayFace, fontSize: 30 * scale, lineHeight: 1.15, textAlign: "center", color: INK }}>{content.title}</Text>
          {content.subtitle ? (
            <Text style={{ ...italicBody, fontSize: 12 * scale, marginTop: 10, textAlign: "center", color: MUTED }}>{content.subtitle}</Text>
          ) : null}
          {ornament()}
          {content.authorName ? <Text style={{ ...smallCaps, textAlign: "center" }}>{content.authorName}</Text> : null}
        </>,
        0.32,
      )}
      <Text style={{ ...smallCaps, textAlign: "center", fontSize: 7 * scale }}>{content.year}</Text>
    </Page>,
  );

  // ── Оборот титула ──
  pages.push(
    <Page key="colophon" size={pageSize} style={pagePadding}>
      {watermark}
      <View style={{ flexGrow: 1 }} />
      <Text style={{ ...face(typo.body, 400), fontSize: 7.5 * scale, lineHeight: 1.6, color: MUTED }}>
        {`© ${content.year}${content.authorName ? ` ${content.authorName}` : ""}. Все права защищены.\n`}
        {`Эта книга написана с любовью и напечатана в единственном экземпляре на ${site.name}.`}
      </Text>
    </Page>,
  );

  // ── Посвящение ──
  if (content.dedication) {
    pages.push(
      <Page key="dedication" size={pageSize} style={pagePadding}>
        {watermark}
        {centered(
          <Text style={{ ...italicBody, fontSize: 13 * scale, lineHeight: 1.6, textAlign: "center", color: INK, maxWidth: "85%" }}>
            {content.dedication}
          </Text>,
          0.34,
        )}
      </Page>,
    );
  }

  // ── Оглавление ──
  if (content.showToc && content.chapters.length) {
    const entries = [...content.chapters.map((c) => ({ key: c.key, label: c.title, num: c.number }))];
    if (content.galleryPhotos.length) entries.push({ key: "__gallery", label: "Наши моменты", num: 0 });
    pages.push(
      <Page key="toc" size={pageSize} style={pagePadding} wrap>
        {watermark}
        <Text style={{ ...displayFace, fontSize: 22 * scale, textAlign: "center", marginTop: 20 * scale, marginBottom: 26 * scale, color: INK }}>
          Содержание
        </Text>
        {entries.map((e) => (
          <View key={e.key} wrap={false} style={{ flexDirection: "row", alignItems: "flex-end", marginBottom: 7 * scale }}>
            <Text style={{ ...face(typo.body, 400), fontSize: bodyPt, color: INK, maxWidth: "82%" }}>
              {e.num ? `${e.num}. ` : ""}
              {e.label}
            </Text>
            <View style={{ flexGrow: 1, borderBottomWidth: 0.6, borderBottomColor: LIGHT, borderBottomStyle: "dotted", marginHorizontal: 5, marginBottom: 3 }} />
            <Text style={{ ...face(typo.body, 400), fontSize: bodyPt, color: MUTED }}>{options.tocPages?.[e.key] ?? "00"}</Text>
          </View>
        ))}
      </Page>,
    );
  }

  const opener = (key: string, kicker: string | null, title: string, epigraph?: string) => (
    <Page key={`open-${key}`} size={pageSize} style={pagePadding}>
      {watermark}
      <Text
        style={{ position: "absolute", top: 0, left: 0, fontSize: 1, color: "#FFFFFF" }}
        render={({ pageNumber }) => {
          options.onChapterPage?.(key, pageNumber);
          return " ";
        }}
      />
      {centered(
        <>
          {kicker ? <Text style={{ ...smallCaps, textAlign: "center", marginBottom: 14 * scale }}>{kicker}</Text> : null}
          <Text style={{ ...displayFace, fontSize: 26 * scale, lineHeight: 1.15, textAlign: "center", color: INK, maxWidth: "90%" }}>{title}</Text>
          {ornament(26)}
          {epigraph ? (
            <Text style={{ ...italicBody, fontSize: 10 * scale, lineHeight: 1.55, textAlign: "center", color: MUTED, maxWidth: "78%" }}>
              {epigraph}
            </Text>
          ) : null}
        </>,
        0.3,
      )}
    </Page>
  );

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
    const half = group.length > 1 || group[0].layout === "half";
    return (
      <Page key={key} size={pageSize} style={pagePadding}>
        {watermark}
        <View style={{ flexGrow: 1, justifyContent: half ? "space-around" : "center" }}>
          {group.map((p) => {
            const img = options.images.get(p.id);
            return (
              <View key={p.id} style={{ alignItems: "center", flexGrow: half ? 0 : 1, justifyContent: "center", height: half ? "47%" : undefined }}>
                {img ? (
                  <Image
                    src={{ data: img.data, format: "jpg" }}
                    style={{ maxWidth: "100%", maxHeight: p.caption ? "88%" : "100%", objectFit: "contain" }}
                  />
                ) : null}
                {p.caption ? (
                  <Text style={{ ...italicBody, fontSize: 9 * scale, color: MUTED, textAlign: "center", marginTop: 8 }}>{p.caption}</Text>
                ) : null}
              </View>
            );
          })}
        </View>
      </Page>
    );
  };

  // ── Главы ──
  for (const ch of content.chapters) {
    pages.push(opener(ch.key, `Глава ${ch.number}`, ch.title, ch.epigraph));
    if (ch.items.length) {
      pages.push(
        <Page key={`body-${ch.key}`} size={pageSize} style={pagePadding} wrap>
          {watermark}
          {pageNumber}
          {ch.items.map((it, idx) => (
            <View key={it.id} style={{ marginTop: idx === 0 ? 0 : it.heading ? 20 * scale : 10 * scale }}>
              {it.heading ? (
                <Text minPresenceAhead={40} style={{ ...headingFace, fontSize: bodyPt * 1.55, lineHeight: 1.22, color: INK, marginBottom: 8 * scale }}>
                  {it.heading}
                </Text>
              ) : idx > 0 ? (
                <Text style={{ textAlign: "center", color: LIGHT, fontSize: bodyPt, marginBottom: 10 * scale }}>* * *</Text>
              ) : null}
              {it.answer
                .split(/\n+/)
                .map((p) => p.trim())
                .filter(Boolean)
                .map((p, i) => (
                  <Text key={i} style={{ ...body, marginBottom: bodyPt * 0.45 }} orphans={2} widows={2}>
                    {p}
                  </Text>
                ))}
            </View>
          ))}
        </Page>,
      );
    }
    photoPages(ch.photos).forEach((group, i) => pages.push(photoPage(group, `ph-${ch.key}-${i}`)));
  }

  // ── Галерея ──
  if (content.galleryPhotos.length) {
    pages.push(opener("__gallery", null, "Наши моменты"));
    photoPages(content.galleryPhotos).forEach((group, i) => pages.push(photoPage(group, `ph-gallery-${i}`)));
  }

  // ── Финал ──
  pages.push(
    <Page key="end" size={pageSize} style={pagePadding}>
      {watermark}
      {centered(
        <>
          {ornament(20)}
          <Text style={{ ...italicBody, fontSize: 14 * scale, textAlign: "center", color: INK }}>Продолжение следует…</Text>
          <Text style={{ ...smallCaps, textAlign: "center", marginTop: 16 }}>{content.year}</Text>
        </>,
        0.36,
      )}
    </Page>,
  );

  return (
    <Document title={content.title} author={content.authorName || site.name} creator={site.name} producer={site.name} language="ru">
      {pages}
    </Document>
  );
}
