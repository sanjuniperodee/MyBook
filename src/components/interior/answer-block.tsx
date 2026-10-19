import type { CSSProperties } from "react";
import { listMarkerEm, type AnswerBlock } from "@/lib/book/answer-blocks";
import { ANSWER } from "@/lib/book/typesetting";
import { textArea } from "@/lib/book/page-geometry";
import type { PageKit } from "./kit";
import { italicBody, LeadParagraph, paragraphCss } from "./typography";

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
  return (
    <div
      style={{
        breakInside: "avoid",
        marginTop: u.pt(S.body * ANSWER.quote.before),
        marginBottom: u.pt(S.body * ANSWER.quote.after),
        ...(design.heading.align === "center"
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
    <div style={{ marginBottom: u.pt(S.body * ANSWER.list.after), ...style }} {...rest}>
      {block.items.map((item, i) => (
        <div key={i} style={{ display: "flex", marginBottom: i < block.items.length - 1 ? u.pt(S.body * ANSWER.list.gap) : 0 }}>
          <span style={{ ...paragraphCss(kit), marginBottom: 0, flex: "none", width: u.pt(S.body * listMarkerEm(block)), textAlign: "left", color: kit.design.palette.accent }}>{item.marker}</span>
          <span style={{ ...paragraphCss(kit), marginBottom: 0, flex: 1, textAlign: "left" }}>{item.text}</span>
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
export function AnswerBlockView({ kit, block: b, leadIn, style, ...rest }: { kit: PageKit; block: AnswerBlock; leadIn: boolean; style?: CSSProperties } & React.HTMLAttributes<HTMLElement>) {
  switch (b.kind) {
    case "para":
      return <LeadParagraph kit={kit} text={b.text} leadIn={leadIn} style={style} {...rest} />;
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
