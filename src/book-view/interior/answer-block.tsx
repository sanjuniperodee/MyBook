import type { CSSProperties } from "react";
import { listMarkerEm, type AnswerBlock } from "@/lib/book/answer-blocks";
import { ANSWER, paraIndent, QUOTE_MARK, quoteStyle } from "@/lib/book/typesetting";
import { textArea } from "@/lib/book/page-geometry";
import { GAP_BELOW, gapAbove } from "./entry-gap";
import type { PageKit } from "./kit";
import { faceCss, italicBody, LeadParagraph, measureCss, paragraphCss } from "./typography";
import { lineSpans } from "./lines";
import { breakBefore } from "./breaks";
import { keepWithNext } from "./keep";
import { bodySpec, italicSpec, measureWidthPt, textWidthPt } from "./text-specs";

/** Пометка блока (data-flow): по ней — разрывы полос, как у PDF (kit.breaks). */
const pidOf = (rest: object) => (rest as Record<string, string | undefined>)["data-flow"];

type BlockProps<K extends AnswerBlock["kind"]> = { kit: PageKit; block: Extract<AnswerBlock, { kind: K }>; style?: CSSProperties } & React.HTMLAttributes<HTMLElement>;

const lines = (list: string[]) => list.map((l, i) => (i ? [<br key={i} />, l] : l));

/** Строки стихов по строфам: между строфами — просвет gap (в PDF — отступ между абзацами-строфами). */
function stanzaLines(kit: PageKit, pid: string | undefined, block: Extract<AnswerBlock, { kind: "verse" }>, gap: string, broken: (list: string[], pid?: string) => React.ReactNode[] | null) {
  const starts = [0, ...(block.stanzas ?? []), block.lines.length];
  return starts.slice(0, -1).map((from, k) => {
    const list = block.lines.slice(from, starts[k + 1]);
    return (
      <span key={k} style={{ display: "block", marginTop: k ? gap : 0, ...breakBefore(kit, `${pid}:s${k}`) }}>
        {broken(list, `${pid}:s${k}`) ?? lines(list)}
      </span>
    );
  });
}

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
        ...keepWithNext(kit),
        ...measureCss(kit),
        ...style,
      }}
      {...rest}
    >
      {lineSpans({ kit, pid: pidOf(rest), req: { text: block.text, spec: italicSpec(kit, S.body * ANSWER.lede.size), width: measureWidthPt(kit), hyphens: false, justify: false }, align: design.heading.align === "center" ? "center" : "left" }) ?? block.text}
    </p>
  );
}

/**
 * Выделенный короткий ответ. Он неделим, как в PDF: отбивка снизу — полем внутри обёртки (GAP_BELOW), чтобы она, как у
 * react-pdf, помещалась на полосе вместе с цитатой и не схлопывалась со следующим блоком.
 */
function Quote({ kit, block, style, ...rest }: BlockProps<"quote">) {
  const { design, sizes: S, u } = kit;
  const P = design.palette;
  const text: CSSProperties = { ...italicBody(kit, S.body * ANSWER.quote.size), lineHeight: ANSWER.quote.lineHeight, color: P.ink };
  const kind = quoteStyle(design);
  // Строки, как у PDF: каждая строка цитаты — свой абзац (перевод строки), ширина — по виду цитаты, без переносов.
  // По центру — у PDF в контейнере alignItems: center (lineSpans: centered).
  const quoteLines = (width: number, align: "left" | "center") => lineSpans({ kit, req: { text: block.lines.join("\n"), spec: italicSpec(kit, S.body * ANSWER.quote.size), width, hyphens: false, justify: false }, align, centered: align === "center" });
  const top = gapAbove(S.body * ANSWER.quote.before, u.pt);
  const outer: CSSProperties = { breakInside: "avoid", ...top.style, paddingBottom: u.pt(S.body * ANSWER.quote.after), ...style };
  if (kind === "mark") {
    const size = S.body * ANSWER.quote.size;
    return (
      <div style={outer} {...GAP_BELOW} {...top.attrs} {...rest}>
        <div style={{ paddingLeft: u.pt(S.body * ANSWER.quote.indent), ...measureCss(kit) }}>
          <div aria-hidden style={{ ...faceCss(design.display, size * QUOTE_MARK.size, u), lineHeight: QUOTE_MARK.lineHeight, color: P.accent, marginBottom: u.pt(size * QUOTE_MARK.after), height: u.pt(size * QUOTE_MARK.size * QUOTE_MARK.lineHeight) }}>
            “
          </div>
          <div style={text}>{quoteLines(measureWidthPt(kit) - S.body * ANSWER.quote.indent, "left") ?? lines(block.lines)}</div>
        </div>
      </div>
    );
  }
  if (kind === "center")
    return (
      <div style={outer} {...GAP_BELOW} {...top.attrs} {...rest}>
        <div style={{ ...text, textAlign: "center", paddingInline: u.mm(textArea(kit.format).w * ANSWER.quote.inset) }}>{quoteLines(textWidthPt(kit) * (1 - 2 * ANSWER.quote.inset), "center") ?? lines(block.lines)}</div>
      </div>
    );
  // Линейка — фоном, а не рамкой (толщину рамки браузер округляет до целых пикселей), и у обёртки: строки текста
  // сдвинуты к местам PDF (pdfLineCss), а линейка, как у PDF, — во всю высоту блока, без сдвига.
  return (
    <div style={outer} {...GAP_BELOW} {...top.attrs} {...rest}>
      <div style={{ paddingLeft: u.pt(ANSWER.quote.rule + S.body * ANSWER.quote.indent), backgroundImage: `linear-gradient(${P.accent}, ${P.accent})`, backgroundSize: `${u.pt(ANSWER.quote.rule)} 100%`, backgroundRepeat: "no-repeat" }}>
        <div style={text}>{quoteLines(textWidthPt(kit) - ANSWER.quote.rule - S.body * ANSWER.quote.indent, "left") ?? lines(block.lines)}</div>
      </div>
    </div>
  );
}

function List({ kit, block, style, ...rest }: BlockProps<"list">) {
  const { sizes: S, u } = kit;
  return (
    <div style={{ marginBottom: u.pt(S.body * ANSWER.list.after), ...measureCss(kit), ...style }} {...rest}>
      {block.items.map((item, i) => (
        // Короткий пункт у PDF неделим (wrap={false} до 260 знаков), длинный переносится с висячими строками.
        <div key={i} style={{ display: "flex", marginBottom: i < block.items.length - 1 ? u.pt(S.body * ANSWER.list.gap) : 0, ...(item.text.length > 260 ? {} : { breakInside: "avoid" }), ...breakBefore(kit, `${pidOf(rest)}:${i}`) }}>
          <span style={{ ...paragraphCss(kit), marginBottom: 0, marginLeft: 0, marginRight: 0, flex: "none", width: u.pt(S.body * listMarkerEm(block)), textAlign: "left", color: kit.design.palette.accent }}>{item.marker}</span>
          <span style={{ ...paragraphCss(kit), marginBottom: 0, marginLeft: 0, marginRight: 0, flex: 1, textAlign: "left" }}>
            {lineSpans({ kit, pid: `${pidOf(rest)}:${i}:t`, req: { text: item.text, spec: bodySpec(kit), width: measureWidthPt(kit) - S.body * listMarkerEm(block), hyphens: true, justify: false }, align: "left", keepPairs: true }) ??
              (kit.hyphenate ? kit.hyphenate(item.text) : item.text)}
          </span>
        </div>
      ))}
    </div>
  );
}

function Strong({ kit, block, style, ...rest }: BlockProps<"strong">) {
  const { sizes: S, u } = kit;
  const strongTop = gapAbove(S.body * ANSWER.strong.before, u.pt);
  return (
    <p
      style={{
        ...paragraphCss(kit),
        fontWeight: ANSWER.strong.weight,
        textAlign: "left",
        ...strongTop.style,
        marginBottom: u.pt(S.body * ANSWER.strong.after),
        ...style,
      }}
      {...strongTop.attrs}
      {...rest}
    >
      {lineSpans({ kit, pid: pidOf(rest), req: { text: block.text, spec: { ...bodySpec(kit), weight: ANSWER.strong.weight }, width: measureWidthPt(kit), hyphens: true, justify: false }, align: "left", keepPairs: true }) ??
        (kit.hyphenate ? kit.hyphenate(block.text) : block.text)}
    </p>
  );
}

function Verse({ kit, block, style, ...rest }: BlockProps<"verse">) {
  const { design, sizes: S, u } = kit;
  // По центру — по дизайну (заголовки по центру) или по пометке автора (>>…<<), как у PDF.
  const centered = design.heading.align === "center" || block.align === "center";
  const verseTop = gapAbove(S.body * ANSWER.verse.before, u.pt);
  // Строки стиха, как у PDF: каждая — свой абзац, без переносов; не влезла — ломается по словам так же.
  const verseLines = (list: string[], pid = pidOf(rest)) =>
    lineSpans({ kit, pid, req: { text: list.join("\n"), spec: bodySpec(kit), width: measureWidthPt(kit) - (centered ? 0 : textWidthPt(kit) * ANSWER.verse.indent), hyphens: false, justify: false }, align: centered ? "center" : "left", keepPairs: true });
  return (
    <p
      style={{
        ...paragraphCss(kit),
        hyphens: "manual",
        textAlign: centered ? "center" : "left",
        paddingLeft: centered ? 0 : u.mm(textArea(kit.format).w * ANSWER.verse.indent),
        ...verseTop.style,
        marginBottom: u.pt(S.body * ANSWER.verse.after),
        ...style,
      }}
      {...verseTop.attrs}
      {...rest}
    >
      {block.stanzas?.length ? stanzaLines(kit, pidOf(rest), block, u.pt(S.body * ANSWER.verse.stanza), verseLines) : (verseLines(block.lines) ?? lines(block.lines))}
    </p>
  );
}

/**
 * Блок набора ответа — как в PDF (answer-blocks): абзац, лид, выделенный короткий ответ, список, стихи, выделенная строка.
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
  // Блок начинает полосу, как у PDF (kit.breaks) — разрыв перед ним.
  style = { ...style, ...breakBefore(kit, pidOf(rest)) };
  switch (b.kind) {
    case "para":
      return <LeadParagraph kit={kit} text={b.text} leadIn={leadIn} lead={b.lead} dropCap={dropCap} indent={paraIndent(kit.design, first)} style={style} {...rest} />;
    case "lede":
      return <Lede kit={kit} block={b} style={style} {...rest} />;
    case "quote":
      return <Quote kit={kit} block={b} style={style} {...rest} />;
    case "list":
      return <List kit={kit} block={b} style={style} {...rest} />;
    case "verse":
      return <Verse kit={kit} block={b} style={style} {...rest} />;
    case "strong":
      return <Strong kit={kit} block={b} style={style} {...rest} />;
  }
}
