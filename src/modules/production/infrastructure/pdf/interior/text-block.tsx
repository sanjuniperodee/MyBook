import "server-only";
import { Text, View } from "@react-pdf/renderer";
import type { Style } from "@react-pdf/stylesheet";
import { listMarkerEm, type AnswerBlock } from "@/lib/book/answer-blocks";
import { ANSWER, LEAD_IN, splitLeadIn } from "@/lib/book/typesetting";
import { face } from "@/modules/production/infrastructure/pdf/fonts";
import { mark, noHyphens, type PdfKit } from "./kit";

type Block<K extends AnswerBlock["kind"]> = Extract<AnswerBlock, { kind: K }>;
type BlockProps<K extends AnswerBlock["kind"]> = { kit: PdfKit; block: Block<K>; id: string };

/** Абзац; в начале главы первые слова — капителью (если дизайн это предполагает). */
function Paragraph({ kit, block, id, leadIn }: BlockProps<"para"> & { leadIn: boolean }) {
  const { design, sizes: S } = kit;
  const [lead, rest] = leadIn ? splitLeadIn(block.text) : ["", block.text];
  const leadInStyle: Style = { ...face(design.type.body, 400), fontSize: S.body * LEAD_IN.size, letterSpacing: S.body * LEAD_IN.tracking, textTransform: "uppercase", color: design.palette.accent };
  return (
    <Text {...mark(id)} style={{ ...kit.body, marginBottom: S.body * ANSWER.para.after }} orphans={2} widows={2}>
      {lead ? <Text style={leadInStyle}>{lead}</Text> : null}
      {rest}
    </Text>
  );
}

/** Выделенный короткий ответ-цитата: по центру с отступами или со строкой-линейкой слева. */
function Quote({ kit, block, id }: BlockProps<"quote">) {
  const { design, sizes: S, textWidthPt } = kit;
  const P = design.palette;
  const style: Style = { ...kit.italicBody, fontSize: S.body * ANSWER.quote.size, lineHeight: ANSWER.quote.lineHeight, color: P.ink };
  return design.heading.align === "center" ? (
    <View {...mark(id)} wrap={false} style={{ alignItems: "center", paddingHorizontal: textWidthPt * ANSWER.quote.inset, marginTop: S.body * ANSWER.quote.before, marginBottom: S.body * ANSWER.quote.after }}>
      <Text hyphenationCallback={noHyphens} style={{ ...style, textAlign: "center" }}>
        {block.lines.join("\n")}
      </Text>
    </View>
  ) : (
    <View {...mark(id)} wrap={false} style={{ borderLeftWidth: ANSWER.quote.rule, borderLeftColor: P.accent, borderLeftStyle: "solid", paddingLeft: S.body * ANSWER.quote.indent, marginTop: S.body * ANSWER.quote.before, marginBottom: S.body * ANSWER.quote.after }}>
      <Text hyphenationCallback={noHyphens} style={style}>
        {block.lines.join("\n")}
      </Text>
    </View>
  );
}

function List({ kit, block, id }: BlockProps<"list">) {
  const S = kit.sizes;
  return (
    <View {...mark(id)} style={{ marginBottom: S.body * ANSWER.list.after }}>
      {block.items.map((item, i) => (
        <View key={i} wrap={item.text.length > 260} style={{ flexDirection: "row", marginBottom: i < block.items.length - 1 ? S.body * ANSWER.list.gap : 0 }}>
          <Text style={{ ...kit.body, width: S.body * listMarkerEm(block), textAlign: "left", color: kit.design.palette.accent }}>{item.marker}</Text>
          <Text style={{ ...kit.body, flex: 1, textAlign: "left" }} orphans={2} widows={2}>
            {item.text}
          </Text>
        </View>
      ))}
    </View>
  );
}

/** Блок набора ответа: абзац, лид, выделенный короткий ответ, список или стихи (см. answer-blocks). */
export function TextBlock({ kit, block: b, id, leadIn }: { kit: PdfKit; block: AnswerBlock; id: string; leadIn: boolean }) {
  const { design, sizes: S, textWidthPt } = kit;
  const centered = design.heading.align === "center";
  switch (b.kind) {
    case "para":
      return <Paragraph kit={kit} block={b} id={id} leadIn={leadIn} />;
    case "lede":
      return (
        <Text {...mark(id)} hyphenationCallback={noHyphens} style={{ ...kit.italicBody, fontSize: S.body * ANSWER.lede.size, lineHeight: ANSWER.lede.lineHeight, color: design.palette.muted, textAlign: centered ? "center" : "left", marginBottom: S.body * ANSWER.lede.after }}>
          {b.text}
        </Text>
      );
    case "quote":
      return <Quote kit={kit} block={b} id={id} />;
    case "list":
      return <List kit={kit} block={b} id={id} />;
    case "verse":
      return (
        <Text
          {...mark(id)}
          hyphenationCallback={noHyphens}
          style={{ ...kit.body, textAlign: centered ? "center" : "left", paddingLeft: centered ? 0 : textWidthPt * ANSWER.verse.indent, marginTop: S.body * ANSWER.verse.before, marginBottom: S.body * ANSWER.verse.after }}
          orphans={2}
          widows={2}
        >
          {b.lines.join("\n")}
        </Text>
      );
  }
}
