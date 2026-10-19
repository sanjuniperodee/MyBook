import type { CSSProperties } from "react";
import { cssFont } from "@/lib/book/fonts";
import type { TextFace } from "@/lib/book/interiors";
import { ANSWER, HTML_LINE_HEIGHT, LEAD_IN, splitLeadIn, trackingPt } from "@/lib/book/typesetting";
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

export function italicBody(kit: PageKit, size: number): CSSProperties {
  return { fontFamily: cssFont(kit.design.type.body), fontStyle: "italic", fontWeight: 400, fontSize: kit.u.pt(size) };
}

/** Абзац основного текста. */
export function paragraphCss(kit: PageKit): CSSProperties {
  const { design, sizes: S, u } = kit;
  return {
    fontFamily: cssFont(design.type.body),
    fontSize: u.pt(S.body),
    lineHeight: design.type.lineHeight,
    color: design.palette.ink,
    marginBottom: u.pt(S.body * ANSWER.para.after),
    textAlign: "justify",
    hyphens: "auto",
    orphans: 2,
    widows: 2,
  };
}

/** Начальные слова главы капителью. */
function leadInCss(kit: PageKit): CSSProperties {
  const { sizes: S, u, design } = kit;
  return { fontSize: u.pt(S.body * LEAD_IN.size), letterSpacing: u.pt(S.body * LEAD_IN.tracking), textTransform: "uppercase", color: design.palette.accent };
}

/** Абзац с капителью в начале (если она нужна). */
export function LeadParagraph({ kit, text, leadIn, style, ...rest }: { kit: PageKit; text: string; leadIn: boolean; style?: CSSProperties } & React.HTMLAttributes<HTMLParagraphElement>) {
  const [lead, tail] = leadIn ? splitLeadIn(text) : ["", text];
  return (
    <p style={{ ...paragraphCss(kit), ...style }} {...rest}>
      {lead ? <span style={leadInCss(kit)}>{lead}</span> : null}
      {tail}
    </p>
  );
}
