import type { CSSProperties } from "react";
import { cssFont } from "@/lib/book/fonts";
import type { TextFace } from "@/lib/book/interiors";
import { textArea } from "@/lib/book/page-geometry";
import { bodyAlign, bodyWeight, dropCapPlan, HTML_LINE_HEIGHT, indentEm, LEAD_IN, measureInsets, paraAfter, quoteFace, splitInitial, splitLeadIn, trackingPt } from "@/lib/book/typesetting";
import type { PageKit } from "./kit";
import type { PageUnits } from "./units";

export function faceCss(f: TextFace, size: number, u: PageUnits): CSSProperties {
  return {
    fontFamily: cssFont(f.font),
    fontWeight: f.weight,
    fontStyle: f.italic ? "italic" : "normal",
    fontSize: u.pt(size),
    textTransform: f.upper ? "uppercase" : undefined,
    letterSpacing: f.tracking ? u.pt(trackingPt(f, size)) : undefined,
  };
}

/** Служебная надпись прописными (разрядка — от базового кегля подписи, как в PDF). */
export function labelCss(kit: PageKit, color: string, size = kit.sizes.label): CSSProperties {
  const { label } = kit.design;
  return {
    fontFamily: cssFont(label.font),
    fontWeight: label.weight,
    fontStyle: label.italic ? "italic" : "normal",
    fontSize: kit.u.pt(size),
    letterSpacing: kit.u.pt(trackingPt(label, kit.sizes.label)),
    textTransform: label.upper ? "uppercase" : undefined,
    lineHeight: HTML_LINE_HEIGHT.label,
    color,
  };
}

/** Начертание цитат, лида, эпиграфов, посвящения и подзаголовка (по умолчанию курсив основного шрифта). */
export function italicBody(kit: PageKit, size: number): CSSProperties {
  const q = quoteFace(kit.design);
  return { fontFamily: cssFont(q.font), fontStyle: q.italic ? "italic" : "normal", fontWeight: q.weight, fontSize: kit.u.pt(size), ...(q.upper ? { textTransform: "uppercase" } : {}) };
}

/** Узкая колонка текста: поля слева и справа внутри полосы набора (без узкой колонки — ничего). */
export function measureCss(kit: PageKit): CSSProperties {
  const inset = measureInsets(kit.design);
  if (!inset.left && !inset.right) return {};
  const w = textArea(kit.format).w;
  return { marginLeft: kit.u.mm(w * inset.left), marginRight: kit.u.mm(w * inset.right) };
}

/** Абзац основного текста. */
export function paragraphCss(kit: PageKit): CSSProperties {
  const { design, sizes: S, u } = kit;
  return {
    fontFamily: cssFont(design.type.body),
    ...(design.text?.weight ? { fontWeight: bodyWeight(design) } : {}),
    fontSize: u.pt(S.body),
    lineHeight: design.type.lineHeight,
    color: design.palette.ink,
    marginBottom: u.pt(S.body * paraAfter(design)),
    textAlign: bodyAlign(design),
    hyphens: "auto",
    orphans: 2,
    widows: 2,
    ...(design.text?.tracking ? { letterSpacing: u.pt(design.text.tracking * S.body) } : {}),
    ...measureCss(kit),
  };
}

/** Начальные слова главы капителью. */
function leadInCss(kit: PageKit): CSSProperties {
  const { sizes: S, u, design } = kit;
  return { fontSize: u.pt(S.body * LEAD_IN.size), letterSpacing: u.pt(S.body * LEAD_IN.tracking), textTransform: "uppercase", color: design.palette.accent };
}

/**
 * Буквица в HTML: опущенная — float на lines строк (базовая линия — как в PDF, высота плавающего блока не залезает
 * на строку lines + 1), поднятая — крупная буква в первой строке.
 */
function DropInitial({ kit, initial }: { kit: PageKit; initial: string }) {
  const { u } = kit;
  const plan = dropCapPlan(kit.design, kit.sizes)!;
  const face = faceCss(plan.face, plan.size, u);
  if (plan.style === "raised") return <span style={{ ...face, lineHeight: plan.lineHeight, color: plan.color }}>{initial}</span>;
  return <span style={{ ...face, float: "left", display: "block", lineHeight: plan.lineHeight, color: plan.color, marginTop: u.pt(plan.topHtml), marginRight: u.pt(plan.gap), height: u.pt(plan.height - plan.topHtml - 0.5) }}>{initial}</span>;
}

/**
 * Абзац с капителью в начале (если она нужна). indent — красная строка (у первого абзаца ответа её нет),
 * dropCap — здесь начинается глава: буквица, если она есть в дизайне.
 */
export function LeadParagraph({ kit, text, leadIn, indent = false, dropCap = false, style, ...rest }: { kit: PageKit; text: string; leadIn: boolean; indent?: boolean; dropCap?: boolean; style?: CSSProperties } & React.HTMLAttributes<HTMLParagraphElement>) {
  const parts = dropCap && kit.design.dropCap ? splitInitial(text) : null;
  const body = parts ? parts[1] : text;
  const [lead, tail] = leadIn ? splitLeadIn(body) : ["", body];
  const em = indentEm(kit.design);
  return (
    <p style={{ ...paragraphCss(kit), ...(indent && em && !parts ? { textIndent: kit.u.pt(kit.sizes.body * em) } : {}), ...style }} {...rest}>
      {parts ? <DropInitial kit={kit} initial={parts[0]} /> : null}
      {lead ? <span style={leadInCss(kit)}>{lead}</span> : null}
      {tail}
    </p>
  );
}
