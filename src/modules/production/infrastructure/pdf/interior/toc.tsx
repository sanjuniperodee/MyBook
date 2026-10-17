import "server-only";
import { Page, Text, View } from "@react-pdf/renderer";
import { TOC } from "@/lib/book/typesetting";
import { face } from "@/modules/production/infrastructure/pdf/fonts";
import { noHyphens, textFace, type PdfKit } from "./kit";
import { Watermark } from "./parts";

/** Оглавление: главы и галерея, номера полос — из первого прохода (tocPages). */
export function Toc({ kit }: { kit: PdfKit }) {
  const { content, design, sizes: S, scale, t, options } = kit;
  const P = design.palette;
  const bodyFace = face(design.type.body, 400);
  const entries = [...content.chapters.map((c) => ({ key: c.key, label: c.title, num: c.number }))];
  if (content.galleryPhotos.length) entries.push({ key: "__gallery", label: content.galleryTitle, num: 0 });
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
        <View key={e.key} wrap={false} style={{ flexDirection: "row", alignItems: "flex-end", marginBottom: TOC.entry.after * scale }}>
          <Text hyphenationCallback={noHyphens} style={{ ...bodyFace, fontSize: S.body, color: P.ink, maxWidth: TOC.entry.maxWidth }}>
            {e.num ? `${e.num}. ` : ""}
            {e.label}
          </Text>
          <View style={{ flexGrow: 1, borderBottomWidth: TOC.leader.width, borderBottomColor: P.rule, borderBottomStyle: "dotted", marginHorizontal: TOC.leader.side, marginBottom: TOC.leader.bottom }} />
          <Text style={{ ...bodyFace, fontSize: S.body, color: P.muted }}>{options.tocPages?.[e.key] ?? "00"}</Text>
        </View>
      ))}
    </Page>
  );
}
