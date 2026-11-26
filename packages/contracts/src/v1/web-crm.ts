/**
 * CRM сайта (/admin) в API v1 (ADR 0012, A5 — Раздел 5, section: "crm"): права сотрудника для каркаса и страниц,
 * сборщики данных страниц (read: `src/server/crm-ops/<область>.ts`, имя `<область>.<операция>`, права и схема zod
 * входа — у операции; данные не меняет: при PARITY_MODE=shadow его зовут дважды) и server actions CRM (act:
 * `src/server/crm-actions/<модуль>.ts`, имя `<модуль>.<действие>` — тот же код, что раньше стоял в src/app/admin, со
 * своими проверками прав, zod и лимитами). Значения — в обёртке `src/shared/wire.ts` (Date, Map, Set, FormData, файлы).
 */
import { z } from "zod";
import { route, schemas } from "./core";

/** Кто сотрудник и что его не пускает: ip — вход не из разрешённой сети, 2fa — не настроена обязательная 2FA. */
export const WebCrmStaff = z
  .object({
    staff: z
      .object({
        roleName: z.string(),
        roleKey: z.string().nullable(),
        scope: z.enum(["all", "own"]),
        permissions: z.array(z.string()),
        isOwner: z.boolean(),
      })
      .nullable(),
    gate: z.enum(["ip", "2fa"]).nullable(),
  })
  .register(schemas, { id: "WebCrmStaff" });

/** Аргументы операции CRM (в обёртке wire). */
export const WebCrmCall = z.object({ args: z.unknown().optional() }).register(schemas, { id: "WebCrmCall" });

/** Результат операции CRM (в обёртке wire); действие может закончиться переходом (redirect) или «не найдено». */
export const WebCrmReply = z
  .object({ data: z.unknown(), redirect: z.string().optional(), notFound: z.boolean().optional() })
  .register(schemas, { id: "WebCrmReply" });

const WebCrmOp = z.object({ op: z.string().regex(/^[a-z][a-zA-Z0-9]*\.[a-zA-Z][a-zA-Z0-9]*$/).max(80) });

export const webCrmRoutes = {
  webCrmStaff: route({
    method: "GET",
    path: "/api/v1/web/crm/staff",
    auth: "user",
    tag: "web-crm",
    summary: "Права сотрудника CRM и что мешает войти (сеть, обязательная 2FA) — для каркаса и страниц /admin",
    response: WebCrmStaff,
  }),
  webCrmRead: route({
    method: "POST",
    path: "/api/v1/web/crm/read/{op}",
    auth: "user",
    tag: "web-crm",
    summary: "Данные страницы CRM: операция чтения области (без изменений данных), права сотрудника проверяет операция",
    params: WebCrmOp,
    body: WebCrmCall,
    response: WebCrmReply,
  }),
  webCrmAct: route({
    method: "POST",
    path: "/api/v1/web/crm/act/{op}",
    auth: "user",
    tag: "web-crm",
    summary: "Server action CRM (<модуль>.<действие>, аргументы — массив): права, zod и лимиты проверяет само действие",
    params: WebCrmOp,
    body: WebCrmCall,
    response: WebCrmReply,
  }),
};
