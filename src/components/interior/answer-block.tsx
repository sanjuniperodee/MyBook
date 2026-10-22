import type { CSSProperties } from "react";
import { listMarkerEm, type AnswerBlock } from "@/lib/book/answer-blocks";
import { ANSWER, QUOTE_MARK, quoteStyle } from "@/lib/book/typesetting";
import { textArea } from "@/lib/book/page-geometry";
import type { PageKit } from "./kit";
import { faceCss, italicBody, LeadParagraph, measureCss, paragraphCss } from "./typography";

type BlockProps<K extends AnswerBlock["kind"]> = { kit: PageKit; block: Extract<AnswerBlock, { kind: K }>; style?: CSSProperties } & React.HTMLAttributes<HTMLElement>;

const lines = (list: string[]) => list.map((l, i) => (i ? [<br key={i} />, l] : l));

function Lede({ kit, block, style, ...rest }: BlockProps<"lede">) {
  const { design, sizes: S, u } = kit;
  return (
    <p
      style={{
        ...italicBody(kit, S.body * ANSWER.lede.size),
        lineHeight: ANSWER.lede.lineHeight,
        color: design.palette.muted,
        textAlign: design.heading.align === "center" ? "center" : "left",
        marginBottom: u.pt(S.body * ANSWER.lede.after),
        breakAfter: "avoid",
        ...measureCss(kit),
        ...style,
      }}
      {...rest}
    >
      {block.text}
    </p>
  );
}

function Quote({ kit, block, style, ...rest }: BlockProps<"quote">) {
  const { design, sizes: S, u } = kit;
  const P = design.palette;
  const text: CSSProperties = { ...italicBody(kit, S.body * ANSWER.quote.size), lineHeight: ANSWER.quote.lineHeight, color: P.ink };
  const kind = quoteStyle(design);
  if (kind === "mark") {
    const size = S.body * ANSWER.quote.size;
    return (
      <div style={{ breakInside: "avoid", marginTop: u.pt(S.body * ANSWER.quote.before), marginBottom: u.pt(S.body * ANSWER.quote.after), paddingLeft: u.pt(S.body * ANSWER.quote.indent), ...measureCss(kit), ...style }} {...rest}>
        <div aria-hidden style={{ ...faceCss(design.display, size * QUOTE_MARK.size, u), lineHeight: QUOTE_MARK.lineHeight, color: P.accent, marginBottom: u.pt(size * QUOTE_MARK.after), height: u.pt(size * QUOTE_MARK.size * QUOTE_MARK.lineHeight) }}>
          “
        </div>
        <div style={text}>{lines(block.lines)}</div>
      </div>
    );
  }
  return (
    <div
      style={{
        breakInside: "avoid",
        marginTop: u.pt(S.body * ANSWER.quote.before),
        marginBottom: u.pt(S.body * ANSWER.quote.after),
        ...(kind === "center"
          ? { ...text, textAlign: "center", paddingInline: u.mm(textArea(kit.format).w * ANSWER.quote.inset) }
          : { ...text, borderLeft: `${u.pt(ANSWER.quote.rule)} solid ${P.accent}`, paddingLeft: u.pt(S.body * ANSWER.quote.indent) }),
        ...style,
      }}
      {...rest}
    >
      {lines(block.lines)}
    </div>
  );
}

function List({ kit, block, style, ...rest }: BlockProps<"list">) {
  const { sizes: S, u } = kit;
  return (
    <div style={{ marginBottom: u.pt(S.body * ANSWER.list.after), ...measureCss(kit), ...style }} {...rest}>
      {block.items.map((item, i) => (
        <div key={i} style={{ display: "flex", marginBottom: i < block.items.length - 1 ? u.pt(S.body * ANSWER.list.gap) : 0 }}>
          <span style={{ ...paragraphCss(kit), marginBottom: 0, marginLeft: 0, marginRight: 0, flex: "none", width: u.pt(S.body * listMarkerEm(block)), textAlign: "left", color: kit.design.palette.accent }}>{item.marker}</span>
          <span style={{ ...paragraphCss(kit), marginBottom: 0, marginLeft: 0, marginRight: 0, flex: 1, textAlign: "left" }}>{item.text}</span>
        </div>
      ))}
    </div>
  );
}

function Verse({ kit, block, style, ...rest }: BlockProps<"verse">) {
  const { design, sizes: S, u } = kit;
  const centered = design.heading.align === "center";
  return (
    <p
      style={{
        ...paragraphCss(kit),
        hyphens: "manual",
        textAlign: centered ? "center" : "left",
        paddingLeft: centered ? 0 : u.mm(textArea(kit.format).w * ANSWER.verse.indent),
        marginTop: u.pt(S.body * ANSWER.verse.before),
        marginBottom: u.pt(S.body * ANSWER.verse.after),
        ...style,
      }}
      {...rest}
    >
      {lines(block.lines)}
    </p>
  );
}

/**
 * Блок набора ответа — как в PDF (answer-blocks): абзац, лид, выделенный короткий ответ, список, стихи.
 * Остальные атрибуты (data-*) — на корневом элементе блока.
 */
export function AnswerBlockView({
  kit,
  block: b,
  leadIn,
  dropCap = false,
  first = true,
  style,
  ...rest
}: { kit: PageKit; block: AnswerBlock; leadIn: boolean; /** Здесь начинается глава: буквица. */ dropCap?: boolean; /** Первый блок ответа: без красной строки. */ first?: boolean; style?: CSSProperties } & React.HTMLAttributes<HTMLElement>) {
  switch (b.kind) {
    case "para":
      return <LeadParagraph kit={kit} text={b.text} leadIn={leadIn} dropCap={dropCap} indent={!first} style={style} {...rest} />;
    case "lede":
      return <Lede kit={kit} block={b} style={style} {...rest} />;
    case "quote":
      return <Quote kit={kit} block={b} style={style} {...rest} />;
    case "list":
      return <List kit={kit} block={b} style={style} {...rest} />;
    case "verse":
      return <Verse kit={kit} block={b} style={style} {...rest} />;
  }
}
