/**
 * Студия оформления страниц для приложения: вкладки сайта «Текст», «Элементы», «Цвета», «Главы» и шрифты по ролям
 * (src/app/(app)/books/[id]/pages/studio/*.tsx) — как данные. Те же разделы, подписи, пределы (LIMITS), варианты
 * (interiorStyleOptions), палитры и шрифты; текущие значения — из стиля с настройками книги (applyInteriorStyle).
 * Правки приходят операциями и применяются теми же функциями, что у сайта (patchSection, patchChapter).
 */
import type { z } from "zod";
import type {
  PagesStudio,
  PagesStudioControl,
  PagesStudioOp,
  PagesStudioOption,
} from "@mybook/contracts";
import { messagesFor } from "@/i18n/messages";
import type { Locale } from "@/i18n/config";
import { CHAPTER_STARTS, type ChapterStart } from "@/lib/book/chapter-head";
import {
  fontCategories,
  fontFaces,
  fontFile,
  fontKeys,
  fontWeights,
  type FontKey,
} from "@/lib/book/fonts";
import { dividerDrawing, vignetteDrawing } from "@/lib/book/interior-art";
import { drawingToSvg } from "@/lib/book/interior-art/svg";
import {
  applyInteriorStyle,
  chapterDesign,
  getInteriorDesign,
  interiorStyleOptions as O,
  LIMITS,
  luminance,
  PAPER,
  type ChapterOverride,
  type FontPick,
  type FontRole,
  type InteriorDesign,
  type InteriorStyle,
  type TextFace,
} from "@/lib/book/interiors";
import {
  openerFills,
  palettes,
  papers,
} from "@/lib/book/interiors/studio-presets";
import { patchChapter, patchSection } from "@/lib/book/interiors/style-edit";
import { TITLE_LINE_MAX } from "@/lib/book/title-line";
import {
  headingFace,
  indentEm,
  paraAfter,
  quoteFace,
  quoteStyle,
} from "@/lib/book/typesetting";

type Control = z.infer<typeof PagesStudioControl>;
type Option = z.infer<typeof PagesStudioOption>;
type Op = z.infer<typeof PagesStudioOp>;
type Studio = z.infer<typeof PagesStudio>;
type Section = Studio["sections"][number];
export type StudioTab = "text" | "elements" | "colors" | "chapters" | "fonts";

/** Настройки книги, которые правит «Элементы» (не стиль: сброс стиля их не трогает). */
export interface StudioBook {
  openersLeft: boolean;
  chapterStart: ChapterStart;
  titlePage: boolean;
}

/** Глава для вкладки «Главы»: ключ, номер и название как в книге. */
export interface StudioChapter {
  key: string;
  title: string;
  number: number | null;
}

const j = (v: unknown) => JSON.stringify(v);

const blank: Control = {
  kind: "note",
  id: "",
  label: null,
  hint: null,
  spread: null,
  target: null,
  section: null,
  key: null,
  custom: false,
  value: null,
  min: null,
  max: null,
  step: null,
  scale: null,
  unit: null,
  slider: null,
  unsetAt: null,
  selected: null,
  options: null,
  checked: null,
  onJson: null,
  offJson: null,
  text: null,
  placeholder: null,
  maxLength: null,
  color: null,
  swatches: null,
  noneLabel: null,
  noneJson: null,
  bodyOnly: null,
};

const opt = (
  id: string,
  label: string,
  json: string | null = j(id),
  extra: Partial<Option> = {},
): Option => ({ id, label, json, svg: null, swatches: null, ...extra });

/** Где лежит значение: раздел стиля и поле, своё ли оно (есть ли что «вернуть как в стиле»). */
type Where = {
  target?: Control["target"];
  section: string;
  key: string;
  custom: boolean;
  spread?: string;
};
const at = (w: Where) => ({
  target: w.target ?? "style",
  section: w.section,
  key: w.key,
  custom: w.custom,
  spread: w.spread ?? "chapter",
});

const num = (
  id: string,
  label: string,
  w: Where,
  n: {
    value: number;
    min: number;
    max: number;
    step: number;
    unit?: string;
    scale?: number;
    slider?: boolean;
    unsetAt?: number;
  },
): Control => ({
  ...blank,
  kind: "number",
  id,
  label,
  ...at(w),
  value: n.value,
  min: n.min,
  max: n.max,
  step: n.step,
  unit: n.unit ?? null,
  scale: n.scale ?? null,
  slider: n.slider ?? true,
  unsetAt: n.unsetAt ?? null,
});

const choice = (
  id: string,
  label: string | null,
  w: Where,
  selected: string,
  options: Option[],
  kind: "choice" | "tiles" = "choice",
): Control => ({ ...blank, kind, id, label, ...at(w), selected, options });

const toggle = (
  id: string,
  label: string,
  w: Where,
  checked: boolean,
  offJson: string | null = j(false),
  hint: string | null = null,
): Control => ({
  ...blank,
  kind: "toggle",
  id,
  label,
  hint,
  ...at(w),
  checked,
  onJson: j(true),
  offJson,
});

const note = (
  id: string,
  text: string,
  kind: "note" | "warning" = "note",
): Control => ({ ...blank, kind, id, hint: text });

const section = (
  title: string | null,
  controls: (Control | null | false)[],
  text: string | null = null,
  reset: Op | null = null,
  resetLabel: string | null = null,
): Section => ({
  title,
  text,
  controls: controls.filter(Boolean) as Control[],
  reset,
  resetLabel,
});

/** Начертание роли в дизайне — как roleFace у FontsTab сайта. */
function roleFace(design: InteriorDesign, role: FontRole): TextFace {
  switch (role) {
    case "display":
      return design.display;
    case "heading":
      return headingFace(design);
    case "body":
      return { font: design.type.body, weight: design.text?.weight ?? 400 };
    case "quote":
      return quoteFace(design);
    case "label":
      return design.label;
    case "numeral":
      return design.opener.numeral ?? design.display;
    case "initial":
      return design.dropCap?.face ?? design.display;
    case "caption":
      return (
        design.photos.captionFace ??
        (design.photos.caption === "hand"
          ? { font: "caveat", weight: 500 }
          : design.photos.caption === "label"
            ? design.label
            : { font: design.type.body, weight: 400, italic: true })
      );
  }
}

/** Контраст двух цветов по WCAG — как contrast у ColorsTab сайта (текст на бумаге ≥ 4.5). */
const contrast = (a: string, b: string) => {
  const [x, y] = [luminance(a), luminance(b)].sort((p, q) => q - p);
  return (x + 0.05) / (y + 0.05);
};

const PALETTE_KEYS = ["ink", "accent", "muted", "ornament", "rule"] as const;
const INHERIT = "inherit";

export function studioTab(
  tab: StudioTab,
  o: {
    interior: string;
    style: InteriorStyle;
    book: StudioBook;
    chapters: StudioChapter[];
    chapter: string | null;
    locale: Locale;
  },
): Studio {
  const m = messagesFor(o.locale).design;
  const base = getInteriorDesign(o.interior);
  const design = applyInteriorStyle(base, o.style);
  const style = o.style;
  const reset = m.ui.reset;
  const out: Studio = {
    tab,
    sections: [],
    chapters: null,
    chapter: null,
    fonts: null,
    fontCategories: null,
    labels: { reset, search: m.ui.fonts.search, empty: m.pages.chapters.empty },
  };
  const svgOf = (d: ReturnType<typeof vignetteDrawing>) => drawingToSvg(d);

  if (tab === "text") {
    const t = m.pages.textTab;
    const b = style.body ?? {};
    const h = style.heading ?? {};
    const d = style.display ?? {};
    const l = style.label ?? {};
    const hf = headingFace(design);
    const body = (key: keyof typeof b) => ({
      section: "body",
      key,
      custom: b[key] !== undefined,
    });
    const heading = (key: keyof typeof h) => ({
      section: "heading",
      key,
      custom: h[key] !== undefined,
    });
    const display = (key: keyof typeof d, spread = "chapter") => ({
      section: "display",
      key,
      custom: d[key] !== undefined,
      spread,
    });
    const label = (key: keyof typeof l) => ({
      section: "label",
      key,
      custom: l[key] !== undefined,
    });
    out.sections = [
      section(t.body, [
        num("bodySize", t.size, body("size"), {
          value: design.type.bodySize,
          min: 8,
          max: 14,
          step: 0.1,
          unit: t.units.pt,
        }),
        num("lineHeight", t.lineHeight, body("lineHeight"), {
          value: design.type.lineHeight,
          min: LIMITS.lineHeight[0],
          max: 2,
          step: 0.05,
          unit: t.units.x,
        }),
        num("bodyTracking", t.tracking, body("tracking"), {
          value: design.text?.tracking ?? 0,
          min: LIMITS.bodyTracking[0],
          max: 0.08,
          step: 0.005,
          unit: t.units.pct,
          scale: 100,
          unsetAt: 0,
        }),
        choice(
          "align",
          t.align,
          body("align"),
          design.text?.align ?? "justify",
          (["justify", "left", "center", "right"] as const).map((a) =>
            opt(a, t.aligns[a]),
          ),
        ),
        num("indent", t.indent, body("indent"), {
          value: indentEm(design),
          min: 0,
          max: 3,
          step: 0.1,
          unit: t.units.em,
        }),
        indentEm(design)
          ? toggle(
              "indentFirst",
              t.indentFirst,
              body("indentFirst"),
              design.text?.indentFirst === true,
              null,
            )
          : null,
        num("paraGap", t.paraGap, body("paraGap"), {
          value: paraAfter(design),
          min: 0,
          max: 1.5,
          step: 0.05,
          unit: t.units.em,
        }),
        num("measure", t.measure, body("measure"), {
          value: design.text?.measure ?? 1,
          min: LIMITS.measure[0],
          max: 1,
          step: 0.01,
          unit: t.units.pct,
          scale: 100,
          unsetAt: 1,
        }),
        note("hint", t.hint),
      ]),
      section(t.headings, [
        num("headingSize", t.headingSize, heading("size"), {
          value: design.heading.size,
          min: 1,
          max: 2.6,
          step: 0.05,
          unit: t.units.x,
        }),
        choice(
          "headingAlign",
          t.headingAlign,
          heading("align"),
          design.heading.align,
          (["left", "center"] as const).map((a) => opt(a, t.headingAligns[a])),
        ),
        num("headingTracking", t.tracking, heading("tracking"), {
          value: hf.tracking ?? 0,
          min: 0,
          max: 0.3,
          step: 0.01,
          unit: t.units.pct,
          scale: 100,
        }),
        toggle("headingUpper", t.upper, heading("upper"), !!hf.upper),
        toggle(
          "headingAccent",
          t.accent,
          heading("accent"),
          !!design.heading.accent,
        ),
        toggle("headingBar", t.bar, heading("bar"), !!design.heading.bar),
      ]),
      section(t.chapters, [
        num("chapterSize", t.chapterSize, display("size"), {
          value: design.opener.titleSize,
          min: LIMITS.displaySize[0],
          max: 48,
          step: 0.5,
          unit: t.units.pt,
        }),
        choice(
          "chapterAlign",
          t.chapterAlign,
          display("align"),
          design.opener.align,
          (["center", "left"] as const).map((a) => opt(a, t.chapterAligns[a])),
        ),
        num("chapterTop", t.chapterTop, display("top"), {
          value: design.opener.top,
          min: LIMITS.displayTop[0],
          max: LIMITS.displayTop[1],
          step: 0.01,
          unit: t.units.pct,
          scale: 100,
        }),
        num("displayTracking", t.tracking, display("tracking"), {
          value: design.display.tracking ?? 0,
          min: 0,
          max: 0.4,
          step: 0.01,
          unit: t.units.pct,
          scale: 100,
        }),
        toggle(
          "displayUpper",
          t.upper,
          display("upper"),
          !!design.display.upper,
        ),
        num("titleSize", t.titleSize, display("titleSize", "front"), {
          value: design.titlePage?.size ?? 30,
          min: LIMITS.titleSize[0],
          max: 60,
          step: 0.5,
          unit: t.units.pt,
        }),
      ]),
      section(t.labels, [
        num("labelSize", t.labelSize, label("size"), {
          value: design.label.size,
          min: LIMITS.labelSize[0],
          max: 10,
          step: 0.1,
          unit: t.units.pt,
        }),
        num("labelTracking", t.tracking, label("tracking"), {
          value: design.label.tracking ?? 0,
          min: 0,
          max: LIMITS.labelTracking[1],
          step: 0.01,
          unit: t.units.pct,
          scale: 100,
        }),
        toggle("labelUpper", t.upper, label("upper"), !!design.label.upper),
      ]),
    ];
    return out;
  }

  if (tab === "elements") {
    const t = m.pages.elements;
    const e = style.elements ?? {};
    const el = (key: keyof typeof e, spread = "chapter") => ({
      section: "elements",
      key,
      custom: e[key] !== undefined,
      spread,
    });
    const book = (key: keyof StudioBook, spread = "chapter") => ({
      target: "book" as const,
      section: "book",
      key,
      custom: false,
      spread,
    });
    const dropCap = design.dropCap?.style ?? "none";
    const palette = {
      rule: design.palette.rule,
      ornament: design.palette.ornament,
    };
    const titlePage = o.book.titlePage;
    out.sections = [
      section(t.dropCap, [
        choice(
          "dropCap",
          null,
          el("dropCap"),
          dropCap,
          (["none", "drop", "raised"] as const).map((v) =>
            opt(v, t.dropCaps[v]),
          ),
        ),
        design.dropCap?.style === "drop"
          ? {
              ...num("dropLines", t.dropLines, el("dropLines"), {
                value: design.dropCap.lines,
                min: 2,
                max: 4,
                step: 1,
                slider: false,
              }),
            }
          : null,
        toggle("leadIn", t.leadIn, el("leadIn"), design.leadIn),
        toggle(
          "plainAnswers",
          t.plainAnswers,
          el("plainAnswers"),
          !!design.plainAnswers,
          null,
          t.plainAnswersHint,
        ),
      ]),
      section(t.number, [
        choice(
          "number",
          null,
          el("number"),
          design.opener.number,
          O.numbers.map((v) => opt(v, t.numbers[v])),
        ),
        {
          ...choice(
            "chapterStart",
            t.chapterStart,
            book("chapterStart"),
            o.book.chapterStart,
            CHAPTER_STARTS.map((v) => opt(v, t.chapterStarts[v])),
          ),
          hint: t.chapterStartHints[o.book.chapterStart],
        },
        o.book.chapterStart === "page"
          ? toggle(
              "openersLeft",
              t.openersLeft,
              book("openersLeft"),
              o.book.openersLeft,
              j(false),
              t.openersLeftHint,
            )
          : null,
      ]),
      section(t.ornament, [
        choice(
          "ornament",
          null,
          el("ornament"),
          design.ornament,
          O.glyphs.map((g) =>
            opt(g, t.glyphs[g], j(g), {
              svg: svgOf(vignetteDrawing(g, 10, palette)),
            }),
          ),
          "tiles",
        ),
        toggle(
          "vignette",
          t.vignette,
          el("vignette"),
          design.opener.vignette !== false,
        ),
      ]),
      section(t.divider, [
        toggle(
          "questionPage",
          t.questionPage,
          el("questionPage"),
          !!design.questionPage,
        ),
        choice(
          "divider",
          null,
          el("divider"),
          design.divider,
          O.dividers.map((k) =>
            opt(k, t.dividers[k], j(k), {
              svg:
                k === "glyph" || k === "rule" || k === "asterism"
                  ? svgOf(dividerDrawing(design.ornament, k, design.palette))
                  : null,
            }),
          ),
          "tiles",
        ),
      ]),
      section(t.frame, [
        choice(
          "frame",
          null,
          el("frame", "front"),
          design.frame,
          O.frames.map((v) => opt(v, t.frames[v])),
        ),
      ]),
      section(t.art, [
        choice(
          "art",
          null,
          el("art"),
          design.opener.art ?? "none",
          (["none", ...O.arts] as const).map((v) =>
            opt(v, t.arts[v], v === "none" ? j(null) : j(v)),
          ),
        ),
      ]),
      section(t.runningHead, [
        choice(
          "runningHead",
          null,
          el("runningHead"),
          design.runningHead,
          (["none", "plain", "ruled"] as const).map((v) =>
            opt(v, t.runningHeads[v]),
          ),
        ),
        choice(
          "folio",
          t.folio,
          el("folio"),
          design.folio.align,
          (["center", "outer", "none"] as const).map((v) =>
            opt(v, t.folios[v]),
          ),
        ),
        design.folio.align !== "none"
          ? toggle(
              "folioDashes",
              t.folioDashes,
              el("folioDashes"),
              !!design.folio.dashes,
            )
          : null,
      ]),
      section(t.quote, [
        choice(
          "quote",
          null,
          el("quote"),
          quoteStyle(design),
          O.quotes.map((v) => opt(v, t.quotes[v])),
        ),
      ]),
      section(t.titlePage, [
        toggle(
          "titlePagePrint",
          t.titlePagePrint,
          book("titlePage", "front"),
          titlePage,
          j(false),
          t.titlePagePrintHint,
        ),
        titlePage
          ? choice(
              "titleLayout",
              null,
              el("titlePage", "front"),
              design.titlePage?.layout ?? "center",
              O.titles.map((v) => opt(v, t.titlePages[v])),
            )
          : null,
        titlePage
          ? toggle(
              "titleAuthor",
              t.titleAuthor,
              el("titleAuthor", "front"),
              design.titlePage?.author !== false,
            )
          : null,
        titlePage
          ? {
              ...blank,
              kind: "text" as const,
              id: "titleLine",
              label: t.titleLine,
              hint: t.titleLineHint,
              ...at(el("titleLine", "front")),
              text: e.titleLine ?? "",
              placeholder: t.titleLinePlaceholder,
              maxLength: TITLE_LINE_MAX,
            }
          : null,
      ]),
      section(t.photoFrame, [
        choice(
          "photoFrame",
          null,
          el("photoFrame", "photos"),
          design.photos.frame,
          O.photoFrames.map((v) => opt(v, t.photoFrames[v])),
        ),
        choice(
          "caption",
          t.caption,
          el("caption", "photos"),
          design.photos.caption,
          O.captions.map((v) => opt(v, t.captions[v])),
        ),
      ]),
    ];
    return out;
  }

  if (tab === "colors") {
    const t = m.pages.colors;
    const c = style.colors ?? {};
    const paper = design.paper ?? PAPER;
    const swatches = [
      ...new Set([
        ...Object.values(base.palette),
        ...palettes.flatMap((p) => [p.colors.accent, p.colors.ink]),
      ]),
    ];
    const active = palettes.find((p) =>
      PALETTE_KEYS.every(
        (k) => design.palette[k].toUpperCase() === p.colors[k],
      ),
    );
    const color = (
      id: string,
      label: string,
      key: string,
      value: string | null,
      sw: string[],
      custom: boolean,
      extra: Partial<Control> = {},
    ): Control => ({
      ...blank,
      kind: "color",
      id,
      label,
      target: "style",
      section: "colors",
      key,
      custom,
      spread: "chapter",
      color: value,
      swatches: sw,
      ...extra,
    });
    out.sections = [
      section(
        t.palettes,
        [
          // Палитра целиком: пять цветов сразу (key — null: значение кладётся в раздел целиком, как colors({...p.colors})).
          {
            ...choice(
              "palette",
              null,
              { section: "colors", key: "", custom: false },
              active?.id ?? "",
              palettes.map((p) =>
                opt(p.id, t.names[p.id], j(p.colors), {
                  swatches: [
                    p.colors.ink,
                    p.colors.accent,
                    p.colors.ornament,
                    p.colors.muted,
                  ],
                }),
              ),
              "tiles",
            ),
            key: null,
          },
        ],
        t.palettesText,
      ),
      section(m.pages.tabs.colors, [
        ...PALETTE_KEYS.map((k) =>
          color(k, t[k], k, design.palette[k], swatches, !!c[k]),
        ),
        contrast(design.palette.ink, paper) < 4.5
          ? note("contrast", t.contrast, "warning")
          : null,
      ]),
      section(
        t.paper,
        [color("paper", t.paper, "paper", paper, papers, !!c.paper)],
        t.paperHint,
      ),
      section(t.opener, [
        color(
          "opener",
          t.opener,
          "opener",
          design.opener.fill?.paper ?? null,
          openerFills,
          c.opener !== undefined,
          { noneLabel: t.openerNone, noneJson: j(null) },
        ),
      ]),
    ];
    return out;
  }

  if (tab === "chapters") {
    const t = m.pages.chapters;
    const el = m.pages.elements;
    out.chapters = o.chapters.map((c) => ({
      key: c.key,
      label: `${c.number ? `${c.number}. ` : ""}${c.title}`,
      styled: !!style.chapters?.[c.key],
    }));
    if (!o.chapters.length) return out;
    const key =
      o.chapter && o.chapters.some((c) => c.key === o.chapter)
        ? o.chapter
        : o.chapters[0].key;
    out.chapter = key;
    const own: ChapterOverride = style.chapters?.[key] ?? {};
    const cd = chapterDesign(design, key);
    const inherit = t.inherit;
    const w = (k: keyof ChapterOverride) => ({
      target: "chapter" as const,
      section: "chapter",
      key: k,
      custom: own[k] !== undefined,
    });
    const withInherit = (options: Option[]) => [
      opt(INHERIT, inherit, null),
      ...options,
    ];
    const title = o.chapters.find((c) => c.key === key)?.title ?? "";
    out.sections = [
      section(null, [note("text", t.text)]),
      section(
        title,
        [
          choice(
            "number",
            el.number,
            w("number"),
            own.number ?? INHERIT,
            withInherit(O.numbers.map((v) => opt(v, el.numbers[v]))),
          ),
          choice(
            "align",
            m.pages.textTab.chapterAlign,
            w("align"),
            own.align ?? INHERIT,
            withInherit(
              (["center", "left"] as const).map((v) =>
                opt(v, m.pages.textTab.chapterAligns[v]),
              ),
            ),
          ),
          choice(
            "dropCap",
            el.dropCap,
            w("dropCap"),
            own.dropCap === null ? "none" : (own.dropCap?.style ?? INHERIT),
            withInherit(
              (["none", "drop", "raised"] as const).map((v) =>
                opt(
                  v,
                  el.dropCaps[v],
                  v === "none"
                    ? j(null)
                    : j({
                        style: v,
                        lines: design.dropCap?.lines ?? (v === "drop" ? 3 : 2),
                        ...(design.dropCap?.face
                          ? { face: design.dropCap.face }
                          : {}),
                      }),
                ),
              ),
            ),
          ),
          {
            ...choice(
              "ornament",
              el.ornament,
              w("ornament"),
              cd.ornament,
              O.glyphs.map((g) =>
                opt(g, el.glyphs[g], j(g), {
                  svg: svgOf(
                    vignetteDrawing(g, 10, {
                      rule: cd.palette.rule,
                      ornament: cd.palette.ornament,
                    }),
                  ),
                }),
              ),
              "tiles",
            ),
          },
          {
            ...blank,
            kind: "color",
            id: "accent",
            label: t.accent,
            ...at(w("accent")),
            color: own.accent ?? null,
            swatches: palettes.map((p) => p.colors.accent),
            noneLabel: inherit,
            noneJson: null,
          },
          {
            ...blank,
            kind: "color",
            id: "fill",
            label: t.fill,
            ...at(w("fill")),
            color:
              own.fill === undefined
                ? (design.opener.fill?.paper ?? null)
                : own.fill,
            swatches: openerFills,
            noneLabel: el.frames.none,
            noneJson: j(null),
          },
          choice(
            "art",
            el.art,
            w("art"),
            own.art === undefined ? INHERIT : (own.art ?? "none"),
            withInherit(
              (["none", ...O.arts] as const).map((v) =>
                opt(v, el.arts[v], v === "none" ? j(null) : j(v)),
              ),
            ),
          ),
        ],
        null,
        style.chapters?.[key]
          ? { target: "chapter", section: "chapter", key: null, json: null }
          : null,
        t.reset,
      ),
    ];
    return out;
  }

  // Шрифты по ролям (FontsTab сайта; готовые пары — на вкладке «Шрифты» экрана, pagesUpdate fontPair).
  const t = m.pages.fonts;
  const own = style.fonts ?? {};
  out.fonts = fontKeys.map((id) => {
    const f = fontFaces[id];
    const fw = fontWeights(id);
    const face = fontFile(id, 400, false);
    return {
      id,
      name: f.name ?? f.family,
      category: f.category ?? "book",
      body: !!f.body,
      weights: fw.weights,
      italic: fw.italic,
      url: `/api/fonts/${face.file}`,
    };
  });
  out.fontCategories = [
    { id: "all", label: m.ui.fonts.all },
    ...fontCategories.map((id) => ({ id, label: m.ui.fonts.categories[id] })),
  ];
  const roles: FontRole[] = [
    "display",
    ...(design.opener.number !== "label" && design.opener.number !== "none"
      ? (["numeral"] as const)
      : []),
    "heading",
    "body",
    "quote",
    "label",
    ...(design.dropCap ? (["initial"] as const) : []),
    "caption",
  ];
  out.sections = roles.map((role) => {
    const face = roleFace(design, role);
    const fw = fontWeights(face.font as FontKey);
    const current = fw.weights.reduce(
      (a, b) => (Math.abs(b - face.weight) < Math.abs(a - face.weight) ? b : a),
      fw.weights[0],
    );
    const w = {
      target: "fontRole" as const,
      section: "fonts",
      key: role,
      custom: !!own[role],
      spread: role === "caption" ? "photos" : "chapter",
    };
    return section(
      t.roles[role],
      [
        {
          ...blank,
          kind: "font",
          id: `${role}-font`,
          label: t.roles[role],
          ...at(w),
          selected: face.font,
          bodyOnly: role === "body",
        },
        fw.weights.length > 1
          ? {
              ...choice(
                `${role}-weight`,
                m.ui.weight,
                { ...w, custom: false },
                String(current),
                fw.weights.map((x) =>
                  opt(
                    String(x),
                    m.ui.weights[x] ?? String(x),
                    j({ weight: x }),
                  ),
                ),
              ),
              target: "fontRole" as const,
            }
          : null,
        fw.italic && role !== "body"
          ? {
              ...toggle(
                `${role}-italic`,
                m.ui.italic,
                { ...w, custom: false },
                !!face.italic,
                j({ italic: false }),
              ),
              onJson: j({ italic: true }),
              target: "fontRole" as const,
            }
          : null,
      ],
      (t.rolesHint as Partial<Record<FontRole, string>>)[role] ?? null,
    );
  });
  return out;
}

/**
 * Применить правки студии к стилю и настройкам книги — так же, как вкладки сайта: patchSection / patchChapter,
 * шрифт роли — начертание роли с поверх него правкой (pick у FontsTab). Числа и варианты проверит домен
 * (parseInteriorStyle) при сохранении.
 */
export function applyStudioOps(
  o: { interior: string; style: InteriorStyle; chapter: string | null },
  ops: Op[],
): { style: InteriorStyle; book: Partial<StudioBook> } {
  let style = o.style;
  const book: Partial<StudioBook> = {};
  for (const op of ops) {
    const value =
      op.json === null ? undefined : (JSON.parse(op.json) as unknown);
    if (op.target === "book") {
      if (op.key === "openersLeft" || op.key === "titlePage")
        book[op.key] = value === true;
      else if (
        op.key === "chapterStart" &&
        CHAPTER_STARTS.includes(value as ChapterStart)
      )
        book.chapterStart = value as ChapterStart;
      continue;
    }
    if (op.target === "chapter") {
      if (!o.chapter) continue;
      style =
        op.key === null
          ? patchChapter(style, o.chapter, null)
          : patchChapter(style, o.chapter, {
              [op.key]: value,
            } as Partial<ChapterOverride>);
      continue;
    }
    if (op.target === "fontRole") {
      const role = op.key as FontRole;
      if (value === undefined) {
        style = patchSection(style, "fonts", { [role]: undefined });
        continue;
      }
      const design = applyInteriorStyle(getInteriorDesign(o.interior), style);
      const face = roleFace(design, role);
      const next: FontPick = {
        font: face.font,
        weight: face.weight,
        ...(face.italic ? { italic: true } : {}),
        ...style.fonts?.[role],
        ...(value as Partial<FontPick>),
      };
      style = patchSection(style, "fonts", { [role]: next });
      continue;
    }
    const sectionKey = op.section as Parameters<typeof patchSection>[1];
    if (!sectionKey) continue;
    // Бумага по умолчанию — не своя настройка (как ColorsTab: v === PAPER ? undefined : v).
    if (
      sectionKey === "colors" &&
      op.key === "paper" &&
      typeof value === "string" &&
      value.toUpperCase() === PAPER.toUpperCase()
    ) {
      style = patchSection(style, "colors", { paper: undefined });
      continue;
    }
    style =
      op.key === null
        ? value && typeof value === "object"
          ? patchSection(style, sectionKey, value as never)
          : style
        : patchSection(style, sectionKey, { [op.key]: value } as never);
  }
  return { style, book };
}
