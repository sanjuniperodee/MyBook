import "server-only";
import { Page, Text, View } from "@react-pdf/renderer";
import { site } from "@/config/site";
import { FRONT } from "@/lib/book/typesetting";
import { face } from "@/modules/production/infrastructure/pdf/fonts";
import type { PdfKit } from "./kit";
import { Watermark } from "./parts";

/** Оборот титула: копирайт и выходные данные внизу полосы. */
export function Colophon({ kit }: { kit: PdfKit }) {
  const { content, design, sizes: S, t } = kit;
  return (
    <Page size={kit.pageSize} style={kit.pagePadding}>
      <Watermark kit={kit} />
      <View style={{ flexGrow: 1 }} />
      <Text style={{ ...face(design.type.body, 400), fontSize: S.colophon, lineHeight: FRONT.colophon.lineHeight, color: design.palette.muted }}>
        {`${t.copyright(content.year, content.authorName)}\n`}
        {t.colophon(site.name)}
      </Text>
    </Page>
  );
}
