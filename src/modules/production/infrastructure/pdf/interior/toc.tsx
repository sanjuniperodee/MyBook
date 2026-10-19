import "server-only";
import { Page, Text, View } from "@react-pdf/renderer";
import { bookToc } from "@/lib/book/toc";
import { TOC } from "@/lib/book/typesetting";
import { face } from "@/modules/production/infrastructure/pdf/fonts";
import { noHyphens, textFace, type PdfKit } from "./kit";
import { Watermark } from "./parts";

/** Оглавление: строки по настройкам автора (lib/book/toc), номера полос — из чернового прохода (tocPages). */
export function Toc({ kit }: { kit: PdfKit }) {
  const { content, design, sizes: S, scale, t, options } = kit;
  const P = design.palette;
  const bodyFace = face(design.type.body, 400);
  const entries = bookToc(content);
  return (
    <Page size={kit.pageSize} style={kit.pagePadding} wrap>
      <Watermark kit={kit} />
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
        <View key={e.key} wrap={false} style={{ flexDirection: "row", alignItems: "flex-end", marginBottom: TOC.entry.after * scale, paddingLeft: e.level ? TOC.entry.indent * scale : 0 }}>
          <Text hyphenationCallback={noHyphens} style={{ ...bodyFace, fontSize: S.body, color: e.level ? P.muted : P.ink, maxWidth: TOC.entry.maxWidth }}>
            {e.number ? `${e.number}. ` : ""}
            {e.label}
          </Text>
          <View style={{ flexGrow: 1, borderBottomWidth: TOC.leader.width, borderBottomColor: P.rule, borderBottomStyle: "dotted", marginHorizontal: TOC.leader.side, marginBottom: TOC.leader.bottom }} />
          <Text style={{ ...bodyFace, fontSize: S.body, color: P.muted }}>{options.tocPages?.[e.pageKey] ?? "00"}</Text>
        </View>
      ))}
    </Page>
  );
}
