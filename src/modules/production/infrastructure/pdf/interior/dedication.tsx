import "server-only";
import { Page, Text } from "@react-pdf/renderer";
import { DISPLAY_TOP, FRONT } from "@/lib/book/typesetting";
import { noHyphens, pageMark, type PdfKit } from "./kit";
import { Frame, Placed } from "./parts";

/** Посвящение. */
export function Dedication({ kit, text }: { kit: PdfKit; text: string }) {
  const P = kit.design.palette;
  return (
    <Page {...pageMark("front")} size={kit.pageSize} style={kit.pagePadding}>
      <Frame kit={kit} colors={P} />
      <Placed top={DISPLAY_TOP.dedication}>
        <Text hyphenationCallback={noHyphens} style={{ ...kit.italicBody, fontSize: kit.sizes.dedication, lineHeight: FRONT.dedication.lineHeight, textAlign: "center", color: P.ink, maxWidth: FRONT.dedication.maxWidth }}>{text}</Text>
      </Placed>
    </Page>
  );
}
