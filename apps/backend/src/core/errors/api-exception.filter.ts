import { Catch, HttpException, Logger, type ArgumentsHost, type ExceptionFilter } from "@nestjs/common";
import type { FastifyReply, FastifyRequest } from "fastify";
import { ZodError } from "zod";
import { createRouter, v1 } from "@mybook/contracts";
import { domainStatus, errorText, isApiKey, isErrorKey, type ApiMessages } from "@/i18n/api-errors";
import { messagesFor } from "@/i18n/messages";
import { DomainError } from "@/shared/domain";
import { requestLocale } from "../http/request";
import { ApiError } from "./api-error";

interface Failure {
  status: number;
  code: string;
  params?: unknown[];
}

/** Статусы Fastify (тело не JSON, слишком большое, не тот тип) → ключ словаря api. */
const HTTP_CODES: Record<number, string> = { 413: "badData", 415: "badRequest" };

const log = new Logger("api");
const contract = createRouter(v1);

/**
 * Любая ошибка → ответ в формате сайта и mybook-api: `{ error, code }`, текст на языке запроса (ADR 0014, правило 4).
 * Ошибки домена с ключом словаря — со статусом из общего реестра (src/i18n/api-errors.ts); неизвестное — 500 и журнал.
 */
@Catch()
export class ApiExceptionFilter implements ExceptionFilter {
  catch(err: unknown, host: ArgumentsHost) {
    const http = host.switchToHttp();
    const req = http.getRequest<FastifyRequest>();
    const reply = http.getResponse<FastifyReply>();
    // Адреса нет среди маршрутов процесса — как у mybook-api: путь контракта с другим методом — 405 с Allow,
    // неизвестный путь — 404 с тем же телом (код notFound; текст не переводится — так отвечал и прежний API).
    if (err instanceof HttpException && err.getStatus() === 404) {
      const found = contract.match(req.method, req.url.split("?")[0]);
      if (found && "allowed" in found) return void reply.status(405).header("allow", found.allowed.join(", ")).send();
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
