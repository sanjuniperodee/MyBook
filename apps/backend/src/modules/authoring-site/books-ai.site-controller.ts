import { Controller, Inject, Logger, Param, Req } from "@nestjs/common";
import type { FastifyRequest } from "fastify";
import { z } from "zod";
import { isLocale, type Locale } from "@/i18n/config";
import { designAiBody } from "@/lib/book/design-ai";
import { bookKind } from "@/lib/content/kinds";
import { AssistantError, REWRITE_MAX, rewriteModes } from "@/modules/assistant";
import type { CurrentUser as AuthUser } from "@/modules/identity";
import { HELP_QUESTION_MAX, parseHelpPlace } from "@/modules/messaging/domain/cabinetHelp";
import type { RateLimiter } from "@/shared/application/RateLimiter";
import { CurrentUser } from "../../core/auth/current-user.decorator";
import { ApiError } from "../../core/errors/api-error";
import { RequestLocale } from "../../core/http/decorators";
import { RawBody, SiteRoute } from "../../core/http/site-route";
import { RATE_LIMITER } from "../../core/kernel/tokens";
import { parseJsonBody, requireUuid, SiteBookAccessService } from "./authoring-site.helpers";
import { AUTHORING_SITE_PORTS, type AuthoringSitePorts } from "./authoring-site.tokens";

const helpPostSchema = z.object({
  text: z.string().trim().max(HELP_QUESTION_MAX, "helpRate").default(""),
  place: z.unknown().optional(),
  human: z.boolean().optional(),
});

const helpApplySchema = z.object({ proposal: z.string().uuid(), decline: z.boolean().optional() });

const proofreadAiSchema = z.object({ text: z.string().min(1).max(20_000), ui: z.string().optional() });
const proofreadSpellSchema = z.object({ words: z.array(z.string().min(2).max(40)).max(300) });
const writeAiSchema = z
  .object({
    text: z.string().trim().min(1).max(REWRITE_MAX, "writeAiTooLong"),
    mode: z.enum(rewriteModes),
    prompt: z.string().trim().max(500).optional(),
  })
  .refine((v) => v.mode !== "custom" || !!v.prompt, { path: ["prompt"] });

const log = new Logger("authoring-site-ai");

/**
 * 6 маршрутов сайта (8 HTTP-обработчиков) для помощников книги:
 * виджет помощи `/help` и правки помощника `/help/apply`, ИИ-дизайнер `/design-ai`, корректор `/proofread/ai`, словарь `/proofread/spell` и писатель `/write/ai`.
 */
@Controller()
export class BooksAiSiteController {
  constructor(
    @Inject(AUTHORING_SITE_PORTS) private readonly ports: AuthoringSitePorts,
    @Inject(RATE_LIMITER) private readonly limiter: RateLimiter,
    @Inject(SiteBookAccessService) private readonly access: SiteBookAccessService,
  ) {}

  @SiteRoute("GET", "/api/books/{id}/help", { auth: "user" })
  async helpGet(@Param("id") rawId: string, @CurrentUser() user: AuthUser, @Req() req: FastifyRequest): Promise<Response> {
    const id = requireUuid(rawId);
    const { book } = await this.access.bookFor(req, user, id, false);
    return Response.json(await this.ports.helpThread(book, user.id), { headers: { "cache-control": "no-store" } });
  }

  @SiteRoute("POST", "/api/books/{id}/help", { auth: "user" })
  async helpPost(
    @Param("id") rawId: string,
    @CurrentUser() user: AuthUser,
    @RequestLocale() locale: Locale,
    @RawBody() raw: Buffer,
    @Req() req: FastifyRequest,
  ): Promise<Response> {
    const id = requireUuid(rawId);
    const { book } = await this.access.bookFor(req, user, id, false);
    const input = helpPostSchema.parse(parseJsonBody(raw));
    return Response.json(
      await this.ports.helpAsk(book, user, { text: input.text, place: parseHelpPlace(input.place), human: input.human }, locale, { actions: true }),
    );
  }

  /** «Применить» / «Не нужно» у правки книги, которую предложил помощник (только владелец, книга не заказана). */
  @SiteRoute("POST", "/api/books/{id}/help/apply", { auth: "user" })
  async helpApply(
    @Param("id") rawId: string,
    @CurrentUser() user: AuthUser,
    @RequestLocale() locale: Locale,
    @RawBody() raw: Buffer,
    @Req() req: FastifyRequest,
  ): Promise<Response> {
    const id = requireUuid(rawId);
    const { book } = await this.access.bookFor(req, user, id, false);
    const input = helpApplySchema.parse(parseJsonBody(raw));
    return Response.json(await this.ports.helpApply(book, user, input, locale));
  }

  @SiteRoute("GET", "/api/books/{id}/design-ai", { auth: "user" })
  async designAiGet(@Param("id") rawId: string, @CurrentUser() user: AuthUser, @Req() req: FastifyRequest): Promise<Response> {
    const id = requireUuid(rawId);
    const { book } = await this.access.bookFor(req, user, id, false);
    return Response.json(await this.ports.designAiInfo(user.id, book));
  }

  @SiteRoute("POST", "/api/books/{id}/design-ai", { auth: "user" })
  async designAiPost(
    @Param("id") rawId: string,
    @CurrentUser() user: AuthUser,
    @RequestLocale() locale: Locale,
    @RawBody() raw: Buffer,
    @Req() req: FastifyRequest,
  ): Promise<Response> {
    const id = requireUuid(rawId);
    const { book } = await this.access.bookFor(req, user, id, true);
    const input = designAiBody.parse(parseJsonBody(raw));
    return Response.json(await this.ports.runDesignAi(user, book, input, locale));
  }

  @SiteRoute("POST", "/api/books/{id}/proofread/ai", { auth: "user" })
  async proofreadAi(
    @Param("id") rawId: string,
    @CurrentUser() user: AuthUser,
    @RawBody() raw: Buffer,
    @Req() req: FastifyRequest,
  ): Promise<Response> {
    const id = requireUuid(rawId);
    const { book } = await this.access.bookFor(req, user, id, false);
    const { text, ui } = proofreadAiSchema.parse(parseJsonBody(raw));
    if (!(await this.ports.proofreadConfigured())) throw new ApiError(503, "proofreadOff");
    if ((await this.ports.hitClientAi("proofread", user.id)) !== "ok") throw new ApiError(429, "proofreadRate");
    try {
      const issues = await this.ports.proofreadCheck(text, book.language, isLocale(ui) ? ui : book.language, { kind: bookKind(book.theme) });
      return Response.json({ issues });
    } catch (err) {
      if (!AssistantError.is(err)) throw err;
      log.error(`[proofread] ${err.message}`);
      throw new ApiError(err.code === "notConfigured" ? 503 : 502, err.code === "notConfigured" ? "proofreadOff" : "proofreadBusy");
    }
  }

  @SiteRoute("POST", "/api/books/{id}/proofread/spell", { auth: "user" })
  async proofreadSpell(
    @Param("id") rawId: string,
    @CurrentUser() user: AuthUser,
    @RawBody() raw: Buffer,
    @Req() req: FastifyRequest,
  ): Promise<Response> {
    const id = requireUuid(rawId);
    const { book } = await this.access.bookFor(req, user, id, false);
    if (!(await this.limiter.hit(`spell:${user.id}`, 120, 60_000))) throw new ApiError(429, "proofreadRate");
    const { words } = proofreadSpellSchema.parse(parseJsonBody(raw));
    if (book.language !== "ru") return Response.json({ wrong: {} });
    return Response.json({ wrong: await this.ports.misspelled(words) });
  }

  @SiteRoute("POST", "/api/books/{id}/write/ai", { auth: "user" })
  async writeAi(
    @Param("id") rawId: string,
    @CurrentUser() user: AuthUser,
    @RawBody() raw: Buffer,
    @Req() req: FastifyRequest,
  ): Promise<Response> {
    const id = requireUuid(rawId);
    const { book } = await this.access.bookFor(req, user, id, false);
    const { text, mode, prompt } = writeAiSchema.parse(parseJsonBody(raw));
    if (!(await this.ports.writerConfigured())) throw new ApiError(503, "writeAiOff");
    if ((await this.ports.hitClientAi("writer", user.id)) !== "ok") throw new ApiError(429, "writeAiRate");
    try {
      const result = await this.ports.writerRewrite(text, mode, book.language, { kind: bookKind(book.theme), instruction: prompt });
      return Response.json({ text: result });
    } catch (err) {
      if (!AssistantError.is(err)) throw err;
      log.error(`[write-ai] ${err.message}`);
      throw new ApiError(err.code === "notConfigured" ? 503 : 502, err.code === "notConfigured" ? "writeAiOff" : "proofreadBusy");
    }
  }
}
