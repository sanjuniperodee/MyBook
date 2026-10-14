/**
 * HTML-страницы книги по дизайну оформления — та же вёрстка, что в PDF для типографии
 * (modules/production/infrastructure/pdf/interior.tsx): те же кегли и отбивки из interiorSizes,
 * та же графика из interior-art. Размеры задаются через PageUnits, поэтому одни и те же компоненты
 * рисуют и превью в редакторе (пиксели), и масштабируемые миниатюры в выборе оформления (cqw).
 */
import { Fragment, type CSSProperties, type ReactNode } from "react";
import { messagesFor } from "@/i18n/messages";
import type { Locale } from "@/i18n/config";
import { cssFont } from "@/lib/book/fonts";
import { mm, PT_TO_MM, type BookFormat } from "@/lib/book/formats";
import { interiorMetrics, openerFlow, pageBox, pageSide, textArea } from "@/lib/book/page-geometry";
import { chapterMark, PAPER, PHOTO_COLORS, type InteriorDesign, type InteriorPalette, type TextFace } from "@/lib/book/interiors";
import {
  ANSWER,
  CHAPTER_TAIL,
  DISPLAY_TOP,
  DIVIDER,
  FOLIO,
  folioBottom,
  FRONT,
  HEADING,
  HTML_LINE_HEIGHT,
  INLINE_ROW,
  interiorSizes,
  LEAD_IN,
  OPENER,
  photoCaptionFace,
  RUNNING_HEAD,
  runningHeadTop,
  runningRuleTop,
  splitLeadIn,
  TOC,
  trackingPt,
  VIGNETTE_RULE,
  type InteriorSizes,
} from "@/lib/book/typesetting";
import { dividerDrawing, frameShapes, openerArtShapes, vignetteDrawing, type Drawing, type Shape } from "@/lib/book/interior-art";
import { samplePageUrl } from "@/lib/book/photo-cover";
import { openerPhotoPlan, photoArea, photoPagePlan } from "@/lib/book/photo-pages";
import { answerBlocks, rowsByBlock, type AnswerBlock } from "@/lib/book/answer-blocks";
import { framedBox, layoutInline, normalizeStyle, objectPosition, polaroidFontSize, ROW_GAP, type InlinePhotoStyle } from "@/lib/book/inline-photo";
import { cn } from "@/lib/class-names";
import { hexAlpha } from "@/lib/color";
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
    lineHeight: HTML_LINE_HEIGHT.label,
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
    marginBottom: u.pt(S.body * ANSWER.para.after),
    textAlign: "justify",
    hyphens: "auto",
    orphans: 2,
    widows: 2,
  };
}

/** Начальные слова главы капителью. */
export function leadInCss(kit: PageKit): CSSProperties {
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

/**
 * Блок набора ответа — как в PDF (answer-blocks): абзац, лид, выделенный короткий ответ, список, стихи.
 * Остальные атрибуты (data-*) — на корневом элементе блока.
 */
export function AnswerBlockView({ kit, block: b, leadIn, style, ...rest }: { kit: PageKit; block: AnswerBlock; leadIn: boolean; style?: CSSProperties } & React.HTMLAttributes<HTMLElement>) {
  const { design, sizes: S, u } = kit;
  const P = design.palette;
  const centered = design.heading.align === "center";
  const lines = (list: string[]) => list.map((l, i) => (i ? [<br key={i} />, l] : l));
  switch (b.kind) {
    case "para":
      return <LeadParagraph kit={kit} text={b.text} leadIn={leadIn} style={style} {...rest} />;
    case "lede":
      return (
        <p style={{ ...italicBody(kit, S.body * ANSWER.lede.size), lineHeight: ANSWER.lede.lineHeight, color: P.muted, textAlign: centered ? "center" : "left", marginBottom: u.pt(S.body * ANSWER.lede.after), breakAfter: "avoid", ...style }} {...rest}>
          {b.text}
        </p>
      );
    case "quote": {
      const text: CSSProperties = { ...italicBody(kit, S.body * ANSWER.quote.size), lineHeight: ANSWER.quote.lineHeight, color: P.ink };
      return (
        <div
          style={{
            breakInside: "avoid",
            marginTop: u.pt(S.body * ANSWER.quote.before),
            marginBottom: u.pt(S.body * ANSWER.quote.after),
            ...(centered
              ? { ...text, textAlign: "center", paddingInline: u.mm(textArea(kit.format).w * ANSWER.quote.inset) }
              : { ...text, borderLeft: `${u.pt(ANSWER.quote.rule)} solid ${P.accent}`, paddingLeft: u.pt(S.body * ANSWER.quote.indent) }),
            ...style,
          }}
          {...rest}
        >
          {lines(b.lines)}
        </div>
      );
    }
    case "list":
      return (
        <div style={{ marginBottom: u.pt(S.body * ANSWER.list.after), ...style }} {...rest}>
          {b.items.map((item, i) => (
            <div key={i} style={{ display: "flex", marginBottom: i < b.items.length - 1 ? u.pt(S.body * ANSWER.list.gap) : 0 }}>
              <span style={{ ...paragraphCss(kit), marginBottom: 0, flex: "none", width: u.pt(S.body * (b.ordered ? ANSWER.list.orderedMarker : ANSWER.list.marker)), textAlign: "left", color: P.accent }}>{item.marker}</span>
              <span style={{ ...paragraphCss(kit), marginBottom: 0, flex: 1, textAlign: "left" }}>{item.text}</span>
            </div>
          ))}
        </div>
      );
    case "verse":
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
          {lines(b.lines)}
        </p>
      );
  }
}

/** Концовка главы — небольшая виньетка после последнего ответа, как в PDF. */
export function ChapterTail({ kit }: { kit: PageKit }) {
  return (
    <div style={{ display: "flex", justifyContent: "center", breakBefore: "avoid", breakInside: "avoid", marginTop: kit.u.pt(kit.sizes.beforeHeading * CHAPTER_TAIL.before) }}>
      <InlineDrawing drawing={vignetteDrawing(kit.design.ornament, VIGNETTE_RULE.end, kit.design.palette)} u={kit.u} />
    </div>
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
        <div style={{ width: u.pt(HEADING.bar.width * scale), height: u.pt(HEADING.bar.thickness), background: design.palette.accent, marginBottom: u.pt(HEADING.bar.after * scale), marginInline: heading.align === "center" ? "auto" : undefined }} />
      ) : null}
      <div
        style={{
          fontFamily: cssFont(design.type.heading),
          fontWeight: design.type.headingWeight,
          fontStyle: design.type.headingItalic ? "italic" : "normal",
          fontSize: u.pt(S.heading),
          lineHeight: HEADING.lineHeight,
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
    return <div style={{ textAlign: "center", color: design.palette.rule, fontSize: u.pt(S.body), lineHeight: HTML_LINE_HEIGHT.stars, marginBottom: u.pt(S.beforeHeadless), breakAfter: "avoid", ...style }}>* * *</div>;
  // flow-root: отступ обёртки и собственный отступ глифа складываются, как в PDF, а не схлопываются.
  return (
    <div style={{ display: "flow-root", breakAfter: "avoid", ...style }}>
      <InlineDrawing
        drawing={dividerDrawing(design.ornament, design.divider, design.palette)}
        u={u}
        style={{ margin: `${u.pt(S.body * DIVIDER.before)} auto ${u.pt(S.beforeHeadless + S.body * DIVIDER.after)}` }}
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

/** Колонцифра. recto — правая (нечётная) полоса: «снаружи» значит справа. */
export function Folio({ kit, children, recto }: { kit: PageKit; children: ReactNode; recto: boolean }) {
  const { design, sizes: S, u } = kit;
  const outer = design.folio.align === "outer";
  const font =
    design.folio.font === "label"
      ? labelCss(kit, design.palette.muted, S.folio * FOLIO.labelSize)
      : { fontFamily: cssFont(design.type.body), fontSize: u.pt(S.folio), color: design.palette.muted, lineHeight: HTML_LINE_HEIGHT.folio };
  return (
    <div
      className="absolute"
      style={{ ...font, bottom: u.mm(folioBottom(kit.format)), left: outer ? u.mm(pageSide(kit.format)) : 0, right: outer ? u.mm(pageSide(kit.format)) : 0, textAlign: outer ? (recto ? "right" : "left") : "center" }}
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
  const outer = design.folio.align === "outer";
  return (
    <>
      <div
        className="absolute truncate"
        style={{ ...labelCss(kit, design.palette.muted, S.runningHead), top: u.mm(runningHeadTop(kit.format)), left: u.mm(pageSide(kit.format)), right: u.mm(pageSide(kit.format)), textAlign: outer ? (recto ? "right" : "left") : "center" }}
      >
        {recto ? chapterTitle : bookTitle}
      </div>
      {design.runningHead === "ruled" ? (
        <div className="absolute" style={{ top: u.mm(runningRuleTop(kit.format)), left: u.mm(pageSide(kit.format)), right: u.mm(pageSide(kit.format)), height: u.pt(RUNNING_HEAD.rule), background: design.palette.rule }} />
      ) : null}
    </>
  );
}

// ─── страницы ───────────────────────────────────────────────────────────────

type PageProps = { kit: PageKit; className?: string; style?: CSSProperties };

/** Страница: фон, графика и полоса набора. Размер задаёт родитель (width/aspect-ratio). */
function Sheet({ kit, paper = PAPER, shapes = [], className, style, children }: PageProps & { paper?: string; shapes?: Shape[]; children: ReactNode }) {
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
  const { u } = kit;
  return (
    <div className={cn("absolute", className)} style={{ left: u.mm(pageSide(kit.format)), top: u.mm(m.marginTop), width: u.mm(area.w), height: u.mm(area.h), ...style }}>
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

/** Снимок на странице (мм обрезного формата): фото клиента или снимок-пример из коллекции. */
function PageImage({ kit, rect, url, scene, mask }: { kit: PageKit; rect: { x: number; y: number; w: number; h: number }; url?: string; scene: number; mask?: "arch" | "circle" }) {
  const { u } = kit;
  // Форма снимка: арка — скруглённый верх радиусом в половину ширины, круг — 50%.
  const radius = mask === "circle" ? "50%" : mask === "arch" ? `${u.mm(rect.w / 2)} ${u.mm(rect.w / 2)} 0 0` : undefined;
  return (
    // eslint-disable-next-line @next/next/no-img-element -- фото клиента и снимки-примеры: next/image здесь не нужен
    <img
      src={url ?? samplePageUrl(scene)}
      alt=""
      draggable={false}
      className="absolute block object-cover"
      // max-width: none — снимок под обрез шире страницы, а базовые стили ограничивают картинки шириной родителя.
      style={{ left: u.mm(rect.x), top: u.mm(rect.y), width: u.mm(rect.w), height: u.mm(rect.h), maxWidth: "none", borderRadius: radius }}
    />
  );
}

/**
 * Начальная полоса главы: номер, название, виньетка, эпиграф и рисунок дизайна. photo — снимок главы
 * в оформлениях, где глава открывается фото (без url — пейзаж-заглушка для примеров).
 */
export function OpenerPage({ kit, number, title, epigraph, photo, className, style }: PageProps & { number: number | null; title: string; epigraph?: string; photo?: { url?: string } }) {
  const { design, format, sizes: S, u } = kit;
  const { fill, align, art } = design.opener;
  const colors = fill ?? design.palette;
  const flow = openerFlow(format, design);
  const mark = number ? chapterMark(design, number, messagesFor(kit.language).book.chapter) : null;
  const shot = photo ? openerPhotoPlan(format, design) : null;
  const shapes = [
    ...(art ? openerArtShapes(art, { w: format.widthMm, h: format.heightMm, flowTop: flow.top, k: flow.k, palette: colors, seed: number ?? 0 }) : []),
    ...frame(kit, colors),
    ...(shot?.under ?? []),
  ];
  const scene = number ?? 0;
  return (
    <Sheet kit={kit} paper={fill?.paper} shapes={shapes} className={className} style={style}>
      {shot?.card ? (
        <div
          className="absolute"
          style={{
            left: u.mm(shot.card.x),
            top: u.mm(shot.card.y),
            width: u.mm(shot.card.w),
            height: u.mm(shot.card.h),
            background: PHOTO_COLORS.card,
            border: `${u.pt(OPENER.cardBorder)} solid ${PHOTO_COLORS.openerCardEdge}`,
            transform: `rotate(${shot.card.rotate}deg)`,
          }}
        >
          <PageImage kit={kit} rect={{ x: shot.img.x - shot.card.x - OPENER.cardInsetHtml, y: shot.img.y - shot.card.y - OPENER.cardInsetHtml, w: shot.img.w, h: shot.img.h }} url={photo?.url} scene={scene} />
        </div>
      ) : shot ? (
        <PageImage kit={kit} rect={shot.img} url={photo?.url} scene={scene} mask={shot.mask} />
      ) : null}
      {shot?.shade ? (
        <div
          className="absolute"
          style={{
            left: u.mm(shot.img.x),
            top: u.mm(shot.img.y),
            width: u.mm(shot.img.w),
            height: u.mm(shot.img.h),
            background: `linear-gradient(to bottom, transparent ${shot.shade.from * 100}%, ${hexAlpha(shot.shade.color, shot.shade.opacity)})`,
          }}
        />
      ) : null}
      {shot ? <PageLayer shapes={shot.over} format={format} /> : null}
      <TextArea kit={kit} className="flex flex-col">
        <Placed top={shot?.textTop ?? design.opener.top} align={align}>
          {mark?.kind === "label" ? (
            <div style={{ ...(design.opener.kicker ? { ...faceCss(design.opener.kicker, S.kicker, u), lineHeight: HTML_LINE_HEIGHT.kicker } : labelCss(kit, colors.accent)), color: colors.accent, marginBottom: u.pt(S.kickerGap) }}>{mark.text}</div>
          ) : null}
          {mark?.kind === "numeral" ? (
            <div style={{ ...faceCss(design.opener.numeral ?? design.display, S.numeral, u), lineHeight: OPENER.numeral.lineHeight, color: colors.accent, marginBottom: u.pt(S.numeral * OPENER.numeral.after) }}>{mark.text}</div>
          ) : null}
          <div style={{ ...faceCss(design.display, S.openerTitle, u), lineHeight: OPENER.title.lineHeight, color: colors.ink, maxWidth: OPENER.title.maxWidth, overflowWrap: "anywhere" }}>{title}</div>
          <Vignette kit={kit} rule={VIGNETTE_RULE.opener} colors={colors} align={align} />
          {epigraph ? <div style={{ ...italicBody(kit, S.epigraph), lineHeight: OPENER.epigraph.lineHeight, color: colors.muted, maxWidth: OPENER.epigraph.maxWidth[align] }}>{epigraph}</div> : null}
        </Placed>
      </TextArea>
    </Sheet>
  );
}

export interface PagePhoto {
  id: string;
  /** Адрес снимка; без него — пейзаж-заглушка (примеры в выборе оформления). */
  url?: string;
  width: number;
  height: number;
  caption: string;
  layout: "full" | "bleed" | "half" | "grid";
}

/** Фотостраница: снимки, рамки и подписи по раскладке photo-pages — как в PDF. */
export function PhotoPage({ kit, photos, scene = 0, className, style }: PageProps & { photos: PagePhoto[]; /** С какого пейзажа-заглушки начинать. */ scene?: number }) {
  const { design, format, sizes: S, u } = kit;
  const plan = photoPagePlan(photos, photoArea(format), design, S);
  const face = photoCaptionFace(design);
  const caption = (size: number): CSSProperties =>
    face.label ? { ...labelCss(kit, face.color, size), lineHeight: face.lineHeight } : { ...faceCss(face.face, size, u), lineHeight: face.lineHeight, color: face.color };
  return (
    <Sheet kit={kit} paper={design.photos.paper} shapes={plan.under} className={className} style={style}>
      {plan.cells.map((c, i) => {
        const p = photos.find((x) => x.id === c.id)!;
        return <PageImage key={c.id} kit={kit} rect={c.img} url={p.url} scene={scene + i} />;
      })}
      <PageLayer shapes={plan.over} format={format} />
      {plan.cells.map((c) =>
        c.caption ? (
          <div
            key={`cap-${c.id}`}
            className={cn("absolute text-center", c.caption.inside ? "truncate" : "line-clamp-3")}
            style={{ ...caption(c.caption.size), left: u.mm(c.caption.box.x), top: u.mm(c.caption.box.y), width: u.mm(c.caption.box.w) }}
          >
            {c.caption.text}
          </div>
        ) : null,
      )}
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
          <div style={{ ...faceCss(design.display, S.title, u), lineHeight: FRONT.title.lineHeight, color: P.ink, overflowWrap: "anywhere" }}>{title}</div>
          {subtitle ? <div style={{ ...italicBody(kit, S.subtitle), color: P.muted, marginTop: u.pt(FRONT.subtitle.before), lineHeight: HTML_LINE_HEIGHT.subtitle }}>{subtitle}</div> : null}
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
          <div style={{ ...italicBody(kit, S.dedication), lineHeight: FRONT.dedication.lineHeight, color: P.ink, maxWidth: FRONT.dedication.maxWidth, whiteSpace: "pre-line", overflowWrap: "anywhere", opacity: text ? 1 : 0.4 }}>{text || placeholder}</div>
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
        <div style={{ ...faceCss(design.display, S.tocTitle, u), lineHeight: HTML_LINE_HEIGHT.tocTitle, color: P.ink, textAlign: design.opener.align === "left" ? "left" : "center", marginTop: u.pt(TOC.title.before * scale), marginBottom: u.pt(TOC.title.after * scale) }}>
          {messagesFor(kit.language).book.toc}
        </div>
        {entries.map((e) => (
          <div key={e.number} className="flex items-end" style={{ fontFamily: cssFont(design.type.body), fontSize: u.pt(S.body), lineHeight: HTML_LINE_HEIGHT.tocEntry, marginBottom: u.pt(TOC.entry.after * scale) }}>
            <span className="truncate" style={{ color: P.ink, maxWidth: TOC.entry.maxWidth }}>
              {e.number}. {e.title}
            </span>
            <span className="min-w-0 flex-1" style={{ borderBottom: `${u.pt(TOC.leader.width)} dotted ${P.rule}`, margin: `0 ${u.pt(TOC.leader.side)} ${u.pt(TOC.leader.bottom)}` }} />
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
          <div style={{ ...italicBody(kit, S.end), color: P.ink, lineHeight: HTML_LINE_HEIGHT.end }}>{messagesFor(kit.language).book.theEnd}</div>
          <div style={{ ...labelCss(kit, P.muted), marginTop: kit.u.pt(FRONT.endYear.before) }}>{year}</div>
        </Placed>
      </TextArea>
    </Sheet>
  );
}

/** Фото внутри ответа (как в PDF: после нужного абзаца, узкие — в ряд). */
export interface EntryPhoto {
  id: string;
  url: string;
  width: number;
  height: number;
  caption: string;
  inline?: InlinePhotoStyle | null;
}

export interface SampleEntry {
  heading: string | null;
  paragraphs: string[];
  photos?: EntryPhoto[];
}

type RowItem = { p: EntryPhoto; style: InlinePhotoStyle };

/** Ряд фото внутри ответа — те же размеры, рамки и подписи, что в PDF (inline-photo.ts). */
function InlineRow({ kit, row }: { kit: PageKit; row: RowItem[] }) {
  const { design, sizes: S, u } = kit;
  const P = design.palette;
  const { w: textW, h: textH } = textArea(kit.format);
  const align = row[0].style.align;
  return (
    <div
      style={{
        display: "flex",
        justifyContent: align === "left" ? "flex-start" : align === "right" ? "flex-end" : "center",
        alignItems: "flex-start",
        gap: u.mm(textW * ROW_GAP),
        marginTop: u.pt(S.body * INLINE_ROW.before),
        marginBottom: u.pt(S.body * INLINE_ROW.after),
        breakInside: "avoid",
      }}
    >
      {row.map(({ p, style }) => {
        const b = framedBox(p, style, textW, textH, row.length);
        const polaroid = style.frame === "polaroid";
        const bw = polaroid ? INLINE_ROW.polaroidBorder : style.frame === "line" ? INLINE_ROW.lineBorder : 0;
        return (
          <figure key={p.id} style={{ width: u.mm(b.outerW), margin: 0, flex: "none" }}>
            <div
              style={{
                position: "relative",
                width: u.mm(b.outerW),
                height: u.mm(b.outerH),
                padding: `${u.mm(b.pad)} ${u.mm(b.pad)} ${u.mm(b.padBottom)}`,
                background: polaroid ? PHOTO_COLORS.card : undefined,
                border: bw ? `${u.pt(bw)} solid ${polaroid ? PHOTO_COLORS.polaroidEdge : P.ink}` : undefined,
                borderRadius: u.mm(b.radius),
                boxShadow: polaroid ? "0 1px 3px rgba(0,0,0,.12)" : undefined,
                overflow: "hidden",
                boxSizing: "border-box",
              }}
            >
              {/* eslint-disable-next-line @next/next/no-img-element -- фото клиента в вёрстке страницы */}
              <img
                src={p.url}
                alt=""
                draggable={false}
                style={{ display: "block", width: "100%", height: u.mm(b.imgH - bw * 2 * PT_TO_MM), objectFit: "cover", objectPosition: objectPosition(p, style), borderRadius: u.mm(b.radius), maxWidth: "none" }}
              />
              {polaroid && p.caption ? (
                <div
                  style={{
                    position: "absolute",
                    left: u.mm(b.pad),
                    right: u.mm(b.pad),
                    bottom: u.mm(b.padBottom * INLINE_ROW.polaroidCaption),
                    fontFamily: cssFont("caveat"),
                    fontWeight: 500,
                    fontSize: u.pt(polaroidFontSize({ imgW: mm(b.imgW), padBottom: mm(b.padBottom) }, p.caption, S.body)),
                    lineHeight: HTML_LINE_HEIGHT.polaroidCaption,
                    color: PHOTO_COLORS.polaroidInk,
                    textAlign: "center",
                    whiteSpace: "nowrap",
                    overflow: "hidden",
                  }}
                >
                  {p.caption}
                </div>
              ) : null}
            </div>
            {!polaroid && p.caption ? <figcaption style={{ ...italicBody(kit, S.caption), color: P.muted, textAlign: "center", marginTop: u.pt(INLINE_ROW.captionGap), lineHeight: HTML_LINE_HEIGHT.caption }}>{p.caption}</figcaption> : null}
          </figure>
        );
      })}
    </div>
  );
}

/** Ответ целиком: блоки набора и фото между ними, как в PDF. */
export function EntryBody({ kit, entry, leadIn }: { kit: PageKit; entry: SampleEntry; leadIn: boolean }) {
  const blocks = answerBlocks(entry.paragraphs);
  const items = (entry.photos ?? []).map((p) => ({ p, style: normalizeStyle(p.inline) }));
  const rows = rowsByBlock(blocks, layoutInline(items, entry.paragraphs.length));
  const rowsAt = (key: number) => (rows.get(key) ?? []).map((row, r) => <InlineRow key={`${key}-${r}`} kit={kit} row={row} />);
  return (
    <>
      {blocks.length ? rowsAt(-1) : null}
      {blocks.map((b, j) => (
        <Fragment key={j}>
          <AnswerBlockView kit={kit} block={b} leadIn={leadIn && j === 0} />
          {j < blocks.length - 1 ? rowsAt(j) : null}
        </Fragment>
      ))}
      {rowsAt(Number.POSITIVE_INFINITY)}
    </>
  );
}

/**
 * Страница текста главы для миниатюр: заголовки, абзацы, колонтитул и колонцифра. Текст режется
 * по строкам как в книге — через CSS-колонки размером с полосу набора (видна только первая).
 */
export function TextPage({ kit, entries, folio, bookTitle, chapterTitle, recto, leadIn, part = 0, tail = false, className, style }: PageProps & {
  entries: SampleEntry[];
  folio: number;
  bookTitle: string;
  chapterTitle: string;
  recto: boolean;
  /** Это первая страница главы: капитель в начале первого ответа. */
  leadIn: boolean;
  /** Какая по счёту полоса текста главы (с 0): колонки сдвигаются, и видна именно она. */
  part?: number;
  /** Концовка главы после последнего ответа (в листаемой книге — да, в образцах разворота — нет). */
  tail?: boolean;
}) {
  const { design, sizes: S, u } = kit;
  const area = textArea(kit.format);
  const side = pageSide(kit.format);
  const textW = area.w;
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
              <EntryBody kit={kit} entry={e} leadIn={leadIn && design.leadIn && i === 0} />
            </div>
          ))}
          {tail ? <ChapterTail kit={kit} /> : null}
        </div>
      </TextArea>
      <Folio kit={kit} recto={recto}>
        {folioText(design, folio)}
      </Folio>
    </Sheet>
  );
}
