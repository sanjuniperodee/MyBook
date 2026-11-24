/**
 * Обратные вызовы провайдеров (вебхуки) в процессе mybook-api (ADR 0012, A6): те же модули маршрутов, что у сайта —
 * проверка подписи, разбор и сервисы одни и те же; адреса те же (nginx направляет их сюда, при недоступности api —
 * на сайт). Без входа и контракта v1: формат задаёт провайдер. Пока код маршрута живёт в src/app/api (его же
 * обслуживает Next как запасной путь); перенос в apps/api — когда сайт перестанет быть запасным.
 */
import * as kaspi from "@/app/api/payments/kaspi/webhook/route";
import * as cloudpayments from "@/app/api/payments/cloudpayments/[event]/route";
import * as gowa from "@/app/api/integrations/gowa/route";
import * as zadarma from "@/app/api/integrations/zadarma/route";
import * as google from "@/app/api/integrations/google/webhook/route";

/** Обработчик маршрута Next: второй аргумент — { params } своего вида у каждого маршрута. */
type RouteHandler = (req: Request, ctx: never) => Promise<Response> | Response;
type RouteModule = Partial<Record<"GET" | "POST", RouteHandler>>;

/** Путь с параметрами в фигурных скобках → модуль маршрута сайта. */
const table: [string, RouteModule][] = [
  ["/api/payments/kaspi/webhook", kaspi as RouteModule],
  ["/api/payments/cloudpayments/{event}", cloudpayments as RouteModule],
  ["/api/integrations/gowa", gowa as RouteModule],
  ["/api/integrations/zadarma", zadarma as RouteModule],
  ["/api/integrations/google/webhook", google as RouteModule],
];

const compiled = table.map(([path, module]) => ({ path, module, re: new RegExp(`^${path.replace(/\{(\w+)\}/g, "(?<$1>[^/]+)")}$`) }));

/** Адреса провайдеров — для nginx и проверки выкатки. */
export const providerPaths = table.map(([path]) => path);

/** Ответ маршрута провайдера; null — это не адрес провайдера. */
export async function handleProvider(req: Request): Promise<Response | null> {
  const { pathname } = new URL(req.url);
  for (const { module, re } of compiled) {
    const m = re.exec(pathname);
    if (!m) continue;
    const handler = module[req.method as "GET" | "POST"];
    if (!handler) return new Response(null, { status: 405, headers: { allow: Object.keys(module).filter((k) => k === "GET" || k === "POST").join(", ") } });
    return handler(req, { params: Promise.resolve({ ...m.groups }) } as never);
  }
  return null;
}
