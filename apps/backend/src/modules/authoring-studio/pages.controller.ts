import { Controller, Inject, UseGuards } from "@nestjs/common";
import type { Output, Parsed } from "@mybook/contracts";
import type { Locale } from "@/i18n/config";
import { messagesFor } from "@/i18n/messages";
import { getInteriorDesign, parseInteriorStyle, type InteriorStyle } from "@/lib/book/interiors";
import { withChapterLine, type TocLines } from "@/lib/book/toc";
import type { BookRow } from "@/modules/authoring";
import { isBookEditableBy, type BookViewer } from "@/modules/authoring/domain";
import { applyStudioOps, type StudioTab } from "@/modules/authoring/ui/pages-studio";
import {
  buildPagesAiInfo,
  buildPagesChaptersView,
  buildPagesStudioTab,
  buildPagesView,
  chapterMovePlace,
  chapterOrderForMove,
  formatPagesAiPatch,
  preparePagesUpdatePatch,
  resolvePagesAiPrompt,
} from "@/modules/authoring/ui/pages-view";
import type { CurrentUser as AuthUser } from "@/modules/identity";
import { CurrentUser } from "../../core/auth/current-user.decorator";
import { ApiError } from "../../core/errors/api-error";
import { Input, RequestLocale } from "../../core/http/decorators";
import { Endpoint } from "../../core/http/endpoint";
import { BookAccess, BookAccessGuard, type AccessibleBook } from "../identity/book-access.guard";
import { PAGES_PORTS, type PagesPorts } from "./authoring-studio.tokens";

/** Проверка права правки книги (паритет с `apiBook(..., { editable: true })`). */
function assertEditableBook(access: AccessibleBook): void {
  if (!isBookEditableBy(access.book.userId, access.viewer)) throw new ApiError(404, "bookNotFound");
  if (access.book.status !== "draft") throw new ApiError(409, "bookLocked");
}

/**
 * Контекст 2B — «Страницы» книги, студия полос, ИИ-дизайнер страниц и «Главы книги» (8 маршрутов API v1).
 * Тонкий контроллер над общими чистыми сборщиками `@/modules/authoring/ui/pages-*` и портом `PAGES_PORTS`.
 */
@Controller()
@UseGuards(BookAccessGuard)
export class PagesController {
  constructor(@Inject(PAGES_PORTS) private readonly pages: PagesPorts) {}

  private async viewOf(book: BookRow, viewer: BookViewer, locale: Locale): Promise<Output<"pagesGet">> {
    const sample = await this.pages.sampleMeta(book.id);
    if (!sample) throw new ApiError(404, "bookNotFound");
    return buildPagesView({ book, viewer, locale, sample });
  }

  private async studioOf(book: BookRow, tab: StudioTab, chapter: string | null, locale: Locale): Promise<Output<"pagesStudioGet">> {
    const chapters = tab === "chapters" ? await this.pages.studioChapters(book.id) : [];
    return buildPagesStudioTab({ book, tab, chapters, chapter, locale });
  }

  private async aiInfoOf(userId: string, book: BookRow, locale: Locale): Promise<Output<"pagesAiInfo">> {
    const info = await this.pages.aiInfo(userId, book);
    return buildPagesAiInfo({ allowance: info.allowance, hasPhotos: info.hasPhotos, theme: book.theme, locale });
  }

  private async chaptersOf(book: BookRow, viewer: BookViewer, locale: Locale): Promise<Output<"pagesChapters">> {
    const toc = await this.pages.chapterCandidates(book);
    return buildPagesChaptersView({ book, viewer, toc, locale });
  }

  private async reloadBook(bookId: string): Promise<BookRow> {
    const fresh = await this.pages.book(bookId);
    if (!fresh) throw new ApiError(404, "bookNotFound");
    return fresh;
  }

  @Endpoint("pagesGet")
  async get(@BookAccess() access: AccessibleBook, @RequestLocale() locale: Locale): Promise<Output<"pagesGet">> {
    return this.viewOf(access.book, access.viewer, locale);
  }

  @Endpoint("pagesUpdate")
  async update(
    @BookAccess() access: AccessibleBook,
    @Input() input: Parsed<"pagesUpdate">,
    @RequestLocale() locale: Locale,
  ): Promise<Output<"pagesUpdate">> {
    assertEditableBook(access);
    const prepared = preparePagesUpdatePatch(access.book, input.body);
    if (!prepared.ok) throw new ApiError(400, "badRequest");
    await this.pages.updateSettings(input.bookId, access.viewer, prepared.patch);
    return this.viewOf(await this.reloadBook(input.bookId), access.viewer, locale);
  }

  @Endpoint("pagesStudioGet")
  async studioGet(
    @BookAccess() access: AccessibleBook,
    @Input() input: Parsed<"pagesStudioGet">,
    @RequestLocale() locale: Locale,
  ): Promise<Output<"pagesStudioGet">> {
    return this.studioOf(access.book, input.tab, input.chapter ?? null, locale);
  }

  @Endpoint("pagesStudioApply")
  async studioApply(
    @BookAccess() access: AccessibleBook,
    @Input() input: Parsed<"pagesStudioApply">,
    @RequestLocale() locale: Locale,
  ): Promise<Output<"pagesStudioApply">> {
    assertEditableBook(access);
    const { tab, chapter, ops } = input.body;
    let applied: ReturnType<typeof applyStudioOps>;
    try {
      applied = applyStudioOps(
        {
          interior: getInteriorDesign(access.book.interior).id,
          style: parseInteriorStyle(access.book.interiorStyle) as InteriorStyle,
          chapter,
        },
        ops,
      );
    } catch {
      throw new ApiError(400, "badRequest");
    }
    await this.pages.updateSettings(input.bookId, access.viewer, {
      interiorStyle: applied.style as Record<string, unknown>,
      ...applied.book,
    });
    const fresh = await this.reloadBook(input.bookId);
    return {
      view: await this.viewOf(fresh, access.viewer, locale),
      studio: await this.studioOf(fresh, tab, chapter, locale),
    };
  }

  @Endpoint("pagesAiInfo")
  async aiInfo(
    @CurrentUser() user: AuthUser,
    @BookAccess() access: AccessibleBook,
    @RequestLocale() locale: Locale,
  ): Promise<Output<"pagesAiInfo">> {
    return this.aiInfoOf(user.id, access.book, locale);
  }

  @Endpoint("pagesAi")
  async ai(
    @CurrentUser() user: AuthUser,
    @BookAccess() access: AccessibleBook,
    @Input() input: Parsed<"pagesAi">,
    @RequestLocale() locale: Locale,
  ): Promise<Output<"pagesAi">> {
    assertEditableBook(access);
    const { book, viewer } = access;
    const interior = getInteriorDesign(book.interior).id;
    const style = parseInteriorStyle(book.interiorStyle) as InteriorStyle;
    const before = { interior, styleJson: JSON.stringify(style) };
    const t = messagesFor(locale).design.ai;
    const prompt = resolvePagesAiPrompt(input.body.mode, input.body.prompt, locale);
    const chapters = (await this.pages.studioChapters(book.id)).map((c) => ({ key: c.key, title: c.title }));
    const res = await this.pages.runAi(
      user,
      book,
      {
        mode: input.body.mode,
        prompt,
        history: input.body.history,
        state: { interior, style: style as Record<string, unknown> },
        chapters,
      },
      locale,
    );
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
    const info = await this.aiInfoOf(user.id, book, locale);
    if (input.body.mode === "variants") {
      const variants = await Promise.all(
        (res.variants ?? []).map(async (x) => {
          const id = await this.pages.storePreview(book.id, {
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
        mode: "variants",
        reply: String(res.reply ?? ""),
        before,
        variants,
        info,
      };
    }
    if (input.body.mode === "review") {
      const score = Number(res.score ?? 0);
      return {
        ...empty,
        mode: "review",
        reply: String(res.summary ?? ""),
        before,
        score,
        scoreText: t.score(score),
        summary: String(res.summary ?? ""),
        strengths: res.strengths ?? [],
        tips: (res.tips ?? []).map((x) => ({
          title: x.title,
          why: x.why,
          patch: x.patch ? formatPagesAiPatch(x.patch) : null,
        })),
        info,
      };
    }
    // Правка и «с нуля»: оформление сохраняется сразу (на сайте редактор применяет его и сохраняет сам).
    const patch = res.patch;
    if (res.changed && patch) {
      await this.pages.updateSettings(book.id, viewer, {
        interior: patch.interior,
        interiorStyle: patch.interiorStyle,
      });
    }
    return {
      ...empty,
      mode: input.body.mode,
      reply: String(res.reply ?? ""),
      concept: res.concept || null,
      changed: !!res.changed,
      patch: res.changed && patch ? formatPagesAiPatch(patch) : null,
      before,
      info,
    };
  }

  @Endpoint("pagesChapters")
  async chapters(@BookAccess() access: AccessibleBook, @RequestLocale() locale: Locale): Promise<Output<"pagesChapters">> {
    return this.chaptersOf(access.book, access.viewer, locale);
  }

  @Endpoint("pagesChaptersUpdate")
  async chaptersUpdate(
    @BookAccess() access: AccessibleBook,
    @Input() input: Parsed<"pagesChaptersUpdate">,
    @RequestLocale() locale: Locale,
  ): Promise<Output<"pagesChaptersUpdate">> {
    assertEditableBook(access);
    const { book, viewer } = access;
    const b = input.body;
    if (b.move && b.key) {
      const order = chapterOrderForMove(await this.pages.chapterCandidates(book), (book.tocLines ?? {}) as TocLines);
      const place = chapterMovePlace(order, b.key, b.move);
      if (place) await this.pages.moveChapter(book.id, viewer, { key: b.key, ...place });
    } else if (b.key && (b.title !== undefined || b.epigraph !== undefined || b.hidden !== undefined)) {
      const tocLines = withChapterLine((book.tocLines ?? {}) as TocLines, b.key, {
        ...(b.title !== undefined ? { title: b.title.trim() } : {}),
        ...(b.epigraph !== undefined ? { epigraph: b.epigraph.trim() } : {}),
        ...(b.hidden !== undefined ? { hidden: b.hidden } : {}),
      });
      await this.pages.updateSettings(book.id, viewer, { tocLines });
    }
    if (b.tocMode) await this.pages.updateSettings(book.id, viewer, { tocMode: b.tocMode });
    const fresh = await this.reloadBook(book.id);
    return {
      view: await this.viewOf(fresh, viewer, locale),
      chapters: await this.chaptersOf(fresh, viewer, locale),
    };
  }
}
