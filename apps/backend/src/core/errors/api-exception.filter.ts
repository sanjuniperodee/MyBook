import { Catch, HttpException, Inject, Logger, type ArgumentsHost, type ExceptionFilter } from "@nestjs/common";
import type { FastifyReply, FastifyRequest } from "fastify";
import { ZodError } from "zod";
import { createRouter, v1 } from "@mybook/contracts";
import { domainStatus, errorText, isApiKey, isErrorKey, type ApiMessages } from "@/i18n/api-errors";
import { messagesFor } from "@/i18n/messages";
import { DomainError } from "@/shared/domain";
import { requestLocale } from "../http/request";
import { SITE_ROUTE_REGISTRY, type SiteRouteRegistry } from "../http/site-route";
import { SiteMethodNotAllowed } from "../http/site-method-not-allowed";
import { ApiError } from "./api-error";

interface Failure {
  status: number;
  code: string;
  params?: unknown[];
}

/** Статусы Fastify (тело не JSON, слишком большое, не тот тип) → ключ словаря api. */
const HTTP_CODES: Record<number, string> = { 413: "badData", 415: "badRequest" };
/** Метки HttpError/ForbiddenError/notFound из общего слоя сайта и Next — узнаются без импорта @/server и next. */
const FORBIDDEN_ERROR = Symbol.for("mybook.forbidden-error");
const HTTP_ERROR = Symbol.for("mybook.http-error");
const isForbiddenError = (err: unknown): boolean => typeof err === "object" && err !== null && Reflect.get(err, FORBIDDEN_ERROR) === true;

const asTaggedHttpError = (err: unknown): Failure | null => {
  if (typeof err !== "object" || err === null || Reflect.get(err, HTTP_ERROR) !== true) return null;
  const status = Reflect.get(err, "status");
  const code = Reflect.get(err, "code");
  const params = Reflect.get(err, "params");
  if (typeof status !== "number" || typeof code !== "string") return null;
  return { status, code, params: Array.isArray(params) ? params : undefined };
};

const isNextNotFound = (err: unknown): boolean => {
  if (typeof err !== "object" || err === null) return false;
  const digest = Reflect.get(err, "digest");
  return digest === "NEXT_NOT_FOUND" || digest === "NEXT_HTTP_ERROR_FALLBACK;404";
};

const log = new Logger("api");
const contract = createRouter(v1);

/**
 * Любая ошибка → ответ в формате сайта и mybook-api: `{ error, code }`, текст на языке запроса (ADR 0014, правило 4).
 * Ошибки домена с ключом словаря — со статусом из общего реестра (src/i18n/api-errors.ts); неизвестное — 500 и журнал.
 */
@Catch()
export class ApiExceptionFilter implements ExceptionFilter {
  constructor(@Inject(SITE_ROUTE_REGISTRY) private readonly siteRoutes: SiteRouteRegistry) {}

  catch(err: unknown, host: ArgumentsHost) {
    const http = host.switchToHttp();
    const req = http.getRequest<FastifyRequest>();
    const reply = http.getResponse<FastifyReply>();
    // Адреса нет среди маршрутов процесса — как у mybook-api: путь контракта или @SiteRoute с другим методом — 405 с Allow,
    // неизвестный путь — 404 с тем же телом (код notFound; текст не переводится — так отвечал и прежний API).
    if (err instanceof SiteMethodNotAllowed) return void reply.status(405).header("allow", err.allow.join(", ")).send();
    if (err instanceof HttpException && err.getStatus() === 404) {
      const pathname = req.url.split("?")[0];
      const found = contract.match(req.method, pathname);
      if (found && "allowed" in found) return void reply.status(405).header("allow", found.allowed.join(", ")).send();
      const siteAllowed = this.siteRoutes.allowed(req.method, pathname);
      if (siteAllowed.length > 0) return void reply.status(405).header("allow", siteAllowed.join(", ")).send();
      return void reply.status(404).header("cache-control", "no-store").send({ error: "Not found", code: "notFound" });
    }
    const t = messagesFor(requestLocale(req)).api;
    const { status, code, params } = this.classify(err, t);
    void reply
      .status(status)
      .send({ error: errorText(t, code, params), code: isErrorKey(t, code) ? code : undefined });
  }

  private classify(err: unknown, t: ApiMessages): Failure {
    if (err instanceof ApiError) return { status: err.status, code: err.code, params: err.params };
    const httpErr = asTaggedHttpError(err);
    if (httpErr) return httpErr;
    if (isNextNotFound(err)) return { status: 404, code: "notFound" };
    if (isForbiddenError(err)) return { status: 403, code: "forbidden" };
    if (DomainError.isDomainError(err) && isApiKey(t, err.code)) return { status: domainStatus(err.code), code: err.code, params: [...err.params] };
    if (err instanceof ZodError) {
      // В схемах сообщения — ключи словаря; встроенные сообщения zod (английские) заменяем общим текстом.
      const key = err.issues[0]?.message ?? "";
      return { status: 400, code: isErrorKey(t, key) ? key : "badData" };
    }
    if (err instanceof HttpException) {
      const status = err.getStatus();
      if (status < 500) return { status, code: HTTP_CODES[status] ?? "badRequest" };
    }
    const status = typeof err === "object" && err !== null && "statusCode" in err ? Number(err.statusCode) : 500;
    if (status >= 400 && status < 500) return { status, code: HTTP_CODES[status] ?? "badRequest" };
    log.error(err instanceof Error ? (err.stack ?? err.message) : String(err));
    return { status: 500, code: "server" };
  }
}
