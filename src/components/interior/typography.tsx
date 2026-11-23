import type { CSSProperties } from "react";
import { cssFont } from "@/lib/book/fonts";
import type { TextFace } from "@/lib/book/interiors";
import { textArea } from "@/lib/book/page-geometry";
import { bodyAlign, bodyWeight, dropCapPlan, HTML_LINE_HEIGHT, indentEm, LEAD_IN, measureInsets, paraAfter, quoteFace, splitInitial, splitLeadIn, trackingPt, type DropCapPlan } from "@/lib/book/typesetting";
import type { PageKit } from "./kit";
import { lineSpans } from "./lines";
import { bodySpec, faceSpec, leadSpec, measureWidthPt } from "./text-specs";
import { dropCapLayout, type DropCapLayout } from "./drop-cap";
import { breakBefore } from "./breaks";
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
    // С переносами книги (kit.hyphenate) — только они: мягкие переносы в тексте, свои браузер не ставит.
    hyphens: kit.hyphenate ? "manual" : "auto",
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
  const pid = (rest as Record<string, string | undefined>)["data-flow"];
  // Опущенная буквица со строками, как у PDF: буква и колонка рядом, продолжение — отдельным абзацем ниже.
  const dc = dropCap && kit.design.dropCap ? dropCapLayout(kit, text, leadIn, pid) : null;
  if (dc) return <DropCapParagraph kit={kit} dc={dc} pid={pid} style={style} rest={rest} />;
  const plan = dropCap && kit.design.dropCap ? dropCapPlan(kit.design, kit.sizes) : null;
  // Поднятая буквица со строками, как у PDF: крупная первая буква в первой строке.
  if (plan?.style === "raised" && kit.breaker) {
    const raised = raisedLines(kit, text, leadIn, pid, plan);
    if (raised)
      return (
        <p style={{ ...paragraphCss(kit), ...style }} {...rest}>
          {raised}
        </p>
      );
  }
  const parts = dropCap && kit.design.dropCap ? splitInitial(text) : null;
  const body = parts ? parts[1] : text;
  const [lead, after] = leadIn ? splitLeadIn(body) : ["", body];
  const em = indentEm(kit.design);
  const indentPt = indent && em && !parts ? kit.sizes.body * em : 0;
  const align = bodyAlign(kit.design);
  // Строки — как у PDF (Кнут — Пласс по тем же ширинам и переносам); у абзаца с буквицей строки рядом с ней ставит браузер.
  const lines = parts
    ? null
    : lineSpans({
        kit,
        pid: (rest as Record<string, string | undefined>)["data-flow"],
        req: {
          text: lead + after,
          spec: bodySpec(kit),
          ...(lead ? { runs: [{ start: 0, end: lead.length, spec: leadSpec(kit) }, { start: lead.length, end: lead.length + after.length, spec: bodySpec(kit) }] } : {}),
          width: measureWidthPt(kit),
          indent: indentPt,
          hyphens: true,
          justify: align === "justify",
        },
        align,
        keepPairs: true,
        styled: lead ? [{ start: 0, end: lead.length, style: leadInCss(kit) }] : [],
      });
  // Без разбивки — переносы, как в PDF: капитель — без них (там она отдельным куском, но слова те же), остальное — с мягкими.
  const tail = kit.hyphenate ? kit.hyphenate(after) : after;
  return (
    <p style={{ ...paragraphCss(kit), ...(indentPt && !lines ? { textIndent: kit.u.pt(indentPt) } : {}), ...style }} {...rest}>
      {parts ? <DropInitial kit={kit} initial={parts[0]} /> : null}
      {lines ?? (
        <>
          {lead ? <span style={leadInCss(kit)}>{lead}</span> : null}
          {tail}
        </>
      )}
    </p>
  );
}

/** Абзац с опущенной буквицей — как DropCapParagraph у PDF: ряд «буква + колонка строк», ниже — продолжение. */
function DropCapParagraph({ kit, dc, pid, style, rest }: { kit: PageKit; dc: DropCapLayout; pid?: string; style?: CSSProperties; rest: React.HTMLAttributes<HTMLElement> }) {
  const { design, u } = kit;
  const { plan } = dc;
  const align = bodyAlign(design);
  const column = lineSpans({ kit, req: dc.columnReq, align, styled: dc.lead ? [{ start: 0, end: dc.lead, style: leadInCss(kit) }] : [] });
  const after = dc.after ? lineSpans({ kit, pid: pid && `${pid}:c`, req: dc.afterReq, align, keepPairs: true }) : null;
  const css = paragraphCss(kit);
  return (
    <div style={{ ...measureCss(kit), marginBottom: css.marginBottom, color: css.color, ...style }} {...rest}>
      <div data-pid={pid && `${pid}:d`} style={{ display: "flex", breakInside: "avoid", ...breakBefore(kit, pid && `${pid}:d`) }}>
        <span style={{ ...faceCss(plan.face, plan.size, u), lineHeight: plan.lineHeight, color: plan.color, marginTop: u.pt(plan.top), marginRight: u.pt(plan.gap), flex: "none" }}>{dc.initial}</span>
        <div style={{ ...css, margin: 0, flex: "1 1 0", minWidth: 0, height: u.pt(plan.height), overflow: "hidden" }}>{column}</div>
      </div>
      {after ? <p style={{ ...css, margin: 0, ...breakBefore(kit, pid && `${pid}:c`) }}>{after}</p> : null}
    </div>
  );
}

/** Строки абзаца с поднятой буквицей, как у PDF: крупная буква — кусок первой строки (и её высота). */
function raisedLines(kit: PageKit, text: string, leadIn: boolean, pid: string | undefined, plan: DropCapPlan) {
  const parts = splitInitial(text);
  if (!parts) return null;
  const [initial, body] = parts;
  const [lead, after] = leadIn ? splitLeadIn(body) : ["", body];
  const align = bodyAlign(kit.design);
  const capStyle: CSSProperties = { ...faceCss(plan.face, plan.size, kit.u), lineHeight: plan.lineHeight, color: plan.color };
  return lineSpans({
    kit,
    pid,
    req: {
      text: initial + lead + after,
      spec: bodySpec(kit),
      runs: [
        { start: 0, end: initial.length, spec: faceSpec(plan.face, plan.size) },
        ...(lead ? [{ start: initial.length, end: initial.length + lead.length, spec: leadSpec(kit) }] : []),
        { start: initial.length + lead.length, end: initial.length + lead.length + after.length, spec: bodySpec(kit) },
      ],
      width: measureWidthPt(kit),
      hyphens: true,
      justify: align === "justify",
    },
    align,
    keepPairs: true,
    styled: [{ start: 0, end: initial.length, style: capStyle }, ...(lead ? [{ start: initial.length, end: initial.length + lead.length, style: leadInCss(kit) }] : [])],
  });
}
