import { Controller, Inject, Param, Req } from "@nestjs/common";
import { CoverFields, LetterPatch, LettersOrder, QuestionPatch } from "@mybook/contracts";
import { PAGES_TEXT_MAX } from "@mybook/contracts/limits";
import type { FastifyRequest } from "fastify";
import { z } from "zod";
import { isLocale } from "@/i18n/config";
import { CHAPTER_STARTS } from "@/lib/book/chapter-head";
import { END_TEXT_MAX } from "@/lib/book/end-page";
import { TOC_EPIGRAPH_MAX, TOC_LINES_MAX, TOC_MODES, TOC_TITLE_MAX } from "@/lib/book/toc";
import { CHAPTER_EPIGRAPH_MAX, CHAPTER_TITLE_MAX, MAX_CHAPTERS, SECTION_PROMPT_MAX, SECTION_TITLE_MAX } from "@/lib/content/kinds";
import { INVITE_TEXT_MAX } from "@/lib/content/letter-invite";
import { MAX_QUESTIONS } from "@/modules/authoring/domain/Question";
import type { CurrentUser as AuthUser } from "@/modules/identity";
import { CurrentUser } from "../../core/auth/current-user.decorator";
import { RawBody, SiteRoute } from "../../core/http/site-route";
import { AUTHORING, type AuthoringFacade } from "../authoring/authoring.tokens";
import { parseJsonBody, requireUuid, SiteBookAccessService, uuidSchema } from "./authoring-site.helpers";

const bookPatchSchema = z
  .object({
    ...CoverFields.shape,
    authorGender: z.enum(["m", "f"]),
    recipientGender: z.enum(["m", "f"]),
    photoFrames: z.record(z.string().max(12), z.object({ zoom: z.number(), x: z.number(), y: z.number() })).refine((o) => Object.keys(o).length <= 12),
    dedication: z.string().trim().max(PAGES_TEXT_MAX.dedication),
    interior: z.string().max(40),
    interiorStyle: z.record(z.string(), z.unknown()).refine((o) => JSON.stringify(o).length <= 56_000, "tooLarge"),
    coverDesign: z
      .record(z.string(), z.unknown())
      .nullable()
      .refine((o) => o === null || JSON.stringify(o).length <= 150_000, "tooLarge"),
    coverBack: z
      .record(z.string(), z.unknown())
      .nullable()
      .refine((o) => o === null || JSON.stringify(o).length <= 150_000, "tooLarge"),
    format: z.string().max(20),
    photoPlacement: z.enum(["chapters", "end", "none"]),
    showToc: z.boolean(),
    openersLeft: z.boolean(),
    chapterStart: z.enum(CHAPTER_STARTS),
    titlePage: z.boolean(),
    tocMode: z.enum(TOC_MODES),
    tocLines: z
      .record(
        z.string().max(90),
        z.object({
          title: z.string().max(TOC_TITLE_MAX).optional(),
          hidden: z.boolean().optional(),
          epigraph: z.string().max(TOC_EPIGRAPH_MAX).optional(),
          noOpenerPhoto: z.boolean().optional(),
        }),
      )
      .refine((o) => Object.keys(o).length <= TOC_LINES_MAX),
    inviteText: z.string().trim().max(INVITE_TEXT_MAX),
    endText: z.string().trim().max(END_TEXT_MAX).nullable(),
    occasion: z.string().max(40).nullable(),
    occasionDate: z.string().regex(/^\d{4}-\d{2}-\d{2}$/).nullable(),
    language: z.string().refine(isLocale, "unknownLanguage"),
  })
  .partial()
  .strict();

const customQuestionSchema = z
  .object({
    afterId: uuidSchema,
    prompt: z.string().trim().min(3, "questionEmpty").max(200),
  })
  .strict();

const sectionQuestionSchema = z
  .object({
    chapterKey: uuidSchema,
    afterId: uuidSchema.nullish(),
    title: z.string().trim().max(SECTION_TITLE_MAX, "sectionTitleTooLong"),
    prompt: z.string().trim().max(SECTION_PROMPT_MAX),
  })
  .strict();

const questionsOrderSchema = z.object({ sections: z.array(z.object({ id: uuidSchema, chapter: uuidSchema }).strict()).max(MAX_QUESTIONS) }).strict();

const questionMoveSchema = z.object({ chapter: z.string().regex(/^[\w-]{1,80}$/), beforeId: uuidSchema.nullable().optional() }).strict();

const chapterCreateSchema = z
  .object({
    title: z.string().trim().max(CHAPTER_TITLE_MAX, "chapterTitleTooLong"),
    afterKey: uuidSchema.nullish(),
  })
  .strict();

const chapterPatchSchema = z
  .object({
    title: z.string().trim().max(CHAPTER_TITLE_MAX, "chapterTitleTooLong"),
    epigraph: z.string().trim().max(CHAPTER_EPIGRAPH_MAX),
  })
  .partial()
  .strict()
  .refine((p) => p.title !== undefined || p.epigraph !== undefined);

const chaptersOrderSchema = z.object({ keys: z.array(uuidSchema).max(MAX_CHAPTERS) }).strict();

const chapterKeySchema = z.string().regex(/^[\w-]{1,80}$/);
const chapterMoveSchema = z
  .object({ key: chapterKeySchema, beforeKey: chapterKeySchema.nullable().optional(), afterKey: chapterKeySchema.nullable().optional() })
  .strict();

const lettersInviteSchema = z.object({ enabled: z.boolean(), regenerate: z.boolean().optional() });

/**
 * 12 маршрутов сайта (16 HTTP-обработчиков) для текста и структуры книги:
 * вопросы/разделы, главы, письма близких и настройки/удаление книги.
 * Статические подмаршруты (`/order`, `/move`, `/invite`) объявлены раньше параметрических (`{qid}`, `{key}`, `{lid}`).
 */
@Controller()
export class BooksTextSiteController {
  constructor(
    @Inject(AUTHORING) private readonly authoring: AuthoringFacade,
    @Inject(SiteBookAccessService) private readonly access: SiteBookAccessService,
  ) {}

  // ─── Вопросы и разделы ──────────────────────────────────────────────────

  @SiteRoute("PUT", "/api/books/{id}/questions/order", { auth: "user" })
  async questionsOrder(
    @Param("id") rawId: string,
    @CurrentUser() user: AuthUser,
    @RawBody() raw: Buffer,
    @Req() req: FastifyRequest,
  ): Promise<Response> {
    const id = requireUuid(rawId);
    const viewer = await this.access.viewerFor(req, user, id);
    const { sections } = questionsOrderSchema.parse(parseJsonBody(raw));
    const outline = await this.authoring.outline.reorderSections(id, viewer, sections);
    return Response.json({ outline });
  }

  @SiteRoute("POST", "/api/books/{id}/questions/{qid}/move", { auth: "user" })
  async questionMove(
    @Param("id") rawId: string,
    @Param("qid") rawQid: string,
    @CurrentUser() user: AuthUser,
    @RawBody() raw: Buffer,
    @Req() req: FastifyRequest,
  ): Promise<Response> {
    const id = requireUuid(rawId);
    const qid = requireUuid(rawQid);
    const viewer = await this.access.viewerFor(req, user, id);
    const input = questionMoveSchema.parse(parseJsonBody(raw));
    await this.authoring.questions.moveStory(id, viewer, { id: qid, ...input });
    return Response.json({ ok: true });
  }

  @SiteRoute("PATCH", "/api/books/{id}/questions/{qid}", { auth: "user" })
  async questionSave(
    @Param("id") rawId: string,
    @Param("qid") rawQid: string,
    @CurrentUser() user: AuthUser,
    @RawBody() raw: Buffer,
    @Req() req: FastifyRequest,
  ): Promise<Response> {
    const id = requireUuid(rawId);
    const qid = requireUuid(rawQid);
    const viewer = await this.access.viewerFor(req, user, id);
    await this.authoring.questions.edit(id, viewer, qid, QuestionPatch.parse(parseJsonBody(raw)));
    return Response.json({ ok: true, updatedAt: new Date() });
  }

  @SiteRoute("DELETE", "/api/books/{id}/questions/{qid}", { auth: "user" })
  async questionDelete(
    @Param("id") rawId: string,
    @Param("qid") rawQid: string,
    @CurrentUser() user: AuthUser,
    @Req() req: FastifyRequest,
  ): Promise<Response> {
    const id = requireUuid(rawId);
    const qid = requireUuid(rawQid);
    const viewer = await this.access.viewerFor(req, user, id);
    const outline = await this.authoring.questions.deleteCustom(id, viewer, qid);
    return Response.json({ ok: true, outline });
  }

  @SiteRoute("POST", "/api/books/{id}/questions", { auth: "user" })
  async questionCreate(
    @Param("id") rawId: string,
    @CurrentUser() user: AuthUser,
    @RawBody() raw: Buffer,
    @Req() req: FastifyRequest,
  ): Promise<Response> {
    const id = requireUuid(rawId);
    const viewer = await this.access.viewerFor(req, user, id);
    const body = parseJsonBody(raw);
    if (body && typeof body === "object" && "chapterKey" in body) {
      const input = sectionQuestionSchema.parse(body);
      const { id: qid, outline } = await this.authoring.outline.addSection(id, viewer, input);
      const question = (await this.authoring.queries.questions(id)).find((q) => q.id === qid);
      return Response.json({ question, outline });
    }
    const { afterId, prompt } = customQuestionSchema.parse(body);
    const qid = await this.authoring.questions.addCustom(id, viewer, afterId, prompt);
    const question = (await this.authoring.queries.questions(id)).find((q) => q.id === qid);
    return Response.json({ question });
  }

  // ─── Главы ──────────────────────────────────────────────────────────────

  @SiteRoute("PUT", "/api/books/{id}/chapters/order", { auth: "user" })
  async chaptersOrder(
    @Param("id") rawId: string,
    @CurrentUser() user: AuthUser,
    @RawBody() raw: Buffer,
    @Req() req: FastifyRequest,
  ): Promise<Response> {
    const id = requireUuid(rawId);
    const viewer = await this.access.viewerFor(req, user, id);
    const { keys } = chaptersOrderSchema.parse(parseJsonBody(raw));
    const outline = await this.authoring.outline.reorderChapters(id, viewer, keys);
    return Response.json({ outline });
  }

  @SiteRoute("PUT", "/api/books/{id}/chapters/move", { auth: "user" })
  async chaptersMove(
    @Param("id") rawId: string,
    @CurrentUser() user: AuthUser,
    @RawBody() raw: Buffer,
    @Req() req: FastifyRequest,
  ): Promise<Response> {
    const id = requireUuid(rawId);
    const viewer = await this.access.viewerFor(req, user, id);
    const input = chapterMoveSchema.parse(parseJsonBody(raw));
    const order = await this.authoring.questions.moveChapter(id, viewer, input);
    return Response.json({ order });
  }

  @SiteRoute("PATCH", "/api/books/{id}/chapters/{key}", { auth: "user" })
  async chapterRename(
    @Param("id") rawId: string,
    @Param("key") rawKey: string,
    @CurrentUser() user: AuthUser,
    @RawBody() raw: Buffer,
    @Req() req: FastifyRequest,
  ): Promise<Response> {
    const id = requireUuid(rawId);
    const key = requireUuid(rawKey);
    const viewer = await this.access.viewerFor(req, user, id);
    const outline = await this.authoring.outline.renameChapter(id, viewer, key, chapterPatchSchema.parse(parseJsonBody(raw)));
    return Response.json({ outline });
  }

  @SiteRoute("DELETE", "/api/books/{id}/chapters/{key}", { auth: "user" })
  async chapterDelete(
    @Param("id") rawId: string,
    @Param("key") rawKey: string,
    @CurrentUser() user: AuthUser,
    @Req() req: FastifyRequest,
  ): Promise<Response> {
    const id = requireUuid(rawId);
    const key = requireUuid(rawKey);
    const viewer = await this.access.viewerFor(req, user, id);
    const outline = await this.authoring.outline.deleteChapter(id, viewer, key);
    return Response.json({ outline });
  }

  @SiteRoute("POST", "/api/books/{id}/chapters", { auth: "user" })
  async chapterCreate(
    @Param("id") rawId: string,
    @CurrentUser() user: AuthUser,
    @RawBody() raw: Buffer,
    @Req() req: FastifyRequest,
  ): Promise<Response> {
    const id = requireUuid(rawId);
    const viewer = await this.access.viewerFor(req, user, id);
    const input = chapterCreateSchema.parse(parseJsonBody(raw));
    return Response.json(await this.authoring.outline.addChapter(id, viewer, input));
  }

  // ─── Письма близких ─────────────────────────────────────────────────────

  @SiteRoute("POST", "/api/books/{id}/letters/invite", { auth: "user" })
  async lettersInvite(
    @Param("id") rawId: string,
    @CurrentUser() user: AuthUser,
    @RawBody() raw: Buffer,
    @Req() req: FastifyRequest,
  ): Promise<Response> {
    const id = requireUuid(rawId);
    const viewer = await this.access.viewerFor(req, user, id);
    const { enabled, regenerate } = lettersInviteSchema.parse(parseJsonBody(raw));
    return Response.json({ token: await this.authoring.books.setLetterInvite(id, viewer, enabled, !!regenerate) });
  }

  @SiteRoute("PUT", "/api/books/{id}/letters/order", { auth: "user" })
  async lettersOrder(
    @Param("id") rawId: string,
    @CurrentUser() user: AuthUser,
    @RawBody() raw: Buffer,
    @Req() req: FastifyRequest,
  ): Promise<Response> {
    const id = requireUuid(rawId);
    const viewer = await this.access.viewerFor(req, user, id);
    const { ids } = LettersOrder.parse(parseJsonBody(raw));
    await this.authoring.letters.reorder(id, viewer, ids);
    return Response.json({ ok: true });
  }

  @SiteRoute("PATCH", "/api/books/{id}/letters/{lid}", { auth: "user" })
  async letterEdit(
    @Param("id") rawId: string,
    @Param("lid") rawLid: string,
    @CurrentUser() user: AuthUser,
    @RawBody() raw: Buffer,
    @Req() req: FastifyRequest,
  ): Promise<Response> {
    const id = requireUuid(rawId);
    const lid = requireUuid(rawLid);
    const viewer = await this.access.viewerFor(req, user, id);
    await this.authoring.letters.edit(id, viewer, lid, LetterPatch.parse(parseJsonBody(raw)));
    return Response.json({ letter: (await this.authoring.queries.letters(id)).find((l) => l.id === lid) });
  }

  @SiteRoute("DELETE", "/api/books/{id}/letters/{lid}", { auth: "user" })
  async letterDelete(
    @Param("id") rawId: string,
    @Param("lid") rawLid: string,
    @CurrentUser() user: AuthUser,
    @Req() req: FastifyRequest,
  ): Promise<Response> {
    const id = requireUuid(rawId);
    const lid = requireUuid(rawLid);
    const viewer = await this.access.viewerFor(req, user, id);
    await this.authoring.letters.delete(id, viewer, lid);
    return Response.json({ ok: true });
  }

  // ─── Настройки и удаление книги ─────────────────────────────────────────

  @SiteRoute("PATCH", "/api/books/{id}", { auth: "user" })
  async bookPatch(
    @Param("id") rawId: string,
    @CurrentUser() user: AuthUser,
    @RawBody() raw: Buffer,
    @Req() req: FastifyRequest,
  ): Promise<Response> {
    const id = requireUuid(rawId);
    const viewer = await this.access.viewerFor(req, user, id);
    const { language, ...rest } = bookPatchSchema.parse(parseJsonBody(raw));
    await this.authoring.books.updateSettings(
      id,
      viewer,
      { ...rest, language: language && isLocale(language) ? language : undefined },
      this.authoring.photoRepository,
    );
    return Response.json({ book: await this.authoring.queries.book(id) });
  }

  @SiteRoute("DELETE", "/api/books/{id}", { auth: "user" })
  async bookDelete(@Param("id") rawId: string, @CurrentUser() user: AuthUser, @Req() req: FastifyRequest): Promise<Response> {
    const id = requireUuid(rawId);
    const viewer = await this.access.viewerFor(req, user, id);
    await this.authoring.books.delete(id, viewer);
    return Response.json({ ok: true });
  }
}
