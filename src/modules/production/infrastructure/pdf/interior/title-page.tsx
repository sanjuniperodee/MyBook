import "server-only";
import { Page, Text } from "@react-pdf/renderer";
import { DISPLAY_TOP, FRONT, VIGNETTE_RULE } from "@/lib/book/typesetting";
import { labelStyle, noHyphens, textFace, type PdfKit } from "./kit";
import { Frame, Placed, Vignette, Watermark } from "./parts";

/** Титульный лист. */
export function TitlePage({ kit }: { kit: PdfKit }) {
  const { content, design, sizes: S, italicBody } = kit;
  const P = design.palette;
  return (
    <Page size={kit.pageSize} style={kit.pagePadding}>
      <Frame kit={kit} colors={P} />
      <Watermark kit={kit} />
      <Placed top={DISPLAY_TOP.title}>
        <Text hyphenationCallback={noHyphens} style={{ ...textFace(design.display, S.title), lineHeight: FRONT.title.lineHeight, textAlign: "center", color: P.ink }}>{content.title}</Text>
        {content.subtitle ? (
          <Text hyphenationCallback={noHyphens} style={{ ...italicBody, fontSize: S.subtitle, marginTop: FRONT.subtitle.before, textAlign: "center", color: P.muted }}>{content.subtitle}</Text>
        ) : null}
        <Vignette kit={kit} rule={VIGNETTE_RULE.title} colors={P} />
        {content.authorName ? <Text hyphenationCallback={noHyphens} style={{ ...labelStyle(kit, P.muted), textAlign: "center" }}>{content.authorName}</Text> : null}
      </Placed>
      <Text style={{ ...labelStyle(kit, P.muted, S.year), textAlign: "center" }}>{content.year}</Text>
    </Page>
  );
}
