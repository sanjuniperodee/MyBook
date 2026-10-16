import "server-only";
import { Page, Text } from "@react-pdf/renderer";
import { DISPLAY_TOP, FRONT, VIGNETTE_RULE } from "@/lib/book/typesetting";
import { labelStyle, noHyphens, type PdfKit } from "./kit";
import { Frame, Placed, Vignette, Watermark } from "./parts";

/** Финал: виньетка, «Продолжение следует…» и год. */
export function EndPage({ kit }: { kit: PdfKit }) {
  const { content, design, sizes: S, t } = kit;
  const P = design.palette;
  return (
    <Page size={kit.pageSize} style={kit.pagePadding}>
      <Frame kit={kit} colors={P} />
      <Watermark kit={kit} />
      <Placed top={DISPLAY_TOP.end}>
        <Vignette kit={kit} rule={VIGNETTE_RULE.end} colors={P} />
        <Text hyphenationCallback={noHyphens} style={{ ...kit.italicBody, fontSize: S.end, textAlign: "center", color: P.ink }}>{t.theEnd}</Text>
        <Text style={{ ...labelStyle(kit, P.muted), textAlign: "center", marginTop: FRONT.endYear.before }}>{content.year}</Text>
      </Placed>
    </Page>
  );
}
