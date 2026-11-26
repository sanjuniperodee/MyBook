import { Inject, Injectable, type CanActivate, type ExecutionContext } from "@nestjs/common";
import { Reflector } from "@nestjs/core";
import type { FastifyRequest } from "fastify";
import type { RouteDef } from "@mybook/contracts";
import { ApiError } from "../errors/api-error";
import { contractRouteOf } from "./endpoint";

/** Строка запроса как у mybook-api (Object.fromEntries(searchParams)): у повторённого ключа — последнее значение. */
const lastValues = (query: unknown) =>
  Object.fromEntries(Object.entries((query ?? {}) as Record<string, unknown>).map(([k, v]) => [k, Array.isArray(v) ? v.at(-1) : v]));

async function readFiles(req: FastifyRequest, field: string): Promise<File[]> {
  if (!req.isMultipart()) throw new ApiError(400, "badRequest");
  const files: File[] = [];
  for await (const part of req.parts()) {
    if (part.type !== "file") continue;
    // Чужое поле читается вхолостую: иначе поток запроса встанет на этой части.
    if (part.fieldname !== field) {
      part.file.resume();
      continue;
    }
    const data = await part.toBuffer();
    if (data.length > 0) files.push(new File([new Uint8Array(data)], part.filename, { type: part.mimetype }));
  }
  return files;
}

async function readInput(req: FastifyRequest, def: RouteDef): Promise<Record<string, unknown>> {
  const input: Record<string, unknown> = {};
  if (def.params) Object.assign(input, def.params.parse(req.params));
  if (def.query) Object.assign(input, def.query.parse(lastValues(req.query)));
  if (def.body) input.body = def.body.parse(req.body);
  if (def.files) input.files = await readFiles(req, def.files.field);
  return input;
}

/**
 * Вход маршрута по контракту: параметры пути, строка запроса, тело и файлы — схемами контракта (ошибка схемы — 400 через
 * фильтр). Глобальный guard сразу после SessionGuard, то есть до guard-ов доступа и лимитов контроллера — порядок как у
 * mybook-api: вход → разбор → доступ → лимит (кривой запрос не тратит лимит и не выдаёт, есть ли ресурс).
 */
@Injectable()
export class ContractInputGuard implements CanActivate {
  constructor(@Inject(Reflector) private readonly reflector: Reflector) {}

  async canActivate(ctx: ExecutionContext): Promise<boolean> {
    const route = contractRouteOf(this.reflector, ctx.getHandler());
    if (!route) return true;
    const req = ctx.switchToHttp().getRequest<FastifyRequest>();
    req.contractInput = await readInput(req, route.def);
    return true;
  }
}
