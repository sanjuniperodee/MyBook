/**
 * «Страницы» книги в API v1 (контракт packages/contracts/src/v1/pages.ts): то же, что PagesEditor сайта, — стиль,
 * пары шрифтов, посвящение, оглавление, последняя страница, — через тот же сервис настроек книги и те же каталоги.
 * Развороты — картинки вёрстки печати (src/server/pages-image.ts, /api/books/{id}/pages-image).
 * Чистая сборка моделей — в `@/modules/authoring/ui/pages-view` и `@/modules/authoring/ui/pages-studio`.
 */
import { messagesFor } from "@/i18n/messages";
import { getLocale } from "@/i18n/server";
import {
  getInteriorDesign,
  parseInteriorStyle,
  type InteriorStyle,
} from "@/lib/book/interiors";
import { withChapterLine, type TocLines } from "@/lib/book/toc";
import { type BookRow, type BookViewer } from "@/modules/authoring";
import {
  applyStudioOps,
  type StudioChapter,
  type StudioTab,
} from "@/modules/authoring/ui/pages-studio";
import {
  buildPagesAiInfo,
  buildPagesChaptersView,
  buildPagesStudioTab,
  buildPagesView,
  buildStudioChapters,
  chapterMovePlace,
  chapterOrderForMove,
  formatPagesAiPatch,
  preparePagesUpdatePatch,
  resolvePagesAiPrompt,
  type PagesAiPatchRaw,
} from "@/modules/authoring/ui/pages-view";
import {
  PAGES_IMAGE_WIDTHS,
  PAGES_SPREADS,
  pagesVersion,
} from "@/modules/production";
import { apiBook, HttpError } from "@/server/api";
import { container } from "@/server/container";
import { designAiInfo, runDesignAiRequest } from "@/server/design-ai-request";
import {
  pagesSampleOf,
  pagesSpreadsOf,
  storePagesPreview,
} from "@/server/pages-image";
import { bookSpreadSample } from "@/server/spreadSample";
import type { Handlers } from "../app";

async function view(book: BookRow, viewer: BookViewer) {
  const locale = await getLocale();
  const sample = await pagesSampleOf(book.id);
  if (!sample) throw new HttpError(404, "bookNotFound");
  return buildPagesView({
    book,
    viewer,
    locale,
    sample: {
      version: pagesVersion(sample),
      spreads: pagesSpreadsOf(sample),
      allSpreads: PAGES_SPREADS,
      imageWidths: PAGES_IMAGE_WIDTHS,
    },
  });
}

/** Главы книги для вкладки «Главы» студии: как в книге (номер, название с правками автора), без убранных. */
async function studioChapters(bookId: string): Promise<StudioChapter[]> {
  const b = await container().authoring.queries.bundle(bookId);
  return b ? buildStudioChapters(b) : [];
}

async function studioOf(book: BookRow, tab: StudioTab, chapter: string | null) {
  return buildPagesStudioTab({
    book,
    tab,
    chapters: tab === "chapters" ? await studioChapters(book.id) : [],
    chapter,
    locale: await getLocale(),
  });
}

/** Панель ИИ-дизайнера страниц: остаток запросов, предупреждение до отправки, идеи под книгу — как DesignAiPanel сайта. */
async function aiInfo(userId: string, book: BookRow) {
  const info = await designAiInfo(userId, book);
  return buildPagesAiInfo({
    allowance: info.allowance,
    hasPhotos: info.hasPhotos,
    theme: book.theme,
    locale: await getLocale(),
  });
}

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

/** «Главы книги» — как ChaptersEditor сайта: номер, название и эпиграф (свои или по умолчанию), убрать/вернуть, порядок. */
async function chaptersOf(book: BookRow, viewer: BookViewer) {
  const [locale, toc] = await Promise.all([getLocale(), chapterCandidates(book)]);
  return buildPagesChaptersView({ book, viewer, toc, locale });
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
      const order = chapterOrderForMove(
        await chapterCandidates(book),
        (book.tocLines ?? {}) as TocLines,
      );
      const place = chapterMovePlace(order, b.key, b.move);
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
    const locale = await getLocale();
    const t = messagesFor(locale).design.ai;
    const prompt = resolvePagesAiPrompt(input.body.mode, input.body.prompt, locale);
    const chapters = (await studioChapters(book.id)).map((c) => ({
      key: c.key,
      title: c.title,
    }));
    const res = (await runDesignAiRequest(
      user,
      book,
      {
        target: "pages",
        mode: input.body.mode,
        prompt,
        history: input.body.history,
        state: { interior, style: style as Record<string, unknown> },
        chapters,
      },
      locale,
    )) as Record<string, unknown>;
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
        (res.variants as { name: string; idea: string; patch: PagesAiPatchRaw }[]) ??
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
            patch: formatPagesAiPatch(x.patch),
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
        (res.tips as { title: string; why: string; patch: PagesAiPatchRaw | null }[]) ??
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
          patch: x.patch ? formatPagesAiPatch(x.patch) : null,
        })),
        info,
      };
    }
    // Правка и «с нуля»: оформление сохраняется сразу (на сайте редактор применяет его и сохраняет сам).
    const patch = res.patch as PagesAiPatchRaw;
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
      patch: res.changed ? formatPagesAiPatch(patch) : null,
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
    const prepared = preparePagesUpdatePatch(book, input.body);
    if (!prepared.ok) throw new HttpError(400, "badRequest");
    const authoring = container().authoring;
    await authoring.books.updateSettings(
      input.bookId,
      viewer,
      prepared.patch,
      authoring.photoRepository,
    );
    return view((await authoring.queries.book(input.bookId))!, viewer);
  },
};
