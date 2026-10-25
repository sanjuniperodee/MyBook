import "server-only";
import { Page, Text, View } from "@react-pdf/renderer";
import { titleEmblemShapes } from "@/lib/book/interior-art";
import { titleLineText } from "@/lib/book/title-line";
import { DISPLAY_TOP, FRONT, TITLE_LAYOUT, VIGNETTE_RULE } from "@/lib/book/typesetting";
import { PdfPageLayer } from "../art";
import { labelStyle, noHyphens, pageMark, textFace, type PdfKit } from "./kit";
import { Frame, Placed, Vignette } from "./parts";

/**
 * Титульный лист. Композиция — по дизайну (titlePage.layout): по центру с виньеткой (как раньше), влево с акцентной
 * линейкой, название внизу полосы (имя автора — сверху) или крупный набор сверху с выходными строками внизу.
 */
export function TitlePage({ kit }: { kit: PdfKit }) {
  const { content, design, sizes: S, italicBody, scale, box } = kit;
  const P = design.palette;
  const layout = design.titlePage?.layout ?? "center";
  const title = (size: number, align: "left" | "center") => (
    <Text hyphenationCallback={noHyphens} style={{ ...textFace(design.display, size), lineHeight: layout === "stack" ? TITLE_LAYOUT.stackLineHeight : FRONT.title.lineHeight, textAlign: align, color: P.ink }}>
      {content.title}
    </Text>
  );
  const subtitle = (align: "left" | "center") =>
    content.subtitle ? <Text hyphenationCallback={noHyphens} style={{ ...italicBody, fontSize: S.subtitle, marginTop: FRONT.subtitle.before, textAlign: align, color: P.muted }}>{content.subtitle}</Text> : null;
  const line = titleLineText(design, content.authorName);
  const author = (align: "left" | "center") => (line ? <Text hyphenationCallback={noHyphens} style={{ ...labelStyle(kit, P.muted), textAlign: align }}>{line}</Text> : null);
  const year = (align: "left" | "center" | "right") => <Text style={{ ...labelStyle(kit, P.muted, S.year), textAlign: align }}>{content.year}</Text>;
  // Рисунок книги (ИИ-дизайнер) над названием: общая графика полосы рядом с рамкой.
  const emblem = <PdfPageLayer shapes={titleEmblemShapes(design.emblem, layout, { w: box.w, h: box.h, palette: P })} box={box} />;
  const bar = <View style={{ width: TITLE_LAYOUT.bar * scale, height: TITLE_LAYOUT.barThickness, backgroundColor: P.accent, marginVertical: S.vignetteGap }} />;

  if (layout === "left")
    return (
      <Page {...pageMark("front")} size={kit.pageSize} style={kit.pagePadding}>
        <Frame kit={kit} colors={P} />
        {emblem}
        <Placed top={DISPLAY_TOP.title} align="left">
          {title(S.title, "left")}
          {subtitle("left")}
          {bar}
          {author("left")}
        </Placed>
        {year("left")}
      </Page>
    );
  if (layout === "bottom")
    return (
      <Page {...pageMark("front")} size={kit.pageSize} style={kit.pagePadding}>
        <Frame kit={kit} colors={P} />
        {emblem}
        {author("left")}
        <View style={{ flexGrow: 1 }} />
        {title(S.title, "left")}
        {subtitle("left")}
        <View style={{ height: S.vignetteGap * 2 }} />
        {year("left")}
      </Page>
    );
  if (layout === "stack")
    return (
      <Page {...pageMark("front")} size={kit.pageSize} style={kit.pagePadding}>
        <Frame kit={kit} colors={P} />
        {emblem}
        <View style={{ height: `${TITLE_LAYOUT.stackTop * 100}%` }} />
        {title(S.title * TITLE_LAYOUT.stackScale, "left")}
        {subtitle("left")}
        <View style={{ flexGrow: 1 }} />
        <View style={{ height: TITLE_LAYOUT.ruleThickness, backgroundColor: P.ink, marginBottom: S.vignetteGap * 0.7 }} />
        <View style={{ flexDirection: "row", justifyContent: "space-between" }}>
          {author("left") ?? <Text> </Text>}
          {year("right")}
        </View>
      </Page>
    );
  return (
    <Page {...pageMark("front")} size={kit.pageSize} style={kit.pagePadding}>
      <Frame kit={kit} colors={P} />
        {emblem}
      <Placed top={DISPLAY_TOP.title}>
        {title(S.title, "center")}
        {subtitle("center")}
        <Vignette kit={kit} rule={VIGNETTE_RULE.title} colors={P} />
        {author("center")}
      </Placed>
      {year("center")}
    </Page>
  );
}
