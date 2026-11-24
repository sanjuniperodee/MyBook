/**
 * OpenAPI 3.1 из контракта v1 (routes.ts). Отдаёт apps/api (/api/v1/openapi.json), из него же генерируется Dart-клиент.
 * Тела запросов и ответов — схемы из реестра schemas (routes.ts), в components/schemas; параметры пути и запроса — на месте.
 */
import { z } from "zod";
import { ApiError, schemas as registryOfSchemas, v1, type RouteDef } from "./routes";

const ref = (id: string) => `#/components/schemas/${id}`;

type Json = Record<string, unknown>;

/** Тело запроса или ответа — всегда схема с именем (компонент; у Dart-клиента — класс). Безымянная — ошибка контракта. */
function schemaOf(s: z.ZodType, where: string): Json {
  const id = registryOfSchemas.get(s)?.id;
  if (!id) throw new Error(`Контракт v1: ${where} — схема без имени, добавьте .register(schemas, { id })`);
  return { $ref: ref(id) };
}

function parameters(r: RouteDef): Json[] {
  const list: Json[] = [];
  for (const [where, obj] of [["path", r.params], ["query", r.query]] as const) {
    if (!obj) continue;
    for (const [name, s] of Object.entries(obj.shape)) {
      const schema = z.toJSONSchema(s as z.ZodType, { io: "input", unrepresentable: "any" }) as Json;
      delete schema.$schema;
      list.push({ name, in: where, required: where === "path" || !(s as z.ZodType).safeParse(undefined).success, schema });
    }
  }
  return list;
}

export function openapi(): Json {
  const registry = z.toJSONSchema(registryOfSchemas, { uri: ref, unrepresentable: "any" }) as { schemas: Record<string, Json> };
  const schemas: Record<string, Json> = {};
  for (const [id, s] of Object.entries(registry.schemas)) {
    const rest = { ...s };
    delete rest.$schema;
    delete rest.$id;
    schemas[id] = rest;
  }
  const paths: Record<string, Record<string, Json>> = {};
  for (const [name, r] of Object.entries(v1) as [string, RouteDef][]) {
    const op: Json = {
      operationId: name,
      tags: [r.tag],
      summary: r.summary,
      ...(r.auth === "none" ? { security: [] } : {}),
      ...(parameters(r).length ? { parameters: parameters(r) } : {}),
      ...(r.body ? { requestBody: { required: true, content: { "application/json": { schema: schemaOf(r.body, `${name}: body`) } } } } : {}),
      responses: {
        "200": { description: "OK", content: { "application/json": { schema: schemaOf(r.response, `${name}: response`) } } },
        default: { description: "Ошибка: текст для экрана и код", content: { "application/json": { schema: schemaOf(ApiError, "ApiError") } } },
      },
      "x-auth": r.auth,
    };
    (paths[r.path] ??= {})[r.method.toLowerCase()] = op;
  }
  return {
    openapi: "3.1.0",
    info: { title: "MyBooks API", version: "1", description: "Единственный путь к данным для веба и мобильного приложения (ADR 0012). Вход — Authorization: Bearer <token> или cookie mb_session." },
    servers: [{ url: "https://mybooks.kz" }],
    security: [{ bearer: [] }, { cookie: [] }],
    paths,
    components: {
      schemas,
      securitySchemes: { bearer: { type: "http", scheme: "bearer" }, cookie: { type: "apiKey", in: "cookie", name: "mb_session" } },
    },
  };
}
