/**
 * «Страницы» книги в API v1 (контракт packages/contracts/src/v1/pages.ts): то же, что PagesEditor сайта, — стиль,
 * пары шрифтов, посвящение, оглавление, последняя страница, — через тот же сервис настроек книги и те же каталоги.
 * Развороты — картинки вёрстки печати (src/server/pages-image.ts, /api/books/{id}/pages-image).
 */
import type { z } from "zod";
import { PAGES_TEXT_MAX, type PagesView } from "@mybook/contracts";
import { coverName } from "@/i18n/labels";
import { messagesFor } from "@/i18n/messages";
import { bookMessagesFor } from "@/i18n/messages/partial";
import { getLocale } from "@/i18n/server";
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
import {
  countCustom,
  patchSection,
  resetStyle,
} from "@/lib/book/interiors/style-edit";
import { bookKind } from "@/lib/content/kinds";
import {
  PAGES_IMAGE_WIDTHS,
  PAGES_SPREADS,
  pagesVersion,
} from "@/modules/production";
import {
  isBookEditableBy,
  type BookRow,
  type BookViewer,
} from "@/modules/authoring";
import { apiBook, HttpError } from "@/server/api";
import { container } from "@/server/container";
import {
  pagesSampleOf,
  pagesSpreadsOf,
  storePagesPreview,
} from "@/server/pages-image";
import { designAiInfo, runDesignAiRequest } from "@/server/design-ai-request";
import type { PagesAiInfo } from "@mybook/contracts";
import type { Handlers } from "../app";
import { bookSpreadSample } from "@/server/spreadSample";
import {
  chapterRows,
  GALLERY_KEY,
  TOC_EPIGRAPH_MAX,
  TOC_MODES,
  TOC_TITLE_MAX,
  withChapterLine,
  type TocLines,
} from "@/lib/book/toc";
import { placeFor } from "@/components/editor/questions/outline";
import type { PagesChapters } from "@mybook/contracts";
import {
  applyStudioOps,
  studioTab,
  type StudioChapter,
  type StudioTab,
} from "./pages-studio";
import { buildBookContent } from "@/lib/book/book-content";
import { toPhotoItem } from "@/lib/book/layout";
import { PAGINATION_REV_2 } from "@/lib/book/layout";
import type { ChapterStart } from "@/lib/book/chapter-head";

type View = z.infer<typeof PagesView>;

/** Сколько стилей во «Всех» до «Показать все» — как STYLES_SHOWN у StylesTab сайта. */
const STYLES_SHOWN = 8;

const face = (pick: FontPick) => {
  const f = fontFile(pick.font as FontKey, pick.weight ?? 400, !!pick.italic);
  return {
    family: pick.font,
    weight: f.weight,
    italic: f.style === "italic",
    url: `/api/fonts/${f.file}`,
  };
};

async function view(book: BookRow, viewer: BookViewer): Promise<View> {
  const locale = await getLocale();
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

  const sample = await pagesSampleOf(book.id);
  if (!sample) throw new HttpError(404, "bookNotFound");
  const v = pagesVersion(sample);
  const base = `/api/books/${book.id}/pages-image`;
  const kinds = pagesSpreadsOf(sample);
  const format = getFormat(book.format);

  const pairs = new Set(interiorsForCover(book.coverTemplate).map((d) => d.id));
  const used = new Set(interiorDesigns.map(interiorDirection));
  const cover = coverName(book.coverTemplate, locale);
  // Выбранный стиль — первым (как у сайта): сразу видно, что сейчас в книге.
  const ordered = [...interiorDesigns].sort(
    (a, b) => Number(b.id === interior) - Number(a.id === interior),
  );
  const own = style.fonts ?? {};
  const activePair = fontPairs.find((p) =>
    (Object.keys(p.fonts) as (keyof typeof p.fonts)[]).every(
      (r) => own[r]?.font === p.fonts[r]?.font,
    ),
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
    imageWidths: [...PAGES_IMAGE_WIDTHS],
    spreadAspect: (2 * format.widthMm) / format.heightMm,
    spreads: PAGES_SPREADS.filter((k) => kinds.includes(k)).map((k) => ({
      kind: k,
      label: t.spreads[k],
      imageUrl: `${base}?kind=${k}&v=${v}`,
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
        openerPhoto: d.opener.photo
          ? `${pp.badge} · ${m.editor.openerShape[d.opener.photo]}`
          : null,
        previewTitle: dt.styles.previewTitle(names[d.id].name),
        imageUrl: `${base}?kind=chapter&design=${d.id}&v=${v}`,
      })),
      filters: [
        { id: "all", label: dt.styles.all },
        ...(pairs.size
          ? [{ id: "cover", label: dt.styles.forCover(cover) }]
          : []),
        ...styleDirections
          .filter((d) => used.has(d))
          .map((d) => ({ id: d, label: dirNames[d] })),
      ],
      shown: STYLES_SHOWN,
    },
    fonts: {
      sample: book.title,
      pairs: fontPairs.map((p) => ({
        id: p.id,
        name:
          dt.fonts.pairNames[p.id as keyof typeof dt.fonts.pairNames] ?? p.id,
        display: face(p.fonts.display!),
        body: face(p.fonts.body!),
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
        endModes: (
          Object.keys(t.endPage.modes) as (keyof typeof t.endPage.modes)[]
        ).map((id) => ({ id, label: t.endPage.modes[id] })),
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

/** Главы книги для вкладки «Главы» студии: как в книге (номер, название с правками автора), без убранных. */
async function studioChapters(bookId: string): Promise<StudioChapter[]> {
  const b = await container().authoring.queries.bundle(bookId);
  if (!b) return [];
  const content = buildBookContent(
    b.book,
    b.questions,
    b.photos.map(toPhotoItem),
    b.chapters,
  );
  return content.chapters
    .filter((c) => c.number !== null && c.number !== undefined)
    .map((c) => ({ key: c.key, title: c.title, number: c.number }));
}

async function studioOf(book: BookRow, tab: StudioTab, chapter: string | null) {
  return studioTab(tab, {
    interior: getInteriorDesign(book.interior).id,
    style: parseInteriorStyle(book.interiorStyle) as InteriorStyle,
    book: {
      openersLeft: book.paginationRev === PAGINATION_REV_2,
      chapterStart: (book.chapterStart ?? "page") as ChapterStart,
      titlePage: book.titlePage,
    },
    chapters: tab === "chapters" ? await studioChapters(book.id) : [],
    chapter,
    locale: await getLocale(),
  });
}

type AiInfo = z.infer<typeof PagesAiInfo>;
type AiMode = "edit" | "create" | "variants" | "review";
const AI_MODES: AiMode[] = ["edit", "create", "variants", "review"];

/** Панель ИИ-дизайнера страниц: остаток запросов, предупреждение до отправки, идеи под книгу — как DesignAiPanel сайта. */
async function aiInfo(userId: string, book: BookRow): Promise<AiInfo> {
  const info = await designAiInfo(userId, book);
  const t = messagesFor(await getLocale()).design.ai;
  const a = info.allowance;
  const notice =
    a.remaining === 0 && a.credits > 0
      ? t.fromCredits(a.credits)
      : a.remaining === 1 && a.credits === 0
        ? t.lastFree
        : a.remaining === 2 && a.credits === 0
          ? t.lowFree(a.remaining)
          : null;
  const theme = (t.themeIdeas as Record<string, { pages: string } | undefined>)[
    book.theme
  ]?.pages;
  const ideas = [
    ...(theme ? [theme] : []),
    ...(info.hasPhotos ? [t.photoIdea] : []),
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

type AiPatch = { interior: string; interiorStyle: Record<string, unknown> };
const asPatch = (p: AiPatch) => ({
  interior: p.interior,
  styleJson: JSON.stringify(p.interiorStyle),
});

const LETTERS = "c:__letters";

/** Строки глав книги из образца оглавления — как у страницы «Страницы» сайта (sample.tocAll). */
async function chapterCandidates(book: BookRow) {
  const q = container().authoring.queries;
  const [questions, chapters, photos, letters] = await Promise.all([
    q.questions(book.id),
    q.chapters(book.id),
    q.photos(book.id),
    q.approvedLetters(book.id),
  ]);
  return (
    bookSpreadSample(book, questions, chapters, "", photos, null, letters)
      .tocAll ?? []
  );
}

const chaptersIn = (all: Awaited<ReturnType<typeof chapterCandidates>>) =>
  all.filter((c) => c.kind === "chapter" && c.pageKey !== GALLERY_KEY);

/** «Главы книги» — как ChaptersEditor сайта: номер, название и эпиграф (свои или по умолчанию), убрать/вернуть, порядок. */
async function chaptersOf(
  book: BookRow,
  viewer: BookViewer,
): Promise<z.infer<typeof PagesChapters>> {
  const m = messagesFor(await getLocale());
  const t = m.books.pages;
  const sx = m.design.ui.studio.pages;
  const nav = m.editor.nav;
  const lines: TocLines = (book.tocLines ?? {}) as TocLines;
  const toc = await chapterCandidates(book);
  const all = chaptersIn(toc);
  const counts = new Map<string, number>();
  for (const c of toc)
    if (c.kind === "section" && c.parent)
      counts.set(c.parent, (counts.get(c.parent) ?? 0) + 1);
  const blank = bookKind(book.theme) === "blank";
  const rows = chapterRows(all, lines, (key) => counts.get(key) ?? 0);
  const order = blank
    ? []
    : rows.filter((r) => r.c.key !== LETTERS).map((r) => r.c.pageKey);
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
      canDown:
        order.includes(c.pageKey) &&
        order.indexOf(c.pageKey) < order.length - 1,
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

export const pagesHandlers: Pick<
  Handlers,
  | "pagesGet"
  | "pagesUpdate"
  | "pagesStudioGet"
  | "pagesStudioApply"
  | "pagesAiInfo"
  | "pagesAi"
  | "pagesChapters"
  | "pagesChaptersUpdate"
> = {
  async pagesChapters({ req, input }) {
    const { book, viewer } = await apiBook(req, input.bookId);
    return chaptersOf(book, viewer);
  },

  /** Как ChaptersEditor сайта: строка главы — withChapterLine (tocLines книги), перестановка — moveChapter, режим — tocMode. */
  async pagesChaptersUpdate({ req, input }) {
    const { book, viewer } = await apiBook(req, input.bookId, {
      editable: true,
    });
    const b = input.body;
    const authoring = container().authoring;
    if (b.move && b.key) {
      const rows = chapterRows(
        chaptersIn(await chapterCandidates(book)),
        (book.tocLines ?? {}) as TocLines,
        () => 0,
      );
      const order = rows
        .filter((r) => r.c.key !== LETTERS)
        .map((r) => r.c.pageKey);
      const place = placeFor(
        order,
        b.key,
        b.move === "up" ? -1 : b.move === "down" ? 1 : b.move,
      );
      if (place)
        await authoring.questions.moveChapter(book.id, viewer, {
          key: b.key,
          ...place,
        });
    } else if (
      b.key &&
      (b.title !== undefined ||
        b.epigraph !== undefined ||
        b.hidden !== undefined)
    ) {
      const tocLines = withChapterLine(
        (book.tocLines ?? {}) as TocLines,
        b.key,
        {
          ...(b.title !== undefined ? { title: b.title.trim() } : {}),
          ...(b.epigraph !== undefined ? { epigraph: b.epigraph.trim() } : {}),
          ...(b.hidden !== undefined ? { hidden: b.hidden } : {}),
        },
      );
      await authoring.books.updateSettings(
        book.id,
        viewer,
        { tocLines },
        authoring.photoRepository,
      );
    }
    if (b.tocMode)
      await authoring.books.updateSettings(
        book.id,
        viewer,
        { tocMode: b.tocMode },
        authoring.photoRepository,
      );
    const fresh = (await authoring.queries.book(book.id))!;
    return {
      view: await view(fresh, viewer),
      chapters: await chaptersOf(fresh, viewer),
    };
  },

  async pagesAiInfo({ req, input }) {
    const { user, book } = await apiBook(req, input.bookId);
    return aiInfo(user.id, book);
  },

  /**
   * Просьба к ИИ-дизайнеру страниц — тем же кодом, что у сайта (runDesignAiRequest), от сохранённого оформления книги.
   * Правка и «с нуля» сохраняются сразу (в ответе — как было, для «Вернуть как было»); варианты — с картинкой разворота
   * «Глава» каждого (вёрстка печати, в книгу не пишется); советы оценки — с оформлением для «Применить».
   */
  async pagesAi({ req, input }) {
    const { user, book, viewer } = await apiBook(req, input.bookId, {
      editable: true,
    });
    const interior = getInteriorDesign(book.interior).id;
    const style = parseInteriorStyle(book.interiorStyle) as InteriorStyle;
    const before = { interior, styleJson: JSON.stringify(style) };
    const t = messagesFor(await getLocale()).design.ai;
    const prompt =
      input.body.prompt.length >= 2
        ? input.body.prompt
        : input.body.mode === "variants"
          ? t.variantsDefault
          : input.body.mode === "create"
            ? t.createDefault
            : input.body.prompt;
    const chapters = (await studioChapters(book.id)).map((c) => ({
      key: c.key,
      title: c.title,
    }));
    const res = (await runDesignAiRequest(user, book, {
      target: "pages",
      mode: input.body.mode,
      prompt,
      history: input.body.history,
      state: { interior, style: style as Record<string, unknown> },
      chapters,
    })) as Record<string, unknown>;
    const empty = {
      concept: null,
      changed: null,
      patch: null,
      variants: null,
      score: null,
      scoreText: null,
      summary: null,
      strengths: null,
      tips: null,
    };
    const info = await aiInfo(user.id, book);
    if (input.body.mode === "variants") {
      const v =
        (res.variants as { name: string; idea: string; patch: AiPatch }[]) ??
        [];
      const variants = await Promise.all(
        v.map(async (x) => {
          const id = await storePagesPreview(book.id, {
            interior: x.patch.interior,
            style: x.patch.interiorStyle,
          });
          return {
            name: x.name,
            idea: x.idea,
            patch: asPatch(x.patch),
            imageUrl: `/api/books/${book.id}/pages-image?kind=chapter&preview=${id}`,
          };
        }),
      );
      return {
        ...empty,
        mode: "variants" as const,
        reply: String(res.reply ?? ""),
        before,
        variants,
        info,
      };
    }
    if (input.body.mode === "review") {
      const score = Number(res.score ?? 0);
      const tips =
        (res.tips as { title: string; why: string; patch: AiPatch | null }[]) ??
        [];
      return {
        ...empty,
        mode: "review" as const,
        reply: String(res.summary ?? ""),
        before,
        score,
        scoreText: t.score(score),
        summary: String(res.summary ?? ""),
        strengths: (res.strengths as string[]) ?? [],
        tips: tips.map((x) => ({
          title: x.title,
          why: x.why,
          patch: x.patch ? asPatch(x.patch) : null,
        })),
        info,
      };
    }
    // Правка и «с нуля»: оформление сохраняется сразу (на сайте редактор применяет его и сохраняет сам).
    const patch = res.patch as AiPatch;
    if (res.changed) {
      const authoring = container().authoring;
      await authoring.books.updateSettings(
        book.id,
        viewer,
        { interior: patch.interior, interiorStyle: patch.interiorStyle },
        authoring.photoRepository,
      );
    }
    return {
      ...empty,
      mode: input.body.mode,
      reply: String(res.reply ?? ""),
      concept: (res.concept as string) || null,
      changed: !!res.changed,
      patch: res.changed ? asPatch(patch) : null,
      before,
      info,
    };
  },

  async pagesStudioGet({ req, input }) {
    const { book } = await apiBook(req, input.bookId);
    return studioOf(book, input.tab, input.chapter ?? null);
  },

  /** Правки студии: стиль и оформление главы — одним сохранением настроек дизайнера, плюс настройки книги из «Элементов». */
  async pagesStudioApply({ req, input }) {
    const { book, viewer } = await apiBook(req, input.bookId, {
      editable: true,
    });
    const { tab, chapter, ops } = input.body;
    let applied: ReturnType<typeof applyStudioOps>;
    try {
      applied = applyStudioOps(
        {
          interior: getInteriorDesign(book.interior).id,
          style: parseInteriorStyle(book.interiorStyle) as InteriorStyle,
          chapter,
        },
        ops,
      );
    } catch {
      throw new HttpError(400, "badRequest");
    }
    const authoring = container().authoring;
    await authoring.books.updateSettings(
      input.bookId,
      viewer,
      {
        interiorStyle: applied.style as Record<string, unknown>,
        ...applied.book,
      },
      authoring.photoRepository,
    );
    const fresh = (await authoring.queries.book(input.bookId))!;
    return {
      view: await view(fresh, viewer),
      studio: await studioOf(fresh, tab, chapter),
    };
  },

  async pagesGet({ req, input }) {
    const { book, viewer } = await apiBook(req, input.bookId);
    return view(book, viewer);
  },

  async pagesUpdate({ req, input }) {
    const { book, viewer } = await apiBook(req, input.bookId, {
      editable: true,
    });
    const { interior, fontPair, styleJson, ...rest } = input.body;
    let style = parseInteriorStyle(book.interiorStyle) as InteriorStyle;
    const patch: Parameters<
      ReturnType<typeof container>["authoring"]["books"]["updateSettings"]
    >[2] = { ...rest };
    if (interior !== undefined) {
      if (!isInteriorId(interior)) throw new HttpError(400, "badRequest");
      // Как pickStyle сайта: свои шрифты и интервалы подбирались к прежнему стилю — новый показываем как он задуман.
      if (
        interior !== getInteriorDesign(book.interior).id &&
        countCustom(style) > 0
      )
        style = resetStyle(style);
      patch.interior = interior;
      patch.interiorStyle = style as Record<string, unknown>;
    }
    // «Отменить» и оформление от ИИ-дизайнера: настройки целиком (поля и числа проверит домен — parseInteriorStyle).
    if (styleJson !== undefined) {
      let raw: unknown;
      try {
        raw = JSON.parse(styleJson);
      } catch {
        throw new HttpError(400, "badRequest");
      }
      style = parseInteriorStyle(raw) as InteriorStyle;
      patch.interiorStyle = style as Record<string, unknown>;
    }
    if (fontPair !== undefined) {
      const p = fontPairs.find((x) => x.id === fontPair);
      if (!p) throw new HttpError(400, "badRequest");
      style = patchSection(style, "fonts", p.fonts);
      if (p.display) style = patchSection(style, "display", p.display);
      patch.interiorStyle = style as Record<string, unknown>;
    }
    const authoring = container().authoring;
    await authoring.books.updateSettings(
      input.bookId,
      viewer,
      patch,
      authoring.photoRepository,
    );
    return view((await authoring.queries.book(input.bookId))!, viewer);
  },
};
