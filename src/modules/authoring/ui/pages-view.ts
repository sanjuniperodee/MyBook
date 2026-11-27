/**
 * Чистая сборка моделей API v1 для раздела «Страницы» и «Глав книги»:
 * единый источник для `apps/backend` (NestJS) без `next/headers`, БД и `server-only`.
 */
import type { z } from "zod";
import {
  PAGES_TEXT_MAX,
  type PagesAiInfo,
  type PagesChapters,
  type PagesPatch,
  type PagesSpreadKind,
  type PagesStudio,
  type PagesView,
} from "@mybook/contracts";
import type { Locale } from "@/i18n/config";
import { coverName } from "@/i18n/labels";
import { messagesFor } from "@/i18n/messages";
import { bookMessagesFor } from "@/i18n/messages/partial";
import { buildBookContent } from "@/lib/book/book-content";
import type { ChapterStart } from "@/lib/book/chapter-head";
import { fontFile, type FontKey } from "@/lib/book/fonts";
import { getFormat } from "@/lib/book/formats";
import {
  getInteriorDesign,
  interiorDesigns,
  interiorDirection,
  interiorsForCover,
  isInteriorId,
  parseInteriorStyle,
  styleDirections,
  type FontPick,
  type InteriorStyle,
} from "@/lib/book/interiors";
import { fontPairs } from "@/lib/book/interiors/studio-presets";
import { countCustom, patchSection, resetStyle } from "@/lib/book/interiors/style-edit";
import { PAGINATION_REV_2, toPhotoItem } from "@/lib/book/layout";
import {
  chapterRows,
  GALLERY_KEY,
  TOC_EPIGRAPH_MAX,
  TOC_MODES,
  TOC_TITLE_MAX,
  type SampleTocCandidate,
  type TocLines,
} from "@/lib/book/toc";
import { bookKind } from "@/lib/content/kinds";
import { isBookEditableBy, type BookViewer } from "../domain";
import { studioTab, type StudioChapter, type StudioTab } from "./pages-studio";

export type PagesSpreadId = z.infer<typeof PagesSpreadKind>;
export type PagesViewOutput = z.infer<typeof PagesView>;
export type PagesAiInfoOutput = z.infer<typeof PagesAiInfo>;
export type PagesChaptersOutput = z.infer<typeof PagesChapters>;
export type PagesStudioOutput = z.infer<typeof PagesStudio>;
export type PagesAiMode = "edit" | "create" | "variants" | "review";

export interface PagesAiPatchRaw {
  interior: string;
  interiorStyle: Record<string, unknown>;
}

/** Минимальный набор полей книги для представлений «Страницы» (совместим с BookRow). */
export interface PagesBookLike {
  id: string;
  userId: string;
  status: string;
  theme: string;
  title: string;
  language: Locale;
  format: string;
  coverTemplate: string;
  interior: string;
  interiorStyle: unknown;
  dedication: string;
  showToc: boolean;
  endText: string | null;
  titlePage: boolean;
  photoPlacement: "chapters" | "end" | "none";
  paginationRev: number;
  chapterStart: string | null;
  tocMode: string;
  tocLines: unknown;
}

/** Данные выборки разворотов для сборки адресов картинок. */
export interface PagesSampleMeta {
  version: string;
  spreads: readonly PagesSpreadId[];
  allSpreads: readonly PagesSpreadId[];
  imageWidths: readonly number[];
}

export interface PagesBookSettingsPatch {
  interior?: string;
  interiorStyle?: Record<string, unknown>;
  dedication?: string;
  showToc?: boolean;
  endText?: string | null;
  titlePage?: boolean;
}

export type ChapterMoveDirection = "start" | "up" | "down" | "end";
export type ChapterMovePlace = { beforeKey?: string; afterKey?: string };

/** Сколько стилей во «Всех» до «Показать все» — как STYLES_SHOWN у StylesTab сайта. */
const STYLES_SHOWN = 8;
const AI_MODES: PagesAiMode[] = ["edit", "create", "variants", "review"];
export const LETTERS_TOC_KEY = "c:__letters";

const faceOf = (pick: FontPick) => {
  const f = fontFile(pick.font as FontKey, pick.weight ?? 400, !!pick.italic);
  return {
    family: pick.font,
    weight: f.weight,
    italic: f.style === "italic",
    url: `/api/fonts/${f.file}`,
  };
};

export function formatPagesAiPatch(p: PagesAiPatchRaw) {
  return {
    interior: p.interior,
    styleJson: JSON.stringify(p.interiorStyle),
  };
}

/** Представление экрана «Страницы» (GET/PATCH /api/v1/books/{bookId}/pages). */
export function buildPagesView(input: {
  book: PagesBookLike;
  viewer: BookViewer;
  locale: Locale;
  sample: PagesSampleMeta;
}): PagesViewOutput {
  const { book, viewer, locale, sample } = input;
  const m = messagesFor(locale);
  const t = m.books.pages;
  const sx = m.design.ui.studio.pages;
  const dt = m.design.pages;
  const pp = m.books.pagesPhotos;
  const names = m.catalog.interiors;
  const dirNames = m.catalog.interiorDirections;
  const kind = bookKind(book.theme);
  const dedicationHint = t.dedicationByKind[kind] ?? {
    text: t.dedicationText,
    placeholder: t.dedicationPlaceholder,
  };
  const style = parseInteriorStyle(book.interiorStyle) as InteriorStyle;
  const interior = getInteriorDesign(book.interior).id;
  const base = `/api/books/${book.id}/pages-image`;
  const format = getFormat(book.format);

  const pairs = new Set(interiorsForCover(book.coverTemplate).map((d) => d.id));
  const used = new Set(interiorDesigns.map(interiorDirection));
  const cover = coverName(book.coverTemplate, locale);
  // Выбранный стиль — первым (как у сайта): сразу видно, что сейчас в книге.
  const ordered = [...interiorDesigns].sort((a, b) => Number(b.id === interior) - Number(a.id === interior));
  const own = style.fonts ?? {};
  const activePair = fontPairs.find((p) =>
    (Object.keys(p.fonts) as (keyof typeof p.fonts)[]).every((r) => own[r]?.font === p.fonts[r]?.font),
  );

  return {
    bookId: book.id,
    editable: book.status === "draft" && isBookEditableBy(book.userId, viewer),
    state: {
      interior,
      dedication: book.dedication,
      showToc: book.showToc,
      endText: book.endText,
      titlePage: book.titlePage,
      photoPlacement: book.photoPlacement,
      customCount: countCustom(style),
      styleJson: JSON.stringify(style),
    },
    imageWidths: [...sample.imageWidths],
    spreadAspect: (2 * format.widthMm) / format.heightMm,
    spreads: sample.allSpreads
      .filter((k) => sample.spreads.includes(k))
      .map((k) => ({
        kind: k,
        label: t.spreads[k],
        imageUrl: `${base}?kind=${k}&v=${sample.version}`,
      })),
    limits: {
      dedication: PAGES_TEXT_MAX.dedication,
      endText: PAGES_TEXT_MAX.endText,
    },
    styles: {
      items: ordered.map((d) => ({
        id: d.id,
        name: names[d.id].name,
        description: names[d.id].description,
        direction: interiorDirection(d),
        directionLabel: dirNames[interiorDirection(d)],
        forCover: pairs.has(d.id),
        openerPhoto: d.opener.photo ? `${pp.badge} · ${m.editor.openerShape[d.opener.photo]}` : null,
        previewTitle: dt.styles.previewTitle(names[d.id].name),
        imageUrl: `${base}?kind=chapter&design=${d.id}&v=${sample.version}`,
      })),
      filters: [
        { id: "all", label: dt.styles.all },
        ...(pairs.size ? [{ id: "cover", label: dt.styles.forCover(cover) }] : []),
        ...styleDirections.filter((d) => used.has(d)).map((d) => ({ id: d, label: dirNames[d] })),
      ],
      shown: STYLES_SHOWN,
    },
    fonts: {
      sample: book.title,
      pairs: fontPairs.map((p) => ({
        id: p.id,
        name: dt.fonts.pairNames[p.id as keyof typeof dt.fonts.pairNames] ?? p.id,
        display: faceOf(p.fonts.display!),
        body: faceOf(p.fonts.body!),
        upper: !!p.display?.upper,
        tracking: p.display?.tracking ?? 0,
        active: activePair?.id === p.id,
      })),
    },
    labels: {
      designSwitch: {
        cover: m.bookStudio.nav.designSwitch.cover,
        pages: m.bookStudio.nav.designSwitch.pages,
      },
      history: { undo: dt.undo, redo: dt.redo },
      tabs: {
        content: sx.tabs.content,
        styles: dt.tabs.styles,
        fonts: dt.tabs.fonts,
        text: dt.tabs.text,
        elements: dt.tabs.elements,
        colors: dt.tabs.colors,
        chapters: dt.tabs.chapters,
        ai: dt.tabs.ai,
      },
      content: {
        start: sx.start,
        front: sx.front,
        frontSet: sx.frontSet,
        frontEmpty: sx.frontEmpty,
        dedication: t.dedication,
        dedicationText: dedicationHint.text,
        dedicationPlaceholder: dedicationHint.placeholder,
        toc: t.toc,
        tocOn: sx.tocOn,
        tocOff: sx.tocOff,
        tocLabel: t.tocLabel,
        tocApprox: t.tocApprox,
        endTitle: t.endPage.title,
        endModes: (Object.keys(t.endPage.modes) as (keyof typeof t.endPage.modes)[]).map((id) => ({
          id,
          label: t.endPage.modes[id],
        })),
        endLabel: t.endPage.label,
        endPlaceholder: t.endPage.placeholder,
        endHint: t.endPage.hint,
        endNoneHint: t.endPage.noneHint,
        endDefault: bookMessagesFor(book.language).theEnd,
        photos: t.photos,
        photosSummary: pp.summary[book.photoPlacement],
        photosLink: pp.summaryLink,
      },
      styles: {
        inBook: dt.styles.inBook,
        pairBadge: t.pairBadge,
        open: dt.styles.open,
        apply: dt.styles.apply,
        current: dt.styles.current,
        previewText: dt.styles.previewText,
        showAll: dt.styles.showAll(interiorDesigns.length),
        empty: dt.styles.empty,
        search: dt.styles.search,
        reset: dt.styles.keptNotice,
      },
      fonts: { pairs: dt.fonts.pairs, pairsText: dt.fonts.pairsText },
    },
  };
}

/** Главы книги для вкладки «Главы» студии и ИИ-дизайнера: как в книге, без убранных. */
export function buildStudioChapters(bundle: {
  book: Parameters<typeof buildBookContent>[0];
  questions: Parameters<typeof buildBookContent>[1];
  photos: Parameters<typeof toPhotoItem>[0][];
  chapters: Parameters<typeof buildBookContent>[3];
}): StudioChapter[] {
  const content = buildBookContent(bundle.book, bundle.questions, bundle.photos.map(toPhotoItem), bundle.chapters);
  return content.chapters
    .filter((c) => c.number !== null && c.number !== undefined)
    .map((c) => ({ key: c.key, title: c.title, number: c.number }));
}

/** Вкладка студии оформления страниц для книги. */
export function buildPagesStudioTab(input: {
  book: Pick<PagesBookLike, "interior" | "interiorStyle" | "paginationRev" | "chapterStart" | "titlePage">;
  tab: StudioTab;
  chapters: StudioChapter[];
  chapter: string | null;
  locale: Locale;
}): PagesStudioOutput {
  const { book, tab, chapters, chapter, locale } = input;
  return studioTab(tab, {
    interior: getInteriorDesign(book.interior).id,
    style: parseInteriorStyle(book.interiorStyle) as InteriorStyle,
    book: {
      openersLeft: book.paginationRev === PAGINATION_REV_2,
      chapterStart: (book.chapterStart ?? "page") as ChapterStart,
      titlePage: book.titlePage,
    },
    chapters,
    chapter,
    locale,
  });
}

/** Панель ИИ-дизайнера страниц: остаток запросов, предупреждение до отправки, идеи под книгу. */
export function buildPagesAiInfo(input: {
  allowance: { remaining: number; limit: number; credits: number };
  hasPhotos: boolean;
  theme: string;
  locale: Locale;
}): PagesAiInfoOutput {
  const { allowance: a, hasPhotos, theme: bookTheme, locale } = input;
  const t = messagesFor(locale).design.ai;
  const notice =
    a.remaining === 0 && a.credits > 0
      ? t.fromCredits(a.credits)
      : a.remaining === 1 && a.credits === 0
        ? t.lastFree
        : a.remaining === 2 && a.credits === 0
          ? t.lowFree(a.remaining)
          : null;
  const theme = (t.themeIdeas as Record<string, { pages: string } | undefined>)[bookTheme]?.pages;
  const ideas = [
    ...(theme ? [theme] : []),
    ...(hasPhotos ? [t.photoIdea] : []),
    t.matchIdea.pages,
    ...t.examples.pages.slice(0, 2),
    ...t.drawIdeas.pages.slice(0, 1),
  ];
  const create = [...t.drawIdeas.pages.slice(0, 3), ...(theme ? [theme] : [])];
  return {
    remaining: a.remaining,
    limit: a.limit,
    credits: a.credits,
    out: a.remaining === 0 && a.credits === 0,
    ideas: { edit: ideas, create, variants: ideas, review: ideas },
    labels: {
      title: t.title,
      lead: t.lead.pages,
      modes: AI_MODES.map((id) => ({
        id,
        label: t.modes[id],
        hint: t.modeHint[id],
        placeholder:
          id === "edit"
            ? t.placeholder.pages
            : id === "create"
              ? t.createPlaceholder.pages
              : id === "variants"
                ? t.variantsPlaceholder.pages
                : t.reviewPlaceholder,
        send: t.send[id],
        thinking: t.thinking[id],
      })),
      examplesLabel: t.examplesLabel,
      left: t.left(a.remaining, a.limit),
      credits: a.credits > 0 ? t.credits(a.credits) : null,
      notice,
      freeNote: t.freeNote(a.limit),
      outTitle: t.outTitle,
      outText: t.outText,
      perks: [...t.perks],
      concept: t.concept,
      undo: t.undo,
      noChange: t.noChange,
      ai: t.ai,
      variantsTitle: t.variantsTitle,
      pick: t.pick,
      picked: t.picked,
      noVariants: t.noVariants,
      scoreLabel: t.scoreLabel,
      strengths: t.strengths,
      tips: t.tips,
      apply: t.apply,
      applied: t.applied,
      createDefault: t.createDefault,
      variantsDefault: t.variantsDefault,
    },
  };
}

/** Текст просьбы к ИИ-дизайнеру с подстановкой по умолчанию для create/variants. */
export function resolvePagesAiPrompt(mode: PagesAiMode, prompt: string, locale: Locale): string {
  if (prompt.length >= 2) return prompt;
  const t = messagesFor(locale).design.ai;
  if (mode === "variants") return t.variantsDefault;
  if (mode === "create") return t.createDefault;
  return prompt;
}

/** Строки-главы из оглавления без галереи. */
export function chapterCandidatesIn(all: readonly SampleTocCandidate[]): SampleTocCandidate[] {
  return all.filter((c) => c.kind === "chapter" && c.pageKey !== GALLERY_KEY);
}

/** Порядок переставляемых глав (без «Писем близких»). */
export function chapterOrderForMove(toc: readonly SampleTocCandidate[], tocLines: TocLines): string[] {
  const rows = chapterRows(chapterCandidatesIn(toc), tocLines, () => 0);
  return rows.filter((r) => r.c.key !== LETTERS_TOC_KEY).map((r) => r.c.pageKey);
}

/** Место главы после сдвига; null — двигать некуда (уже первая или последняя, или ключ не найден). */
export function chapterMovePlace(order: readonly string[], key: string, move: ChapterMoveDirection): ChapterMovePlace | null {
  const i = order.indexOf(key);
  const last = order.length - 1;
  if (i < 0) return null;
  if (move === "start" || move === "up") return i === 0 ? null : { beforeKey: order[move === "start" ? 0 : i - 1] };
  if (i === last) return null;
  return move === "end" ? {} : { afterKey: order[i + 1] };
}

/** «Главы книги» — номер, название и эпиграф, убрать/вернуть, порядок и режим оглавления. */
export function buildPagesChaptersView(input: {
  book: Pick<PagesBookLike, "userId" | "status" | "theme" | "tocLines" | "tocMode">;
  viewer: BookViewer;
  toc: readonly SampleTocCandidate[];
  locale: Locale;
}): PagesChaptersOutput {
  const { book, viewer, toc, locale } = input;
  const m = messagesFor(locale);
  const t = m.books.pages;
  const sx = m.design.ui.studio.pages;
  const nav = m.editor.nav;
  const lines: TocLines = (book.tocLines ?? {}) as TocLines;
  const all = chapterCandidatesIn(toc);
  const counts = new Map<string, number>();
  for (const c of toc) if (c.kind === "section" && c.parent) counts.set(c.parent, (counts.get(c.parent) ?? 0) + 1);
  const blank = bookKind(book.theme) === "blank";
  const rows = chapterRows(all, lines, (key) => counts.get(key) ?? 0);
  const order = blank ? [] : rows.filter((r) => r.c.key !== LETTERS_TOC_KEY).map((r) => r.c.pageKey);
  const removedCount = rows.filter((r) => r.removed).length;
  return {
    editable: book.status === "draft" && isBookEditableBy(book.userId, viewer),
    blank,
    rows: rows.map(({ c, removed, number, into, count }) => ({
      key: c.key,
      pageKey: c.pageKey,
      label: c.label,
      title: lines[c.key]?.title ?? "",
      epigraph: lines[c.key]?.epigraph ?? "",
      epigraphPlaceholder: c.epigraph || t.chapterEpigraphPlaceholder,
      removed,
      number,
      meta: removed
        ? into
          ? t.chapterMovedInto(count, into)
          : t.chapterRemovedNoHost
        : c.first
          ? `${t.chapterStories(count)} · ${t.chapterFirst}`
          : t.chapterStories(count),
      first: !!c.first,
      movable: order.includes(c.pageKey) && order.length > 1,
      canUp: order.indexOf(c.pageKey) > 0,
      canDown: order.includes(c.pageKey) && order.indexOf(c.pageKey) < order.length - 1,
    })),
    tocMode: book.tocMode,
    tocModes: TOC_MODES.map((id) => ({
      id,
      title: t.tocModes[id].title,
      text: t.tocModes[id].text,
    })),
    limits: { title: TOC_TITLE_MAX, epigraph: TOC_EPIGRAPH_MAX },
    labels: {
      title: t.chapters,
      text: blank ? m.books.pagesPhotos.blankNote : t.chaptersText,
      later: t.chaptersLater,
      removedCount: removedCount ? t.chaptersRemovedCount(removedCount) : null,
      nameReset: t.chapterNameReset,
      epigraphReset: t.chapterEpigraphReset,
      remove: t.chapterRemove,
      restore: t.chapterRestore,
      removed: sx.removed,
      toStart: nav.toStart,
      up: nav.up,
      down: nav.down,
      toEnd: nav.toEnd,
      moveError: t.storyMoveError,
      toc: t.toc,
    },
  };
}

/** Разбор и проверка правки «Страниц» (PATCH /api/v1/books/{bookId}/pages); false — некорректный стиль, пара или JSON. */
export function preparePagesUpdatePatch(
  book: Pick<PagesBookLike, "interior" | "interiorStyle">,
  body: PagesPatch,
): { ok: true; patch: PagesBookSettingsPatch } | { ok: false } {
  const { interior, fontPair, styleJson, ...rest } = body;
  let style = parseInteriorStyle(book.interiorStyle) as InteriorStyle;
  const patch: PagesBookSettingsPatch = { ...rest };
  if (interior !== undefined) {
    if (!isInteriorId(interior)) return { ok: false };
    // Как pickStyle сайта: свои шрифты и интервалы подбирались к прежнему стилю — новый показываем как он задуман.
    if (interior !== getInteriorDesign(book.interior).id && countCustom(style) > 0) style = resetStyle(style);
    patch.interior = interior;
    patch.interiorStyle = style as Record<string, unknown>;
  }
  // «Отменить» и оформление от ИИ-дизайнера: настройки целиком (поля и числа проверит домен — parseInteriorStyle).
  if (styleJson !== undefined) {
    let raw: unknown;
    try {
      raw = JSON.parse(styleJson);
    } catch {
      return { ok: false };
    }
    style = parseInteriorStyle(raw) as InteriorStyle;
    patch.interiorStyle = style as Record<string, unknown>;
  }
  if (fontPair !== undefined) {
    const p = fontPairs.find((x) => x.id === fontPair);
    if (!p) return { ok: false };
    style = patchSection(style, "fonts", p.fonts);
    if (p.display) style = patchSection(style, "display", p.display);
    patch.interiorStyle = style as Record<string, unknown>;
  }
  return { ok: true, patch };
}
