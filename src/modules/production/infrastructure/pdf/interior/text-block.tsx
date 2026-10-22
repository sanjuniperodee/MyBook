import "server-only";
import { Text, View } from "@react-pdf/renderer";
import type { Style } from "@react-pdf/stylesheet";
import { listMarkerEm, type AnswerBlock } from "@/lib/book/answer-blocks";
import { fontWidth } from "@/lib/book/fonts";
import { ANSWER, dropCapPlan, indentEm, LEAD_IN, paraAfter, QUOTE_MARK, quoteStyle, splitInitial, splitLeadIn, type DropCapPlan } from "@/lib/book/typesetting";
import { face } from "@/modules/production/infrastructure/pdf/fonts";
import { DROP_MARK } from "@/modules/production/infrastructure/pdf/flow";
import { mark, noHyphens, textFace, type PdfKit } from "./kit";

type Block<K extends AnswerBlock["kind"]> = Extract<AnswerBlock, { kind: K }>;
type BlockProps<K extends AnswerBlock["kind"]> = { kit: PdfKit; block: Block<K>; id: string };

/** Капитель начальных слов главы. */
function leadInStyle(kit: PdfKit): Style {
  const { design, sizes: S } = kit;
  return { ...face(design.type.body, 400), fontSize: S.body * LEAD_IN.size, letterSpacing: S.body * LEAD_IN.tracking, textTransform: "uppercase", color: design.palette.accent };
}

/** Текст с капителью в начале (если нужна). */
function LeadText({ kit, text, leadIn }: { kit: PdfKit; text: string; leadIn: boolean }) {
  const [lead, rest] = leadIn ? splitLeadIn(text) : ["", text];
  return (
    <>
      {lead ? <Text style={leadInStyle(kit)}>{lead}</Text> : null}
      {rest}
    </>
  );
}

/**
 * Абзац; в начале главы первые слова — капителью (если дизайн это предполагает). Красная строка — у всех абзацев,
 * кроме первого после заголовка и в начале главы (indentFirst = false), как в книгах.
 */
function Paragraph({ kit, block, id, leadIn, indent }: BlockProps<"para"> & { leadIn: boolean; indent: boolean }) {
  const { design, sizes: S } = kit;
  const em = indentEm(design);
  return (
    <Text {...mark(id)} style={{ ...kit.body, ...kit.measure, marginBottom: S.body * paraAfter(design), ...(indent && em ? { textIndent: S.body * em } : {}) }} orphans={2} widows={2}>
      <LeadText kit={kit} text={block.text} leadIn={leadIn} />
    </Text>
  );
}

/**
 * Оценка, сколько знаков встанет в строки рядом с буквицей, — только для первого прохода: дальше место продолжения
 * берётся из настоящей раскладки (flow.dropSplit, pdf/flow.ts refineDropCaps).
 */
function estimateSplit(text: string, kit: PdfKit, plan: DropCapPlan) {
  const { design, sizes: S } = kit;
  const capW = plan.size * fontWidth(plan.face.font) * 1.3 + plan.gap;
  const width = kit.textWidthPt - Number(kit.measure.marginLeft ?? 0) - Number(kit.measure.marginRight ?? 0) - capW;
  const perLine = Math.max(8, Math.floor(width / (S.body * fontWidth(design.type.body))));
  let pos = 0;
  for (let line = 0; line < plan.lines && pos < text.length; line++) {
    const end = Math.min(text.length, pos + perLine);
    const space = end >= text.length ? text.length : text.lastIndexOf(" ", end);
    pos = space > pos ? space + 1 : end;
  }
  return pos;
}

/**
 * Абзац с буквицей. Опущенная: буква на lines строк, рядом — колонка, в которую react-pdf сам ставит строки (весь остаток
 * абзаца, видно ровно lines строк, следующая срезана — поэтому и последняя видимая строка выключена по ширине), ниже —
 * продолжение с того знака, где кончились строки колонки (по раскладке прошлого прохода). Поднятая — крупная первая
 * буква в первой строке.
 */
function DropCapParagraph({ kit, block, id, leadIn, plan }: BlockProps<"para"> & { leadIn: boolean; plan: DropCapPlan }) {
  const { design, sizes: S } = kit;
  const parts = splitInitial(block.text);
  if (!parts) return <Paragraph kit={kit} block={block} id={id} leadIn={leadIn} indent={false} />;
  const [initial, rest] = parts;
  const capStyle: Style = { ...textFace(plan.face, plan.size), lineHeight: plan.lineHeight, color: plan.color };
  if (plan.style === "raised")
    return (
      <Text {...mark(id)} style={{ ...kit.body, ...kit.measure, marginBottom: S.body * paraAfter(design) }} orphans={2} widows={2}>
        <Text style={capStyle}>{initial}</Text>
        <LeadText kit={kit} text={rest} leadIn={leadIn} />
      </Text>
    );
  kit.options.dropColumns?.set(id, { text: rest, lines: plan.lines });
  const split = Math.min(rest.length, kit.flow.dropSplit.get(id) ?? estimateSplit(rest, kit, plan));
  const after = rest.slice(split).replace(/^\s+/, "");
  return (
    <View {...mark(id)} style={{ ...kit.measure, marginBottom: S.body * paraAfter(design) }}>
      <View wrap={false} style={{ flexDirection: "row" }}>
        <Text hyphenationCallback={noHyphens} style={{ ...capStyle, marginTop: plan.top, marginRight: plan.gap }}>
          {initial}
        </Text>
        <View style={{ flexGrow: 1, flexBasis: 0, height: plan.height, overflow: "hidden" }}>
          {/* Абсолютно: иначе react-pdf обрежет текст по высоте колонки и поставит многоточие. */}
          <Text {...({ [DROP_MARK]: id } as object)} style={{ ...kit.body, position: "absolute", top: 0, left: 0, right: 0, maxLines: plan.lines + 1 }}>
            <LeadText kit={kit} text={rest} leadIn={leadIn} />
          </Text>
        </View>
      </View>
      {after ? (
        <Text style={kit.body} orphans={2} widows={2}>
          {after}
        </Text>
      ) : null}
    </View>
  );
}

/** Выделенный короткий ответ-цитата: по центру с отступами, со строкой-линейкой слева или с крупной кавычкой. */
function Quote({ kit, block, id }: BlockProps<"quote">) {
  const { design, sizes: S, textWidthPt } = kit;
  const P = design.palette;
  const style: Style = { ...kit.italicBody, fontSize: S.body * ANSWER.quote.size, lineHeight: ANSWER.quote.lineHeight, color: P.ink };
  const kind = quoteStyle(design);
  const around = { marginTop: S.body * ANSWER.quote.before, marginBottom: S.body * ANSWER.quote.after };
  if (kind === "center")
    return (
      <View {...mark(id)} wrap={false} style={{ alignItems: "center", paddingHorizontal: textWidthPt * ANSWER.quote.inset, ...around }}>
        <Text hyphenationCallback={noHyphens} style={{ ...style, textAlign: "center" }}>
          {block.lines.join("\n")}
        </Text>
      </View>
    );
  if (kind === "mark") {
    const size = S.body * ANSWER.quote.size;
    return (
      <View {...mark(id)} wrap={false} style={{ ...kit.measure, paddingLeft: S.body * ANSWER.quote.indent, ...around }}>
        <Text style={{ ...textFace(design.display, size * QUOTE_MARK.size), lineHeight: QUOTE_MARK.lineHeight, color: P.accent, marginBottom: size * QUOTE_MARK.after }}>“</Text>
        <Text hyphenationCallback={noHyphens} style={style}>
          {block.lines.join("\n")}
        </Text>
      </View>
    );
  }
  return (
    <View {...mark(id)} wrap={false} style={{ borderLeftWidth: ANSWER.quote.rule, borderLeftColor: P.accent, borderLeftStyle: "solid", paddingLeft: S.body * ANSWER.quote.indent, ...around }}>
      <Text hyphenationCallback={noHyphens} style={style}>
        {block.lines.join("\n")}
      </Text>
    </View>
  );
}

function List({ kit, block, id }: BlockProps<"list">) {
  const S = kit.sizes;
  return (
    <View {...mark(id)} style={{ ...kit.measure, marginBottom: S.body * ANSWER.list.after }}>
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

/**
 * Блок набора ответа: абзац, лид, выделенный короткий ответ, список или стихи (см. answer-blocks).
 * leadIn — капитель в начале главы, dropCap — здесь начинается глава (буквица, если она есть в дизайне),
 * first — первый блок ответа (без красной строки).
 */
export function TextBlock({ kit, block: b, id, leadIn, dropCap = false, first = true }: { kit: PdfKit; block: AnswerBlock; id: string; leadIn: boolean; dropCap?: boolean; first?: boolean }) {
  const { design, sizes: S, textWidthPt } = kit;
  const centered = design.heading.align === "center";
  switch (b.kind) {
    case "para": {
      const plan = dropCap ? dropCapPlan(design, S) : null;
      return plan ? <DropCapParagraph kit={kit} block={b} id={id} leadIn={leadIn} plan={plan} /> : <Paragraph kit={kit} block={b} id={id} leadIn={leadIn} indent={!first} />;
    }
    case "lede":
      return (
        <Text {...mark(id)} hyphenationCallback={noHyphens} style={{ ...kit.italicBody, ...kit.measure, fontSize: S.body * ANSWER.lede.size, lineHeight: ANSWER.lede.lineHeight, color: design.palette.muted, textAlign: centered ? "center" : "left", marginBottom: S.body * ANSWER.lede.after }}>
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
          style={{ ...kit.body, ...kit.measure, textAlign: centered ? "center" : "left", paddingLeft: centered ? 0 : textWidthPt * ANSWER.verse.indent, marginTop: S.body * ANSWER.verse.before, marginBottom: S.body * ANSWER.verse.after }}
          orphans={2}
          widows={2}
        >
          {b.lines.join("\n")}
        </Text>
      );
  }
}
