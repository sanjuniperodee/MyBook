/**
 * HTML-страницы книги по дизайну оформления — та же вёрстка, что в PDF для типографии
 * (modules/production/infrastructure/pdf/interior.tsx): те же кегли и отбивки из interiorSizes,
 * та же графика из interior-art. Размеры задаются через PageUnits, поэтому одни и те же компоненты
 * рисуют и превью в редакторе (пиксели), и масштабируемые миниатюры в выборе оформления (cqw).
 */
import type { CSSProperties, ReactNode } from "react";
import { messagesFor } from "@/i18n/messages";
import type { Locale } from "@/i18n/config";
import { cssFont } from "@/lib/book/fonts";
import type { BookFormat } from "@/lib/book/formats";
import { interiorMetrics, openerFlow, pageBox, textArea } from "@/lib/book/layout";
import {
  chapterMark,
  DISPLAY_TOP,
  interiorSizes,
  splitLeadIn,
  trackingPt,
  VIGNETTE_RULE,
  type InteriorDesign,
  type InteriorPalette,
  type InteriorSizes,
  type TextFace,
} from "@/lib/book/interiors";
import { dividerDrawing, frameShapes, openerArtShapes, vignetteDrawing, type Drawing, type Shape } from "@/lib/book/interior-art";
import { cn } from "@/lib/utils";
import type { PageUnits } from "./units";

/** Всё, что нужно странице: дизайн, формат, кегли и единицы измерения. */
export interface PageKit {
  design: InteriorDesign;
  format: BookFormat;
  sizes: InteriorSizes;
  u: PageUnits;
  /** Язык книги: на нём «Глава N», «Содержание» и переносы. */
  language: Locale;
}

export function pageKit(design: InteriorDesign, format: BookFormat, u: PageUnits, language: Locale): PageKit {
  return { design, format, sizes: interiorSizes(design, interiorMetrics[format.id].scale), u, language };
}

// ─── графика ────────────────────────────────────────────────────────────────

function ShapeElement({ s }: { s: Shape }) {
  switch (s.kind) {
    case "circle":
      return <circle cx={s.cx} cy={s.cy} r={s.r} fill={s.fill} fillOpacity={s.opacity} />;
    case "rect":
      return (
        <rect
          x={s.x}
          y={s.y}
          width={s.w}
          height={s.h}
          fill={s.fill ?? "none"}
          fillOpacity={s.fill ? s.opacity : undefined}
          stroke={s.stroke}
          strokeWidth={s.width}
          strokeOpacity={s.stroke ? s.opacity : undefined}
        />
      );
    case "path":
      return (
        <path
          d={s.d}
          fill={s.fill ?? "none"}
          fillOpacity={s.fill ? s.opacity : undefined}
          stroke={s.stroke}
          strokeWidth={s.width}
          strokeOpacity={s.stroke ? s.opacity : undefined}
          strokeLinecap={s.round ? "round" : undefined}
          strokeLinejoin={s.round ? "round" : undefined}
          transform={s.transform}
        />
      );
  }
}

/** Глиф или виньетка в строке (размеры рисунка — в пунктах). */
export function InlineDrawing({ drawing, u, style }: { drawing: Drawing; u: PageUnits; style?: CSSProperties }) {
  return (
    <svg aria-hidden width={u.pt(drawing.w)} height={u.pt(drawing.h)} viewBox={`0 0 ${drawing.w} ${drawing.h}`} style={{ display: "block", flexShrink: 0, overflow: "visible", ...style }}>
      {drawing.shapes.map((s, i) => (
        <ShapeElement key={i} s={s} />
      ))}
    </svg>
  );
}

/** Слой графики на всю страницу (координаты — мм обрезного формата, вылеты обрезаются). */
function PageLayer({ shapes, format }: { shapes: Shape[]; format: BookFormat }) {
  if (!shapes.length) return null;
  return (
    <svg aria-hidden className="pointer-events-none absolute inset-0 size-full" viewBox={`0 0 ${format.widthMm} ${format.heightMm}`} preserveAspectRatio="none">
      {shapes.map((s, i) => (
        <ShapeElement key={i} s={s} />
      ))}
    </svg>
  );
}

// ─── типографика ────────────────────────────────────────────────────────────

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
    lineHeight: 1.2,
    color,
  };
}

function italicBody(kit: PageKit, size: number): CSSProperties {
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
    marginBottom: u.pt(S.body * 0.45),
    textAlign: "justify",
    hyphens: "auto",
    orphans: 2,
    widows: 2,
  };
}

/** Начальные слова главы капителью. */
export function leadInCss(kit: PageKit): CSSProperties {
  const { sizes: S, u, design } = kit;
  return { fontSize: u.pt(S.body * 0.86), letterSpacing: u.pt(S.body * 0.07), textTransform: "uppercase", color: design.palette.accent };
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

/** Заголовок вопроса в тексте главы (с акцентной линейкой, если она есть в дизайне). */
export function QuestionHeading({ kit, children, style, ...rest }: { kit: PageKit; children: ReactNode; style?: CSSProperties } & React.HTMLAttributes<HTMLDivElement>) {
  const { design, sizes: S, u } = kit;
  const { heading } = design;
  const scale = interiorMetrics[kit.format.id].scale;
  return (
    <div style={{ breakInside: "avoid", breakAfter: "avoid", ...style }} {...rest}>
      {heading.bar ? (
        <div style={{ width: u.pt(14 * scale), height: u.pt(1.2), background: design.palette.accent, marginBottom: u.pt(6 * scale), marginInline: heading.align === "center" ? "auto" : undefined }} />
      ) : null}
      <div
        style={{
          fontFamily: cssFont(design.type.heading),
          fontWeight: design.type.headingWeight,
          fontStyle: design.type.headingItalic ? "italic" : "normal",
          fontSize: u.pt(S.heading),
          lineHeight: 1.22,
          color: heading.accent ? design.palette.accent : design.palette.ink,
          textAlign: heading.align,
          marginBottom: u.pt(S.afterHeading),
        }}
      >
        {children}
      </div>
    </div>
  );
}

/** Разделитель между ответами без заголовка: «* * *», глиф или линейка. */
export function Divider({ kit, style }: { kit: PageKit; style?: CSSProperties }) {
  const { design, sizes: S, u } = kit;
  if (design.divider === "stars")
    return <div style={{ textAlign: "center", color: design.palette.rule, fontSize: u.pt(S.body), lineHeight: 1.2, marginBottom: u.pt(S.beforeHeadless), breakAfter: "avoid", ...style }}>* * *</div>;
  // flow-root: отступ обёртки и собственный отступ глифа складываются, как в PDF, а не схлопываются.
  return (
    <div style={{ display: "flow-root", breakAfter: "avoid", ...style }}>
      <InlineDrawing
        drawing={dividerDrawing(design.ornament, design.divider, design.palette)}
        u={u}
        style={{ margin: `${u.pt(S.body * 0.3)} auto ${u.pt(S.beforeHeadless + S.body * 0.2)}` }}
      />
    </div>
  );
}

function Vignette({ kit, rule, colors, align = "center" }: { kit: PageKit; rule: number; colors: InteriorPalette; align?: "center" | "left" }) {
  const S = kit.sizes;
  return <InlineDrawing drawing={vignetteDrawing(kit.design.ornament, rule, colors)} u={kit.u} style={{ marginBlock: kit.u.pt(S.vignetteGap), alignSelf: align === "left" ? "flex-start" : "center" }} />;
}

// ─── колонцифра и колонтитул ────────────────────────────────────────────────

const metricsOf = (kit: PageKit) => interiorMetrics[kit.format.id];
const sideOf = (kit: PageKit) => (metricsOf(kit).marginInner + metricsOf(kit).marginOuter) / 2;

/** Колонцифра. recto — правая (нечётная) полоса: «снаружи» значит справа. */
export function Folio({ kit, children, recto }: { kit: PageKit; children: ReactNode; recto: boolean }) {
  const { design, sizes: S, u } = kit;
  const m = metricsOf(kit);
  const outer = design.folio.align === "outer";
  const font = design.folio.font === "label" ? labelCss(kit, design.palette.muted, S.folio * 0.85) : { fontFamily: cssFont(design.type.body), fontSize: u.pt(S.folio), color: design.palette.muted, lineHeight: 1.2 };
  return (
    <div
      className="absolute"
      style={{ ...font, bottom: u.mm(m.marginBottom / 2 - 2), left: outer ? u.mm(sideOf(kit)) : 0, right: outer ? u.mm(sideOf(kit)) : 0, textAlign: outer ? (recto ? "right" : "left") : "center" }}
    >
      {children}
    </div>
  );
}

export const folioText = (design: InteriorDesign, n: number | string) => (design.folio.dashes ? `— ${n} —` : `${n}`);

/** Колонтитул: на левой полосе — название книги, на правой — глава. */
export function RunningHead({ kit, bookTitle, chapterTitle, recto }: { kit: PageKit; bookTitle: string; chapterTitle: string; recto: boolean }) {
  const { design, sizes: S, u } = kit;
  if (design.runningHead === "none") return null;
  const m = metricsOf(kit);
  const outer = design.folio.align === "outer";
  return (
    <>
      <div
        className="absolute truncate"
        style={{ ...labelCss(kit, design.palette.muted, S.runningHead), top: u.mm(m.marginTop * 0.36), left: u.mm(sideOf(kit)), right: u.mm(sideOf(kit)), textAlign: outer ? (recto ? "right" : "left") : "center" }}
      >
        {recto ? chapterTitle : bookTitle}
      </div>
      {design.runningHead === "ruled" ? (
        <div className="absolute" style={{ top: u.mm(m.marginTop * 0.62), left: u.mm(sideOf(kit)), right: u.mm(sideOf(kit)), height: u.pt(0.4), background: design.palette.rule }} />
      ) : null}
    </>
  );
}

// ─── страницы ───────────────────────────────────────────────────────────────

type PageProps = { kit: PageKit; className?: string; style?: CSSProperties };

/** Страница: фон, графика и полоса набора. Размер задаёт родитель (width/aspect-ratio). */
function Sheet({ kit, paper = "#FFFFFF", shapes = [], className, style, children }: PageProps & { paper?: string; shapes?: Shape[]; children: ReactNode }) {
  return (
    <div lang={kit.language} className={cn("relative overflow-hidden", className)} style={{ background: paper, containerType: "inline-size", ...style }}>
      <PageLayer shapes={shapes} format={kit.format} />
      {children}
    </div>
  );
}

/** Полоса набора (внутри полей). */
export function TextArea({ kit, children, className, style }: { kit: PageKit; children: ReactNode; className?: string; style?: CSSProperties }) {
  const m = metricsOf(kit);
  const area = textArea(kit.format);
  const side = sideOf(kit);
  const { u } = kit;
  return (
    <div className={cn("absolute", className)} style={{ left: u.mm(side), top: u.mm(m.marginTop), width: u.mm(kit.format.widthMm - side * 2), height: u.mm(area.h), ...style }}>
      {children}
    </div>
  );
}

/** Блок на парадной полосе: начинается на доле top высоты полосы набора, как в PDF. */
function Placed({ top, align = "center", children }: { top: number; align?: "center" | "left"; children: ReactNode }) {
  return (
    <div className="flex min-h-0 flex-1 flex-col" style={{ alignItems: align === "left" ? "flex-start" : "center", textAlign: align === "left" ? "left" : "center" }}>
      <div className="shrink-0" style={{ height: `${top * 100}%` }} />
      {children}
    </div>
  );
}

const frame = (kit: PageKit, colors: InteriorPalette) => frameShapes(kit.design.frame, pageBox(kit.format, 0), colors);

/** Начальная полоса главы: номер, название, виньетка, эпиграф и рисунок дизайна. */
export function OpenerPage({ kit, number, title, epigraph, className, style }: PageProps & { number: number | null; title: string; epigraph?: string }) {
  const { design, format, sizes: S, u } = kit;
  const { fill, align, art } = design.opener;
  const colors = fill ?? design.palette;
  const flow = openerFlow(format, design);
  const mark = number ? chapterMark(design, number, messagesFor(kit.language).book.chapter) : null;
  const shapes = [
    ...(art ? openerArtShapes(art, { w: format.widthMm, h: format.heightMm, flowTop: flow.top, k: flow.k, palette: colors, seed: number ?? 0 }) : []),
    ...frame(kit, colors),
  ];
  return (
    <Sheet kit={kit} paper={fill?.paper} shapes={shapes} className={className} style={style}>
      <TextArea kit={kit} className="flex flex-col">
        <Placed top={design.opener.top} align={align}>
          {mark?.kind === "label" ? (
            <div style={{ ...(design.opener.kicker ? { ...faceCss(design.opener.kicker, S.kicker, u), lineHeight: 1.2 } : labelCss(kit, colors.accent)), color: colors.accent, marginBottom: u.pt(S.kickerGap) }}>{mark.text}</div>
          ) : null}
          {mark?.kind === "numeral" ? (
            <div style={{ ...faceCss(design.opener.numeral ?? design.display, S.numeral, u), lineHeight: 1, color: colors.accent, marginBottom: u.pt(S.numeral * 0.12) }}>{mark.text}</div>
          ) : null}
          <div style={{ ...faceCss(design.display, S.openerTitle, u), lineHeight: 1.15, color: colors.ink, maxWidth: "90%", overflowWrap: "anywhere" }}>{title}</div>
          <Vignette kit={kit} rule={VIGNETTE_RULE.opener} colors={colors} align={align} />
          {epigraph ? <div style={{ ...italicBody(kit, S.epigraph), lineHeight: 1.55, color: colors.muted, maxWidth: align === "left" ? "85%" : "78%" }}>{epigraph}</div> : null}
        </Placed>
      </TextArea>
    </Sheet>
  );
}

/** Титульный лист. */
export function TitlePage({ kit, title, subtitle, author, year, className, style }: PageProps & { title: string; subtitle: string; author: string; year: number }) {
  const { design, sizes: S, u } = kit;
  const P = design.palette;
  return (
    <Sheet kit={kit} shapes={frame(kit, P)} className={className} style={style}>
      <TextArea kit={kit} className="flex flex-col">
        <Placed top={DISPLAY_TOP.title}>
          <div style={{ ...faceCss(design.display, S.title, u), lineHeight: 1.15, color: P.ink, overflowWrap: "anywhere" }}>{title}</div>
          {subtitle ? <div style={{ ...italicBody(kit, S.subtitle), color: P.muted, marginTop: u.pt(10), lineHeight: 1.3 }}>{subtitle}</div> : null}
          <Vignette kit={kit} rule={VIGNETTE_RULE.title} colors={P} />
          {author ? <div style={labelCss(kit, P.muted)}>{author}</div> : null}
        </Placed>
        <div className="text-center" style={labelCss(kit, P.muted, S.year)}>
          {year}
        </div>
      </TextArea>
    </Sheet>
  );
}

/** Посвящение; пустое — подсказкой (её в книге не будет). */
export function DedicationPage({ kit, text, placeholder, className, style }: PageProps & { text: string; placeholder?: string }) {
  const { design, sizes: S } = kit;
  const P = design.palette;
  return (
    <Sheet kit={kit} shapes={frame(kit, P)} className={className} style={style}>
      <TextArea kit={kit} className="flex flex-col">
        <Placed top={DISPLAY_TOP.dedication}>
          <div style={{ ...italicBody(kit, S.dedication), lineHeight: 1.6, color: P.ink, maxWidth: "85%", whiteSpace: "pre-line", overflowWrap: "anywhere", opacity: text ? 1 : 0.4 }}>{text || placeholder}</div>
        </Placed>
      </TextArea>
    </Sheet>
  );
}

/** Оглавление. */
export function TocPage({ kit, entries, className, style, muted }: PageProps & { entries: { title: string; number: number; page: number }[]; muted?: boolean }) {
  const { design, sizes: S, u } = kit;
  const P = design.palette;
  const scale = metricsOf(kit).scale;
  return (
    <Sheet kit={kit} className={className} style={style}>
      <TextArea kit={kit} className="overflow-hidden" style={{ opacity: muted ? 0.4 : 1 }}>
        <div style={{ ...faceCss(design.display, S.tocTitle, u), lineHeight: 1.2, color: P.ink, textAlign: design.opener.align === "left" ? "left" : "center", marginTop: u.pt(20 * scale), marginBottom: u.pt(26 * scale) }}>
          {messagesFor(kit.language).book.toc}
        </div>
        {entries.map((e) => (
          <div key={e.number} className="flex items-end" style={{ fontFamily: cssFont(design.type.body), fontSize: u.pt(S.body), lineHeight: 1.25, marginBottom: u.pt(7 * scale) }}>
            <span className="truncate" style={{ color: P.ink, maxWidth: "82%" }}>
              {e.number}. {e.title}
            </span>
            <span className="min-w-0 flex-1" style={{ borderBottom: `${u.pt(0.6)} dotted ${P.rule}`, margin: `0 ${u.pt(5)} ${u.pt(3)}` }} />
            <span style={{ color: P.muted }}>{e.page}</span>
          </div>
        ))}
      </TextArea>
    </Sheet>
  );
}

/** Последняя страница: «Продолжение следует…». */
export function EndPage({ kit, year, className, style }: PageProps & { year: number }) {
  const { design, sizes: S } = kit;
  const P = design.palette;
  return (
    <Sheet kit={kit} shapes={frame(kit, P)} className={className} style={style}>
      <TextArea kit={kit} className="flex flex-col">
        <Placed top={DISPLAY_TOP.end}>
          <Vignette kit={kit} rule={VIGNETTE_RULE.end} colors={P} />
          <div style={{ ...italicBody(kit, S.end), color: P.ink, lineHeight: 1.3 }}>{messagesFor(kit.language).book.theEnd}</div>
          <div style={{ ...labelCss(kit, P.muted), marginTop: kit.u.pt(16) }}>{year}</div>
        </Placed>
      </TextArea>
    </Sheet>
  );
}

export interface SampleEntry {
  heading: string | null;
  paragraphs: string[];
}

/**
 * Страница текста главы для миниатюр: заголовки, абзацы, колонтитул и колонцифра. Текст режется
 * по строкам как в книге — через CSS-колонки размером с полосу набора (видна только первая).
 */
export function TextPage({ kit, entries, folio, bookTitle, chapterTitle, recto, leadIn, part = 0, className, style }: PageProps & {
  entries: SampleEntry[];
  folio: number;
  bookTitle: string;
  chapterTitle: string;
  recto: boolean;
  /** Это первая страница главы: капитель в начале первого ответа. */
  leadIn: boolean;
  /** Какая по счёту полоса текста главы (с 0): колонки сдвигаются, и видна именно она. */
  part?: number;
}) {
  const { design, sizes: S, u } = kit;
  const area = textArea(kit.format);
  const side = sideOf(kit);
  const textW = kit.format.widthMm - side * 2;
  return (
    <Sheet kit={kit} className={className} style={style}>
      <RunningHead kit={kit} bookTitle={bookTitle} chapterTitle={chapterTitle} recto={recto} />
      <TextArea kit={kit} className="overflow-hidden">
        <div
          data-flow
          style={{
            width: u.mm(textW),
            height: u.mm(area.h),
            columnWidth: u.mm(textW),
            columnGap: u.mm(side * 2),
            columnFill: "auto",
            transform: part ? `translateX(calc(${-part} * (${u.mm(textW)} + ${u.mm(side * 2)})))` : undefined,
          }}
        >
          {entries.map((e, i) => (
            <div key={i} style={{ marginTop: i === 0 ? 0 : u.pt(e.heading ? S.beforeHeading : S.beforeHeadless) }}>
              {e.heading ? <QuestionHeading kit={kit}>{e.heading}</QuestionHeading> : i > 0 ? <Divider kit={kit} /> : null}
              {e.paragraphs.map((p, j) => (
                <LeadParagraph key={j} kit={kit} text={p} leadIn={leadIn && design.leadIn && i === 0 && j === 0} />
              ))}
            </div>
          ))}
        </div>
      </TextArea>
      <Folio kit={kit} recto={recto}>
        {folioText(design, folio)}
      </Folio>
    </Sheet>
  );
}
